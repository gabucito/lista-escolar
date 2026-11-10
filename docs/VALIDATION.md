# Implementation and validation record

Scope: complete local Rust/Angular application using the specification. Live
email delivery, Google OAuth/Gmail, and public deployment remain deferred.

The user authorized at most **10 consolidated functional revision rounds**, then
at most **10 UI/UX revision rounds** against the approved mockups. Unit checks
during construction are recorded separately from those completed-app rounds.

## Construction checks

- Rust dependency compatibility: pin ZIP 2.4.2 for the Calamine 0.26 API.
- Initial Rust type check passed after dependencies were available.
- Existing importer fixes and their regression tests are preserved.
- Rust unit tests: 15 passed initially; Clippy with warnings denied passed.
- Existing Python importer/database/configuration regressions: 19 passed.
- Angular production build and 16 frontend unit tests passed. PDF code and fonts
  are loaded only when needed; the initial bundle is approximately 277 kB.
- Live `escolar` inspection on 2026-11-10 found the starter catalog and no source
  products or matches. Integrated tests use an isolated database.
- Final construction checks: **16 Rust tests, 19 Python tests and 23 Angular
  tests passed**, plus Clippy with warnings denied and the production build.
  Final initial JavaScript/CSS is approximately 285 kB (77 kB estimated transfer);
  PDF generation/fonts and page-specific code remain lazy-loaded.

## Functional rounds

1. API acceptance: 331 requests, 19 of 20 scenario groups passed. The remaining
   assertion expected 403 rather than the intentional 404 for an inaccessible
   private draft. Review also improved permission/read serialization, stale saves
   after archive/restore, logo reference normalization/cleanup, combined school
   and class searches, and import suggestions using aliases and approved links.
2. API acceptance: **358 requests, 21 of 21 groups passed**, including local
   password/admin recovery and session invalidation. Browser checks passed draft
   conflict recovery, bound invitations/revocation, templates, archive/restore,
   list deletion, profile/PDF preferences, and account deletion. All 12 standard
   PDFs preserved 48 items and long notes within page bounds (44 pages total).
   The boundary fixture exposed lost long locality text in the sidebar layout,
   corrected in subsequent rounds. Search also exposed an overly restrictive automatic
   region filter, corrected in source. Browser harness synchronization and label
   corrections are test setup changes, not additional application revisions.
3. Expanded API acceptance: **390 requests, 22 of 22 groups passed**, adding
   catalog-name matching, transfer-disposition confirmation and overlapping
   moderation cases. Render inspection caught reused checkbox drawing objects
   moving boxes outside pages and a fixed-height sidebar dropping its contents.
4. API acceptance: **397 requests, 22 of 22 groups passed**, including scoped
   private-report logos. All 12 browser scenario groups passed after normalizing
   letter-spaced PDF title extraction in the harness. Checks cover all standard
   PDF variants, six maximum-length/logo variants, draft/historical/archived
   exports, preferences, admin workflows, and revoked content clearing without
   a page reload. The operator inspector now validates every printable checkbox.
   Subsequent visual inspection identified a card header/name page break to fix.
5. API acceptance: **428 requests, 23 of 23 groups passed**, including direct
   administrator creation/correction of generic supplies, typed attributes and
   aliases. All **15 browser scenario groups passed** after correcting harness
   select locators and category fixture assumptions. Added a phone workflow and
   paged review of 1,000 imported rows. Rendered **21 generated PDFs (79 pages)**
   and **six approved reference PDFs (six pages)**: no text-bound violations,
   off-paper/overlapping checkboxes, orphan card headers, or colored pixels in
   grayscale exports. Card names now stay with their checkbox/category/quantity.
6. Final specification review adds automatic exclusion of entirely blank import
   rows while preserving worksheet row numbers, plus a numeric-format explanation.
   Two unit regressions cover blank rows and partially populated invalid rows.
   Search responses are sequenced so a slow earlier request cannot replace
   newer results; a corrected search clears earlier validation feedback. Four
   regressions cover ordering, stale errors/loading, validation and route exit.
   The local launch/test scripts now track child process groups, handle shutdown,
   check occupied ports and bound readiness waits. The full `scripts/test-local.sh`
   run passed: **428 API requests, all 23 API groups and all 15 functional browser
   scenarios**, with temporary database/server cleanup confirmed afterward.

Coverage includes accounts and separate administration, catalog/taxonomy, drafts
and optimistic conflicts, atomic publication/retries, historical permissions,
collaboration/invitations/transfers, checklist migration, feedback/moderation,
imports, logos, templates, aliases, archives/deletion and local account recovery.
Machine-readable reports and screenshots are ignored under `.local/qa/`.

## UI/UX rounds

1. All 13 desktop/mobile/accessibility scenarios passed: no Axe WCAG A/AA
   violations on the six primary pages at 1440px and 390px, no horizontal
   overflow, keyboard focus/escape restoration, and no cached dynamic list data.
   Manual review caught blank-year search rejection that did not trigger an Axe
   violation. It also found that mobile editor tools preceded the main form and
   PDF controls were too far below long published lists. A revised mockup was
   generated at `design/revisions/01-responsive-editor.png`; revision 2 applies
   its information order, in-page navigation and persistent actions.
2. Expanded to **35 scenarios**: all 19 primary-page/keyboard/offline checks passed
   at 1440px, 390px and 320px. The 16 administrative checks found mobile catalog
   overflow and a report evidence region needing keyboard focus. Two additional
   failures were a product-row selector matching both source and linked tables;
   the harness now selects the row with its linking action. The responsive
   editor/published-list workflows and persistent mobile actions passed.
3. Corrected the administrative overflow/focus issues and compacted the mobile
   editor header so supplies appear earlier. The mobile sort selector now keeps
   enough width for its full label. Coverage expands to 43 scenarios, including
   all eight administrative sections at 320px. **All 43 scenarios passed**,
   including **51 accessibility snapshots with zero Axe WCAG A/AA violations**.
   Final screenshot inspection confirmed the first supply is visible on a
   390px phone, persistent actions remain reachable, and desktop hierarchy stays
   consistent with the approved concepts. Final PDF rendering repeated the
   85-page inspection with zero page-bound violations or grayscale color leakage.

Completed within the authorized limits: **6 functional rounds and 3 UI/UX rounds**.
Final execution log: `.local/qa/final-run.log`; API report:
`.local/qa/functional-20261110T040348.json`; browser report:
`.local/qa/browser-results.json`; combined metrics: `.local/qa/final-summary.json`.
Test harness selector corrections do not count
as additional application revision rounds.

Comparison references: `design/concepts/interfaces/` and all six color/grayscale
versions of the three approved PDF concepts. PDF render contact sheets and
per-page images are generated by `qa/render-pdfs.mjs`.

## Local database and launcher

- Before applying application migration 003, saved a full custom-format backup
  at `.local/backups/escolar-before-app-20261110T034040Z.dump` with private file
  permissions. Existing catalog data was preserved, including its recorded
  fingerprint `f52d57bc9cb174a64e5ae9a11bd0d225`.
- Live `escolar` now has 23 application tables and three starter templates.
  It retains 20 catalog items, and has no user/admin accounts or imported source
  products. All acceptance-test accounts, products and lists use disposable
  PostgreSQL clusters, never this database.
- Actual `scripts/start-local.sh` smoke check passed: backend health on 3000,
  Angular on 4200, proxied health/catalog/templates, inherited bind override,
  rejection of an occupied-port retry, and shutdown of both child servers after
  termination. A subsequent database read confirmed zero test accounts.
- Administrator bootstrap and local password recovery are documented in README;
  there is no default administrative password.

## External boundaries

Local delivery records do not prove inbox delivery. Live OAuth, sending domains,
production infrastructure, backup restoration, real printer output, and large
production workloads require their later environment-specific validation.

## Functional workflow redesign — 2026-11-10

Implemented the 19 approved input-workflow mockups in
`design/revisions/02-functional-workflows/`. Actual captures and their references
are paired in `design/revisions/03-implemented-workflows/index.html`.

The editor now dedicates the desktop viewport to the catalog and editable list.
At 1366×768, seven complete catalog rows are visible. School details, custom
supplies and spreadsheet import open focused panels. The mobile picker preserves
query, scroll position and the focused product after returning to the list.
Duplicate additions remain independent occurrences; Undo removes only the last
addition. Long names wrap, and quantities retain the existing decimal rules.

Search, personal lists, authentication, published checklists, sharing, account
review, invitations and all seven administrative input views use the new layout.
The following filter reads actual subscription state independently of ownership
or access role. The API summary now exposes that boolean without a migration.

PDF settings sit beside a real PDF.js preview, with pagination and zoom. The
renderer and worker load on demand. Downloads continue to use the existing PDF
generator and recheck access; optional preference saving remains explicit.
Failed renders clear stale page content, pending renders are canceled on close,
and modal focus isolation includes notices inserted after a dialog opens.

### Redesign comparison rounds

4. Initial implementation and rendered comparison: reorganized all input views;
   identified phone save-status contrast, picker focus restoration, long names,
   the seven-row boundary, and browser-dependent embedded PDF previews.
5. Corrected those issues, replaced the embedded viewer with the in-app renderer,
   reduced phone secondary actions, focused account deletion review, and made the
   administrator product confirmation visible alongside the selected attributes.
   A complete browser pass reached 71/76; the five remaining failures were old
   PDF button selectors. Corrected selectors and all eight focused PDF checks passed.
6. Final cleanup: collapsed optional phone location fields, removed redundant
   administrative CSS, and hardened preview error recovery and dynamic modal
   isolation. Final verification and the comparison gallery record this revision.
   The local launcher also now ignores released sockets in TIME_WAIT while still
   rejecting active listeners; restart, proxied health and the PDF worker asset
   were verified on ports 3000/4200 after the change.

### Verification

- Rust: 16 unit tests, formatting and Clippy with warnings denied passed.
- Python: 19 regression tests passed.
- API: 436 requests across all 23 acceptance groups passed, including independent
  owner/follower state and access revocation.
- Angular: 33 unit tests passed. Production build passed without warnings;
  initial bundle is approximately 285 kB (77 kB estimated transfer).
- Browser: all 77 scenarios passed, covering functionality, new focused workflows,
  keyboard behavior, Axe WCAG A/AA checks and responsive overflow.
- Viewports include 1366×768, 1440×900/1000, 390×844 and 320×800. All 12 standard
  PDF combinations and maximum-length, colored-logo, draft, historical and
  archived exports passed their content and page-bound checks.

`scripts/test-local.sh` includes the added workflow suites. Machine-readable
browser results are in `.local/qa/browser-results.json`; API evidence is in
`.local/qa/functional-20261110T044443.json`. Screenshots are under `.local/qa/ui`,
`ui-admin`, `ui-pdf` and `user-workflows`. All test accounts and mutations used
disposable PostgreSQL clusters, never the user's `escolar` data. The earlier
database inventory above is a historical observation, not a current account count.

The comparison follows the mockups' hierarchy and workflows, adapted to real
permissions, field validation, long content and responsive constraints. Catalog
category markers replace illustrative product photographs; real PDF layouts
retain their previously validated print designs. Physical printing, email,
Gmail/OAuth and deployment remain outside this local verification.

## Catalog browsing and notebook attributes — 2026-11-10

The editor now combines category, subcategory and typed attribute filters.
Available choices and counts come from all matching catalog items, before
pagination. Each facet retains alternative choices by ignoring its own selected
value when counting, while respecting the other filters. Boolean `false` remains
a usable selection. Missing attribute data does not produce invented choices.

Search now matches whitespace-separated terms across names, aliases, taxonomy,
attributes and approved source-product links, ignoring Spanish accents and case.
`cuaderno univ 100 7mm` finds the same item as the corresponding three typed
filters. The legacy catalog array remains compatible, and full 300-character
item names remain searchable within the new 500-character query bound. The
browsing endpoint loads 40 results at a time; integration coverage checks
filtering, counts and discovery beyond the legacy 200-item limit.

The desktop filter panel preserves the adjacent list workspace. Phone filters
stay inside the existing picker. Active filters can be removed individually,
cleared together or recovered from an empty result; changing subcategory retains
compatible attributes. Adding an item copies its typed attributes into that list
occurrence. Pagination preserves existing rows, and stale responses cannot
replace a newer search.

### Database preservation

- Saved a full backup before applying migration 004:
  `.local/backups/escolar-before-notebook-filters-20261110T094954Z.dump` (mode 600).
- Applied checksum-protected migration 004 to local `escolar`. It added 24
  generic notebook variants with format, sheet count, grid spacing or
  orientation where applicable. These represent school requirements, not store
  inventory or prices. Migration 003 was not changed.
- Verified all 20 pre-existing catalog items, attributes and aliases retained
  their fingerprint: `55147bd67d203e496359843c3e1786a0`. The local catalog now has
  44 items and the migration ledger contains versions 3 and 4.
- Isolated database tests verify idempotence, importer canonical keys, preservation
  of existing curation and published list snapshots, and respect for removed
  taxonomy. Application migration replay also preserves the migration ledger.
- Restarted the local launcher and verified health, 24 notebooks, exact typed
  filters, attribute text search and 40-of-44 pagination through port 4200.

### Checks and rendered review

- Rust: 17 tests, formatting, Clippy with warnings denied and build passed.
- Python: 21 regression tests passed, including the two migration tests.
- API: all 28 acceptance groups passed, with 489 requests. Final report:
  `.local/qa/functional-20261110T100334.json`.
- Angular: 36 unit tests and production build passed. Initial bundle remains
  approximately 285 kB (77 kB estimated transfer).
- The complete existing 77-scenario browser regression run found one density
  issue; the other 76 scenarios passed. Compact attribute summaries restored
  seven complete rows at 1366×768, and all three editor regression checks then
  passed. Existing PDF, administration, account and collaboration checks passed.
- New browser coverage checks combined filters and adding typed attributes at
  1366, 1440, 390 and 320 pixels, subcategory changes, empty-result recovery,
  boolean `false`, pagination, independent duplicate additions and delayed
  responses. Eight filter/result accessibility snapshots have zero Axe WCAG
  A/AA violations or horizontal viewport overflow.
- The final eight catalog scenarios all passed after the pagination cleanup,
  including preservation of focus when a user moves to another control during
  a request. Across the complete regression run and focused cleanup reruns,
  **85 distinct browser scenarios passed**. Consolidated evidence is recorded
  in `.local/qa/catalog-filter-summary.json`.

UI/UX rounds 7–9 cover the initial feature and two cleanup passes: concise
catalog summaries, preserving native select focus during refresh, maintaining
keyboard focus through pagination, and singular list counts. Visual captures
retain the approved workspace hierarchy and are available at
`design/revisions/04-catalog-browsing/index.html`. All test accounts and mutations
used disposable databases; only the verified notebook migration changed local
`escolar`.

## Categories and attributes, option C — 2026-11-10

The approved revised option C is implemented. Broad categories remain the
navigation level; former subcategory information is now a category-owned Type
attribute. The desktop editor has a collapsible left attribute drawer, compact
two-column catalog cards and the working list on the right. The category chooser
uses a single breadcrumb level. Phone browsing retains its dedicated picker,
filter view, focus and scroll position.

Type choices combine with applicable measurements. Changing Cuadriculado to
Rayado clears grid spacing while retaining compatible format and sheet-count
filters. Custom items, import classification and administrator review use the
same category metadata. Administration can manage types, available attributes,
allowed text values and conditional applicability. Categories without type
choices can still accept items. Existing unassigned or historical attribute
values remain preserved when unchanged during review.

### Data and local runtime

- Backed up local `escolar` immediately before migration:
  `.local/backups/escolar-before-category-attributes-20261110T113804Z.dump`
  (159017 bytes, mode 600).
- Applied checksum-protected migration 005. Versions 003 and 004 remain
  unchanged; the ledger now contains 3, 4 and 5. Legacy IDs and compatibility
  routes remain available internally.
- Before/after fingerprints match for all 44 catalog rows, 64 existing attribute
  rows, three aliases, source links, both draft lists and published versions.
  There were no local published versions or source links; the isolated migration
  regression separately verifies preservation of populated published snapshots.
  Evidence: `.local/qa/live-category-migration.json`.
- Restarted the local Rust backend and Angular development server. Read-only
  checks through port 4200 verify health, nine categories, 24 notebooks and 44
  total supplies. Cuadriculado + universitario + 100 hojas + 7 mm returns one
  notebook; Regla + 30 cm returns one ruler. Attribute text search also succeeds.
- Import/reimport coverage works with legacy subcategories removed and preserves
  canonical identities, curation, source snapshots and reviewed links.

### Verification and visual comparison

- Rust: 17 tests, formatting, Clippy with warnings denied and build passed.
- Python: all 24 regression tests passed, including migration preservation and
  importer/database regressions.
- API: all 31 acceptance groups passed, 549 requests. Report:
  `.local/qa/functional-20261110T112540.json`.
- Angular: all 40 unit tests passed and the production build completed without
  warnings. The component-style warning budget is now 25 kB to accommodate the
  added category configuration form; the 28 kB error limit remains unchanged.
- **88 distinct browser scenarios passed**, including existing list, import,
  collaboration, account, administrator and PDF workflows. Coverage includes
  widths 1366, 1440, 390 and 320, at least six complete desktop catalog cards,
  conditional filters, zero-result recovery, pagination, independent additions,
  keyboard focus, boolean false, initial custom-form attributes and empty-Type
  categories. Consolidated report:
  `.local/qa/category-implementation-summary.json`.
- The first visual pass found stacked filter radios and administrator checkbox
  overflow. Scoped styles corrected both; a second pass verified the affected
  editor and administrator workflows, with no Axe A/AA violations or horizontal
  viewport overflow. Review also corrected missing initial custom-form fields.
- Compared actual desktop and phone renders with the revised option C mockups.
  The final design keeps the same three-part desktop layout while fitting full
  product names and actions at laptop widths. Actual captures and reference
  links are in `design/revisions/07-implemented-categories-attributes/index.html`.

All browser and API mutations used disposable databases. Local development is
running at `http://localhost:4200`; email/Gmail and deployment remain deferred.

## Shared category and filter sidenav — 2026-11-10

The Catálogo control previously only cleared the category, and the separate
category chooser replaced the product workspace. Categories now appear first in
the left panel; selecting one replaces that panel's contents with its attributes.
Catálogo and the persistent Volver a categorías button reopen category selection
without clearing the current filters. Desktop products remain visible beside the
panel. Choosing a different category clears incompatible filters, while choosing
the same category preserves them.

The phone picker follows the same category-to-attributes sequence and offers an
explicit results button. Closing and reopening preserves its current view,
focused control and scroll position. Review caught and corrected missing sidebar
scroll restoration and an obsolete tablet category-grid rule. The category-back
button remains visible while lower attributes scroll.

- Production build passed without warnings; all 40 Angular unit tests passed.
- All 40 existing editing, import, responsive UI and user-workflow browser checks
  passed (`.local/qa/sidenav-regression.json`).
- All 15 focused catalog/editor scenarios passed
  (`.local/qa/catalog-sidenav-browser-final.json`). These verify the same panel
  at 1024, 1366, 1440, 390 and 320 pixels, the formerly inert Catálogo control,
  category search, same-category preservation, conditional filters, pagination,
  keyboard focus and phone scroll restoration. The repeatable QA expectation for
  Otros now uses actual category contents; a separate random-query case continues
  to verify empty results.
- All 21 catalog accessibility snapshots have zero Axe A/AA violations; viewport
  assertions pass. Representative desktop, tablet and phone renders were visually
  inspected and saved in
  `design/revisions/08-shared-catalog-sidenav/index.html`.

This change required no backend or database migration. All browser mutations used
the disposable QA database. The running Angular development server picked up the
changes; the app and screenshot gallery were checked locally before handoff.


## Desktop B and mobile M1 comparison workspace — 2026-11-10

Implemented the selected B comparison rows and M1 phone flow. Desktop retains a
single category/attribute panel, aligned category-specific measurements and a
compact editable working list. Phones use one state-specific header and a
full-screen category → attributes → results sequence. Text attributes use native
selects on phones; typed numeric/boolean choices remain optional. Product names
are complete, comparison labels remain accessible, and measurements retain
units unless the column label already supplies that unit. Repeated text
attributes already present in the product name no longer add redundant lines.
Units, notes, categories and ordering remain editable in item details; quantities
stay directly available. Custom items, spreadsheet import, duplicate additions,
Undo, filtering and pagination remain available.

Three implementation/verification rounds were used. The initial visual pass
identified a clipped fifth desktop row and third narrow-phone row. Reduced
spacing and redundant unit text corrected both without truncating names or
shrinking phone Add controls below 44px. Keyboard review then reproduced
Shift+Tab leaving the picker when a navigation heading held focus. The modal now
wraps focus from those non-interactive headings as well as from controls. Escape
from the category/attribute header returns to results; closing/reopening
preserves filter selections and scroll/focus.

The approved references and 13 real browser captures are available in
[the B/M1 comparison gallery](../design/revisions/11-implemented-responsive-comparison/index.html).
Captures cover 1366×768, 1440×900, 1024×900, 390×844 and 320×800. Five filtered
notebook rows fit the desktop workspace; at least three complete rows fit the
narrow phone. Full names and explicit labeled measurements take precedence over
matching the mockup's shorter illustrative names pixel for pixel.

The production build passes. The editor stylesheet reports a non-blocking
26.70kB size warning against the 25kB warning threshold (28kB error threshold);
no budget was raised. Frontend unit verification passes all 46 tests. No backend
code or database migration was needed, and browser mutations use only the
disposable QA database. Email/Gmail and deployment remain outside this local
implementation.

Final browser validation passes **56/56** scenarios with no skips or flaky
results: 40 general workflow/responsive cases
(`.local/qa/comparison-regression-final.json`) and 16 focused comparison/editor
cases (`.local/qa/comparison-catalog-final.json`). The latter cover all five
viewport widths, category-specific columns, exact typed filters including false,
conditional type changes, independent duplicate additions/Undo, pagination,
stale-request protection, compact list quantity/unit/note editing, and phone
heading Tab/Shift+Tab/Escape plus scroll/focus restoration. All **23** focused
catalog Axe A/AA snapshots report **zero violations**. Build/unit logs are
`.local/qa/comparison-build-final.log` and
`.local/qa/comparison-units-final.log`. Browser tests were completed before any
QA cleanup; the real local database was not used for test mutations.

## Catalog expansion and code/database review — 2026-11-10

Migration 006 is applied to local `escolar`: **132 additions**, **176 total items**,
**14 categories** and **381 typed attribute values**. Research and source provenance
are recorded in [CATALOG_RESEARCH_2026-11-10.md](CATALOG_RESEARCH_2026-11-10.md).
The five new categories have distinct icons and retain the shared category/filter
navigation, including the mobile category search and full-screen filter flow.

Validation passes 17 Rust tests, Clippy with warnings denied, 29 Python/PostgreSQL
tests, 46 Angular tests, production build, and 31 API groups with 549 requests.
The existing editor SCSS warning remains 26.70 kB against a 25 kB warning budget;
the budget was not changed. Browser validation covers **96 distinct scenarios**:
37 functional/catalog/editor cases and 59 UI/PDF/workflow cases. The first run's
two failures were new test assertions reading input text rather than input values;
all five expansion cases passed after correcting those assertions. Other passing
cases were retained, and the remaining 59 cases then passed. No application fix
was needed for the assertion correction.

All **11** expansion Axe A/AA captures have zero violations. Desktop, 390 px and
320 px screenshots were inspected for category scrolling/search, conditional
numeric and boolean filters, result visibility and adding/saving. They are in
`.local/qa/catalog-expansion/`. PDF verification rendered 21 generated documents
(79 pages) with zero text-bound violations, plus six reference pages. Rendered
artifacts remain in `.local/qa/rendered/`.

The real database was backed up before migration. Independent post-migration
checks found 313 validated constraints, 70 valid/ready indexes and zero orphans
across 50 foreign keys. All 132 researched item names/typed attributes/aliases
match, and all 44 original items and their attributes/aliases remain unchanged.
The draft fingerprint changed during the review; its latest edit was at
10:15:56−03, before migration at 10:21:02−03. That edit was retained. Versions,
templates, source links and legacy classification fingerprints did not change.
API, development frontend and design gallery returned HTTP 200 afterward.

Evidence is under `.local/qa/audit/`: `full-validation.log`, `expansion-rerun.log`,
`ui-final.log`, `pdf-render-final.log`, `catalog-expansion-verification.json`,
`live-expansion-api.json`, and `post-expansion/`. Test mutations used disposable
PostgreSQL only; the live write was the requested catalog migration.

The separate [codebase/database review](CODEBASE_DATABASE_REVIEW_2026-11-10.md)
records eight reproduced application defects and one reachable dependency advisory.
Those findings remain open; passing regressions do not mean they are resolved.

## Alternative supplies in one requirement — 2026-11-10

A list occurrence can now accept 2–12 supplies as alternatives. Its quantity and
unit apply to the whole requirement, and the parent can use any allowed option
or combine options to reach that total. Each requirement retains one checklist
checkbox. Separate rows remain separate requirements. The editor supports catalog
selection across filters, free options without imposed specifications, review,
editing an existing group, canceling staged changes, and explicit conversion back
to one specific item. Copies, templates, import confirmation and published
snapshots preserve the choices. Option reordering preserves checklist progress;
changing names, attributes or membership resets that row and flags review.

Storage uses the existing JSON content columns; no database migration or catalog
seed change was needed. Empty alternatives are omitted on serialization, preserving
ordinary-item compatibility and no-op publication behavior. Shared attributes are
validated against every option. A choice group cannot be submitted as one shared
catalog item. The local backend was restarted before enabling the controls, and
a read-only process check confirmed that port 3000 uses the updated executable.
All test mutations used disposable PostgreSQL; the live app remained available.

Validation:

- **21 Rust tests**, `cargo fmt --check`, and Clippy with warnings denied pass.
- **35 API groups / 632 requests** pass, including legacy no-op serialization,
  option validation and atomic rejection, copy/template/import preservation,
  immutable published snapshots and version-aware checklist transitions.
- **57 Angular tests** pass, including shared typed attributes, independent staging,
  stable occurrence identity, explicit single-item conversion and all PDF layouts.
- The production build passes. The editor stylesheet is **27.36 kB**, above the
  existing 25 kB warning threshold and below the 28 kB error threshold. Budgets were
  not raised for this change.
- **104 distinct browser scenarios** pass. The first full run passed 102 and found
  two real density regressions: only two catalog rows visible at 320 px and five
  at 1366 px. Moving the desktop action into the existing footer and shortening the
  mobile label restored the required three and six rows. The final 24-case run
  passes all catalog, editor and alternatives scenarios. No acceptance threshold
  was weakened.
- All **15 alternatives Axe A/AA captures** have zero violations. Desktop 1366 px,
  mobile 390 px and narrow 320 px screenshots were inspected, including free options
  with no sheet-count requirement.
- Four alternative PDFs render **11 pages**: one normal single-requirement example,
  plus 12-option stress documents in all three layouts. All accepted names and
  attribute markers survive pagination; checkbox counts are correct and no text
  or checkbox extends outside a page. A first-row table pagination bug found
  during implementation was fixed without changing ordinary-row behavior.

The new browser coverage is in `qa/item-alternatives.spec.ts` and is included in
`scripts/test-local.sh`. Evidence is under `.local/qa/`: `alternatives-api.log`,
`alternatives-angular-tests.log`, `alternatives-build-final.log`,
`alternatives-all-browser.log`, `alternatives-browser-final.log`,
`alternatives-browser-summary.json`, and `item-alternatives/`. A portable visual
walkthrough is in [the alternatives gallery](../design/revisions/12-item-alternatives/index.html).
The nine issues from the earlier codebase review remain separate open findings.


## Color-count coverage — 2026-11-10

Migration 007 adds seven evidence-linked variants to local `escolar`: **183 total
items, 14 categories and 397 typed attribute values**. The existing numeric
color-count field now offers 6/12/24 for ordinary colored-pencil browsing;
generic unspecified requirements remain unspecified. The importer recognizes
accented/unaccented Spanish `Lápices` without relaxing mixed-set exclusions.

Validation: 37 Python tests, 21 Rust tests, 36 isolated API groups (658 requests),
and eight relevant browser scenarios pass. The three new browser scenarios
cover 1366/390/320-pixel filtering and numeric persistence; six Axe captures have
zero violations and no horizontal overflow. Initial mobile test failures were
caused by checking result rows before leaving the filters screen; corrected
flow assertions pass. Formatting, Clippy and the Rust build pass. Angular source
is unchanged in this update, so the preceding frontend unit/build results were
not rerun. Desktop and mobile screenshots were visually reviewed.

Migration applied at 11:53−03 after backup; live API/Angular health checks return
200 and all seven variants have exact typed attributes. Existing catalog rows,
category metadata, lists, versions, templates and source-link fingerprints are
preserved. See [sources, test evidence and backup details](CATALOG_COLOR_COVERAGE_2026-11-10.md).

## Researched attribute coverage — 2026-11-10

Migration 008 implements the 44 researched findings with 81 additional supplies,
16 new definitions, 69 explicit binding additions/extensions and seven guarded
seed-item updates. The expected unchanged-baseline catalog has 264 items,
14 categories, 65 definitions and 653 typed values. Exact provenance and
measurement distinctions are recorded in the
[implementation report](CATALOG_ATTRIBUTE_IMPLEMENTATION_2026-11-10.md).

Validation passes:

- 43 Python tests, including six migration cases covering exact source data,
  preservation, idempotence, removed categories, renamed type keys and rollback
  on incompatible definitions or closed choices.
- 21 Rust tests, formatting, Clippy with warnings denied and the offline build.
- 64 Angular tests and the production build. The existing editor stylesheet
  warning remains: 27.36 kB against the 25 kB warning budget.
- 41 isolated API groups, 787 requests. Every new variant and alias is searched;
  all new attributes survive saving, publishing and copying. The first run's
  copy assertion omitted the required JSON body; the corrected test passes.
- 114 distinct browser scenarios: 55 functional and 59 layout/workflow cases.
  The initial functional run exposed the remaining legacy 200-item cap in the
  administrator's product-link selector. Complete paged loading now serves
  link and merge selectors as well as import overrides. The final 64-case batch
  includes five repeated admin cases and all 59 layout/workflow cases; all pass.

New browser cases cover separate pack quantity, sheet/color counts and fractional
dimensions; explicit false spiral requirements; independent marker tip shape and
thickness; incompatible custom-field clearing; tape millimeters/meters; hygiene
package counts at 390/320 px; and administrator moderation beyond 200 results.
The 1,000-row import test also selects an item beyond the first 200 catalog rows.
Existing alternatives, parent checklists, three PDF layouts, long-content PDF
bounds and publication regressions pass.

Eight new attribute screenshots and three admin pagination screenshots pass Axe
with no violations or horizontal document overflow. Desktop, 390 px and 320 px
captures were visually reviewed: filters, results, add actions, quantities and
custom-form controls remain readable and reachable. All write-based API/browser
tests use disposable databases, not local `escolar`.

Evidence: `.local/qa/attribute-additions/` contains Python/Rust/API logs,
`browser-results-initial.json`, `browser-tests.log`, `browser-ui-final.log`,
attribute screenshots and Axe reports. Final frontend logs are
`.local/qa/attribute-admin-candidates-unit.log` and
`.local/qa/attribute-admin-candidates-build.log`; admin captures are in
`.local/qa/attribute-admin/`.

Applied locally at **12:50:55−03** after a mode-600 custom-format backup.
Confirmed totals: **264 items, 14 categories, 65 definitions and 653 values**.
Original item rows, aliases and categories are preserved; all attribute and
metadata changes exactly match the manifest. All 33 protected application,
legacy and source-table fingerprints are unchanged. The archive listing is
readable; restoration was not tested. The app was restarted and read-only checks
through the Angular proxy verify all 81 additions, all 69 declared bindings,
boolean-false filtering, authentication on the new admin paging route and
HTTP 200 health. Backup path and detailed proof are in the implementation report
and `.local/qa/attribute-additions/{applied,live-api}.json`.
