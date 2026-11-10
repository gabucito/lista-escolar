# Lista Escolar

Aplicación local para preparar, compartir y usar listas de útiles escolares.
Backend Rust/Axum, frontend Angular y PostgreSQL. La interfaz está en español.

[Comparar los diseños con la aplicación implementada](design/revisions/03-implemented-workflows/index.html)
· [Catálogo con filtros](design/revisions/04-catalog-browsing/index.html)
· [Opción C: categorías y atributos](design/revisions/06-categories-and-attributes/index.html)
· [Opción C implementada](design/revisions/07-implemented-categories-attributes/index.html)
· [Categorías y filtros en el mismo panel](design/revisions/08-shared-catalog-sidenav/index.html)
· [Tres propuestas visuales](design/revisions/09-sidenav-design-exploration/index.html)
· [B en escritorio y alternativas móviles](design/revisions/10-desktop-b-mobile/index.html)
· [B y M1 implementados](design/revisions/11-implemented-responsive-comparison/index.html)
· [Validación y pruebas](docs/VALIDATION.md).

## Desarrollo local

Requisitos: Rust, Node.js 24, npm y PostgreSQL en ejecución. El lanzador local
utiliza Bash, Python 3, `curl` y `setsid` (util-linux). Si usas nvm,
ejecuta `nvm use` en este directorio. La base `escolar` ya puede contener los
esquemas de catálogo; las migraciones de aplicación los conservan.

Guarda la conexión en `.local/pgpass`, con permisos `600`, siguiendo la
[guía de base de datos](db/README.md). El backend también acepta `DATABASE_URL`
como variable de entorno para bases de prueba. No pongas contraseñas en Git.

```bash
npm --prefix frontend ci
cargo build
bash scripts/start-local.sh
```

Abre **http://127.0.0.1:4200**. El frontend utiliza `/api` mediante un proxy al
backend en **http://127.0.0.1:3000**. El script comprueba que el backend responda
y guarda su registro en `.local/backend.log`. Ctrl+C detiene ambos procesos.
Los puertos 3000 y 4200 deben estar disponibles; el lanzador fija el backend
en `127.0.0.1:3000`, aunque exista otro valor de `LISTA_BIND` en el entorno.

También se pueden ejecutar por separado:

```bash
cargo run -- serve
# En otra terminal:
npm --prefix frontend start
```

Las migraciones se aplican al iniciar. Para ejecutarlas sin abrir el servidor:

```bash
cargo run -- migrate
```

## Buscar y agregar útiles

Abre una lista en el editor: el panel izquierdo muestra primero las
**Categorías**. Al elegir una, el mismo panel muestra sus características y
coincidencias, junto a las filas del catálogo y tu lista. Las columnas comparan
las características de esa categoría; en teléfonos, cada fila muestra sus
valores con etiquetas. **Catálogo** y
**Volver a categorías** regresan al selector sin perder los filtros; elegir otra
categoría cambia sus características. No hay un segundo nivel de subcategorías.

Por ejemplo, elige **Cuadernos** y combina **Tipo de cuaderno: Cuadriculado,
Formato: Universitario, 100 hojas y 7 mm**. También puedes escribir `cuaderno univ 100 7mm` en la
búsqueda. Los filtros seleccionados se pueden quitar individualmente o limpiar
todos; **Ver más útiles** carga la siguiente página sin perder lo ya mostrado.
En el teléfono, primero pulsa **Agregar útiles**, elige la categoría y sus
características, y después **Ver útiles** para agregar los resultados.

Puedes cerrar el panel sin perder los filtros. Al cambiar de tipo se conservan
las características compatibles: pasar de Cuadriculado a Rayado retira el filtro
de cuadrícula, manteniendo formato y hojas. En Geometría, Regla permite filtrar
por largo. Los administradores gestionan tipos y características desde
**Categorías**; los útiles personalizados usan esas mismas definiciones.

La migración 004 incorpora 24 variantes genéricas de cuadernos con formato,
número de hojas y cuadrícula u orientación cuando corresponde. No representan
existencias de una tienda. Se conservan los útiles y las listas existentes;
las características sin datos todavía no aparecen como filtros.

La migración 005 convierte las clasificaciones existentes en atributos de tipo
y mantiene las identidades de útiles, los vínculos y las versiones publicadas.
El importador requiere esta migración y conserva sus claves anteriores.

La migración 006 incorpora 132 útiles adicionales y cinco categorías nuevas a partir
de listas escolares chilenas de 2026. Está validada en una base desechable y
aplicada a `escolar`: 176 útiles en 14 categorías. Consulta la
[investigación, fuentes y criterios de conservación](docs/CATALOG_RESEARCH_2026-11-10.md).

## Cuentas y administración

Regístrate desde la interfaz para crear una cuenta normal. En este entorno local
las cuentas se habilitan sin enviar correos. Las contraseñas se guardan como
hashes Argon2; las sesiones normales y administrativas son independientes.

La primera cuenta administrativa se crea desde una terminal. La contraseña se
solicita sin mostrarla ni incorporarla a los argumentos del proceso:

```bash
cargo run -- create-admin administrador
```

El portal administrativo permite gestionar catálogo, taxonomía, coincidencias
con productos de origen, reportes, plantillas y asociaciones de colegios. Los
administradores solo ven contenido privado adjunto a un reporte abierto.

La recuperación local se realiza desde la terminal:

```bash
cargo run -- reset-password usuario@example.cl
cargo run -- reset-admin administrador
```

Un cambio de contraseña invalida las sesiones de esa cuenta. No hay usuarios ni
contraseñas predefinidos. La entrega de correo, Google OAuth/Gmail y el despliegue
público se dejan para una fase posterior. El servidor limita su dirección de
escucha a loopback para mantener explícito este alcance local.

## Compilar la interfaz para servirla desde Rust

```bash
npm --prefix frontend run build
cargo run -- serve
```

Abre **http://127.0.0.1:3000**. Rust sirve el directorio compilado y el API en el
mismo origen. La instalación PWA usa únicamente la interfaz estática; las listas,
los logos, los PDFs y el progreso personal no se guardan en la caché offline.

## Validación

```bash
cargo test --offline
python3 -m unittest discover -s tests -v
npm --prefix frontend run build
```

La validación integrada y visual se documenta en [VALIDATION.md](docs/VALIDATION.md).
Los tests de integración utilizan PostgreSQL desechable en `/tmp`; no deben
ejecutarse contra `escolar`. El catálogo de origen se importa por separado, nunca
como efecto de iniciar la aplicación.

Para ejecutar la batería completa (incluye Chromium y PostgreSQL desechable),
necesitas también `rg` y los binarios de servidor PostgreSQL (`initdb`, `pg_ctl`).
La primera compilación descarga dependencias Rust; las pruebas siguientes usan
la caché local con `--offline`:

```bash
npm --prefix qa ci
cargo fetch
cd qa && npx playwright install chromium && cd ..
bash scripts/test-local.sh
```

El script detiene su servidor y elimina la base de prueba al terminar. Las
capturas, PDF, análisis de accesibilidad y reportes quedan en `.local/qa/`.
Para una revisión manual aislada, ejecuta `python3 tests/api_integration.py --serve`;
su dirección y cuentas de prueba se guardan en `.local/qa/environment.json`.
No reconstruyas el frontend mientras una prueba de navegador esté ejecutándose.

Las sugerencias locales de comuna y región provienen de la
[tabla pública de la CMF](https://www.cmfchile.cl/institucional/seil/certificacion_comunas.php),
con fecha de consulta 2026-11-10. Se omiten sus tres zonas de reporte de Santiago;
los nombres son ayudas de entrada y no reemplazan un directorio de colegios.

Los requisitos y contratos están en [SPECIFICATION.md](docs/SPECIFICATION.md)
y [API.md](docs/API.md).
