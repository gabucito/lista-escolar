BEGIN;

INSERT INTO catalog.categories (slug, name, sort_order) VALUES
    ('cuadernos', 'Cuadernos', 10),
    ('escritura', 'Escritura', 20),
    ('arte-y-dibujo', 'Arte y dibujo', 30),
    ('geometria', 'Geometría', 40),
    ('papeles', 'Papeles y cartulinas', 50),
    ('pegado-y-corte', 'Pegado y corte', 60),
    ('organizacion', 'Organización', 70),
    ('aseo', 'Aseo', 80),
    ('otros', 'Otros', 90)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO catalog.subcategories (category_id, slug, name, sort_order)
SELECT c.id, s.slug, s.name, s.sort_order
FROM (VALUES
    ('cuadernos', 'cuadriculados', 'Cuadriculados', 10),
    ('cuadernos', 'rayados', 'Rayados o de línea', 20),
    ('cuadernos', 'composicion', 'Composición', 30),
    ('cuadernos', 'caligrafia', 'Caligrafía', 40),
    ('cuadernos', 'croquis', 'Croquis', 50),
    ('cuadernos', 'lisos', 'Lisos', 60),
    ('cuadernos', 'otros', 'Otros cuadernos', 90),
    ('escritura', 'grafito', 'Lápices grafito', 10),
    ('escritura', 'boligrafos', 'Lápices pasta y bolígrafos', 20),
    ('escritura', 'destacadores', 'Destacadores', 30),
    ('escritura', 'correctores', 'Correctores', 40),
    ('escritura', 'gomas', 'Gomas de borrar', 50),
    ('escritura', 'sacapuntas', 'Sacapuntas', 60),
    ('arte-y-dibujo', 'croqueras', 'Croqueras', 10),
    ('arte-y-dibujo', 'blocks', 'Blocks de dibujo', 20),
    ('arte-y-dibujo', 'lapices-colores', 'Lápices de colores', 30),
    ('arte-y-dibujo', 'plumones', 'Plumones', 40),
    ('arte-y-dibujo', 'temperas', 'Témperas', 50),
    ('arte-y-dibujo', 'acuarelas', 'Acuarelas', 60),
    ('arte-y-dibujo', 'pinceles', 'Pinceles', 70),
    ('arte-y-dibujo', 'plasticina', 'Plasticina', 80),
    ('geometria', 'reglas', 'Reglas', 10),
    ('geometria', 'escuadras', 'Escuadras', 20),
    ('geometria', 'transportadores', 'Transportadores', 30),
    ('geometria', 'compases', 'Compases', 40),
    ('papeles', 'papel', 'Papel', 10),
    ('papeles', 'cartulinas', 'Cartulinas', 20),
    ('papeles', 'goma-eva', 'Goma EVA', 30),
    ('pegado-y-corte', 'pegamentos', 'Pegamentos', 10),
    ('pegado-y-corte', 'tijeras', 'Tijeras', 20),
    ('pegado-y-corte', 'cintas', 'Cintas adhesivas', 30),
    ('organizacion', 'carpetas', 'Carpetas', 10),
    ('organizacion', 'archivadores', 'Archivadores', 20),
    ('organizacion', 'forros', 'Forros', 30),
    ('organizacion', 'estuches', 'Estuches', 40),
    ('aseo', 'papel-higienico', 'Papel higiénico', 10),
    ('aseo', 'panuelos', 'Pañuelos desechables', 20),
    ('aseo', 'jabon', 'Jabón', 30)
) AS s(category_slug, slug, name, sort_order)
JOIN catalog.categories c ON c.slug = s.category_slug
ON CONFLICT (category_id, slug) DO NOTHING;

INSERT INTO catalog.attribute_definitions (key, name, data_type, unit) VALUES
    ('formato', 'Formato', 'text', NULL),
    ('numero_hojas', 'Número de hojas', 'number', 'hojas'),
    ('cuadricula_mm', 'Separación de la cuadrícula', 'number', 'mm'),
    ('orientacion', 'Orientación', 'text', NULL),
    ('largo_cm', 'Largo', 'number', 'cm'),
    ('numero_colores', 'Número de colores', 'number', 'colores'),
    ('tipo_punta', 'Tipo de punta', 'text', NULL),
    ('dureza_grafito', 'Dureza del grafito', 'text', NULL),
    ('incluye_goma', 'Incluye goma', 'boolean', NULL),
    ('dimension_menor_cm', 'Dimensión menor', 'number', 'cm'),
    ('dimension_mayor_cm', 'Dimensión mayor', 'number', 'cm'),
    ('tipo_block', 'Tipo de block', 'text', NULL),
    ('numero_block', 'Número de block', 'number', NULL),
    ('fraccion_block', 'Fracción de block', 'text', NULL),
    ('peso_g', 'Peso', 'number', 'g')
ON CONFLICT (key) DO NOTHING;

INSERT INTO catalog.subcategory_attributes (subcategory_id, attribute_id, sort_order)
SELECT s.id, a.id, v.sort_order
FROM (VALUES
    ('cuadernos', 'cuadriculados', 'formato', 10),
    ('cuadernos', 'cuadriculados', 'numero_hojas', 20),
    ('cuadernos', 'cuadriculados', 'cuadricula_mm', 30),
    ('cuadernos', 'rayados', 'formato', 10),
    ('cuadernos', 'rayados', 'numero_hojas', 20),
    ('cuadernos', 'composicion', 'formato', 10),
    ('cuadernos', 'composicion', 'numero_hojas', 20),
    ('cuadernos', 'caligrafia', 'formato', 10),
    ('cuadernos', 'caligrafia', 'numero_hojas', 20),
    ('cuadernos', 'caligrafia', 'orientacion', 30),
    ('cuadernos', 'croquis', 'formato', 10),
    ('cuadernos', 'croquis', 'numero_hojas', 20),
    ('cuadernos', 'lisos', 'formato', 10),
    ('cuadernos', 'lisos', 'numero_hojas', 20),
    ('arte-y-dibujo', 'croqueras', 'formato', 10),
    ('arte-y-dibujo', 'croqueras', 'numero_hojas', 20),
    ('arte-y-dibujo', 'croqueras', 'dimension_menor_cm', 30),
    ('arte-y-dibujo', 'croqueras', 'dimension_mayor_cm', 40),
    ('arte-y-dibujo', 'blocks', 'tipo_block', 10),
    ('arte-y-dibujo', 'blocks', 'numero_block', 20),
    ('arte-y-dibujo', 'blocks', 'fraccion_block', 30),
    ('arte-y-dibujo', 'blocks', 'numero_hojas', 40),
    ('arte-y-dibujo', 'lapices-colores', 'numero_colores', 10),
    ('escritura', 'grafito', 'dureza_grafito', 10),
    ('escritura', 'grafito', 'incluye_goma', 20),
    ('geometria', 'reglas', 'largo_cm', 10),
    ('pegado-y-corte', 'pegamentos', 'peso_g', 10),
    ('pegado-y-corte', 'tijeras', 'tipo_punta', 10)
) AS v(category_slug, subcategory_slug, attribute_key, sort_order)
JOIN catalog.categories c ON c.slug = v.category_slug
JOIN catalog.subcategories s ON s.category_id = c.id AND s.slug = v.subcategory_slug
JOIN catalog.attribute_definitions a ON a.key = v.attribute_key
ON CONFLICT (subcategory_id, attribute_id) DO NOTHING;

-- A small reviewed starting set; product-derived notebook entries are added
-- separately as pending suggestions, never as approved store matches.
INSERT INTO catalog.items (category_id, subcategory_id, name, canonical_key, review_status)
SELECT c.id, s.id, v.name, v.key, 'approved'
FROM (VALUES
    ('escritura', 'grafito', 'Lápiz grafito', 'manual:lapiz-grafito'),
    ('escritura', 'gomas', 'Goma de borrar', 'manual:goma-borrar'),
    ('escritura', 'sacapuntas', 'Sacapuntas', 'manual:sacapuntas'),
    ('arte-y-dibujo', 'lapices-colores', 'Lápices de colores, 12 colores', 'manual:lapices-colores-12'),
    ('arte-y-dibujo', 'croqueras', 'Croquera', 'manual:croquera'),
    ('arte-y-dibujo', 'blocks', 'Block de dibujo', 'manual:block-dibujo'),
    ('arte-y-dibujo', 'plumones', 'Plumones', 'manual:plumones'),
    ('arte-y-dibujo', 'temperas', 'Témperas', 'manual:temperas'),
    ('arte-y-dibujo', 'acuarelas', 'Acuarelas', 'manual:acuarelas'),
    ('arte-y-dibujo', 'pinceles', 'Pincel', 'manual:pincel'),
    ('arte-y-dibujo', 'plasticina', 'Plasticina', 'manual:plasticina'),
    ('geometria', 'reglas', 'Regla, 30 cm', 'manual:regla-30-cm'),
    ('geometria', 'escuadras', 'Escuadra', 'manual:escuadra'),
    ('geometria', 'transportadores', 'Transportador', 'manual:transportador'),
    ('geometria', 'compases', 'Compás', 'manual:compas'),
    ('pegado-y-corte', 'pegamentos', 'Pegamento en barra', 'manual:pegamento-barra'),
    ('pegado-y-corte', 'tijeras', 'Tijera escolar de punta redonda', 'manual:tijera-punta-redonda'),
    ('organizacion', 'carpetas', 'Carpeta', 'manual:carpeta'),
    ('organizacion', 'estuches', 'Estuche', 'manual:estuche'),
    ('aseo', 'panuelos', 'Pañuelos desechables', 'manual:panuelos')
) AS v(category_slug, subcategory_slug, name, key)
JOIN catalog.categories c ON c.slug = v.category_slug
JOIN catalog.subcategories s ON s.category_id = c.id AND s.slug = v.subcategory_slug
ON CONFLICT (canonical_key) DO NOTHING;

INSERT INTO catalog.item_attributes (item_id, attribute_id, data_type, text_value, number_value)
SELECT i.id, a.id, a.data_type, v.text_value, v.number_value
FROM (VALUES
    ('manual:lapices-colores-12', 'numero_colores', NULL::text, 12::numeric),
    ('manual:regla-30-cm', 'largo_cm', NULL, 30),
    ('manual:tijera-punta-redonda', 'tipo_punta', 'redonda', NULL)
) AS v(item_key, attribute_key, text_value, number_value)
JOIN catalog.items i ON i.canonical_key = v.item_key
JOIN catalog.attribute_definitions a ON a.key = v.attribute_key
ON CONFLICT (item_id, attribute_id) DO NOTHING;

INSERT INTO catalog.item_aliases (item_id, alias)
SELECT i.id, v.alias
FROM (VALUES
    ('manual:lapiz-grafito', 'Lápiz mina'),
    ('manual:goma-borrar', 'Borrador'),
    ('manual:sacapuntas', 'Afilalápices')
) AS v(item_key, alias)
JOIN catalog.items i ON i.canonical_key = v.item_key
ON CONFLICT (item_id, alias) DO NOTHING;

COMMIT;
