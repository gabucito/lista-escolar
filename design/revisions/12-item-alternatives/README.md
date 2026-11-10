# Útiles con alternativas

Abre [la galería](index.html) para revisar el flujo implementado en escritorio y
móvil, la vista de la familia y un ejemplo de PDF.

Una fila representa una necesidad: cualquiera de sus opciones sirve para
completar la cantidad total de esa fila. Cada necesidad tiene una sola casilla.
Cuando se necesita cada artículo, se mantienen filas separadas. Las opciones
pueden proceder del catálogo o escribirse de forma general, dejando libres las
características que no se hayan indicado.

Las capturas proceden de la aplicación local Angular/Rust, con cuentas y datos
sintéticos en una base PostgreSQL desechable. El ejemplo de PDF representa una
necesidad de cuaderno universitario, con dos opciones y el número de hojas a
elección de la familia. No contiene datos de la base real `escolar`.

La galería incluye revisión en escritorio de 1366 px, selección y revisión móvil
de 320 px, y la necesidad publicada desde móvil de 390 px. Las capturas de la
necesidad son recortes del elemento real realizados por Playwright, conservados
sin editar. La imagen del PDF es un render de su primera página.

Los archivos se copiaron después de finalizar las pruebas de navegador.
[El manifiesto](manifest.json) registra las rutas relativas de origen, tamaños,
dimensiones y SHA-256 para comprobar su procedencia. Consulta también el
[registro de validación](../../../docs/VALIDATION.md).

La validación de alternativas completó ocho escenarios de navegador, quince
capturas Axe A/AA sin infracciones y cuatro PDF que suman once páginas sin
texto fuera de sus límites. Los grupos largos mantienen una casilla por
necesidad, incluso cuando continúan en otra página.
