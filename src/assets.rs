use crate::{
    AppState,
    auth::{self, User},
    error::{ApiError, ApiResult},
};
use axum::{
    Json, Router,
    body::Body,
    extract::{Multipart, Path, State},
    http::{HeaderMap, Response, header},
    routing::{get, post},
};
use image::{ImageFormat, ImageReader, Limits};
use serde_json::{Value, json};
use sqlx::Row;
use std::io::Cursor;
use uuid::Uuid;

async fn upload(
    State(state): State<AppState>,
    user: User,
    mut multipart: Multipart,
) -> ApiResult<Json<Value>> {
    let mut data = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::bad_request("Archivo inválido."))?
    {
        if field.name() == Some("file") {
            if data.is_some() {
                return Err(ApiError::bad_request("Selecciona una sola imagen."));
            }
            let bytes = field
                .bytes()
                .await
                .map_err(|_| ApiError::bad_request("No se pudo leer la imagen."))?;
            if bytes.len() > 2 * 1024 * 1024 {
                return Err(ApiError::bad_request("El logo puede pesar hasta 2 MiB."));
            }
            data = Some(bytes);
        }
    }
    let data = data.ok_or_else(|| ApiError::bad_request("Selecciona un logo PNG, JPEG o WebP."))?;
    let png = tokio::task::spawn_blocking(move || sanitize(&data))
        .await
        .map_err(ApiError::internal)??;
    let id: Uuid =
        sqlx::query_scalar("INSERT INTO app.assets(owner_id,data) VALUES($1,$2) RETURNING id")
            .bind(user.id)
            .bind(png)
            .fetch_one(&state.pool)
            .await?;
    Ok(Json(json!({"id":id})))
}
fn sanitize(bytes: &[u8]) -> ApiResult<Vec<u8>> {
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| ApiError::bad_request("Imagen inválida."))?;
    if !matches!(
        reader.format(),
        Some(ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::WebP)
    ) {
        return Err(ApiError::bad_request("Solo se permiten PNG, JPEG y WebP."));
    }
    let mut limits = Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(96 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().map_err(|_| {
        ApiError::bad_request("La imagen no es válida o supera 4096 × 4096 píxeles.")
    })?;
    let image = if image.width() > 1024 || image.height() > 1024 {
        image.thumbnail(1024, 1024)
    } else {
        image
    };
    let mut png = Cursor::new(Vec::new());
    image
        .write_to(&mut png, ImageFormat::Png)
        .map_err(ApiError::internal)?;
    Ok(png.into_inner())
}
async fn read(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> ApiResult<Response<Body>> {
    let user = auth::optional_user(&state, &headers).await?.map(|u| u.id);
    let row=sqlx::query("SELECT data,content_type FROM app.assets a WHERE a.id=$1 AND (a.owner_id=$2 OR EXISTS (SELECT 1 FROM app.lists l LEFT JOIN app.grants g ON g.list_id=l.id AND g.user_id=$2 WHERE l.deleted_at IS NULL AND ((NOT l.hidden AND (l.visibility='public' OR l.owner_id=$2 OR g.user_id IS NOT NULL) AND EXISTS (SELECT 1 FROM app.versions v WHERE v.list_id=l.id AND lower(v.content->>'logo_id')=a.id::text)) OR ((l.owner_id=$2 OR g.role='editor') AND lower(l.draft->>'logo_id')=a.id::text))))")
        .bind(id).bind(user).fetch_optional(&state.pool).await?.ok_or_else(ApiError::not_found)?;
    Response::builder()
        .header(header::CONTENT_TYPE, row.get::<String, _>("content_type"))
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(Body::from(row.get::<Vec<u8>, _>("data")))
        .map_err(ApiError::internal)
}
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/assets", post(upload))
        .route("/assets/{id}", get(read))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_non_raster_and_invalid_images() {
        assert!(sanitize(b"<svg><script/></svg>").is_err());
        assert!(sanitize(b"not an image").is_err());
    }
    #[test]
    fn sanitizes_png() {
        let image = image::DynamicImage::new_rgb8(8, 8);
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, ImageFormat::Png).unwrap();
        assert!(sanitize(bytes.get_ref()).unwrap().starts_with(b"\x89PNG"));
    }
}
