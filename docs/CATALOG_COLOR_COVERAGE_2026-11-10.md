# Color-count catalog review — 2026-11-10

The `numero_colores` attribute already existed as a number with the unit
`colores`. The live catalog had 176 items and 381 typed values, but all ten
items with an explicit color count had **12 colors**. Neither six nor
24 colors had a matching variant, so their filters correctly returned zero
results. Explicit counts in existing item names were already represented by
attributes; the gap was catalog coverage.

## Added variants

| Generic requirement | Color count | Primary evidence |
|---|---:|---|
| Lápices de colores | 6 | [STAEDTLER Noris 185 C6](https://www.staedtler.com/uk/en/products/products-for-colouring/coloured-pencils/noris-colour-185-coloured-pencil-185-c6/), corroborated by [Giotto Colors 3.0](https://www.fila.it/int/en/product/giotto-colors-3-0/) |
| Lápices de colores | 24 | [Saint Thomas, fifth grade 2026, page 1](https://saintthomas.cl/documentos/Lista-utiles-2026/Lista%20de%20%C3%9Atiles%205to%20B%C3%A1sico-2026.pdf) |
| Témperas | 6 | [Artel 2025 catalogue, printed page 58](https://www.artel.cl/wp-content/uploads/2024/11/Catalogo_Artel_2025.pdf) and [Manquecura Kínder 2026, page 3](https://www.ddee.cl/upload_archivos/lista_utiles/upload/2026/VLC/Tradicional/K/archivo.pdf) |
| Témperas sólidas | 6 | [Artel solid tempera](https://www.artel.cl/producto/tempera-solida-6-colores/) |
| Plumones | 24 | [The International School La Serena, fifth grade 2026, page 1](https://www.tisls.cl/portal/wp-content/uploads/2025/12/Lista05-2026.pdf) |
| Acuarelas | 24 | [Artel 24-color watercolors](https://tienda.artel.cl/products/estuche-acuarelas-en-pastillas-24-colores) |
| Lápices pastel | 24 | [La Maisonnette, Jardín 2026, page 1](https://www.lamaisonnette.cl/wp-content/uploads/2025/12/Jardin-Listas-de-Utiles-2026-.pdf) |

Manufacturer evidence confirms generic formats, not local stock or an approved
store-product match. Color counts are distinct from pencil pieces and wholesale
pack sizes: bicolor pencils may provide two colors per pencil. The STAEDTLER
product was verified through its official indexed text; its direct UK page
returned HTTP 429. The [official catalogue](https://www.staedtler.com/fileadmin/user_upload/Product/PDF/STAEDTLER-General-Catalogue-2022_GB.1645707372.pdf)
also lists 185 C6 as six ordinary pencils in assorted colors. Giotto's regular
pencil page was fetched directly. No dry/oil pastel subtype, pencil size, brand
or mandatory jar volume is inferred. Generic items without a stated count stay
unspecified.

## Implementation

[Migration 007](../db/007_color_count_variants.sql) embeds the frozen
[evidence-linked dataset](catalog-color-coverage-2026-11-10.json) and records its
hash. It adds seven items and sixteen typed values while preserving existing
rows and category metadata. The resulting unmodified seed has **183 items,
14 categories and 397 typed values**. Ordinary pencil keys reuse the importer's
`lapices-colores:6` and `lapices-colores:24` identities.

The importer now recognizes the ordinary Spanish plural `Lápices`/`Lapices`,
as well as its existing singular form. Mixed sets, bicolor, jumbo and other
unsupported specifications still require review. This fix does not import a
store snapshot or approve any store matches.

Category facets derive their values from the catalog. No frontend change is
needed: select **Arte y dibujo → Tipo: Lápices de colores → Número de colores**
to choose 6, 12 or 24. On mobile, open **Agregar útiles**, choose the same filters,
then **Ver útiles**. Search also accepts names such as `lapices colores 6` and
`lapices colores 24`.

## Validation and application

- All 37 Python tests pass, including six focused migration tests and the
  importer regressions. The category-contract test was also rerun after adding
  its type-applicability subcase.
- All 21 Rust unit tests pass; formatting, Clippy and the offline build pass.
- All 36 isolated API groups pass (658 requests), including every new variant,
  alias search, numeric facets and migration-ledger replay.
- Eight relevant browser scenarios pass across the initial run and focused
  rerun. Color-count filtering and persistence were checked at 1366, 390 and
  320 pixels. Six new screenshots have zero Axe violations and no horizontal
  overflow. The first phone assertions incorrectly expected result rows while
  the filters screen was open; the test now checks the result-count action
  before opening results. No app change or acceptance reduction was needed.
- Applied migration 007 to local `escolar` at **2026-11-10 11:53−03**, after a
  custom-format backup. The archive listing is readable; a restore was not
  rehearsed. The live API returns all seven new variants and pencil facet
  values **6 (one item), 12 (two items), 24 (one item)**. API and Angular both
  respond with HTTP 200.
- Existing catalog rows, aliases, category metadata, list/version/template
  fingerprints, legacy classifications and source-product/link fingerprints
  are unchanged. The previous migration 006 and its dataset retain their hashes.

Local evidence is under `.local/qa/color-coverage/`: `audit.json`,
`python-tests.log`, `api-tests.log`, `browser-tests.log`,
`browser-colors-final.log`, `applied.json` and `live-api-after.json`.
Screenshots and Axe results are under `.local/qa/catalog-expansion/` with
`color-count` in their names. The backup is
`.local/backups/escolar-before-color-variants-20261110T145306Z.dump`.
Browser fixtures were stopped and their disposable cluster removed; local
user data was used only for read-only inspection and the additive migration.
