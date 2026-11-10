# Lista Escolar · frontend local

Aplicación Angular 22 en español, conectada a la API Rust real. Requiere Node 24 (o una versión compatible con Angular 22), npm y el backend local en `127.0.0.1:3000`.

```sh
npm ci
npm start
```

Abre `http://127.0.0.1:4200`. El servidor de desarrollo redirige `/api` al backend mediante `proxy.conf.json`, conservando las cookies de sesión en el mismo origen. Las cuentas normales y administrativas tienen sesiones independientes. La configuración y creación del administrador inicial están en las instrucciones del repositorio principal.

```sh
npm run build
npm test -- --watch=false
```

La compilación queda en `dist/lista-escolar/browser`. Los PDF se generan en el navegador con pdfmake, cargado solo al exportar, después de volver a consultar el contenido autorizado y sus logos. Incluyen tres diseños, Carta/A4, color/blanco y negro, cantidades exactas y casillas vacías para marcar en papel. El avance personal permanece separado de la lista publicada.

El manifiesto y service worker de producción permiten instalar la aplicación y mostrar una página informativa sin conexión. Solo se guardan el icono y la página estática sin conexión: las listas, logos privados, respuestas de API y PDF no se almacenan en caché. El desarrollo con `ng serve` no registra el service worker.

Las invitaciones se comparten mediante enlaces locales. El envío de correos, el acceso mediante Google y el despliegue quedan pendientes de una etapa posterior. Los datos persisten exclusivamente mediante la API y PostgreSQL.
