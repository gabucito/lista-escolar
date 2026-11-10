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
