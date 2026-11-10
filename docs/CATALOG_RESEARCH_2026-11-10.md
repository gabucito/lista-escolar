# Ampliación investigada del catálogo — 10 de noviembre de 2026

Se revisaron 15 fuentes primarias de listas de útiles escolares chilenas para
2026, publicadas por los propios colegios. La selección cubre educación
parvularia, básica y media e incorpora **132 útiles genéricos adicionales**.
El catálogo de referencia pasa de **44 a 176 útiles** y de **9 a 14 categorías**.

**Estado: aplicado a `escolar` el 2026-11-10 a las 10:21−03 y verificado: 176 útiles,
14 categorías y 381 valores de atributos.**
Los totales corresponden al catálogo de referencia sin modificaciones. Una base
con categorías retiradas o útiles ya incorporados puede recibir menos altas.

Los datos, atributos, alias y referencias por útil están en
[`catalog-expansion-2026-11-10.json`](catalog-expansion-2026-11-10.json).
La implementación está en [`006_catalog_expansion.sql`](../db/006_catalog_expansion.sql),
con una copia del conjunto de datos y su huella SHA-256 comprobadas por pruebas.

## Cobertura

| Categoría | Útiles adicionales | Categoría nueva |
| --- | ---: | :---: |
| Cuadernos | 7 | |
| Escritura | 17 | |
| Arte y dibujo | 25 | |
| Geometría | 3 | |
| Papeles y cartulinas | 18 | |
| Pegado y corte | 11 | |
| Organización | 12 | |
| Aseo | 7 | |
| Otros | 0 | |
| Manualidades | 11 | Sí |
| Material didáctico | 5 | Sí |
| Música | 9 | Sí |
| Tecnología | 3 | Sí |
| Lectura y consulta | 4 | Sí |
| **Total** | **132** | **5 nuevas** |

**Papeles y cartulinas**, que estaba vacía, recibe papel carta y oficio,
papel lustre, kraft, crepé y volantín, cartulinas, cartón forrado, goma EVA y
láminas adhesivas o para termolaminar. Los acabados y tamaños se incluyen cuando
están respaldados por las fuentes; no se completan características por intuición.

Para parvularia se incorporan materiales de manualidades, instrumentos sencillos
y útiles como pompones, limpiapipas, palitos de helado y maracas. En básica se
amplían escritura, organización y material didáctico, con tangram, bloques de
base diez y dinero didáctico chileno. La cobertura de niveles superiores incluye
calculadora científica, diccionarios, tabla periódica y atlas. Estas agrupaciones
describen la investigación: no restringen cada útil a un nivel educativo.

## Criterios de datos y navegación

Los útiles son independientes de marcas y tiendas. Se conservaron diferencias
funcionales respaldadas por las listas, sin generar combinaciones artificiales
de tamaños o colores. Las cantidades que distinguen un producto, como hojas,
colores o piezas, son atributos; no indican cuántas unidades debe comprar una
familia. No se incorporaron uniformes ni textos específicos de un colegio.
El catálogo no representa existencias, precios ni disponibilidad comercial.

Cada categoría tiene tipos y características en el mismo panel de navegación.
**No se restauran subcategorías.** Los valores conservan su tipo: números para
hojas, dimensiones, volumen o capacidad; booleanos para autoadhesivo o depósito;
y texto para formato, material o pauta. Las unidades se declaran en la definición
del atributo. Las características se vinculan a los tipos a los que corresponden,
para que los filtros de una categoría resulten pertinentes al útil buscado.

La migración conserva las identidades, estados, nombres, atributos y alias de
los útiles existentes, incluso ante coincidencias con registros pendientes o
rechazados. También respeta categorías renombradas o retiradas, tipos personalizados
y características sin restricción de tipo. Añade opciones necesarias sin sustituir
las opciones existentes. Una definición incompatible de tipo o unidad aborta la
transacción. Las listas, versiones publicadas y vínculos de origen quedan intactos.

## Validación

Las cinco pruebas de [`test_catalog_expansion.py`](../tests/test_catalog_expansion.py)
pasaron en PostgreSQL desechable. Cubren la correspondencia entre JSON y SQL,
atributos tipados y referencias; la ampliación de 44 a 176 útiles y su repetición
sin cambios; la conservación de identidades y nombres ya curados; el respeto a
una categoría existente eliminada; y el rechazo transaccional de una definición
incompatible. También comprueban que las listas y versiones previas no cambien.

La aplicación real se hizo con el comando normal de migraciones Rust y después
de guardar una copia de seguridad en
`.local/backups/escolar-before-catalog-expansion-20261110T131339Z.dump`.
Se verificaron su formato y tabla de contenido; no se ensayó una restauración.
La comprobación posterior confirmó los 132 nombres, atributos y alias nuevos,
la conservación exacta de los 44 útiles originales, y cero infracciones de
integridad en catálogo, listas y claves foráneas. Los vínculos de origen,
plantillas, versiones y clasificaciones heredadas conservaron sus huellas.
Un borrador se editó durante la revisión, a las 10:15:56−03, antes de la migración;
esa edición se conservó y no se afirma igualdad de borradores entre ambas capturas.

Pasaron 17 pruebas Rust, 29 Python/PostgreSQL, 46 Angular, 31 grupos API
(549 peticiones) y 96 escenarios de navegador distintos. Los cinco casos nuevos
cubren las categorías añadidas, alias, atributos numéricos/booleanos y pantallas
de 390 y 320 px. Sus 11 capturas Axe no registran infracciones.
Los resultados completos y los defectos abiertos de la revisión están en
[`CODEBASE_DATABASE_REVIEW_2026-11-10.md`](CODEBASE_DATABASE_REVIEW_2026-11-10.md).

```bash
python3 -m unittest discover -s tests -p 'test_catalog_expansion.py' -v
```

## Fuentes primarias

Cada útil del JSON identifica sus fuentes mediante `sources`. Las listas respaldan
la presencia de los útiles; las necesidades concretas de cada curso deben seguir
consultándose en la lista del colegio correspondiente.

- [Colegio Maipo — Kínder a 8° básico 2026](https://basica.csmaipo.cl/wp-content/uploads/2026/01/LISTAS_merged.pdf)
- [Colegio Santo Domingo de Guzmán — listas 2026](https://santodomingovalparaiso.cl/wp-content/uploads/2025/12/LISTA-DE-UTILES-2026.pdf)
- [Colegio Bajo Molle — 3° básico 2026](https://www.colegiobajomolle.cl/wp-content/uploads/LISTA-U%CC%81TILES-2026-CBM-3ero-Ba%CC%81sico.pdf)
- [Instituto Pascal — 2° medio 2026](https://www.institutopascal.cl/2026/listaUtiles/221)
- [Colegio Amancay Limache — 8° básico 2026](https://www.amancaylimache.cl/data/documents/LISTA-UiTILES-ESCOLARES-8deg-BAiSICO-2026.pdf)
- [Colegio CEDA — 1° básico 2026](https://www.colegioceda.cl/_files/ugd/189673_151439ee1765445486af4f1230164373.pdf)
- [Sunnyland School — 1° básico 2026](https://sunnylandschool.cl/wp-content/uploads/2025/12/LISTA-DE-UTILES-PRIMERO-BASICO-2026.pdf)
- [Colegio Americano — útiles por nivel 2026](https://sites.google.com/colegioamericano.cl/colegioamericano/lista-de-%C3%BAtiles-a%C3%B1o-2026)
- [Colegio Camilo Henríquez — prekínder 2026](https://www.hfcamilohenriquez.cl/assets/img/apoderados/lista_de_utiles/2026/Prek%C3%ADnder.pdf)
- [Instituto Pascal — 2° básico 2026](https://www.institutopascal.cl/2026/listaUtiles/121)
- [Saint Thomas College — 5° básico 2026](https://saintthomas.cl/documentos/Lista-utiles-2026/Lista%20de%20%C3%9Atiles%205to%20B%C3%A1sico-2026.pdf)
- [Saint Peters School — 5° básico 2026](https://stpeters.cl/wp-content/uploads/2026/01/2026_lista_utiles_5to_basico_V2.pdf)
- [Mozart Schule Concepción — kínder 2026](https://mozartschuleconcepcion.cl/wp-content/uploads/2026/01/LISTADO-DE-UTILES-KINDER-2026.pdf)
- [Colegio Raíces Altazor — kínder 2026](https://colegioraicesaltazor.cl/wp-content/uploads/2026/01/lista-de-utiles-nt2-kinder-2026.pdf)
- [Colegio Filipense — 1° básico 2026](https://www.colegiofilipense.cl/wp-content/uploads/2026/01/1%C2%B0-Basico-Utiles-Escolares-2026.pdf)
