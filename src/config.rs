use sha2::{Digest, Sha256};
use sqlx::postgres::PgConnectOptions;
use std::{path::Path, str::FromStr};

pub fn database_options() -> Result<PgConnectOptions, Box<dyn std::error::Error>> {
    if let Ok(url) = std::env::var("DATABASE_URL") {
        return Ok(PgConnectOptions::from_str(&url)?);
    }
    let filename = std::env::var("LISTA_PGPASS").unwrap_or_else(|_| ".local/pgpass".into());
    let path = Path::new(&filename);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if path.metadata()?.permissions().mode() & 0o077 != 0 {
            return Err("El archivo de conexión debe tener permisos 600.".into());
        }
    }
    let text = std::fs::read_to_string(path)?;
    let lines: Vec<_> = text
        .lines()
        .filter(|s| !s.is_empty() && !s.starts_with('#'))
        .collect();
    if lines.len() != 1 {
        return Err("Se requiere una conexión explícita en .local/pgpass.".into());
    }
    let fields = parse_pgpass(lines[0])?;
    let port: u16 = fields[1].parse()?;
    if port == 0 || fields[..4].iter().any(|s| s == "*") {
        return Err("Destino PostgreSQL inválido.".into());
    }
    Ok(PgConnectOptions::new()
        .host(&fields[0])
        .port(port)
        .database(&fields[2])
        .username(&fields[3])
        .password(&fields[4]))
}

fn parse_pgpass(line: &str) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let mut fields = vec![String::new()];
    let mut escaped = false;
    for c in line.chars() {
        if escaped {
            fields.last_mut().unwrap().push(c);
            escaped = false;
        } else if c == '\\' {
            escaped = true;
        } else if c == ':' {
            fields.push(String::new());
        } else {
            fields.last_mut().unwrap().push(c);
        }
    }
    if escaped || fields.len() != 5 || fields.iter().any(String::is_empty) {
        return Err(
            "Formato de conexión inválido; se requiere host:puerto:base:usuario:contraseña.".into(),
        );
    }
    Ok(fields)
}

pub async fn migrate(pool: &sqlx::PgPool) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(76843122)")
        .execute(&mut *tx)
        .await?;
    sqlx::raw_sql("CREATE SCHEMA IF NOT EXISTS app; CREATE TABLE IF NOT EXISTS app.schema_migrations (version bigint PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())")
        .execute(&mut *tx).await?;
    for (version, script) in [
        (3_i64, include_str!("../db/003_application.sql")),
        (4_i64, include_str!("../db/004_notebook_catalog.sql")),
        (5_i64, include_str!("../db/005_category_attributes.sql")),
        (6_i64, include_str!("../db/006_catalog_expansion.sql")),
        (7_i64, include_str!("../db/007_color_count_variants.sql")),
        (8_i64, include_str!("../db/008_attribute_coverage.sql")),
    ] {
        let checksum = format!("{:x}", Sha256::digest(script));
        let existing: Option<String> =
            sqlx::query_scalar("SELECT checksum FROM app.schema_migrations WHERE version=$1")
                .bind(version)
                .fetch_optional(&mut *tx)
                .await?;
        if let Some(existing) = existing {
            if existing != checksum {
                return Err(sqlx::Error::Protocol(format!(
                    "Application migration {version} changed after application; add a new migration instead."
                )));
            }
        } else {
            sqlx::raw_sql(script).execute(&mut *tx).await?;
            sqlx::query("INSERT INTO app.schema_migrations(version,checksum) VALUES($1,$2)")
                .bind(version)
                .bind(checksum)
                .execute(&mut *tx)
                .await?;
        }
    }
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_escaped_password_without_splitting_colon() {
        let parts = parse_pgpass(r"localhost:5432:escolar:app:a\:b\\c").unwrap();
        assert_eq!(parts[4], r"a:b\c");
        assert!(parse_pgpass("localhost:5432:escolar:app").is_err());
        assert!(parse_pgpass("localhost:5432:escolar:app:\\").is_err());
    }
}
