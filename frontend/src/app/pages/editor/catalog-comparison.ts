import { applicableCategoryAttributes } from '../../core/catalog-attributes';
import { CatalogAttributeValue, Category, CategoryAttribute, normalized } from '../../core/models';
import { attributeChoice, catalogAttributeSummary } from './catalog-filters';

/** Keep comparisons stable while paging, using the category's applicable metadata. */
export function comparisonColumns(
  category: Category | undefined,
  selectedValues: Record<string, CatalogAttributeValue>,
): CategoryAttribute[] {
  return applicableCategoryAttributes(category, selectedValues)
    .filter((attribute) => attribute.key !== category?.type_attribute)
    .sort(
      (left, right) =>
        Number(left.data_type === 'text') - Number(right.data_type === 'text') ||
        left.sort_order - right.sort_order ||
        left.key.localeCompare(right.key),
    )
    .slice(0, 2);
}

/** Long definition names remain useful in forms; comparison headers need short labels. */
export function comparisonLabel(column: CategoryAttribute): string {
  const labels: Record<string, string> = {
    numero_hojas: 'Hojas',
    cuadricula_mm: 'Cuadrícula',
  };
  return labels[column.key] || column.name;
}

export function comparisonValue(
  attributes: Record<string, unknown>,
  column: CategoryAttribute,
): string {
  const entry = attributes[column.key];
  const value = entry && typeof entry === 'object' && 'value' in entry ? entry.value : entry;
  if (
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.trim())
  ) {
    const unit =
      normalized(column.unit || '') === normalized(comparisonLabel(column)) ? null : column.unit;
    return attributeChoice(value, unit);
  }
  return '—';
}

/** Do not repeat the comparison values underneath the product name. */
export function comparisonSummary(
  attributes: Record<string, unknown>,
  columns: CategoryAttribute[],
  name = '',
): string {
  const compared = new Set(columns.map((column) => column.key));
  const words = (value: string) =>
    normalized(value)
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const nameWords = ` ${words(name)} `;
  return catalogAttributeSummary(
    Object.fromEntries(
      Object.entries(attributes).filter(([key, entry]) => {
        if (compared.has(key)) return false;
        const value = entry && typeof entry === 'object' && 'value' in entry ? entry.value : entry;
        return (
          typeof value !== 'string' || !words(value) || !nameWords.includes(` ${words(value)} `)
        );
      }),
    ),
  );
}
