# Implemented category and attribute browsing

Actual browser captures from the local Angular/Rust app on 2026-11-10, using
disposable PostgreSQL fixtures. Open [the comparison gallery](index.html).
The reference images remain in [revision 06](../06-categories-and-attributes/).

The implementation uses broad categories, category-owned Type attributes,
conditional measurements and a collapsible left drawer. Desktop catalog cards
stay beside the working list; mobile uses a dedicated picker. Custom items and
administration use the same category definitions.

The desktop layout follows revised option C. Full item names, per-item notes,
quantity/unit controls and attributes remain editable, so list rows can be taller
than the illustrative mockup. Each desktop pane scrolls independently.

Validation: 88 distinct browser scenarios passed, including four viewport sizes,
keyboard/focus preservation, conditional filters and category administration.
The first visual pass led to scoped fixes for filter-radio alignment and admin
checkbox sizing. See [the validation record](../../../docs/VALIDATION.md).

`manifest.json` identifies the original screenshot locations and reference
mockups. These PNGs are actual rendered application captures, not generated
mockups. All accounts and list content shown are disposable QA examples.
