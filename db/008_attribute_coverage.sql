-- Researched optional attributes, exact variants and guarded seed enrichment.
-- Dataset SHA-256: 8b3bf014363d5d2e615bbd0456c64e0aaee8b74522e5a6688bbdb3e37dcfd807
-- Evidence: docs/catalog-attribute-additions-2026-11-10.json.
-- Run within config::migrate's advisory-lock transaction; no BEGIN/COMMIT here.
-- Unspecified requirements, reviewed identities and saved list snapshots remain intact.
CREATE TEMP TABLE attribute_coverage_008_data (document jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO attribute_coverage_008_data VALUES ($attribute_coverage_008$
{
  "categories": [
    {
      "slug": "cuadernos",
      "name": "Cuadernos",
      "type_key": "tipo_cuaderno",
      "type_name": "Tipo de cuaderno",
      "new": false,
      "sort_order": 10
    },
    {
      "slug": "escritura",
      "name": "Escritura",
      "type_key": "tipo_escritura",
      "type_name": "Tipo de escritura",
      "new": false,
      "sort_order": 20
    },
    {
      "slug": "arte-y-dibujo",
      "name": "Arte y dibujo",
      "type_key": "tipo_arte",
      "type_name": "Tipo de arte y dibujo",
      "new": false,
      "sort_order": 30
    },
    {
      "slug": "manualidades",
      "name": "Manualidades",
      "type_key": "tipo_manualidades",
      "type_name": "Tipo de manualidades",
      "new": false,
      "sort_order": 35
    },
    {
      "slug": "geometria",
      "name": "Geometría",
      "type_key": "tipo_geometria",
      "type_name": "Tipo de geometría",
      "new": false,
      "sort_order": 40
    },
    {
      "slug": "material-didactico",
      "name": "Material didáctico",
      "type_key": "tipo_material_didactico",
      "type_name": "Tipo de material didáctico",
      "new": false,
      "sort_order": 45
    },
    {
      "slug": "papeles",
      "name": "Papeles y cartulinas",
      "type_key": "tipo_papel",
      "type_name": "Tipo de papeles y cartulinas",
      "new": false,
      "sort_order": 50
    },
    {
      "slug": "pegado-y-corte",
      "name": "Pegado y corte",
      "type_key": "tipo_pegado_corte",
      "type_name": "Tipo de pegado y corte",
      "new": false,
      "sort_order": 60
    },
    {
      "slug": "musica",
      "name": "Música",
      "type_key": "tipo_musica",
      "type_name": "Tipo de música",
      "new": false,
      "sort_order": 65
    },
    {
      "slug": "organizacion",
      "name": "Organización",
      "type_key": "tipo_organizacion",
      "type_name": "Tipo de organización",
      "new": false,
      "sort_order": 70
    },
    {
      "slug": "tecnologia",
      "name": "Tecnología",
      "type_key": "tipo_tecnologia",
      "type_name": "Tipo de tecnología",
      "new": false,
      "sort_order": 75
    },
    {
      "slug": "lectura-y-consulta",
      "name": "Lectura y consulta",
      "type_key": "tipo_lectura_y_consulta",
      "type_name": "Tipo de lectura y consulta",
      "new": false,
      "sort_order": 76
    },
    {
      "slug": "aseo",
      "name": "Aseo",
      "type_key": "tipo_aseo",
      "type_name": "Tipo de aseo",
      "new": false,
      "sort_order": 80
    }
  ],
  "definitions": [
    {
      "key": "acabado",
      "name": "Acabado",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "alcance_transportador_grados",
      "name": "Alcance del transportador",
      "data_type": "number",
      "unit": "°"
    },
    {
      "key": "ancho_mm",
      "name": "Ancho",
      "data_type": "number",
      "unit": "mm"
    },
    {
      "key": "angulo_escuadra_grados",
      "name": "Ángulo de la escuadra",
      "data_type": "number",
      "unit": "°"
    },
    {
      "key": "capacidad_gb",
      "name": "Capacidad de almacenamiento",
      "data_type": "number",
      "unit": "GB"
    },
    {
      "key": "color",
      "name": "Color",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "con_espiral",
      "name": "Con espiral",
      "data_type": "boolean",
      "unit": null
    },
    {
      "key": "con_margen",
      "name": "Con margen",
      "data_type": "boolean",
      "unit": null
    },
    {
      "key": "contenido_diccionario",
      "name": "Contenido del diccionario",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "cuadricula_mm",
      "name": "Separación de la cuadrícula",
      "data_type": "number",
      "unit": "mm"
    },
    {
      "key": "digitacion_flauta",
      "name": "Digitación de flauta",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "dimension_mayor_cm",
      "name": "Dimensión mayor",
      "data_type": "number",
      "unit": "cm"
    },
    {
      "key": "dimension_menor_cm",
      "name": "Dimensión menor",
      "data_type": "number",
      "unit": "cm"
    },
    {
      "key": "dureza_grafito",
      "name": "Dureza del grafito",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "forma_cuerpo",
      "name": "Forma del cuerpo",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "forma_pincel",
      "name": "Forma del pincel",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "formato",
      "name": "Formato",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "gramaje_g_m2",
      "name": "Gramaje",
      "data_type": "number",
      "unit": "g/m²"
    },
    {
      "key": "grosor_punta",
      "name": "Grosor de punta",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "idioma",
      "name": "Idioma",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "incluye_goma",
      "name": "Incluye goma",
      "data_type": "boolean",
      "unit": null
    },
    {
      "key": "largo_cm",
      "name": "Largo",
      "data_type": "number",
      "unit": "cm"
    },
    {
      "key": "largo_m",
      "name": "Largo",
      "data_type": "number",
      "unit": "m"
    },
    {
      "key": "lateralidad",
      "name": "Lateralidad",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "lavable",
      "name": "Lavable",
      "data_type": "boolean",
      "unit": null
    },
    {
      "key": "material",
      "name": "Material",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "numero_colores",
      "name": "Número de colores",
      "data_type": "number",
      "unit": "colores"
    },
    {
      "key": "numero_fundas",
      "name": "Número de fundas",
      "data_type": "number",
      "unit": "fundas"
    },
    {
      "key": "numero_hojas",
      "name": "Número de hojas",
      "data_type": "number",
      "unit": "hojas"
    },
    {
      "key": "numero_notas",
      "name": "Número de notas",
      "data_type": "number",
      "unit": "notas"
    },
    {
      "key": "numero_orificios",
      "name": "Número de orificios",
      "data_type": "number",
      "unit": "orificios"
    },
    {
      "key": "numero_pincel",
      "name": "Número de pincel",
      "data_type": "number",
      "unit": null
    },
    {
      "key": "orientacion",
      "name": "Orientación",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "peso_g",
      "name": "Peso",
      "data_type": "number",
      "unit": "g"
    },
    {
      "key": "presentacion",
      "name": "Presentación",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "tipo_adhesivo",
      "name": "Familia de adhesivo",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "tipo_pauta",
      "name": "Tipo de pauta",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "tipo_punta",
      "name": "Tipo de punta",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "unidades_por_envase",
      "name": "Unidades por envase",
      "data_type": "number",
      "unit": "unidades"
    },
    {
      "key": "uso_marcador",
      "name": "Uso del marcador",
      "data_type": "text",
      "unit": null
    },
    {
      "key": "volumen_ml",
      "name": "Contenido",
      "data_type": "number",
      "unit": "ml"
    }
  ],
  "bindings": [
    {
      "category": "arte-y-dibujo",
      "key": "acabado",
      "applies_to_types": [
        "Témperas"
      ],
      "sort_order": 100
    },
    {
      "category": "arte-y-dibujo",
      "key": "color",
      "applies_to_types": [
        "Témperas"
      ],
      "sort_order": 101
    },
    {
      "category": "arte-y-dibujo",
      "key": "dimension_mayor_cm",
      "applies_to_types": [
        "Block",
        "Croquera"
      ],
      "sort_order": 50
    },
    {
      "category": "arte-y-dibujo",
      "key": "dimension_menor_cm",
      "applies_to_types": [
        "Block",
        "Croquera"
      ],
      "sort_order": 40
    },
    {
      "category": "arte-y-dibujo",
      "key": "forma_pincel",
      "applies_to_types": [
        "Pincel"
      ],
      "sort_order": 135
    },
    {
      "category": "arte-y-dibujo",
      "key": "gramaje_g_m2",
      "applies_to_types": [
        "Block",
        "Croquera"
      ],
      "sort_order": 105
    },
    {
      "category": "arte-y-dibujo",
      "key": "numero_hojas",
      "applies_to_types": [
        "Croquera"
      ],
      "sort_order": 30
    },
    {
      "category": "arte-y-dibujo",
      "key": "numero_pincel",
      "applies_to_types": [
        "Pincel"
      ],
      "sort_order": 147
    },
    {
      "category": "arte-y-dibujo",
      "key": "peso_g",
      "applies_to_types": [
        "Arcilla",
        "Masa para modelar"
      ],
      "sort_order": 108
    },
    {
      "category": "arte-y-dibujo",
      "key": "volumen_ml",
      "applies_to_types": [
        "Témperas"
      ],
      "sort_order": 109
    },
    {
      "category": "aseo",
      "key": "dimension_mayor_cm",
      "applies_to_types": [
        "Toalla"
      ],
      "sort_order": 110
    },
    {
      "category": "aseo",
      "key": "dimension_menor_cm",
      "applies_to_types": [
        "Toalla"
      ],
      "sort_order": 111
    },
    {
      "category": "aseo",
      "key": "presentacion",
      "applies_to_types": [
        "Jabón"
      ],
      "sort_order": 112
    },
    {
      "category": "aseo",
      "key": "unidades_por_envase",
      "applies_to_types": [
        "Pañuelos",
        "Toallas húmedas"
      ],
      "sort_order": 113
    },
    {
      "category": "aseo",
      "key": "volumen_ml",
      "applies_to_types": [
        "Alcohol gel",
        "Jabón"
      ],
      "sort_order": 114
    },
    {
      "category": "cuadernos",
      "key": "con_espiral",
      "applies_to_types": [
        "Caligrafía",
        "Cuadriculado"
      ],
      "sort_order": 115
    },
    {
      "category": "cuadernos",
      "key": "con_margen",
      "applies_to_types": [
        "Composición",
        "Cuadriculado"
      ],
      "sort_order": 116
    },
    {
      "category": "cuadernos",
      "key": "cuadricula_mm",
      "applies_to_types": [
        "Cuadriculado"
      ],
      "sort_order": 40
    },
    {
      "category": "cuadernos",
      "key": "formato",
      "applies_to_types": [
        "Caligrafía",
        "Composición",
        "Cuadriculado"
      ],
      "sort_order": 20
    },
    {
      "category": "cuadernos",
      "key": "numero_hojas",
      "applies_to_types": [
        "Caligrafía",
        "Composición",
        "Cuadriculado"
      ],
      "sort_order": 30
    },
    {
      "category": "cuadernos",
      "key": "orientacion",
      "applies_to_types": [
        "Caligrafía"
      ],
      "sort_order": 40
    },
    {
      "category": "escritura",
      "key": "color",
      "applies_to_types": [
        "Destacador",
        "Marcador"
      ],
      "sort_order": 129
    },
    {
      "category": "escritura",
      "key": "dureza_grafito",
      "applies_to_types": [
        "Grafito"
      ],
      "sort_order": 20
    },
    {
      "category": "escritura",
      "key": "forma_cuerpo",
      "applies_to_types": [
        "Grafito"
      ],
      "sort_order": 123
    },
    {
      "category": "escritura",
      "key": "grosor_punta",
      "applies_to_types": [
        "Marcador"
      ],
      "sort_order": 124
    },
    {
      "category": "escritura",
      "key": "incluye_goma",
      "applies_to_types": [
        "Grafito"
      ],
      "sort_order": 30
    },
    {
      "category": "escritura",
      "key": "numero_orificios",
      "applies_to_types": [
        "Sacapuntas"
      ],
      "sort_order": 126
    },
    {
      "category": "escritura",
      "key": "presentacion",
      "applies_to_types": [
        "Corrector"
      ],
      "sort_order": 127
    },
    {
      "category": "escritura",
      "key": "tipo_punta",
      "applies_to_types": [
        "Marcador"
      ],
      "sort_order": 128
    },
    {
      "category": "escritura",
      "key": "uso_marcador",
      "applies_to_types": [
        "Marcador"
      ],
      "sort_order": 156
    },
    {
      "category": "geometria",
      "key": "alcance_transportador_grados",
      "applies_to_types": [
        "Transportador"
      ],
      "sort_order": 130
    },
    {
      "category": "geometria",
      "key": "angulo_escuadra_grados",
      "applies_to_types": [
        "Escuadra"
      ],
      "sort_order": 131
    },
    {
      "category": "geometria",
      "key": "largo_cm",
      "applies_to_types": [
        "Escuadra"
      ],
      "sort_order": 20
    },
    {
      "category": "geometria",
      "key": "material",
      "applies_to_types": [
        "Escuadra",
        "Transportador"
      ],
      "sort_order": 133
    },
    {
      "category": "lectura-y-consulta",
      "key": "contenido_diccionario",
      "applies_to_types": [
        "Diccionario"
      ],
      "sort_order": 134
    },
    {
      "category": "lectura-y-consulta",
      "key": "idioma",
      "applies_to_types": [
        "Diccionario"
      ],
      "sort_order": 138
    },
    {
      "category": "manualidades",
      "key": "acabado",
      "applies_to_types": [
        "Pompones"
      ],
      "sort_order": 136
    },
    {
      "category": "manualidades",
      "key": "color",
      "applies_to_types": [
        "Palitos"
      ],
      "sort_order": 137
    },
    {
      "category": "manualidades",
      "key": "largo_m",
      "applies_to_types": [
        "Lana"
      ],
      "sort_order": 138
    },
    {
      "category": "manualidades",
      "key": "unidades_por_envase",
      "applies_to_types": [
        "Palitos"
      ],
      "sort_order": 139
    },
    {
      "category": "material-didactico",
      "key": "dimension_mayor_cm",
      "applies_to_types": [
        "Pizarra"
      ],
      "sort_order": 111
    },
    {
      "category": "material-didactico",
      "key": "dimension_menor_cm",
      "applies_to_types": [
        "Pizarra"
      ],
      "sort_order": 110
    },
    {
      "category": "material-didactico",
      "key": "tipo_pauta",
      "applies_to_types": [
        "Pizarra"
      ],
      "sort_order": 142
    },
    {
      "category": "musica",
      "key": "digitacion_flauta",
      "applies_to_types": [
        "Flauta"
      ],
      "sort_order": 143
    },
    {
      "category": "musica",
      "key": "numero_notas",
      "applies_to_types": [
        "Melódica",
        "Metalófono"
      ],
      "sort_order": 145
    },
    {
      "category": "organizacion",
      "key": "color",
      "applies_to_types": [
        "Carpeta",
        "Forro"
      ],
      "sort_order": 129
    },
    {
      "category": "organizacion",
      "key": "formato",
      "applies_to_types": [
        "Carpeta",
        "Forro"
      ],
      "sort_order": 101
    },
    {
      "category": "organizacion",
      "key": "material",
      "applies_to_types": [
        "Forro"
      ],
      "sort_order": 141
    },
    {
      "category": "organizacion",
      "key": "numero_fundas",
      "applies_to_types": [
        "Carpeta"
      ],
      "sort_order": 148
    },
    {
      "category": "papeles",
      "key": "acabado",
      "applies_to_types": [
        "Cartulina"
      ],
      "sort_order": 125
    },
    {
      "category": "papeles",
      "key": "color",
      "applies_to_types": [
        "Cartulina"
      ],
      "sort_order": 129
    },
    {
      "category": "papeles",
      "key": "dimension_mayor_cm",
      "applies_to_types": [
        "Cartulina"
      ],
      "sort_order": 111
    },
    {
      "category": "papeles",
      "key": "dimension_menor_cm",
      "applies_to_types": [
        "Cartulina"
      ],
      "sort_order": 110
    },
    {
      "category": "papeles",
      "key": "formato",
      "applies_to_types": [
        "Papel"
      ],
      "sort_order": 101
    },
    {
      "category": "papeles",
      "key": "gramaje_g_m2",
      "applies_to_types": [
        "Papel"
      ],
      "sort_order": 154
    },
    {
      "category": "papeles",
      "key": "numero_colores",
      "applies_to_types": [
        "Cartulina",
        "Goma EVA"
      ],
      "sort_order": 155
    },
    {
      "category": "papeles",
      "key": "numero_hojas",
      "applies_to_types": [
        "Cartulina",
        "Papel"
      ],
      "sort_order": 156
    },
    {
      "category": "pegado-y-corte",
      "key": "ancho_mm",
      "applies_to_types": [
        "Cinta adhesiva"
      ],
      "sort_order": 157
    },
    {
      "category": "pegado-y-corte",
      "key": "color",
      "applies_to_types": [
        "Cinta adhesiva"
      ],
      "sort_order": 129
    },
    {
      "category": "pegado-y-corte",
      "key": "largo_cm",
      "applies_to_types": [
        "Tijeras"
      ],
      "sort_order": 159
    },
    {
      "category": "pegado-y-corte",
      "key": "largo_m",
      "applies_to_types": [
        "Cinta adhesiva"
      ],
      "sort_order": 160
    },
    {
      "category": "pegado-y-corte",
      "key": "lateralidad",
      "applies_to_types": [
        "Tijeras"
      ],
      "sort_order": 140
    },
    {
      "category": "pegado-y-corte",
      "key": "lavable",
      "applies_to_types": [
        "Pegamento"
      ],
      "sort_order": 162
    },
    {
      "category": "pegado-y-corte",
      "key": "material",
      "applies_to_types": [
        "Cinta adhesiva"
      ],
      "sort_order": 141
    },
    {
      "category": "pegado-y-corte",
      "key": "peso_g",
      "applies_to_types": [
        "Pegamento"
      ],
      "sort_order": 20
    },
    {
      "category": "pegado-y-corte",
      "key": "presentacion",
      "applies_to_types": [
        "Pegamento"
      ],
      "sort_order": 150
    },
    {
      "category": "pegado-y-corte",
      "key": "tipo_adhesivo",
      "applies_to_types": [
        "Pegamento"
      ],
      "sort_order": 166
    },
    {
      "category": "pegado-y-corte",
      "key": "tipo_punta",
      "applies_to_types": [
        "Tijeras"
      ],
      "sort_order": 20
    },
    {
      "category": "tecnologia",
      "key": "capacidad_gb",
      "applies_to_types": [
        "Memoria USB"
      ],
      "sort_order": 127
    }
  ],
  "items": [
    {
      "key": "manual:cuaderno-universitario-cuadriculado-con-margen-100-hojas",
      "category": "cuadernos",
      "name": "Cuaderno universitario cuadriculado con margen, 100 hojas",
      "type": "Cuadriculado",
      "attributes": {
        "formato": "universitario",
        "numero_hojas": 100,
        "con_margen": true
      },
      "aliases": [],
      "sources": [
        "pw-tis"
      ],
      "finding_ids": [
        "pw-01"
      ]
    },
    {
      "key": "manual:cuaderno-universitario-de-composicion-con-margen-100-hojas",
      "category": "cuadernos",
      "name": "Cuaderno universitario de composición con margen, 100 hojas",
      "type": "Composición",
      "attributes": {
        "formato": "universitario",
        "numero_hojas": 100,
        "con_margen": true
      },
      "aliases": [],
      "sources": [
        "pw-tis"
      ],
      "finding_ids": [
        "pw-01"
      ]
    },
    {
      "key": "manual:cuaderno-college-de-caligrafia-horizontal-sin-espiral-100-hojas",
      "category": "cuadernos",
      "name": "Cuaderno college de caligrafía horizontal sin espiral, 100 hojas",
      "type": "Caligrafía",
      "attributes": {
        "formato": "college",
        "numero_hojas": 100,
        "orientacion": "horizontal",
        "con_espiral": false
      },
      "aliases": [],
      "sources": [
        "pw-monteverde"
      ],
      "finding_ids": [
        "pw-02"
      ]
    },
    {
      "key": "manual:cuaderno-cuadriculado-7-mm-con-espiral-150-hojas",
      "category": "cuadernos",
      "name": "Cuaderno cuadriculado 7 mm con espiral, 150 hojas",
      "type": "Cuadriculado",
      "attributes": {
        "numero_hojas": 150,
        "cuadricula_mm": 7,
        "con_espiral": true
      },
      "aliases": [],
      "sources": [
        "pw-torre-notebook"
      ],
      "finding_ids": [
        "pw-02",
        "pw-03"
      ]
    },
    {
      "key": "lapiz-grafito:hb:no-especificada",
      "category": "escritura",
      "name": "Lápiz grafito HB",
      "type": "Grafito",
      "attributes": {
        "dureza_grafito": "HB"
      },
      "aliases": [],
      "sources": [
        "pw-tis"
      ],
      "finding_ids": [
        "pw-04"
      ]
    },
    {
      "key": "lapiz-grafito:2b:no-especificada",
      "category": "escritura",
      "name": "Lápiz grafito 2B",
      "type": "Grafito",
      "attributes": {
        "dureza_grafito": "2B"
      },
      "aliases": [],
      "sources": [
        "pw-chuqui"
      ],
      "finding_ids": [
        "pw-04"
      ]
    },
    {
      "key": "lapiz-grafito:hb:con-goma",
      "category": "escritura",
      "name": "Lápiz grafito HB, con goma",
      "type": "Grafito",
      "attributes": {
        "dureza_grafito": "HB",
        "incluye_goma": true
      },
      "aliases": [],
      "sources": [
        "pw-torre-graphite"
      ],
      "finding_ids": [
        "pw-16"
      ]
    },
    {
      "key": "lapiz-grafito:hb:sin-goma",
      "category": "escritura",
      "name": "Lápiz grafito HB, sin goma",
      "type": "Grafito",
      "attributes": {
        "dureza_grafito": "HB",
        "incluye_goma": false
      },
      "aliases": [],
      "sources": [
        "add_torre_graphite_without"
      ],
      "finding_ids": [
        "pw-16"
      ]
    },
    {
      "key": "manual:lapiz-grafito-hb-hexagonal",
      "category": "escritura",
      "name": "Lápiz grafito HB hexagonal",
      "type": "Grafito",
      "attributes": {
        "dureza_grafito": "HB",
        "forma_cuerpo": "Hexagonal"
      },
      "aliases": [],
      "sources": [
        "pw-torre-graphite"
      ],
      "finding_ids": [
        "pw-05"
      ]
    },
    {
      "key": "manual:marcador-permanente-negro-de-punta-redonda",
      "category": "escritura",
      "name": "Marcador permanente negro de punta redonda",
      "type": "Marcador",
      "attributes": {
        "uso_marcador": "Permanente",
        "color": "Negro",
        "tipo_punta": "Redonda"
      },
      "aliases": [],
      "sources": [
        "pw-artel-marker",
        "add_artel_markers"
      ],
      "finding_ids": [
        "pw-06"
      ]
    },
    {
      "key": "manual:marcador-permanente-negro-de-punta-biselada",
      "category": "escritura",
      "name": "Marcador permanente negro de punta biselada",
      "type": "Marcador",
      "attributes": {
        "uso_marcador": "Permanente",
        "color": "Negro",
        "tipo_punta": "Biselada"
      },
      "aliases": [],
      "sources": [
        "pw-artel-marker",
        "add_artel_markers"
      ],
      "finding_ids": [
        "pw-06"
      ]
    },
    {
      "key": "manual:plumon-de-pizarra-negro-de-punta-redonda",
      "category": "escritura",
      "name": "Plumón de pizarra negro de punta redonda",
      "type": "Marcador",
      "attributes": {
        "uso_marcador": "Pizarra",
        "color": "Negro",
        "tipo_punta": "Redonda"
      },
      "aliases": [],
      "sources": [
        "pw-artel-marker",
        "ac_crep"
      ],
      "finding_ids": [
        "pw-06"
      ]
    },
    {
      "key": "manual:marcador-permanente-negro-de-punta-fina",
      "category": "escritura",
      "name": "Marcador permanente negro de punta fina",
      "type": "Marcador",
      "attributes": {
        "uso_marcador": "Permanente",
        "color": "Negro",
        "grosor_punta": "Fina"
      },
      "aliases": [],
      "sources": [
        "pw-chuqui"
      ],
      "finding_ids": [
        "pw-17"
      ]
    },
    {
      "key": "manual:marcador-permanente-de-punta-gruesa",
      "category": "escritura",
      "name": "Marcador permanente de punta gruesa",
      "type": "Marcador",
      "attributes": {
        "uso_marcador": "Permanente",
        "grosor_punta": "Gruesa"
      },
      "aliases": [],
      "sources": [
        "pw-mayor"
      ],
      "finding_ids": [
        "pw-17"
      ]
    },
    {
      "key": "manual:corrector-liquido",
      "category": "escritura",
      "name": "Corrector líquido",
      "type": "Corrector",
      "attributes": {
        "presentacion": "Líquida"
      },
      "aliases": [],
      "sources": [
        "pw-chuqui"
      ],
      "finding_ids": [
        "pw-07"
      ]
    },
    {
      "key": "manual:destacador-verde",
      "category": "escritura",
      "name": "Destacador verde",
      "type": "Destacador",
      "attributes": {
        "color": "Verde"
      },
      "aliases": [],
      "sources": [
        "pw-tis"
      ],
      "finding_ids": [
        "pw-08"
      ]
    },
    {
      "key": "manual:destacador-amarillo",
      "category": "escritura",
      "name": "Destacador amarillo",
      "type": "Destacador",
      "attributes": {
        "color": "Amarillo"
      },
      "aliases": [],
      "sources": [
        "pw-tis"
      ],
      "finding_ids": [
        "pw-08"
      ]
    },
    {
      "key": "manual:papel-de-75-g-m2",
      "category": "papeles",
      "name": "Papel de 75 g/m²",
      "type": "Papel",
      "attributes": {
        "gramaje_g_m2": 75
      },
      "aliases": [],
      "sources": [
        "pw-chamex"
      ],
      "finding_ids": [
        "pw-09"
      ]
    },
    {
      "key": "manual:papel-de-90-g-m2",
      "category": "papeles",
      "name": "Papel de 90 g/m²",
      "type": "Papel",
      "attributes": {
        "gramaje_g_m2": 90
      },
      "aliases": [],
      "sources": [
        "pw-chamex"
      ],
      "finding_ids": [
        "pw-09"
      ]
    },
    {
      "key": "manual:resma-de-papel-tamano-carta-500-hojas",
      "category": "papeles",
      "name": "Resma de papel tamaño carta, 500 hojas",
      "type": "Papel",
      "attributes": {
        "formato": "carta",
        "numero_hojas": 500
      },
      "aliases": [],
      "sources": [
        "pw-mayor"
      ],
      "finding_ids": [
        "pw-10"
      ]
    },
    {
      "key": "manual:paquete-de-cartulina-26-5-37-5-cm-18-hojas-y-14-colores",
      "category": "papeles",
      "name": "Paquete de cartulina 26,5 × 37,5 cm, 18 hojas y 14 colores",
      "type": "Cartulina",
      "attributes": {
        "numero_hojas": 18,
        "numero_colores": 14,
        "dimension_menor_cm": 26.5,
        "dimension_mayor_cm": 37.5,
        "color": "Surtido"
      },
      "aliases": [],
      "sources": [
        "pw-torre-cardstock"
      ],
      "finding_ids": [
        "pw-10",
        "pw-11",
        "pw-15"
      ]
    },
    {
      "key": "manual:cartulina-metalica",
      "category": "papeles",
      "name": "Cartulina metálica",
      "type": "Cartulina",
      "attributes": {
        "acabado": "Metálico"
      },
      "aliases": [],
      "sources": [
        "pw-mayor"
      ],
      "finding_ids": [
        "pw-12"
      ]
    },
    {
      "key": "manual:cartulina-fluorescente",
      "category": "papeles",
      "name": "Cartulina fluorescente",
      "type": "Cartulina",
      "attributes": {
        "acabado": "Fluorescente"
      },
      "aliases": [],
      "sources": [
        "pw-ldv"
      ],
      "finding_ids": [
        "pw-12"
      ]
    },
    {
      "key": "manual:paquete-de-goma-eva-10-colores",
      "category": "papeles",
      "name": "Paquete de goma EVA, 10 colores",
      "type": "Goma EVA",
      "attributes": {
        "numero_colores": 10
      },
      "aliases": [],
      "sources": [
        "pw-mayor"
      ],
      "finding_ids": [
        "pw-15"
      ]
    },
    {
      "key": "manual:forro-plastico-azul-para-cuaderno-universitario",
      "category": "organizacion",
      "name": "Forro plástico azul para cuaderno universitario",
      "type": "Forro",
      "attributes": {
        "formato": "universitario",
        "material": "Plástico",
        "color": "Azul"
      },
      "aliases": [],
      "sources": [
        "pw-cvd"
      ],
      "finding_ids": [
        "pw-13"
      ]
    },
    {
      "key": "manual:forro-plastico-verde-claro-para-cuaderno-universitario",
      "category": "organizacion",
      "name": "Forro plástico verde claro para cuaderno universitario",
      "type": "Forro",
      "attributes": {
        "formato": "universitario",
        "material": "Plástico",
        "color": "Verde claro"
      },
      "aliases": [],
      "sources": [
        "pw-cvd"
      ],
      "finding_ids": [
        "pw-13"
      ]
    },
    {
      "key": "manual:forro-plastico-negro-para-cuaderno-universitario",
      "category": "organizacion",
      "name": "Forro plástico negro para cuaderno universitario",
      "type": "Forro",
      "attributes": {
        "formato": "universitario",
        "material": "Plástico",
        "color": "Negro"
      },
      "aliases": [],
      "sources": [
        "pw-cvd"
      ],
      "finding_ids": [
        "pw-13"
      ]
    },
    {
      "key": "manual:forro-plastico-blanco-para-cuaderno-universitario",
      "category": "organizacion",
      "name": "Forro plástico blanco para cuaderno universitario",
      "type": "Forro",
      "attributes": {
        "formato": "universitario",
        "material": "Plástico",
        "color": "Blanco"
      },
      "aliases": [],
      "sources": [
        "pw-cvd"
      ],
      "finding_ids": [
        "pw-13"
      ]
    },
    {
      "key": "manual:forro-plastico-amarillo-para-cuaderno-universitario",
      "category": "organizacion",
      "name": "Forro plástico amarillo para cuaderno universitario",
      "type": "Forro",
      "attributes": {
        "formato": "universitario",
        "material": "Plástico",
        "color": "Amarillo"
      },
      "aliases": [],
      "sources": [
        "pw-cvd"
      ],
      "finding_ids": [
        "pw-13"
      ]
    },
    {
      "key": "manual:forro-plastico-celeste-para-cuaderno-universitario",
      "category": "organizacion",
      "name": "Forro plástico celeste para cuaderno universitario",
      "type": "Forro",
      "attributes": {
        "formato": "universitario",
        "material": "Plástico",
        "color": "Celeste"
      },
      "aliases": [],
      "sources": [
        "pw-cvd"
      ],
      "finding_ids": [
        "pw-13"
      ]
    },
    {
      "key": "manual:forro-plastico-morado-para-cuaderno-universitario",
      "category": "organizacion",
      "name": "Forro plástico morado para cuaderno universitario",
      "type": "Forro",
      "attributes": {
        "formato": "universitario",
        "material": "Plástico",
        "color": "Morado"
      },
      "aliases": [],
      "sources": [
        "pw-cvd"
      ],
      "finding_ids": [
        "pw-13"
      ]
    },
    {
      "key": "manual:forro-plastico-gris-para-cuaderno-universitario",
      "category": "organizacion",
      "name": "Forro plástico gris para cuaderno universitario",
      "type": "Forro",
      "attributes": {
        "formato": "universitario",
        "material": "Plástico",
        "color": "Gris"
      },
      "aliases": [],
      "sources": [
        "pw-cvd"
      ],
      "finding_ids": [
        "pw-13"
      ]
    },
    {
      "key": "manual:carpeta-azul-tamano-oficio",
      "category": "organizacion",
      "name": "Carpeta azul tamaño oficio",
      "type": "Carpeta",
      "attributes": {
        "formato": "oficio",
        "color": "Azul"
      },
      "aliases": [],
      "sources": [
        "pw-cvd"
      ],
      "finding_ids": [
        "pw-13"
      ]
    },
    {
      "key": "manual:carpeta-verde-tamano-oficio",
      "category": "organizacion",
      "name": "Carpeta verde tamaño oficio",
      "type": "Carpeta",
      "attributes": {
        "formato": "oficio",
        "color": "Verde"
      },
      "aliases": [],
      "sources": [
        "pw-cvd"
      ],
      "finding_ids": [
        "pw-13"
      ]
    },
    {
      "key": "manual:carpeta-negra-tamano-oficio",
      "category": "organizacion",
      "name": "Carpeta negra tamaño oficio",
      "type": "Carpeta",
      "attributes": {
        "formato": "oficio",
        "color": "Negro"
      },
      "aliases": [],
      "sources": [
        "pw-cvd"
      ],
      "finding_ids": [
        "pw-13"
      ]
    },
    {
      "key": "manual:carpeta-blanca-tamano-oficio",
      "category": "organizacion",
      "name": "Carpeta blanca tamaño oficio",
      "type": "Carpeta",
      "attributes": {
        "formato": "oficio",
        "color": "Blanco"
      },
      "aliases": [],
      "sources": [
        "pw-cvd"
      ],
      "finding_ids": [
        "pw-13"
      ]
    },
    {
      "key": "manual:carpeta-amarilla-tamano-oficio",
      "category": "organizacion",
      "name": "Carpeta amarilla tamaño oficio",
      "type": "Carpeta",
      "attributes": {
        "formato": "oficio",
        "color": "Amarillo"
      },
      "aliases": [],
      "sources": [
        "pw-cvd"
      ],
      "finding_ids": [
        "pw-13"
      ]
    },
    {
      "key": "manual:carpeta-celeste-tamano-oficio",
      "category": "organizacion",
      "name": "Carpeta celeste tamaño oficio",
      "type": "Carpeta",
      "attributes": {
        "formato": "oficio",
        "color": "Celeste"
      },
      "aliases": [],
      "sources": [
        "pw-cvd"
      ],
      "finding_ids": [
        "pw-13"
      ]
    },
    {
      "key": "manual:carpeta-negra-tamano-oficio-con-20-fundas",
      "category": "organizacion",
      "name": "Carpeta negra tamaño oficio con 20 fundas",
      "type": "Carpeta",
      "attributes": {
        "formato": "oficio",
        "color": "Negro",
        "numero_fundas": 20
      },
      "aliases": [],
      "sources": [
        "pw-cvd",
        "pw-torre-sleeves"
      ],
      "finding_ids": [
        "pw-13",
        "pw-14"
      ]
    },
    {
      "key": "manual:tempera-roja-250-ml",
      "category": "arte-y-dibujo",
      "name": "Témpera roja, 250 ml",
      "type": "Témperas",
      "attributes": {
        "volumen_ml": 250,
        "color": "Rojo"
      },
      "aliases": [],
      "sources": [
        "ac_crep"
      ],
      "finding_ids": [
        "AC01",
        "AC02"
      ]
    },
    {
      "key": "manual:tempera-azul-250-ml",
      "category": "arte-y-dibujo",
      "name": "Témpera azul, 250 ml",
      "type": "Témperas",
      "attributes": {
        "volumen_ml": 250,
        "color": "Azul"
      },
      "aliases": [],
      "sources": [
        "ac_crep"
      ],
      "finding_ids": [
        "AC01",
        "AC02"
      ]
    },
    {
      "key": "manual:tempera-verde-250-ml",
      "category": "arte-y-dibujo",
      "name": "Témpera verde, 250 ml",
      "type": "Témperas",
      "attributes": {
        "volumen_ml": 250,
        "color": "Verde"
      },
      "aliases": [],
      "sources": [
        "ac_crep"
      ],
      "finding_ids": [
        "AC01",
        "AC02"
      ]
    },
    {
      "key": "manual:tempera-amarilla-250-ml",
      "category": "arte-y-dibujo",
      "name": "Témpera amarilla, 250 ml",
      "type": "Témperas",
      "attributes": {
        "volumen_ml": 250,
        "color": "Amarillo"
      },
      "aliases": [],
      "sources": [
        "ac_crep"
      ],
      "finding_ids": [
        "AC01",
        "AC02"
      ]
    },
    {
      "key": "manual:tempera-blanca-250-ml",
      "category": "arte-y-dibujo",
      "name": "Témpera blanca, 250 ml",
      "type": "Témperas",
      "attributes": {
        "volumen_ml": 250,
        "color": "Blanco"
      },
      "aliases": [],
      "sources": [
        "ac_crep"
      ],
      "finding_ids": [
        "AC01",
        "AC02"
      ]
    },
    {
      "key": "manual:tempera-negra-250-ml",
      "category": "arte-y-dibujo",
      "name": "Témpera negra, 250 ml",
      "type": "Témperas",
      "attributes": {
        "volumen_ml": 250,
        "color": "Negro"
      },
      "aliases": [],
      "sources": [
        "ac_crep"
      ],
      "finding_ids": [
        "AC01",
        "AC02"
      ]
    },
    {
      "key": "manual:tempera-blanca-500-ml",
      "category": "arte-y-dibujo",
      "name": "Témpera blanca, 500 ml",
      "type": "Témperas",
      "attributes": {
        "volumen_ml": 500,
        "color": "Blanco"
      },
      "aliases": [],
      "sources": [
        "add_artel_tempera500"
      ],
      "finding_ids": [
        "AC01",
        "AC02"
      ]
    },
    {
      "key": "manual:tempera-metalica-negra-100-ml",
      "category": "arte-y-dibujo",
      "name": "Témpera metálica negra, 100 ml",
      "type": "Témperas",
      "attributes": {
        "volumen_ml": 100,
        "color": "Negro",
        "acabado": "Metálico"
      },
      "aliases": [],
      "sources": [
        "add_artel_tempera100"
      ],
      "finding_ids": [
        "AC01",
        "AC02"
      ]
    },
    {
      "key": "manual:croquera-22-32-cm-100-hojas-de-70-g-m2",
      "category": "arte-y-dibujo",
      "name": "Croquera 22 × 32 cm, 100 hojas de 70 g/m²",
      "type": "Croquera",
      "attributes": {
        "numero_hojas": 100,
        "dimension_menor_cm": 22,
        "dimension_mayor_cm": 32,
        "gramaje_g_m2": 70
      },
      "aliases": [],
      "sources": [
        "ac_proarte"
      ],
      "finding_ids": [
        "AC03"
      ]
    },
    {
      "key": "manual:croquera-21-32-cm-80-hojas",
      "category": "arte-y-dibujo",
      "name": "Croquera 21 × 32 cm, 80 hojas",
      "type": "Croquera",
      "attributes": {
        "numero_hojas": 80,
        "dimension_menor_cm": 21,
        "dimension_mayor_cm": 32
      },
      "aliases": [],
      "sources": [
        "ac_chile"
      ],
      "finding_ids": [
        "AC03"
      ]
    },
    {
      "key": "manual:block-de-dibujo-26-5-37-2-cm",
      "category": "arte-y-dibujo",
      "name": "Block de dibujo 26,5 × 37,2 cm",
      "type": "Block",
      "attributes": {
        "dimension_menor_cm": 26.5,
        "dimension_mayor_cm": 37.2
      },
      "aliases": [],
      "sources": [
        "ac_chile"
      ],
      "finding_ids": [
        "AC04"
      ]
    },
    {
      "key": "manual:pincel-n-8",
      "category": "arte-y-dibujo",
      "name": "Pincel N° 8",
      "type": "Pincel",
      "attributes": {
        "numero_pincel": 8
      },
      "aliases": [],
      "sources": [
        "ac_crep"
      ],
      "finding_ids": [
        "AC05"
      ]
    },
    {
      "key": "manual:pincel-plano-n-10",
      "category": "arte-y-dibujo",
      "name": "Pincel plano N° 10",
      "type": "Pincel",
      "attributes": {
        "numero_pincel": 10,
        "forma_pincel": "Plano"
      },
      "aliases": [],
      "sources": [
        "ac_chile"
      ],
      "finding_ids": [
        "AC05"
      ]
    },
    {
      "key": "manual:pasta-para-modelar-de-secado-al-aire-250-g",
      "category": "arte-y-dibujo",
      "name": "Pasta para modelar de secado al aire, 250 g",
      "type": "Masa para modelar",
      "attributes": {
        "peso_g": 250
      },
      "aliases": [],
      "sources": [
        "ac_fila_das"
      ],
      "finding_ids": [
        "AC06"
      ]
    },
    {
      "key": "manual:pasta-para-modelar-de-secado-al-aire-500-g",
      "category": "arte-y-dibujo",
      "name": "Pasta para modelar de secado al aire, 500 g",
      "type": "Masa para modelar",
      "attributes": {
        "peso_g": 500
      },
      "aliases": [],
      "sources": [
        "ac_fila_das"
      ],
      "finding_ids": [
        "AC06"
      ]
    },
    {
      "key": "manual:pasta-para-modelar-de-secado-al-aire-1000-g",
      "category": "arte-y-dibujo",
      "name": "Pasta para modelar de secado al aire, 1000 g",
      "type": "Masa para modelar",
      "attributes": {
        "peso_g": 1000
      },
      "aliases": [],
      "sources": [
        "ac_fila_das"
      ],
      "finding_ids": [
        "AC06"
      ]
    },
    {
      "key": "manual:ovillo-de-lana-50-m",
      "category": "manualidades",
      "name": "Ovillo de lana, 50 m",
      "type": "Lana",
      "attributes": {
        "largo_m": 50
      },
      "aliases": [],
      "sources": [
        "ac_crep"
      ],
      "finding_ids": [
        "AC10"
      ]
    },
    {
      "key": "manual:bolsa-de-palitos-de-helado-de-colores-50-unidades",
      "category": "manualidades",
      "name": "Bolsa de palitos de helado de colores, 50 unidades",
      "type": "Palitos",
      "attributes": {
        "unidades_por_envase": 50,
        "color": "Surtido"
      },
      "aliases": [],
      "sources": [
        "ac_palitos"
      ],
      "finding_ids": [
        "AC11"
      ]
    },
    {
      "key": "manual:pompones-escarchados",
      "category": "manualidades",
      "name": "Pompones escarchados",
      "type": "Pompones",
      "attributes": {
        "acabado": "Escarchado"
      },
      "aliases": [
        "pompones glitter",
        "pompones brillantes"
      ],
      "sources": [
        "ac_crep"
      ],
      "finding_ids": [
        "AC12"
      ]
    },
    {
      "key": "pegamento-barra:20-g",
      "category": "pegado-y-corte",
      "name": "Pegamento en barra, 20 g",
      "type": "Pegamento",
      "attributes": {
        "presentacion": "Barra",
        "peso_g": 20
      },
      "aliases": [],
      "sources": [
        "ac_sanisidro",
        "ac_staedtler_glue"
      ],
      "finding_ids": [
        "AC07"
      ]
    },
    {
      "key": "manual:cola-fria-escolar-lavable-225-g",
      "category": "pegado-y-corte",
      "name": "Cola fría escolar lavable, 225 g",
      "type": "Pegamento",
      "attributes": {
        "presentacion": "Líquida",
        "peso_g": 225,
        "tipo_adhesivo": "Cola fría",
        "lavable": true
      },
      "aliases": [],
      "sources": [
        "ac_torre_glue",
        "ac_sanisidro"
      ],
      "finding_ids": [
        "AC07",
        "AC13",
        "AC14"
      ]
    },
    {
      "key": "manual:cola-fria-escolar-250-g",
      "category": "pegado-y-corte",
      "name": "Cola fría escolar, 250 g",
      "type": "Pegamento",
      "attributes": {
        "presentacion": "Líquida",
        "peso_g": 250,
        "tipo_adhesivo": "Cola fría"
      },
      "aliases": [],
      "sources": [
        "ac_crep"
      ],
      "finding_ids": [
        "AC07",
        "AC14"
      ]
    },
    {
      "key": "manual:tijera-escolar-para-zurdos-13-cm",
      "category": "pegado-y-corte",
      "name": "Tijera escolar para zurdos, 13 cm",
      "type": "Tijeras",
      "attributes": {
        "largo_cm": 13,
        "lateralidad": "Zurda",
        "tipo_punta": "Redonda"
      },
      "aliases": [],
      "sources": [
        "ac_scissor"
      ],
      "finding_ids": [
        "AC08"
      ]
    },
    {
      "key": "manual:cinta-de-enmascarar-de-12-mm",
      "category": "pegado-y-corte",
      "name": "Cinta de enmascarar de 12 mm",
      "type": "Cinta adhesiva",
      "attributes": {
        "material": "Papel",
        "ancho_mm": 12
      },
      "aliases": [
        "masking tape 12mm"
      ],
      "sources": [
        "ac_chile"
      ],
      "finding_ids": [
        "AC09"
      ]
    },
    {
      "key": "manual:cinta-de-enmascarar-de-36-mm-40-m",
      "category": "pegado-y-corte",
      "name": "Cinta de enmascarar de 36 mm × 40 m",
      "type": "Cinta adhesiva",
      "attributes": {
        "material": "Papel",
        "ancho_mm": 36,
        "largo_m": 40
      },
      "aliases": [
        "masking tape 36mm 40m"
      ],
      "sources": [
        "ac_tape_masking"
      ],
      "finding_ids": [
        "AC09",
        "AC10"
      ]
    },
    {
      "key": "manual:cinta-adhesiva-transparente-de-18-mm-30-m",
      "category": "pegado-y-corte",
      "name": "Cinta adhesiva transparente de 18 mm × 30 m",
      "type": "Cinta adhesiva",
      "attributes": {
        "color": "Transparente",
        "ancho_mm": 18,
        "largo_m": 30
      },
      "aliases": [],
      "sources": [
        "ac_tape_crystal"
      ],
      "finding_ids": [
        "AC09",
        "AC10"
      ]
    },
    {
      "key": "manual:transportador-plastico-de-180",
      "category": "geometria",
      "name": "Transportador plástico de 180°",
      "type": "Transportador",
      "attributes": {
        "alcance_transportador_grados": 180,
        "material": "Plástico"
      },
      "aliases": [],
      "sources": [
        "of_cpfd6"
      ],
      "finding_ids": [
        "OF01",
        "OF03"
      ]
    },
    {
      "key": "manual:escuadra-plastica-de-45",
      "category": "geometria",
      "name": "Escuadra plástica de 45°",
      "type": "Escuadra",
      "attributes": {
        "angulo_escuadra_grados": 45,
        "material": "Plástico"
      },
      "aliases": [],
      "sources": [
        "of_cpfd6"
      ],
      "finding_ids": [
        "OF02",
        "OF03"
      ]
    },
    {
      "key": "manual:recarga-de-jabon-liquido-1000-ml",
      "category": "aseo",
      "name": "Recarga de jabón líquido, 1000 ml",
      "type": "Jabón",
      "attributes": {
        "volumen_ml": 1000,
        "presentacion": "Recarga"
      },
      "aliases": [
        "jabon liquido 1 litro",
        "jabon liquido 1l"
      ],
      "sources": [
        "of_pirque"
      ],
      "finding_ids": [
        "OF04"
      ]
    },
    {
      "key": "manual:jabon-liquido-con-dosificador-500-ml",
      "category": "aseo",
      "name": "Jabón líquido con dosificador, 500 ml",
      "type": "Jabón",
      "attributes": {
        "volumen_ml": 500
      },
      "aliases": [],
      "sources": [
        "of_caleman25"
      ],
      "finding_ids": [
        "OF04"
      ]
    },
    {
      "key": "manual:alcohol-gel-250-ml",
      "category": "aseo",
      "name": "Alcohol gel, 250 ml",
      "type": "Alcohol gel",
      "attributes": {
        "volumen_ml": 250
      },
      "aliases": [],
      "sources": [
        "of_caleman25"
      ],
      "finding_ids": [
        "OF04"
      ]
    },
    {
      "key": "manual:caja-de-panuelos-desechables-90-unidades",
      "category": "aseo",
      "name": "Caja de pañuelos desechables, 90 unidades",
      "type": "Pañuelos",
      "attributes": {
        "unidades_por_envase": 90
      },
      "aliases": [],
      "sources": [
        "of_kinderland"
      ],
      "finding_ids": [
        "OF05"
      ]
    },
    {
      "key": "manual:paquete-de-toallas-humedas-80-unidades",
      "category": "aseo",
      "name": "Paquete de toallas húmedas, 80 unidades",
      "type": "Toallas húmedas",
      "attributes": {
        "unidades_por_envase": 80
      },
      "aliases": [],
      "sources": [
        "of_kinderland"
      ],
      "finding_ids": [
        "OF05"
      ]
    },
    {
      "key": "manual:toalla-de-mano-30-40-cm",
      "category": "aseo",
      "name": "Toalla de mano 30 × 40 cm",
      "type": "Toalla",
      "attributes": {
        "dimension_menor_cm": 30,
        "dimension_mayor_cm": 40
      },
      "aliases": [],
      "sources": [
        "of_santaclara"
      ],
      "finding_ids": [
        "OF06"
      ]
    },
    {
      "key": "manual:flauta-dulce-soprano-de-digitacion-alemana",
      "category": "musica",
      "name": "Flauta dulce soprano de digitación alemana",
      "type": "Flauta",
      "attributes": {
        "digitacion_flauta": "Alemana"
      },
      "aliases": [],
      "sources": [
        "of_brs6",
        "of_yamaha"
      ],
      "finding_ids": [
        "OF07"
      ]
    },
    {
      "key": "manual:flauta-dulce-de-digitacion-barroca",
      "category": "musica",
      "name": "Flauta dulce de digitación barroca",
      "type": "Flauta",
      "attributes": {
        "digitacion_flauta": "Barroca"
      },
      "aliases": [],
      "sources": [
        "of_yamaha"
      ],
      "finding_ids": [
        "OF07"
      ]
    },
    {
      "key": "manual:melodica-de-32-notas",
      "category": "musica",
      "name": "Melódica de 32 notas",
      "type": "Melódica",
      "attributes": {
        "numero_notas": 32
      },
      "aliases": [
        "melodica 32 teclas"
      ],
      "sources": [
        "of_lasalle4"
      ],
      "finding_ids": [
        "OF08"
      ]
    },
    {
      "key": "manual:metalofono-cromatico-de-22-notas-sin-barras-de-colores",
      "category": "musica",
      "name": "Metalófono cromático de 22 notas sin barras de colores",
      "type": "Metalófono",
      "attributes": {
        "numero_notas": 22
      },
      "aliases": [
        "metalofono 22 notas"
      ],
      "sources": [
        "of_cpv2"
      ],
      "finding_ids": [
        "OF09"
      ]
    },
    {
      "key": "manual:memoria-usb-de-16-gb",
      "category": "tecnologia",
      "name": "Memoria USB de 16 GB",
      "type": "Memoria USB",
      "attributes": {
        "capacidad_gb": 16
      },
      "aliases": [
        "pendrive 16gb"
      ],
      "sources": [
        "of_csac3",
        "add_kingston_usb16"
      ],
      "finding_ids": [
        "OF10"
      ]
    },
    {
      "key": "manual:diccionario-de-significados-en-espanol",
      "category": "lectura-y-consulta",
      "name": "Diccionario de significados en español",
      "type": "Diccionario",
      "attributes": {
        "idioma": "Español",
        "contenido_diccionario": "Significados"
      },
      "aliases": [],
      "sources": [
        "of_stmonica4"
      ],
      "finding_ids": [
        "OF11"
      ]
    },
    {
      "key": "manual:diccionario-de-sinonimos-y-antonimos-en-espanol",
      "category": "lectura-y-consulta",
      "name": "Diccionario de sinónimos y antónimos en español",
      "type": "Diccionario",
      "attributes": {
        "idioma": "Español",
        "contenido_diccionario": "Sinónimos y antónimos"
      },
      "aliases": [],
      "sources": [
        "of_stmonica4"
      ],
      "finding_ids": [
        "OF11"
      ]
    },
    {
      "key": "manual:pizarra-blanca-cuadriculada-20-30-cm",
      "category": "material-didactico",
      "name": "Pizarra blanca cuadriculada 20 × 30 cm",
      "type": "Pizarra",
      "attributes": {
        "tipo_pauta": "Cuadriculada",
        "dimension_menor_cm": 20,
        "dimension_mayor_cm": 30
      },
      "aliases": [],
      "sources": [
        "of_pumahuek"
      ],
      "finding_ids": [
        "OF12"
      ]
    }
  ],
  "existing_item_updates": [
    {
      "key": "manual:lapiz-grafito-jumbo-triangular",
      "category": "escritura",
      "name": "Lápiz grafito jumbo triangular",
      "type": "Grafito",
      "expected_attributes": {
        "tamano": "Jumbo"
      },
      "attributes": {
        "forma_cuerpo": "Triangular"
      },
      "mode": "add_missing",
      "sources": [
        "ac_santo"
      ],
      "finding_ids": [
        "pw-05"
      ]
    },
    {
      "key": "manual:sacapuntas-doble-con-deposito",
      "category": "escritura",
      "name": "Sacapuntas doble con depósito",
      "type": "Sacapuntas",
      "expected_attributes": {
        "tamano": "Doble",
        "con_deposito": true
      },
      "attributes": {
        "numero_orificios": 2
      },
      "mode": "add_missing",
      "sources": [
        "pw-staedtler-holes",
        "pw-staedtler-catalogue"
      ],
      "finding_ids": [
        "pw-18"
      ]
    },
    {
      "key": "manual:tijera-punta-redonda",
      "category": "pegado-y-corte",
      "name": "Tijera escolar de punta redonda",
      "type": "Tijeras",
      "expected_attributes": {
        "tipo_punta": "redonda"
      },
      "attributes": {
        "tipo_punta": "Redonda"
      },
      "mode": "normalize",
      "sources": [
        "ac_scissor"
      ],
      "finding_ids": []
    },
    {
      "key": "manual:cola-fria-escolar",
      "category": "pegado-y-corte",
      "name": "Cola fría escolar",
      "type": "Pegamento",
      "expected_attributes": {
        "presentacion": "Líquida"
      },
      "attributes": {
        "tipo_adhesivo": "Cola fría"
      },
      "mode": "add_missing",
      "sources": [
        "ac_chile"
      ],
      "finding_ids": [
        "AC14"
      ]
    },
    {
      "key": "manual:cola-fria-escolar-250-ml",
      "category": "pegado-y-corte",
      "name": "Cola fría escolar, 250 ml",
      "type": "Pegamento",
      "expected_attributes": {
        "volumen_ml": 250,
        "presentacion": "Líquida"
      },
      "attributes": {
        "tipo_adhesivo": "Cola fría"
      },
      "mode": "add_missing",
      "sources": [
        "ac_santo"
      ],
      "finding_ids": [
        "AC14"
      ]
    },
    {
      "key": "manual:silicona-liquida",
      "category": "pegado-y-corte",
      "name": "Silicona líquida",
      "type": "Pegamento",
      "expected_attributes": {
        "presentacion": "Líquida"
      },
      "attributes": {
        "tipo_adhesivo": "Silicona"
      },
      "mode": "add_missing",
      "sources": [
        "ac_particularuno"
      ],
      "finding_ids": [
        "AC14"
      ]
    },
    {
      "key": "manual:barra-de-silicona",
      "category": "pegado-y-corte",
      "name": "Barra de silicona",
      "type": "Pegamento",
      "expected_attributes": {
        "presentacion": "Barra"
      },
      "attributes": {
        "tipo_adhesivo": "Silicona"
      },
      "mode": "add_missing",
      "sources": [
        "ac_crep"
      ],
      "finding_ids": [
        "AC14"
      ]
    }
  ],
  "guarded_definition_labels": [
    {
      "key": "tipo_pauta",
      "expected_name": "Pauta musical",
      "name": "Tipo de pauta"
    }
  ]
}
$attribute_coverage_008$::jsonb);

-- Lock surviving categories before reading the contracts used by their editors.
SELECT c.id FROM catalog.categories c
WHERE c.slug IN (SELECT value->>'slug' FROM attribute_coverage_008_data,
    jsonb_array_elements(document->'categories'))
ORDER BY c.id FOR UPDATE OF c;

CREATE TEMP TABLE attribute_coverage_008_categories ON COMMIT DROP AS
SELECT p->>'slug' slug,c.id category_id,d.key type_key,d.data_type,d.unit,
    t.attribute_id type_attribute_id
FROM attribute_coverage_008_data CROSS JOIN LATERAL jsonb_array_elements(document->'categories') p
JOIN catalog.categories c ON c.slug=p->>'slug'
LEFT JOIN catalog.category_type_attributes t ON t.category_id=c.id
LEFT JOIN catalog.attribute_definitions d ON d.id=t.attribute_id;

-- Removed categories stay removed; renamed type keys retain their identity.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM attribute_coverage_008_categories
        WHERE type_key IS NULL OR data_type<>'text' OR unit IS NOT NULL) THEN
        RAISE EXCEPTION 'Attribute coverage 008: missing or incompatible category type definition';
    END IF;
END $$;

CREATE TEMP TABLE attribute_coverage_008_bindings ON COMMIT DROP AS
SELECT c.category_id,c.type_attribute_id,b.key,b.applies_to_types,b.sort_order
FROM attribute_coverage_008_data,
    jsonb_to_recordset(document->'bindings') AS b(category text,key text,applies_to_types text[],sort_order integer)
JOIN attribute_coverage_008_categories c ON c.slug=b.category;

CREATE TEMP TABLE attribute_coverage_008_definitions ON COMMIT DROP AS
SELECT d.* FROM attribute_coverage_008_data,
    jsonb_to_recordset(document->'definitions') AS d(key text,name text,data_type text,unit text)
WHERE EXISTS(SELECT 1 FROM attribute_coverage_008_bindings b WHERE b.key=d.key);

DO $$ BEGIN
    IF EXISTS (SELECT category_id,key FROM attribute_coverage_008_bindings
        GROUP BY category_id,key HAVING count(*)>1)
       OR EXISTS(SELECT key FROM attribute_coverage_008_definitions GROUP BY key HAVING count(*)>1) THEN
        RAISE EXCEPTION 'Attribute coverage 008: duplicate proposed definition or binding';
    END IF;
    IF EXISTS (SELECT 1 FROM attribute_coverage_008_bindings b
        LEFT JOIN attribute_coverage_008_definitions d ON d.key=b.key
        LEFT JOIN catalog.category_attributes t ON t.category_id=b.category_id AND t.attribute_id=b.type_attribute_id
        WHERE d.key IS NULL OR t.attribute_id IS NULL OR b.applies_to_types IS NULL
          OR cardinality(b.applies_to_types)=0
          OR EXISTS(SELECT 1 FROM unnest(b.applies_to_types) proposed_type
              WHERE NOT proposed_type=ANY(t.options))) THEN
        RAISE EXCEPTION 'Attribute coverage 008: proposed binding conflicts with existing category types';
    END IF;
    IF EXISTS (SELECT 1 FROM attribute_coverage_008_definitions p
        JOIN catalog.attribute_definitions d USING(key)
        WHERE d.data_type<>p.data_type OR d.unit IS DISTINCT FROM p.unit) THEN
        RAISE EXCEPTION 'Attribute coverage 008: incompatible existing attribute definition type or unit';
    END IF;
    IF EXISTS (SELECT 1 FROM attribute_coverage_008_bindings b
        JOIN catalog.attribute_definitions d ON d.key=b.key
        JOIN catalog.category_type_attributes t ON t.attribute_id=d.id) THEN
        RAISE EXCEPTION 'Attribute coverage 008: detail definition is already a category type';
    END IF;
END $$;

INSERT INTO catalog.attribute_definitions(key,name,data_type,unit)
SELECT key,name,data_type,unit FROM attribute_coverage_008_definitions
ON CONFLICT(key) DO NOTHING;

-- Generalize only the unchanged starter label; administrator labels are retained.
UPDATE catalog.attribute_definitions d SET name=p.name
FROM attribute_coverage_008_data,
    jsonb_to_recordset(document->'guarded_definition_labels') AS p(key text,expected_name text,name text)
WHERE d.key=p.key AND d.name=p.expected_name
  AND EXISTS(SELECT 1 FROM attribute_coverage_008_bindings b WHERE b.key=p.key);

-- Explicit new applicability never narrows a formerly unrestricted binding.
-- Existing choices and display order remain under administrator control.
INSERT INTO catalog.category_attributes(category_id,attribute_id,applies_to_types,sort_order)
SELECT b.category_id,d.id,b.applies_to_types,COALESCE(b.sort_order,100+d.id::integer)
FROM attribute_coverage_008_bindings b JOIN catalog.attribute_definitions d ON d.key=b.key
ON CONFLICT(category_id,attribute_id) DO UPDATE SET applies_to_types=
    CASE WHEN cardinality(catalog.category_attributes.applies_to_types)=0
         THEN catalog.category_attributes.applies_to_types
         ELSE ARRAY(SELECT DISTINCT value FROM unnest(catalog.category_attributes.applies_to_types||excluded.applies_to_types) value ORDER BY value) END;

CREATE TEMP TABLE attribute_coverage_008_items ON COMMIT DROP AS
SELECT c.category_id,c.type_key,i.key,i.name,i.type,
    COALESCE(i.attributes,'{}'::jsonb)||jsonb_build_object(c.type_key,i.type) attributes,
    COALESCE(i.aliases,'[]'::jsonb) aliases,
    btrim(regexp_replace(translate(lower(i.name),'áéíóúüñ','aeiouun'),'[^[:alnum:]]+',' ','g')) normalized_name
FROM attribute_coverage_008_data,
    jsonb_to_recordset(document->'items') AS i(category text,key text,name text,type text,attributes jsonb,aliases jsonb)
JOIN attribute_coverage_008_categories c ON c.slug=i.category;

CREATE TEMP TABLE attribute_coverage_008_updates ON COMMIT DROP AS
SELECT c.category_id,c.type_key,u.key,u.name,u.type,u.mode,
    u.expected_attributes||jsonb_build_object(c.type_key,u.type) expected_attributes,
    u.attributes patch_attributes,
    u.expected_attributes||u.attributes||jsonb_build_object(c.type_key,u.type) attributes
FROM attribute_coverage_008_data,
    jsonb_to_recordset(COALESCE(document->'existing_item_updates','[]'::jsonb))
        AS u(category text,key text,name text,type text,mode text,expected_attributes jsonb,attributes jsonb)
JOIN attribute_coverage_008_categories c ON c.slug=u.category;

DO $$ BEGIN
    IF EXISTS(SELECT key FROM attribute_coverage_008_items GROUP BY key HAVING count(*)>1)
       OR EXISTS(SELECT category_id,normalized_name FROM attribute_coverage_008_items
                 GROUP BY category_id,normalized_name HAVING count(*)>1)
       OR EXISTS(SELECT key FROM attribute_coverage_008_updates GROUP BY key HAVING count(*)>1) THEN
        RAISE EXCEPTION 'Attribute coverage 008: duplicate proposed item identity';
    END IF;
    IF EXISTS(SELECT 1 FROM attribute_coverage_008_updates u
        WHERE mode NOT IN('add_missing','normalize')
          OR jsonb_typeof(patch_attributes)<>'object'
          OR patch_attributes='{}'::jsonb
          OR (mode='add_missing' AND EXISTS(SELECT 1 FROM jsonb_object_keys(patch_attributes) k
              WHERE expected_attributes ? k))
          OR (mode='normalize' AND NOT (
              key='manual:tijera-punta-redonda' AND name='Tijera escolar de punta redonda'
              AND type='Tijeras' AND expected_attributes->>'tipo_punta'='redonda'
              AND patch_attributes='{"tipo_punta":"Redonda"}'::jsonb))) THEN
        RAISE EXCEPTION 'Attribute coverage 008: invalid guarded item update';
    END IF;
END $$;

-- Ordinary new-item collisions are preserved across all review states.
CREATE TEMP TABLE attribute_coverage_008_candidates ON COMMIT DROP AS
SELECT p.* FROM attribute_coverage_008_items p
WHERE NOT EXISTS(SELECT 1 FROM catalog.items i WHERE i.canonical_key=p.key)
  AND NOT EXISTS(SELECT 1 FROM catalog.items i WHERE i.category_id=p.category_id
      AND btrim(regexp_replace(translate(lower(i.name),'áéíóúüñ','aeiouun'),'[^[:alnum:]]+',' ','g'))=p.normalized_name);

-- Lock potential old-item updates, then require their complete original snapshot.
-- Any renamed item, changed status, changed value or extra attribute is skipped.
SELECT i.id FROM catalog.items i JOIN attribute_coverage_008_updates u
ON i.canonical_key=u.key AND i.category_id=u.category_id
ORDER BY i.id FOR UPDATE OF i;
CREATE TEMP TABLE attribute_coverage_008_update_targets ON COMMIT DROP AS
SELECT i.id,u.* FROM attribute_coverage_008_updates u JOIN catalog.items i
ON i.canonical_key=u.key AND i.name=u.name AND i.category_id=u.category_id
WHERE i.review_status='approved'
  AND (SELECT COALESCE(jsonb_object_agg(d.key,COALESCE(to_jsonb(a.text_value),to_jsonb(a.number_value),to_jsonb(a.boolean_value))),'{}'::jsonb)
       FROM catalog.item_attributes a JOIN catalog.attribute_definitions d ON d.id=a.attribute_id
       WHERE a.item_id=i.id)=u.expected_attributes;

CREATE TEMP TABLE attribute_coverage_008_values ON COMMIT DROP AS
SELECT category_id,type_key,key,name,type,attributes FROM attribute_coverage_008_candidates
UNION ALL
SELECT category_id,type_key,key,name,type,attributes FROM attribute_coverage_008_update_targets;

DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM attribute_coverage_008_values
        WHERE btrim(key)='' OR btrim(name)='' OR length(name)>300 OR btrim(type)='') THEN
        RAISE EXCEPTION 'Attribute coverage 008: invalid proposed item name, identity or type';
    END IF;
    IF EXISTS(SELECT 1 FROM attribute_coverage_008_values p
        CROSS JOIN LATERAL jsonb_each(p.attributes) e
        LEFT JOIN catalog.attribute_definitions d ON d.key=e.key
        WHERE d.id IS NULL OR jsonb_typeof(e.value) IS DISTINCT FROM
            CASE d.data_type WHEN 'text' THEN 'string' ELSE d.data_type END
          OR (d.data_type='text' AND (btrim(e.value#>>'{}')='' OR length(e.value#>>'{}')>300))
          OR (d.data_type='number' AND CASE WHEN jsonb_typeof(e.value)='number'
              THEN (e.value#>>'{}')::numeric<=0 OR (e.value#>>'{}')::numeric>1000000 ELSE true END)) THEN
        RAISE EXCEPTION 'Attribute coverage 008: invalid proposed typed attribute';
    END IF;
    IF EXISTS(SELECT 1 FROM attribute_coverage_008_values p
        CROSS JOIN LATERAL jsonb_each(p.attributes) e
        JOIN catalog.attribute_definitions d ON d.key=e.key
        LEFT JOIN catalog.category_attributes a ON a.category_id=p.category_id AND a.attribute_id=d.id
        WHERE a.attribute_id IS NULL
          OR (cardinality(a.applies_to_types)>0 AND NOT p.type=ANY(a.applies_to_types))
          OR (cardinality(a.options)>0 AND NOT (e.value#>>'{}')=ANY(a.options))) THEN
        RAISE EXCEPTION 'Attribute coverage 008: proposed value conflicts with existing allowed choices';
    END IF;
END $$;

CREATE TEMP TABLE attribute_coverage_008_inserted (id uuid PRIMARY KEY,canonical_key text NOT NULL) ON COMMIT DROP;
WITH inserted AS (
    INSERT INTO catalog.items(category_id,name,canonical_key,review_status)
    SELECT category_id,name,key,'approved' FROM attribute_coverage_008_candidates
    ON CONFLICT(canonical_key) DO NOTHING RETURNING id,canonical_key
)
INSERT INTO attribute_coverage_008_inserted SELECT * FROM inserted;

INSERT INTO catalog.item_attributes(item_id,attribute_id,data_type,text_value,number_value,boolean_value)
SELECT i.id,d.id,d.data_type,
    CASE WHEN d.data_type='text' THEN e.value#>>'{}' END,
    CASE WHEN d.data_type='number' THEN (e.value#>>'{}')::numeric END,
    CASE WHEN d.data_type='boolean' THEN (e.value#>>'{}')::boolean END
FROM attribute_coverage_008_inserted i JOIN attribute_coverage_008_items p ON p.key=i.canonical_key
CROSS JOIN LATERAL jsonb_each(p.attributes) e JOIN catalog.attribute_definitions d ON d.key=e.key;

INSERT INTO catalog.item_attributes(item_id,attribute_id,data_type,text_value,number_value,boolean_value)
SELECT u.id,d.id,d.data_type,
    CASE WHEN d.data_type='text' THEN e.value#>>'{}' END,
    CASE WHEN d.data_type='number' THEN (e.value#>>'{}')::numeric END,
    CASE WHEN d.data_type='boolean' THEN (e.value#>>'{}')::boolean END
FROM attribute_coverage_008_update_targets u
CROSS JOIN LATERAL jsonb_each(u.patch_attributes) e
JOIN catalog.attribute_definitions d ON d.key=e.key
ON CONFLICT(item_id,attribute_id) DO UPDATE SET
    text_value=excluded.text_value,number_value=excluded.number_value,boolean_value=excluded.boolean_value;

INSERT INTO catalog.item_aliases(item_id,alias)
SELECT DISTINCT i.id,lower(btrim(alias)) FROM attribute_coverage_008_inserted i
JOIN attribute_coverage_008_items p ON p.key=i.canonical_key
CROSS JOIN LATERAL jsonb_array_elements_text(p.aliases) alias
WHERE btrim(alias)<>'' ON CONFLICT(item_id,alias) DO NOTHING;
