use std::io::{Cursor, Read};

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    routing::{delete, post},
};
use calamine::{Reader, Xlsx};
use quick_xml::events::Event;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    auth::User,
    catalog::{NewSupply, insert_supply},
    error::{ApiError, ApiResult},
    lists::{access, access_tx, content_value, parse_content, remember_request, request_result},
    models::{Content, Item, canonical_content, validate_content},
    state::AppState,
};

const UPLOAD_LIMIT: usize = 10 * 1024 * 1024;
const MAX_ROWS: usize = 1001;
const MAX_COLUMNS: usize = 100;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/lists/{id}/imports", post(upload))
        .route("/lists/{id}/imports/{import_id}/confirm", post(confirm))
        .route("/lists/{id}/imports/{import_id}", delete(cancel))
        .layer(DefaultBodyLimit::max(UPLOAD_LIMIT + 1024 * 1024))
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sheet {
    pub name: String,
    pub rows: Vec<Vec<String>>,
}
#[derive(Debug, Default, Deserialize)]
struct Options {
    encoding: Option<String>,
    delimiter: Option<String>,
}
fn import_error(message: impl Into<String>) -> ApiError {
    ApiError::bad_request(message)
}

fn validate_cell_reference(reference: &[u8]) -> ApiResult<()> {
    for part in reference.split(|b| *b == b':') {
        let clean: Vec<u8> = part.iter().copied().filter(|b| *b != b'$').collect();
        let letters = clean.iter().take_while(|b| b.is_ascii_alphabetic()).count();
        if letters == 0 || letters == clean.len() {
            return Err(import_error(
                "El archivo contiene referencias de celda inválidas.",
            ));
        }
        let mut column = 0usize;
        for b in &clean[..letters] {
            column = column
                .checked_mul(26)
                .and_then(|n| n.checked_add((b.to_ascii_uppercase() - b'A' + 1) as usize))
                .ok_or_else(|| import_error("Columna fuera de rango."))?;
        }
        let row = std::str::from_utf8(&clean[letters..])
            .ok()
            .and_then(|s| s.parse::<usize>().ok())
            .ok_or_else(|| import_error("Fila fuera de rango."))?;
        if row == 0 || row > MAX_ROWS || column > MAX_COLUMNS {
            return Err(import_error(
                "Cada hoja puede ocupar como máximo 1001 filas (incluido encabezado) y 100 columnas. Elimina filas o columnas sobrantes.",
            ));
        }
    }
    Ok(())
}
fn scan_worksheet(xml: &[u8]) -> ApiResult<()> {
    let mut reader = quick_xml::Reader::from_reader(xml);
    reader.trim_text(true);
    let mut cells = 0;
    let mut rows = 0;
    loop {
        match reader
            .read_event()
            .map_err(|_| import_error("La hoja de cálculo contiene XML inválido."))?
        {
            Event::Start(ref e) | Event::Empty(ref e) => {
                let name = e.local_name();
                let name = name.as_ref();
                if name == b"f" {
                    return Err(import_error(
                        "El archivo contiene fórmulas. Guarda una copia con los valores antes de importar.",
                    ));
                }
                if name == b"c" {
                    cells += 1;
                    if cells > MAX_ROWS * MAX_COLUMNS {
                        return Err(import_error("La hoja contiene demasiadas celdas."));
                    }
                }
                if name == b"row" {
                    rows += 1;
                    if rows > MAX_ROWS {
                        return Err(import_error("La hoja contiene más de 1000 filas de datos."));
                    }
                }
                for attr in e.attributes() {
                    let attr = attr.map_err(|_| import_error("Atributo inválido en la hoja."))?;
                    if (name == b"c" && attr.key.as_ref() == b"r")
                        || (name == b"dimension" && attr.key.as_ref() == b"ref")
                    {
                        validate_cell_reference(&attr.value)?;
                    }
                    if name == b"row" && attr.key.as_ref() == b"r" {
                        let row = std::str::from_utf8(&attr.value)
                            .ok()
                            .and_then(|s| s.parse::<usize>().ok())
                            .ok_or_else(|| import_error("Fila inválida."))?;
                        if row == 0 || row > MAX_ROWS {
                            return Err(import_error("La hoja supera el límite de filas."));
                        }
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(())
}
fn preflight_xlsx(bytes: &[u8]) -> ApiResult<()> {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|_| import_error("El archivo XLSX no es válido."))?;
    if zip.len() > 500 {
        return Err(import_error(
            "El libro contiene demasiados archivos internos.",
        ));
    }
    let mut expanded = 0u64;
    for index in 0..zip.len() {
        let mut file = zip
            .by_index(index)
            .map_err(|_| import_error("No se puede leer el libro."))?;
        expanded = expanded
            .checked_add(file.size())
            .ok_or_else(|| import_error("Archivo demasiado grande."))?;
        if expanded > 64 * 1024 * 1024 || file.size() > 16 * 1024 * 1024 {
            return Err(import_error(
                "El libro excede el límite de tamaño descomprimido.",
            ));
        }
        let name = file.name().to_owned();
        if name.starts_with("xl/externalLinks/") || name.ends_with("vbaProject.bin") {
            return Err(import_error(
                "Importa un XLSX sin macros ni vínculos externos.",
            ));
        }
        if name.starts_with("xl/worksheets/") && name.ends_with(".xml") {
            let mut data = Vec::new();
            file.by_ref()
                .take(16 * 1024 * 1024 + 1)
                .read_to_end(&mut data)
                .map_err(|_| import_error("No se puede descomprimir la hoja."))?;
            if data.len() > 16 * 1024 * 1024 {
                return Err(import_error("La hoja es demasiado grande."));
            }
            scan_worksheet(&data)?;
        }
    }
    Ok(())
}
fn parse_xlsx(bytes: &[u8]) -> ApiResult<Vec<Sheet>> {
    preflight_xlsx(bytes)?;
    let mut workbook =
        Xlsx::new(Cursor::new(bytes)).map_err(|_| import_error("No se pudo abrir el XLSX."))?;
    let names = workbook.sheet_names().to_vec();
    if names.len() > 20 {
        return Err(import_error("El libro admite hasta 20 hojas."));
    }
    let mut sheets = Vec::new();
    let mut total_cells = 0;
    for name in names {
        let range = workbook
            .worksheet_range(&name)
            .map_err(|_| import_error("No se pudo leer una hoja del libro."))?;
        if range.height() > MAX_ROWS || range.width() > MAX_COLUMNS {
            return Err(import_error(
                "Una hoja supera los límites de filas o columnas.",
            ));
        }
        let mut rows = Vec::new();
        // Retain leading/blank rows, so the preview keeps source row numbering.
        if let Some((start, _)) = range.start() {
            rows.resize(start as usize, Vec::new());
        }
        for row in range.rows() {
            let row: Vec<String> = row.iter().map(ToString::to_string).collect();
            if row.iter().any(|cell| cell.chars().count() > 10_000) {
                return Err(import_error("Una celda supera el límite de texto."));
            }
            total_cells += row.len();
            if total_cells > 200_000 {
                return Err(import_error("El libro contiene demasiadas celdas."));
            }
            rows.push(row);
        }
        if rows.iter().any(|r| r.iter().any(|c| !c.trim().is_empty())) {
            sheets.push(Sheet { name, rows });
        }
    }
    if sheets.is_empty() {
        return Err(import_error("El libro no contiene datos."));
    }
    Ok(sheets)
}
fn parse_csv(bytes: &[u8], options: &Options) -> ApiResult<Vec<Sheet>> {
    let text = if options.encoding.as_deref() == Some("windows-1252") {
        let (decoded, _, errors) = encoding_rs::WINDOWS_1252.decode(bytes);
        if errors {
            return Err(import_error(
                "La codificación seleccionada no permite leer el archivo.",
            ));
        }
        decoded.into_owned()
    } else {
        std::str::from_utf8(bytes)
            .map_err(|_| {
                import_error("El CSV no es UTF-8. Selecciona Windows-1252 y vuelve a cargarlo.")
            })?
            .trim_start_matches('\u{feff}')
            .to_owned()
    };
    let delimiter = match options.delimiter.as_deref() {
        Some(";") => b';',
        Some(",") => b',',
        Some("tab") | Some("\t") => b'\t',
        Some(_) => return Err(import_error("Selecciona coma, punto y coma o tabulación.")),
        None => {
            let header = text.lines().find(|l| !l.trim().is_empty()).unwrap_or("");
            b",;\t"
                .iter()
                .copied()
                .max_by_key(|b| header.bytes().filter(|x| x == b).count())
                .unwrap_or(b',')
        }
    };
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .delimiter(delimiter)
        .from_reader(text.as_bytes());
    let mut rows = Vec::new();
    for record in reader.records() {
        let record = record.map_err(|_| {
            import_error("El CSV contiene una fila inválida. Revisa el delimitador y las comillas.")
        })?;
        if record.len() > MAX_COLUMNS || record.iter().any(|c| c.chars().count() > 10_000) {
            return Err(import_error(
                "El CSV supera el límite de columnas o texto por celda.",
            ));
        }
        rows.push(record.iter().map(str::to_owned).collect::<Vec<_>>());
        if rows.len() > MAX_ROWS {
            return Err(import_error(
                "Importa hasta 1000 filas de datos y un encabezado.",
            ));
        }
    }
    if rows.is_empty() {
        return Err(import_error("El CSV está vacío."));
    }
    Ok(vec![Sheet {
        name: "CSV".into(),
        rows,
    }])
}
async fn upload(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
    Query(options): Query<Options>,
    mut multipart: Multipart,
) -> ApiResult<Json<Value>> {
    let initial = access(&state.pool, id, Some(user.id)).await?;
    if !initial.can_edit() {
        return Err(ApiError::forbidden());
    }
    let mut uploaded = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| import_error("La carga del archivo falló o supera 10 MiB."))?
    {
        if field.name() != Some("file") {
            continue;
        }
        if uploaded.is_some() {
            return Err(import_error("Carga un archivo a la vez."));
        }
        let filename = field.file_name().unwrap_or("").to_lowercase();
        let bytes = field
            .bytes()
            .await
            .map_err(|_| import_error("El archivo supera el límite de carga."))?;
        if bytes.len() > UPLOAD_LIMIT {
            return Err(import_error("El archivo debe pesar como máximo 10 MiB."));
        }
        uploaded = Some((filename, bytes));
    }
    let (filename, bytes) =
        uploaded.ok_or_else(|| import_error("Selecciona un archivo CSV o XLSX."))?;
    let sheets = tokio::task::spawn_blocking(move || {
        if filename.ends_with(".csv") {
            parse_csv(&bytes, &options)
        } else if filename.ends_with(".xlsx") {
            parse_xlsx(&bytes)
        } else {
            Err(import_error("Usa un archivo .csv o .xlsx."))
        }
    })
    .await
    .map_err(ApiError::internal)??;
    let mut tx = state.pool.begin().await?;
    let list = access_tx(&mut tx, id, Some(user.id)).await?;
    if !list.can_edit() {
        return Err(ApiError::forbidden());
    }
    sqlx::query("DELETE FROM app.imports WHERE expires_at<now()")
        .execute(&mut *tx)
        .await?;
    let import_id: Uuid = sqlx::query_scalar(
        "INSERT INTO app.imports(user_id,list_id,revision,sheets) VALUES($1,$2,$3,$4) RETURNING id",
    )
    .bind(user.id)
    .bind(id)
    .bind(list.draft_revision)
    .bind(serde_json::to_value(&sheets).map_err(ApiError::internal)?)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(
        json!({"id":import_id,"revision":list.draft_revision,"sheets":sheets}),
    ))
}
#[derive(Deserialize, Serialize)]
struct ImportItem {
    #[serde(flatten)]
    item: Item,
    #[serde(default)]
    share_with_catalog: bool,
    #[serde(default)]
    category_id: Option<i64>,
    #[serde(default)]
    subcategory_id: Option<i64>,
}
#[derive(Deserialize, Serialize)]
struct Confirmation {
    revision: i64,
    request_id: Uuid,
    items: Vec<ImportItem>,
}
async fn confirm(
    State(state): State<AppState>,
    user: User,
    Path((id, import_id)): Path<(Uuid, Uuid)>,
    Json(input): Json<Confirmation>,
) -> ApiResult<Json<Value>> {
    if input.items.is_empty() || input.items.len() > 1000 {
        return Err(import_error(
            "Selecciona entre 1 y 1000 artículos válidos para importar.",
        ));
    }
    let payload = json!({"import_id":import_id,"confirmation":&input});
    let mut tx = state.pool.begin().await?;
    let list = access_tx(&mut tx, id, Some(user.id)).await?;
    if !list.can_edit() {
        return Err(ApiError::forbidden());
    }
    if let Some(result) =
        request_result(&mut tx, user.id, id, "import", input.request_id, &payload).await?
    {
        return Ok(Json(result));
    }
    let revision:i64=sqlx::query_scalar("SELECT revision FROM app.imports WHERE id=$1 AND list_id=$2 AND user_id=$3 AND expires_at>now() FOR UPDATE")
        .bind(import_id).bind(id).bind(user.id).fetch_optional(&mut *tx).await?.ok_or_else(||import_error("La revisión de importación expiró o ya se canceló. Vuelve a cargar el archivo."))?;
    if revision != input.revision || list.draft_revision != input.revision {
        return Err(ApiError::conflict(
            "El borrador cambió durante la importación. Revisa la lista actual y vuelve a cargar el archivo.",
        ));
    }
    let validation = Content {
        school: "Importación".into(),
        class_name: "Revisión".into(),
        items: input.items.iter().map(|row| row.item.clone()).collect(),
        ..Content::default()
    };
    validate_content(&validation, true)?;
    let mut content = parse_content(list.draft)?;
    for row in input.items {
        let mut item = row.item;
        item.id = Uuid::new_v4();
        if row.share_with_catalog {
            if !item.alternatives.is_empty() {
                return Err(import_error(
                    "Las alternativas pertenecen a una lista; no se pueden compartir como un solo artículo del catálogo.",
                ));
            }
            if !item.catalog_id.is_empty() {
                return Err(import_error(
                    "Un artículo ya vinculado al catálogo no necesita compartirse de nuevo.",
                ));
            }
            let category_id = row.category_id.ok_or_else(|| {
                import_error("Selecciona la categoría para compartir el artículo.")
            })?;
            let catalog_id = insert_supply(
                &mut tx,
                NewSupply {
                    name: item.name.clone(),
                    category_id,
                    subcategory_id: row.subcategory_id,
                    attributes: item.attributes.as_object().cloned().unwrap_or_default(),
                },
            )
            .await?;
            item.catalog_id = catalog_id.to_string();
        }
        content.items.push(item);
    }
    let content = canonical_content(content)?;
    validate_content(&content, false)?;
    let revision:i64=sqlx::query_scalar("UPDATE app.lists SET draft=$2,draft_revision=draft_revision+1,updated_at=now() WHERE id=$1 RETURNING draft_revision").bind(id).bind(content_value(&content)?).fetch_one(&mut *tx).await?;
    let response = json!({"revision":revision});
    remember_request(
        &mut tx,
        user.id,
        id,
        "import",
        input.request_id,
        &payload,
        &response,
    )
    .await?;
    sqlx::query("DELETE FROM app.imports WHERE id=$1")
        .bind(import_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(response))
}
async fn cancel(
    State(state): State<AppState>,
    user: User,
    Path((id, import_id)): Path<(Uuid, Uuid)>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let list = access_tx(&mut tx, id, Some(user.id)).await?;
    if !list.can_view_draft() {
        return Err(ApiError::forbidden());
    }
    sqlx::query("DELETE FROM app.imports WHERE id=$1 AND list_id=$2 AND user_id=$3")
        .bind(import_id)
        .bind(id)
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn csv_keeps_quoted_notes_and_decimal_comma() {
        let parsed = parse_csv(
            "nombre;cantidad;nota\nPapel;0,5;\"No doblar; entregar limpio\"\n".as_bytes(),
            &Options::default(),
        )
        .unwrap();
        assert_eq!(
            parsed[0].rows[1],
            vec!["Papel", "0,5", "No doblar; entregar limpio"]
        );
    }
    #[test]
    fn legacy_encoding_is_explicit() {
        let bytes = b"nombre;cantidad\nL\xe1piz;2\n";
        assert!(parse_csv(bytes, &Options::default()).is_err());
        let parsed = parse_csv(
            bytes,
            &Options {
                encoding: Some("windows-1252".into()),
                delimiter: None,
            },
        )
        .unwrap();
        assert_eq!(parsed[0].rows[1][0], "Lápiz");
    }
    #[test]
    fn sparse_sheet_is_rejected_before_allocation() {
        assert!(scan_worksheet(br#"<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row><row r="1048576"><c r="XFD1048576"><v>2</v></c></row></sheetData></worksheet>"#).is_err());
        assert!(scan_worksheet(br#"<worksheet><sheetData><row r="1"><c r="A1"><f>SUM(A2:A4)</f><v>2</v></c></row></sheetData></worksheet>"#).is_err());
        assert!(scan_worksheet(br#"<worksheet><dimension ref="A1:D25"/><sheetData><row r="25"><c r="D25"><v>2</v></c></row></sheetData></worksheet>"#).is_ok());
    }
    #[test]
    fn oversize_csv_rejected() {
        let data = "a,b\n".repeat(MAX_ROWS + 1);
        assert!(parse_csv(data.as_bytes(), &Options::default()).is_err());
    }
}
