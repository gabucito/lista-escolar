use std::collections::{BTreeMap, BTreeSet};

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::HeaderMap,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgPool, Postgres, Row, Transaction, postgres::PgRow};
use uuid::Uuid;

use crate::{
    auth::{User, optional_user},
    error::{ApiError, ApiResult},
    models::{
        Content, Progress, ProgressState, canonical_content, content_changes, copied_content,
        migrate_progress, validate_content,
    },
    state::AppState,
};

#[derive(Debug, Clone)]
pub struct ListAccess {
    pub id: Uuid,
    pub owner_id: Option<Uuid>,
    pub visibility: String,
    pub archived: bool,
    pub hidden: bool,
    pub comments_enabled: bool,
    pub current_version: i32,
    pub draft_revision: i64,
    pub draft: Value,
    pub role: String,
}
impl ListAccess {
    pub fn can_read(&self) -> bool {
        !self.hidden
            && self.current_version > 0
            && (self.visibility == "public" || !self.role.is_empty())
    }
    pub fn can_edit(&self) -> bool {
        !self.archived && matches!(self.role.as_str(), "owner" | "editor")
    }
    pub fn is_owner(&self) -> bool {
        self.role == "owner"
    }
    pub fn can_view_draft(&self) -> bool {
        matches!(self.role.as_str(), "owner" | "editor")
    }
}
fn access_row(row: &PgRow, user: Option<Uuid>, grant: Option<String>) -> ApiResult<ListAccess> {
    let owner_id: Option<Uuid> = row.try_get("owner_id")?;
    let role = if user.is_some() && user == owner_id {
        "owner".into()
    } else {
        grant.unwrap_or_default()
    };
    Ok(ListAccess {
        id: row.try_get("id")?,
        owner_id,
        visibility: row.try_get("visibility")?,
        archived: row.try_get("archived")?,
        hidden: row.try_get("hidden")?,
        comments_enabled: row.try_get("comments_enabled")?,
        current_version: row.try_get("current_version")?,
        draft_revision: row.try_get("draft_revision")?,
        draft: row.try_get("draft")?,
        role,
    })
}
pub async fn access(pool: &PgPool, id: Uuid, user: Option<Uuid>) -> ApiResult<ListAccess> {
    let row = sqlx::query("SELECT * FROM app.lists WHERE id=$1 AND deleted_at IS NULL")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(ApiError::not_found)?;
    let grant: Option<String> =
        sqlx::query_scalar("SELECT role FROM app.grants WHERE list_id=$1 AND user_id=$2")
            .bind(id)
            .bind(user)
            .fetch_optional(pool)
            .await?;
    access_row(&row, user, grant)
}
pub async fn access_tx(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    user: Option<Uuid>,
) -> ApiResult<ListAccess> {
    let row = sqlx::query("SELECT * FROM app.lists WHERE id=$1 AND deleted_at IS NULL FOR UPDATE")
        .bind(id)
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(ApiError::not_found)?;
    let grant: Option<String> =
        sqlx::query_scalar("SELECT role FROM app.grants WHERE list_id=$1 AND user_id=$2")
            .bind(id)
            .bind(user)
            .fetch_optional(&mut **tx)
            .await?;
    access_row(&row, user, grant)
}
pub fn parse_content(value: Value) -> ApiResult<Content> {
    serde_json::from_value(value).map_err(ApiError::internal)
}
pub fn content_value(content: &Content) -> ApiResult<Value> {
    serde_json::to_value(content).map_err(ApiError::internal)
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/lists", get(search).post(create))
        .route("/lists/mine", get(mine))
        .route("/lists/{id}", get(detail).delete(delete_list))
        .route("/lists/{id}/draft", get(draft).put(save_draft))
        .route("/lists/{id}/publish", post(publish))
        .route("/lists/{id}/settings", axum::routing::patch(settings))
        .route("/lists/{id}/copy", post(copy_list))
        .route("/lists/{id}/archive", post(archive))
        .route("/lists/{id}/progress", get(get_progress).put(put_progress))
        .route("/templates", get(templates))
        .route("/templates/{id}/copy", post(copy_template))
}
#[derive(Default, Deserialize)]
struct Search {
    q: Option<String>,
    school_year: Option<i32>,
    comuna: Option<String>,
    region: Option<String>,
    sort: Option<String>,
}
#[derive(Default, Deserialize)]
pub struct VersionQuery {
    pub version: Option<i32>,
}
fn summary(row: PgRow) -> ApiResult<Value> {
    let content: Value = row.try_get("content")?;
    Ok(
        json!({"id":row.try_get::<Uuid,_>("id")?,"school":content.get("school").and_then(Value::as_str).unwrap_or("Sin título"),
        "class_name":content.get("class_name").and_then(Value::as_str).unwrap_or(""),"school_year":content.get("school_year"),
        "comuna":content.get("comuna").and_then(Value::as_str).unwrap_or(""),"region":content.get("region").and_then(Value::as_str).unwrap_or(""),
        "visibility":row.try_get::<String,_>("visibility")?,"archived":row.try_get::<bool,_>("archived")?,"hidden":row.try_get::<bool,_>("hidden")?,
        "current_version":row.try_get::<i32,_>("current_version")?,"votes":row.try_get::<i64,_>("votes")?,
        "published_at":row.try_get::<Option<chrono::DateTime<chrono::Utc>>,_>("published_at")?,"owner_name":row.try_get::<String,_>("owner_name")?,"role":row.try_get::<String,_>("role")?,
        "following":row.try_get::<bool,_>("following")?}),
    )
}
async fn search(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<Search>,
) -> ApiResult<Json<Value>> {
    let user = optional_user(&state, &headers).await?.map(|u| u.id);
    let needle = query.q.unwrap_or_default();
    if needle.len() > 250 {
        return Err(ApiError::bad_request("La búsqueda es demasiado larga."));
    }
    let rows=sqlx::query(r#"SELECT l.id,l.visibility,l.archived,l.hidden,l.current_version,v.content,v.published_at,
        EXISTS(SELECT 1 FROM app.follows f WHERE f.list_id=l.id AND f.user_id=$1) following,
        COALESCE(u.display_name,'Usuario eliminado') owner_name,CASE WHEN l.owner_id=$1 THEN 'owner' ELSE COALESCE(g.role,'') END role,
        (SELECT count(*) FROM app.votes x WHERE x.list_id=l.id AND x.version=l.current_version) votes
        FROM app.lists l JOIN app.versions v ON v.list_id=l.id AND v.number=l.current_version
        LEFT JOIN app.users u ON u.id=l.owner_id LEFT JOIN app.grants g ON g.list_id=l.id AND g.user_id=$1
        WHERE l.deleted_at IS NULL AND l.visibility='public' AND NOT l.archived AND NOT l.hidden
        AND ($3::integer IS NULL OR v.content->>'school_year'=$3::text)
        AND ($4='' OR lower(v.content->>'comuna')=lower($4)) AND ($5='' OR lower(v.content->>'region')=lower($5))
        AND ($2='' OR NOT EXISTS(SELECT 1 FROM regexp_split_to_table(btrim($2),'[[:space:]]+') AS word
            WHERE concat_ws(' ',v.content->>'school',v.content->>'class_name',
                (SELECT string_agg(a.alias||' '||a.canonical_name,' ') FROM app.school_aliases a
                 WHERE a.comuna<>'' AND lower(a.comuna)=lower(v.content->>'comuna') AND lower(a.region)=lower(v.content->>'region')
                 AND (lower(a.canonical_name)=lower(v.content->>'school') OR lower(a.alias)=lower(v.content->>'school'))))
            NOT ILIKE '%'||word||'%'))
        ORDER BY CASE WHEN $6='recent' THEN 0 WHEN lower(v.content->>'school')=lower($2) THEN 2 ELSE 1 END DESC,
        CASE WHEN $6='recent' THEN 0 ELSE (SELECT count(*) FROM app.votes x WHERE x.list_id=l.id AND x.version=l.current_version) END DESC,
        v.published_at DESC,l.id LIMIT 100"#)
        .bind(user).bind(needle).bind(query.school_year).bind(query.comuna.unwrap_or_default()).bind(query.region.unwrap_or_default()).bind(query.sort.unwrap_or_default())
        .fetch_all(&state.pool).await?;
    Ok(Json(Value::Array(
        rows.into_iter().map(summary).collect::<ApiResult<_>>()?,
    )))
}
async fn mine(State(state): State<AppState>, user: User) -> ApiResult<Json<Value>> {
    let rows=sqlx::query(r#"SELECT l.id,l.visibility,l.archived,l.hidden,l.current_version,
        EXISTS(SELECT 1 FROM app.follows f WHERE f.list_id=l.id AND f.user_id=$1) following,
        CASE WHEN l.owner_id=$1 OR g.role='editor' THEN l.draft ELSE COALESCE(v.content,'{}') END content,v.published_at,
        COALESCE(u.display_name,'Usuario eliminado') owner_name,CASE WHEN l.owner_id=$1 THEN 'owner' ELSE COALESCE(g.role,'') END role,
        (SELECT count(*) FROM app.votes x WHERE x.list_id=l.id AND x.version=l.current_version) votes
        FROM app.lists l LEFT JOIN app.versions v ON v.list_id=l.id AND v.number=l.current_version
        LEFT JOIN app.users u ON u.id=l.owner_id LEFT JOIN app.grants g ON g.list_id=l.id AND g.user_id=$1
        WHERE l.deleted_at IS NULL AND (l.owner_id=$1 OR g.role='editor' OR
        (NOT l.hidden AND l.current_version>0 AND (g.user_id IS NOT NULL OR
         (l.visibility='public' AND EXISTS(SELECT 1 FROM app.follows f WHERE f.list_id=l.id AND f.user_id=$1)))))
        ORDER BY l.updated_at DESC LIMIT 250"#).bind(user.id).fetch_all(&state.pool).await?;
    Ok(Json(Value::Array(
        rows.into_iter().map(summary).collect::<ApiResult<_>>()?,
    )))
}
#[derive(Default, Deserialize)]
struct Create {
    content: Option<Content>,
    visibility: Option<String>,
}
fn check_visibility(value: &str) -> ApiResult<()> {
    if matches!(value, "public" | "private") {
        Ok(())
    } else {
        Err(ApiError::bad_request(
            "La visibilidad debe ser pública o privada.",
        ))
    }
}

pub async fn validate_logo(
    tx: &mut Transaction<'_, Postgres>,
    user: Uuid,
    content: &Content,
) -> ApiResult<()> {
    if content.logo_id.is_empty() {
        return Ok(());
    }
    let id =
        Uuid::parse_str(&content.logo_id).map_err(|_| ApiError::bad_request("Logo inválido."))?;
    let allowed:bool=sqlx::query_scalar(r#"SELECT EXISTS(SELECT 1 FROM app.assets a WHERE a.id=$1 AND (a.owner_id=$2 OR EXISTS(
        SELECT 1 FROM app.lists l LEFT JOIN app.grants g ON g.list_id=l.id AND g.user_id=$2
        WHERE l.deleted_at IS NULL AND ((l.owner_id=$2 OR g.role='editor') AND (lower(l.draft->>'logo_id')=$1::text OR EXISTS(
            SELECT 1 FROM app.versions v WHERE v.list_id=l.id AND lower(v.content->>'logo_id')=$1::text))
        OR NOT l.hidden AND l.visibility='public' AND EXISTS(SELECT 1 FROM app.versions v WHERE v.list_id=l.id AND lower(v.content->>'logo_id')=$1::text)))))"#)
        .bind(id).bind(user).fetch_one(&mut **tx).await?;
    if !allowed {
        return Err(ApiError::bad_request(
            "El logo no existe o no tienes acceso a él.",
        ));
    }
    Ok(())
}
pub async fn create_owned(
    tx: &mut Transaction<'_, Postgres>,
    user: Uuid,
    content: &Content,
    visibility: &str,
) -> ApiResult<Uuid> {
    let content = canonical_content(content.clone())?;
    validate_content(&content, false)?;
    check_visibility(visibility)?;
    validate_logo(tx, user, &content).await?;
    let id:Uuid=sqlx::query_scalar("INSERT INTO app.lists(owner_id,creator_id,draft,visibility) VALUES($1,$1,$2,$3) RETURNING id")
        .bind(user).bind(content_value(&content)?).bind(visibility).fetch_one(&mut **tx).await?;
    sqlx::query("INSERT INTO app.request_links(list_id) VALUES($1)")
        .bind(id)
        .execute(&mut **tx)
        .await?;
    Ok(id)
}
async fn create(
    State(state): State<AppState>,
    user: User,
    Json(input): Json<Create>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let id = create_owned(
        &mut tx,
        user.id,
        &input.content.unwrap_or_default(),
        input.visibility.as_deref().unwrap_or("public"),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"id":id})))
}
async fn detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Query(query): Query<VersionQuery>,
) -> ApiResult<Json<Value>> {
    let user = optional_user(&state, &headers).await?.map(|u| u.id);
    let mut tx = state.pool.begin().await?;
    let list = access_tx(&mut tx, id, user).await?;
    if !list.can_read() {
        return Err(ApiError::not_found());
    }
    let number = query.version.unwrap_or(list.current_version);
    let row =
        sqlx::query("SELECT content,published_at FROM app.versions WHERE list_id=$1 AND number=$2")
            .bind(id)
            .bind(number)
            .fetch_one(&mut *tx)
            .await?;
    let owner_name: Option<String> =
        sqlx::query_scalar("SELECT display_name FROM app.users WHERE id=$1")
            .bind(list.owner_id)
            .fetch_optional(&mut *tx)
            .await?;
    let votes: i64 =
        sqlx::query_scalar("SELECT count(*) FROM app.votes WHERE list_id=$1 AND version=$2")
            .bind(id)
            .bind(number)
            .fetch_one(&mut *tx)
            .await?;
    let voted: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM app.votes WHERE list_id=$1 AND version=$2 AND user_id=$3)",
    )
    .bind(id)
    .bind(number)
    .bind(user)
    .fetch_one(&mut *tx)
    .await?;
    let following: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM app.follows WHERE list_id=$1 AND user_id=$2)",
    )
    .bind(id)
    .bind(user)
    .fetch_one(&mut *tx)
    .await?;
    let versions = sqlx::query(
        "SELECT number,published_at FROM app.versions WHERE list_id=$1 ORDER BY number DESC",
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;
    let versions:Vec<Value>=versions.into_iter().map(|r|Ok(json!({"number":r.try_get::<i32,_>("number")?,"published_at":r.try_get::<chrono::DateTime<chrono::Utc>,_>("published_at")?}))).collect::<ApiResult<_>>()?;
    tx.commit().await?;
    Ok(Json(
        json!({"id":id,"owner_id":list.owner_id,"owner_name":owner_name.unwrap_or_else(||"Usuario eliminado".into()),"visibility":list.visibility,
        "archived":list.archived,"hidden":list.hidden,"comments_enabled":list.comments_enabled,"current_version":list.current_version,"version":number,
        "published_at":row.try_get::<chrono::DateTime<chrono::Utc>,_>("published_at")?,"content":row.try_get::<Value,_>("content")?,"role":list.role,
        "votes":votes,"voted":voted,"following":following,"versions":versions}),
    ))
}
async fn draft(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let list = access_tx(&mut tx, id, Some(user.id)).await?;
    if !list.can_view_draft() {
        return Err(ApiError::not_found());
    }
    tx.commit().await?;
    Ok(Json(
        json!({"id":id,"content":list.draft,"revision":list.draft_revision,"current_version":list.current_version,
        "visibility":list.visibility,"archived":list.archived,"hidden":list.hidden,"comments_enabled":list.comments_enabled,"role":list.role}),
    ))
}
#[derive(Deserialize)]
struct Save {
    content: Content,
    revision: i64,
}
async fn save_draft(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
    Json(input): Json<Save>,
) -> ApiResult<Json<Value>> {
    let content = canonical_content(input.content)?;
    validate_content(&content, false)?;
    let mut tx = state.pool.begin().await?;
    let list = access_tx(&mut tx, id, Some(user.id)).await?;
    if !list.can_edit() {
        return Err(ApiError::forbidden());
    }
    if list.draft_revision != input.revision {
        return Err(ApiError::conflict(
            "Otra persona guardó cambios. Revisa la versión actual antes de volver a guardar.",
        ));
    }
    validate_logo(&mut tx, user.id, &content).await?;
    let revision:i64=sqlx::query_scalar("UPDATE app.lists SET draft=$2,draft_revision=draft_revision+1,updated_at=now() WHERE id=$1 RETURNING draft_revision").bind(id).bind(content_value(&content)?).fetch_one(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(json!({"revision":revision})))
}

pub async fn request_result(
    tx: &mut Transaction<'_, Postgres>,
    user: Uuid,
    id: Uuid,
    operation: &str,
    request: Uuid,
    payload: &Value,
) -> ApiResult<Option<Value>> {
    let row=sqlx::query("SELECT payload,response FROM app.requests WHERE actor_id=$1 AND list_id=$2 AND operation=$3 AND request_id=$4")
        .bind(user).bind(id).bind(operation).bind(request).fetch_optional(&mut **tx).await?;
    if let Some(row) = row {
        if row.try_get::<Value, _>("payload")? != *payload {
            return Err(ApiError::conflict(
                "Este identificador ya se usó para una solicitud diferente.",
            ));
        }
        return Ok(Some(row.try_get("response")?));
    }
    Ok(None)
}
pub async fn remember_request(
    tx: &mut Transaction<'_, Postgres>,
    user: Uuid,
    id: Uuid,
    operation: &str,
    request: Uuid,
    payload: &Value,
    response: &Value,
) -> ApiResult<()> {
    sqlx::query("INSERT INTO app.requests(actor_id,list_id,operation,request_id,payload,response) VALUES($1,$2,$3,$4,$5,$6)")
        .bind(user).bind(id).bind(operation).bind(request).bind(payload).bind(response).execute(&mut **tx).await?;
    Ok(())
}
#[derive(Deserialize, Serialize)]
struct Publish {
    revision: i64,
    current_version: i32,
    request_id: Uuid,
}
async fn publish(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
    Json(input): Json<Publish>,
) -> ApiResult<Json<Value>> {
    let payload = serde_json::to_value(&input).map_err(ApiError::internal)?;
    let mut tx = state.pool.begin().await?;
    let list = access_tx(&mut tx, id, Some(user.id)).await?;
    if !list.can_edit() || list.hidden {
        return Err(ApiError::forbidden());
    }
    if let Some(result) =
        request_result(&mut tx, user.id, id, "publish", input.request_id, &payload).await?
    {
        return Ok(Json(result));
    }
    if list.draft_revision != input.revision || list.current_version != input.current_version {
        return Err(ApiError::conflict(
            "La lista cambió desde tu revisión. Revisa el borrador antes de publicar.",
        ));
    }
    let content = parse_content(list.draft.clone())?;
    validate_content(&content, true)?;
    validate_logo(&mut tx, user.id, &content).await?;
    let previous: Option<Value> =
        sqlx::query_scalar("SELECT content FROM app.versions WHERE list_id=$1 AND number=$2")
            .bind(id)
            .bind(list.current_version)
            .fetch_optional(&mut *tx)
            .await?;
    let number = if previous.as_ref() == Some(&list.draft) {
        list.current_version
    } else {
        let number = list.current_version + 1;
        sqlx::query(
            "INSERT INTO app.versions(list_id,number,content,published_by) VALUES($1,$2,$3,$4)",
        )
        .bind(id)
        .bind(number)
        .bind(&list.draft)
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
        sqlx::query("UPDATE app.lists SET current_version=$2,draft_revision=draft_revision+1,updated_at=now() WHERE id=$1").bind(id).bind(number).execute(&mut *tx).await?;
        sqlx::query(r#"INSERT INTO app.notifications(list_id,version,user_id,status)
            SELECT $1,$2,f.user_id,'local' FROM app.follows f JOIN app.users u ON u.id=f.user_id
            WHERE f.list_id=$1 AND u.verified AND ($3='public' OR f.user_id=$4 OR EXISTS(
                SELECT 1 FROM app.grants g WHERE g.list_id=$1 AND g.user_id=f.user_id)) ON CONFLICT DO NOTHING"#)
            .bind(id).bind(number).bind(&list.visibility).bind(list.owner_id).execute(&mut *tx).await?;
        number
    };
    let result = json!({"version":number});
    remember_request(
        &mut tx,
        user.id,
        id,
        "publish",
        input.request_id,
        &payload,
        &result,
    )
    .await?;
    tx.commit().await?;
    Ok(Json(result))
}
#[derive(Deserialize)]
struct Settings {
    visibility: Option<String>,
    comments_enabled: Option<bool>,
}
async fn settings(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
    Json(input): Json<Settings>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let list = access_tx(&mut tx, id, Some(user.id)).await?;
    if !(list.is_owner() || list.can_edit()) || input.comments_enabled.is_some() && !list.is_owner()
    {
        return Err(ApiError::forbidden());
    }
    let visibility = input.visibility.unwrap_or(list.visibility);
    check_visibility(&visibility)?;
    sqlx::query(
        "UPDATE app.lists SET visibility=$2,comments_enabled=$3,updated_at=now() WHERE id=$1",
    )
    .bind(id)
    .bind(&visibility)
    .bind(input.comments_enabled.unwrap_or(list.comments_enabled))
    .execute(&mut *tx)
    .await?;
    if visibility == "private" {
        sqlx::query("UPDATE app.notifications SET status='canceled' WHERE list_id=$1 AND status IN ('local','pending') AND user_id IS DISTINCT FROM $2 AND NOT EXISTS(SELECT 1 FROM app.grants g WHERE g.list_id=$1 AND g.user_id=app.notifications.user_id)").bind(id).bind(list.owner_id).execute(&mut *tx).await?;
        sqlx::query("DELETE FROM app.follows WHERE list_id=$1 AND user_id IS DISTINCT FROM $2 AND NOT EXISTS(SELECT 1 FROM app.grants g WHERE g.list_id=$1 AND g.user_id=app.follows.user_id)").bind(id).bind(list.owner_id).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}
#[derive(Deserialize)]
struct Archive {
    archived: bool,
}
async fn archive(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
    Json(input): Json<Archive>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let list = access_tx(&mut tx, id, Some(user.id)).await?;
    if !list.is_owner() {
        return Err(ApiError::forbidden());
    }
    sqlx::query("UPDATE app.lists SET draft_revision=draft_revision+CASE WHEN archived IS DISTINCT FROM $2 THEN 1 ELSE 0 END,archived=$2,updated_at=now() WHERE id=$1").bind(id).bind(input.archived).execute(&mut *tx).await?;
    if input.archived {
        sqlx::query("UPDATE app.notifications SET status='canceled' WHERE list_id=$1 AND status IN ('local','pending')").bind(id).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}
async fn delete_list(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let list = access_tx(&mut tx, id, Some(user.id)).await?;
    if !list.is_owner() {
        return Err(ApiError::forbidden());
    }
    let draft_logo = list
        .draft
        .get("logo_id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_lowercase();
    sqlx::query("UPDATE app.lists SET deleted_at=now(),draft='{}',draft_revision=draft_revision+1 WHERE id=$1").bind(id).execute(&mut *tx).await?;
    sqlx::query("UPDATE app.notifications SET status='canceled' WHERE list_id=$1 AND status IN ('local','pending')").bind(id).execute(&mut *tx).await?;
    for table in [
        "imports",
        "invitations",
        "request_links",
        "follows",
        "progress",
    ] {
        sqlx::query(&format!("DELETE FROM app.{table} WHERE list_id=$1"))
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query("UPDATE app.transfers SET status='canceled' WHERE list_id=$1 AND status='pending'")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(r#"DELETE FROM app.assets a WHERE
        (a.id::text=$2 OR EXISTS(SELECT 1 FROM app.versions v WHERE v.list_id=$1 AND lower(v.content->>'logo_id')=a.id::text))
        AND NOT EXISTS(SELECT 1 FROM app.lists l WHERE l.deleted_at IS NULL AND
            (lower(l.draft->>'logo_id')=a.id::text OR EXISTS(SELECT 1 FROM app.versions v WHERE v.list_id=l.id AND lower(v.content->>'logo_id')=a.id::text)))"#)
        .bind(id).bind(draft_logo).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}
async fn copy_list(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
    Json(query): Json<VersionQuery>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let list = access_tx(&mut tx, id, Some(user.id)).await?;
    if !list.is_owner() && (!list.can_read() || list.visibility != "public") {
        return Err(ApiError::not_found());
    }
    if list.hidden {
        return Err(ApiError::forbidden());
    }
    let content = if list.current_version == 0 && list.is_owner() {
        parse_content(list.draft)?
    } else {
        parse_content(
            sqlx::query_scalar("SELECT content FROM app.versions WHERE list_id=$1 AND number=$2")
                .bind(id)
                .bind(query.version.unwrap_or(list.current_version))
                .fetch_one(&mut *tx)
                .await?,
        )?
    };
    let new = create_owned(&mut tx, user.id, &copied_content(content), &list.visibility).await?;
    tx.commit().await?;
    Ok(Json(json!({"id":new})))
}
async fn templates(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let rows = sqlx::query(
        "SELECT id,name,grade,content FROM app.templates WHERE active ORDER BY grade,name",
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(Value::Array(rows.into_iter().map(|r|Ok(json!({"id":r.try_get::<Uuid,_>("id")?,"name":r.try_get::<String,_>("name")?,"grade":r.try_get::<String,_>("grade")?,"content":r.try_get::<Value,_>("content")?}))).collect::<ApiResult<_>>()?)))
}
async fn copy_template(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let value: Value =
        sqlx::query_scalar("SELECT content FROM app.templates WHERE id=$1 AND active")
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
    let content = copied_content(parse_content(value)?);
    let id = create_owned(&mut tx, user.id, &content, "public").await?;
    tx.commit().await?;
    Ok(Json(json!({"id":id})))
}

pub async fn progress_tx(
    tx: &mut Transaction<'_, Postgres>,
    user: Uuid,
    list: &ListAccess,
    number: i32,
    update: Option<(Uuid, ProgressState)>,
) -> ApiResult<Value> {
    if !list.can_read() || number < 1 || number > list.current_version {
        return Err(ApiError::not_found());
    }
    let rows = sqlx::query(
        "SELECT number,content FROM app.versions WHERE list_id=$1 AND number<=$2 ORDER BY number",
    )
    .bind(list.id)
    .bind(number)
    .fetch_all(&mut **tx)
    .await?;
    let versions: Vec<(i32, Content)> = rows
        .into_iter()
        .map(|r| Ok((r.try_get("number")?, parse_content(r.try_get("content")?)?)))
        .collect::<ApiResult<_>>()?;
    if versions.last().map(|v| v.0) != Some(number) {
        return Err(ApiError::not_found());
    }
    let viewed:Option<i32>=sqlx::query_scalar("SELECT version FROM app.progress WHERE list_id=$1 AND user_id=$2 ORDER BY updated_at DESC,version DESC LIMIT 1").bind(list.id).bind(user).fetch_optional(&mut **tx).await?;
    let stored = sqlx::query(
        "SELECT version,items FROM app.progress WHERE list_id=$1 AND user_id=$2 AND version<=$3",
    )
    .bind(list.id)
    .bind(user)
    .bind(number)
    .fetch_all(&mut **tx)
    .await?;
    let mut states = BTreeMap::<i32, Progress>::new();
    for row in stored {
        states.insert(
            row.try_get("version")?,
            serde_json::from_value(row.try_get("items")?).map_err(ApiError::internal)?,
        );
    }
    let mut previous = None;
    let mut state = Progress::new();
    for (version, content) in &versions {
        state = if let Some(saved) = states.get(version) {
            saved.clone()
        } else {
            let next = migrate_progress(previous, content, &state);
            sqlx::query("INSERT INTO app.progress(user_id,list_id,version,items) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING").bind(user).bind(list.id).bind(*version).bind(serde_json::to_value(&next).map_err(ApiError::internal)?).execute(&mut **tx).await?;
            next
        };
        previous = Some(content);
    }
    if let Some((id, value)) = update {
        let Some(entry) = state.get_mut(&id) else {
            return Err(ApiError::bad_request(
                "Este artículo no pertenece a la versión seleccionada.",
            ));
        };
        *entry = value;
    }
    let items = serde_json::to_value(&state).map_err(ApiError::internal)?;
    sqlx::query("UPDATE app.progress SET items=$4,updated_at=clock_timestamp() WHERE user_id=$1 AND list_id=$2 AND version=$3").bind(user).bind(list.id).bind(number).bind(&items).execute(&mut **tx).await?;
    let since = viewed.unwrap_or(number);
    let mut added = BTreeSet::<String>::new();
    let mut changed = BTreeSet::<String>::new();
    let mut removed = BTreeSet::<String>::new();
    let mut details = false;
    if since < number {
        for pair in versions.windows(2).filter(|p| p[1].0 > since) {
            let diff = content_changes(Some(&pair[0].1), &pair[1].1);
            for (key, set) in [
                ("added", &mut added),
                ("changed", &mut changed),
                ("removed", &mut removed),
            ] {
                for item in diff[key].as_array().into_iter().flatten() {
                    if let Some(id) = item.as_str() {
                        set.insert(id.to_string());
                    }
                }
            }
            details |= diff["details_changed"].as_bool().unwrap_or(false);
        }
    }
    Ok(
        json!({"version":number,"items":items,"changes":{"added":added,"changed":changed,"removed":removed,"details_changed":details}}),
    )
}
async fn get_progress(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
    Query(query): Query<VersionQuery>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let list = access_tx(&mut tx, id, Some(user.id)).await?;
    let result = progress_tx(
        &mut tx,
        user.id,
        &list,
        query.version.unwrap_or(list.current_version),
        None,
    )
    .await?;
    tx.commit().await?;
    Ok(Json(result))
}
#[derive(Deserialize)]
struct UpdateProgress {
    version: i32,
    item_id: Uuid,
    checked: bool,
    review: bool,
}
async fn put_progress(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateProgress>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let list = access_tx(&mut tx, id, Some(user.id)).await?;
    let result = progress_tx(
        &mut tx,
        user.id,
        &list,
        input.version,
        Some((
            input.item_id,
            ProgressState {
                checked: input.checked,
                review: input.review,
            },
        )),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(result))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn visibility_lifecycle_and_draft_permissions_are_independent() {
        let mut list = ListAccess {
            id: Uuid::new_v4(),
            owner_id: Some(Uuid::new_v4()),
            visibility: "private".into(),
            archived: false,
            hidden: true,
            comments_enabled: true,
            current_version: 1,
            draft_revision: 1,
            draft: json!({}),
            role: "editor".into(),
        };
        assert!(list.can_edit());
        assert!(list.can_view_draft());
        assert!(!list.can_read());
        list.hidden = false;
        list.archived = true;
        assert!(list.can_read());
        assert!(!list.can_edit());
        list.role = "viewer".into();
        assert!(list.can_read());
        assert!(!list.can_view_draft());
        list.role.clear();
        assert!(!list.can_read());
        list.visibility = "public".into();
        list.owner_id = None;
        assert!(list.can_read());
        assert!(!list.is_owner());
        list.current_version = 0;
        assert!(!list.can_read());
    }
}
