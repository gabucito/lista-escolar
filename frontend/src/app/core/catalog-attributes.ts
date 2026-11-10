import { CatalogAttributeValue, Category, CategoryAttribute } from './models';

/** Attribute applicability is category metadata, independent of old taxonomy IDs. */
export function applicableCategoryAttributes(
  category: Category | undefined,
  values: Record<string, CatalogAttributeValue>,
): CategoryAttribute[] {
  if (!category) return [];
  const type = category.type_attribute ? values[category.type_attribute] : undefined;
  return (category.attributes || []).filter(
    (attribute) =>
      !type ||
      !attribute.applies_to_types?.length ||
      attribute.applies_to_types.includes(String(type)),
  );
}

/** Type is curated; categories without any Type choices can still accept items. */
export function categoryInputAttributes(
  category: Category | undefined,
  values: Record<string, CatalogAttributeValue>,
): CategoryAttribute[] {
  return applicableCategoryAttributes(category, values).filter(
    (attribute) => attribute.key !== category?.type_attribute || attribute.options.length > 0,
  );
}

/** Keep shared measurements when changing type, but remove incompatible selections. */
export function retainCategoryAttributes<T>(
  values: Record<string, T>,
  category: Category | undefined,
  scalarValues: Record<string, CatalogAttributeValue>,
): Record<string, T> {
  const keys = new Set(applicableCategoryAttributes(category, scalarValues).map((a) => a.key));
  return Object.fromEntries(Object.entries(values).filter(([key]) => keys.has(key)));
}
