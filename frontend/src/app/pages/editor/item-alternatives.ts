import { CatalogItem, Item, ItemAlternative, newItem } from '../../core/models';

export const MAX_ALTERNATIVES = 12;
export interface AlternativeChoice extends ItemAlternative {
  category: string;
}
export interface AlternativeDetails {
  name: string;
  quantity: string;
  unit: string;
  note: string;
}
export interface AlternativeSelection {
  original?: Item;
  category?: string;
  options: AlternativeChoice[];
  details?: AlternativeDetails;
  freeOptionName?: string;
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableValue).join(',') + ']';
  if (value && typeof value === 'object') {
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => JSON.stringify(key) + ':' + stableValue(entry))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value) ?? '';
}
export function alternativeKey(option: ItemAlternative): string {
  return option.name.trim() + '\n' + stableValue(option.attributes);
}
export function catalogChoice(item: CatalogItem): AlternativeChoice {
  return {
    catalog_id: item.id,
    name: item.name,
    category: item.category,
    attributes: structuredClone(item.attributes),
  };
}
export function beginAlternatives(item?: Item): AlternativeSelection {
  if (!item) return { options: [] };
  const choices = item.alternatives?.length ? item.alternatives : [item];
  return {
    original: structuredClone(item),
    category: item.category,
    options: choices.map((option) => ({
      catalog_id: option.catalog_id,
      name: option.name,
      category: item.category,
      attributes: structuredClone(option.attributes),
    })),
  };
}
export function sharedAttributes(options: ItemAlternative[]): Record<string, unknown> {
  if (!options.length) return {};
  return structuredClone(
    Object.fromEntries(
      Object.entries(options[0].attributes).filter(([key, value]) =>
        options.every(
          (option) =>
            Object.hasOwn(option.attributes, key) &&
            stableValue(option.attributes[key]) === stableValue(value),
        ),
      ),
    ),
  );
}
export function suggestedRequirementName(options: ItemAlternative[]): string {
  if (!options.length) return '';
  const words = options[0].name.trim().split(/\s+/);
  let count = words.length;
  for (const option of options.slice(1)) {
    const other = option.name.trim().split(/\s+/);
    count = Math.min(count, other.length);
    for (let i = 0; i < count; i++) {
      if (words[i].toLocaleLowerCase('es') !== other[i].toLocaleLowerCase('es')) {
        count = i;
        break;
      }
    }
  }
  return (
    words
      .slice(0, count)
      .join(' ')
      .replace(/[\s,;:–-]+$/, '') || 'Útil a elección'
  );
}
export function alternativeDetails(selection: AlternativeSelection): AlternativeDetails {
  return (
    selection.details ?? {
      name: selection.original?.alternatives?.length
        ? selection.original.name
        : suggestedRequirementName(selection.options),
      quantity: selection.original?.quantity ?? '1',
      unit: selection.original?.unit ?? 'unidad',
      note: selection.original?.note ?? '',
    }
  );
}
export function alternativeRequirement(
  selection: AlternativeSelection,
  details: AlternativeDetails,
): Item {
  if (!selection.options.length || selection.options.length > MAX_ALTERNATIVES)
    throw new Error('Selecciona entre 1 y 12 opciones.');
  const first = selection.options[0];
  const base = selection.original ?? newItem('', selection.category || first.category);
  const item: Item = {
    ...base,
    ...details,
    name: details.name.trim(),
    note: details.note.trim(),
    quantity: details.quantity.trim().replace(',', '.'),
    catalog_id: '',
    attributes: sharedAttributes(selection.options),
  };
  if (selection.options.length === 1) {
    item.name = first.name;
    item.catalog_id = first.catalog_id;
    delete item.alternatives;
  } else {
    item.alternatives = selection.options.map((option) => ({
      catalog_id: option.catalog_id,
      name: option.name,
      attributes: structuredClone(option.attributes),
    }));
  }
  return item;
}
