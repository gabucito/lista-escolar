use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::HeaderMap,
    routing::{delete, get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

use crate::{
    AppState,
    auth::{self, User},
    catalog::checked_text,
    error::{ApiError, ApiResult},
    lists::{self, ListAccess},
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/lists/{id}/vote", post(vote))
        .route("/lists/{id}/comments", get(comments).post(comment))
        .route("/comments/{id}", delete(delete_comment))
        .route("/lists/{id}/follow", post(follow))
        .route("/lists/{id}/reports", post(report))
        .route("/lists/{id}/access", get(access).post(invite))
        .route("/lists/{id}/access/{user_id}", delete(revoke))
        .route(
            "/lists/{id}/invitations/{invitation_id}",
            delete(cancel_invitation),
        )
        .route("/invitations/{token}/accept", post(accept_invitation))
        .route("/access-requests/{token}", post(request_access))
        .route("/lists/{id}/requests/{request_id}", post(decide_request))
        .route("/lists/{id}/transfer", post(offer_transfer))
        .route("/transfers", get(transfers))
        .route("/transfers/{id}/accept", post(accept_transfer))
        .route("/transfers/{id}", delete(cancel_transfer))
}

fn readable(list: &ListAccess) -> ApiResult<()> {
    if !list.can_read() {
        return Err(ApiError::not_found());
    }
    Ok(())
}

fn manager(list: &ListAccess) -> ApiResult<()> {
    if !(list.is_owner() || list.can_edit()) {
        return Err(ApiError::forbidden());
    }
    Ok(())
}

fn active(list: &ListAccess) -> ApiResult<()> {
    readable(list)?;
    if list.archived {
        return Err(ApiError::conflict("Esta lista está archivada"));
    }
    Ok(())
}

pub async fn audit(
    tx: &mut Transaction<'_, Postgres>,
    actor: Uuid,
    action: &str,
    entity: Uuid,
    details: Value,
) -> ApiResult<()> {
    sqlx::query("INSERT INTO app.audit(actor_id,action,entity_id,details) VALUES($1,$2,$3,$4)")
        .bind(actor)
        .bind(action)
        .bind(entity)
        .bind(details)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

async fn version_exists(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    version: i32,
) -> ApiResult<()> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM app.versions WHERE list_id=$1 AND number=$2)",
    )
    .bind(id)
    .bind(version)
    .fetch_one(&mut **tx)
    .await?;
    if !exists {
        return Err(ApiError::not_found());
    }
    Ok(())
}

#[derive(Deserialize)]
struct Vote {
    voted: bool,
    version: i32,
}
async fn vote(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
    Json(input): Json<Vote>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let list = lists::access_tx(&mut tx, id, Some(user.id)).await?;
    readable(&list)?;
    if input.voted {
        active(&list)?;
    }
    version_exists(&mut tx, id, input.version).await?;
    if input.voted {
        sqlx::query("INSERT INTO app.votes(list_id,version,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
            .bind(id).bind(input.version).bind(user.id).execute(&mut *tx).await?;
    } else {
        sqlx::query("DELETE FROM app.votes WHERE list_id=$1 AND version=$2 AND user_id=$3")
            .bind(id)
            .bind(input.version)
            .bind(user.id)
            .execute(&mut *tx)
            .await?;
    }
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM app.votes WHERE list_id=$1 AND version=$2")
            .bind(id)
            .bind(input.version)
            .fetch_one(&mut *tx)
            .await?;
    tx.commit().await?;
    Ok(Json(json!({"votes":count,"voted":input.voted})))
}

#[derive(Deserialize)]
struct VersionQuery {
    version: Option<i32>,
}
async fn comments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Query(query): Query<VersionQuery>,
) -> ApiResult<Json<Value>> {
    let user = auth::optional_user(&state, &headers).await?;
    let mut tx = state.pool.begin().await?;
    let list = lists::access_tx(&mut tx, id, user.map(|u| u.id)).await?;
    readable(&list)?;
    let version = query.version.unwrap_or(list.current_version);
    version_exists(&mut tx, id, version).await?;
    let rows = sqlx::query_scalar::<_, Value>(
        r#"SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (
      SELECT c.id,CASE WHEN c.deleted THEN 'Comentario eliminado' ELSE c.body END AS body,
      CASE WHEN c.deleted THEN NULL ELSE u.display_name END AS author,
      CASE WHEN c.deleted THEN NULL ELSE c.user_id END AS user_id,c.created_at,c.deleted
      FROM app.comments c LEFT JOIN app.users u ON u.id=c.user_id
      WHERE c.list_id=$1 AND c.version=$2 ORDER BY c.created_at,c.id) x"#,
    )
    .bind(id)
    .bind(version)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct Comment {
    version: i32,
    body: String,
}
async fn comment(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
    Json(input): Json<Comment>,
) -> ApiResult<Json<Value>> {
    let body = checked_text(&input.body, 3000, "Comentario")?;
    let mut tx = state.pool.begin().await?;
    let list = lists::access_tx(&mut tx, id, Some(user.id)).await?;
    active(&list)?;
    if !list.comments_enabled {
        return Err(ApiError::forbidden());
    }
    version_exists(&mut tx, id, input.version).await?;
    let comment_id: Uuid = sqlx::query_scalar(
        "INSERT INTO app.comments(list_id,version,user_id,body) VALUES($1,$2,$3,$4) RETURNING id",
    )
    .bind(id)
    .bind(input.version)
    .bind(user.id)
    .bind(body)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"id":comment_id})))
}

pub async fn erase_comment(tx: &mut Transaction<'_, Postgres>, id: Uuid) -> ApiResult<()> {
    sqlx::query("UPDATE app.comments SET deleted=true,body='',user_id=NULL WHERE id=$1")
        .bind(id)
        .execute(&mut **tx)
        .await?;
    sqlx::query("UPDATE app.reports SET evidence='{}'::jsonb,reason='' WHERE comment_id=$1")
        .bind(id)
        .execute(&mut **tx)
        .await?;
    Ok(())
}

async fn delete_comment(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let list_id: Uuid = sqlx::query_scalar("SELECT list_id FROM app.comments WHERE id=$1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(ApiError::not_found)?;
    let mut tx = state.pool.begin().await?;
    let list = lists::access_tx(&mut tx, list_id, Some(user.id)).await?;
    let author: Option<Uuid> =
        sqlx::query_scalar("SELECT user_id FROM app.comments WHERE id=$1 AND list_id=$2")
            .bind(id)
            .bind(list_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(ApiError::not_found)?;
    if author != Some(user.id) && !list.is_owner() {
        return Err(ApiError::forbidden());
    }
    erase_comment(&mut tx, id).await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

#[derive(Deserialize)]
struct Follow {
    following: bool,
}
async fn follow(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
    Json(input): Json<Follow>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let list = lists::access_tx(&mut tx, id, Some(user.id)).await?;
    if input.following {
        active(&list)?;
        sqlx::query(
            "INSERT INTO app.follows(list_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        )
        .bind(id)
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    } else {
        cancel_follow(&mut tx, id, user.id).await?;
    }
    tx.commit().await?;
    Ok(Json(json!({"following":input.following})))
}

async fn cancel_follow(tx: &mut Transaction<'_, Postgres>, id: Uuid, user: Uuid) -> ApiResult<()> {
    sqlx::query("DELETE FROM app.follows WHERE list_id=$1 AND user_id=$2")
        .bind(id)
        .bind(user)
        .execute(&mut **tx)
        .await?;
    sqlx::query("UPDATE app.notifications SET status='canceled' WHERE list_id=$1 AND user_id=$2 AND status IN ('local','pending','failed')")
        .bind(id).bind(user).execute(&mut **tx).await?;
    Ok(())
}

#[derive(Deserialize)]
struct Report {
    version: i32,
    comment_id: Option<Uuid>,
    reason: String,
    kind: String,
}
async fn report(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
    Json(input): Json<Report>,
) -> ApiResult<Json<Value>> {
    let reason = checked_text(&input.reason, 3000, "Motivo")?;
    if !["content", "privacy"].contains(&input.kind.as_str()) {
        return Err(ApiError::bad_request("Tipo de reporte inválido"));
    }
    let mut tx = state.pool.begin().await?;
    let list = lists::access_tx(&mut tx, id, Some(user.id)).await?;
    readable(&list)?;
    let content: Value =
        sqlx::query_scalar("SELECT content FROM app.versions WHERE list_id=$1 AND number=$2")
            .bind(id)
            .bind(input.version)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(ApiError::not_found)?;
    let evidence = if let Some(comment_id) = input.comment_id {
        let body:String=sqlx::query_scalar("SELECT body FROM app.comments WHERE id=$1 AND list_id=$2 AND version=$3 AND NOT deleted")
            .bind(comment_id).bind(id).bind(input.version).fetch_optional(&mut *tx).await?.ok_or_else(ApiError::not_found)?;
        json!({"comment_id":comment_id,"body":body,"school":content.get("school"),"class_name":content.get("class_name")})
    } else {
        json!({"content":content})
    };
    let report_id:Uuid=sqlx::query_scalar("INSERT INTO app.reports(list_id,version,comment_id,user_id,reason,kind,evidence) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id")
        .bind(id).bind(input.version).bind(input.comment_id).bind(user.id).bind(reason).bind(input.kind).bind(evidence).fetch_one(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(json!({"id":report_id})))
}

async fn access(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let list = lists::access_tx(&mut tx, id, Some(user.id)).await?;
    manager(&list)?;
    let grants:Value=sqlx::query_scalar("SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT g.user_id,u.email,u.display_name,g.role FROM app.grants g JOIN app.users u ON u.id=g.user_id WHERE g.list_id=$1 ORDER BY u.display_name) x").bind(id).fetch_one(&mut *tx).await?;
    let invitations:Value=sqlx::query_scalar("SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT id,email,role,expires_at FROM app.invitations WHERE list_id=$1 AND accepted_at IS NULL AND expires_at>now() ORDER BY created_at) x").bind(id).fetch_one(&mut *tx).await?;
    let requests:Value=sqlx::query_scalar("SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT r.id,u.email,u.display_name FROM app.access_requests r JOIN app.users u ON u.id=r.user_id WHERE r.list_id=$1 AND r.status='pending' ORDER BY r.created_at) x").bind(id).fetch_one(&mut *tx).await?;
    let transfers:Value=sqlx::query_scalar("SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (SELECT t.id,t.recipient_id,u.display_name AS recipient_name,t.expires_at FROM app.transfers t JOIN app.users u ON u.id=t.recipient_id WHERE t.list_id=$1 AND t.status='pending' AND t.expires_at>now()) x").bind(id).fetch_one(&mut *tx).await?;
    let token: Option<Uuid> =
        sqlx::query_scalar("SELECT token FROM app.request_links WHERE list_id=$1")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?;
    tx.commit().await?;
    Ok(Json(
        json!({"grants":grants,"invitations":invitations,"requests":requests,"transfers":transfers,"request_link":token.map(|t|format!("/solicitar-acceso/{t}")).unwrap_or_default()}),
    ))
}

fn role(role: &str) -> ApiResult<()> {
    if !["viewer", "editor"].contains(&role) {
        return Err(ApiError::bad_request("Permiso inválido"));
    }
    Ok(())
}
fn email(email: &str) -> ApiResult<String> {
    let value = email.trim().to_lowercase();
    if value.len() > 254
        || value.contains(char::is_whitespace)
        || value.split('@').count() != 2
        || value.starts_with('@')
        || value.ends_with('@')
    {
        return Err(ApiError::bad_request("Correo inválido"));
    }
    Ok(value)
}

#[derive(Deserialize)]
struct Invitation {
    email: String,
    role: String,
}
async fn invite(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
    Json(input): Json<Invitation>,
) -> ApiResult<Json<Value>> {
    role(&input.role)?;
    let email = email(&input.email)?;
    let mut tx = state.pool.begin().await?;
    let list = lists::access_tx(&mut tx, id, Some(user.id)).await?;
    manager(&list)?;
    let owner_email: Option<String> = sqlx::query_scalar("SELECT email FROM app.users WHERE id=$1")
        .bind(list.owner_id)
        .fetch_optional(&mut *tx)
        .await?;
    if owner_email.as_deref() == Some(&email) {
        return Err(ApiError::bad_request("El propietario ya tiene acceso"));
    }
    sqlx::query(
        "DELETE FROM app.invitations WHERE list_id=$1 AND email=$2 AND accepted_at IS NULL",
    )
    .bind(id)
    .bind(&email)
    .execute(&mut *tx)
    .await?;
    let row=sqlx::query("INSERT INTO app.invitations(list_id,email,role,invited_by) VALUES($1,$2,$3,$4) RETURNING id,token")
        .bind(id).bind(email).bind(input.role).bind(user.id).fetch_one(&mut *tx).await?;
    let invitation_id: Uuid = row.try_get("id")?;
    let token: Uuid = row.try_get("token")?;
    audit(
        &mut tx,
        user.id,
        "invitation_created",
        id,
        json!({"invitation_id":invitation_id}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"id":invitation_id,"invitation_token":token})))
}

async fn revoke(
    State(state): State<AppState>,
    user: User,
    Path((id, target)): Path<(Uuid, Uuid)>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let list = lists::access_tx(&mut tx, id, Some(user.id)).await?;
    manager(&list)?;
    if list.owner_id == Some(target) {
        return Err(ApiError::forbidden());
    }
    sqlx::query("DELETE FROM app.grants WHERE list_id=$1 AND user_id=$2")
        .bind(id)
        .bind(target)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM app.invitations WHERE list_id=$1 AND email=(SELECT email FROM app.users WHERE id=$2) AND accepted_at IS NULL")
        .bind(id).bind(target).execute(&mut *tx).await?;
    sqlx::query("UPDATE app.access_requests SET status='rejected' WHERE list_id=$1 AND user_id=$2 AND status='pending'")
        .bind(id).bind(target).execute(&mut *tx).await?;
    sqlx::query("UPDATE app.transfers SET status='canceled' WHERE list_id=$1 AND recipient_id=$2 AND status='pending'").bind(id).bind(target).execute(&mut *tx).await?;
    if list.visibility == "private" {
        cancel_follow(&mut tx, id, target).await?;
    }
    audit(
        &mut tx,
        user.id,
        "access_revoked",
        id,
        json!({"user_id":target}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

async fn cancel_invitation(
    State(state): State<AppState>,
    user: User,
    Path((id, invitation)): Path<(Uuid, Uuid)>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let list = lists::access_tx(&mut tx, id, Some(user.id)).await?;
    manager(&list)?;
    sqlx::query("DELETE FROM app.invitations WHERE list_id=$1 AND id=$2 AND accepted_at IS NULL")
        .bind(id)
        .bind(invitation)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

async fn accept_invitation(
    State(state): State<AppState>,
    user: User,
    Path(token): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let id: Uuid = sqlx::query_scalar("SELECT list_id FROM app.invitations WHERE token=$1")
        .bind(token)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(ApiError::not_found)?;
    let mut tx = state.pool.begin().await?;
    let list = lists::access_tx(&mut tx, id, Some(user.id)).await?;
    if list.owner_id.is_none() {
        return Err(ApiError::not_found());
    }
    let invitation=sqlx::query("SELECT i.id,i.role FROM app.invitations i JOIN app.users u ON u.id=$3 WHERE i.token=$1 AND i.list_id=$2 AND i.email=u.email AND u.verified AND i.expires_at>now() AND i.accepted_at IS NULL FOR UPDATE OF i")
        .bind(token).bind(id).bind(user.id).fetch_optional(&mut *tx).await?.ok_or_else(||ApiError::bad_request("Invitación vencida, utilizada o destinada a otro correo"))?;
    if list.owner_id != Some(user.id) {
        sqlx::query("INSERT INTO app.grants(list_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(list_id,user_id) DO UPDATE SET role=excluded.role")
            .bind(id).bind(user.id).bind(invitation.try_get::<String,_>("role")?).execute(&mut *tx).await?;
    }
    sqlx::query("UPDATE app.invitations SET accepted_at=now() WHERE id=$1")
        .bind(invitation.try_get::<Uuid, _>("id")?)
        .execute(&mut *tx)
        .await?;
    audit(&mut tx, user.id, "invitation_accepted", id, json!({})).await?;
    tx.commit().await?;
    Ok(Json(json!({"list_id":id})))
}

async fn request_access(
    State(state): State<AppState>,
    user: User,
    Path(token): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let id: Uuid = sqlx::query_scalar("SELECT list_id FROM app.request_links WHERE token=$1")
        .bind(token)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(ApiError::not_found)?;
    let mut tx = state.pool.begin().await?;
    let list = lists::access_tx(&mut tx, id, Some(user.id)).await?;
    if list.owner_id.is_none() || list.hidden || list.archived {
        return Err(ApiError::not_found());
    }
    if list.role.is_empty() && list.visibility == "private" {
        sqlx::query("INSERT INTO app.access_requests(list_id,user_id) VALUES($1,$2) ON CONFLICT(list_id,user_id) DO UPDATE SET status='pending',created_at=now()")
            .bind(id).bind(user.id).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

#[derive(Deserialize)]
struct Decision {
    approve: bool,
    #[serde(default = "viewer")]
    role: String,
}
fn viewer() -> String {
    "viewer".into()
}
async fn decide_request(
    State(state): State<AppState>,
    user: User,
    Path((id, request)): Path<(Uuid, Uuid)>,
    Json(input): Json<Decision>,
) -> ApiResult<Json<Value>> {
    role(&input.role)?;
    let mut tx = state.pool.begin().await?;
    let list = lists::access_tx(&mut tx, id, Some(user.id)).await?;
    manager(&list)?;
    let target:Uuid=sqlx::query_scalar("SELECT user_id FROM app.access_requests WHERE id=$1 AND list_id=$2 AND status='pending' FOR UPDATE")
        .bind(request).bind(id).fetch_optional(&mut *tx).await?.ok_or_else(ApiError::not_found)?;
    if input.approve && list.owner_id != Some(target) {
        sqlx::query("INSERT INTO app.grants(list_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(list_id,user_id) DO UPDATE SET role=excluded.role")
            .bind(id).bind(target).bind(&input.role).execute(&mut *tx).await?;
    }
    sqlx::query("UPDATE app.access_requests SET status=$2 WHERE id=$1")
        .bind(request)
        .bind(if input.approve {
            "approved"
        } else {
            "rejected"
        })
        .execute(&mut *tx)
        .await?;
    audit(
        &mut tx,
        user.id,
        "access_request_decided",
        id,
        json!({"request_id":request,"approved":input.approve}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

#[derive(Deserialize)]
struct Transfer {
    recipient_id: Uuid,
}
async fn offer_transfer(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
    Json(input): Json<Transfer>,
) -> ApiResult<Json<Value>> {
    let mut tx = state.pool.begin().await?;
    let list = lists::access_tx(&mut tx, id, Some(user.id)).await?;
    if !list.is_owner() || input.recipient_id == user.id {
        return Err(ApiError::forbidden());
    }
    let recipient:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM app.grants g JOIN app.users u ON u.id=g.user_id WHERE g.list_id=$1 AND g.user_id=$2 AND u.verified)")
        .bind(id).bind(input.recipient_id).fetch_one(&mut *tx).await?;
    if !recipient {
        return Err(ApiError::bad_request(
            "El destinatario debe ser un colaborador con cuenta verificada",
        ));
    }
    sqlx::query("UPDATE app.transfers SET status='canceled' WHERE list_id=$1 AND status='pending'")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    let transfer: Uuid = sqlx::query_scalar(
        "INSERT INTO app.transfers(list_id,sender_id,recipient_id) VALUES($1,$2,$3) RETURNING id",
    )
    .bind(id)
    .bind(user.id)
    .bind(input.recipient_id)
    .fetch_one(&mut *tx)
    .await?;
    audit(
        &mut tx,
        user.id,
        "transfer_offered",
        id,
        json!({"transfer_id":transfer,"recipient_id":input.recipient_id}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"id":transfer})))
}

async fn transfers(State(state): State<AppState>, user: User) -> ApiResult<Json<Value>> {
    let rows:Value=sqlx::query_scalar(r#"SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (
      SELECT t.id,t.list_id,COALESCE(v.content->>'school','Lista sin publicar') AS school,u.display_name AS owner_name
      FROM app.transfers t JOIN app.lists l ON l.id=t.list_id AND l.owner_id=t.sender_id AND l.deleted_at IS NULL
      JOIN app.grants g ON g.list_id=l.id AND g.user_id=t.recipient_id JOIN app.users u ON u.id=l.owner_id
      LEFT JOIN app.versions v ON v.list_id=l.id AND v.number=l.current_version
      WHERE t.recipient_id=$1 AND t.status='pending' AND t.expires_at>now() AND NOT l.hidden ORDER BY t.created_at) x"#)
        .bind(user.id).fetch_one(&state.pool).await?;
    Ok(Json(rows))
}

async fn accept_transfer(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let list_id: Uuid =
        sqlx::query_scalar("SELECT list_id FROM app.transfers WHERE id=$1 AND recipient_id=$2")
            .bind(id)
            .bind(user.id)
            .fetch_optional(&state.pool)
            .await?
            .ok_or_else(ApiError::not_found)?;
    let mut tx = state.pool.begin().await?;
    let list = lists::access_tx(&mut tx, list_id, Some(user.id)).await?;
    let transfer=sqlx::query("SELECT sender_id,status,expires_at>now() AS valid FROM app.transfers WHERE id=$1 AND recipient_id=$2 FOR UPDATE")
        .bind(id).bind(user.id).fetch_optional(&mut *tx).await?.ok_or_else(ApiError::not_found)?;
    let status: String = transfer.try_get("status")?;
    if status == "accepted" && list.is_owner() {
        return Ok(Json(json!({"list_id":list_id})));
    }
    let sender: Option<Uuid> = transfer.try_get("sender_id")?;
    let granted:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM app.grants g JOIN app.users u ON u.id=g.user_id WHERE g.list_id=$1 AND g.user_id=$2 AND u.verified)")
        .bind(list_id).bind(user.id).fetch_one(&mut *tx).await?;
    if status != "pending"
        || !transfer.try_get::<bool, _>("valid")?
        || sender.is_none()
        || list.owner_id != sender
        || !granted
    {
        return Err(ApiError::conflict(
            "La transferencia venció o ya no es válida",
        ));
    }
    sqlx::query("UPDATE app.lists SET owner_id=$2,updated_at=now() WHERE id=$1")
        .bind(list_id)
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM app.grants WHERE list_id=$1 AND user_id=$2")
        .bind(list_id)
        .bind(user.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("INSERT INTO app.grants(list_id,user_id,role) VALUES($1,$2,'editor') ON CONFLICT(list_id,user_id) DO UPDATE SET role='editor'").bind(list_id).bind(sender).execute(&mut *tx).await?;
    sqlx::query("UPDATE app.transfers SET status='accepted' WHERE id=$1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit(
        &mut tx,
        user.id,
        "ownership_transferred",
        list_id,
        json!({"transfer_id":id,"previous_owner":sender}),
    )
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"list_id":list_id})))
}

async fn cancel_transfer(
    State(state): State<AppState>,
    user: User,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let list_id: Uuid = sqlx::query_scalar("SELECT list_id FROM app.transfers WHERE id=$1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(ApiError::not_found)?;
    let mut tx = state.pool.begin().await?;
    let list = lists::access_tx(&mut tx, list_id, Some(user.id)).await?;
    if !list.is_owner() {
        return Err(ApiError::forbidden());
    }
    sqlx::query("UPDATE app.transfers SET status='canceled' WHERE id=$1 AND status='pending'")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invitations_require_one_mailbox_and_explicit_safe_role() {
        assert_eq!(email(" Person@Example.CL ").unwrap(), "person@example.cl");
        for value in ["", "person", "@example.cl", "a@@b.cl", "a b@c.cl"] {
            assert!(email(value).is_err());
        }
        assert!(role("owner").is_err());
        assert!(role("admin").is_err());
        assert!(role("editor").is_ok());
    }
}
