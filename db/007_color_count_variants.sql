-- Evidence-based color-count variants for existing generic supply families.
-- Dataset SHA-256: 51216e644d4428c7df6e8586442bebaf949f33966d5e74b01ab606926cbdc81b
-- Sources and reasoning: docs/catalog-color-coverage-2026-11-10.json.
-- Run within config::migrate's advisory-lock transaction, without BEGIN/COMMIT.
-- Existing curated rows and category contracts are preserved completely.
CREATE TEMP TABLE color_variants_007_data (document jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO color_variants_007_data VALUES ($color_variants_007$
{
  "categories": [
    {
      "slug": "arte-y-dibujo",
      "name": "Arte y dibujo",
      "sort_order": 30,
      "type_key": "tipo_arte",
      "type_name": "Tipo de arte y dibujo",
      "new": false
    }
  ],
  "definitions": [
    {
      "key": "numero_colores",
      "name": "Número de colores",
      "data_type": "number",
      "unit": "colores"
    },
    {
      "key": "presentacion",
      "name": "Presentación",
      "data_type": "text",
      "unit": null
    }
  ],
  "items": [
    {
      "category": "arte-y-dibujo",
      "key": "lapices-colores:6",
      "name": "Lápices de colores, 6 colores",
      "type": "Lápices de colores",
      "attributes": {
        "numero_colores": 6
      },
      "aliases": [
        "lapices colores 6",
        "lapices de color 6 colores"
      ],
      "sources": [
        "staedtler",
        "giotto"
      ]
    },
    {
      "category": "arte-y-dibujo",
      "key": "lapices-colores:24",
      "name": "Lápices de colores, 24 colores",
      "type": "Lápices de colores",
      "attributes": {
        "numero_colores": 24
      },
      "aliases": [
        "lapices colores 24",
        "lapices de color 24 colores"
      ],
      "sources": [
        "thomas",
        "giotto"
      ]
    },
    {
      "category": "arte-y-dibujo",
      "key": "manual:temperas-6-colores",
      "name": "Témperas, 6 colores",
      "type": "Témperas",
      "attributes": {
        "numero_colores": 6,
        "presentacion": "Líquida"
      },
      "aliases": [
        "tempera 6 colores"
      ],
      "sources": [
        "artel_tempera",
        "manquecura"
      ]
    },
    {
      "category": "arte-y-dibujo",
      "key": "manual:temperas-solidas-6-colores",
      "name": "Témperas sólidas, 6 colores",
      "type": "Témperas",
      "attributes": {
        "numero_colores": 6,
        "presentacion": "Sólida"
      },
      "aliases": [
        "tempera solida 6 colores"
      ],
      "sources": [
        "artel_solida"
      ]
    },
    {
      "category": "arte-y-dibujo",
      "key": "manual:plumones-24-colores",
      "name": "Plumones, 24 colores",
      "type": "Plumones",
      "attributes": {
        "numero_colores": 24
      },
      "aliases": [
        "marcadores 24 colores"
      ],
      "sources": [
        "tis"
      ]
    },
    {
      "category": "arte-y-dibujo",
      "key": "manual:acuarelas-24-colores",
      "name": "Acuarelas, 24 colores",
      "type": "Acuarelas",
      "attributes": {
        "numero_colores": 24
      },
      "aliases": [
        "acuarela 24 colores"
      ],
      "sources": [
        "artel_acuarela"
      ]
    },
    {
      "category": "arte-y-dibujo",
      "key": "manual:lapices-pastel-24-colores",
      "name": "Lápices pastel, 24 colores",
      "type": "Lápices pastel",
      "attributes": {
        "numero_colores": 24
      },
      "aliases": [
        "pasteles 24 colores"
      ],
      "sources": [
        "maisonnette"
      ]
    }
  ]
}
$color_variants_007$::jsonb);

-- Serialize with category administration before reading its current contracts.
SELECT c.id FROM catalog.categories c
WHERE c.slug IN (SELECT value->>'slug' FROM color_variants_007_data,
    jsonb_array_elements(document->'categories'))
ORDER BY c.id FOR UPDATE OF c;

CREATE TEMP TABLE color_variants_007_categories ON COMMIT DROP AS
SELECT p->>'slug' slug,c.id category_id,d.key type_key,d.data_type,d.unit
FROM color_variants_007_data CROSS JOIN LATERAL jsonb_array_elements(document->'categories') p
JOIN catalog.categories c ON c.slug=p->>'slug'
LEFT JOIN catalog.category_type_attributes t ON t.category_id=c.id
LEFT JOIN catalog.attribute_definitions d ON d.id=t.attribute_id;

-- Resolve renamed type keys through the category's current identity. A removed
-- category stays removed; a broken existing contract requires explicit repair.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM color_variants_007_categories
        WHERE type_key IS NULL OR data_type<>'text' OR unit IS NOT NULL) THEN
        RAISE EXCEPTION 'Color variants 007: missing or incompatible category type definition';
    END IF;
END $$;

CREATE TEMP TABLE color_variants_007_definitions ON COMMIT DROP AS
SELECT d.* FROM color_variants_007_data,
    jsonb_to_recordset(document->'definitions') AS d(key text,name text,data_type text,unit text);

CREATE TEMP TABLE color_variants_007_items ON COMMIT DROP AS
SELECT c.category_id,c.type_key,i.key,i.name,i.type,
    COALESCE(i.attributes,'{}'::jsonb)||jsonb_build_object(c.type_key,i.type) attributes,
    COALESCE(i.aliases,'[]'::jsonb) aliases,
    btrim(regexp_replace(translate(lower(i.name),'áéíóúüñ','aeiouun'),'[^[:alnum:]]+',' ','g')) normalized_name
FROM color_variants_007_data,
    jsonb_to_recordset(document->'items') AS i(category text,key text,name text,type text,attributes jsonb,aliases jsonb)
JOIN color_variants_007_categories c ON c.slug=i.category;

DO $$ BEGIN
    IF EXISTS (SELECT key FROM color_variants_007_items GROUP BY key HAVING count(*)>1)
       OR EXISTS (SELECT category_id,normalized_name FROM color_variants_007_items
                  GROUP BY category_id,normalized_name HAVING count(*)>1) THEN
        RAISE EXCEPTION 'Color variants 007: duplicate proposed item identity';
    END IF;
    IF EXISTS (SELECT 1 FROM color_variants_007_items
        WHERE btrim(key)='' OR btrim(name)='' OR length(name)>300 OR btrim(type)='') THEN
        RAISE EXCEPTION 'Color variants 007: invalid proposed item name, identity or type';
    END IF;
    IF EXISTS (SELECT 1 FROM color_variants_007_items p
        CROSS JOIN LATERAL jsonb_each(p.attributes) e
        LEFT JOIN color_variants_007_definitions expected ON expected.key=e.key
        LEFT JOIN catalog.attribute_definitions actual ON actual.key=e.key
        WHERE e.key<>p.type_key AND (expected.key IS NULL OR actual.id IS NULL
            OR actual.data_type<>expected.data_type OR actual.unit IS DISTINCT FROM expected.unit)) THEN
        RAISE EXCEPTION 'Color variants 007: missing or incompatible existing attribute definition type or unit';
    END IF;
    IF EXISTS (SELECT 1 FROM color_variants_007_items p
        CROSS JOIN LATERAL jsonb_each(p.attributes) e
        LEFT JOIN catalog.attribute_definitions d ON d.key=e.key
        WHERE d.id IS NULL OR jsonb_typeof(e.value) IS DISTINCT FROM
            CASE d.data_type WHEN 'text' THEN 'string' ELSE d.data_type END
          OR (d.data_type='text' AND (btrim(e.value#>>'{}')='' OR length(e.value#>>'{}')>300))
          OR (d.data_type='number' AND CASE WHEN jsonb_typeof(e.value)='number'
              THEN (e.value#>>'{}')::numeric<=0 OR (e.value#>>'{}')::numeric>1000000 ELSE true END)) THEN
        RAISE EXCEPTION 'Color variants 007: invalid proposed typed attribute';
    END IF;
    IF EXISTS (SELECT 1 FROM color_variants_007_items p
        CROSS JOIN LATERAL jsonb_each(p.attributes) e
        JOIN catalog.attribute_definitions d ON d.key=e.key
        LEFT JOIN catalog.category_attributes a ON a.category_id=p.category_id AND a.attribute_id=d.id
        WHERE a.attribute_id IS NULL
          OR (cardinality(a.applies_to_types)>0 AND NOT p.type=ANY(a.applies_to_types))
          OR (cardinality(a.options)>0 AND NOT (e.value#>>'{}')=ANY(a.options))) THEN
        RAISE EXCEPTION 'Color variants 007: proposed value conflicts with existing category attribute contract';
    END IF;
END $$;

CREATE TEMP TABLE color_variants_007_inserted (id uuid PRIMARY KEY,canonical_key text NOT NULL) ON COMMIT DROP;
WITH inserted AS (
    INSERT INTO catalog.items(category_id,name,canonical_key,review_status)
    SELECT p.category_id,p.name,p.key,'approved' FROM color_variants_007_items p
    WHERE NOT EXISTS(SELECT 1 FROM catalog.items i WHERE i.canonical_key=p.key)
      AND NOT EXISTS(SELECT 1 FROM catalog.items i WHERE i.category_id=p.category_id
          AND btrim(regexp_replace(translate(lower(i.name),'áéíóúüñ','aeiouun'),'[^[:alnum:]]+',' ','g'))=p.normalized_name)
    ON CONFLICT(canonical_key) DO NOTHING RETURNING id,canonical_key
)
INSERT INTO color_variants_007_inserted SELECT * FROM inserted;

INSERT INTO catalog.item_attributes(item_id,attribute_id,data_type,text_value,number_value,boolean_value)
SELECT i.id,d.id,d.data_type,
    CASE WHEN d.data_type='text' THEN e.value#>>'{}' END,
    CASE WHEN d.data_type='number' THEN (e.value#>>'{}')::numeric END,
    CASE WHEN d.data_type='boolean' THEN (e.value#>>'{}')::boolean END
FROM color_variants_007_inserted i JOIN color_variants_007_items p ON p.key=i.canonical_key
CROSS JOIN LATERAL jsonb_each(p.attributes) e JOIN catalog.attribute_definitions d ON d.key=e.key;

INSERT INTO catalog.item_aliases(item_id,alias)
SELECT DISTINCT i.id,lower(btrim(alias)) FROM color_variants_007_inserted i
JOIN color_variants_007_items p ON p.key=i.canonical_key
CROSS JOIN LATERAL jsonb_array_elements_text(p.aliases) alias
WHERE btrim(alias)<>'' ON CONFLICT(item_id,alias) DO NOTHING;
