use axum::{
    Json, Router,
    extract::{Query, State},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{PgPool, Postgres, Row, Transaction};
use uuid::Uuid;

use crate::{
    AppState,
    auth::User,
    error::{ApiError, ApiResult},
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/catalog", get(browse).post(create))
        .route("/catalog/categories", get(categories))
        .route("/catalog/match", post(match_names))
}

#[derive(Deserialize)]
struct MatchNames {
    names: Vec<String>,
}

async fn match_names(
    State(state): State<AppState>,
    _user: User,
    Json(input): Json<MatchNames>,
) -> ApiResult<Json<Value>> {
    if input.names.len() > 1000 || input.names.iter().any(|name| name.chars().count() > 300) {
        return Err(ApiError::bad_request(
            "La búsqueda admite hasta 1000 nombres de 300 caracteres",
        ));
    }
    let rows:Value=sqlx::query_scalar(r#"
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name',n.name,'candidates',COALESCE((
        SELECT jsonb_agg(to_jsonb(candidate)) FROM (
          SELECT i.id,i.name,c.name AS category,c.slug AS category_slug,s.name AS subcategory,i.review_status,
            COALESCE((SELECT jsonb_object_agg(d.key,jsonb_build_object('name',d.name,'unit',d.unit,'data_type',d.data_type,'value',
              COALESCE(to_jsonb(a.text_value),to_jsonb(a.number_value),to_jsonb(a.boolean_value))))
              FROM catalog.item_attributes a JOIN catalog.attribute_definitions d ON d.id=a.attribute_id
              WHERE a.item_id=i.id),'{}'::jsonb) AS attributes
          FROM catalog.items i JOIN catalog.categories c ON c.id=i.category_id
          LEFT JOIN catalog.subcategories s ON s.id=i.subcategory_id
          WHERE i.review_status IN ('approved','pending') AND btrim(n.name)<>'' AND (
            lower(i.name)=lower(btrim(n.name))
            OR EXISTS(SELECT 1 FROM catalog.item_aliases a WHERE a.item_id=i.id AND lower(a.alias)=lower(btrim(n.name)))
            OR EXISTS(SELECT 1 FROM catalog.store_product_matches m JOIN store_snapshot.products p ON p.id=m.source_product_id
              WHERE m.item_id=i.id AND m.review_status='approved' AND p.deleted_at IS NULL AND lower(p.name)=lower(btrim(n.name)))
            OR EXISTS(SELECT 1 FROM regexp_split_to_table(lower(n.name),'[^[:alnum:]]+') token
              WHERE length(token)>=3 AND lower(i.name) LIKE '%'||token||'%'))
          ORDER BY CASE WHEN lower(i.name)=lower(btrim(n.name)) THEN 0
            WHEN EXISTS(SELECT 1 FROM catalog.item_aliases a WHERE a.item_id=i.id AND lower(a.alias)=lower(btrim(n.name))) THEN 1
            WHEN EXISTS(SELECT 1 FROM catalog.store_product_matches m JOIN store_snapshot.products p ON p.id=m.source_product_id
              WHERE m.item_id=i.id AND m.review_status='approved' AND p.deleted_at IS NULL AND lower(p.name)=lower(btrim(n.name))) THEN 2 ELSE 3 END,
            (SELECT count(*) FROM regexp_split_to_table(lower(n.name),'[^[:alnum:]]+') token WHERE length(token)>=3 AND lower(i.name) LIKE '%'||token||'%') DESC,
            CASE i.review_status WHEN 'approved' THEN 0 ELSE 1 END,i.name,i.id LIMIT 8
        ) candidate),'[]'::jsonb)) ORDER BY n.ordinal),'[]'::jsonb)
      FROM unnest($1::text[]) WITH ORDINALITY n(name,ordinal)"#)
        .bind(input.names).fetch_one(&state.pool).await?;
    Ok(Json(json!({"rows":rows})))
}

#[derive(Default, Deserialize)]
pub struct Search {
    #[serde(default)]
    pub q: String,
    #[serde(default)]
    pub category: String,
}

pub async fn catalog_rows(
    pool: &PgPool,
    search: &Search,
    include_rejected: bool,
) -> ApiResult<Value> {
    let result = sqlx::query_scalar::<_, Value>(r#"
        SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM (
          SELECT i.id,i.name,i.review_status,c.id AS category_id,c.name AS category,c.slug AS category_slug,
            s.id AS subcategory_id,s.name AS subcategory,
            COALESCE((SELECT jsonb_agg(a.alias ORDER BY a.alias) FROM catalog.item_aliases a WHERE a.item_id=i.id),'[]'::jsonb) AS aliases,
            COALESCE((SELECT jsonb_object_agg(d.key,jsonb_build_object('name',d.name,'unit',d.unit,'data_type',d.data_type,'value',
              COALESCE(to_jsonb(a.text_value),to_jsonb(a.number_value),to_jsonb(a.boolean_value))))
              FROM catalog.item_attributes a JOIN catalog.attribute_definitions d ON d.id=a.attribute_id
              WHERE a.item_id=i.id),'{}'::jsonb) AS attributes
          FROM catalog.items i JOIN catalog.categories c ON c.id=i.category_id
          LEFT JOIN catalog.subcategories s ON s.id=i.subcategory_id
          WHERE ($3 OR i.review_status IN ('pending','approved'))
            AND ($2='' OR c.slug=$2)
            AND ($1='' OR i.name ILIKE '%' || $1 || '%'
              OR EXISTS(SELECT 1 FROM catalog.item_aliases a WHERE a.item_id=i.id AND a.alias ILIKE '%' || $1 || '%')
              OR EXISTS(SELECT 1 FROM catalog.store_product_matches m JOIN store_snapshot.products p ON p.id=m.source_product_id
                WHERE m.item_id=i.id AND m.review_status='approved' AND p.name ILIKE '%' || $1 || '%'))
          ORDER BY CASE i.review_status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,i.name,i.id
          LIMIT 200
        ) x"#).bind(search.q.trim()).bind(search.category.trim()).bind(include_rejected).fetch_one(pool).await?;
    Ok(result)
}

async fn browse(
    State(state): State<AppState>,
    Query(search): Query<Search>,
) -> ApiResult<Json<Value>> {
    Ok(Json(catalog_rows(&state.pool, &search, false).await?))
}

async fn categories(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let result = sqlx::query_scalar::<_, Value>(r#"
      SELECT COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb) FROM (
        SELECT c.id,c.slug,c.name,COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sort_order,s.name) FROM (
          SELECT s.id,s.slug,s.name,s.sort_order,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('key',a.key,'name',a.name,'data_type',a.data_type,'unit',a.unit) ORDER BY sa.sort_order)
              FROM catalog.subcategory_attributes sa JOIN catalog.attribute_definitions a ON a.id=sa.attribute_id
              WHERE sa.subcategory_id=s.id),'[]'::jsonb) AS attributes
          FROM catalog.subcategories s WHERE s.category_id=c.id) s),'[]'::jsonb) AS subcategories
        FROM catalog.categories c ORDER BY c.sort_order,c.name) c"#).fetch_one(&state.pool).await?;
    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct NewSupply {
    pub name: String,
    pub category_id: i64,
    pub subcategory_id: Option<i64>,
    #[serde(default)]
    pub attributes: serde_json::Map<String, Value>,
}

pub fn checked_text(value: &str, max: usize, label: &str) -> ApiResult<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > max {
        return Err(ApiError::bad_request(format!(
            "{label}: ingresa entre 1 y {max} caracteres"
        )));
    }
    Ok(value.to_owned())
}

pub async fn insert_supply(
    tx: &mut Transaction<'_, Postgres>,
    input: NewSupply,
) -> ApiResult<Uuid> {
    let name = checked_text(&input.name, 300, "Nombre")?;
    validate_classification(tx, input.category_id, input.subcategory_id).await?;
    let id = Uuid::new_v4();
    sqlx::query("INSERT INTO catalog.items(id,category_id,subcategory_id,name,canonical_key,review_status) VALUES($1,$2,$3,$4,$5,'pending')")
        .bind(id).bind(input.category_id).bind(input.subcategory_id).bind(name).bind(format!("custom:{id}"))
        .execute(&mut **tx).await?;
    replace_attributes(tx, id, input.attributes).await?;
    Ok(id)
}

pub async fn validate_classification(
    tx: &mut Transaction<'_, Postgres>,
    category_id: i64,
    subcategory_id: Option<i64>,
) -> ApiResult<()> {
    let valid: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM catalog.categories WHERE id=$1) AND ($2::bigint IS NULL OR EXISTS(SELECT 1 FROM catalog.subcategories WHERE id=$2 AND category_id=$1))")
        .bind(category_id).bind(subcategory_id).fetch_one(&mut **tx).await?;
    if !valid {
        return Err(ApiError::bad_request(
            "Selecciona una categoría y subcategoría válidas",
        ));
    }
    Ok(())
}

pub async fn replace_attributes(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    attributes: serde_json::Map<String, Value>,
) -> ApiResult<()> {
    if attributes.len() > 30 {
        return Err(ApiError::bad_request("Demasiados atributos"));
    }
    sqlx::query("DELETE FROM catalog.item_attributes WHERE item_id=$1")
        .bind(id)
        .execute(&mut **tx)
        .await?;
    for (key, supplied) in attributes {
        let definition =
            sqlx::query("SELECT id,data_type FROM catalog.attribute_definitions WHERE key=$1")
                .bind(&key)
                .fetch_optional(&mut **tx)
                .await?
                .ok_or_else(|| ApiError::bad_request(format!("Atributo desconocido: {key}")))?;
        let attribute_id: i64 = definition.try_get("id")?;
        let kind: String = definition.try_get("data_type")?;
        let value = supplied.get("value").unwrap_or(&supplied);
        let (text, number, boolean) = validate_attribute(&kind, value)?;
        sqlx::query("INSERT INTO catalog.item_attributes(item_id,attribute_id,data_type,text_value,number_value,boolean_value) VALUES($1,$2,$3,$4,$5::text::numeric,$6)")
            .bind(id).bind(attribute_id).bind(kind).bind(text).bind(number).bind(boolean).execute(&mut **tx).await?;
    }
    Ok(())
}

fn validate_attribute(
    kind: &str,
    value: &Value,
) -> ApiResult<(Option<String>, Option<String>, Option<bool>)> {
    match kind {
        "text" => Ok((
            Some(checked_text(
                value
                    .as_str()
                    .ok_or_else(|| ApiError::bad_request("El atributo requiere texto"))?,
                300,
                "Atributo",
            )?),
            None,
            None,
        )),
        "number"
            if value
                .as_f64()
                .is_some_and(|n| n.is_finite() && n > 0.0 && n <= 1_000_000.0) =>
        {
            Ok((None, Some(value.to_string()), None))
        }
        "boolean" if value.is_boolean() => Ok((None, None, value.as_bool())),
        _ => Err(ApiError::bad_request(
            "El atributo tiene un tipo o valor inválido",
        )),
    }
}

async fn create(
    State(state): State<AppState>,
    _user: User,
    Json(input): Json<NewSupply>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let name = input.name.trim().to_owned();
    let id = insert_supply(&mut tx, input).await?;
    tx.commit().await?;
    Ok(Json(json!({"id":id,"name":name,"review_status":"pending"})))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn typed_attributes_reject_coercion_and_nonpositive_measurements() {
        assert!(validate_attribute("number", &json!("100")).is_err());
        assert!(validate_attribute("number", &json!(0)).is_err());
        assert!(validate_attribute("boolean", &json!("false")).is_err());
        assert!(validate_attribute("text", &json!("   ")).is_err());
        assert_eq!(
            validate_attribute("number", &json!(7.5)).unwrap().1,
            Some("7.5".into())
        );
        assert_eq!(
            validate_attribute("boolean", &json!(false)).unwrap().2,
            Some(false)
        );
    }
}
