import {
  attributeChoice,
  browseQuery,
  compatibleAttributes,
  selectedAttributes,
} from './catalog-filters';
import { Category, CategoryAttribute } from '../../core/models';
import {
  applicableCategoryAttributes,
  categoryInputAttributes,
} from '../../core/catalog-attributes';

describe('Catalog attribute filters', () => {
  it('sends boolean false and numbers as typed values, independently from text and empty options', () => {
    const selected = selectedAttributes({
      incluye_goma: 'false',
      numero_hojas: '100',
      formato: '"universitario"',
      tipo_punta: '',
    });
    expect(selected).toEqual({ incluye_goma: false, numero_hojas: 100, formato: 'universitario' });
    const query = new URLSearchParams(
      browseQuery(
        { q: '  cuaderno univ  ', category: 'cuadernos' },
        { numero_hojas: '100', incluye_goma: 'false' },
      ),
    );
    expect(JSON.parse(query.get('attributes')!)).toEqual({
      incluye_goma: false,
      numero_hojas: 100,
    });
    expect(query.get('q')).toBe('cuaderno univ');
    expect(query.has('subcategory')).toBe(false);
  });

  it('retains shared format and sheet filters while dropping grid spacing in ruled notebooks', () => {
    const definition = (key: string, applies_to_types: string[] = []): CategoryAttribute => ({
      key,
      name: key,
      data_type: 'number',
      unit: null,
      options: [],
      applies_to_types,
      sort_order: 0,
    });
    const category: Category = {
      id: 1,
      slug: 'cuadernos',
      name: 'Cuadernos',
      type_attribute: 'tipo_cuaderno',
      attributes: [
        definition('tipo_cuaderno'),
        definition('formato'),
        definition('numero_hojas'),
        definition('cuadricula_mm', ['Cuadriculado']),
      ],
      subcategories: [],
    };
    const values = { formato: '"college"', numero_hojas: '80', cuadricula_mm: '7' };
    expect(compatibleAttributes({ ...values, tipo_cuaderno: '"Rayado"' }, category)).toEqual({
      tipo_cuaderno: '"Rayado"',
      formato: '"college"',
      numero_hojas: '80',
    });
    expect(compatibleAttributes(values, category)).toEqual(values);
    expect(compatibleAttributes(values, undefined)).toEqual({});
    expect(
      applicableCategoryAttributes(category, { tipo_cuaderno: 'Rayado' }).map((a) => a.key),
    ).not.toContain('cuadricula_mm');
    expect(applicableCategoryAttributes(category, {}).map((a) => a.key)).toContain('cuadricula_mm');
  });

  it('omits an unconfigured Type input while retaining ordinary free text attributes', () => {
    const attribute = (key: string): CategoryAttribute => ({
      key,
      name: key,
      data_type: 'text',
      unit: null,
      options: [],
      applies_to_types: [],
      sort_order: 0,
    });
    const category: Category = {
      id: 9,
      slug: 'otros',
      name: 'Otros',
      type_attribute: 'tipo_categoria_9',
      attributes: [attribute('tipo_categoria_9'), attribute('material')],
      subcategories: [],
    };
    expect(categoryInputAttributes(category, {}).map((a) => a.key)).toEqual(['material']);
    category.attributes[0].options = ['Otro'];
    expect(categoryInputAttributes(category, {}).map((a) => a.key)).toEqual([
      'tipo_categoria_9',
      'material',
    ]);
  });

  it('never sends unsupported stale option shapes or a subcategory', () => {
    expect(
      selectedAttributes({
        bad: 'undefined',
        object: '{}',
        array: '[7]',
        null: 'null',
        good: 'false',
      }),
    ).toEqual({ good: false });
    expect(
      new URLSearchParams(browseQuery({ q: '', category: '' }, {})).get('subcategory'),
    ).toBeNull();
    expect(attributeChoice(false, null)).toBe('No');
    expect(attributeChoice('universitario', null)).toBe('Universitario');
    expect(attributeChoice(7.5, 'mm')).toBe('7,5 mm');
  });
});
