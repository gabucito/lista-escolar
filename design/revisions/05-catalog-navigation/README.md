# Desktop catalog navigation options

**Latest direction:** the user selected C, then proposed category plus attributes
throughout the catalog. See [revision 06](../06-categories-and-attributes/index.html).
The alternatives and recommendation below record the initial exploration.

Four mockup images generated with the built-in `image_gen.imagegen` tool on
2026-11-10. Open [the gallery](index.html) to compare the three layouts and the
companion interaction states. The exact prompts are saved beside each PNG and
listed in [manifest.json](manifest.json).

These are design proposals. The implemented application is captured in
[revision 04](../04-catalog-browsing/index.html).

| Option | Category navigation | Left drawer | Main tradeoff |
| --- | --- | --- | --- |
| A · Árbol y filtros | Expandable tree; only categories with children expand | Categories above attributes | Clear hierarchy, but a long tree pushes filters below the fold |
| B · Categorías contextuales | Common categories plus “Más categorías”; children appear beneath the selected category | Attributes only | Fast switching and visible filtering; category rows must stay compact |
| C · Explorar por niveles | Breadcrumb, category chooser and contextual subcategory tiles | Attributes only | Clear current location and larger item cards; changing category takes an extra action |

**Recommendation: B.** It separates category navigation from attribute filtering
and keeps the catalog and working list visible together. Use compact result rows
and an open, docked left drawer on wide desktops. The drawer can collapse without
clearing selected filters. Keep the active category visible when other categories
move into “Más categorías”.

## Interaction rules illustrated

- Reveal subcategories only after selecting a category with children. Use
  “Todos los cuadernos” (or the corresponding category name) to remove only
  the subcategory restriction.
- Determine whether children exist from taxonomy, not the number of matching
  products. For example, Papeles y cartulinas has children even though its current
  catalog has no items.
- The actual Otros category has no children and no current items. The companion
  image omits the whole subcategory row and offers a custom supply or another
  category. An unused attribute drawer is also omitted in that empty category.
- Closing an available drawer preserves the filters and leaves selected chips
  and the reopen control visible. A search with no matches must still retain
  removable active filters and recovery actions.
- Category navigation remains available when attribute filters narrow the
  results. Changing category clears incompatible attributes; changing subcategory
  retains compatible ones.
- Attribute controls show the current one-value-per-attribute behavior using
  radio choices. Option counts account for the other active filters.

## Data and visual review

The three primary mockups use the same existing catalog scenario:
Cuadernos → Cuadriculados → Universitario, with five matches:
100 hojas/7 mm, 100/5, 80/7, 80/5 and 60/7. This makes the layouts comparable.
The drawer counts match that scenario: 100 hojas (2), 80 (2), 60 (1),
7 mm (3), 5 mm (2). Formato alternatives show Universitario (5), College (4),
Medio oficio (1). Values refer to **hojas**, not pages or store inventory.

The images preserve the navy, cream and sage direction and show attributes on
the left. Option A makes the vertical space cost visible; B prioritizes direct
navigation; C explores cards and drill-down. Revision 04 remains the reference
for existing editing, notes, quantity, Undo and save behavior. Incidental note
placement, icon details and short labels in generated images are illustrative.

The raster mockups are 1568×1003 for A/B/C and 1448×1086 for the states board.
They do not prove implementation fit at 1366×768. Any subsequent implementation
should verify that viewport with compact category rows, independently scrollable
attributes/results/list and reachable quantity/add/publish controls.
