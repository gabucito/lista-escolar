BEGIN;

CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS store_snapshot;

CREATE TABLE IF NOT EXISTS catalog.categories (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    name text NOT NULL CHECK (btrim(name) <> ''),
    sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalog.subcategories (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id bigint NOT NULL REFERENCES catalog.categories(id),
    slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    name text NOT NULL CHECK (btrim(name) <> ''),
    sort_order integer NOT NULL DEFAULT 0,
    UNIQUE (category_id, slug),
    UNIQUE (id, category_id)
);

CREATE TABLE IF NOT EXISTS catalog.items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id bigint NOT NULL REFERENCES catalog.categories(id),
    subcategory_id bigint,
    name text NOT NULL CHECK (btrim(name) <> ''),
    canonical_key text NOT NULL UNIQUE CHECK (btrim(canonical_key) <> ''),
    review_status text NOT NULL DEFAULT 'pending'
        CHECK (review_status IN ('pending', 'approved', 'rejected')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (subcategory_id, category_id)
        REFERENCES catalog.subcategories(id, category_id)
);

CREATE TABLE IF NOT EXISTS catalog.item_aliases (
    item_id uuid NOT NULL REFERENCES catalog.items(id) ON DELETE CASCADE,
    alias text NOT NULL CHECK (btrim(alias) <> ''),
    PRIMARY KEY (item_id, alias)
);

CREATE TABLE IF NOT EXISTS catalog.attribute_definitions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
    name text NOT NULL CHECK (btrim(name) <> ''),
    data_type text NOT NULL CHECK (data_type IN ('text', 'number', 'boolean')),
    unit text,
    UNIQUE (id, data_type)
);

-- Describes which filters/details are useful for each browsing subcategory.
-- Item values remain optional so incomplete user-supplied items are possible.
CREATE TABLE IF NOT EXISTS catalog.subcategory_attributes (
    subcategory_id bigint NOT NULL REFERENCES catalog.subcategories(id),
    attribute_id bigint NOT NULL REFERENCES catalog.attribute_definitions(id),
    sort_order integer NOT NULL DEFAULT 0,
    PRIMARY KEY (subcategory_id, attribute_id)
);

CREATE TABLE IF NOT EXISTS catalog.item_attributes (
    item_id uuid NOT NULL REFERENCES catalog.items(id) ON DELETE CASCADE,
    attribute_id bigint NOT NULL,
    data_type text NOT NULL,
    text_value text,
    number_value numeric,
    boolean_value boolean,
    PRIMARY KEY (item_id, attribute_id),
    FOREIGN KEY (attribute_id, data_type)
        REFERENCES catalog.attribute_definitions(id, data_type),
    CHECK (
        (data_type = 'text' AND text_value IS NOT NULL AND btrim(text_value) <> '' AND number_value IS NULL AND boolean_value IS NULL)
        OR (data_type = 'number' AND text_value IS NULL AND number_value IS NOT NULL AND boolean_value IS NULL)
        OR (data_type = 'boolean' AND text_value IS NULL AND number_value IS NULL AND boolean_value IS NOT NULL)
    )
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'catalog.item_attributes'::regclass AND conname = 'positive_attribute_values'
    ) THEN
        ALTER TABLE catalog.item_attributes ADD CONSTRAINT positive_attribute_values
            CHECK (number_value IS NULL OR number_value > 0);
    END IF;
END $$;

-- This is a catalog-only snapshot. Customer, order, payment and other store
-- data are intentionally not imported.
CREATE TABLE IF NOT EXISTS store_snapshot.brands (
    id uuid PRIMARY KEY, slug text NOT NULL, name text NOT NULL,
    deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS store_snapshot.categories (
    id uuid PRIMARY KEY, slug text NOT NULL, name text NOT NULL,
    parent_id uuid, deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS store_snapshot.products (
    id uuid PRIMARY KEY, slug text NOT NULL, name text NOT NULL,
    unit_label text, price_clp bigint NOT NULL, brand_id uuid,
    visible_in_store boolean NOT NULL, deleted_at timestamptz,
    source_updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS store_snapshot.product_variants (
    id uuid PRIMARY KEY, product_id uuid NOT NULL, sku text, name text,
    attributes jsonb NOT NULL, price_clp bigint, deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS store_snapshot.product_categories (
    product_id uuid NOT NULL, category_id uuid NOT NULL, deleted_at timestamptz,
    PRIMARY KEY (product_id, category_id)
);
CREATE TABLE IF NOT EXISTS store_snapshot.images (
    id uuid PRIMARY KEY, url text NOT NULL, alt_text text, deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS store_snapshot.product_images (
    id uuid PRIMARY KEY, product_id uuid NOT NULL, image_id uuid NOT NULL,
    position integer NOT NULL, deleted_at timestamptz
);

-- Suggestions are not confirmed links. An administrator must approve them.
CREATE TABLE IF NOT EXISTS catalog.store_product_matches (
    item_id uuid NOT NULL REFERENCES catalog.items(id),
    source_product_id uuid NOT NULL REFERENCES store_snapshot.products(id),
    review_status text NOT NULL DEFAULT 'pending'
        CHECK (review_status IN ('pending', 'approved', 'rejected')),
    match_method text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (item_id, source_product_id)
);

CREATE INDEX IF NOT EXISTS catalog_items_category_idx
    ON catalog.items (category_id, subcategory_id, review_status, name);
CREATE INDEX IF NOT EXISTS catalog_item_aliases_lower_idx
    ON catalog.item_aliases (lower(alias));
CREATE INDEX IF NOT EXISTS store_products_lower_name_idx
    ON store_snapshot.products (lower(name));
CREATE INDEX IF NOT EXISTS store_variants_product_idx
    ON store_snapshot.product_variants (product_id);
CREATE INDEX IF NOT EXISTS store_product_images_product_idx
    ON store_snapshot.product_images (product_id);
CREATE INDEX IF NOT EXISTS catalog_matches_status_idx
    ON catalog.store_product_matches (review_status, source_product_id);

CREATE OR REPLACE VIEW catalog.browse_items AS
SELECT i.id, i.name, i.canonical_key, i.review_status,
       c.slug AS category_slug, c.name AS category,
       s.slug AS subcategory_slug, s.name AS subcategory
FROM catalog.items i
JOIN catalog.categories c ON c.id = i.category_id
LEFT JOIN catalog.subcategories s ON s.id = i.subcategory_id
WHERE i.review_status IN ('approved', 'pending');

-- Items without even a candidate match remain visible to administrators for
-- later curation; this view does not classify them as school supplies.
CREATE OR REPLACE VIEW store_snapshot.products_needing_review AS
SELECT p.id, p.name, b.name AS brand, p.visible_in_store
FROM store_snapshot.products p
LEFT JOIN store_snapshot.brands b ON b.id = p.brand_id
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM catalog.store_product_matches m
      WHERE m.source_product_id = p.id AND m.review_status IN ('pending', 'approved')
  );

COMMIT;
