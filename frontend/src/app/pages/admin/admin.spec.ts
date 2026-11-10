import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Api } from '../../core/api';
import { CatalogItem, Category, CategoryAttribute } from '../../core/models';
import { Admin } from './admin';

function attribute(
  key: string,
  data_type: CategoryAttribute['data_type'] = 'text',
  options: string[] = [],
  applies_to_types: string[] = [],
): CategoryAttribute {
  return { key, name: key, data_type, unit: null, options, applies_to_types, sort_order: 0 };
}

const notebooks: Category = {
  id: 1,
  name: 'Cuadernos',
  slug: 'cuadernos',
  type_attribute: 'tipo_cuaderno',
  attributes: [
    attribute('tipo_cuaderno', 'text', ['Cuadriculado', 'Rayado']),
    attribute('formato', 'text', ['college', 'universitario']),
    attribute('numero_hojas', 'number'),
    attribute('cuadricula_mm', 'number', [], ['Cuadriculado']),
  ],
  subcategories: [],
};

function notebook(type: string): CatalogItem {
  return {
    id: 'existing-notebook',
    name: 'Cuaderno revisado',
    category: notebooks.name,
    category_slug: notebooks.slug,
    category_id: notebooks.id,
    subcategory: '',
    review_status: 'approved',
    attributes: {
      tipo_cuaderno: { value: type },
      formato: { value: 'college' },
      numero_hojas: { value: 100 },
      cuadricula_mm: { value: 7 },
      observacion_legacy: { value: 'Conservar curación' },
      incluye_goma: { value: false },
    },
  };
}

describe('Admin category attribute editing', () => {
  async function page() {
    const api = {
      get: vi.fn(async (path: string) => {
        if (path === '/admin/me') return { admin: null };
        if (path === '/admin/dashboard') return {};
        return [];
      }),
      patch: vi.fn().mockResolvedValue({}),
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    const admin = TestBed.runInInjectionContext(() => new Admin());
    await Promise.resolve();
    admin.categories.set([notebooks]);
    admin.attributeDefinitions.set([
      ...notebooks.attributes,
      attribute('observacion_legacy'),
      attribute('incluye_goma', 'boolean'),
    ]);
    return { admin, api };
  }

  it('preserves existing unassigned and conditional attributes when changing an ordinary enum', async () => {
    const { admin, api } = await page();
    admin.chooseItem(notebook('Rayado'));
    admin.reviewModel.update((model) => ({
      ...model,
      attributes: model.attributes.map((row) =>
        row.key === 'formato' ? { ...row, value: 'universitario' } : row,
      ),
    }));

    admin.reviewAttributeChanged();
    admin.review('update');

    await vi.waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/admin/catalog/existing-notebook',
        expect.objectContaining({
          attributes: {
            tipo_cuaderno: 'Rayado',
            formato: 'universitario',
            numero_hojas: 100,
            cuadricula_mm: 7,
            observacion_legacy: 'Conservar curación',
            incluye_goma: false,
          },
        }),
      ),
    );
  });

  it('drops incompatible grid spacing on a type change while retaining shared and unassigned values', async () => {
    const { admin, api } = await page();
    admin.chooseItem(notebook('Cuadriculado'));
    admin.reviewModel.update((model) => ({
      ...model,
      attributes: model.attributes.map((row) =>
        row.key === 'tipo_cuaderno' ? { ...row, value: 'Rayado' } : row,
      ),
    }));

    admin.reviewAttributeChanged();
    admin.review('update');

    await vi.waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/admin/catalog/existing-notebook',
        expect.objectContaining({
          attributes: {
            tipo_cuaderno: 'Rayado',
            formato: 'college',
            numero_hojas: 100,
            observacion_legacy: 'Conservar curación',
            incluye_goma: false,
          },
        }),
      ),
    );
  });

  it('clears text options when changing a binding to a numeric attribute', async () => {
    const { admin, api } = await page();
    admin.taxonomyModel.set({ id: notebooks.id, name: notebooks.name, slug: notebooks.slug });
    admin.bindingModel.set({
      attributes: [
        { key: 'formato', options: 'college\nuniversitario', all_types: true, types: [] },
      ],
    });
    admin.bindingModel.update((model) => ({
      attributes: model.attributes.map((row) => ({ ...row, key: 'numero_hojas' })),
    }));

    admin.bindingKeyChanged(0);

    expect(admin.bindingModel().attributes[0].options).toBe('');
    admin.saveBindings();
    await vi.waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/admin/categories/1/attributes', {
        attributes: [
          {
            key: 'tipo_cuaderno',
            options: ['Cuadriculado', 'Rayado'],
            applies_to_types: [],
            sort_order: 0,
          },
          { key: 'numero_hojas', options: [], applies_to_types: [], sort_order: 10 },
        ],
      }),
    );
  });
});
