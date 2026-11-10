# Codebase and database review — 2026-11-10

The review found **eight reproducible application defects and one reachable dependency vulnerability**. The current local database passed the integrity checks described below. No fixes to these defects are included in this review document.

Scope: local Rust API, Angular frontend, PostgreSQL schema/data, imports, catalog and administration, authentication, ownership and deletion, published lists, community actions, checklist state and dependency advisories. Email/Gmail delivery and deployment remain deferred. Severity reflects the current local application: **P1** merits the first fix; **P2** should be corrected during core development.

The API/browser reproductions used synthetic accounts and lists in a disposable QA database. Database audits were read-only; the separately requested, backed-up catalog expansion was subsequently applied to `escolar` through migration 006. Application data and credentials are not reproduced here. Validation and post-migration checks are complete; the findings below remain open.

## Findings

### 1. P1 — Account deletion can retain a concurrent report's copy of a deleted comment

**Locations:** [`src/auth.rs:382–386`](../src/auth.rs#L382), [`src/community.rs:297–315`](../src/community.rs#L297).

Account deletion clears existing report evidence before clearing the author's comments. It does not acquire the list locks used by report creation for comments on other people's lists. A report created after the cleanup statement's snapshot can still read the old comment and retain its body after deletion commits.

**Reproduced:** hold an existing report row lock to pause account deletion at the evidence cleanup, submit another report through the API, release the lock, and let deletion complete. The account disappeared and the comment became a deleted placeholder; the original report was scrubbed but the new report retained the body and exposed it through the admin reports endpoint.

**Recommendation:** serialize deletion with comment/report operations across all affected lists or comments, using a consistent lock order, then scrub every associated report within that transaction. Add a concurrency regression covering a comment on another owner's list.

**Evidence:** `.local/qa/audit/account-deletion-race.py` and `account-deletion-race.json`.

### 2. P2 — Account deletion leaves quoted comment text in report reasons

**Locations:** [`src/auth.rs:382`](../src/auth.rs#L382); compare [`src/community.rs:202–209`](../src/community.rs#L202). Admin exposure: [`src/admin.rs:438–450`](../src/admin.rs#L438).

Ordinary comment removal clears both report `evidence` and `reason`; account deletion clears only `evidence`. A reporter's quotation of the deleted comment therefore survives in `reason`.

**Reproduced:** report a comment with a quotation in the reason, delete the author's account, then fetch admin reports. The comment was removed and evidence was empty, but the reason still contained the quotation. This occurs without concurrent requests and is independent of finding 1.

**Recommendation:** use a shared comment/report erasure policy for both deletion paths. Verify both evidence and reasons are cleared while retaining only the moderation metadata the application intends to preserve.

**Evidence:** `.local/qa/audit/backend-access-probes.json`, `deleted_author_comment`.

### 3. P2 — Original logo uploader retains access after private-list permission is revoked

**Locations:** [`src/assets.rs:90–92`](../src/assets.rs#L90); analogous reuse authorization in [`src/lists.rs:225–230`](../src/lists.rs#L225).

The asset query accepts `a.owner_id = current_user` independently of current access to the referencing list. This bypasses the specification's immediate revocation of old logo application links.

**Reproduced:** upload a logo, publish a private list, transfer the list, and have the new owner revoke the original owner's grant. The original owner received 404 for the list and draft, but 200 with PNG bytes for its logo. This preserves access to the original upload; it does not demonstrate access to a replacement image uploaded by someone else.

**Recommendation:** limit uploader-only access to unattached staging uploads. Authorize bound assets through an accessible referencing list, and apply the same rule to reuse validation. Preserve preview access for a newly uploaded, unbound image.

**Evidence:** `.local/qa/audit/backend-access-probes.json`, `revoked_uploader_logo`.

### 4. P2 — A delayed initial session refresh overwrites a successful login

**Locations:** [`frontend/src/app/core/session.ts:9–13`](../frontend/src/app/core/session.ts#L9), [`frontend/src/app/pages/auth/auth.ts:53–60`](../frontend/src/app/pages/auth/auth.ts#L53).

The service starts `/auth/me` immediately and later assigns its result unconditionally. Login and registration directly replace the same user state without invalidating that older request.

**Reproduced:** delay the initial anonymous `/auth/me` response, complete a valid login, then release the delayed response. Angular navigated back to `/ingresar?next=%2Fmis-listas`, although the server still recognized the authenticated cookie.

**Recommendation:** centralize authentication state changes and invalidate older refresh generations, or require initial session readiness before accepting login/registration state replacement. Apply the generation rule to logout and error handlers as well.

**Evidence:** `.local/qa/audit/frontend-races.json`, `initial_session_overwrites_login`, and `login-session-race.png`.

### 5. P2 — Rapid checklist changes can save the opposite of the user's last choice

**Locations:** [`frontend/src/app/pages/list/list.ts:190–206`](../frontend/src/app/pages/list/list.ts#L190), [`frontend/src/app/pages/list/list.html:150–155`](../frontend/src/app/pages/list/list.html#L150).

Each checkbox event sends a write immediately. Concurrent writes for the same item have no ordering, coalescing or pending lock, and responses update state without a generation check.

**Reproduced:** check then immediately uncheck an item while delaying the first PUT. The checkbox showed unchecked, but the database held checked; reloading changed the visible choice back to checked.

**Recommendation:** serialize or coalesce writes per list/version/item, or temporarily disable the affected row. Protect both successful responses and rollback handlers from acting on a different page/version. Test both write completion orders.

**Evidence:** `.local/qa/audit/frontend-races.json`, `progress_toggle`, and the `progress-before-reload.png` / `progress-after-reload.png` screenshots.

### 6. P2 — Late mutation responses display votes and comments on the wrong version

**Locations:** [`frontend/src/app/pages/list/list.ts:163–167`](../frontend/src/app/pages/list/list.ts#L163), [`frontend/src/app/pages/list/list.ts:240–247`](../frontend/src/app/pages/list/list.ts#L240).

List loading has a sequence guard, but mutation callbacks do not. An action started on one published version can overwrite state after the reader has moved to another version.

**Reproduced:** delay a version 1 vote response, open version 2, then release the response. Version 2 displayed an active vote and count 1 although its stored state was unvoted/count 0. Repeating with a comment displayed a version 1 comment under version 2, whose stored discussion was empty.

**Recommendation:** capture the target list/version and load generation for each action; check them before changing detail, comments, checklist or form state. Include error/finally handlers and follow responses in the same review.

**Evidence:** `.local/qa/audit/frontend-races.json`, `vote_wrong_version` and `comments_wrong_version`, with corresponding screenshots.

### 7. P2 — Catalog moderation silently hides pending items after the 200-row cap

**Locations:** [`src/admin.rs:79–80`](../src/admin.rs#L79), [`src/catalog_browse.rs:91`](../src/catalog_browse.rs#L91), [`src/catalog_browse.rs:114–115`](../src/catalog_browse.rs#L114); client filtering in [`frontend/src/app/pages/admin/admin.ts:179–182`](../frontend/src/app/pages/admin/admin.ts#L179) and request construction at lines 335–343.

The admin endpoint reuses the legacy catalog query, which sorts approved items first and returns at most 200. The pending filter is applied only after the truncated response reaches Angular.

**Reproduced:** a synthetic category with 200 approved items and one pending item returned 200 approved/zero pending from `/api/admin/catalog`. The pending queue appeared empty; searching the pending item's exact known name returned it.

**Recommendation:** apply status filtering on the server before pagination. Return total/offset information and add page controls to moderation instead of reusing the capped legacy array endpoint.

**Evidence:** `.local/qa/audit/catalog_probe.py`, `catalog-probes.json` and `schema-catalog-review.md`.

### 8. P2 — Spreadsheet suggestions fail to match common unaccented Spanish names

**Locations:** [`src/catalog.rs:50–61`](../src/catalog.rs#L50); consumer: [`frontend/src/app/pages/editor/editor.ts:996–1012`](../frontend/src/app/pages/editor/editor.ts#L996).

`/catalog/match` lowercases strings but does not use the accent folding applied by catalog browsing. Spreadsheet rows therefore behave differently from the regular search UI.

**Reproduced:** matching `Lapiz` and `Temperas` returned no suggestions, while accented forms returned `Lápiz grafito` and `Témperas`. `/catalog/browse` found the expected items with either spelling.

Rechecked after expansion 006: `Temperas` still returned zero matching candidates versus three for `Témperas`. `Compas` returned zero, while `Compás` included the exact item; browsing found `Compás` with either spelling. Evidence: `.local/qa/audit/post-expansion-accent.json`.

**Recommendation:** share Spanish accent/token normalization across matching and browsing, including equality, aliases, source names and fuzzy ranking. Keep explicit user review of suggested matches.

**Evidence:** `.local/qa/audit/catalog-probes.json` and `schema-catalog-review.md`.

### 9. P2 — XLSX preflight reaches vulnerable quadratic XML attribute processing

**Locations:** [`src/imports.rs:76–106`](../src/imports.rs#L76), entry limits at [`src/imports.rs:146–166`](../src/imports.rs#L146), authenticated editor check at [`src/imports.rs:276–285`](../src/imports.rs#L276); dependency [`Cargo.toml:24`](../Cargo.toml#L24).

The enabled dependency graph includes `quick-xml 0.31.0` directly and through `calamine`. `scan_worksheet()` iterates `e.attributes()` with default duplicate-name checks. That call is affected by **RUSTSEC-2026-0194**: duplicate detection takes quadratic time for a tag containing many distinct attributes; versions **0.41.0 and later** contain the fix. [Official RustSec advisory](https://rustsec.org/advisories/RUSTSEC-2026-0194.html).

**Reachability:** an authenticated user with list editing access can upload XLSX worksheet XML to this parser. The 16 MiB entry limit bounds bytes but does not cap attributes per tag; row/cell limits do not bound that work either. An otherwise bounded import can consume excessive CPU during preflight.

**Verification limit:** confirmed by the official advisory, locked dependency version and reachable source call. No malicious workbook timing experiment or runtime denial-of-service benchmark was run; the impact duration on this machine is not established.

**Recommendation:** upgrade the parser and compatible spreadsheet dependencies to patched versions, adapt affected APIs and rerun import acceptance. Add a deliberate per-tag attribute bound as defense in depth if appropriate; preserve duplicate-attribute validation rather than disabling it blindly. Keep expensive parsing isolated from critical request work.

**Evidence:** `.local/qa/audit/cargo-audit.json`, current `cargo tree --locked --offline -i quick-xml`, and the source/advisory above.

## Dependency audit interpretation

The captured Cargo audit reports **nine advisory matches in the lockfile**, not nine demonstrated exploitable application paths. Finding 9 is the directly verified reachable path. The npm audit reports **zero known vulnerabilities** in its captured dependency set; this does not prove the frontend has no vulnerabilities.

| Other Cargo matches | Current reachability assessment |
| --- | --- |
| `rsa` / `libsqlite3-sys` | Reverse trees are empty for the current enabled build. Present in the lockfile, but not linked through the checked feature/target graph. |
| Four `zip` extraction advisories | The importer reads archive entries; no `ZipArchive::extract` / `ZipStreamReader::extract` path was found in application code. Extraction impacts were not reproduced. |
| `quick-xml` namespace-allocation advisory | Application code uses `Reader`, not `NsReader`; that separate path was not established as reachable. |
| `calamine` CFB/OLE2 advisory | The application accepts XLSX through `Xlsx::new` and rejects `vbaProject.bin`; a vulnerable CFB/OLE2 parsing path was not observed. |

Dependency updates remain useful, but the other matches should retain these qualifications until features or importer behavior change. Audit sources are `.local/qa/audit/cargo-audit.json` and `npm-audit.json`.

## Database integrity snapshot

The live audit captured `escolar` on **2026-11-10 at 10:05:46−03**, running PostgreSQL **18.3**, with migrations through **005**. It used a repeatable-read, read-only transaction and a 15-second statement timeout through the protected connection helper. Application fingerprints matched the earlier baseline; no real application data was changed by the review.

| Check | Result |
| --- | --- |
| Constraint validation | All **313** constraints validated |
| Index validity/readiness | All **70** indexes valid and ready |
| Declared foreign keys | **50** checked; zero orphan rows |
| Additional source-snapshot relationships | Seven checked; zero orphans, with no source products/variants/matches present |
| Applied migration checksums | **003–005** match their SQL files |
| Application documents | One user, three lists, zero published versions, three templates; checked shapes/references/lifecycle counters consistent |
| Document item occurrences | **21** checked; no malformed IDs/attribute objects, duplicate occurrence IDs or missing catalog references |
| Catalog | Nine categories, **44 items**, **108 item attributes**; all 44 items have their category type |
| Catalog semantics | No invalid category/type bindings, option/applicability violations, malformed numeric values or category/subcategory mismatches |
| Catalog duplicates | No duplicate canonical keys or accent/case/whitespace-normalized names within a category |

A representative current browse/search/facet query completed in **1.955 ms**, with **2.314 ms** planning time and no shared-block disk reads. This is one small, warm-cache local sample, not a benchmark for a large source import.

The baseline had 12 configured type values with no item, and `papeles` / `otros` had no items. These were catalog completeness gaps, not damaged rows. The separately requested migration 006 added **132 items and five categories** at **10:21:02−03**. The post-migration audit confirms **176 items, 14 categories and 381 attribute values**, with all constraint/index/FK and semantic checks still passing and checksums 003–006 matching. All 132 new records match their researched names, typed attributes and aliases; the original 44 items and their attributes/aliases are unchanged.

The original draft fingerprint changed during the review: the latest list update was **10:15:56−03**, about five minutes before migration 006. None of the three lists had an update at or after migration when checked. This intervening edit was retained; equality with the original draft snapshot is not claimed. Versions, templates, legacy classifications and source-link fingerprints remained unchanged. The original failed historical equality check and its timing reconciliation remain in `.local/qa/audit/post-expansion/`.

The backup is `.local/backups/escolar-before-catalog-expansion-20261110T131339Z.dump` (custom format, readable 216-entry table of contents; restoration not rehearsed). Research, sources and migration behavior are documented in [the catalog expansion report](CATALOG_RESEARCH_2026-11-10.md).

## Database recommendations and review boundaries

- **27 foreign keys lack a general covering index on their referencing columns.** This is a growth/performance observation, not a current integrity failure or a recommendation to add all 27 immediately. Prioritize actual user/list cleanup paths such as sessions by user, comments by user and reports by comment; assess query plans before adding the rest. The detailed inventory is in `.local/qa/audit/database-review.json`.
- Some relationships are maintained by application transactions: the current-version pointer, JSON item references/shapes, and category option/applicability rules. Current data passed the corresponding semantic checks. Keep these checks in migration/import acceptance; any new constraints must allow intentionally incomplete drafts.
- The source snapshot is empty and real published versions are absent. Those paths have code/QA evidence, but this snapshot cannot establish integrity for a populated source import or real publication history.
- Applied migrations 003–006 must remain immutable. Any fixes or additional indexes belong in a new migration.
- A lower-priority, unverified bootstrap risk remains at [`src/main.rs:38–49`](../src/main.rs#L38): schema 001 and seed 002 commit separately, while subsequent startup gates them on namespace existence. An interruption between them could skip seeding on restart. The current local database is seeded; no interruption reproduction was run.
- Authorization under list-row locks, publication revision/idempotency checks, ownership transfer, catalog merge/snapshot preservation, scalar validation, SQL parameter binding, separate user/admin cookies and loopback-only binding were inspected without an additional confirmed defect. This does not replace regression tests for future changes.

## Validation status and evidence

The findings above are open review results. This document does not claim that the existing suite detects them or that they have been fixed.

| Validation | Status at report preparation |
| --- | --- |
| Backend account-deletion and asset-access probes | Completed against disposable QA accounts/lists; findings 1–3 reproduced |
| Browser request-order probes | Completed; findings 4–6 reproduced, with API state checks and screenshots |
| Catalog moderation and accent-matching probes | Completed in the disposable fixture; findings 7–8 reproduced |
| Live database integrity/checksum review | Completed read-only on baseline 005; aggregate results above |
| Dependency audit and path inspection | Completed; finding 9 is static reachability, without exploit timing |
| Rust and static checks | 17 tests pass; Clippy with warnings denied passes |
| Python/PostgreSQL | 29 tests pass, including five expansion/preservation tests |
| Angular | 46 tests pass; production build passes with the existing 26.70 kB editor stylesheet warning against a 25 kB warning budget |
| API acceptance | 31 groups pass, 549 requests; disposable PostgreSQL only |
| Browser acceptance | 96 distinct scenarios pass: 37 functional/catalog/editor cases and 59 UI/PDF/workflow cases |
| Catalog accessibility and visual checks | 11 expansion Axe A/AA captures with zero violations; desktop and 390/320 px screenshots inspected |
| PDF rendering | 21 generated PDFs / 79 pages rendered, zero text-bound violations; six reference pages also rendered |
| Catalog migration 006 rehearsal/application/post-checks | Applied to backed-up `escolar`; exact new/existing catalog verification and independent read-only integrity audit pass, with the historical draft edit qualified above |

The first browser run passed 35/37 cases; two new mobile assertions incorrectly searched text content for an editable input's value. Those assertions were corrected and all five expansion cases passed on rerun, followed by all 59 remaining UI cases. No application change was needed for that test correction. The aggregate result is 96 distinct passing scenarios, not a claim that the first script invocation exited successfully. Logs: `.local/qa/audit/full-validation.log`, `expansion-rerun.log`, `ui-final.log` and `pdf-render-final.log`.

These regressions do not cover or resolve the nine audit findings. The running local API, Angular development server and design gallery returned HTTP 200 after migration. Read-only API checks also confirmed the new categories and paper/music/USB filters against `escolar`.

Detailed evidence remains local under `.local/qa/audit/`: `backend-access-review.md`, `frontend-findings.json`, `frontend-races.json`, `schema-catalog-review.md`, `database-review.json`, `catalog-query-plan.json`, dependency audit JSON and the associated reproducible probe scripts. The directory is local QA output; this durable report carries the findings needed to review the project without those artifacts.
