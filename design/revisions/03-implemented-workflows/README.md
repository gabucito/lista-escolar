# Comparación de referencias e implementación

Fecha: **10 de noviembre de 2026**. Abrir [index.html](index.html) directamente en un navegador; no requiere servidor, dependencias ni JavaScript.

La galería empareja las **19 referencias aprobadas** de [la revisión 02](../02-functional-workflows/index.html) con copias PNG sin modificación de la aplicación ejecutada en el entorno local de QA. Incluye escritorio y móvil, estados de formulario y capturas adicionales desplegables. Todos los nombres, cuentas y listas visibles pertenecen a datos sintéticos de prueba.

Las referencias corregidas usan sus archivos `-v2` en los flujos 03, 04, 07, 08, 12 y 16. Los PNG de referencias se enlazan desde la revisión anterior; las capturas reales quedan conservadas en `captures/`. [manifest.json](manifest.json) registra origen, fecha de modificación del archivo fuente, dimensiones y SHA-256 de cada copia. Las copias no se actualizan automáticamente al repetir QA.

Verificación de esta galería: 19 comparaciones, 53 capturas reales, 260 enlaces locales válidos y hashes de las copias coincidentes. Chromium a 1440, 390 y 320 px carga las 72 imágenes sin desbordamiento horizontal ni infracciones de las reglas WCAG 2 A/AA y 2.1 AA comprobadas por AXE.

## Cómo leer las diferencias

- Los mockups expresan la organización del trabajo; los datos, números de resultados, nombres y opciones reales dependen del escenario y de sus permisos.
- Los diálogos, filtros desplegables y vistas móviles aparecen como capturas separadas. Algunas capturas de viewport muestran una pantalla desplazada para enfocar el formulario activo; el enlace abre exactamente ese PNG, sin recorte añadido por la galería.
- El registro muestra errores de validación provocados de forma deliberada. El flujo de cuenta muestra la revisión previa a la eliminación; la solicitud de acceso muestra su confirmación y no una concesión de acceso.
- En administración, los productos se comparan después de seleccionar el origen, las notas de las plantillas se despliegan por fila y los reportes solo muestran evidencia del caso. La captura de cuentas administrativas muestra creación; no incluye el estado de ingreso de la referencia.
- La comparación visual documenta esta implementación local. No equivale por sí sola a validación de despliegue, correo externo o comportamiento físico de impresión.

## Inventario

| Flujo | Referencia aprobada | Capturas reales |
| --- | --- | --- |
| 01 · Editor de listas · escritorio | [01-editor-escritorio.png](../02-functional-workflows/01-editor-escritorio.png) | 2 |
| 02 · Editor de listas · móvil | [02-editor-movil.png](../02-functional-workflows/02-editor-movil.png) | 2 |
| 03 · Datos del curso y útil personalizado | [03-datos-y-util-personalizado-v2.png](../02-functional-workflows/03-datos-y-util-personalizado-v2.png) | 3 |
| 04 · Importar una planilla | [04-importar-planilla-v2.png](../02-functional-workflows/04-importar-planilla-v2.png) | 1 |
| 05 · Buscar listas | [05-buscar-listas.png](../02-functional-workflows/05-buscar-listas.png) | 3 |
| 06 · Mis listas | [06-mis-listas.png](../02-functional-workflows/06-mis-listas.png) | 2 |
| 07 · Acceso y registro | [07-acceso-v2.png](../02-functional-workflows/07-acceso-v2.png) | 4 |
| 08 · Lista publicada | [08-lista-publicada-v2.png](../02-functional-workflows/08-lista-publicada-v2.png) | 4 |
| 09 · Preparar el PDF | [09-pdf.png](../02-functional-workflows/09-pdf.png) | 4 |
| 10 · Compartir y colaborar | [10-compartir.png](../02-functional-workflows/10-compartir.png) | 6 |
| 11 · Mi cuenta | [11-cuenta.png](../02-functional-workflows/11-cuenta.png) | 2 |
| 12 · Administración · catálogo | [12-admin-catalogo-v2.png](../02-functional-workflows/12-admin-catalogo-v2.png) | 3 |
| 13 · Administración · categorías | [13-admin-categorias.png](../02-functional-workflows/13-admin-categorias.png) | 2 |
| 14 · Administración · productos | [14-admin-productos.png](../02-functional-workflows/14-admin-productos.png) | 3 |
| 15 · Administración · reportes | [15-admin-reportes.png](../02-functional-workflows/15-admin-reportes.png) | 2 |
| 16 · Administración · plantillas | [16-admin-plantillas-v2.png](../02-functional-workflows/16-admin-plantillas-v2.png) | 2 |
| 17 · Administración · colegios | [17-admin-colegios.png](../02-functional-workflows/17-admin-colegios.png) | 2 |
| 18 · Administración · cuentas | [18-admin-cuentas.png](../02-functional-workflows/18-admin-cuentas.png) | 2 |
| 19 · Invitaciones y solicitudes de acceso | [19-invitaciones.png](../02-functional-workflows/19-invitaciones.png) | 4 |
