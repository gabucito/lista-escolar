# Catalog attribute research — 10 November 2026

**Original status: research and recommendations; no catalog or application data changed during this audit.**

**Implementation follow-up:** all 44 findings are covered by migration 008 and
the curated additions manifest. See the [implementation report](CATALOG_ATTRIBUTE_IMPLEMENTATION_2026-11-10.md)
for application status, validation and preservation checks. Counts and read-only
claims below describe the original research baseline.

The audit covers all **183 catalog items, 102 populated item types and 14 categories** in local `escolar`. There are **49 attribute definitions**: 14 category type fields and 35 detail fields, with **397 stored values**. The baseline was read on 2026-11-10 at 11:57−03.

The main gaps fall into four different groups: missing attribute definitions; existing definitions not enabled for the relevant item type; missing explicitly specified variants; and requirements that need alternatives or minimum values. These need different fixes.

**60 items contain only their type attribute. That is not a count of defective items.** Generic entries such as “Pincel” legitimately leave details open. However, Aseo and Manualidades currently have no detail-field bindings at all, so even a custom item cannot capture their useful specifications through those category forms.

## Current coverage

“Bound” counts non-type fields enabled somewhere in the category. “Populated” counts fields with at least one value; it does not imply coverage of every item type.

| Category | Items | Types with items | Bound detail fields | Populated detail fields | Items with only type |
|---|---:|---:|---:|---:|---:|
| Cuadernos | 31 | 8 | 5 | 5 | 0 |
| Escritura | 20 | 9 | 6 | 5 | 6 |
| Arte y dibujo | 40 | 17 | 13 | 12 | 11 |
| Manualidades | 11 | 11 | 0 | 0 | 11 |
| Geometría | 7 | 5 | 1 | 1 | 3 |
| Material didáctico | 5 | 5 | 3 | 3 | 3 |
| Papeles y cartulinas | 18 | 12 | 6 | 6 | 5 |
| Pegado y corte | 13 | 3 | 7 | 7 | 1 |
| Música | 9 | 9 | 1 | 1 | 8 |
| Organización | 14 | 10 | 7 | 7 | 2 |
| Tecnología | 3 | 2 | 2 | 2 | 1 |
| Lectura y consulta | 4 | 3 | 1 | 1 | 1 |
| Aseo | 8 | 8 | 0 | 0 | 8 |
| Otros | 0 | 0 | 0 | 0 | 0 |

No existing item attribute lacks a category binding, and no existing value falls outside its configured type applicability. The audit therefore found incomplete coverage rather than broken foreign-key relationships. `incluye_goma` is enabled for graphite pencils but has no values yet; `Otros` is intentionally empty.

## Findings and evidence

The research records **44 distinct recommendations** from **43 primary sources**: 18 recommendations involve **16 shared new definitions**, 19 enable existing definitions for additional types, and seven add explicit variants using fields already available. These are not 44 new attributes or 44 defective items. Additional bounded follow-ups are listed separately.

**P1** means first implementation priority because it supports an explicit classroom distinction or a major browsing gap. **P2** means a useful optional extension. Priorities describe this research, not production incidents. Most school evidence is from 2026; one 2025 hygiene list is explicitly historical. Manufacturer pages establish a specification, not local availability or a universal school requirement.

The [structured research dataset](catalog-attribute-research-2026-11-10.json) contains each finding’s current coverage, proposed data type/unit, exact example values, source references, verification status and caveats. Values from different products must not be combined into invented variants.

### Cuadernos

| Finding | Priority | Item type and attribute | Change | Evidenced examples |
|---|---|---|---|---|
| pw-01 | P1 | Cuadriculado, Composición — Con margen | New field | Yes |
| pw-02 | P1 | Cuadriculado, Caligrafía — Con espiral | New field | No, Yes |
| pw-03 | P2 | Cuadriculado — Número de hojas | Add explicit variant | 150 hojas |

**pw-01:** Add optional con_margen and explicit margin-required variants or custom requirements. Missing does not mean false; do not mark all existing notebooks as having margins. Evidence: [The International School La Serena — quinto básico 2026](https://www.tisls.cl/portal/wp-content/uploads/2025/12/Lista05-2026.pdf).

**pw-02:** Add an optional spiral boolean; require a separate text detail only if simple/double/side placement is needed. A college format alone does not prove that binding is stitched or spiral-free. Preserve special classroom instructions. Evidence: [Colegio Monteverde Chiloé — segundo básico 2026](https://www.monteverdechiloe.cl/documentos/lista-utiles-2-basico-2026.pdf), [Torre — Cuaderno Triple Liso 7 mm 150 hojas](https://www.torre.cl/catalogo/cuaderno-triple-liso-7mm-150hjs/).

**pw-03:** Add a researched 150-sheet, 7 mm notebook option with explicit binding only when required. 150 sheets are not 150 pages. Do not turn manufacturer title Liso into blank ruling or infer a subject count from Triple. Evidence: [Torre — Cuaderno Triple Liso 7 mm 150 hojas](https://www.torre.cl/catalogo/cuaderno-triple-liso-7mm-150hjs/).

### Escritura

| Finding | Priority | Item type and attribute | Change | Evidenced examples |
|---|---|---|---|---|
| pw-04 | P1 | Grafito — Dureza del grafito | Add explicit variant | HB, 2B |
| pw-05 | P1 | Grafito — Forma del cuerpo | New field | Triangular, Hexagonal |
| pw-06 | P1 | Marcador — Tipo de punta | Enable existing field | Redonda, Biselada |
| pw-07 | P1 | Corrector — Presentación | Enable existing field | Líquida |
| pw-08 | P1 | Destacador — Color | Enable existing field | Verde, Amarillo |
| pw-16 | P2 | Grafito — Incluye goma | Add explicit variant | Yes, No |
| pw-17 | P1 | Marcador — Grosor de punta | New field | Fina, Gruesa |
| pw-18 | P2 | Sacapuntas — Número de orificios | New field | 2 orificios |

**pw-04:** Add ordinary HB and 2B generic variants using the existing hardness attribute. Do not backfill HB onto the existing unrestricted Lápiz grafito requirement. Evidence: [The International School La Serena — quinto básico 2026](https://www.tisls.cl/portal/wp-content/uploads/2025/12/Lista05-2026.pdf), [Colegio Chuquicamata — séptimo básico 2026](https://colegiochuquicamata.cl/2019/wp-content/uploads/2025/12/Lista_Materiales_7_BASICO_2026.pdf).

**pw-05:** Add body shape independently from size; review an explicit triangular backfill for that named item and future variants. Jumbo, triangular and graphite hardness are separate properties; one must not imply the others. Evidence: [Torre — lápices grafito official product family](https://www.torre.cl/product-category/mundo-escolar/arte-y-dibujo/lapices/lapices-grafito/).

**pw-06:** Reuse tipo_punta for marker shape only, with round/chisel variants where explicitly supported. Pair it with an independent thickness-class field when both are specified. Round/chisel shape does not determine whether the tip is fine or broad. No millimeter width is inferred from shape. Evidence: [Artel — catálogo 2022, marcadores](https://www.artel.cl/wp-content/uploads/2021/10/catalogo%20artel%202022.pdf).

**pw-07:** Reuse presentacion for an explicit liquid corrector variant and leave the generic item unrestricted. Tape correction is a plausible further format but is not evidenced by the sources attached to this finding. Evidence: [Colegio Chuquicamata — séptimo básico 2026](https://colegiochuquicamata.cl/2019/wp-content/uploads/2025/12/Lista_Materiales_7_BASICO_2026.pdf).

**pw-08:** Extend conditional color applicability to Destacador and add green/yellow choices. The school allows green OR yellow: use one alternative requirement with a shared quantity, not two mandatory rows. Evidence: [The International School La Serena — quinto básico 2026](https://www.tisls.cl/portal/wp-content/uploads/2025/12/Lista05-2026.pdf).

**pw-16:** Add explicit with-eraser and without-eraser options where requested; both boolean states should be filterable. An absent value remains unspecified, not false; do not infer presence from the graphite grade. Evidence: [Torre — lápices grafito official product family](https://www.torre.cl/product-category/mundo-escolar/arte-y-dibujo/lapices/lapices-grafito/).

**pw-17:** Add a separate optional textual tip-thickness class, allowing combinations such as redonda plus fina without overwriting tip shape. School sources name fine/broad tips rather than exact line widths. Do not manufacture millimeter values or treat this label as a measured stroke width. Evidence: [Colegio Chuquicamata — séptimo básico 2026](https://colegiochuquicamata.cl/2019/wp-content/uploads/2025/12/Lista_Materiales_7_BASICO_2026.pdf), [Colegio Mayor Peñalolén — Play Group 2026](https://webpe.colegiomayor.cl/wp-content/uploads/2026/01/Lista-PLAY-GROUP-2026-1.pdf).

**pw-18:** Add a numeric sharpener hole-count field; review replacing the named double sharpener’s Doble size classification with two holes while preserving identities and existing list snapshots. Hole count does not imply container presence or physical dimensions. Do not infer single-hole count for unspecified sharpeners or modify already curated values blindly. Evidence: [STAEDTLER 512 07 double-hole tub sharpener](https://www.staedtler.com/us/en/products/pencils-and-accessories/sharpeners/staedtler-512-07-double-hole-tub-sharpener-51207sbka6/), [STAEDTLER general catalogue 2022](https://www.staedtler.com/fileadmin/user_upload/Product/PDF/STAEDTLER-General-Catalogue-2022_GB.1645707372.pdf).

### Arte y dibujo

| Finding | Priority | Item type and attribute | Change | Evidenced examples |
|---|---|---|---|---|
| AC01 | P1 | Témperas — Contenido | Enable existing field | 100, 250, 500 ml |
| AC02 | P1 | Témperas — Color | Enable existing field | Rojo, Azul, Verde, Amarillo, Blanco, Negro |
| AC03 | P1 | Croquera; Block — Gramaje | New field | 70 g/m² |
| AC04 | P1 | Block — Dimensión menor | Enable existing field | 26.5 cm |
| AC05 | P1 | Pincel — Número de pincel | Add explicit variant | 8, 10 |
| AC06 | P2 | Masa para modelar; Arcilla — Peso | Enable existing field | 250, 500, 1000 g |

**AC01:** Bind volume to Témperas and add explicitly sourced single-bottle requirements, beginning with 250 ml. For sets, per-pot volume and total set volume differ; do not place a per-pot amount in a field labeled total content. Only 250 ml has current school-list demand here. Evidence: [CREP: Educación Parvularia NT2 2026](https://crep.cl/docs/listadeutiles/2026/Lista_de_utiles_NT2_2026.pdf), [Artel: Catálogo 2025](https://www.artel.cl/wp-content/uploads/2024/11/Catalogo_Artel_2025.pdf).

**AC02:** Allow individual paint colors as optional filters and requirements; retain assorted sets. The school calls these suggested alternatives. Do not turn its suggested palette into six mandatory separate purchases. Evidence: [CREP: Educación Parvularia NT2 2026](https://crep.cl/docs/listadeutiles/2026/Lista_de_utiles_NT2_2026.pdf).

**AC03:** Create an optional paper grammage field and bind it to sketchbooks/drawing blocks, shared with paper categories. Proarte explicitly verifies 70 g/m². The school uses the shorthand 80 gr; preserve that wording for review until its exact g/m² meaning is corroborated, rather than treating it as total paper weight. Evidence: [Proarte: Croquera 22×32 cms](https://proarte.cl/producto/croquera/), [Colegio Chile: eighth grade 2026](https://www.colegiochile.cl/wp-content/uploads/2026/01/Utiles8Bas2026.pdf).

**AC04:** Extend both existing dimension fields to Block; add the evidenced pair 26.5×37.2 cm as an explicit variant. Do not assume every manufacturer uses identical dimensions for a named block fraction. Evidence: [Colegio Chile: eighth grade 2026](https://www.colegiochile.cl/wp-content/uploads/2026/01/Utiles8Bas2026.pdf).

**AC05:** Add sourced brush requirements for sizes 8 and 10; flat size 10 is explicitly requested. Brush number is a manufacturer size designation, not millimeters. A source giving number without shape must remain unspecified on shape. Evidence: [CREP: Educación Parvularia NT2 2026](https://crep.cl/docs/listadeutiles/2026/Lista_de_utiles_NT2_2026.pdf), [Colegio Chile: eighth grade 2026](https://www.colegiochile.cl/wp-content/uploads/2026/01/Utiles8Bas2026.pdf).

**AC06:** Bind net content by mass to modeling materials; keep clay, air-dry paste and cold porcelain distinct when adding exact variants. FILA directly verifies 250/500/1000 g for air-drying modeling clay. The additional Artel material-specific mappings are indexed: paste 500 g, clay 1000 g, cold porcelain 250/500 g. Do not treat air-dry paste, traditional firing clay and cold porcelain as equivalent or generate unsupported cross-combinations. Evidence: [FILA: DAS modeling clay](https://www.fila.it/int/en/product/das/), [Artel: Catálogo 2025](https://www.artel.cl/wp-content/uploads/2024/11/Catalogo_Artel_2025.pdf), [CREP: Educación Parvularia NT2 2026](https://crep.cl/docs/listadeutiles/2026/Lista_de_utiles_NT2_2026.pdf).

A further variant-only gap uses fields already enabled for Croquera: **80 sheets, 21 × 32 cm** in the [Colegio Chile list](https://www.colegiochile.cl/wp-content/uploads/2026/01/Utiles8Bas2026.pdf), and **100 sheets, 22 × 32 cm** in [Proarte’s specification](https://proarte.cl/producto/croquera/). Neither pair is present. Keep them as separate explicit options; do not infer them from “Croquera tamaño carta.”

### Manualidades

| Finding | Priority | Item type and attribute | Change | Evidenced examples |
|---|---|---|---|---|
| AC10 | P1 | Cinta adhesiva; Lana — Largo | New field | 30, 40, 50 m |
| AC11 | P2 | Palitos — Unidades por envase | New field | 50 unidades |
| AC12 | P1 | Pompones — Acabado | Enable existing field | Escarchado |

**AC10:** Create length in meters for tape rolls and yarn; use 30 m crystalline tape,40 m masking tape and 50 m yarn as sourced examples. These are lengths per roll/ball, not list quantities or lengths of an entire wholesale pack. Evidence: [Torre: Cinta Tradicional Cristal 18 mm × 30 m](https://www.torre.cl/catalogo/cinta-tradicional-cristal-set-8-unid-18-mm-x-30-mt/), [Torre: Cinta Masking Color Crema 36 mm × 40 m](https://www.torre.cl/catalogo/cinta-masking-color-crema-36-mm-x-40-mt/), [CREP: Educación Parvularia NT2 2026](https://crep.cl/docs/listadeutiles/2026/Lista_de_utiles_NT2_2026.pdf).

**AC11:** Reuse the same proposed package-content field as hygiene consumables for a clearly named 50-stick bag. Preserve loose-stick requirements. Keep loose-stick requirements possible. One requirement quantity 50 means 50 bags if the selected item itself is a 50-piece bag; UI must distinguish pack content from requested units. Evidence: [Artel: Palitos de helado colores, bolsa 50 unidades](https://www.artel.cl/producto/palitos-de-helado-colores-bolsa-50-unidades/).

**AC12:** Reuse the existing finish attribute for glitter/shiny pompoms, with consistent Spanish value and search aliases for glitter. Do not infer individual diameter from a supplier package dimension; assorted colors and sizes can remain unspecified. Evidence: [CREP: Educación Parvularia NT2 2026](https://crep.cl/docs/listadeutiles/2026/Lista_de_utiles_NT2_2026.pdf), [Torre: Pompones Brillantes](https://www.torre.cl/catalogo/pompones-brillantes/).

### Geometría

| Finding | Priority | Item type and attribute | Change | Evidenced examples |
|---|---|---|---|---|
| OF01 | P1 | Transportador — Alcance del transportador | New field | 180 ° |
| OF02 | P1 | Escuadra — Ángulo de la escuadra | New field | 45 ° |
| OF03 | P2 | Escuadra / Transportador — Material | Enable existing field | Plástico |

**OF01:** Add an optional angular-range attribute and a 180-degree variant. Keep the unspecified protractor selectable. Do not infer 360-degree support or diameter from the generic item. Range is not the angle of a set square. Evidence: [Lista de útiles 6° básico 2026 — cpfd.cl](https://www.cpfd.cl/utiles2026/LISTA%20DE%20UTILES%206%20BASICO%202026.pdf).

**OF02:** Add an optional set-square angle and a 45-degree variant; bind existing largo_cm when a declared commercial length is known. A right-angle set square has several angles: this field must mean its distinguishing acute angle. Do not infer which side the source means by 15 cm. Evidence: [Lista de útiles 6° básico 2026 — cpfd.cl](https://www.cpfd.cl/utiles2026/LISTA%20DE%20UTILES%206%20BASICO%202026.pdf).

**OF03:** Bind material conditionally to Escuadra and Transportador and use it only on explicitly material-specific variants. This source does not establish that every school wants plastic or that every current generic item is plastic. Evidence: [Lista de útiles 6° básico 2026 — cpfd.cl](https://www.cpfd.cl/utiles2026/LISTA%20DE%20UTILES%206%20BASICO%202026.pdf).

### Material didáctico

| Finding | Priority | Item type and attribute | Change | Evidenced examples |
|---|---|---|---|---|
| OF12 | P2 | Pizarra — Tipo de pauta | Enable existing field | Cuadriculada |

**OF12:** Reuse tipo_pauta for the optional board ruling after deliberately generalizing its display name from Pauta musical to Tipo de pauta. Bind it to Pizarra with Cuadriculada; preserve the existing music binding and values. Reuse requires the label review: the current Pauta musical label is inappropriate for boards. The source gives no grid spacing, so do not invent cuadricula_mm or classify the existing generic board as blank. Keep category-specific choice sets. Evidence: [Colegio Pumahue Temuco: Kínder Bilingüe supplies 2026](https://www.ddee.cl/upload_archivos/lista_utiles/upload/2026/TEM/Bilingue/K/archivo.pdf).

### Papeles y cartulinas

| Finding | Priority | Item type and attribute | Change | Evidenced examples |
|---|---|---|---|---|
| pw-09 | P2 | Papel — Gramaje | New field | 75, 90 g/m² |
| pw-10 | P1 | Papel, Cartulina — Número de hojas | Enable existing field | 500, 18 hojas |
| pw-11 | P1 | Cartulina — Dimensión menor | Enable existing field | 26.5 cm |
| pw-12 | P1 | Cartulina — Acabado | Enable existing field | Metálico, Fluorescente |
| pw-15 | P2 | Cartulina, Goma EVA — Número de colores | Enable existing field | 14, 10 colores |

**pw-09:** Introduce paper grammage with an explicit g/m² unit; expose it only for paper types with evidenced variants. The manufacturer supports the grammage endpoints; do not fabricate every intermediate value or parse ambiguous bare grams as grammage. Local availability is not established. Evidence: [Chamex — Sobre Chamex](https://chamex.com.br/es/sobre-chamex).

**pw-10:** Bind sheet count to these paper types and create clearly named pack/ream requirements, e.g. one 500-sheet carta ream. List quantity counts requested packs; the attribute counts sheets inside each pack. Do not turn unrestricted paper into a 500-sheet requirement. Evidence: [Colegio Mayor Peñalolén — Play Group 2026](https://webpe.colegiomayor.cl/wp-content/uploads/2026/01/Lista-PLAY-GROUP-2026-1.pdf), [Torre — Bolsón Cartulina 18 hojas Imagia](https://www.torre.cl/catalogo/cartulina/).

**pw-11:** Extend both dimensions to Cartulina and use the explicit 26.5 × 37.5 cm sheet variant. Use physical sheet dimensions from the product contents, not shipping/package dimensions or assumed universal pliego dimensions. Evidence: [Torre — Bolsón Cartulina 18 hojas Imagia](https://www.torre.cl/catalogo/cartulina/).

**pw-12:** Extend acabado to Cartulina with explicit metallic and fluorescent variants. A finish is not a color or a brand; avoid replacing ordinary cardstock with a special-finish requirement. Evidence: [Colegio Mayor Peñalolén — Play Group 2026](https://webpe.colegiomayor.cl/wp-content/uploads/2026/01/Lista-PLAY-GROUP-2026-1.pdf), [Colegio Leonardo Da Vinci de Las Condes — listas 2026](https://www.corplascondes.cl/descargas/educacion/ldv/2026-alumnos-lista-utiles.pdf).

**pw-15:** Reuse the color-count definition for explicitly counted paper/EVA packs. The Torre example has 18 sheets but 14 colors. Do not derive colors from sheets, pieces, or package quantity. Evidence: [Torre — Bolsón Cartulina 18 hojas Imagia](https://www.torre.cl/catalogo/cartulina/), [Colegio Mayor Peñalolén — Play Group 2026](https://webpe.colegiomayor.cl/wp-content/uploads/2026/01/Lista-PLAY-GROUP-2026-1.pdf).

### Pegado y corte

| Finding | Priority | Item type and attribute | Change | Evidenced examples |
|---|---|---|---|---|
| AC07 | P1 | Pegamento — Peso | Add explicit variant | 20, 225, 250 g |
| AC08 | P2 | Tijeras — Largo | Enable existing field | 13 cm |
| AC09 | P1 | Cinta adhesiva — Ancho | New field | 12, 18, 36 mm |
| AC10 | P1 | Cinta adhesiva; Lana — Largo | New field | 30, 40, 50 m |
| AC13 | P2 | Pegamento — Lavable | New field | Yes |
| AC14 | P1 | Pegamento — Familia de adhesivo | New field | Cola fría, Silicona |

**AC07:** Add glue-stick 20 g and white-glue 225 g/250 g requirements with exact mass units. 250 ml is separately supported by Santo Domingo and is not an error. Never convert glue grams to milliliters without product density;20 g is not 21 g. Torre directly confirms 225 g; STAEDTLER independently confirms 20 g in official indexed product text, although its direct page was rate-limited. Evidence: [Colegio San Isidro: second grade 2026](https://www.colegiosanisidro.cl/wp-content/uploads/2025/12/Lista-de-utiles-2%C2%B0Basico-2026.pdf), [CREP: Educación Parvularia NT2 2026](https://crep.cl/docs/listadeutiles/2026/Lista_de_utiles_NT2_2026.pdf), [Colegio Santo Domingo de Guzmán: school lists 2026](https://santodomingovalparaiso.cl/wp-content/uploads/2025/12/LISTA-DE-UTILES-2026.pdf), [Torre: Cola Fría 225 Gr](https://www.torre.cl/catalogo/cola-fria-225-gr/), [STAEDTLER Noris960 glue stick20g](https://www.staedtler.com/intl/en/products/products-for-colouring/crafting-accessories/glue-sticks/noris-960-glue-stick-96020pca12/).

**AC08:** Bind length to scissors and permit an explicit 13 cm variant when requested. Preserve generic left-handed requirements without forcing 13 cm; this is manufacturer product evidence, not a universal school specification. Evidence: [Artel/Maped: Tijera Zurdo Essential 13 cm](https://www.artel.cl/producto/blister-tijera-zurdo-essential-13cm/).

**AC09:** Create tape width in millimeters;12 mm masking tape has direct school-list demand. 18 mm applies to the crystalline tape evidence;36 mm to masking. Width must not be confused with roll diameter or package dimensions. Evidence: [Colegio Chile: eighth grade 2026](https://www.colegiochile.cl/wp-content/uploads/2026/01/Utiles8Bas2026.pdf), [Torre: Cinta Tradicional Cristal 18 mm × 30 m](https://www.torre.cl/catalogo/cinta-tradicional-cristal-set-8-unid-18-mm-x-30-mt/), [Torre: Cinta Masking Color Crema 36 mm × 40 m](https://www.torre.cl/catalogo/cinta-masking-color-crema-36-mm-x-40-mt/).

**AC10:** Create length in meters for tape rolls and yarn; use 30 m crystalline tape,40 m masking tape and 50 m yarn as sourced examples. These are lengths per roll/ball, not list quantities or lengths of an entire wholesale pack. Evidence: [Torre: Cinta Tradicional Cristal 18 mm × 30 m](https://www.torre.cl/catalogo/cinta-tradicional-cristal-set-8-unid-18-mm-x-30-mt/), [Torre: Cinta Masking Color Crema 36 mm × 40 m](https://www.torre.cl/catalogo/cinta-masking-color-crema-36-mm-x-40-mt/), [CREP: Educación Parvularia NT2 2026](https://crep.cl/docs/listadeutiles/2026/Lista_de_utiles_NT2_2026.pdf).

**AC13:** Support an optional washable requirement for glue when an authoritative source explicitly requests it. Do not set false on existing unspecified items; washability conditions vary by substrate and no generic safety/non-toxic claim follows from this flag. Torre directly confirms washable 225 g school glue; the school evidence for requiring washability is indexed. Evidence: [Colegio Bicentenario N°1 de Ñuñoa: eighth grade 2026](https://particularuno.cl/wp-content/uploads/2022/02/8%C2%B0-BASICO-2026.pdf), [Torre: Cola Fría 225 Gr](https://www.torre.cl/catalogo/cola-fria-225-gr/).

**AC14:** Add optional adhesive-family values Cola fría and Silicona alongside presentation. Resolve other family labels before offering them as mutually exclusive choices. This is a navigation/model recommendation supported by distinct school requirements. It must not alter existing item identity or reinterpret unspecified generic glue. Evidence: [Colegio Chile: eighth grade 2026](https://www.colegiochile.cl/wp-content/uploads/2026/01/Utiles8Bas2026.pdf), [Colegio Bicentenario N°1 de Ñuñoa: eighth grade 2026](https://particularuno.cl/wp-content/uploads/2022/02/8%C2%B0-BASICO-2026.pdf).

### Música

| Finding | Priority | Item type and attribute | Change | Evidenced examples |
|---|---|---|---|---|
| OF07 | P1 | Flauta — Digitación de flauta | New field | Alemana, Barroca |
| OF08 | P1 | Melódica — Número de notas | Enable existing field | 32 notas |
| OF09 | P1 | Metalófono — Número de notas | Add explicit variant | 22 notas |

**OF07:** Add a conditional fingering attribute. German-fingering school variant has direct 2026 evidence; Baroque is a manufacturer-verified alternative only. Do not silently assign German fingering to the generic soprano flute. Fingering is not tuning or pitch; labels such as afinación alemana in some lists should normalize carefully. Evidence: [Lista de útiles 6° básico 2026 — BRS](https://brs.cl/wp-content/uploads/2025/11/6%C2%B0-Basico-2026-Lista-de-Utiles.docx.pdf), [Yamaha: Baroque style and German style recorders](https://www.yamaha.com/en/musical_instrument_guide/recorder/selection/selection002.html).

**OF08:** Extend numero_notas to Melódica and add the school-evidenced 32-note option. If a separate key count is needed later, document the semantics instead of silently treating every instrument equally. Exact 32-note evidence is in La Salle; Pumahue requests at least 32 keys. Preserve minimum wording rather than reducing a flexible requirement to exact 32. Evidence: [Instituto La Salle: fourth grade supplies 2026](https://www.institutolasalle.cl/PDFs/2026/lista_de_utiles_4_2026.pdf), [Colegio Pumahue Peñalolén: eighth grade supplies 2026](https://www.ddee.cl/upload_archivos/lista_utiles/upload/2026/PEN/Bilingue/8B/archivo.pdf).

**OF09:** Add 22-note catalog coverage and make chromatic vs other scale properties explicit when curated. CPV also requests uncolored bars: count alone does not completely represent that particular school requirement. Do not infer the bar colors of generic or 25-note items. Evidence: [CPV Peñalolén: second grade supplies 2026](https://cpvpenalolen.cl/wp-content/uploads/2025/12/2%C2%B0-basico-2026.docx.pdf).

### Organización

| Finding | Priority | Item type and attribute | Change | Evidenced examples |
|---|---|---|---|---|
| pw-13 | P1 | Carpeta, Forro — Color | Enable existing field | Azul, Verde, Negro, Blanco, Amarillo, Celeste, Morado, Gris |
| pw-14 | P1 | Carpeta — Número de fundas | New field | 20 fundas |

**pw-13:** Extend color applicability to Carpeta and Forro, then curate source-backed choices alongside existing format and closure. The cover color belongs to the cover requirement; do not silently equate it to notebook-paper color or force every notebook to have a cover. Evidence: [Colegio del Verbo Divino — séptimo básico 2026](https://www.cvd.cl/documents/38730/3264604/7B%2BLista_Utiles_Apo_2026.pdf/9590c514-e1a5-81d0-40d2-afbf12b23d09?t=1767881431529).

**pw-14:** Add optional sleeve count and a clearly named oficio folder with 20 sleeves. 20 sleeves are not 20 folders, 20 loose sheets or a guaranteed number of display pages. Keep material and cover hardness optional unless specified. Evidence: [Colegio del Verbo Divino — séptimo básico 2026](https://www.cvd.cl/documents/38730/3264604/7B%2BLista_Utiles_Apo_2026.pdf/9590c514-e1a5-81d0-40d2-afbf12b23d09?t=1767881431529), [Torre — Carpeta tradicional 20 fundas oficio negra](https://www.torre.cl/catalogo/carpeta-con-fundas-tradicional-20-fundas-formato-oficio-negra/).

### Tecnología

| Finding | Priority | Item type and attribute | Change | Evidenced examples |
|---|---|---|---|---|
| OF10 | P1 | Memoria USB — Capacidad de almacenamiento | Add explicit variant | 16 GB |

**OF10:** Add 16 GB coverage and support writing a minimum-capacity requirement without adding irrelevant brand/speed restrictions. The source says minimum 16 GB; 32 GB and larger may satisfy it. Existing exact-value facets do not express this acceptance rule. Capacity here is storage capacity, not free space. Evidence: [CSAC: third grade supplies 2026](https://csac.cl/wp-content/uploads/2025/12/3%C2%B0-Basico-LISTA-DE-UTILES-2026.pdf).

### Lectura y consulta

| Finding | Priority | Item type and attribute | Change | Evidenced examples |
|---|---|---|---|---|
| OF11 | P1 | Diccionario — Contenido del diccionario | New field | Significados, Sinónimos y antónimos |

**OF11:** Add optional dictionary-content scope and a Spanish synonyms-and-antonyms option; preserve the existing language field. Language alone cannot distinguish two Spanish dictionaries. Named suggested publishers are not generic attributes, and specific editions belong in notes when required. Evidence: [St Monica: fourth grade supplies 2026](https://stmonica.cl/wp-content/uploads/2026/01/Lista-de-utiles-cuartos-basicos-ok-1.docx-2.pdf).

### Aseo

| Finding | Priority | Item type and attribute | Change | Evidenced examples |
|---|---|---|---|---|
| OF04 | P1 | Jabón / Alcohol gel — Contenido | Enable existing field | 250, 500, 1000 ml |
| OF05 | P1 | Pañuelos / Toallas húmedas — Unidades por envase | New field | 80, 90 unidades |
| OF06 | P2 | Toalla — Dimensión menor | Enable existing field | 30 cm |

**OF04:** Bind volumen_ml to Jabón and Alcohol gel. Current 2026 evidence supports liquid-soap refill 1000 ml; historical 2025 evidence supports soap 500 ml and gel 250 ml. Preserve bottle/package quantity separately. The 2025 source must remain labeled historical; do not infer concentration or efficacy. Soap presentation/refill/dispenser are separate optional properties. Evidence: [Escuela de Lenguaje Pirque: Kínder materials 2026](https://escueladelenguajepirque.cl/lista-de-materiales-kinder-2026/), [Colegio Alemán: Kínder supplies 2025](https://www.caleman.cl/listas/2025/Lista%20de%20utiles%20escolares%20-%20Kinder%202025.pdf).

**OF05:** Represent wet-wipe pack 80 and tissue box 90 as per-package contents. Add presentation separately if helpful. Five packs of 80 is not 80 list items; six boxes of 90 is not 90 boxes. Do not reuse numero_hojas (paper sheets) or numero_piezas without a documented common pack-content meaning. Evidence: [Kinderland: Medio Menor materials 2026](https://kinderland.cl/wp-content/uploads/2025/10/LISTA-DE-MATERIALES-M.Menor-2026.pdf).

**OF06:** Bind both shared dimensional attributes to Toalla and add an explicit 30 × 40 cm option. A paired dimension is required to express this source; 30 alone is incomplete. Generic hand-towel remains valid when dimensions are not specified. Evidence: [Liceo Santa Clara: 5°–8° básico supplies 2026](https://lsantaclara.cl/web/content/6947?download=true&unique=7da92104e49ee32ed896e76a7c7ba90cd8a9bdcc).

### Otros

No researched attribute addition is proposed. This empty catch-all category is not a data defect.

## Proposed shared definitions

These are a proposed contract for review before a migration. Repeated use across categories creates one definition, with conditional category/type bindings. Existing fields such as `color`, `numero_hojas`, `volumen_ml` and both dimensional fields are reused.

| Key | Display label | Data type | Unit | Categories |
|---|---|---|---|---|
| `alcance_transportador_grados` | Alcance del transportador | number | ° | Geometría |
| `ancho_mm` | Ancho | number | mm | Pegado y corte |
| `angulo_escuadra_grados` | Ángulo de la escuadra | number | ° | Geometría |
| `con_espiral` | Con espiral | boolean | — | Cuadernos |
| `con_margen` | Con margen | boolean | — | Cuadernos |
| `contenido_diccionario` | Contenido del diccionario | text | — | Lectura y consulta |
| `digitacion_flauta` | Digitación de flauta | text | — | Música |
| `forma_cuerpo` | Forma del cuerpo | text | — | Escritura |
| `gramaje_g_m2` | Gramaje | number | g/m² | Arte y dibujo, Papeles y cartulinas |
| `grosor_punta` | Grosor de punta | text | — | Escritura |
| `largo_m` | Largo | number | m | Manualidades, Pegado y corte |
| `lavable` | Lavable | boolean | — | Pegado y corte |
| `numero_fundas` | Número de fundas | number | fundas | Organización |
| `numero_orificios` | Número de orificios | number | orificios | Escritura |
| `tipo_adhesivo` | Familia de adhesivo | text | — | Pegado y corte |
| `unidades_por_envase` | Unidades por envase | number | unidades | Aseo, Manualidades |

## Data and requirement-model decisions

1. **Unspecified remains unspecified.** Absence is different from false, zero, or a specific option. Keep broad entries such as Lápiz grafito, Carpeta, Pincel and Flauta dulce soprano. Add specific variants alongside them; do not retroactively require HB, a color, a size or a fingering system.

2. **Keep package contents separate from list quantity.** Use `unidades_por_envase` for bags of sticks, boxes of tissues and wipe packs; reserve `numero_piezas` for constituent parts of functional sets, and `numero_hojas` for sheets. A request for two 80-wipe packs is quantity two with 80 per pack. The proposed shared field is a refinement of the initial craft-only idea to reuse piece count. A [Torre cardstock pack](https://www.torre.cl/catalogo/cartulina/) explicitly contains **18 sheets and 14 colors**, proving these counts cannot be conflated.

3. **Keep measurements dimensionally correct.** `peso_g` is mass, `volumen_ml` is volume, and `gramaje_g_m2` is mass per area. Preserve the supported 250 ml white-glue entry alongside weight-specific options. One liter converts exactly to 1000 ml; grams do not convert to milliliters without additional product data. For a paint set, specify whether volume is per jar or total. Do not interpret shipping dimensions as sheet or item dimensions.

4. **Separate independent properties.** Marker tip shape (round/chisel) and thickness class (fine/broad) need separate fields. Pencil shape, size and hardness are independent. Sharpener hole count should not share `tamano` with Jumbo. Geometry range, set-square angle and physical length differ. The proposed adhesive-family choices must be disjoint: generic “school glue” overlaps white glue and must not become a competing family option.

5. **Reuse cautiously when labels carry a narrower meaning.** `tipo_pauta` currently has the display label **Pauta musical**, a Cuadernos/Música binding and Media pauta value. Reusing it for white-board surface patterns needs an explicit label change to **Tipo de pauta**, separate category/type applicability and preserved existing values. An unrelated `pauta_superficie` definition is unnecessary if that generalization is accepted.

6. **Support minimums without narrowing them.** The [CSAC 2026 list](https://csac.cl/wp-content/uploads/2025/12/3%C2%B0-Basico-LISTA-DE-UTILES-2026.pdf) requires USB capacity of at least 16 GB, and [Pumahue](https://www.ddee.cl/upload_archivos/lista_utiles/upload/2026/PEN/Bilingue/8B/archivo.pdf) specifies a melodica with at least 32 keys. Current catalog filtering uses exact JSON containment; a `gte` object returns HTTP 400. For now, retain the minimum explicitly in the name/note. Future structured requirement operators must be separate from browse filters and preserve exact/any-of/minimum semantics across saving, copying, parent progress and PDFs. A finite 16/32 GB alternative list would still exclude an otherwise acceptable larger drive.

7. **Honor any-of requests.** Green-or-yellow highlighter means one requirement with acceptable alternatives and one total quantity, using the existing alternatives feature. It does not mean both colors are mandatory. “Any color,” a suggested palette, and a fixed list of permitted colors also have different meanings.

8. **Validate counts and units deliberately.** Counts should be positive integers; dimensions may be fractional. The current generic number validator only checks a positive finite number up to one million ([source](../src/catalog.rs#L193)); it does not enforce count-specific integer constraints. Separate `largo_cm` and proposed `largo_m` are practical with the current fixed-unit metadata, but should never conflict on one requirement. A future canonical measurement/unit display layer would make conversion and searching clearer.

## Confirmed catalog-quality issue

Live read-only API checks found `tipo_punta` values **Redonda** and **redonda** in scissors. They render as distinct facet values, and selecting either returns only one of the two matching items. Normalize equivalent catalog spellings after review, while preserving item identity and saved list/version snapshots. This is a demonstrated filtering problem, separate from the optional coverage additions.

The same audit found `incluye_goma` correctly enabled but unpopulated, and `tamano=Doble` used for sharpeners alongside `Jumbo` for pencils. The latter is a semantic cleanup candidate; a hole count should be explicitly evidenced before any curated item is updated.

## Recommended implementation order

1. **Correct vocabulary and add high-demand variants with existing fields:** normalize the scissor-tip case split; add HB/2B pencil options, the verified brush sizes, separate glue weights, counted sketchbooks and 22-note metalófono. A 16 GB USB variant is useful catalog coverage, but its school minimum requirement must keep minimum wording.
2. **Enable existing attributes for the right types:** highlighter/folder/cover colors, paper sheets/dimensions/finishes/color counts, paint and hygiene volumes, scissor length, melodica notes and board patterns. Expose these fields in custom-item forms even before catalog values exist; browse facets should still describe actual matching items.
3. **Introduce the shared new definitions:** margins, spiral binding, body/tip details, grammage, tape dimensions, package/sleeve counts, geometry angles, fingering and dictionary scope. Add only source-backed exact variants. Maintain all general requirements.
4. **Add structured acceptance operators separately:** minimum capacity/count and, when justified, ranges or approximate dimensions. This needs an API/UI/snapshot design and dedicated tests; simply adding more rows does not solve it.

Future migrations must preserve curated IDs, canonical keys, pending/rejected decisions, aliases, source links, lists and published snapshots. Applied migrations 003–007 must remain unchanged. Prepare additive migrations with definition type/unit checks, renamed/removed category handling, normalized-name collision guards and idempotence; back up local `escolar` before applying them.

Acceptance should test typed saving/reloading and filters by type; true/false/unspecified; fine+round together; one pack versus its contents; 18 sheets versus 14 colors; grams versus milliliters; paired dimensions; exact versus any-of versus minimum; and desktop/mobile drawer usability. Existing-list copies and PDF exports must retain each requirement’s intended flexibility.

## Qualified and deferred findings

- Basic calculator is a verified additional `tipo_calculadora` value; preserve the unrestricted generic calculator. An English-to-English dictionary is supported by indexed official evidence, with direct retrieval still unavailable.
- Soprano register, soap dispensers and double-scale protractors have evidence but lower immediate browsing value. Generic musical instruments need not inherit a particular size, material or brand.
- Portaminas, replacement leads and technical pens merit a separate item-family review; this report does not invent diameter/line-width variants.
- No universal piece count was established for base-ten blocks or geometric-body sets, nor mandatory USB connector/speed or calculator programming features.
- Existing kraft, crepé, volantín and Spanish cardstock need product-specific dimensions before adding them. “Pliego,” “oficio,” commercial notebook titles and block fractions must not be assigned universal measurements by guesswork.
- Health, certification, ecological and toxicity claims are not inferred from generic names. Washability remains an optional evidenced property with product/use conditions; it is not a safety guarantee.

## Sources and verification limits

All 43 references are primary school publications or manufacturer pages/catalogues. **33 were opened directly; ten relied on official indexed text** because the direct resource was rate-limited, unavailable or redirected. Indexed-only details are identified below and in the dataset; verify the exact product/requirement again before a future seed depends solely on them. Older manufacturer catalogues establish format distinctions, not current stock. The single 2025 school list is historical evidence, not a 2026 instruction.

- [The International School La Serena — quinto básico 2026](https://www.tisls.cl/portal/wp-content/uploads/2025/12/Lista05-2026.pdf) — PDF pages 1–2; Language Arts/Matemática, general supplies. Verification: opened.
- [Colegio Monteverde Chiloé — segundo básico 2026](https://www.monteverdechiloe.cl/documentos/lista-utiles-2-basico-2026.pdf) — PDF page 1; Cuadernos and Estuche. Verification: opened.
- [Torre — Cuaderno Triple Liso 7 mm 150 hojas](https://www.torre.cl/catalogo/cuaderno-triple-liso-7mm-150hjs/) — Product description; SKU 25303. Verification: opened.
- [Colegio Chuquicamata — séptimo básico 2026](https://colegiochuquicamata.cl/2019/wp-content/uploads/2025/12/Lista_Materiales_7_BASICO_2026.pdf) — PDF pages 2–3; general and visual-art supplies. Verification: opened.
- [Torre — lápices grafito official product family](https://www.torre.cl/product-category/mundo-escolar/arte-y-dibujo/lapices/lapices-grafito/) — Official manufacturer product titles. Verification: indexed_official.
- [Artel — catálogo 2022, marcadores](https://www.artel.cl/wp-content/uploads/2021/10/catalogo%20artel%202022.pdf) — Printed page 62; section 2.1 Marcadores. Verification: indexed_official_pdf.
- [Chamex — Sobre Chamex](https://chamex.com.br/es/sobre-chamex) — Nossos papéis; lines 86–102 in fetched page. Verification: opened.
- [Colegio Mayor Peñalolén — Play Group 2026](https://webpe.colegiomayor.cl/wp-content/uploads/2026/01/Lista-PLAY-GROUP-2026-1.pdf) — PDF pages 1–2; Papeles and Lápices. Verification: opened.
- [Torre — Bolsón Cartulina 18 hojas Imagia](https://www.torre.cl/catalogo/cartulina/) — Product description; SKU 17894. Verification: opened.
- [Colegio Leonardo Da Vinci de Las Condes — listas 2026](https://www.corplascondes.cl/descargas/educacion/ldv/2026-alumnos-lista-utiles.pdf) — PDF pages 1 and 3; Pre Kínder and Kínder. Verification: opened.
- [Colegio del Verbo Divino — séptimo básico 2026](https://www.cvd.cl/documents/38730/3264604/7B%2BLista_Utiles_Apo_2026.pdf/9590c514-e1a5-81d0-40d2-afbf12b23d09?t=1767881431529) — PDF pages 1–3; subject supply lists and Música. Verification: opened.
- [Torre — Carpeta tradicional 20 fundas oficio negra](https://www.torre.cl/catalogo/carpeta-con-fundas-tradicional-20-fundas-formato-oficio-negra/) — Product description; SKU 35288. Verification: opened.
- [STAEDTLER 512 07 double-hole tub sharpener](https://www.staedtler.com/us/en/products/pencils-and-accessories/sharpeners/staedtler-512-07-double-hole-tub-sharpener-51207sbka6/) — Product information, article51207SBKA6. Verification: indexed_official; direct open returned HTTP429.
- [STAEDTLER general catalogue 2022](https://www.staedtler.com/fileadmin/user_upload/Product/PDF/STAEDTLER-General-Catalogue-2022_GB.1645707372.pdf) — Printed pages114–115, sharpeners513001 and51260F. Verification: indexed_official_pdf.
- [CREP: Educación Parvularia NT2 2026](https://crep.cl/docs/listadeutiles/2026/Lista_de_utiles_NT2_2026.pdf) — Page 1, academic materials. Verification: directly fetched.
- [Colegio Chile: eighth grade 2026](https://www.colegiochile.cl/wp-content/uploads/2026/01/Utiles8Bas2026.pdf) — Page 1 technology and page 2 art. Verification: directly fetched.
- [Proarte: Croquera 22×32 cms](https://proarte.cl/producto/croquera/) — Product description, SKU 12926-7. Verification: directly fetched.
- [Artel/Maped: Tijera Zurdo Essential 13 cm](https://www.artel.cl/producto/blister-tijera-zurdo-essential-13cm/) — Product description, SKU 50320417. Verification: directly fetched.
- [Torre: Cinta Masking Color Crema 36 mm × 40 m](https://www.torre.cl/catalogo/cinta-masking-color-crema-36-mm-x-40-mt/) — Description, SKU 35032. Verification: directly fetched.
- [Torre: Cinta Tradicional Cristal 18 mm × 30 m](https://www.torre.cl/catalogo/cinta-tradicional-cristal-set-8-unid-18-mm-x-30-mt/) — Description, SKU 35045. Verification: directly fetched.
- [Artel: Palitos de helado colores, bolsa 50 unidades](https://www.artel.cl/producto/palitos-de-helado-colores-bolsa-50-unidades/) — Product description, SKU 20110015. Verification: directly fetched.
- [Torre: Pompones Brillantes](https://www.torre.cl/catalogo/pompones-brillantes/) — Product description, SKU 28138. Verification: official indexed product text.
- [Artel: Catálogo 2025](https://www.artel.cl/wp-content/uploads/2024/11/Catalogo_Artel_2025.pdf) — Printed pages 60 and 176. Verification: official indexed PDF text; direct URL currently redirects to homepage.
- [Colegio San Isidro: second grade 2026](https://www.colegiosanisidro.cl/wp-content/uploads/2025/12/Lista-de-utiles-2%C2%B0Basico-2026.pdf) — Art box and pencil-case requirements. Verification: official indexed PDF text; direct fetch cache miss.
- [Colegio Bicentenario N°1 de Ñuñoa: eighth grade 2026](https://particularuno.cl/wp-content/uploads/2022/02/8%C2%B0-BASICO-2026.pdf) — Materials table. Verification: official indexed PDF text; direct fetch cache miss.
- [Colegio Santo Domingo de Guzmán: school lists 2026](https://santodomingovalparaiso.cl/wp-content/uploads/2025/12/LISTA-DE-UTILES-2026.pdf) — Pages 7 and 11, art materials. Verification: directly fetched.
- [Torre: Cola Fría 225 Gr](https://www.torre.cl/catalogo/cola-fria-225-gr/) — Description, SKU26195, lines1097–1100. Verification: directly fetched.
- [STAEDTLER Noris960 glue stick20g](https://www.staedtler.com/intl/en/products/products-for-colouring/crafting-accessories/glue-sticks/noris-960-glue-stick-96020pca12/) — Product heading and information, article96020PCA12. Verification: official indexed product text; direct fetch returnedHTTP429.
- [FILA: DAS modeling clay](https://www.fila.it/int/en/product/das/) — Product description, format, lines43–49. Verification: directly fetched.
- [Lista de útiles 6° básico 2026 — cpfd.cl](https://www.cpfd.cl/utiles2026/LISTA%20DE%20UTILES%206%20BASICO%202026.pdf) — Page 1, Matemáticas. Verification: opened.
- [Lista de útiles 6° básico 2026 — BRS](https://brs.cl/wp-content/uploads/2025/11/6%C2%B0-Basico-2026-Lista-de-Utiles.docx.pdf) — Page 1, Artes y Música; page 2, Matemática. Verification: opened.
- [Yamaha: Baroque style and German style recorders](https://www.yamaha.com/en/musical_instrument_guide/recorder/selection/selection002.html) — Differences between Baroque style and German style. Verification: opened.
- [Escuela de Lenguaje Pirque: Kínder materials 2026](https://escueladelenguajepirque.cl/lista-de-materiales-kinder-2026/) — Útiles de aseo. Verification: opened.
- [Colegio Alemán: Kínder supplies 2025](https://www.caleman.cl/listas/2025/Lista%20de%20utiles%20escolares%20-%20Kinder%202025.pdf) — Page 2, Útiles de aseo. Verification: opened.
- [Kinderland: Medio Menor materials 2026](https://kinderland.cl/wp-content/uploads/2025/10/LISTA-DE-MATERIALES-M.Menor-2026.pdf) — Page 1, first materials rows. Verification: opened.
- [Liceo Santa Clara: 5°–8° básico supplies 2026](https://lsantaclara.cl/web/content/6947?download=true&unique=7da92104e49ee32ed896e76a7c7ba90cd8a9bdcc) — Page 2, Educación Física. Verification: opened.
- [Instituto La Salle: fourth grade supplies 2026](https://www.institutolasalle.cl/PDFs/2026/lista_de_utiles_4_2026.pdf) — Page 2, Música. Verification: opened.
- [CPV Peñalolén: second grade supplies 2026](https://cpvpenalolen.cl/wp-content/uploads/2025/12/2%C2%B0-basico-2026.docx.pdf) — Page 1, Música. Verification: opened.
- [CSAC: third grade supplies 2026](https://csac.cl/wp-content/uploads/2025/12/3%C2%B0-Basico-LISTA-DE-UTILES-2026.pdf) — Page 1, Tecnología. Verification: opened.
- [St Monica: fourth grade supplies 2026](https://stmonica.cl/wp-content/uploads/2026/01/Lista-de-utiles-cuartos-basicos-ok-1.docx-2.pdf) — Page 1, Lenguaje y Comunicación. Verification: opened.
- [Colegio Pumahue Temuco: Kínder Bilingüe supplies 2026](https://www.ddee.cl/upload_archivos/lista_utiles/upload/2026/TEM/Bilingue/K/archivo.pdf) — Page 2, first materials row. Verification: opened.
- [Colegio Pumahue Peñalolén: eighth grade supplies 2026](https://www.ddee.cl/upload_archivos/lista_utiles/upload/2026/PEN/Bilingue/8B/archivo.pdf) — Page 3, Artes Musicales continuation. Verification: opened.
- [Colegio Pumahue Temuco: fifth grade Bilingüe supplies 2026](https://www.ddee.cl/upload_archivos/lista_utiles/upload/2026/TEM/Bilingue/5B/archivo.pdf) — Inglés (official indexed PDF text; direct fetch cache miss). Verification: official indexed text; direct fetch returned cache miss on two attempts.

## Audit evidence and validation

This research used read-only PostgreSQL queries and read-only local API probes. No migrations, catalog writes, user-list writes or application-code changes were made. A second read-only snapshot at **12:14−03** exactly matches the initial catalog, definitions, bindings and category records; the catalog remains at **183 items and 397 attribute values**.

Local evidence: `.local/qa/attribute-research/catalog-baseline.json`, `coverage.json`, `api-probes.json` and the three domain-research JSON files. The tracked dataset retains category/type coverage, all source references, individual findings and deferred topics. Its schema/reference checks validate unique finding/source IDs, category coverage, proposed-key existence, data types and units against the live baseline. Independent review also checked the classifications and measurement semantics; its findings were resolved by normalizing all category records and adding explicit category/type/value pairings for multi-family evidence. The dataset is marked `ready_for_automatic_seeding=false` because future additions still require exact row-level curation. Application builds and functional tests were not rerun because this change consists of research documentation only.
