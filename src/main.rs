use lista_escolar::{AppState, auth, config};
use sqlx::postgres::PgPoolOptions;
use std::{
    io::{self, IsTerminal},
    net::SocketAddr,
    time::Duration,
};
use tower_http::services::{ServeDir, ServeFile};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "lista_escolar=info,tower_http=warn".into()),
        )
        .init();
    let options = config::database_options()?;
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(options)
        .await?;
    let args: Vec<String> = std::env::args().collect();
    let command = args.get(1).map(String::as_str).unwrap_or("serve");
    if ![
        "serve",
        "migrate",
        "create-admin",
        "reset-admin",
        "reset-password",
    ]
    .contains(&command)
    {
        return Err("Uso: cargo run -- [serve|migrate|create-admin USUARIO|reset-admin USUARIO|reset-password CORREO]".into());
    }
    let catalog_exists: bool = sqlx::query_scalar("SELECT to_regnamespace('catalog') IS NOT NULL")
        .fetch_one(&pool)
        .await?;
    if !catalog_exists {
        sqlx::raw_sql(include_str!("../db/001_catalog.sql"))
            .execute(&pool)
            .await?;
        sqlx::raw_sql(include_str!("../db/002_seed_catalog.sql"))
            .execute(&pool)
            .await?;
    }
    config::migrate(&pool).await?;
    if command == "migrate" {
        println!("Migraciones aplicadas. El catálogo existente se conserva.");
        return Ok(());
    }
    if ["create-admin", "reset-admin", "reset-password"].contains(&command) {
        let name = args
            .get(2)
            .ok_or("Se requiere un nombre de usuario o correo.")?
            .trim();
        if name.is_empty() || name.len() > 254 {
            return Err("Nombre inválido.".into());
        }
        let password = if io::stdin().is_terminal() {
            rpassword::prompt_password("Contraseña (mínimo 8 caracteres): ")?
        } else {
            let mut value = String::new();
            io::stdin().read_line(&mut value)?;
            value.trim_end_matches(['\r', '\n']).into()
        };
        let hash = auth::hash_password(&password).map_err(|e| e.1)?;
        if command == "create-admin" {
            sqlx::query("INSERT INTO app.admins(username,password_hash) VALUES($1,$2)")
                .bind(name)
                .bind(hash)
                .execute(&pool)
                .await?;
        } else {
            let mut tx = pool.begin().await?;
            let id: Option<uuid::Uuid> = if command == "reset-admin" {
                sqlx::query_scalar(
                    "UPDATE app.admins SET password_hash=$2 WHERE username=$1 RETURNING id",
                )
                .bind(name)
                .bind(hash)
                .fetch_optional(&mut *tx)
                .await?
            } else {
                sqlx::query_scalar(
                    "UPDATE app.users SET password_hash=$2 WHERE email=$1 RETURNING id",
                )
                .bind(name.to_lowercase())
                .bind(hash)
                .fetch_optional(&mut *tx)
                .await?
            };
            let id = id.ok_or("No existe esa cuenta.")?;
            sqlx::query("DELETE FROM app.sessions WHERE user_id=$1 OR admin_id=$1")
                .bind(id)
                .execute(&mut *tx)
                .await?;
            tx.commit().await?;
        }
        println!("Cuenta configurada.");
        return Ok(());
    }
    let address: SocketAddr = std::env::var("LISTA_BIND")
        .unwrap_or_else(|_| "127.0.0.1:3000".into())
        .parse()?;
    if !address.ip().is_loopback() {
        return Err(
            "Esta configuración es solo local. LISTA_BIND debe usar una dirección loopback.".into(),
        );
    }
    let cleanup_pool = pool.clone();
    tokio::spawn(async move {
        let mut timer = tokio::time::interval(Duration::from_secs(60));
        loop {
            timer.tick().await;
            for statement in [
                "DELETE FROM app.imports WHERE expires_at<=now()",
                "DELETE FROM app.sessions WHERE expires_at<=now()",
                "DELETE FROM app.assets a WHERE created_at<now()-interval '24 hours' AND NOT EXISTS (SELECT 1 FROM app.lists l WHERE l.deleted_at IS NULL AND lower(l.draft->>'logo_id')=a.id::text) AND NOT EXISTS (SELECT 1 FROM app.versions v JOIN app.lists l ON l.id=v.list_id WHERE l.deleted_at IS NULL AND lower(v.content->>'logo_id')=a.id::text)",
            ] {
                if let Err(error) = sqlx::query(statement).execute(&cleanup_pool).await {
                    tracing::warn!(%error,"Local cleanup failed");
                }
            }
        }
    });
    let state = AppState { pool };
    let app = lista_escolar::api(state).fallback_service(
        ServeDir::new("frontend/dist/lista-escolar/browser").not_found_service(ServeFile::new(
            "frontend/dist/lista-escolar/browser/index.html",
        )),
    );
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("Lista Escolar — entorno local: http://{address}");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        tokio::signal::ctrl_c().await.ok();
    })
    .await?;
    Ok(())
}
