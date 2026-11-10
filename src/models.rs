use std::collections::{BTreeMap, HashSet};

use chrono::Datelike;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::error::{ApiError, ApiResult};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct Content {
    pub school: String,
    pub class_name: String,
    pub school_year: i32,
    pub comuna: String,
    pub region: String,
    pub instructions: String,
    pub logo_id: String,
    pub items: Vec<Item>,
}

impl Default for Content {
    fn default() -> Self {
        Self {
            school: String::new(),
            class_name: String::new(),
            school_year: chrono::Utc::now().year(),
            comuna: String::new(),
            region: String::new(),
            instructions: String::new(),
            logo_id: String::new(),
            items: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct Item {
    pub id: Uuid,
    pub catalog_id: String,
    pub name: String,
    pub quantity: String,
    pub unit: String,
    pub category: String,
    pub note: String,
    pub attributes: Value,
}

impl Default for Item {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4(),
            catalog_id: String::new(),
            name: String::new(),
            quantity: "1".into(),
            unit: "unidad".into(),
            category: String::new(),
            note: String::new(),
            attributes: json!({}),
        }
    }
}

/// Exact thousandths; no float rounding and no ambiguous thousands separators.
pub fn quantity_milli(value: &str, unit: &str) -> ApiResult<i64> {
    let count = matches!(
        unit,
        "unidad" | "caja" | "paquete" | "par" | "set" | "hoja" | "pliego" | "rollo"
    );
    if !count && !matches!(unit, "m" | "cm" | "L" | "ml" | "kg" | "g") {
        return Err(ApiError::bad_request("Selecciona una unidad válida."));
    }
    let normalized = value.trim().replace(',', ".");
    let mut parts = normalized.split('.');
    let whole = parts.next().unwrap_or_default();
    let fractional = parts.next();
    if whole.is_empty()
        || !whole.bytes().all(|b| b.is_ascii_digit())
        || whole.len() > 4
        || parts.next().is_some()
        || fractional
            .is_some_and(|p| p.is_empty() || p.len() > 3 || !p.bytes().all(|b| b.is_ascii_digit()))
    {
        return Err(ApiError::bad_request(
            "La cantidad debe ser positiva, sin separadores de miles y con hasta tres decimales.",
        ));
    }
    let whole: i64 = whole
        .parse()
        .map_err(|_| ApiError::bad_request("Cantidad inválida."))?;
    let fraction = fractional.unwrap_or("");
    let fraction: i64 = if fraction.is_empty() {
        0
    } else {
        fraction
            .parse::<i64>()
            .map_err(|_| ApiError::bad_request("Cantidad inválida."))?
            * 10_i64.pow(3 - fraction.len() as u32)
    };
    let result = whole * 1000 + fraction;
    if result == 0 || result > 9_999_999 || (count && (fraction != 0 || whole > 9999)) {
        return Err(ApiError::bad_request(
            "Las unidades contables requieren cantidades enteras entre 1 y 9999; las medidas permiten hasta 9999,999.",
        ));
    }
    Ok(result)
}

pub fn validate_content(content: &Content, publishing: bool) -> ApiResult<()> {
    if content.school.chars().count() > 200
        || content.class_name.chars().count() > 100
        || content.comuna.chars().count() > 150
        || content.region.chars().count() > 150
        || content.instructions.chars().count() > 10_000
        || content.items.len() > 2000
    {
        return Err(ApiError::bad_request(
            "La lista supera los límites de texto o de 2000 artículos.",
        ));
    }
    if !content.logo_id.is_empty() && Uuid::parse_str(&content.logo_id).is_err() {
        return Err(ApiError::bad_request(
            "El identificador del logo no es válido.",
        ));
    }
    if publishing
        && (content.school.trim().is_empty()
            || content.class_name.trim().is_empty()
            || !(1900..=2200).contains(&content.school_year)
            || content.items.is_empty())
    {
        return Err(ApiError::bad_request(
            "Indica colegio, curso, año válido y al menos un artículo antes de publicar.",
        ));
    }
    let mut ids = HashSet::new();
    for item in &content.items {
        if item.id.is_nil() || !ids.insert(item.id) {
            return Err(ApiError::bad_request(
                "Cada fila debe tener un identificador único.",
            ));
        }
        if item.name.chars().count() > 300
            || item.note.chars().count() > 2000
            || item.category.chars().count() > 100
            || item.quantity.len() > 32
            || item.unit.len() > 30
            || !item.attributes.is_object()
            || item.attributes.to_string().len() > 16_384
        {
            return Err(ApiError::bad_request(
                "Un artículo supera los límites de texto o contiene atributos inválidos.",
            ));
        }
        if !item.catalog_id.is_empty() && Uuid::parse_str(&item.catalog_id).is_err() {
            return Err(ApiError::bad_request(
                "La referencia al catálogo no es válida.",
            ));
        }
        if publishing {
            if item.name.trim().is_empty() {
                return Err(ApiError::bad_request(
                    "Todos los artículos necesitan un nombre.",
                ));
            }
            quantity_milli(&item.quantity, &item.unit)?;
        }
    }
    Ok(())
}

pub fn canonical_content(mut content: Content) -> ApiResult<Content> {
    if !content.logo_id.is_empty() {
        content.logo_id = Uuid::parse_str(&content.logo_id)
            .map_err(|_| ApiError::bad_request("El identificador del logo no es válido."))?
            .to_string();
    }
    for item in &mut content.items {
        if !item.catalog_id.is_empty() {
            item.catalog_id = Uuid::parse_str(&item.catalog_id)
                .map_err(|_| ApiError::bad_request("La referencia al catálogo no es válida."))?
                .to_string();
        }
    }
    Ok(content)
}

pub fn copied_content(mut content: Content) -> Content {
    for item in &mut content.items {
        item.id = Uuid::new_v4();
    }
    content
}

pub fn same_requirements(left: &Item, right: &Item) -> bool {
    left.name.trim() == right.name.trim()
        && left.unit == right.unit
        && quantity_milli(&left.quantity, &left.unit).ok()
            == quantity_milli(&right.quantity, &right.unit).ok()
        && left.note.trim() == right.note.trim()
        && left.attributes == right.attributes
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
pub struct ProgressState {
    pub checked: bool,
    pub review: bool,
}
pub type Progress = BTreeMap<Uuid, ProgressState>;

pub fn migrate_progress(previous: Option<&Content>, current: &Content, old: &Progress) -> Progress {
    let previous_items: BTreeMap<_, _> = previous
        .into_iter()
        .flat_map(|c| &c.items)
        .map(|i| (i.id, i))
        .collect();
    current
        .items
        .iter()
        .map(|item| {
            let state = match previous_items.get(&item.id) {
                Some(before) if same_requirements(before, item) => {
                    old.get(&item.id).copied().unwrap_or_default()
                }
                Some(_) | None => ProgressState {
                    checked: false,
                    review: previous.is_some(),
                },
            };
            (item.id, state)
        })
        .collect()
}

pub fn content_changes(previous: Option<&Content>, current: &Content) -> Value {
    let old: BTreeMap<_, _> = previous
        .into_iter()
        .flat_map(|c| &c.items)
        .map(|i| (i.id, i))
        .collect();
    let new: BTreeMap<_, _> = current.items.iter().map(|i| (i.id, i)).collect();
    let added: Vec<_> = new.keys().filter(|id| !old.contains_key(id)).collect();
    let removed: Vec<_> = old.keys().filter(|id| !new.contains_key(id)).collect();
    let changed: Vec<_> = new
        .iter()
        .filter(|(id, i)| old.get(id).is_some_and(|o| !same_requirements(o, i)))
        .map(|(id, _)| id)
        .collect();
    let details_changed = previous.is_some_and(|p| {
        p.school != current.school
            || p.class_name != current.class_name
            || p.school_year != current.school_year
            || p.comuna != current.comuna
            || p.region != current.region
            || p.logo_id != current.logo_id
            || p.instructions != current.instructions
    });
    json!({"added":added,"changed":changed,"removed":removed,"details_changed":details_changed})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_quantity_rules() {
        assert_eq!(quantity_milli("0,001", "m").unwrap(), 1);
        assert_eq!(quantity_milli("9999.999", "kg").unwrap(), 9_999_999);
        for (value, unit) in [
            ("0", "unidad"),
            ("1.5", "caja"),
            ("10000", "m"),
            ("1.0001", "g"),
            ("1,234.5", "g"),
            ("-2", "m"),
            ("NaN", "m"),
        ] {
            assert!(quantity_milli(value, unit).is_err(), "{value} {unit}");
        }
    }
    #[test]
    fn occurrences_reordering_and_skipped_changes() {
        let mut first = Content::default();
        let item = Item {
            name: "Lápiz".into(),
            ..Item::default()
        };
        first.items = vec![
            item.clone(),
            Item {
                name: "Lápiz".into(),
                ..Item::default()
            },
        ];
        let old = Progress::from([(
            item.id,
            ProgressState {
                checked: true,
                review: false,
            },
        )]);
        let mut second = first.clone();
        second.items.reverse();
        second.items[1].category = "Otra".into();
        assert!(migrate_progress(Some(&first), &second, &old)[&item.id].checked);
        second.items[1].quantity = "2".into();
        let state = migrate_progress(Some(&first), &second, &old);
        let restored = migrate_progress(Some(&second), &first, &state);
        assert_eq!(
            restored[&item.id],
            ProgressState {
                checked: false,
                review: true
            }
        );
        assert!(!restored[&first.items[1].id].checked);
    }
    #[test]
    fn copies_get_independent_ids_and_duplicate_ids_fail() {
        let mut content = Content::default();
        content.items.push(Item::default());
        assert_ne!(
            copied_content(content.clone()).items[0].id,
            content.items[0].id
        );
        content.items.push(content.items[0].clone());
        assert!(validate_content(&content, false).is_err());
    }
}
