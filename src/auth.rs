use crate::{
    error::{ApiError, ApiResult},
    state::AppState,
};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use axum::{
    Json, Router,
    extract::{FromRequestParts, State},
    http::{HeaderMap, HeaderValue, header, request::Parts},
    routing::{get, post},
};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, Row};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
}
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Admin {
    pub id: Uuid,
    pub username: String,
}

fn cookie_token<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|s| s.split(';'))
        .filter_map(|s| s.trim().split_once('='))
        .find(|(key, _)| *key == name)
        .map(|(_, token)| token)
}
fn digest(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

pub async fn optional_user(state: &AppState, headers: &HeaderMap) -> ApiResult<Option<User>> {
    let Some(token) = cookie_token(headers, "escolar_session") else {
        return Ok(None);
    };
    Ok(sqlx::query_as::<_, User>("SELECT u.id,u.email,u.display_name FROM app.sessions s JOIN app.users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()")
        .bind(digest(token)).fetch_optional(&state.pool).await?)
}
async fn optional_admin(state: &AppState, headers: &HeaderMap) -> ApiResult<Option<Admin>> {
    let Some(token) = cookie_token(headers, "escolar_admin") else {
        return Ok(None);
    };
    Ok(sqlx::query_as::<_, Admin>("SELECT a.id,a.username FROM app.sessions s JOIN app.admins a ON a.id=s.admin_id WHERE s.token_hash=$1 AND s.expires_at>now()")
        .bind(digest(token)).fetch_optional(&state.pool).await?)
}
impl FromRequestParts<AppState> for User {
    type Rejection = ApiError;
    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> ApiResult<Self> {
        optional_user(state, &parts.headers)
            .await?
            .ok_or_else(ApiError::unauthorized)
    }
}
impl FromRequestParts<AppState> for Admin {
    type Rejection = ApiError;
    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> ApiResult<Self> {
        optional_admin(state, &parts.headers)
            .await?
            .ok_or_else(ApiError::unauthorized)
    }
}

pub fn hash_password(password: &str) -> ApiResult<String> {
    validate_password(password)?;
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(ApiError::internal)
}
fn validate_password(password: &str) -> ApiResult<()> {
    if password.chars().count() < 8 || password.len() > 512 {
        return Err(ApiError::bad_request(
            "La contraseña debe tener al menos 8 caracteres y como máximo 512 bytes.",
        ));
    }
    Ok(())
}
async fn password_matches(password: String, hash: String) -> bool {
    if password.len() > 512 {
        return false;
    }
    tokio::task::spawn_blocking(move || {
        PasswordHash::new(&hash).is_ok_and(|hash| {
            Argon2::default()
                .verify_password(password.as_bytes(), &hash)
                .is_ok()
        })
    })
    .await
    .unwrap_or(false)
}
fn validate_name(name: &str) -> ApiResult<()> {
    if name.trim().is_empty() || name.chars().count() > 80 {
        return Err(ApiError::bad_request(
            "El nombre debe tener entre 1 y 80 caracteres.",
        ));
    }
    Ok(())
}
fn session_headers(token: &str, admin: bool, remove: bool) -> HeaderMap {
    let name = if admin {
        "escolar_admin"
    } else {
        "escolar_session"
    };
    let max_age = if remove { 0 } else { 604800 };
    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&format!(
            "{name}={token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age={max_age}"
        ))
        .unwrap(),
    );
    headers
}
async fn new_session(state: &AppState, id: Uuid, admin: bool) -> ApiResult<HeaderMap> {
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    sqlx::query("INSERT INTO app.sessions(token_hash,user_id,admin_id) VALUES($1,$2,$3)")
        .bind(digest(&token))
        .bind(if admin { None } else { Some(id) })
        .bind(if admin { Some(id) } else { None })
        .execute(&state.pool)
        .await?;
    Ok(session_headers(&token, admin, false))
}
async fn user_json(state: &AppState, user: &User) -> ApiResult<Value> {
    let preferences: Value = sqlx::query_scalar("SELECT preferences FROM app.users WHERE id=$1")
        .bind(user.id)
        .fetch_one(&state.pool)
        .await?;
    Ok(
        json!({"id":user.id,"email":user.email,"display_name":user.display_name,"preferences":preferences}),
    )
}

#[derive(Deserialize)]
struct Register {
    email: String,
    password: String,
    display_name: String,
}
async fn register(
    State(state): State<AppState>,
    Json(body): Json<Register>,
) -> ApiResult<(HeaderMap, Json<Value>)> {
    let email = body.email.trim().to_lowercase();
    let name = body.display_name.trim().to_string();
    let parts: Vec<_> = email.split('@').collect();
    if email.len() > 254
        || parts.len() != 2
        || parts[0].is_empty()
        || !parts[1].contains('.')
        || email.chars().any(char::is_whitespace)
    {
        return Err(ApiError::bad_request(
            "Ingresa un correo electrónico válido.",
        ));
    }
    validate_name(&name)?;
    let hash = tokio::task::spawn_blocking(move || hash_password(&body.password))
        .await
        .map_err(ApiError::internal)??;
    let user = sqlx::query_as::<_, User>("INSERT INTO app.users(email,display_name,password_hash) VALUES($1,$2,$3) RETURNING id,email,display_name")
        .bind(email).bind(name).bind(hash).fetch_one(&state.pool).await?;
    let headers = new_session(&state, user.id, false).await?;
    Ok((
        headers,
        Json(json!({"user":user_json(&state,&user).await?})),
    ))
}
#[derive(Deserialize)]
struct Login {
    email: String,
    password: String,
}
async fn login(
    State(state): State<AppState>,
    Json(body): Json<Login>,
) -> ApiResult<(HeaderMap, Json<Value>)> {
    let row =
        sqlx::query("SELECT id,email,display_name,password_hash FROM app.users WHERE email=$1")
            .bind(body.email.trim().to_lowercase())
            .fetch_optional(&state.pool)
            .await?;
    let Some(row) = row else {
        return Err(ApiError::bad_request("Correo o contraseña incorrectos."));
    };
    if !password_matches(body.password, row.get("password_hash")).await {
        return Err(ApiError::bad_request("Correo o contraseña incorrectos."));
    }
    let user = User {
        id: row.get("id"),
        email: row.get("email"),
        display_name: row.get("display_name"),
    };
    Ok((
        new_session(&state, user.id, false).await?,
        Json(json!({"user":user_json(&state,&user).await?})),
    ))
}
async fn me(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    let user = match optional_user(&state, &headers).await? {
        Some(user) => user_json(&state, &user).await?,
        None => Value::Null,
    };
    Ok(Json(json!({"user":user,"mode":"local"})))
}
async fn clear_session(state: &AppState, headers: &HeaderMap, admin: bool) -> ApiResult<HeaderMap> {
    if let Some(token) = cookie_token(
        headers,
        if admin {
            "escolar_admin"
        } else {
            "escolar_session"
        },
    ) {
        sqlx::query("DELETE FROM app.sessions WHERE token_hash=$1")
            .bind(digest(token))
            .execute(&state.pool)
            .await?;
    }
    Ok(session_headers("", admin, true))
}
async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<(HeaderMap, Json<Value>)> {
    Ok((
        clear_session(&state, &headers, false).await?,
        Json(json!({"ok":true})),
    ))
}

#[derive(Deserialize)]
struct UpdateUser {
    display_name: String,
    preferences: Value,
}
async fn update_me(
    State(state): State<AppState>,
    user: User,
    Json(body): Json<UpdateUser>,
) -> ApiResult<Json<Value>> {
    validate_name(&body.display_name)?;
    let layout = body.preferences["layout"].as_str().unwrap_or("columns");
    let paper = body.preferences["paper"].as_str().unwrap_or("LETTER");
    if !["columns", "sidebar", "cards"].contains(&layout) || !["LETTER", "A4"].contains(&paper) {
        return Err(ApiError::bad_request("Preferencias PDF inválidas."));
    }
    let preferences = json!({"layout":layout,"paper":paper,"color":body.preferences["color"].as_bool().unwrap_or(true)});
    sqlx::query("UPDATE app.users SET display_name=$2,preferences=$3 WHERE id=$1")
        .bind(user.id)
        .bind(body.display_name.trim())
        .bind(preferences)
        .execute(&state.pool)
        .await?;
    let updated = User {
        display_name: body.display_name.trim().into(),
        ..user
    };
    Ok(Json(json!({"user":user_json(&state,&updated).await?})))
}

async fn deletion_rows(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
) -> ApiResult<Vec<Value>> {
    let rows = sqlx::query("SELECT id,draft,visibility,current_version FROM app.lists WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY id FOR UPDATE")
        .bind(user_id).fetch_all(&mut **tx).await?;
    Ok(rows.into_iter().map(|r| {
        let draft: Value=r.get("draft"); let visibility:String=r.get("visibility"); let version:i32=r.get("current_version");
        json!({"id":r.get::<Uuid,_>("id"),"school":draft["school"],"visibility":visibility,"current_version":version,
            "disposition":if visibility=="public" && version>0 {"archive"} else {"delete"}})
    }).collect())
}
async fn deletion_transfers(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: Uuid,
) -> ApiResult<Value> {
    Ok(sqlx::query_scalar(r#"SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb) FROM (
        SELECT transfer.id,transfer.list_id,transfer.status,transfer.expires_at<=now() AS expired,
          CASE WHEN transfer.sender_id=$1 THEN 'sent' ELSE 'received' END AS direction,
          COALESCE(person.display_name,'Usuario eliminado') AS other_party,
          CASE WHEN list.owner_id=$1 THEN COALESCE(list.draft->>'school','Lista sin publicar')
            WHEN NOT list.hidden AND (list.visibility='public' OR EXISTS(SELECT 1 FROM app.grants WHERE list_id=list.id AND user_id=$1))
              THEN COALESCE(version.content->>'school','Lista sin publicar')
            ELSE 'Lista transferida' END AS school
        FROM app.transfers transfer JOIN app.lists list ON list.id=transfer.list_id
        LEFT JOIN app.versions version ON version.list_id=list.id AND version.number=list.current_version
        LEFT JOIN app.users person ON person.id=CASE WHEN transfer.sender_id=$1 THEN transfer.recipient_id ELSE transfer.sender_id END
        WHERE (transfer.sender_id=$1 OR transfer.recipient_id=$1) AND transfer.status IN ('pending','accepted') AND list.deleted_at IS NULL
      ) t"#).bind(user_id).fetch_one(&mut **tx).await?)
}
fn disposition_token(rows: &[Value], transfers: &Value) -> String {
    digest(&serde_json::to_string(&(rows, transfers)).unwrap())
}
async fn deletion_preview(State(state): State<AppState>, user: User) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let rows = deletion_rows(&mut tx, user.id).await?;
    let transfers = deletion_transfers(&mut tx, user.id).await?;
    tx.commit().await?;
    Ok(Json(
        json!({"disposition_token":disposition_token(&rows,&transfers),"lists":rows,"transfers":transfers}),
    ))
}
#[derive(Deserialize)]
struct DeleteAccount {
    password: String,
    confirm: bool,
    disposition_token: String,
}
async fn delete_me(
    State(state): State<AppState>,
    user: User,
    Json(body): Json<DeleteAccount>,
) -> ApiResult<(HeaderMap, Json<Value>)> {
    if !body.confirm {
        return Err(ApiError::bad_request(
            "Debes confirmar la eliminación de tu cuenta.",
        ));
    }
    let mut tx = state.pool.begin().await?;
    let hash: String =
        sqlx::query_scalar("SELECT password_hash FROM app.users WHERE id=$1 FOR UPDATE")
            .bind(user.id)
            .fetch_one(&mut *tx)
            .await?;
    if !password_matches(body.password, hash).await {
        return Err(ApiError::bad_request("Contraseña incorrecta."));
    }
    let rows = deletion_rows(&mut tx, user.id).await?;
    let transfers = deletion_transfers(&mut tx, user.id).await?;
    if disposition_token(&rows, &transfers) != body.disposition_token {
        return Err(ApiError::conflict(
            "Tus listas cambiaron. Revisa nuevamente el resumen de eliminación.",
        ));
    }
    for row in rows {
        let id = Uuid::parse_str(row["id"].as_str().unwrap()).unwrap();
        if row["disposition"] == "delete" {
            sqlx::query("DELETE FROM app.lists WHERE id=$1")
                .bind(id)
                .execute(&mut *tx)
                .await?;
        } else {
            sqlx::query("UPDATE app.lists SET owner_id=NULL,archived=true,draft='{}',draft_revision=draft_revision+1,updated_at=now() WHERE id=$1").bind(id).execute(&mut *tx).await?;
            for table in [
                "follows",
                "notifications",
                "invitations",
                "transfers",
                "access_requests",
                "request_links",
                "imports",
            ] {
                sqlx::query(&format!("DELETE FROM app.{table} WHERE list_id=$1"))
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
            }
            sqlx::query("UPDATE app.grants SET role='viewer' WHERE list_id=$1")
                .bind(id)
                .execute(&mut *tx)
                .await?;
        }
    }
    sqlx::query("UPDATE app.reports SET evidence='{}' WHERE comment_id IN (SELECT id FROM app.comments WHERE user_id=$1)").bind(user.id).execute(&mut *tx).await?;
    sqlx::query("UPDATE app.comments SET body='',deleted=true WHERE user_id=$1")
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM app.invitations WHERE email=$1")
        .bind(&user.email)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "UPDATE app.transfers SET status='canceled' WHERE sender_id=$1 AND status='pending'",
    )
    .bind(user.id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM app.assets a WHERE owner_id=$1 AND NOT EXISTS (SELECT 1 FROM app.versions v JOIN app.lists l ON l.id=v.list_id WHERE l.deleted_at IS NULL AND lower(v.content->>'logo_id')=a.id::text) AND NOT EXISTS (SELECT 1 FROM app.lists l WHERE l.deleted_at IS NULL AND lower(l.draft->>'logo_id')=a.id::text)")
        .bind(user.id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM app.users WHERE id=$1")
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok((session_headers("", false, true), Json(json!({"ok":true}))))
}

#[derive(Deserialize)]
struct AdminLogin {
    username: String,
    password: String,
}
async fn admin_login(
    State(state): State<AppState>,
    Json(body): Json<AdminLogin>,
) -> ApiResult<(HeaderMap, Json<Value>)> {
    let row = sqlx::query("SELECT id,username,password_hash FROM app.admins WHERE username=$1")
        .bind(body.username.trim())
        .fetch_optional(&state.pool)
        .await?;
    let Some(row) = row else {
        return Err(ApiError::bad_request("Usuario o contraseña incorrectos."));
    };
    if !password_matches(body.password, row.get("password_hash")).await {
        return Err(ApiError::bad_request("Usuario o contraseña incorrectos."));
    }
    let admin = Admin {
        id: row.get("id"),
        username: row.get("username"),
    };
    Ok((
        new_session(&state, admin.id, true).await?,
        Json(json!({"admin":admin})),
    ))
}
async fn admin_me(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    Ok(Json(
        json!({"admin":optional_admin(&state,&headers).await?}),
    ))
}
async fn admin_logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<(HeaderMap, Json<Value>)> {
    Ok((
        clear_session(&state, &headers, true).await?,
        Json(json!({"ok":true})),
    ))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout))
        .route("/auth/me", get(me).patch(update_me).delete(delete_me))
        .route("/auth/deletion-preview", get(deletion_preview))
        .route("/admin/login", post(admin_login))
        .route("/admin/me", get(admin_me))
        .route("/admin/logout", post(admin_logout))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn password_hashes_are_salted_and_verified() {
        let first = hash_password("test-password").unwrap();
        let second = hash_password("test-password").unwrap();
        assert_ne!(first, second);
        assert!(password_matches("test-password".into(), first.clone()).await);
        assert!(!password_matches("incorrect".into(), first).await);
        assert!(hash_password("short").is_err());
    }
    #[test]
    fn separate_cookie_names() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("escolar_admin=admin; escolar_session=user"),
        );
        assert_eq!(cookie_token(&headers, "escolar_session"), Some("user"));
        assert_eq!(cookie_token(&headers, "escolar_admin"), Some("admin"));
    }
}
