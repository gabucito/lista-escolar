# Propuestas funcionales de UI/UX

Generadas el 2026-11-10 con la herramienta integrada de generación de imágenes
(modo built-in, caso de uso `ui-mockup`). Este conjunto responde a la dificultad
real de agregar útiles: el catálogo actual ocupa una columna de 310 px y deja
pocos resultados visibles, especialmente en pantallas de poca altura.

[Abre la galería](index.html). Cada imagen tiene su prompt exacto al lado.
[Compara estas propuestas con capturas de la implementación](../03-implemented-workflows/index.html).
Las imágenes son propuestas de diseño para implementar, no capturas de nuevas
funcionalidades ya desplegadas. Los datos y las personas representadas son ejemplos.

## Dirección principal

- El catálogo y la lista comparten el área principal de trabajo en escritorio.
  Los datos del colegio quedan en un resumen breve que abre un formulario.
- En móvil, **Agregar útiles** abre un selector de pantalla completa. Buscar,
  filtrar y agregar mantienen el foco y la posición de la lista de resultados.
- Cada útil se agrega mediante una acción explícita y ofrece confirmación y
  deshacer. Los requisitos repetidos siguen siendo filas independientes;
  agregar no combina cantidades ni elimina notas silenciosamente.
- Importación, datos del curso, creación personalizada y PDF tienen espacios
  propios. Ninguno reduce permanentemente la altura disponible del catálogo.
- Las páginas de administración utilizan una cola o búsqueda junto al detalle;
  los formularios móviles deben apilarse sin comprimir campos en tablas estrechas.

## Imágenes y prompts

| Imagen | Enfoque | Prompt |
| --- | --- | --- |
| [Editor de listas · escritorio](01-editor-escritorio.png) | Catálogo amplio y lista editada visibles al mismo tiempo. | [Texto completo](01-editor-escritorio.prompt.txt) |
| [Editor de listas · móvil](02-editor-movil.png) | Selector de útiles a pantalla completa y retorno claro a la lista. | [Texto completo](02-editor-movil.prompt.txt) |
| [Datos de la lista y útil personalizado](03-datos-y-util-personalizado-v2.png) | Formularios enfocados fuera del espacio principal del catálogo. | [Inicial](03-datos-y-util-personalizado.prompt.txt) · [Corrección](03-datos-y-util-personalizado.revision.prompt.txt) |
| [Importar y revisar planilla](04-importar-planilla-v2.png) | Revisión por filas, errores concretos, columnas y paginación. | [Inicial](04-importar-planilla.prompt.txt) · [Corrección](04-importar-planilla.revision.prompt.txt) |
| [Buscar listas](05-buscar-listas.png) | Filtros y resultados visibles desde el primer tramo de la página. | [Texto completo](05-buscar-listas.prompt.txt) |
| [Mis listas](06-mis-listas.png) | Acceso directo a borradores, listas compartidas y plantillas. | [Texto completo](06-mis-listas.prompt.txt) |
| [Ingresar y crear cuenta](07-acceso-v2.png) | Formularios breves, validación junto al campo y acción clara. | [Inicial](07-acceso.prompt.txt) · [Corrección](07-acceso.revision.prompt.txt) |
| [Lista publicada](08-lista-publicada-v2.png) | Checklist, comentarios y reporte organizados por tarea. | [Inicial](08-lista-publicada.prompt.txt) · [Corrección](08-lista-publicada.revision.prompt.txt) |
| [Configurar y descargar PDF](09-pdf.png) | Vista previa grande con opciones compactas junto al documento. | [Texto completo](09-pdf.prompt.txt) |
| [Compartir y administrar acceso](10-compartir.png) | Visibilidad, invitaciones y colaboradores con acciones diferenciadas. | [Texto completo](10-compartir.prompt.txt) |
| [Aceptar invitación y solicitar acceso](19-invitaciones.png) | Contexto de la lista, cuenta destinataria y permiso antes de confirmar. | [Texto completo](19-invitaciones.prompt.txt) |
| [Cuenta y preferencias](11-cuenta.png) | Perfil e impresión separados de la revisión de eliminación. | [Texto completo](11-cuenta.prompt.txt) |
| [Administración · catálogo](12-admin-catalogo-v2.png) | Resultados y revisión del útil en el mismo espacio de trabajo. | [Inicial](12-admin-catalogo.prompt.txt) · [Corrección](12-admin-catalogo.revision.prompt.txt) |
| [Administración · categorías](13-admin-categorias.png) | Árbol de categorías junto al formulario de edición. | [Texto completo](13-admin-categorias.prompt.txt) |
| [Administración · productos y vínculos](14-admin-productos.png) | Comparación de características antes de aprobar un equivalente. | [Texto completo](14-admin-productos.prompt.txt) |
| [Administración · reportes](15-admin-reportes.png) | Evidencia del caso y decisión visibles con límites claros. | [Texto completo](15-admin-reportes.prompt.txt) |
| [Administración · plantillas](16-admin-plantillas-v2.png) | Edición compacta de útiles, cantidades e instrucciones. | [Inicial](16-admin-plantillas.prompt.txt) · [Corrección](16-admin-plantillas.revision.prompt.txt) |
| [Administración · colegios](17-admin-colegios.png) | Nombre canónico, alternativa y localidad agrupados. | [Texto completo](17-admin-colegios.prompt.txt) |
| [Administración · acceso y cuentas](18-admin-cuentas.png) | Ingreso administrativo separado y creación de administrador. | [Texto completo](18-admin-cuentas.prompt.txt) |

## Criterios para la implementación

1. Comprobar el editor en 1366×768, 1440×900, 390×844 y 320×800. El catálogo
   debe aprovechar la altura disponible, con búsqueda y filtros accesibles;
   no debe convertirse de nuevo en un recuadro bajo una larga sección de datos.
2. Después de agregar un útil, conservar búsqueda, filtros, posición y foco.
   El contador y la lista deben actualizarse de inmediato; comunicar errores
   de guardado sin perder las selecciones del usuario.
3. Mostrar el nombre y las características necesarias para distinguir los
   útiles. Los pequeños dibujos del mockup son ilustrativos; el uso del catálogo
   no depende de disponer de fotografías de productos.
4. Tratar nombres, notas y etiquetas largas con envoltura de texto. Mantener
   controles de cantidad/unidad claros y permitir operar sin arrastrar.
5. Mantener las etiquetas de los campos, los estados de carga/error/vacío,
   objetivos táctiles suficientes y un recorrido de teclado verificable.
   Los paneles deben devolver el foco al cerrarse y no tapar campos con barras fijas.
6. Conservar las reglas de permisos, borradores, versiones y revisión de filas.
   Una propuesta visual no permite aprobar automáticamente coincidencias ni
   saltarse la confirmación de acciones destructivas.
7. Las opciones de PDF se aplican a la descarga; cambiar preferencias guardadas
   requiere una acción explícita. Las casillas del PDF quedan vacías.
8. El acceso administrativo sigue separado. Los reportes solo muestran evidencia
   autorizada del caso; los productos de origen siguen siendo una importación
   puntual. No se incorpora correo, Google/Gmail o despliegue en esta revisión.

Los textos y dimensiones de las imágenes orientan la interacción; los contratos
vigentes de [la especificación](../../../docs/SPECIFICATION.md) y
[el API](../../../docs/API.md) definen el comportamiento de la aplicación.
