# Catalog attribute implementation — 2026-11-10

The catalog expansion implements the 44 findings in the [attribute research report](CATALOG_ATTRIBUTE_RESEARCH_2026-11-10.md). It adds optional specifications and concrete, independently selectable supplies while keeping broad requirements available.

The [frozen additions manifest](catalog-attribute-additions-2026-11-10.json) contains 81 new items, 16 new attribute definitions, 69 explicit category/attribute bindings, seven guarded updates to existing seed items, and provenance from 44 sources. Its `finding_coverage` records map every research finding to bindings, new items, or guarded updates. The 69 bindings include extensions to existing bindings; they are not 69 entirely new database rows.

[Migration 008](../db/008_attribute_coverage.sql) embeds the executable subset of that manifest. The manifest SHA-256 is `8b3bf014363d5d2e615bbd0456c64e0aaee8b74522e5a6688bbdb3e37dcfd807`. Earlier applied migrations and research evidence remain unchanged.

## Catalog additions

| Category | New items | Representative coverage |
| --- | ---: | --- |
| Arte y dibujo | 16 | Paint volume/color, sketchbook dimensions and sheets, brush number/shape, air-drying modeling paste weight |
| Organización | 15 | University notebook covers by color, oficio folders by color, 20-sleeve folder |
| Escritura | 13 | HB/2B graphite, eraser presence, body shape, marker tip shape/thickness, liquid corrector, highlighter colors |
| Papeles y cartulinas | 7 | Grammage, ream sheets, cardstock dimensions/sheets/colors, finishes, EVA colors |
| Pegado y corte | 7 | Glue weight/family/washability, left-handed scissors, tape width and length |
| Aseo | 6 | Soap/alcohol volume, tissues/wipes per package, towel dimensions |
| Cuadernos | 4 | Margins, spiral presence/absence, 150 sheets |
| Música | 4 | Recorder fingering, melodica and metallophone note counts |
| Manualidades | 3 | Yarn length, sticks per bag, glitter pompons |
| Geometría | 2 | Protractor range, set-square angle, plastic material |
| Lectura y consulta | 2 | Spanish definitions versus synonyms/antonyms dictionaries |
| Tecnología | 1 | Exact 16 GB USB variant |
| Material didáctico | 1 | Gridded whiteboard dimensions |
| **Total** | **81** | |

No categories are created. Thirteen existing categories receive additions; Otros remains unchanged. Starting from the researched baseline of 183 items, 14 categories, 49 definitions and 397 attribute values, the expected unchanged-seed totals are **264 items, 14 categories, 65 definitions and 653 values**. New items contribute 250 values, including their type; guarded enrichment adds six values, and the scissors capitalization correction replaces one existing value.

The 16 new definitions are:

| Key | Meaning | Type/unit |
| --- | --- | --- |
| `alcance_transportador_grados` | Protractor range | Number, ° |
| `angulo_escuadra_grados` | Set-square angle | Number, ° |
| `ancho_mm` | Width | Number, mm |
| `largo_m` | Length | Number, m |
| `gramaje_g_m2` | Paper grammage | Number, g/m² |
| `numero_fundas` | Sleeve count | Number, fundas |
| `numero_orificios` | Sharpener hole count | Number, orificios |
| `unidades_por_envase` | Contents per package | Number, unidades |
| `con_espiral` | Spiral binding specified | Boolean |
| `con_margen` | Margin specified | Boolean |
| `lavable` | Washability specified | Boolean |
| `contenido_diccionario` | Dictionary scope | Text |
| `digitacion_flauta` | Recorder fingering system | Text |
| `forma_cuerpo` | Pencil body shape | Text |
| `grosor_punta` | Tip thickness class | Text |
| `tipo_adhesivo` | Adhesive family | Text |

Every new definition has at least one sourced item or guarded update with a concrete value. Existing fields supply the remaining dimensions. The shared `tipo_pauta` label changes from the unchanged starter label “Pauta musical” to “Tipo de pauta”; administrator-customized labels are retained.

## Preservation and migration behavior

Existing unspecified items remain selectable. The migration does not rewrite list drafts, published versions, templates, alternatives or quantities. Attribute absence stays unspecified; it does not become `false`. Both explicit spiral/eraser boolean values are represented where sources support them.

Only seven original approved seed rows can receive metadata changes: the jumbo triangular graphite pencil gains its body shape; the double sharpener gains two holes; two white-glue and two silicone items gain their named adhesive family; and the original rounded scissors normalize `redonda` to `Redonda`. Each update requires an exact canonical key, category, name, approval status and complete original attribute snapshot. Any curated difference skips that update.

Migration 008 resolves current category type keys dynamically, preserves existing binding choices/order, extends applicability without narrowing unrestricted bindings, and leaves removed categories removed. Existing canonical-key or normalized-name collisions are retained across review states. Incompatible definitions, units or closed choices reject the transaction rather than silently changing administrator contracts. New aliases attach only to new rows. The migration does not fabricate store products or store matches.

Ordinary variants reuse the [store importer](../scripts/import_store_catalog.py) identities: `lapiz-grafito:hb:no-especificada`, `lapiz-grafito:2b:no-especificada`, `lapiz-grafito:hb:con-goma`, `lapiz-grafito:hb:sin-goma`, and `pegamento-barra:20-g`. Other curated variants use descriptive manual keys. This lets later recognized imports resolve the ordinary variants without creating parallel identities.

## Provenance and interpretation limits

The manifest links each item/update to source IDs and research finding IDs; its `sources` array supplies URLs and verification status. Consult the [research source inventory](CATALOG_ATTRIBUTE_RESEARCH_2026-11-10.md) and the manifest for those links. Directly fetched evidence and indexed-only evidence are distinguished. Historical manufacturer catalogs and a 2025 school list establish formats, not current stock or universal 2026 requirements.

Values are combined only where the source supports the combination. The eight university-cover colors and six oficio-folder colors are individual documented pairings, not a generated product of all formats and colors. Missing dimensions, colors and ruling details are left open.

Package contents differ from list quantity: a box of 90 tissues is one selectable requirement, whose requested number of boxes remains the list quantity. The cardstock pack has **18 sheets and 14 colors**, not 18 colors. Adhesive grams remain separate from milliliters; paper grammage remains separate from item weight. Marker shape remains separate from thickness. Air-drying modeling paste is not inferred to be firing clay or cold porcelain.

Exact USB 16 GB and melodica 32-note variants are supported independently. School wording such as “minimum 16 GB” or “at least 32 keys” still belongs in the requirement notes or explicit acceptable alternatives; this change does not add minimum/range acceptance operators.

## Access beyond the previous result cap

The expanded catalog exceeds 200 items. The [administration catalog](../frontend/src/app/pages/admin/admin.ts) now uses paginated results with 50 items per page, a result range and previous/next controls. Filtering resets to the first page, stale responses are ignored, and edits that invalidate the current page recover to an available page.

The editor's [spreadsheet import mapping](../frontend/src/app/pages/editor/editor.ts) fetches every public catalog page for manual overrides and merges matching candidates by ID. Supplies beyond the old array endpoint's cap therefore remain available for manual selection.

Administrator product-link and merge selectors also fetch all matching pages.
They retain valid selections and ignore obsolete responses after a new search,
navigation or logout.

## Validation and application status

Validation passes: **43 Python tests, 21 Rust tests, 64 Angular tests, 41 API groups
(787 requests), and 114 distinct browser scenarios**. Formatting, Clippy and
Rust/Angular builds pass; the existing editor stylesheet budget warning remains.
The [migration checks](../tests/test_attribute_coverage.py) cover manifest/hash
agreement, exact typed rows, expected totals, repeat application, preservation of
saved lists and curated records, removed categories, dynamic type keys, and
transactional rejection of incompatible contracts. Desktop/mobile screenshots
were reviewed, with zero Axe violations in the new attribute/admin captures.
The browser-discovered product-link cap was fixed and affected cases rerun.
See [validation details](VALIDATION.md#researched-attribute-coverage--2026-11-10).

**Applied to local `escolar` at 12:50:55−03 on 2026-11-10:** **264 items,
14 categories, 65 definitions and 653 values**. All original item rows, aliases
and categories remain unchanged; attribute/metadata changes exactly match the
manifest. All **33 protected table fingerprints**, including saved lists,
published versions, templates and store/source data, remain unchanged.

Backup: `.local/backups/escolar-before-attribute-additions-20261110T155055.075332Z.dump`
(107,683 bytes, mode 600). Its archive listing was checked; restoration was not
tested. The local app was restarted, and read-only checks through port 4200
verified all 81 new items, their exact attributes, 69 declared bindings, boolean
false filtering and the authenticated admin paging route. Evidence is in
`.local/qa/attribute-additions/applied.json`, `before.json`, `after.json` and
`live-api.json`. This work does not deploy the application or enable email integrations.
