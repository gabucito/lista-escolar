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

describe('Admin catalog pagination', () => {
  async function setup(getPage: (parameters: URLSearchParams) => Promise<unknown>) {
    const api = {
      get: vi.fn(async (path: string) => {
        if (path === '/admin/me') return { admin: null };
        if (path.startsWith('/admin/catalog/browse?'))
          return getPage(new URL(path, 'http://local').searchParams);
        return [];
      }),
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    const admin = TestBed.runInInjectionContext(() => new Admin());
    await Promise.resolve();
    return { admin, api };
  }
  function rows(offset: number, count = 50) {
    return Array.from({ length: count }, (_, index) => ({
      ...notebook('Rayado'),
      id: String(offset + index),
    }));
  }

  it('keeps submitted filters while paging and starts at the first page for a new filter', async () => {
    const seen: URLSearchParams[] = [];
    const { admin } = await setup(async (params) => {
      seen.push(params);
      const offset = Number(params.get('offset'));
      return { items: rows(offset), offset, limit: 50, total: 205 };
    });
    admin.searchModel.set({ q: 'papel azul', status: 'approved', category: 'papeles' });
    await admin.searchCatalog();
    admin.searchModel.update((value) => ({ ...value, q: 'texto todavía sin buscar' }));
    await admin.changeCatalogPage(1);
    expect(admin.catalogOffset()).toBe(50);
    expect(seen[1].get('q')).toBe('papel azul');
    expect(seen[1].get('category')).toBe('papeles');
    expect(seen[1].get('status')).toBe('approved');
    expect(admin.catalogRange()).toBe('51–100 de 205 resultados');
    admin.searchModel.update((value) => ({ ...value, status: 'pending' }));
    await admin.searchCatalog();
    expect(admin.catalogOffset()).toBe(0);
    expect(seen[2].get('status')).toBe('pending');
    expect(seen[2].get('q')).toBe('texto todavía sin buscar');
  });

  it('ignores a late search response after a newer search has completed', async () => {
    let finishFirst!: (value: unknown) => void;
    const first = new Promise((resolve) => {
      finishFirst = resolve;
    });
    const { admin } = await setup(async (params) =>
      params.get('q') === 'first' ? first : { items: rows(99, 1), offset: 0, limit: 50, total: 1 },
    );
    admin.searchModel.update((value) => ({ ...value, q: 'first' }));
    const old = admin.searchCatalog();
    admin.searchModel.update((value) => ({ ...value, q: 'second' }));
    await admin.searchCatalog();
    finishFirst({ items: rows(0), offset: 0, limit: 50, total: 205 });
    await old;
    expect(admin.catalogTotal()).toBe(1);
    expect(admin.catalog()[0].id).toBe('99');
    expect(admin.catalogLoading()).toBe(false);
  });

  it('returns to the last available page when moderation removes the final filtered result', async () => {
    let calls = 0;
    const { admin } = await setup(async (params) => {
      const offset = Number(params.get('offset'));
      calls++;
      return {
        items: offset === 0 ? rows(0) : [],
        offset,
        limit: 50,
        total: calls === 1 ? 51 : 50,
      };
    });
    await admin.searchCatalog();
    await admin.changeCatalogPage(1);
    expect(calls).toBe(3);
    expect(admin.catalogOffset()).toBe(0);
    expect(admin.catalogTotal()).toBe(50);
    expect(admin.catalog()).toHaveLength(50);
    expect(admin.catalogHasNext()).toBe(false);
  });
});

describe('Admin complete catalog candidates', () => {
  async function setup(getPage: (parameters: URLSearchParams) => Promise<unknown>) {
    const api = {
      get: vi.fn(async (path: string) => {
        if (path === '/admin/me') return { admin: null };
        if (path.startsWith('/catalog/browse?'))
          return getPage(new URL(path, 'http://local').searchParams);
        return [];
      }),
      post: vi.fn().mockResolvedValue({}),
      success: vi.fn(),
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    const admin = TestBed.runInInjectionContext(() => new Admin());
    await Promise.resolve();
    admin.administrator.set({ id: 'administrator', username: 'reviewer' });
    admin.selectedProduct.set({
      id: 'store-product',
      name: 'Producto de tienda',
      brand: '',
      snapshot_price_clp: 1000,
      variants: [],
    });
    return { admin, api };
  }

  it('loads every page, deduplicates candidates and preserves a selected item beyond 200 results', async () => {
    const candidates = Array.from({ length: 205 }, (_, index) => ({
      ...notebook('Rayado'),
      id: String(index),
    }));
    candidates[204].review_status = 'pending';
    const seen: URLSearchParams[] = [];
    const { admin } = await setup(async (parameters) => {
      seen.push(parameters);
      const offset = Number(parameters.get('offset'));
      const items = candidates.slice(offset, offset + 100);
      // A concurrent catalog reorder can repeat an item between pages.
      if (offset === 200) items.push(candidates[0]);
      return { items, total: 206, offset, limit: 100 };
    });
    admin.linkSearchModel.set({ q: 'cuaderno con líneas' });
    admin.linkModel.set({ item_id: '204' });

    await admin.findLinkTargets();

    expect(seen.map((parameters) => parameters.get('offset'))).toEqual(['0', '100', '200']);
    expect(seen.every((parameters) => parameters.get('q') === 'cuaderno con líneas')).toBe(true);
    expect(admin.usableItems()).toHaveLength(205);
    expect(admin.linkModel().item_id).toBe('204');
    expect(admin.selectedGeneric()?.review_status).toBe('pending');
  });

  it('makes approved merge targets beyond 200 selectable and retains the selected target', async () => {
    const candidates = Array.from({ length: 205 }, (_, index) => ({
      ...notebook('Rayado'),
      id: String(index),
      review_status: index === 203 ? 'pending' : 'approved',
    }));
    const { admin } = await setup(async (parameters) => {
      const offset = Number(parameters.get('offset'));
      return { items: candidates.slice(offset, offset + 100), total: 205, offset, limit: 100 };
    });
    admin.selectedItem.set(notebook('Cuadriculado'));
    admin.reviewModel.update((model) => ({ ...model, target_id: '204' }));

    await admin.findMergeTargets();

    expect(admin.mergeCandidates()).toHaveLength(205);
    expect(admin.approvedItems()).toHaveLength(204);
    expect(admin.approvedItems().at(-1)?.id).toBe('204');
    expect(admin.reviewModel().target_id).toBe('204');
  });

  it('ignores an older pending page and clears a selection excluded by the latest search', async () => {
    let finishFirst!: (value: unknown) => void;
    const first = new Promise((resolve) => {
      finishFirst = resolve;
    });
    const selected = { ...notebook('Rayado'), id: 'previous' };
    const latest = { ...notebook('Rayado'), id: 'latest' };
    const seen: string[] = [];
    const { admin } = await setup(async (parameters) => {
      const query = parameters.get('q') || '';
      seen.push(query);
      return query === 'first' ? first : { items: [latest], total: 1, offset: 0, limit: 100 };
    });
    admin.linkCandidates.set([selected]);
    admin.linkModel.set({ item_id: selected.id });
    admin.linkSearchModel.set({ q: 'first' });
    const old = admin.findLinkTargets();
    admin.linkSearchModel.set({ q: 'second' });
    await admin.findLinkTargets();
    finishFirst({ items: [selected], total: 205, offset: 0, limit: 100 });
    await old;

    expect(seen).toEqual(['first', 'second']);
    expect(admin.linkCandidates()).toEqual([latest]);
    expect(admin.linkModel().item_id).toBe('');
  });

  it('stops loading candidates on logout even if another session reopens the same product', async () => {
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const { admin, api } = await setup(async () => pending);
    const product = admin.selectedProduct();
    const search = admin.findLinkTargets();

    await admin.logout();
    admin.administrator.set({ id: 'another-administrator', username: 'another-reviewer' });
    admin.selectedProduct.set(product);
    finish({ items: [notebook('Rayado')], total: 205, offset: 0, limit: 100 });
    await search;

    expect(admin.linkCandidates()).toEqual([]);
    expect(api.get.mock.calls.filter(([path]) => path.startsWith('/catalog/browse?'))).toHaveLength(
      1,
    );
  });
});
