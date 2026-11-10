# Three proposals for the shared catalog sidenav

Generated on 2026-11-10 with the built-in `image_gen.imagegen` tool, using the
implemented category and attribute views as references. These are design
proposals; they do not change the running application's interface.

Open [the comparison gallery](index.html). Each image has its exact generation
prompt alongside it. `manifest.json` records provenance and files.

| Proposal | Image | Prompt | Main idea |
| --- | --- | --- | --- |
| A — Catálogo claro | [PNG](01-catalogo-claro.png) | [Prompt](01-catalogo-claro.prompt.txt) | Familiar two-column cards with concise specification badges and compact list entries. |
| B — Comparar y agregar | [PNG](02-comparar-y-agregar.png) | [Prompt](02-comparar-y-agregar.prompt.txt) | Compare similar supplies using aligned sheet-count and grid-spacing columns. |
| C — Preparar mi lista | [PNG](03-preparar-mi-lista.png) | [Prompt](03-preparar-mi-lista.prompt.txt) | Choose a quantity before using the explicit Add action. |

All three retain the same interaction: categories appear first in one left
sidenav; selecting a category replaces its contents with attributes. A persistent
back control returns to categories. Central results and the populated working
list remain visible. The separate strip below each main frame illustrates the
initial category state; it is not another navigation bar inside the application.

The shared example contains five university-format squared-notebook variants and
a list with one notebook entry, a graphite pencil and an eraser. The illustrative
controls and typography would need responsive and accessibility validation if a
proposal is implemented.

Recommendation after visual review: B makes nearly identical supplies easiest
to compare; C adds useful quantity entry before adding. A keeps the familiar
card layout. Any implementation should retain the current available-result
counts and individual filter reset choices, which these visual proposals omit.
