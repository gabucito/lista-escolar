import { CatalogAttributeValue, Category } from '../../core/models';
import { retainCategoryAttributes } from '../../core/catalog-attributes';

export interface CatalogSearch {
  q: string;
  category: string;
}

/** Option values are JSON so false, numbers and text never collapse into each other. */
export function selectedAttributes(
  values: Record<string, string>,
): Record<string, CatalogAttributeValue> {
  const selected: Record<string, CatalogAttributeValue> = {};
  for (const key of Object.keys(values).sort()) {
    if (!values[key]) continue;
    try {
      const value: unknown = JSON.parse(values[key]);
      if (
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))
      )
        selected[key] = value;
    } catch {
      /* A stale or malformed option must not prevent the remaining controls working. */
    }
  }
  return selected;
}

export function browseQuery(search: CatalogSearch, values: Record<string, string>): string {
  return new URLSearchParams({
    q: search.q.trim(),
    category: search.category,
    attributes: JSON.stringify(selectedAttributes(values)),
  }).toString();
}

export function compatibleAttributes(
  values: Record<string, string>,
  category: Category | undefined,
): Record<string, string> {
  return retainCategoryAttributes(values, category, selectedAttributes(values));
}

export function attributeChoice(value: CatalogAttributeValue, unit: string | null): string {
  const label =
    typeof value === 'boolean'
      ? value
        ? 'Sí'
        : 'No'
      : typeof value === 'number'
        ? new Intl.NumberFormat('es-CL', { maximumFractionDigits: 10 }).format(value)
        : value.charAt(0).toLocaleUpperCase('es') + value.slice(1);
  return label + (unit ? ' ' + unit : '');
}

/** Keep catalog rows scannable while retaining labels when a value alone is ambiguous. */
export function catalogAttributeSummary(attributes: Record<string, unknown>): string {
  return Object.entries(attributes)
    .map(([key, value]) => {
      if (value && typeof value === 'object' && 'value' in value) {
        const entry = value as { name?: string; value: unknown; unit?: string };
        if (
          typeof entry.value === 'string' ||
          typeof entry.value === 'number' ||
          typeof entry.value === 'boolean'
        ) {
          const label = attributeChoice(entry.value, entry.unit || null);
          return typeof entry.value === 'boolean' ||
            (typeof entry.value === 'number' && !entry.unit)
            ? `${entry.name || key}: ${label}`
            : label;
        }
      }
      return `${key}: ${String(value)}`;
    })
    .join(' · ');
}
