# Lista Escolar

Aplicación local para preparar, compartir y usar listas de útiles escolares.
Backend Rust/Axum, frontend Angular y PostgreSQL. La interfaz está en español.

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
