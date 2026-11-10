//! Shared catalog search and contextual attribute facets. Filtering stays in SQL
//! so pagination never hides a matching attribute behind the legacy 200-row cap.
use axum::{
    Json,
    extract::{Query, State},
};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use sqlx::{PgPool, Row};

use crate::{ApiError, ApiResult, AppState};

#[derive(Default, Deserialize)]
#[serde(default)]
pub struct Browse {
    pub q: String,
    pub category: String,
    pub subcategory: String,
    pub attributes: String,
    pub offset: i64,
    pub limit: Option<i64>,
}

/// The same folding is applied to searchable text in PostgreSQL below. Search
/// terms remain literal substrings: '%' and '_' are not SQL wildcard operators.
fn search_terms(query: &str) -> ApiResult<Vec<String>> {
    if query.chars().count() > 500 {
        return Err(ApiError::bad_request(
            "La búsqueda admite hasta 500 caracteres.",
        ));
    }
    let folded: String = query
        .chars()
        .flat_map(char::to_lowercase)
        .map(|c| match c {
            'á' => 'a',
            'é' => 'e',
            'í' => 'i',
            'ó' => 'o',
            'ú' | 'ü' => 'u',
            'ñ' => 'n',
            other => other,
        })
        .collect();
    Ok(folded.split_whitespace().map(str::to_owned).collect())
}

// Both routes use this search document. Only approved, nondeleted source links
// participate; unreviewed source products must not affect public discovery.
const BASE: &str = r#"
WITH documents AS MATERIALIZED (
  SELECT i.id,i.name,i.review_status,c.id category_id,c.name category,c.slug category_slug,
    s.id subcategory_id,s.name subcategory,s.slug subcategory_slug,
    COALESCE(aliases.values,'[]'::jsonb) aliases,
    COALESCE(attrs.details,'{}'::jsonb) attributes,
    COALESCE(attrs.values,'{}'::jsonb) attribute_values,
    translate(lower(concat_ws(' ',i.name,c.name,s.name,aliases.search_text,attrs.search_text,products.search_text)),
      'áéíóúüñÁÉÍÓÚÜÑ','aeiouunaeiouun') search_text
  FROM catalog.items i
  JOIN catalog.categories c ON c.id=i.category_id
  LEFT JOIN catalog.subcategories s ON s.id=i.subcategory_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(a.alias ORDER BY a.alias) AS "values",string_agg(a.alias,' ') search_text
    FROM catalog.item_aliases a WHERE a.item_id=i.id
  ) aliases ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_object_agg(d.key,jsonb_build_object('name',d.name,'unit',d.unit,'data_type',d.data_type,
        'value',COALESCE(to_jsonb(a.text_value),to_jsonb(a.number_value),to_jsonb(a.boolean_value)))) details,
      jsonb_object_agg(d.key,COALESCE(to_jsonb(a.text_value),to_jsonb(a.number_value),to_jsonb(a.boolean_value))) AS "values",
      string_agg(concat_ws(' ',d.key,d.name,a.text_value,
        CASE WHEN a.number_value IS NOT NULL THEN trim_scale(a.number_value)::text END,
        CASE a.boolean_value WHEN true THEN 'sí si true' WHEN false THEN 'no false' END,d.unit,
        CASE WHEN a.number_value IS NOT NULL THEN trim_scale(a.number_value)::text || COALESCE(d.unit,'') END),' ') search_text
    FROM catalog.item_attributes a JOIN catalog.attribute_definitions d ON d.id=a.attribute_id
    WHERE a.item_id=i.id
  ) attrs ON true
  LEFT JOIN LATERAL (
    SELECT string_agg(p.name,' ') search_text
    FROM catalog.store_product_matches m JOIN store_snapshot.products p ON p.id=m.source_product_id
    WHERE m.item_id=i.id AND m.review_status='approved' AND p.deleted_at IS NULL
  ) products ON true
  WHERE ($5 OR i.review_status IN ('approved','pending'))
    AND ($2='' OR c.slug=$2) AND ($3='' OR s.slug=$3)
), base AS MATERIALIZED (
  SELECT * FROM documents d
  WHERE NOT EXISTS(SELECT 1 FROM unnest($1::text[]) term WHERE strpos(d.search_text,term)=0)
), filtered AS MATERIALIZED (
  SELECT * FROM base WHERE attribute_values @> $4::jsonb
), page AS (
  SELECT * FROM filtered
  ORDER BY CASE review_status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,name,id
  LIMIT $6 OFFSET $7
)
"#;

const PAGE: &str = r#"COALESCE((SELECT jsonb_agg(to_jsonb(p)-'attribute_values'-'search_text'
  ORDER BY CASE p.review_status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,p.name,p.id)
  FROM page p),'[]'::jsonb)"#;

pub async fn legacy_rows(
    pool: &PgPool,
    q: &str,
    category: &str,
    include_rejected: bool,
) -> ApiResult<Value> {
    let terms = search_terms(q)?;
    let sql = format!("{BASE} SELECT {PAGE}");
    Ok(sqlx::query_scalar::<_, Value>(&sql)
        .bind(terms)
        .bind(category.trim())
        .bind("")
        .bind(json!({}))
        .bind(include_rejected)
        .bind(200_i64)
        .bind(0_i64)
        .fetch_one(pool)
        .await?)
}

pub async fn browse(
    State(state): State<AppState>,
    Query(query): Query<Browse>,
) -> ApiResult<Json<Value>> {
    Ok(Json(browse_rows(&state.pool, query).await?))
}

async fn browse_rows(pool: &PgPool, query: Browse) -> ApiResult<Value> {
    let terms = search_terms(&query.q)?;
    let category = query.category.trim();
    let subcategory = query.subcategory.trim();
    let limit = query.limit.unwrap_or(40);
    if !(1..=100).contains(&limit) || !(0..=1_000_000).contains(&query.offset) {
        return Err(ApiError::bad_request(
            "La página admite de 1 a 100 útiles y un desplazamiento entre 0 y 1000000.",
        ));
    }
    if category.len() > 100
        || subcategory.len() > 100
        || (!subcategory.is_empty() && category.is_empty())
    {
        return Err(ApiError::bad_request(
            "Selecciona una categoría antes de filtrar por subcategoría.",
        ));
    }
    if query.attributes.len() > 16_384 {
        return Err(ApiError::bad_request(
            "Los filtros de características son demasiado largos.",
        ));
    }
    let attributes: Map<String, Value> = if query.attributes.trim().is_empty() {
        Map::new()
    } else {
        serde_json::from_str(&query.attributes).map_err(|_| {
            ApiError::bad_request(
                "Los filtros deben ser un objeto JSON de características y valores.",
            )
        })?
    };
    if attributes.len() > 30 {
        return Err(ApiError::bad_request(
            "Se admiten hasta 30 filtros de características.",
        ));
    }
    if !attributes.is_empty() {
        let definitions = sqlx::query(
            "SELECT key,data_type FROM catalog.attribute_definitions WHERE key=ANY($1)",
        )
        .bind(attributes.keys().cloned().collect::<Vec<_>>())
        .fetch_all(pool)
        .await?;
        for (key, value) in &attributes {
            let definition = definitions
                .iter()
                .find(|row| row.get::<String, _>("key") == *key)
                .ok_or_else(|| {
                    ApiError::bad_request(format!("Característica desconocida: {key}"))
                })?;
            crate::catalog::validate_attribute(
                definition.get::<String, _>("data_type").as_str(),
                value,
            )?;
        }
    }
    let sql = format!(
        r#"{BASE}, facet_values AS (
      SELECT d.key,d.name,d.data_type,d.unit,d.id,v.value,count(*) n
      FROM base b CROSS JOIN LATERAL jsonb_each(b.attribute_values) v
      JOIN catalog.attribute_definitions d ON d.key=v.key
      WHERE b.attribute_values @> ($4::jsonb - d.key)
      GROUP BY d.key,d.name,d.data_type,d.unit,d.id,v.value
      UNION ALL
      SELECT d.key,d.name,d.data_type,d.unit,d.id,v.value,0::bigint n
      FROM documents b CROSS JOIN LATERAL jsonb_each(b.attribute_values) v
      JOIN catalog.attribute_definitions d ON d.key=v.key
      WHERE $2<>''
      GROUP BY d.key,d.name,d.data_type,d.unit,d.id,v.value
      UNION ALL
      SELECT d.key,d.name,d.data_type,d.unit,d.id,v.value,0::bigint n
      FROM jsonb_each($4::jsonb) v JOIN catalog.attribute_definitions d ON d.key=v.key
    ), merged_values AS (
      SELECT key,name,data_type,unit,id,value,sum(n)::bigint n FROM facet_values
      GROUP BY key,name,data_type,unit,id,value
    ), facets AS (
      SELECT key,
        CASE WHEN key<>'tipo_cuaderno' AND $2<>'' AND EXISTS(SELECT 1 FROM catalog.category_type_attributes t JOIN catalog.categories c ON c.id=t.category_id WHERE c.slug=$2 AND t.attribute_id=m.id) THEN 'Tipo' ELSE name END AS name,
        data_type,unit,id,
        jsonb_agg(jsonb_build_object('value',value,'count',n) ORDER BY value) AS "values"
      FROM merged_values m
      WHERE $4::jsonb ? key OR NOT EXISTS (
        SELECT 1 FROM catalog.category_attributes a JOIN catalog.categories c ON c.id=a.category_id
        JOIN catalog.category_type_attributes t ON t.category_id=c.id JOIN catalog.attribute_definitions d ON d.id=t.attribute_id
        WHERE c.slug=$2 AND a.attribute_id=m.id AND cardinality(a.applies_to_types)>0
          AND $4::jsonb ? d.key AND NOT (($4::jsonb->>d.key)=ANY(a.applies_to_types))
      )
      GROUP BY key,name,data_type,unit,id
    )
    SELECT jsonb_build_object('items',{PAGE},'total',(SELECT count(*) FROM filtered),
      'offset',$7::bigint,'limit',$6::bigint,
      'facets',COALESCE((SELECT jsonb_agg(to_jsonb(f)-'id' ORDER BY
          COALESCE((SELECT a.sort_order FROM catalog.category_attributes a JOIN catalog.categories c ON c.id=a.category_id WHERE c.slug=$2 AND a.attribute_id=f.id),1000),f.id)
        FROM facets f),'[]'::jsonb))"#
    );
    Ok(sqlx::query_scalar::<_, Value>(&sql)
        .bind(terms)
        .bind(category)
        .bind(subcategory)
        .bind(Value::Object(attributes))
        .bind(false)
        .bind(limit)
        .bind(query.offset)
        .fetch_one(pool)
        .await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn search_preserves_literal_terms_and_folds_spanish_accents() {
        assert_eq!(
            search_terms("  LÁPIZ  univ 7mm ").unwrap(),
            vec!["lapiz", "univ", "7mm"]
        );
        assert_eq!(search_terms("100% _").unwrap(), vec!["100%", "_"]);
        assert_eq!(
            search_terms(&"Á".repeat(300)).unwrap(),
            vec!["a".repeat(300)]
        );
        assert_eq!(
            search_terms(&"a".repeat(500)).unwrap(),
            vec!["a".repeat(500)]
        );
        assert!(search_terms(&"a".repeat(501)).is_err());
    }
}
