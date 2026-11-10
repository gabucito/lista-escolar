import { Category, CategoryAttribute } from '../../core/models';
import {
  comparisonColumns,
  comparisonLabel,
  comparisonSummary,
  comparisonValue,
} from './catalog-comparison';

function attribute(
  key: string,
  data_type: CategoryAttribute['data_type'],
  sort_order: number,
  unit: string | null = null,
  applies_to_types: string[] = [],
): CategoryAttribute {
  return { key, name: key, data_type, sort_order, unit, applies_to_types, options: [] };
}

const notebook: Category = {
  id: 1,
  slug: 'cuadernos',
  name: 'Cuadernos',
  type_attribute: 'tipo_cuaderno',
  subcategories: [],
  attributes: [
    attribute('cuadricula_mm', 'number', 40, 'mm', ['Cuadriculado']),
    attribute('formato', 'text', 20),
    attribute('numero_hojas', 'number', 30, 'hojas'),
    attribute('tipo_cuaderno', 'text', 0),
  ],
};

describe('Catalog comparison', () => {
  it('compares notebook measurements in metadata order without mutating category definitions', () => {
    const originalOrder = notebook.attributes.map((item) => item.key);
    const columns = comparisonColumns(notebook, {});
    expect(columns.map((item) => item.key)).toEqual(['numero_hojas', 'cuadricula_mm']);
    expect(columns.map(comparisonLabel)).toEqual(['Hojas', 'Cuadrícula']);
    expect(notebook.attributes.map((item) => item.key)).toEqual(originalOrder);
  });

  it('replaces inapplicable measurements when a different notebook type is selected', () => {
    expect(
      comparisonColumns(notebook, { tipo_cuaderno: 'Rayado' }).map((item) => item.key),
    ).toEqual(['numero_hojas', 'formato']);
  });

  it('uses each category metadata instead of notebook fields and handles the global catalog', () => {
    const geometry: Category = {
      ...notebook,
      slug: 'geometria',
      type_attribute: 'tipo_geometria',
      attributes: [
        attribute('tipo_geometria', 'text', 0),
        attribute('largo_cm', 'number', 20, 'cm', ['Regla']),
      ],
    };
    expect(comparisonColumns(geometry, {}).map((item) => item.key)).toEqual(['largo_cm']);
    expect(comparisonColumns(geometry, { tipo_geometria: 'Compás' })).toEqual([]);
    expect(comparisonColumns(undefined, {})).toEqual([]);
    expect(comparisonLabel({ ...geometry.attributes[1], name: 'Largo' })).toBe('Largo');
  });

  it('retains false and zero, formats units, and distinguishes absent or malformed values', () => {
    const eraser = attribute('incluye_goma', 'boolean', 20);
    const length = attribute('largo_cm', 'number', 10, 'cm');
    expect(comparisonValue({ incluye_goma: { value: false } }, eraser)).toBe('No');
    expect(comparisonValue({ largo_cm: { value: 0 } }, length)).toBe('0 cm');
    expect(comparisonValue({ largo_cm: { value: 7.5 } }, length)).toBe('7,5 cm');
    expect(comparisonValue({ largo_cm: 30 }, length)).toBe('30 cm');
    expect(comparisonValue({ numero_hojas: { value: 100 } }, notebook.attributes[2])).toBe('100');
    for (const value of [null, undefined, {}, [], Number.NaN, Number.POSITIVE_INFINITY, ' ']) {
      expect(comparisonValue({ largo_cm: { value } }, length)).toBe('—');
    }
    expect(comparisonValue({}, length)).toBe('—');
  });

  it('keeps other specifications in the summary without duplicating comparison values', () => {
    const attributes = {
      tipo_cuaderno: { name: 'Tipo', value: 'Cuadriculado' },
      formato: { name: 'Formato', value: 'universitario' },
      numero_hojas: { name: 'Número de hojas', value: 100, unit: 'hojas' },
      cuadricula_mm: { name: 'Cuadrícula', value: 7, unit: 'mm' },
    };
    expect(comparisonSummary(attributes, comparisonColumns(notebook, {}))).toBe(
      'Cuadriculado · Universitario',
    );
    expect(comparisonSummary(attributes, [])).toContain('100 hojas');
  });

  it('omits only whole text values already stated in the complete product name', () => {
    const attributes = {
      formato: { name: 'Formato', value: 'universitario' },
      tipo: { name: 'Tipo', value: 'cuadriculado' },
      orientacion: { name: 'Orientación', value: 'vertical' },
      incluye_goma: { name: 'Incluye goma', value: false },
      cantidad: { name: 'Cantidad', value: 0 },
    };
    expect(comparisonSummary(attributes, [], 'Cuaderno universitário, CUADRICULADO 7 mm')).toBe(
      'Vertical · Incluye goma: No · Cantidad: 0',
    );
    expect(comparisonSummary(attributes, [], 'Cuaderno preuniversitario')).toContain(
      'Universitario',
    );
    expect(
      comparisonSummary(
        { formato: { name: 'Formato', value: 'medio oficio' } },
        [],
        'Cuaderno medio-oficio',
      ),
    ).toBe('');
  });
});
