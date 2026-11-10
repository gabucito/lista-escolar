-- Generic notebook requirements for local browsing, independent of store stock.
-- Applied inside config::migrate's advisory-lock transaction. Do not add a
-- transaction boundary here or alter this script after its checksum is recorded.
-- Canonical keys and format values match scripts/import_store_catalog.py so a
-- later source import reuses these items without creating duplicate notebooks.
-- Existing items, including pending/rejected or corrected entries, are untouched.
-- Removed/renamed taxonomy is respected: only still-present subcategories seed.
WITH variants(format_key, format_name, subcategory, ruling, sheets, spacing, orientation) AS (
    VALUES
        ('universitario', 'universitario', 'cuadriculados', 'cuadriculado', 100, 7, NULL::text),
        ('universitario', 'universitario', 'cuadriculados', 'cuadriculado', 100, 5, NULL),
        ('universitario', 'universitario', 'cuadriculados', 'cuadriculado', 80, 7, NULL),
        ('universitario', 'universitario', 'cuadriculados', 'cuadriculado', 80, 5, NULL),
        ('universitario', 'universitario', 'cuadriculados', 'cuadriculado', 60, 7, NULL),
        ('college', 'college', 'cuadriculados', 'cuadriculado', 100, 7, NULL),
        ('college', 'college', 'cuadriculados', 'cuadriculado', 100, 5, NULL),
        ('college', 'college', 'cuadriculados', 'cuadriculado', 80, 7, NULL),
        ('college', 'college', 'cuadriculados', 'cuadriculado', 60, 7, NULL),
        ('medio-oficio', 'medio oficio', 'cuadriculados', 'cuadriculado', 40, 7, NULL),
        ('universitario', 'universitario', 'rayados', 'rayado', 100, NULL, NULL),
        ('universitario', 'universitario', 'rayados', 'rayado', 80, NULL, NULL),
        ('college', 'college', 'rayados', 'rayado', 80, NULL, NULL),
        ('college', 'college', 'rayados', 'rayado', 60, NULL, NULL),
        ('college', 'college', 'composicion', 'de composición', 80, NULL, NULL),
        ('universitario', 'universitario', 'composicion', 'de composición', 80, NULL, NULL),
        ('medio-oficio', 'medio oficio', 'composicion', 'de composición', 40, NULL, NULL),
        ('medio-oficio', 'medio oficio', 'caligrafia', 'de caligrafía', 40, NULL, 'horizontal'),
        ('medio-oficio', 'medio oficio', 'caligrafia', 'de caligrafía', 40, NULL, 'vertical'),
        ('college', 'college', 'caligrafia', 'de caligrafía', 80, NULL, 'vertical'),
        ('universitario', 'universitario', 'croquis', 'de croquis', 80, NULL, NULL),
        ('college', 'college', 'croquis', 'de croquis', 80, NULL, NULL),
        ('universitario', 'universitario', 'lisos', 'liso', 80, NULL, NULL),
        ('college', 'college', 'lisos', 'liso', 40, NULL, NULL)
), prepared AS (
    SELECT
        'cuaderno:' || format_key || ':' || subcategory || ':' ||
            COALESCE(orientation, '-') || ':' || COALESCE(spacing::text, '-') || ':' || sheets AS key,
        'Cuaderno ' || format_name || ' ' || ruling ||
            CASE WHEN orientation IS NULL THEN '' ELSE ' ' || orientation END ||
            CASE WHEN spacing IS NULL THEN '' ELSE ' ' || spacing || ' mm' END ||
            ', ' || sheets || ' hojas' AS name,
        subcategory,
        jsonb_strip_nulls(jsonb_build_object(
            'formato', format_name,
            'numero_hojas', sheets,
            'cuadricula_mm', spacing,
            'orientacion', orientation
        )) AS attributes
    FROM variants
), inserted AS (
    INSERT INTO catalog.items (category_id, subcategory_id, name, canonical_key, review_status)
    SELECT c.id, s.id, p.name, p.key, 'approved'
    FROM prepared p
    JOIN catalog.categories c ON c.slug = 'cuadernos'
    JOIN catalog.subcategories s ON s.category_id = c.id AND s.slug = p.subcategory
    ON CONFLICT (canonical_key) DO NOTHING
    RETURNING id, canonical_key
)
INSERT INTO catalog.item_attributes (item_id, attribute_id, data_type, text_value, number_value)
SELECT i.id, a.id, a.data_type,
    CASE WHEN a.data_type = 'text' THEN entry.value #>> '{}' END,
    CASE WHEN a.data_type = 'number' THEN (entry.value #>> '{}')::numeric END
FROM inserted i
JOIN prepared p ON p.key = i.canonical_key
CROSS JOIN LATERAL jsonb_each(p.attributes) entry
JOIN catalog.attribute_definitions a ON a.key = entry.key
ON CONFLICT (item_id, attribute_id) DO NOTHING;
