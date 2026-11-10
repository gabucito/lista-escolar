# Desktop B with distinct mobile layouts

The user selected **B — Comparar y agregar** for desktop and asked for a mobile
adaptation. The selected desktop proposal remains in
[revision 09](../09-sidenav-design-exploration/02-comparar-y-agregar.png).

Open [the mobile comparison gallery](index.html). The user selected desktop
B with mobile M1; that combination is now implemented. See the
[implementation comparison](../11-implemented-responsive-comparison/index.html).
The original imagegen proposals and prompts remain here for provenance. M2
remains an unselected alternative. Both proposals use the same category and
filter state as desktop, with a presentation designed for narrow screens.

| Mobile proposal | Image | Exact prompt | Approach |
| --- | --- | --- | --- |
| M1 — Filas legibles | [PNG](01-movil-filas-legibles-v3.png) | [Inicial](01-movil-filas-legibles.prompt.txt) + [refinamiento](01-movil-filas-legibles.refinement.prompt.txt) + [ajuste final](01-movil-filas-legibles.cleanup.prompt.txt) | Stacked comparison rows; full-screen category and attribute panel. |
| M2 — Panel deslizante | [PNG](02-movil-panel-deslizante-v2.png) | [Inicial](02-movil-panel-deslizante.prompt.txt) + [refinamiento](02-movil-panel-deslizante.refinement.prompt.txt) | Full-width cards; a tall bottom sheet switches between categories and attributes. |

Each board shows three successive states: categories, category attributes and
filtered results. They represent separate screens in a single phone flow.
Categories and attributes share one navigation panel; they are not displayed
side by side on a phone. A persistent action returns to the working list.

The selected mobile direction is M1: its rows retain B's quick comparison while leaving
space for full names, labeled measurements and a clearly separate Add action.
M2 is a larger-touch-target alternative with less result density. In either
implementation, preserve counts, optional filters, individual reset controls,
keyboard focus, scroll restoration and independent duplicate additions.

Generated with the built-in `image_gen.imagegen` tool using desktop B and the
existing mobile category/filter captures as references. Exact prompts accompany
the PNGs; `manifest.json` records provenance. Actual responsive behavior and accessibility checks are recorded in the
[validation log](../../../docs/VALIDATION.md).

The final refined images reduce header duplication, make type/format selectors
explicit and give Add actions more space. Initial versions are retained beside
the final proposals for provenance.

Implementation notes: retain Todo el catálogo and import access (which can use
a secondary action menu). Comparison labels must come from each category’s
attributes; Hojas and Cuadrícula are notebook examples, not universal columns.
