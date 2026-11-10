pub mod admin;
pub mod assets;
pub mod auth;
pub mod catalog;
pub mod catalog_browse;
pub mod category_attributes;
pub mod community;
pub mod config;
pub mod error;
pub mod imports;
pub mod lists;
pub mod models;
pub mod state;
pub use error::{ApiError, ApiResult};
pub use state::AppState;

use axum::{
    Json, Router,
    extract::{ConnectInfo, DefaultBodyLimit, Request, State},
    http::{HeaderValue, Method, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::json;
use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

async fn health(State(state): State<AppState>) -> ApiResult<Json<serde_json::Value>> {
    sqlx::query("SELECT 1").execute(&state.pool).await?;
    Ok(Json(json!({"status":"ok","mode":"local"})))
}
async fn guard(request: Request, next: Next) -> Response {
    let mutation = !matches!(
        *request.method(),
        Method::GET | Method::HEAD | Method::OPTIONS
    );
    if mutation
        && request
            .headers()
            .get("X-Requested-With")
            .and_then(|v| v.to_str().ok())
            != Some("lista-escolar")
    {
        return protected_response(ApiError::forbidden().into_response());
    }
    if mutation
        && ["/api/auth/login", "/api/auth/register", "/api/admin/login"]
            .contains(&request.uri().path())
    {
        static ATTEMPTS: OnceLock<Mutex<HashMap<IpAddr, (Instant, u32)>>> = OnceLock::new();
        let ip = request
            .extensions()
            .get::<ConnectInfo<SocketAddr>>()
            .map(|a| a.0.ip())
            .unwrap_or(IpAddr::from([127, 0, 0, 1]));
        let limited = {
            let mut map = ATTEMPTS.get_or_init(Default::default).lock().unwrap();
            map.retain(|_, (time, _)| time.elapsed() < Duration::from_secs(60));
            let entry = map.entry(ip).or_insert((Instant::now(), 0));
            entry.1 += 1;
            entry.1 > 60
        };
        if limited {
            return protected_response(
                (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(json!({"error":"Demasiados intentos. Espera un minuto."})),
                )
                    .into_response(),
            );
        }
    }
    protected_response(next.run(request).await)
}
fn protected_response(mut response: Response) -> Response {
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response.headers_mut().insert(
        "X-Content-Type-Options",
        HeaderValue::from_static("nosniff"),
    );
    response
        .headers_mut()
        .insert("Referrer-Policy", HeaderValue::from_static("same-origin"));
    response
}
pub fn api(state: AppState) -> Router {
    let routes = Router::new()
        .route("/health", get(health))
        .merge(auth::routes())
        .merge(assets::routes())
        .merge(lists::routes())
        .merge(imports::routes())
        .merge(catalog::routes())
        .merge(community::routes())
        .merge(admin::routes())
        .fallback(|| async { ApiError::not_found() });
    Router::new()
        .nest("/api", routes)
        .layer(DefaultBodyLimit::max(12 * 1024 * 1024))
        .layer(middleware::from_fn(guard))
        .with_state(state)
}
