# Local application API contract

The Rust API is served at `/api`. The Angular development server proxies this prefix.
JSON uses snake_case. Errors are `{ "error": "Spanish user-facing message" }` with
400/401/403/404/409 as appropriate. Every mutation sends `X-Requested-With: lista-escolar`.
Sessions use HttpOnly SameSite cookies, separately for users and administrators.
The local mode verifies new users locally; Google authentication and delivery of
email are deferred. No real passwords or connection strings belong in this file.

## Shared data

`Content`:
```json
{"school":"Escuela", "class_name":"1° básico A", "school_year":2027,
 "comuna":"", "region":"", "instructions":"", "logo_id":"",
 "items":[{"id":"uuid", "catalog_id":"", "name":"Lápiz grafito",
 "quantity":"2", "unit":"unidad", "category":"Escritura", "note":"", "attributes":{}}]}
```
All content strings except required names may be empty. Quantities are decimal
strings. Item IDs are stable UUIDs, and copied/imported items receive new IDs.

`ListSummary`: `{id, school, class_name, school_year, comuna, region, visibility,
archived, hidden, current_version, votes, published_at, owner_name, role, following}`.
Role is `owner`, `editor`, `viewer`, or empty (public visitor).
`following` reflects the signed-in user's subscription independently of their role;
owners and editors can also follow a list. It is false for anonymous searches.

`ListDetail`: `{id, owner_id, owner_name, visibility, archived, hidden,
comments_enabled, current_version, version, published_at, content, role,
votes, voted, following, versions:[{number,published_at}]}`.
Only editable endpoints return unpublished drafts.

## Accounts (root agent)

- `GET /health` → `{status, mode:"local"}`.
- `GET /auth/me` → `{user: {id,email,display_name,preferences}|null, mode:"local"}`.
- `POST /auth/register` `{email,password,display_name}` → `{user}` and cookie.
- `POST /auth/login` `{email,password}` → `{user}` and cookie.
- `POST /auth/logout` → `{ok:true}`.
- `PATCH /auth/me` `{display_name,preferences}` → `{user}`.
- `DELETE /auth/me` `{password,confirm:true,disposition_token}` → `{ok:true}`; account deletion disposition per spec.
- `GET /auth/deletion-preview` → `{disposition_token,lists:[{id,school,visibility,current_version,disposition}],transfers:[{id,list_id,status,expired,direction,other_party,school}]}`. The confirmation token binds both list dispositions and pending/accepted transfers.
- `POST /admin/login` `{username,password}` → `{admin:{id,username}}` and separate cookie.
- `GET /admin/me` → `{admin:{id,username}|null}`.
- `POST /admin/logout` → `{ok:true}`.
- `POST /assets` multipart `file` → `{id}`. Sanitized PNG up to 2 MiB.
- `GET /assets/{id}` → authorized image, no-store.

## Lists and imports (core agent)

- `GET /lists?q=&school_year=&comuna=&region=&sort=recent|votes` → `ListSummary[]`.
- `GET /lists/mine` → `ListSummary[]` (owned, granted, or followed).
- `POST /lists` `{content?,visibility?}` → `{id}`. Empty draft is permitted.
- `GET /lists/{id}?version=N` → `ListDetail`, defaults to latest published.
- `GET /lists/{id}/draft` → `{id,content,revision,current_version,visibility,archived,hidden,role}`.
- `PUT /lists/{id}/draft` `{content,revision}` → `{revision}`; stale revision gives 409.
- `POST /lists/{id}/publish` `{revision,current_version,request_id}` → `{version}`.
- `PATCH /lists/{id}/settings` `{visibility?,comments_enabled?}` → `{ok:true}`.
- `POST /lists/{id}/copy` `{version?}` → `{id}`.
- `POST /lists/{id}/archive` `{archived:true|false}` → `{ok:true}` (owner).
- `DELETE /lists/{id}` → `{ok:true}` (owner).
- `GET /lists/{id}/progress?version=N` → `{version,items:{"item-uuid":{checked,review}},changes:{added:[],changed:[],removed:[],details_changed:false}}`.
- `PUT /lists/{id}/progress` `{version,item_id,checked,review}` → same progress envelope.
- `GET /templates` → `[{id,name,grade,content}]`.
- `POST /templates/{id}/copy` → `{id}`.
- `POST /lists/{id}/imports` multipart `file` → `{id,revision,sheets:[{name,rows:[["cell"]]}]}`.
- `POST /lists/{id}/imports/{import_id}/confirm` `{revision,request_id,items:[Item]}` → `{revision}`.
  Frontend maps columns, matches using catalog search, flags duplicates and lets
  users correct/exclude rows before confirming. Confirmation is atomic and idempotent.
- `DELETE /lists/{id}/imports/{import_id}` → `{ok:true}`.

## Catalog, community, collaboration, and administration (community agent)

Catalog attribute values use `attributes:{key:{name,unit,data_type,value}}`, where
`value` is a string, number, or boolean and `unit` may be null. Creation and correction
accept either primitive values by key or these objects containing `value`.

- `GET /catalog?q=&category=` → `[{id,name,category_id,category,category_slug,subcategory_id,subcategory,subcategory_slug,review_status,aliases,attributes}]`, at most 200 pending/approved items. This legacy array remains available to existing consumers. `category` filters by slug; subcategory fields may be null; aliases are strings. Search matches all whitespace-separated terms, ignoring case/Spanish accents, across generic names, category/subcategory names, aliases, attribute names/values/units, and approved links to nondeleted source-product names. Terms are literal, so `%`/`_` are not wildcards. Compact quantities such as `7mm` and `7 mm` both match a grid value of 7 mm.
- `GET /catalog/browse?q=&category=&attributes=&offset=0&limit=40` → `{items,total,offset,limit,facets:[{key,name,data_type,unit,values:[{value,count}]}]}`. Category uses a slug. `attributes` is a URL-encoded JSON object of typed scalar values, for example `{"tipo_cuaderno":"Cuadriculado","formato":"universitario","numero_hojas":100,"cuadricula_mm":7}`. All selected attributes must match; text is exact, numbers remain numeric and boolean `false` is valid. Missing values do not match. Unknown/malformed/mistyped filters return 400. Limits: query 500 characters, attributes 30 keys/16 KiB, offset 0–1000000, page size 1–100. Filtering precedes pagination, without the legacy 200-item cap. Counts respect search and the other attributes while ignoring the facet's own choice. Within a category, actual visible catalog values remain available with count 0 when other constraints exclude them. Selected values remain removable at zero matches; rejected items never contribute. Facets follow category display order and conditional type applicability. Legacy `subcategory` slug filtering remains accepted only with a category, for compatibility; new clients use type attributes.
- `GET /catalog/categories` → `[{id,slug,name,type_attribute,attributes:[{key,name,data_type,unit,options,applies_to_types,sort_order}],subcategories:[...]}]`. Category-level definitions drive all new forms and filters. `type_attribute` names the category's type key; options are curated strings. Empty `applies_to_types` means all types; a nonempty array restricts the field when a type is selected. An empty-options Type remains optional and has no selectable values; ordinary text fields with no options accept free text. The legacy subcategories array is retained for compatibility, not navigation.
- `POST /catalog` `{name,category_id,attributes?}` → `{id,name,review_status:"pending"}` (signed-in shared supply). New values must be assigned to the category, match the declared type and allowed options, and satisfy conditional applicability. Type is optional. A legacy `subcategory_id` is still accepted and mapped to the category's type attribute; contradictory classifications return 400.
- `POST /catalog/match` `{names:[string]}` → `{rows:[{name,candidates:[{id,name,category,category_slug,subcategory,review_status,attributes}]}]}` (signed-in user). Up to 1000 names of at most 300 characters, with at most eight suggestions per row. Candidates use the typed attribute values above but omit classification IDs and aliases. Uses generic names, aliases, and approved source-product links. All suggestions require user review; pending items remain labeled.
- `POST /lists/{id}/vote` `{voted,version}` → `{votes,voted}`.
- `GET /lists/{id}/comments?version=N` → `[{id,body,author,user_id,created_at,deleted}]`.
- `POST /lists/{id}/comments` `{version,body}` → `{id}`.
- `DELETE /comments/{id}` → `{ok:true}` (author or owner).
- `POST /lists/{id}/follow` `{following}` → `{following}` (local subscription, no delivery).
- `POST /lists/{id}/reports` `{version,comment_id?,reason,kind:"content"|"privacy"}` → `{id}`.
- `GET /lists/{id}/access` → `{grants:[{user_id,email,display_name,role}],invitations:[{id,email,role,expires_at}],requests:[{id,email,display_name}],transfers:[{id,recipient_id,recipient_name,expires_at}],request_link:string}`.
- `POST /lists/{id}/access` `{email,role:"viewer"|"editor"}` → `{id,invitation_token}`. An existing account is invited too; invitation acceptance requires matching signed-in email.
- `DELETE /lists/{id}/access/{user_id}` → `{ok:true}`.
- `DELETE /lists/{id}/invitations/{invitation_id}` → `{ok:true}`.
- `POST /invitations/{token}/accept` → `{list_id}`.
- `POST /access-requests/{token}` → `{ok:true}` (signed-in request link).
- `POST /lists/{id}/requests/{request_id}` `{approve,role?:"viewer"|"editor"}` → `{ok:true}`; role defaults to viewer.
- `POST /lists/{id}/transfer` `{recipient_id}` → `{id}`.
- `GET /transfers` → `[{id,list_id,school,owner_name}]` addressed to current user.
- `POST /transfers/{id}/accept` → `{list_id}`.
- `DELETE /transfers/{id}` → `{ok:true}` (offering owner).
- `GET /admin/dashboard` → counts object.
- `GET /admin/catalog?q=` → catalog items including rejected, typed attributes and `aliases:string[]` (up to 200 results; search independently when selecting a target).
- `GET /admin/attributes` → existing attribute dictionary `[{key,name,data_type,unit}]`, with `data_type` text, number or boolean.
- `POST /admin/catalog` `{name,category_id,attributes?,aliases?,approve:true}` → `{id,review_status:"approved"}`; separate administrator session, explicit approval, atomic category-aware typed validation and audit. Legacy subcategory input remains compatible but is not needed.
- `PATCH /admin/catalog/{id}` `{action:"update"|"approve"|"reject"|"merge",target_id?,name?,category_id?,subcategory_id?,attributes?,aliases?}` → `{ok:true}`. Update preserves review status. Omitted ordinary fields remain unchanged; when category or type changes, an omitted legacy subcategory may be derived from the resulting type. An unchanged category/type preserves the old legacy link, including null. Explicit `subcategory_id:null` clears only that link, preserving the type attribute. Supplied attributes and aliases replace the respective sets (`{}`/`[]` clear them); an explicitly supplied legacy subcategory can backfill its type into the replacement attributes. New or changed values follow category options and applicability, while identical historical values on the same category are preserved; attribute types follow the dictionary, numeric values must be positive and at most 1000000. Replacement payloads accept at most 30 attributes and 30 trimmed aliases of 1–300 characters; aliases are normalized to lowercase and deduplicated. Merges can combine larger existing alias sets. All changes are atomic and preserve published list snapshots. Merge uses `target_id`, adds source names as alternatives and requires classification/attribute/alias corrections to be saved separately.
- `GET /admin/products?q=` → `[{id,name,brand,unit_label,snapshot_price_clp,visible_in_store,source_updated_at,variants:[{id,name,sku,attributes}],images:[{url,alt_text}]}]` (admin only), at most 200 nondeleted source products. Variant attributes are source JSON; prices are imported snapshots.
- `GET /admin/matches` → `[{item_id,source_product_id,review_status,match_method,generic_name,source_product_name,source_brand,snapshot_price_clp}]`, at most 500 rows with pending matches first.
- `POST /admin/matches` `{item_id,source_product_id}` → `{ok:true}` (confirmed manual link).
- `PATCH /admin/matches` `{item_id,source_product_id,review_status}` → `{ok:true}`.
- `DELETE /admin/matches` `{item_id,source_product_id}` → `{ok:true}`.
- `GET /admin/reports` → `[{id,list_id,version,comment_id,kind,reason,status,outcome,note,created_at,evidence}]`, at most 200 cases with open cases first. Each returned open case records an inspection audit. Evidence is `{content:Content}` for a list or `{comment_id,body,school,class_name}` for a comment, and `{}` after closure or content removal.
- `GET /admin/reports/{id}/logo` → the sanitized logo referenced by the case's captured published-version evidence; separate admin authentication, open case, undeleted list, no-store, and an inspection audit are required. It accepts no arbitrary asset ID.
- `POST /admin/reports/{id}` `{action:"hide"|"restore"|"remove"|"dismiss",note}` → `{ok:true}`; note requires 1–2000 trimmed characters. Hide keeps the case open. Restore, remove, and dismiss close it and erase its evidence and reason. Restore returns 409 if another open case still hides the same list/comment; dismiss releases its own hide while preserving other cases' holds. Removed content is never reconstructed, and removal also clears copies in other reports. Already closed cases return 409.
- `GET /admin/templates` → `[{id,name,grade,content,active}]`, including inactive templates.
- `POST /admin/templates` `{id?,name,grade,content}` → `{id}`. Requires one or more items, each with a name and valid quantity, and an empty `logo_id`; other content validation also applies. An existing ID updates and reactivates that template.
- `DELETE /admin/templates/{id}` → `{ok:true}`; sets `active:false`, preserving the template record and existing copied lists.
- `GET /admin/schools` → locality-aware alias rows.
- `POST /admin/schools` `{canonical_name,alias,comuna,region}` → `{id}`.
- `DELETE /admin/schools/{id}` → `{ok:true}`.
- `POST /admin/accounts` `{username,password}` → `{id}`.
- `POST /admin/categories` `{name,slug}` → `{id}`. Creates the category's optional type definition/binding with no choices; administrators add curated type options separately.
- `PATCH /admin/categories/{id}` `{name,slug}` → `{ok:true}`.
- `DELETE /admin/categories/{id}` → `{ok:true}`; populated categories cannot be deleted.
- `PATCH /admin/categories/{id}/attributes` `{attributes:[{key,options?,applies_to_types?,sort_order?}]}` → `{ok:true}`. Replaces category bindings atomically; the type binding must remain. Type choices cannot be removed while used, and applicability must refer to curated types. Removing a non-type binding preserves existing stored values. New or changed values follow the new metadata; identical historical values on the same category remain editable without being silently lost.
- `POST /admin/categories/{id}/types` `{action:"add"|"rename"|"remove",value,new_value?}` → `{ok:true}`. Rename updates current item type values, applicability and compatibility mappings together, preserving published snapshots. Removing a type referenced by catalog items or conditional attribute applicability returns 409. New clients manage type choices here instead of subcategories.
- `POST /admin/subcategories` `{name,slug,category_id}` → `{id}`.
- `PATCH /admin/subcategories/{id}` `{name,slug,category_id}` → `{ok:true}`; changing category requires no existing item references.
- `DELETE /admin/subcategories/{id}` → `{ok:true}`; referenced subcategories cannot be deleted.

## Rust module conventions

`AppState { pub pool: PgPool }` (Clone). Modules export `pub fn routes() -> Router<AppState>`;
paths omit `/api` because root nests their routers. `ApiError` supports
`bad_request(message)`, `unauthorized()`, `forbidden()`, `not_found()`, `conflict(message)`;
`From<sqlx::Error>` and generic `internal(error)` preserve private logs.
`ApiResult<T> = Result<T,ApiError>`. Response `Json<Value>` is fine.

`auth::User` is an extractor `{id:Uuid,email:String,display_name:String}`.
`auth::Admin` is a separate extractor `{id:Uuid,username:String}`.
`auth::optional_user(&AppState,&HeaderMap) -> ApiResult<Option<User>>` for public endpoints.
`auth::hash_password(&str) -> ApiResult<String>` for administrative account creation.

Core agent provides `models::{Content,Item}` with Serialize/Deserialize, default Content,
`validate_content(&Content, publishing:bool) -> ApiResult<()>`, and `lists::access` helpers:
`pub async fn access(pool:&PgPool,id:Uuid,user:Option<Uuid>) -> ApiResult<ListAccess>`
where `ListAccess { id, owner_id:Option<Uuid>, visibility:String, archived:bool,
hidden:bool, comments_enabled:bool, current_version:i32, draft_revision:i64,
draft:Value, role:String }` with `can_read()`, `can_edit()`, `is_owner()`.
Read access blocks hidden/deleted content; owners/editors retain draft access while hidden.
Mutations lock the list row in a transaction and recheck permissions/state there.

Schema is defined by the root agent in `db/003_application.sql`. All persistent
application tables use schema `app`; existing `catalog` and `store_snapshot` are retained.
