use axum::{
    Json, Router,
    body::Body,
    extract::{Path, Query, State},
    http::{Response, header},
    routing::{delete, get, patch, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

use crate::{
    AppState,
    auth::{self, Admin},
    catalog::{self, Search, checked_text},
    community::{audit, erase_comment},
    error::{ApiError, ApiResult},
    models::{Content, canonical_content, quantity_milli, validate_content},
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/admin/dashboard", get(dashboard))
        .route("/admin/catalog", get(catalog_items).post(create_item))
        .route("/admin/catalog/browse", get(catalog_page))
        .route("/admin/attributes", get(attribute_definitions))
        .route(
            "/admin/categories/{id}/attributes",
            patch(crate::category_attributes::configure),
        )
        .route(
            "/admin/categories/{id}/types",
            post(crate::category_attributes::change_type),
        )
        .route("/admin/catalog/{id}", patch(review_item))
        .route("/admin/products", get(products))
        .route(
            "/admin/matches",
            get(matches)
                .post(add_match)
                .patch(review_match)
                .delete(delete_match),
        )
        .route("/admin/reports", get(reports))
        .route("/admin/reports/{id}", post(decide_report))
        .route("/admin/reports/{id}/logo", get(report_logo))
        .route("/admin/templates", get(templates).post(save_template))
        .route("/admin/templates/{id}", delete(delete_template))
        .route("/admin/schools", get(schools).post(save_school))
        .route("/admin/schools/{id}", delete(delete_school))
        .route("/admin/accounts", post(create_admin))
        .route("/admin/categories", post(create_category))
        .route(
            "/admin/categories/{id}",
            patch(update_category).delete(delete_category),
        )
        .route("/admin/subcategories", post(create_subcategory))
        .route(
            "/admin/subcategories/{id}",
            patch(update_subcategory).delete(delete_subcategory),
        )
}

async fn dashboard(State(state): State<AppState>, _admin: Admin) -> ApiResult<Json<Value>> {
    let value:Value=sqlx::query_scalar(r#"SELECT jsonb_build_object(
      'users',(SELECT count(*) FROM app.users),'lists',(SELECT count(*) FROM app.lists WHERE deleted_at IS NULL),
      'pending_supplies',(SELECT count(*) FROM catalog.items WHERE review_status='pending'),
      'pending_matches',(SELECT count(*) FROM catalog.store_product_matches WHERE review_status='pending'),
      'open_reports',(SELECT count(*) FROM app.reports WHERE status='open'),
      'source_products',(SELECT count(*) FROM store_snapshot.products),'mode','local')"#).fetch_one(&state.pool).await?;
    Ok(Json(value))
}

async fn catalog_items(
    State(state): State<AppState>,
    _admin: Admin,
    Query(search): Query<Search>,
) -> ApiResult<Json<Value>> {
    Ok(Json(
        catalog::catalog_rows(&state.pool, &search, true).await?,
    ))
}

#[derive(Default, Deserialize)]
#[serde(default)]
struct CatalogPage {
    q: String,
    category: String,
    status: String,
    offset: i64,
    limit: Option<i64>,
}

async fn catalog_page(
    State(state): State<AppState>,
    _admin: Admin,
    Query(query): Query<CatalogPage>,
) -> ApiResult<Json<Value>> {
    let terms = crate::catalog_browse::search_terms(&query.q)?;
    let limit = query.limit.unwrap_or(50);
    let category = query.category.trim();
    let status = query.status.trim();
    if !(1..=100).contains(&limit)
        || !(0..=1_000_000).contains(&query.offset)
        || category.chars().count() > 100
        || !matches!(status, "" | "pending" | "approved" | "rejected")
    {
        return Err(ApiError::bad_request(
            "Selecciona un estado y una página válidos: de 1 a 100 útiles.",
        ));
    }
    // Reuse public search semantics, including attributes, aliases and accent
    // folding. Apply status before counting/paging and surface pending review
    // first; the legacy array endpoint remains available to existing callers.
    let sql = format!(
        r#"{}, admin_filtered AS MATERIALIZED (
          SELECT * FROM base WHERE ($8='' OR review_status=$8)
        ), admin_page AS (
          SELECT * FROM admin_filtered
          ORDER BY CASE review_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,name,id
          LIMIT $6 OFFSET $7
        )
        SELECT jsonb_build_object(
          'items',COALESCE((SELECT jsonb_agg(to_jsonb(p)-'attribute_values'-'search_text'
            ORDER BY CASE p.review_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,p.name,p.id)
            FROM admin_page p),'[]'::jsonb),
          'total',(SELECT count(*) FROM admin_filtered),'offset',$7::bigint,'limit',$6::bigint)"#,
        crate::catalog_browse::BASE
    );
    let result = sqlx::query_scalar::<_, Value>(&sql)
        .bind(terms)
        .bind(category)
        .bind("")
        .bind(json!({}))
        .bind(true)
        .bind(limit)
        .bind(query.offset)
        .bind(status)
        .fetch_one(&state.pool)
        .await?;
    Ok(Json(result))
}

async fn attribute_definitions(
    State(state): State<AppState>,
    _admin: Admin,
) -> ApiResult<Json<Value>> {
    let definitions: Value = sqlx::query_scalar("SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.name),'[]'::jsonb) FROM (SELECT key,name,data_type,unit FROM catalog.attribute_definitions) a")
        .fetch_one(&state.pool).await?;
    Ok(Json(definitions))
}

#[derive(Deserialize)]
struct AdminSupply {
    #[serde(flatten)]
    supply: catalog::NewSupply,
    #[serde(default)]
    aliases: Vec<String>,
    approve: bool,
}

async fn replace_aliases(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    aliases: Vec<String>,
) -> ApiResult<()> {
    if aliases.len() > 30 {
        return Err(ApiError::bad_request(
            "Se permiten hasta 30 nombres alternativos",
        ));
    }
    let mut aliases = aliases
        .iter()
        .map(|alias| {
            checked_text(alias, 300, "Nombre alternativo").map(|value| value.to_lowercase())
        })
        .collect::<ApiResult<Vec<_>>>()?;
    aliases.sort();
    aliases.dedup();
    sqlx::query("DELETE FROM catalog.item_aliases WHERE item_id=$1")
        .bind(id)
        .execute(&mut **tx)
        .await?;
    sqlx::query("INSERT INTO catalog.item_aliases(item_id,alias) SELECT $1,unnest($2::text[])")
        .bind(id)
        .bind(aliases)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

async fn create_item(
    State(state): State<AppState>,
    admin: Admin,
    Json(input): Json<AdminSupply>,
) -> ApiResult<Json<Value>> {
    if !input.approve {
        return Err(ApiError::bad_request(
            "Confirma la aprobación del nuevo útil",
        ));
    }
    let mut tx = state.pool.begin().await?;
    let id = catalog::insert_supply(&mut tx, input.supply).await?;
    replace_aliases(&mut tx, id, input.aliases).await?;
    sqlx::query("UPDATE catalog.items SET review_status='approved',updated_at=now() WHERE id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit(
        &mut tx,
        admin.id,
        "catalog_created",
        id,
        json!({"review_status":"approved"}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"id":id,"review_status":"approved"})))
}

// Omission preserves the existing subcategory; explicit null clears it.
fn nullable_subcategory<'de, D>(deserializer: D) -> Result<Option<Option<i64>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<i64>::deserialize(deserializer).map(Some)
}

#[derive(Deserialize)]
struct ItemReview {
    action: String,
    target_id: Option<Uuid>,
    name: Option<String>,
    category_id: Option<i64>,
    #[serde(default, deserialize_with = "nullable_subcategory")]
    subcategory_id: Option<Option<i64>>,
    attributes: Option<serde_json::Map<String, Value>>,
    aliases: Option<Vec<String>>,
}
async fn review_item(
    State(state): State<AppState>,
    admin: Admin,
    Path(id): Path<Uuid>,
    Json(input): Json<ItemReview>,
) -> ApiResult<Json<Value>> {
    if !["update", "approve", "reject", "merge"].contains(&input.action.as_str()) {
        return Err(ApiError::bad_request("Acción inválida"));
    }
    let mut tx = state.pool.begin().await?;
    // Stable lock order prevents two reciprocal merge requests from deadlocking.
    let rows=sqlx::query("SELECT id,name,review_status,category_id,subcategory_id FROM catalog.items WHERE id=$1 OR id=$2 ORDER BY id FOR UPDATE")
        .bind(id).bind(input.target_id).fetch_all(&mut *tx).await?;
    let source = rows
        .iter()
        .find(|r| r.get::<Uuid, _>("id") == id)
        .ok_or_else(ApiError::not_found)?;
    if input.action == "merge" {
        if input.category_id.is_some()
            || input.subcategory_id.is_some()
            || input.attributes.is_some()
            || input.aliases.is_some()
        {
            return Err(ApiError::bad_request(
                "Guarda las correcciones antes de unir los útiles",
            ));
        }
        let target = input
            .target_id
            .filter(|t| *t != id)
            .ok_or_else(|| ApiError::bad_request("Selecciona otro artículo aprobado"))?;
        let target_row = rows
            .iter()
            .find(|r| r.get::<Uuid, _>("id") == target)
            .ok_or_else(ApiError::not_found)?;
        if target_row.get::<String, _>("review_status") != "approved" {
            return Err(ApiError::bad_request("El destino debe estar aprobado"));
        }
        let source_name: String = source.try_get("name")?;
        sqlx::query("INSERT INTO catalog.item_aliases(item_id,alias) SELECT $1,lower(btrim(alias)) FROM (SELECT $2::text AS alias UNION SELECT alias FROM catalog.item_aliases WHERE item_id=$3) a ON CONFLICT DO NOTHING")
            .bind(target).bind(source_name).bind(id).execute(&mut *tx).await?;
        // Moving a link to another generic meaning requires a fresh review.
        sqlx::query("INSERT INTO catalog.store_product_matches(item_id,source_product_id,review_status,match_method) SELECT $1,source_product_id,'pending','catalog_merge' FROM catalog.store_product_matches WHERE item_id=$2 ON CONFLICT DO NOTHING")
            .bind(target).bind(id).execute(&mut *tx).await?;
        sqlx::query(
            "UPDATE catalog.store_product_matches SET review_status='rejected' WHERE item_id=$1",
        )
        .bind(id)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE catalog.items SET review_status='rejected',updated_at=now() WHERE id=$1",
        )
        .bind(id)
        .execute(&mut *tx)
        .await?;
    } else {
        let name = match input.name {
            Some(name) => Some(checked_text(&name, 300, "Nombre")?),
            None => None,
        };
        let category_id = input.category_id.unwrap_or(source.get("category_id"));
        let changed_classification = input.category_id.is_some()
            || input.subcategory_id.is_some()
            || input.attributes.is_some();
        let (subcategory_id, attributes) = if changed_classification {
            let supplied = input
                .attributes
                .unwrap_or(crate::category_attributes::item_values(&mut tx, id).await?);
            let legacy = input.subcategory_id.unwrap_or_default();
            let (legacy, attributes) = crate::category_attributes::prepare(
                &mut tx,
                category_id,
                legacy,
                supplied,
                Some(id),
            )
            .await?;
            (
                if input.subcategory_id == Some(None) {
                    None
                } else {
                    legacy
                },
                Some(attributes),
            )
        } else {
            (source.get("subcategory_id"), None)
        };
        let status = match input.action.as_str() {
            "approve" => "approved".to_owned(),
            "reject" => "rejected".to_owned(),
            _ => source.get::<String, _>("review_status"),
        };
        sqlx::query("UPDATE catalog.items SET review_status=$2,name=COALESCE($3,name),category_id=$4,subcategory_id=$5,updated_at=now() WHERE id=$1")
            .bind(id).bind(status).bind(name).bind(category_id).bind(subcategory_id).execute(&mut *tx).await?;
        if let Some(attributes) = attributes {
            catalog::replace_attributes(&mut tx, id, attributes).await?;
        }
        if let Some(aliases) = input.aliases {
            replace_aliases(&mut tx, id, aliases).await?;
        }
    }
    audit(
        &mut tx,
        admin.id,
        "catalog_review",
        id,
        json!({"action":input.action,"target_id":input.target_id}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

async fn products(
    State(state): State<AppState>,
    _admin: Admin,
    Query(search): Query<Search>,
) -> ApiResult<Json<Value>> {
    let rows:Value=sqlx::query_scalar(r#"SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (
      SELECT p.id,p.name,b.name AS brand,p.unit_label,p.price_clp AS snapshot_price_clp,p.visible_in_store,p.source_updated_at,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'sku',v.sku,'attributes',v.attributes)) FROM store_snapshot.product_variants v WHERE v.product_id=p.id AND v.deleted_at IS NULL),'[]'::jsonb) AS variants,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('url',i.url,'alt_text',i.alt_text) ORDER BY pi.position) FROM store_snapshot.product_images pi JOIN store_snapshot.images i ON i.id=pi.image_id WHERE pi.product_id=p.id AND pi.deleted_at IS NULL AND i.deleted_at IS NULL),'[]'::jsonb) AS images
      FROM store_snapshot.products p LEFT JOIN store_snapshot.brands b ON b.id=p.brand_id
      WHERE p.deleted_at IS NULL AND ($1='' OR p.name ILIKE '%'||$1||'%') ORDER BY p.name,p.id LIMIT 200) x"#)
        .bind(search.q.trim()).fetch_one(&state.pool).await?;
    Ok(Json(rows))
}

async fn matches(State(state): State<AppState>, _admin: Admin) -> ApiResult<Json<Value>> {
    let rows:Value=sqlx::query_scalar(r#"SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (
      SELECT m.item_id,m.source_product_id,m.review_status,m.match_method,i.name AS generic_name,p.name AS source_product_name,
        b.name AS source_brand,p.price_clp AS snapshot_price_clp
      FROM catalog.store_product_matches m JOIN catalog.items i ON i.id=m.item_id
      JOIN store_snapshot.products p ON p.id=m.source_product_id LEFT JOIN store_snapshot.brands b ON b.id=p.brand_id
      ORDER BY CASE m.review_status WHEN 'pending' THEN 0 ELSE 1 END,i.name,p.name LIMIT 500) x"#).fetch_one(&state.pool).await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct Match {
    item_id: Uuid,
    source_product_id: Uuid,
}
#[derive(Deserialize)]
struct MatchReview {
    item_id: Uuid,
    source_product_id: Uuid,
    review_status: String,
}

async fn validate_match(tx: &mut Transaction<'_, Postgres>, input: &Match) -> ApiResult<()> {
    let status: String =
        sqlx::query_scalar("SELECT review_status FROM catalog.items WHERE id=$1 FOR UPDATE")
            .bind(input.item_id)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or_else(ApiError::not_found)?;
    if status == "rejected" {
        return Err(ApiError::bad_request("El artículo fue rechazado"));
    }
    let source: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM store_snapshot.products WHERE id=$1 AND deleted_at IS NULL)",
    )
    .bind(input.source_product_id)
    .fetch_one(&mut **tx)
    .await?;
    if !source {
        return Err(ApiError::not_found());
    }
    Ok(())
}

async fn add_match(
    State(state): State<AppState>,
    admin: Admin,
    Json(input): Json<Match>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    validate_match(&mut tx, &input).await?;
    sqlx::query("INSERT INTO catalog.store_product_matches(item_id,source_product_id,review_status,match_method) VALUES($1,$2,'approved','administrator') ON CONFLICT(item_id,source_product_id) DO UPDATE SET review_status='approved',match_method='administrator'")
        .bind(input.item_id).bind(input.source_product_id).execute(&mut *tx).await?;
    audit(
        &mut tx,
        admin.id,
        "store_match_approved",
        input.item_id,
        json!({"source_product_id":input.source_product_id}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

async fn review_match(
    State(state): State<AppState>,
    admin: Admin,
    Json(input): Json<MatchReview>,
) -> ApiResult<Json<Value>> {
    if !["pending", "approved", "rejected"].contains(&input.review_status.as_str()) {
        return Err(ApiError::bad_request("Estado inválido"));
    }
    let mut tx = state.pool.begin().await?;
    if input.review_status == "approved" {
        validate_match(
            &mut tx,
            &Match {
                item_id: input.item_id,
                source_product_id: input.source_product_id,
            },
        )
        .await?;
    }
    let changed=sqlx::query("UPDATE catalog.store_product_matches SET review_status=$3 WHERE item_id=$1 AND source_product_id=$2")
        .bind(input.item_id).bind(input.source_product_id).bind(&input.review_status).execute(&mut *tx).await?;
    if changed.rows_affected() == 0 {
        return Err(ApiError::not_found());
    }
    audit(
        &mut tx,
        admin.id,
        "store_match_reviewed",
        input.item_id,
        json!({"source_product_id":input.source_product_id,"status":input.review_status}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

async fn delete_match(
    State(state): State<AppState>,
    admin: Admin,
    Json(input): Json<Match>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    sqlx::query(
        "DELETE FROM catalog.store_product_matches WHERE item_id=$1 AND source_product_id=$2",
    )
    .bind(input.item_id)
    .bind(input.source_product_id)
    .execute(&mut *tx)
    .await?;
    audit(
        &mut tx,
        admin.id,
        "store_match_removed",
        input.item_id,
        json!({"source_product_id":input.source_product_id}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

async fn reports(State(state): State<AppState>, admin: Admin) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let records=sqlx::query("SELECT id,list_id,version,comment_id,kind,reason,status,outcome,note,created_at,CASE WHEN status='open' THEN evidence ELSE '{}'::jsonb END AS evidence FROM app.reports ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,created_at DESC LIMIT 200 FOR UPDATE")
        .fetch_all(&mut *tx).await?;
    let mut result = Vec::new();
    for row in records {
        let id: Uuid = row.try_get("id")?;
        let status: String = row.try_get("status")?;
        if status == "open" {
            audit(&mut tx, admin.id, "report_inspected", id, json!({})).await?;
        }
        result.push(json!({"id":id,"list_id":row.try_get::<Option<Uuid>,_>("list_id")?,"version":row.try_get::<i32,_>("version")?,
          "comment_id":row.try_get::<Option<Uuid>,_>("comment_id")?,"kind":row.try_get::<String,_>("kind")?,"reason":row.try_get::<String,_>("reason")?,
          "status":status,"outcome":row.try_get::<Option<String>,_>("outcome")?,"note":row.try_get::<Option<String>,_>("note")?,
          "created_at":row.try_get::<chrono::DateTime<chrono::Utc>,_>("created_at")?,"evidence":row.try_get::<Value,_>("evidence")?}));
    }
    tx.commit().await?;
    Ok(Json(json!(result)))
}

#[derive(Deserialize)]
struct ReportDecision {
    action: String,
    note: String,
}

async fn report_logo(
    State(state): State<AppState>,
    admin: Admin,
    Path(id): Path<Uuid>,
) -> ApiResult<Response<Body>> {
    let mut tx = state.pool.begin().await?;
    // Evidence is copied by report() from a published version after access checks;
    // neither this route nor the report input accepts an arbitrary asset identifier.
    let row=sqlx::query("SELECT a.data,a.content_type FROM app.reports r JOIN app.lists l ON l.id=r.list_id JOIN app.assets a ON a.id::text=lower(r.evidence#>>'{content,logo_id}') WHERE r.id=$1 AND r.status='open' AND l.deleted_at IS NULL FOR SHARE OF r,a")
        .bind(id).fetch_optional(&mut *tx).await?.ok_or_else(ApiError::not_found)?;
    let data: Vec<u8> = row.try_get("data")?;
    let content_type: String = row.try_get("content_type")?;
    audit(&mut tx, admin.id, "report_logo_inspected", id, json!({})).await?;
    tx.commit().await?;
    Response::builder()
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(Body::from(data))
        .map_err(ApiError::internal)
}
async fn decide_report(
    State(state): State<AppState>,
    admin: Admin,
    Path(id): Path<Uuid>,
    Json(input): Json<ReportDecision>,
) -> ApiResult<Json<Value>> {
    if !["hide", "restore", "remove", "dismiss"].contains(&input.action.as_str()) {
        return Err(ApiError::bad_request("Acción inválida"));
    }
    let note = checked_text(&input.note, 2000, "Motivo de la decisión")?;
    let list_id: Option<Uuid> = sqlx::query_scalar("SELECT list_id FROM app.reports WHERE id=$1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(ApiError::not_found)?;
    let mut tx = state.pool.begin().await?;
    if let Some(list) = list_id {
        // Lock without granting the administrator access to unpublished/private content.
        sqlx::query("SELECT id FROM app.lists WHERE id=$1 FOR UPDATE")
            .bind(list)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(ApiError::not_found)?;
    }
    let case = sqlx::query(
        "SELECT comment_id,status,evidence,outcome FROM app.reports WHERE id=$1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(ApiError::not_found)?;
    if case.try_get::<String, _>("status")? != "open" {
        return Err(ApiError::conflict("El caso ya está cerrado"));
    }
    let comment_id: Option<Uuid> = case.try_get("comment_id")?;
    if input.action == "hide" {
        if let Some(comment) = comment_id {
            sqlx::query("UPDATE app.comments SET deleted=true WHERE id=$1")
                .bind(comment)
                .execute(&mut *tx)
                .await?;
        } else if let Some(list) = list_id {
            sqlx::query("UPDATE app.lists SET hidden=true,updated_at=now() WHERE id=$1")
                .bind(list)
                .execute(&mut *tx)
                .await?;
            sqlx::query("UPDATE app.notifications SET status='canceled' WHERE list_id=$1 AND status IN ('local','pending','failed')").bind(list).execute(&mut *tx).await?;
        }
        sqlx::query("UPDATE app.reports SET outcome='hide',note=$2 WHERE id=$1")
            .bind(id)
            .bind(&note)
            .execute(&mut *tx)
            .await?;
    } else {
        let was_hidden = case.try_get::<Option<String>, _>("outcome")?.as_deref() == Some("hide");
        if input.action == "restore" || input.action == "dismiss" && was_hidden {
            let other_holds:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM app.reports WHERE id<>$1 AND list_id=$2 AND comment_id IS NOT DISTINCT FROM $3 AND status='open' AND outcome='hide')")
                .bind(id).bind(list_id).bind(comment_id).fetch_one(&mut *tx).await?;
            if other_holds && input.action == "restore" {
                return Err(ApiError::conflict(
                    "Otro reporte abierto mantiene este contenido oculto; resuelve primero ese caso",
                ));
            }
            if let Some(comment) = comment_id.filter(|_| !other_holds) {
                // Deleted author content is never reconstructed from old case evidence.
                sqlx::query("UPDATE app.comments SET deleted=false WHERE id=$1 AND body<>'' AND user_id IS NOT NULL").bind(comment).execute(&mut *tx).await?;
            } else if let Some(list) = list_id.filter(|_| comment_id.is_none() && !other_holds) {
                sqlx::query("UPDATE app.lists SET hidden=false,updated_at=now() WHERE id=$1 AND deleted_at IS NULL").bind(list).execute(&mut *tx).await?;
            }
        } else if input.action == "remove" {
            if let Some(comment) = comment_id {
                erase_comment(&mut tx, comment).await?;
            } else if let Some(list) = list_id {
                remove_reported_list(&mut tx, list).await?;
            }
        }
        sqlx::query("UPDATE app.reports SET status='closed',outcome=$2,note=$3,evidence='{}'::jsonb,reason='',closed_at=now() WHERE id=$1")
            .bind(id).bind(&input.action).bind(&note).execute(&mut *tx).await?;
    }
    audit(
        &mut tx,
        admin.id,
        "report_decided",
        id,
        json!({"action":input.action}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

async fn remove_reported_list(tx: &mut Transaction<'_, Postgres>, id: Uuid) -> ApiResult<()> {
    let logo_ids:Vec<String>=sqlx::query_scalar("SELECT draft->>'logo_id' FROM app.lists WHERE id=$1 AND COALESCE(draft->>'logo_id','')<>'' UNION SELECT content->>'logo_id' FROM app.versions WHERE list_id=$1 AND COALESCE(content->>'logo_id','')<>''")
        .bind(id).fetch_all(&mut **tx).await?;
    let logo_ids: Vec<Uuid> = logo_ids
        .into_iter()
        .filter_map(|value| Uuid::parse_str(&value).ok())
        .collect();
    sqlx::query("UPDATE app.lists SET deleted_at=now(),hidden=true,draft='{}'::jsonb,draft_revision=draft_revision+1,updated_at=now() WHERE id=$1")
        .bind(id).execute(&mut **tx).await?;
    sqlx::query("UPDATE app.reports SET evidence='{}'::jsonb,reason='' WHERE list_id=$1")
        .bind(id)
        .execute(&mut **tx)
        .await?;
    // Cascades erase comments, votes, progress, and notification rows with published content.
    sqlx::query("DELETE FROM app.versions WHERE list_id=$1")
        .bind(id)
        .execute(&mut **tx)
        .await?;
    sqlx::query("DELETE FROM app.assets a WHERE a.id=ANY($1) AND NOT EXISTS(SELECT 1 FROM app.lists l WHERE l.deleted_at IS NULL AND lower(l.draft->>'logo_id')=a.id::text) AND NOT EXISTS(SELECT 1 FROM app.versions v JOIN app.lists l ON l.id=v.list_id WHERE l.deleted_at IS NULL AND lower(v.content->>'logo_id')=a.id::text)")
        .bind(&logo_ids).execute(&mut **tx).await?;
    for table in [
        "grants",
        "invitations",
        "request_links",
        "access_requests",
        "follows",
        "imports",
        "requests",
    ] {
        sqlx::query(&format!("DELETE FROM app.{table} WHERE list_id=$1"))
            .bind(id)
            .execute(&mut **tx)
            .await?;
    }
    sqlx::query("UPDATE app.transfers SET status='canceled' WHERE list_id=$1 AND status='pending'")
        .bind(id)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

async fn templates(State(state): State<AppState>, _admin: Admin) -> ApiResult<Json<Value>> {
    let rows:Value=sqlx::query_scalar("SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT id,name,grade,content,active FROM app.templates ORDER BY grade,name) x").fetch_one(&state.pool).await?;
    Ok(Json(rows))
}
#[derive(Deserialize)]
struct Template {
    id: Option<Uuid>,
    name: String,
    grade: String,
    content: Content,
}
async fn save_template(
    State(state): State<AppState>,
    admin: Admin,
    Json(input): Json<Template>,
) -> ApiResult<Json<Value>> {
    let name = checked_text(&input.name, 200, "Nombre")?;
    let grade = checked_text(&input.grade, 100, "Nivel")?;
    let content = canonical_content(input.content)?;
    validate_content(&content, false)?;
    if content.items.is_empty() || !content.logo_id.is_empty() {
        return Err(ApiError::bad_request(
            "La plantilla requiere artículos y no puede incluir un logo privado",
        ));
    }
    for item in &content.items {
        checked_text(&item.name, 300, "Artículo")?;
        quantity_milli(&item.quantity, &item.unit)?;
    }
    let content = serde_json::to_value(&content).map_err(ApiError::internal)?;
    let mut tx = state.pool.begin().await?;
    let id = if let Some(id) = input.id {
        let affected = sqlx::query(
            "UPDATE app.templates SET name=$2,grade=$3,content=$4,active=true WHERE id=$1",
        )
        .bind(id)
        .bind(name)
        .bind(grade)
        .bind(content)
        .execute(&mut *tx)
        .await?;
        if affected.rows_affected() == 0 {
            return Err(ApiError::not_found());
        }
        id
    } else {
        sqlx::query_scalar(
            "INSERT INTO app.templates(name,grade,content) VALUES($1,$2,$3) RETURNING id",
        )
        .bind(name)
        .bind(grade)
        .bind(content)
        .fetch_one(&mut *tx)
        .await?
    };
    audit(&mut tx, admin.id, "template_saved", id, json!({})).await?;
    tx.commit().await?;
    Ok(Json(json!({"id":id})))
}
async fn delete_template(
    State(state): State<AppState>,
    admin: Admin,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    sqlx::query("UPDATE app.templates SET active=false WHERE id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit(&mut tx, admin.id, "template_deactivated", id, json!({})).await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

async fn schools(State(state): State<AppState>, _admin: Admin) -> ApiResult<Json<Value>> {
    let rows:Value=sqlx::query_scalar("SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT * FROM app.school_aliases ORDER BY canonical_name,region,comuna,alias) x").fetch_one(&state.pool).await?;
    Ok(Json(rows))
}
#[derive(Deserialize)]
struct SchoolAlias {
    canonical_name: String,
    alias: String,
    comuna: String,
    region: String,
}
async fn save_school(
    State(state): State<AppState>,
    admin: Admin,
    Json(input): Json<SchoolAlias>,
) -> ApiResult<Json<Value>> {
    let canonical = checked_text(&input.canonical_name, 200, "Colegio")?;
    let alias = checked_text(&input.alias, 200, "Nombre alternativo")?.to_lowercase();
    let comuna = checked_text(&input.comuna, 150, "Comuna")?.to_lowercase();
    let region = checked_text(&input.region, 150, "Región")?.to_lowercase();
    let mut tx = state.pool.begin().await?;
    let id:Uuid=sqlx::query_scalar("INSERT INTO app.school_aliases(canonical_name,alias,comuna,region) VALUES($1,$2,$3,$4) ON CONFLICT(alias,comuna,region) DO UPDATE SET canonical_name=excluded.canonical_name RETURNING id")
        .bind(canonical).bind(alias).bind(comuna).bind(region).fetch_one(&mut *tx).await?;
    audit(&mut tx, admin.id, "school_alias_saved", id, json!({})).await?;
    tx.commit().await?;
    Ok(Json(json!({"id":id})))
}
async fn delete_school(
    State(state): State<AppState>,
    admin: Admin,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    sqlx::query("DELETE FROM app.school_aliases WHERE id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit(&mut tx, admin.id, "school_alias_deleted", id, json!({})).await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

#[derive(Deserialize)]
struct NewAdmin {
    username: String,
    password: String,
}
async fn create_admin(
    State(state): State<AppState>,
    admin: Admin,
    Json(input): Json<NewAdmin>,
) -> ApiResult<Json<Value>> {
    let username = checked_text(&input.username, 100, "Usuario")?.to_lowercase();
    let hash = auth::hash_password(&input.password)?;
    let mut tx = state.pool.begin().await?;
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO app.admins(username,password_hash) VALUES($1,$2) RETURNING id",
    )
    .bind(username)
    .bind(hash)
    .fetch_one(&mut *tx)
    .await?;
    audit(&mut tx, admin.id, "admin_created", id, json!({})).await?;
    tx.commit().await?;
    Ok(Json(json!({"id":id})))
}

#[derive(Deserialize)]
struct Taxonomy {
    name: String,
    slug: String,
    category_id: Option<i64>,
}
fn taxonomy_values(input: &Taxonomy) -> ApiResult<(String, String)> {
    let name = checked_text(&input.name, 150, "Nombre")?;
    let slug = checked_text(&input.slug, 100, "Identificador")?;
    if !slug.split('-').all(|part| {
        !part.is_empty()
            && part
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
    }) {
        return Err(ApiError::bad_request(
            "Usa minúsculas, números y guiones en el identificador",
        ));
    }
    Ok((name, slug))
}
async fn create_category(
    State(state): State<AppState>,
    admin: Admin,
    Json(input): Json<Taxonomy>,
) -> ApiResult<Json<Value>> {
    let (name, slug) = taxonomy_values(&input)?;
    let mut tx = state.pool.begin().await?;
    let id: i64 =
        sqlx::query_scalar("INSERT INTO catalog.categories(name,slug) VALUES($1,$2) RETURNING id")
            .bind(name)
            .bind(slug)
            .fetch_one(&mut *tx)
            .await?;
    crate::category_attributes::ensure_type(&mut tx, id).await?;
    audit(
        &mut tx,
        admin.id,
        "category_created",
        Uuid::nil(),
        json!({"category_id":id}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"id":id})))
}
async fn update_category(
    State(state): State<AppState>,
    admin: Admin,
    Path(id): Path<i64>,
    Json(input): Json<Taxonomy>,
) -> ApiResult<Json<Value>> {
    let (name, slug) = taxonomy_values(&input)?;
    let mut tx = state.pool.begin().await?;
    let affected = sqlx::query("UPDATE catalog.categories SET name=$2,slug=$3 WHERE id=$1")
        .bind(id)
        .bind(name)
        .bind(slug)
        .execute(&mut *tx)
        .await?;
    if affected.rows_affected() == 0 {
        return Err(ApiError::not_found());
    }
    audit(
        &mut tx,
        admin.id,
        "category_updated",
        Uuid::nil(),
        json!({"category_id":id}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}
async fn delete_category(
    State(state): State<AppState>,
    admin: Admin,
    Path(id): Path<i64>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    sqlx::query("SELECT id FROM catalog.categories WHERE id=$1 FOR UPDATE")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(ApiError::not_found)?;
    let used: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM catalog.items WHERE category_id=$1)")
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
    if used {
        return Err(ApiError::conflict("La categoría tiene útiles asignados"));
    }
    sqlx::query("DELETE FROM catalog.subcategory_attributes WHERE subcategory_id IN (SELECT id FROM catalog.subcategories WHERE category_id=$1)")
        .bind(id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM catalog.subcategories WHERE category_id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM catalog.categories WHERE id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit(
        &mut tx,
        admin.id,
        "category_deleted",
        Uuid::nil(),
        json!({"category_id":id}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}
async fn create_subcategory(
    State(state): State<AppState>,
    admin: Admin,
    Json(input): Json<Taxonomy>,
) -> ApiResult<Json<Value>> {
    let (name, slug) = taxonomy_values(&input)?;
    let category = input
        .category_id
        .ok_or_else(|| ApiError::bad_request("Selecciona una categoría"))?;
    let mut tx = state.pool.begin().await?;
    sqlx::query("SELECT id FROM catalog.categories WHERE id=$1 FOR KEY SHARE")
        .bind(category)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(ApiError::not_found)?;
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO catalog.subcategories(category_id,name,slug) VALUES($1,$2,$3) RETURNING id",
    )
    .bind(category)
    .bind(name)
    .bind(slug)
    .fetch_one(&mut *tx)
    .await?;
    crate::category_attributes::register_legacy(&mut tx, id).await?;
    audit(
        &mut tx,
        admin.id,
        "subcategory_created",
        Uuid::nil(),
        json!({"subcategory_id":id}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"id":id})))
}
async fn update_subcategory(
    State(state): State<AppState>,
    admin: Admin,
    Path(id): Path<i64>,
    Json(input): Json<Taxonomy>,
) -> ApiResult<Json<Value>> {
    let (name, slug) = taxonomy_values(&input)?;
    let category = input
        .category_id
        .ok_or_else(|| ApiError::bad_request("Selecciona una categoría"))?;
    let mut tx = state.pool.begin().await?;
    let old: i64 =
        sqlx::query_scalar("SELECT category_id FROM catalog.subcategories WHERE id=$1 FOR UPDATE")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(ApiError::not_found)?;
    sqlx::query("SELECT id FROM catalog.categories WHERE id=$1 FOR KEY SHARE")
        .bind(category)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(ApiError::not_found)?;
    if old != category {
        let used: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM catalog.items WHERE subcategory_id=$1)",
        )
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
        if used {
            return Err(ApiError::conflict(
                "Reasigna los artículos antes de mover esta subcategoría",
            ));
        }
    }
    sqlx::query("UPDATE catalog.subcategories SET category_id=$2,name=$3,slug=$4 WHERE id=$1")
        .bind(id)
        .bind(category)
        .bind(name)
        .bind(slug)
        .execute(&mut *tx)
        .await?;
    crate::category_attributes::register_legacy(&mut tx, id).await?;
    audit(
        &mut tx,
        admin.id,
        "subcategory_updated",
        Uuid::nil(),
        json!({"subcategory_id":id}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}
async fn delete_subcategory(
    State(state): State<AppState>,
    admin: Admin,
    Path(id): Path<i64>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    sqlx::query("SELECT id FROM catalog.subcategories WHERE id=$1 FOR UPDATE")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(ApiError::not_found)?;
    let used: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM catalog.items WHERE subcategory_id=$1)")
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
    if used {
        return Err(ApiError::conflict("La subcategoría tiene artículos"));
    }
    sqlx::query("DELETE FROM catalog.subcategory_attributes WHERE subcategory_id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM catalog.subcategories WHERE id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit(
        &mut tx,
        admin.id,
        "subcategory_deleted",
        Uuid::nil(),
        json!({"subcategory_id":id}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn taxonomy_identifier_matches_database_contract() {
        for slug in [
            "",
            "-arte",
            "arte-",
            "arte--dibujo",
            "Arte",
            "arte/dibujo",
            "lápices",
        ] {
            assert!(
                taxonomy_values(&Taxonomy {
                    name: "Arte".into(),
                    slug: slug.into(),
                    category_id: None
                })
                .is_err(),
                "{slug}"
            );
        }
        assert!(
            taxonomy_values(&Taxonomy {
                name: "Arte".into(),
                slug: "arte-y-dibujo-2".into(),
                category_id: None
            })
            .is_ok()
        );
    }
}
