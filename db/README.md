# Generic supply catalog

The catalog is stored in PostgreSQL and is used by the Rust API, Angular list
editor, and separate administrator portal. The full product requirements are in
[the specification](../docs/SPECIFICATION.md).
The current implementation phase is the local core application; live email/Gmail
integration and production deployment are deferred to later phases. Both remain
required for the first public release.

## Observed local state

A read-only inspection on **2026-11-10** connected to `escolar` at
`localhost:5432` using PostgreSQL 18.3. It found the `catalog` and `store_snapshot`
schemas with 15 tables in total, and the catalog/review views executed successfully.

| Observed data | Count |
| --- | ---: |
| Catalog categories | 9 |
| Catalog subcategories | 38 |
| Generic items | 20, all approved |
| Item attribute values | 3 |
| Source products | 0 |
| Source variants | 0 |
| Store-product matches | 0 |

These counts describe that inspection only. They verify schema and starter-seed
availability, not a populated store-product snapshot or pending match suggestions.
Recheck the target database before relying on its contents or applying changes.

Later on the same date, application migration 003 added 23 `app` tables and
three starter templates. A custom-format backup was saved under
`.local/backups/escolar-before-app-20261110T034040Z.dump` first. The catalog-item
fingerprint and source-product count were unchanged after migration. No user or
administrator was seeded into the real database; acceptance fixtures live only
in disposable PostgreSQL clusters.

Migration `004_notebook_catalog.sql` adds 24 brand-independent notebook
requirements on an unmodified starter taxonomy: cuadriculados, rayados,
composición, caligrafía, croquis and lisos. Their format, sheet count, grid spacing
and orientation are typed attributes; sheet counts are not page counts. The
seed uses the same canonical keys as the store importer, so later imports reuse
the generic item while store links still require separate review. It creates no
brands, products, prices or approved store matches.

Existing same-key items are preserved completely, including pending/rejected
status, corrected names, attributes and aliases. Attributes are inserted only
for newly created rows. Renamed or removed notebook taxonomy is not recreated;
only surviving starter subcategories receive their variants. Application lists
and published versions are not changed. The backend records migration 004's
checksum under the same advisory lock and transaction as migration 003.

Migration 005 adds category-owned attributes and converts existing classifications
to type values. It preserves generic item identities, canonical keys, existing
attribute values, aliases, source links and published list snapshots. Type options
and conditional applicability are managed by the administrator. Legacy grouping
records remain available for compatibility, while imports use category and type
attributes directly and can run without those legacy records. Run application
migrations before importing a store snapshot; the importer reports a missing
migration 005 explicitly. Applied migrations 003 and 004 remain unchanged.

Migration `006_catalog_expansion.sql` adds 132 generic supplies and five categories
based on 15 primary Chilean school-list sources for 2026. On the unmodified
post-005 catalog, this changes 44 items and nine categories to 176 items and 14
categories. It preserves existing curated items, category/type changes, lists,
published versions and source links, and adds typed, conditional attributes
without restoring subcategories. Five isolated PostgreSQL migration tests pass,
including rerun idempotence, identity/name collisions, removed-category handling
and transactional rejection of incompatible definitions. **Application to the
local `escolar` database completed on 2026-11-10 at 10:21−03.** The post-migration
audit confirms 176 items, 14 categories and 381 attribute values, with the original
44 items, their attributes and aliases preserved. See the
[research summary and source evidence](../docs/CATALOG_RESEARCH_2026-11-10.md).
The historical counts above describe earlier inspections and remain unchanged.

## Local connection

The project owner supplied a local database named `escolar`. Connection details
can be kept in `.local/pgpass`, which is ignored by Git and must have permission
`0600`. Its single non-comment line uses PostgreSQL's password-file format:

```text
host:port:database:username:password
```

Escape a literal `:` or `\` in a field with a backslash. Do not commit this file
or put the password in a command or chat message. The helper derives the
connection target without printing the password, then lets PostgreSQL use the
file for authentication:

```bash
python3 scripts/psql_configured.py --
```

Additional arguments are forwarded to `psql`. For example:

```bash
python3 scripts/psql_configured.py -- -c 'SELECT current_database()'
```

The database server must already be running. `scripts/dev-db.sh` is an optional,
separate local development cluster; it does **not** connect to the owner's
`escolar` database.

## Structure

`db/003_application.sql` adds the `app` schema for accounts, sessions, lists,
immutable published versions, collaboration, progress, reports, imports and
sanitized logos. The backend applies it transactionally under an advisory lock
and records its checksum in `app.schema_migrations`. Existing `catalog` and
`store_snapshot` records are preserved. After a migration has been applied,
schema changes belong in a new migration rather than editing its recorded SQL.

The migration includes three clearly labeled starter templates. It does not
create an administrator or import a store dump. Create the first administrator
with `cargo run -- create-admin administrador` and enter the password privately.

`catalog` contains the app's brand-independent items:

- `categories` provide broad groups. `category_type_attributes` identifies each
  category's type attribute; `category_attributes` assigns definitions, allowed
  options, type-dependent applicability and display order.
- `attribute_definitions` and `item_attributes` describe typed details such as
  type, notebook format, sheet count and grid spacing. Legacy `subcategories`,
  `subcategory_attributes` and `legacy_subcategory_types` remain compatibility
  data, without a user-facing subcategory navigation level.
- `items` and `item_aliases` provide generic names and alternative names.
- `store_product_matches` stores proposed or reviewed links to store products.
- `browse_items` includes categories, status, and attributes for browsing.
- `product_matches_for_review` shows pending matches and their source details.

`store_snapshot` is designed to hold only store catalog fields extracted from the dump:
products, brands, store categories, variants, and image references. This is a
**one-time snapshot**; names, prices, images, and availability are not live.
Customer, order, payment, staff, and other non-catalog tables are not imported.
The `products_needing_review` view lists active source products without a pending
or approved match; it includes non-school merchandise and is a review queue,
not a list of confirmed school supplies.

The source snapshot and product-review views are for administrators. Application
database roles and permissions must be configured before exposing the app; the
parent-facing experience must not expose store products in the first release.

## Browse the data

For example, to inspect generic notebooks and their attributes:

```sql
SELECT attributes->'tipo_cuaderno'->>'value' AS tipo, name, review_status, attributes
FROM catalog.browse_items
WHERE category_slug = 'cuadernos'
ORDER BY tipo, name;
```

To review proposed store links:

```sql
SELECT generic_name, source_product_name, source_brand, match_method
FROM catalog.product_matches_for_review
ORDER BY generic_name, source_product_name;
```

Generic candidates produced by the importer are marked `pending`; proposed
store-product matches are also `pending`. They are not confirmed links. The
starter catalog also includes a small manually curated set of approved generic
items. A pending shared catalog item is intended to remain visible with a
pending-review label, as specified for the app.

The deterministic importer currently recognizes only some notebooks, colored
pencils, graphite pencils, drawing blocks, sketchbooks, rulers, and glue sticks.
It skips many ambiguous names and meaningful specifications it cannot reliably
represent. The remaining products need further curation; source-product counts
must not be mistaken for the number of normalized generic supplies. No automatic
rule approves a store-product match.

Dimension matching uses the store's centimetre convention for bare dimensions
and accepts explicit `cm`; other explicit length units remain unmatched for
review. Glue weights recognize `g`, `gr`, `grs`, and `gramo(s)`. Fractional or
unsupported glue quantities remain for review instead of falling back to a
generic item with an unspecified weight.

## Reproducing the schema and import

Inspect the target database first; the migration files create the `catalog` and
`store_snapshot` schemas. Do not run them on unrelated existing schemas with the
same names. For an empty target configured in `.local/pgpass`:

```bash
python3 scripts/psql_configured.py -- -f db/001_catalog.sql -f db/002_seed_catalog.sql
cargo run -- migrate
```

That step creates the schema and starter seed; it does not load `melqui.dump` or
generate store-product match suggestions. To load source catalog data, run the
separate import step:

```bash
python3 scripts/import_store_catalog.py --pgpass .local/pgpass
```

The importer expects the plain-text PostgreSQL dump `melqui.dump` in the project
root by default. A different dump path can be passed as the first argument.
`--dry-run` extracts and counts catalog data without connecting to a database.
For other connections, pass `--database` and, if needed, `--host`, `--port`, and
`--user`; supply the password via the standard PostgreSQL password file.

The source import and generated candidate insertion run in one transaction.
Reruns do not update existing snapshot rows or reset reviewed matches; they are
not an ongoing synchronization mechanism. Failed imports roll back their import
transaction. Keep the original dump out of version control.

## Validation

```bash
python3 -m unittest discover -s tests -v
```

The tests cover catalog matching, protected connection-file parsing, and an
isolated PostgreSQL integration test when server binaries are available. The
integration test uses PostgreSQL single-user mode and a disposable cluster under
`/tmp`, so it does not modify `escolar`.
