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
    /// All accepted choices for this one requirement; an empty list is an ordinary item.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub alternatives: Vec<ItemAlternative>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct ItemAlternative {
    pub catalog_id: String,
    pub name: String,
    pub attributes: Value,
}

impl Default for ItemAlternative {
    fn default() -> Self {
        Self {
            catalog_id: String::new(),
            name: String::new(),
            attributes: json!({}),
        }
    }
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
            alternatives: Vec::new(),
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
        if !item.alternatives.is_empty() {
            if !(2..=12).contains(&item.alternatives.len()) || !item.catalog_id.is_empty() {
                return Err(ApiError::bad_request(
                    "Un útil con alternativas necesita entre 2 y 12 opciones y no puede representar un solo artículo del catálogo.",
                ));
            }
            for (index, option) in item.alternatives.iter().enumerate() {
                if option.name.trim().is_empty()
                    || option.name.chars().count() > 300
                    || !option.attributes.is_object()
                    || option.attributes.to_string().len() > 16_384
                    || (!option.catalog_id.is_empty()
                        && Uuid::parse_str(&option.catalog_id).is_err())
                {
                    return Err(ApiError::bad_request(
                        "Cada alternativa necesita un nombre de hasta 300 caracteres, atributos válidos y una referencia de catálogo válida si se incluye.",
                    ));
                }
                if item.alternatives[..index]
                    .iter()
                    .any(|previous| same_alternative(previous, option))
                {
                    return Err(ApiError::bad_request(
                        "Las alternativas de un útil no pueden repetirse.",
                    ));
                }
                if item
                    .attributes
                    .as_object()
                    .expect("item attributes validated above")
                    .iter()
                    .any(|(key, value)| option.attributes.get(key) != Some(value))
                {
                    return Err(ApiError::bad_request(
                        "Las características compartidas deben coincidir con todas las alternativas.",
                    ));
                }
            }
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
        for option in &mut item.alternatives {
            if !option.catalog_id.is_empty() {
                option.catalog_id = Uuid::parse_str(&option.catalog_id)
                    .map_err(|_| ApiError::bad_request("La referencia al catálogo no es válida."))?
                    .to_string();
            }
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
        && left.alternatives.len() == right.alternatives.len()
        && left.alternatives.iter().all(|option| {
            right
                .alternatives
                .iter()
                .any(|other| same_alternative(option, other))
        })
}

fn same_alternative(left: &ItemAlternative, right: &ItemAlternative) -> bool {
    left.name.trim() == right.name.trim() && left.attributes == right.attributes
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

    fn choice_content() -> Content {
        let shared = json!({"formato":{"name":"Formato","value":"universitario"}});
        Content {
            school: "Colegio de prueba".into(),
            class_name: "5° básico".into(),
            items: vec![Item {
                name: "Cuaderno universitario".into(),
                quantity: "2".into(),
                category: "Cuadernos".into(),
                attributes: shared.clone(),
                alternatives: ["Cuadriculado", "Rayado"]
                    .into_iter()
                    .map(|kind| {
                        let mut attributes = shared.clone();
                        attributes["tipo_cuaderno"] = json!({"name":"Tipo","value":kind});
                        ItemAlternative {
                            catalog_id: Uuid::new_v4().to_string(),
                            name: format!("Cuaderno universitario {kind}"),
                            attributes,
                        }
                    })
                    .collect(),
                ..Item::default()
            }],
            ..Content::default()
        }
    }

    #[test]
    fn old_items_keep_their_serialized_shape_and_option_snapshots_are_flat() {
        let legacy = json!({"id":Uuid::new_v4(),"catalog_id":"","name":"Lápiz",
            "quantity":"1","unit":"unidad","category":"Escritura","note":"","attributes":{}});
        let item: Item = serde_json::from_value(legacy.clone()).unwrap();
        assert!(item.alternatives.is_empty());
        assert_eq!(serde_json::to_value(item).unwrap(), legacy);
        let empty = json!({"alternatives":[]});
        assert!(
            serde_json::to_value(serde_json::from_value::<Item>(empty).unwrap())
                .unwrap()
                .get("alternatives")
                .is_none()
        );
        for unknown in ["id", "quantity", "alternatives", "unit"] {
            let mut option = json!({"name":"Cuaderno"});
            option[unknown] = json!("not supported");
            assert!(serde_json::from_value::<ItemAlternative>(option).is_err());
        }
    }

    #[test]
    fn alternatives_validate_bounded_distinct_choices_and_shared_attributes() {
        let valid = choice_content();
        assert!(validate_content(&valid, true).is_ok());
        let mutate: [fn(&mut Item); 11] = [
            |item| item.alternatives.truncate(1),
            |item| item.alternatives = vec![item.alternatives[0].clone(); 13],
            |item| item.catalog_id = Uuid::new_v4().to_string(),
            |item| item.alternatives[0].name = "  ".into(),
            |item| item.alternatives[0].name = "á".repeat(301),
            |item| item.alternatives[0].catalog_id = "not-a-uuid".into(),
            |item| item.alternatives[0].attributes = json!([]),
            |item| item.alternatives[0].attributes = json!({"long":"x".repeat(16_385)}),
            |item| {
                item.alternatives[1] = item.alternatives[0].clone();
                item.alternatives[1].catalog_id = Uuid::new_v4().to_string();
            },
            |item| item.alternatives[0].attributes["formato"] = json!("college"),
            |item| item.attributes["numero_hojas"] = json!(100),
        ];
        for change in mutate {
            let mut invalid = valid.clone();
            change(&mut invalid.items[0]);
            assert!(validate_content(&invalid, false).is_err());
            assert!(validate_content(&invalid, true).is_err());
        }
        let mut maximum = valid.clone();
        for index in 2..12 {
            let mut option = maximum.items[0].alternatives[0].clone();
            option.name = format!("Otra opción {index}");
            maximum.items[0].alternatives.push(option);
        }
        assert!(validate_content(&maximum, true).is_ok());
    }

    #[test]
    fn alternatives_survive_copy_and_canonicalize_their_catalog_references() {
        let mut original = choice_content();
        original.items[0].alternatives[0].catalog_id =
            original.items[0].alternatives[0].catalog_id.to_uppercase();
        let canonical = canonical_content(original.clone()).unwrap();
        assert_eq!(
            canonical.items[0].alternatives[0].catalog_id,
            original.items[0].alternatives[0].catalog_id.to_lowercase()
        );
        let copied = copied_content(canonical.clone());
        assert_ne!(copied.items[0].id, canonical.items[0].id);
        assert_eq!(
            copied.items[0].alternatives,
            canonical.items[0].alternatives
        );
        assert_eq!(copied.items[0].quantity, "2");
    }

    #[test]
    fn alternative_order_and_catalog_changes_preserve_progress_but_choice_changes_reset_it() {
        let first = choice_content();
        let id = first.items[0].id;
        let old = Progress::from([(
            id,
            ProgressState {
                checked: true,
                review: false,
            },
        )]);
        let mut reordered = first.clone();
        reordered.items[0].alternatives.reverse();
        reordered.items[0].alternatives[0].catalog_id = Uuid::new_v4().to_string();
        reordered.items[0].category = "Otra categoría".into();
        assert_eq!(migrate_progress(Some(&first), &reordered, &old), old);
        assert_eq!(
            content_changes(Some(&first), &reordered)["changed"],
            json!([])
        );
        for change in [
            (|item: &mut Item| item.alternatives[0].name = "Cuaderno college".into())
                as fn(&mut Item),
            |item| item.alternatives[0].attributes["numero_hojas"] = json!(80),
            |item| {
                let mut added = item.alternatives[0].clone();
                added.name = "Cuaderno universitario liso".into();
                item.alternatives.push(added);
            },
            |item| item.alternatives.clear(),
        ] {
            let mut changed = first.clone();
            change(&mut changed.items[0]);
            let state = migrate_progress(Some(&first), &changed, &old);
            assert_eq!(
                state[&id],
                ProgressState {
                    checked: false,
                    review: true
                }
            );
            assert_eq!(
                content_changes(Some(&first), &changed)["changed"],
                json!([id])
            );
            assert_eq!(
                migrate_progress(Some(&changed), &first, &state)[&id],
                state[&id]
            );
        }
    }
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
