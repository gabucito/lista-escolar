import { newItem } from '../../core/models';
import {
  alternativeDetails,
  alternativeKey,
  alternativeRequirement,
  beginAlternatives,
  sharedAttributes,
  suggestedRequirementName,
} from './item-alternatives';

const squared = {
  catalog_id: 'one',
  name: 'Cuaderno universitario cuadriculado, 100 hojas',
  category: 'Cuadernos',
  attributes: {
    formato: { value: 'universitario', name: 'Formato' },
    numero_hojas: { value: 100, unit: 'hojas' },
    tipo: { value: 'Cuadriculado' },
    incluye_goma: { value: false },
  },
};
const ruled = {
  catalog_id: 'two',
  name: 'Cuaderno universitario rayado, 100 hojas',
  category: 'Cuadernos',
  attributes: {
    formato: { name: 'Formato', value: 'universitario' },
    numero_hojas: { unit: 'hojas', value: 100 },
    tipo: { value: 'Rayado' },
    incluye_goma: { value: false },
  },
};

describe('Alternative list requirements', () => {
  it('groups whole options with one total quantity and only genuinely shared typed attributes', () => {
    const selected = { options: [squared, ruled] };
    const item = alternativeRequirement(selected, {
      ...alternativeDetails(selected),
      quantity: '2',
    });
    expect(item.name).toBe('Cuaderno universitario');
    expect(item.quantity).toBe('2');
    expect(item.catalog_id).toBe('');
    expect(item.alternatives?.length).toBe(2);
    expect(item.attributes).toEqual({
      formato: squared.attributes.formato,
      numero_hojas: squared.attributes.numero_hojas,
      incluye_goma: { value: false },
    });
    expect(item.alternatives?.[0]).not.toHaveProperty('category');
    expect(item.alternatives?.[1].attributes['tipo']).toEqual({ value: 'Rayado' });
  });
  it('stages edits independently and preserves occurrence identity, quantity and note on conversion', () => {
    const original = {
      ...newItem(squared.name, 'Cuadernos'),
      catalog_id: squared.catalog_id,
      attributes: squared.attributes,
      quantity: '3',
      note: 'Para lenguaje',
    };
    const selected = beginAlternatives(original);
    selected.options.push(structuredClone(ruled));
    selected.options[0].attributes['formato'] = { value: 'college' };
    expect(original.attributes.formato.value).toBe('universitario');
    const grouped = alternativeRequirement(selected, alternativeDetails(selected));
    expect(grouped.id).toBe(original.id);
    expect(grouped.quantity).toBe('3');
    expect(grouped.note).toBe('Para lenguaje');
    expect(original).not.toHaveProperty('alternatives');
  });
  it('explicitly returns to a single specific supply without retaining stale group attributes or IDs', () => {
    const grouped = alternativeRequirement(
      { options: [squared, ruled] },
      { name: 'Cuaderno a elección', quantity: '2', unit: 'unidad', note: 'Forrado' },
    );
    const selected = beginAlternatives(grouped);
    selected.options = [ruled];
    const item = alternativeRequirement(selected, alternativeDetails(selected));
    expect(item.id).toBe(grouped.id);
    expect(item.name).toBe(ruled.name);
    expect(item.catalog_id).toBe(ruled.catalog_id);
    expect(item.quantity).toBe('2');
    expect(item.attributes).toEqual(ruled.attributes);
    expect(item).not.toHaveProperty('alternatives');
  });
  it('treats reordered attribute objects and catalog aliases as the same option but keeps distinct typed variants', () => {
    expect(alternativeKey(squared)).toBe(
      alternativeKey({
        ...squared,
        catalog_id: 'merged',
        attributes: {
          ...squared.attributes,
          numero_hojas: { unit: 'hojas', value: 100 },
        },
      }),
    );
    expect(alternativeKey(squared)).not.toBe(alternativeKey(ruled));
    expect(
      sharedAttributes([
        { ...squared, attributes: { pages: 100 } },
        { ...ruled, attributes: { pages: '100' } },
      ]),
    ).toEqual({});
  });
  it('suggests a broad name without inventing a category or unsupported specification', () => {
    expect(suggestedRequirementName([squared, ruled])).toBe('Cuaderno universitario');
    expect(suggestedRequirementName([squared, { ...ruled, name: 'Carpeta' }])).toBe(
      'Útil a elección',
    );
  });
});
