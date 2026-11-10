//! Category-owned attributes and the compatibility bridge for old classifications.
use crate::{
    ApiError, ApiResult, AppState,
    auth::Admin,
    catalog::{checked_text, validate_attribute},
    community::audit,
};
use axum::{
    Json,
    extract::{Path, State},
};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

pub async fn ensure_type(tx: &mut Transaction<'_, Postgres>, category: i64) -> ApiResult<i64> {
    if let Some(id) = sqlx::query_scalar(
        "SELECT attribute_id FROM catalog.category_type_attributes WHERE category_id=$1",
    )
    .bind(category)
    .fetch_optional(&mut **tx)
    .await?
    {
        return Ok(id);
    }
    let key = format!("tipo_categoria_{category}");
    let id: i64 = sqlx::query_scalar("INSERT INTO catalog.attribute_definitions(key,name,data_type) SELECT $1,'Tipo de ' || lower(name),'text' FROM catalog.categories WHERE id=$2 RETURNING id")
        .bind(key).bind(category).fetch_one(&mut **tx).await?;
    sqlx::query("INSERT INTO catalog.category_type_attributes VALUES($1,$2)")
        .bind(category)
        .bind(id)
        .execute(&mut **tx)
        .await?;
    sqlx::query("INSERT INTO catalog.category_attributes(category_id,attribute_id,sort_order) VALUES($1,$2,0)").bind(category).bind(id).execute(&mut **tx).await?;
    Ok(id)
}

fn scalar(value: &Value) -> &Value {
    value.get("value").unwrap_or(value)
}

/// New clients provide a type attribute; old clients can still provide a legacy
/// subcategory. Both paths validate against the same category-owned metadata.
pub async fn prepare(
    tx: &mut Transaction<'_, Postgres>,
    category: i64,
    subcategory: Option<i64>,
    mut attributes: Map<String, Value>,
    existing: Option<Uuid>,
) -> ApiResult<(Option<i64>, Map<String, Value>)> {
    crate::catalog::validate_classification(tx, category, subcategory).await?;
    sqlx::query("SELECT id FROM catalog.categories WHERE id=$1 FOR SHARE")
        .bind(category)
        .fetch_one(&mut **tx)
        .await?;
    let rows = sqlx::query("SELECT d.id,d.key,d.data_type,a.options,a.applies_to_types,t.attribute_id IS NOT NULL AS is_type FROM catalog.category_attributes a JOIN catalog.attribute_definitions d ON d.id=a.attribute_id LEFT JOIN catalog.category_type_attributes t ON t.category_id=a.category_id AND t.attribute_id=a.attribute_id WHERE a.category_id=$1")
        .bind(category).fetch_all(&mut **tx).await?;
    let type_row = rows.iter().find(|r| r.get::<bool, _>("is_type"));
    let mut resolved_subcategory = subcategory;
    if let Some(t) = type_row {
        let key: String = t.get("key");
        let mapped: Option<String> = if let Some(id) = subcategory {
            sqlx::query_scalar("SELECT type_value FROM catalog.legacy_subcategory_types WHERE subcategory_id=$1 AND attribute_id=$2")
                .bind(id).bind(t.get::<i64,_>("id")).fetch_optional(&mut **tx).await?
        } else {
            None
        };
        if let Some(mapped) = mapped {
            if let Some(value) = attributes.get(&key) {
                if scalar(value).as_str() != Some(mapped.as_str()) {
                    return Err(ApiError::bad_request(
                        "El tipo no coincide con la clasificación enviada.",
                    ));
                }
            } else {
                attributes.insert(key.clone(), json!(mapped));
            }
        }
        if subcategory.is_none()
            && let Some(value) = attributes.get(&key).and_then(|v| scalar(v).as_str())
        {
            let previous: Option<Option<i64>> = if let Some(id) = existing {
                sqlx::query_scalar("SELECT i.subcategory_id FROM catalog.items i JOIN catalog.item_attributes a ON a.item_id=i.id WHERE i.id=$1 AND i.category_id=$2 AND a.attribute_id=$3 AND a.text_value=$4")
                    .bind(id).bind(category).bind(t.get::<i64,_>("id")).bind(value).fetch_optional(&mut **tx).await?
            } else {
                None
            };
            resolved_subcategory = if let Some(previous) = previous {
                previous
            } else {
                sqlx::query_scalar("SELECT s.id FROM catalog.legacy_subcategory_types m JOIN catalog.subcategories s ON s.id=m.subcategory_id WHERE s.category_id=$1 AND m.attribute_id=$2 AND m.type_value=$3 ORDER BY s.id LIMIT 1")
                    .bind(category).bind(t.get::<i64,_>("id")).bind(value).fetch_optional(&mut **tx).await?
            };
        }
    }
    if attributes.len() > 30 {
        return Err(ApiError::bad_request("Demasiados atributos"));
    }
    let selected_type = type_row
        .and_then(|t| attributes.get(&t.get::<String, _>("key")))
        .and_then(|v| scalar(v).as_str());
    let previous: Value = if let Some(id) = existing {
        sqlx::query_scalar("SELECT COALESCE(jsonb_object_agg(d.key,COALESCE(to_jsonb(a.text_value),to_jsonb(a.number_value),to_jsonb(a.boolean_value))),'{}'::jsonb) FROM catalog.items i JOIN catalog.item_attributes a ON a.item_id=i.id JOIN catalog.attribute_definitions d ON d.id=a.attribute_id WHERE i.id=$1 AND i.category_id=$2")
            .bind(id).bind(category).fetch_one(&mut **tx).await?
    } else {
        json!({})
    };
    for (key, supplied) in &attributes {
        let value = scalar(supplied);
        let row = rows.iter().find(|r| r.get::<String, _>("key") == *key);
        let grandfathered = previous.get(key) == Some(value);
        let Some(row) = row else {
            if grandfathered {
                continue;
            }
            return Err(ApiError::bad_request(format!(
                "La característica {key} no está asignada a esta categoría."
            )));
        };
        validate_attribute(&row.get::<String, _>("data_type"), value)?;
        let applies: Vec<String> = row.get("applies_to_types");
        if selected_type.is_some_and(|v| !applies.is_empty() && !applies.iter().any(|a| a == v))
            && !grandfathered
        {
            return Err(ApiError::bad_request(format!(
                "La característica {key} no corresponde al tipo seleccionado."
            )));
        }
        let options: Vec<String> = row.get("options");
        if (row.get::<bool, _>("is_type") || !options.is_empty())
            && !value
                .as_str()
                .is_some_and(|v| options.iter().any(|o| o == v))
            && !grandfathered
        {
            return Err(ApiError::bad_request(format!(
                "Selecciona una opción válida para {key}."
            )));
        }
    }
    Ok((resolved_subcategory, attributes))
}

pub async fn item_values(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
) -> ApiResult<Map<String, Value>> {
    let values: Value=sqlx::query_scalar("SELECT COALESCE(jsonb_object_agg(d.key,COALESCE(to_jsonb(a.text_value),to_jsonb(a.number_value),to_jsonb(a.boolean_value))),'{}'::jsonb) FROM catalog.item_attributes a JOIN catalog.attribute_definitions d ON d.id=a.attribute_id WHERE item_id=$1")
        .bind(id).fetch_one(&mut **tx).await?;
    Ok(values.as_object().cloned().unwrap_or_default())
}

#[derive(Deserialize)]
pub struct Binding {
    key: String,
    #[serde(default)]
    options: Vec<String>,
    #[serde(default)]
    applies_to_types: Vec<String>,
    #[serde(default)]
    sort_order: i32,
}
#[derive(Deserialize)]
pub struct Configuration {
    attributes: Vec<Binding>,
}

fn choices(values: &[String]) -> ApiResult<()> {
    if values.len() > 200 {
        return Err(ApiError::bad_request("Se admiten hasta 200 opciones."));
    }
    let mut seen = std::collections::HashSet::new();
    for value in values {
        if checked_text(value, 300, "Opción")? != *value || !seen.insert(value) {
            return Err(ApiError::bad_request(
                "Las opciones no deben estar vacías, repetidas ni tener espacios en los extremos.",
            ));
        }
    }
    Ok(())
}

async fn lock_category(tx: &mut Transaction<'_, Postgres>, id: i64) -> ApiResult<()> {
    sqlx::query("SELECT id FROM catalog.categories WHERE id=$1 FOR UPDATE")
        .bind(id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(ApiError::not_found)?;
    Ok(())
}

pub async fn configure(
    State(state): State<AppState>,
    admin: Admin,
    Path(id): Path<i64>,
    Json(input): Json<Configuration>,
) -> ApiResult<Json<Value>> {
    if input.attributes.len() > 30 {
        return Err(ApiError::bad_request(
            "Se admiten hasta 30 características por categoría.",
        ));
    }
    let mut tx = state.pool.begin().await?;
    lock_category(&mut tx, id).await?;
    let type_id = ensure_type(&mut tx, id).await?;
    let type_key: String =
        sqlx::query_scalar("SELECT key FROM catalog.attribute_definitions WHERE id=$1")
            .bind(type_id)
            .fetch_one(&mut *tx)
            .await?;
    let type_binding = input
        .attributes
        .iter()
        .find(|a| a.key == type_key)
        .ok_or_else(|| {
            ApiError::bad_request("Conserva la característica de tipo de esta categoría.")
        })?;
    choices(&type_binding.options)?;
    if !type_binding.applies_to_types.is_empty() {
        return Err(ApiError::bad_request(
            "El tipo debe estar disponible para toda la categoría.",
        ));
    }
    let mut seen = std::collections::HashSet::new();
    let mut bindings = Vec::new();
    for binding in &input.attributes {
        if !seen.insert(&binding.key) {
            return Err(ApiError::bad_request("No repitas características."));
        }
        choices(&binding.options)?;
        choices(&binding.applies_to_types)?;
        if binding
            .applies_to_types
            .iter()
            .any(|v| !type_binding.options.contains(v))
        {
            return Err(ApiError::bad_request(
                "La condición contiene un tipo inexistente.",
            ));
        }
        let row=sqlx::query("SELECT d.id,d.data_type,t.category_id AS type_category FROM catalog.attribute_definitions d LEFT JOIN catalog.category_type_attributes t ON t.attribute_id=d.id WHERE d.key=$1")
            .bind(&binding.key).fetch_optional(&mut *tx).await?.ok_or_else(||ApiError::bad_request("Característica desconocida."))?;
        let attribute: i64 = row.get("id");
        if row
            .get::<Option<i64>, _>("type_category")
            .is_some_and(|category| category != id)
        {
            return Err(ApiError::bad_request(
                "No puedes asignar el tipo de otra categoría.",
            ));
        }
        if row.get::<String, _>("data_type") != "text" && !binding.options.is_empty() {
            return Err(ApiError::bad_request(
                "Las opciones predefinidas requieren una característica de texto.",
            ));
        }
        if attribute == type_id || !binding.options.is_empty() {
            let unlisted:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM catalog.items i JOIN catalog.item_attributes a ON a.item_id=i.id WHERE i.category_id=$1 AND a.attribute_id=$2 AND NOT (a.text_value=ANY($3)))")
                .bind(id).bind(attribute).bind(&binding.options).fetch_one(&mut *tx).await?;
            if unlisted {
                return Err(ApiError::conflict(
                    "Hay útiles que usan una opción que intentas quitar. Renómbrala o reasigna esos útiles primero.",
                ));
            }
        }
        bindings.push((attribute, binding));
    }
    sqlx::query("DELETE FROM catalog.category_attributes WHERE category_id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    for (attribute, binding) in bindings {
        sqlx::query("INSERT INTO catalog.category_attributes(category_id,attribute_id,options,applies_to_types,sort_order) VALUES($1,$2,$3,$4,$5)")
            .bind(id).bind(attribute).bind(&binding.options).bind(&binding.applies_to_types).bind(if attribute==type_id {0}else{binding.sort_order.max(1)}).execute(&mut *tx).await?;
    }
    audit(
        &mut tx,
        admin.id,
        "category_attributes_updated",
        Uuid::nil(),
        json!({"category_id":id}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

#[derive(Deserialize)]
pub struct TypeChange {
    action: String,
    value: String,
    new_value: Option<String>,
}
pub async fn change_type(
    State(state): State<AppState>,
    admin: Admin,
    Path(id): Path<i64>,
    Json(input): Json<TypeChange>,
) -> ApiResult<Json<Value>> {
    let value = checked_text(&input.value, 300, "Tipo")?;
    let mut tx = state.pool.begin().await?;
    lock_category(&mut tx, id).await?;
    let attribute = ensure_type(&mut tx, id).await?;
    let options: Vec<String> = sqlx::query_scalar(
        "SELECT options FROM catalog.category_attributes WHERE category_id=$1 AND attribute_id=$2",
    )
    .bind(id)
    .bind(attribute)
    .fetch_one(&mut *tx)
    .await?;
    if input.action == "add" {
        if options.contains(&value) {
            return Err(ApiError::conflict("Ese tipo ya existe."));
        }
        if options.len() >= 200 {
            return Err(ApiError::bad_request("Se admiten hasta 200 tipos."));
        }
        sqlx::query("UPDATE catalog.category_attributes SET options=array_append(options,$3) WHERE category_id=$1 AND attribute_id=$2").bind(id).bind(attribute).bind(&value).execute(&mut *tx).await?;
    } else {
        if !options.contains(&value) {
            return Err(ApiError::not_found());
        }
        match input.action.as_str() {
            "rename" => {
                let name =
                    checked_text(input.new_value.as_deref().unwrap_or(""), 300, "Nuevo tipo")?;
                if options.contains(&name) {
                    return Err(ApiError::conflict("Ese nombre de tipo ya existe."));
                }
                sqlx::query("UPDATE catalog.category_attributes SET options=array_replace(options,$3,$4) WHERE category_id=$1 AND attribute_id=$2").bind(id).bind(attribute).bind(&value).bind(&name).execute(&mut *tx).await?;
                sqlx::query("UPDATE catalog.category_attributes SET applies_to_types=array_replace(applies_to_types,$2,$3) WHERE category_id=$1").bind(id).bind(&value).bind(&name).execute(&mut *tx).await?;
                sqlx::query("UPDATE catalog.item_attributes a SET text_value=$4 FROM catalog.items i WHERE i.id=a.item_id AND i.category_id=$1 AND a.attribute_id=$2 AND a.text_value=$3").bind(id).bind(attribute).bind(&value).bind(&name).execute(&mut *tx).await?;
                sqlx::query("UPDATE catalog.legacy_subcategory_types m SET type_value=$3 FROM catalog.subcategories s WHERE s.id=m.subcategory_id AND s.category_id=$1 AND m.type_value=$2").bind(id).bind(&value).bind(&name).execute(&mut *tx).await?;
            }
            "remove" => {
                let used:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM catalog.items i JOIN catalog.item_attributes a ON a.item_id=i.id WHERE i.category_id=$1 AND a.attribute_id=$2 AND a.text_value=$3)").bind(id).bind(attribute).bind(&value).fetch_one(&mut *tx).await?;
                if used {
                    return Err(ApiError::conflict(
                        "El tipo tiene útiles asignados. Reasígnalos antes de quitarlo.",
                    ));
                }
                let conditional:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM catalog.category_attributes WHERE category_id=$1 AND $2=ANY(applies_to_types))").bind(id).bind(&value).fetch_one(&mut *tx).await?;
                if conditional {
                    return Err(ApiError::conflict(
                        "Hay características condicionadas a este tipo. Actualiza sus condiciones primero.",
                    ));
                }
                sqlx::query("UPDATE catalog.category_attributes SET options=array_remove(options,$3) WHERE category_id=$1 AND attribute_id=$2").bind(id).bind(attribute).bind(&value).execute(&mut *tx).await?;
            }
            _ => return Err(ApiError::bad_request("Acción de tipo inválida.")),
        }
    }
    audit(
        &mut tx,
        admin.id,
        "category_type_updated",
        Uuid::nil(),
        json!({"category_id":id,"action":input.action,"value":value}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

/// Compatibility for clients that still maintain the old taxonomy endpoints.
pub async fn register_legacy(
    tx: &mut Transaction<'_, Postgres>,
    subcategory: i64,
) -> ApiResult<()> {
    let row = sqlx::query("SELECT category_id,name FROM catalog.subcategories WHERE id=$1")
        .bind(subcategory)
        .fetch_one(&mut **tx)
        .await?;
    let category: i64 = row.get("category_id");
    let name: String = row.get("name");
    let attribute = ensure_type(tx, category).await?;
    let old: Option<String> = sqlx::query_scalar(
        "SELECT type_value FROM catalog.legacy_subcategory_types WHERE subcategory_id=$1",
    )
    .bind(subcategory)
    .fetch_optional(&mut **tx)
    .await?;
    sqlx::query("UPDATE catalog.category_attributes SET options=CASE WHEN $3=ANY(options) THEN options ELSE array_append(options,$3) END WHERE category_id=$1 AND attribute_id=$2").bind(category).bind(attribute).bind(&name).execute(&mut **tx).await?;
    sqlx::query("INSERT INTO catalog.legacy_subcategory_types(subcategory_id,attribute_id,type_value) VALUES($1,$2,$3) ON CONFLICT(subcategory_id) DO UPDATE SET attribute_id=excluded.attribute_id,type_value=excluded.type_value").bind(subcategory).bind(attribute).bind(&name).execute(&mut **tx).await?;
    if let Some(old) = old {
        sqlx::query("UPDATE catalog.item_attributes a SET text_value=$4 FROM catalog.items i WHERE i.id=a.item_id AND i.subcategory_id=$1 AND a.attribute_id=$2 AND a.text_value=$3").bind(subcategory).bind(attribute).bind(old).bind(&name).execute(&mut **tx).await?;
    }
    sqlx::query("INSERT INTO catalog.category_attributes(category_id,attribute_id,applies_to_types,sort_order) SELECT $1,attribute_id,ARRAY[$3]::text[],sort_order+10 FROM catalog.subcategory_attributes WHERE subcategory_id=$2 ON CONFLICT(category_id,attribute_id) DO UPDATE SET applies_to_types=CASE WHEN cardinality(catalog.category_attributes.applies_to_types)=0 OR $3=ANY(catalog.category_attributes.applies_to_types) THEN catalog.category_attributes.applies_to_types ELSE array_append(catalog.category_attributes.applies_to_types,$3) END")
        .bind(category).bind(subcategory).bind(name).execute(&mut **tx).await?;
    Ok(())
}
