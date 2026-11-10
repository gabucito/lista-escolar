-- Category-level attributes replace subcategory navigation. Legacy identifiers
-- remain available for existing clients and canonical importer identities.
-- Run within the application's checksum-protected migration transaction.
CREATE TABLE catalog.category_type_attributes (
    category_id bigint PRIMARY KEY REFERENCES catalog.categories(id) ON DELETE CASCADE,
    attribute_id bigint NOT NULL UNIQUE REFERENCES catalog.attribute_definitions(id)
);
CREATE TABLE catalog.category_attributes (
    category_id bigint NOT NULL REFERENCES catalog.categories(id) ON DELETE CASCADE,
    attribute_id bigint NOT NULL REFERENCES catalog.attribute_definitions(id),
    options text[] NOT NULL DEFAULT '{}',
    applies_to_types text[] NOT NULL DEFAULT '{}',
    sort_order integer NOT NULL DEFAULT 0,
    PRIMARY KEY (category_id, attribute_id)
);
CREATE TABLE catalog.legacy_subcategory_types (
    subcategory_id bigint PRIMARY KEY REFERENCES catalog.subcategories(id) ON DELETE CASCADE,
    attribute_id bigint NOT NULL REFERENCES catalog.attribute_definitions(id),
    type_value text NOT NULL CHECK (btrim(type_value) <> '')
);

DO $$ DECLARE c record; definition_id bigint; type_key text; BEGIN
    FOR c IN SELECT * FROM catalog.categories ORDER BY id LOOP
        type_key := CASE c.slug
            WHEN 'cuadernos' THEN 'tipo_cuaderno' WHEN 'escritura' THEN 'tipo_escritura'
            WHEN 'arte-y-dibujo' THEN 'tipo_arte' WHEN 'geometria' THEN 'tipo_geometria'
            WHEN 'papeles' THEN 'tipo_papel' WHEN 'pegado-y-corte' THEN 'tipo_pegado_corte'
            WHEN 'organizacion' THEN 'tipo_organizacion' WHEN 'aseo' THEN 'tipo_aseo'
            ELSE 'tipo_categoria_' || c.id END;
        INSERT INTO catalog.attribute_definitions(key,name,data_type)
        VALUES(type_key,CASE WHEN c.slug='cuadernos' THEN 'Tipo de cuaderno' ELSE 'Tipo de ' || lower(c.name) END,'text')
        ON CONFLICT (key) DO NOTHING;
        SELECT id INTO definition_id FROM catalog.attribute_definitions WHERE key=type_key AND data_type='text';
        IF definition_id IS NULL THEN RAISE EXCEPTION 'Existing attribute % is not a text type',type_key; END IF;
        INSERT INTO catalog.category_type_attributes VALUES(c.id,definition_id);
        INSERT INTO catalog.category_attributes(category_id,attribute_id,sort_order) VALUES(c.id,definition_id,0);
    END LOOP;
END $$;

WITH names(category,subcategory,original,label) AS (VALUES
    ('cuadernos','cuadriculados','Cuadriculados','Cuadriculado'),
    ('cuadernos','rayados','Rayados o de línea','Rayado'),
    ('cuadernos','composicion','Composición','Composición'),
    ('cuadernos','caligrafia','Caligrafía','Caligrafía'),
    ('cuadernos','croquis','Croquis','Croquis'),('cuadernos','lisos','Lisos','Liso'),
    ('cuadernos','otros','Otros cuadernos','Otro'),
    ('escritura','grafito','Lápices grafito','Grafito'),
    ('escritura','boligrafos','Lápices pasta y bolígrafos','Bolígrafo'),
    ('escritura','destacadores','Destacadores','Destacador'),
    ('escritura','correctores','Correctores','Corrector'),
    ('escritura','gomas','Gomas de borrar','Goma'),('escritura','sacapuntas','Sacapuntas','Sacapuntas'),
    ('arte-y-dibujo','croqueras','Croqueras','Croquera'),('arte-y-dibujo','blocks','Blocks de dibujo','Block'),
    ('arte-y-dibujo','lapices-colores','Lápices de colores','Lápices de colores'),
    ('arte-y-dibujo','plumones','Plumones','Plumones'),('arte-y-dibujo','temperas','Témperas','Témperas'),
    ('arte-y-dibujo','acuarelas','Acuarelas','Acuarelas'),('arte-y-dibujo','pinceles','Pinceles','Pincel'),
    ('arte-y-dibujo','plasticina','Plasticina','Plasticina'),
    ('geometria','reglas','Reglas','Regla'),('geometria','escuadras','Escuadras','Escuadra'),
    ('geometria','transportadores','Transportadores','Transportador'),('geometria','compases','Compases','Compás'),
    ('papeles','papel','Papel','Papel'),('papeles','cartulinas','Cartulinas','Cartulina'),
    ('papeles','goma-eva','Goma EVA','Goma EVA'),
    ('pegado-y-corte','pegamentos','Pegamentos','Pegamento'),('pegado-y-corte','tijeras','Tijeras','Tijeras'),
    ('pegado-y-corte','cintas','Cintas adhesivas','Cinta adhesiva'),
    ('organizacion','carpetas','Carpetas','Carpeta'),('organizacion','archivadores','Archivadores','Archivador'),
    ('organizacion','forros','Forros','Forro'),('organizacion','estuches','Estuches','Estuche'),
    ('aseo','papel-higienico','Papel higiénico','Papel higiénico'),('aseo','panuelos','Pañuelos desechables','Pañuelos'),
    ('aseo','jabon','Jabón','Jabón')
)
INSERT INTO catalog.legacy_subcategory_types(subcategory_id,attribute_id,type_value)
SELECT s.id,t.attribute_id,COALESCE(n.label,s.name)
FROM catalog.subcategories s JOIN catalog.categories c ON c.id=s.category_id
JOIN catalog.category_type_attributes t ON t.category_id=c.id
LEFT JOIN names n ON n.category=c.slug AND n.subcategory=s.slug AND n.original=s.name;

-- Add only missing values; administrator curation wins over the old grouping.
INSERT INTO catalog.item_attributes(item_id,attribute_id,data_type,text_value)
SELECT i.id,m.attribute_id,'text',m.type_value FROM catalog.items i
JOIN catalog.legacy_subcategory_types m ON m.subcategory_id=i.subcategory_id
ON CONFLICT (item_id,attribute_id) DO NOTHING;

UPDATE catalog.category_attributes a SET options=(
    SELECT COALESCE(array_agg(v.value ORDER BY v.position,v.value),'{}') FROM (
        SELECT value,min(position) position FROM (
            SELECT m.type_value value,s.sort_order position FROM catalog.legacy_subcategory_types m
            JOIN catalog.subcategories s ON s.id=m.subcategory_id WHERE s.category_id=a.category_id
            UNION ALL
            SELECT i.text_value,10000 FROM catalog.item_attributes i JOIN catalog.items p ON p.id=i.item_id
            WHERE p.category_id=a.category_id AND i.attribute_id=a.attribute_id
        ) all_values GROUP BY value
    ) v
) WHERE EXISTS(SELECT 1 FROM catalog.category_type_attributes t WHERE t.category_id=a.category_id AND t.attribute_id=a.attribute_id);

INSERT INTO catalog.category_attributes(category_id,attribute_id,applies_to_types,sort_order)
SELECT s.category_id,sa.attribute_id,array_agg(DISTINCT m.type_value ORDER BY m.type_value),min(sa.sort_order)+10
FROM catalog.subcategory_attributes sa JOIN catalog.subcategories s ON s.id=sa.subcategory_id
JOIN catalog.legacy_subcategory_types m ON m.subcategory_id=s.id
GROUP BY s.category_id,sa.attribute_id ON CONFLICT DO NOTHING;

-- Preserve useful pre-existing values even if their old taxonomy omitted a binding.
INSERT INTO catalog.category_attributes(category_id,attribute_id,sort_order)
SELECT DISTINCT i.category_id,a.attribute_id,1000 FROM catalog.items i
JOIN catalog.item_attributes a ON a.item_id=i.id ON CONFLICT DO NOTHING;
