import { Component, computed, inject, signal } from '@angular/core';
import {
  FormField,
  applyEach,
  form,
  maxLength,
  minLength,
  required,
  submit,
} from '@angular/forms/signals';
import { Api, ApiError } from '../../core/api';
import {
  CatalogItem,
  Category,
  CategoryAttribute,
  Content,
  Item,
  Template,
  UNITS,
  emptyContent,
  newItem,
  dateLabel,
} from '../../core/models';
import { applicableCategoryAttributes, categoryInputAttributes } from '../../core/catalog-attributes';

interface Administrator {
  id: string;
  username: string;
}
interface Product {
  id: string;
  name: string;
  brand: string;
  snapshot_price_clp: number;
  variants: { name: string; sku: string; attributes: Record<string, unknown> }[];
}
interface AttributeDefinition {
  key: string;
  name: string;
  data_type: string;
  unit: string | null;
}
interface AdminItem extends CatalogItem {
  aliases?: string[];
}
interface AttributeInput {
  key: string;
  value: string;
}
interface AttributeBindingInput {
  key: string;
  options: string;
  all_types: boolean;
  types: { value: string; selected: boolean }[];
}
interface Match {
  item_id: string;
  source_product_id: string;
  generic_name: string;
  source_product_name: string;
  review_status: string;
}
interface Report {
  id: string;
  list_id: string;
  version: number;
  comment_id: string;
  kind: string;
  reason: string;
  status: string;
  outcome: string;
  note: string;
  created_at: string;
  evidence: { content?: Content; body?: string; school?: string; class_name?: string };
}
interface School {
  id: string;
  canonical_name: string;
  alias: string;
  comuna: string;
  region: string;
}
type Tab =
  | 'summary'
  | 'catalog'
  | 'taxonomy'
  | 'products'
  | 'reports'
  | 'templates'
  | 'schools'
  | 'accounts';

@Component({
  selector: 'app-admin',
  imports: [FormField],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
})
export class Admin {
  private readonly api = inject(Api);
  readonly administrator = signal<Administrator | undefined>(undefined);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly attempted = signal('');
  readonly tab = signal<Tab>('summary');
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'summary', label: 'Resumen' },
    { id: 'catalog', label: 'Útiles' },
    { id: 'taxonomy', label: 'Categorías' },
    { id: 'products', label: 'Productos y vínculos' },
    { id: 'reports', label: 'Reportes' },
    { id: 'templates', label: 'Plantillas' },
    { id: 'schools', label: 'Colegios' },
    { id: 'accounts', label: 'Administradores' },
  ];
  readonly titles: Record<Tab, string> = {
    summary: 'Administración',
    catalog: 'Catálogo compartido',
    taxonomy: 'Organización del catálogo',
    products: 'Revisar vínculos de productos',
    reports: 'Reportes de la comunidad',
    templates: 'Plantillas por nivel',
    schools: 'Nombres de colegios',
    accounts: 'Crear cuenta administrativa',
  };
  readonly navPaths: Record<Tab, string> = {
    summary: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
    catalog: 'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3zM12 6v16',
    taxonomy: 'm12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5',
    products:
      'm9 15 6-6M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
    reports: 'M5 3h14v18H5zM9 7h6M9 11h6M9 15h3',
    templates: 'M6 3h10l4 4v14H6zM16 3v5h4M10 12h6M10 16h6',
    schools: 'm3 10 9-7 9 7M5 9v12h14V9M10 21v-6h4v6M9 10h1M14 10h1',
    accounts:
      'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21v-3a7 7 0 0 1 14 0v3zM17 4a4 4 0 0 1 0 7M19 14a6 6 0 0 1 3 5v2',
  };
  readonly counts = signal<Record<string, number>>({});
  readonly catalog = signal<AdminItem[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly products = signal<Product[]>([]);
  readonly matches = signal<Match[]>([]);
  readonly reports = signal<Report[]>([]);
  readonly templates = signal<(Template & { active: boolean })[]>([]);
  readonly schools = signal<School[]>([]);
  readonly selectedItem = signal<AdminItem | undefined>(undefined);
  readonly itemEditing = signal(false);
  readonly attributeDefinitions = signal<AttributeDefinition[]>([]);
  readonly selectedProduct = signal<Product | undefined>(undefined);
  readonly selectedReport = signal<Report | undefined>(undefined);
  readonly evidenceLimit = signal(50);
  readonly showMore = (value: number) => value + 50;
  readonly showClosed = signal(false);
  readonly shownReports = computed(() =>
    this.reports().filter((r) => this.showClosed() || r.status === 'open'),
  );
  readonly mergeCandidates = signal<CatalogItem[]>([]);
  readonly mergeModel = signal({ q: '' });
  readonly mergeFields = form(this.mergeModel);
  private mergeRequest = 0;
  readonly approvedItems = computed(() =>
    this.mergeCandidates().filter((i) => i.review_status === 'approved'),
  );
  readonly linkCandidates = signal<CatalogItem[]>([]);
  readonly usableItems = computed(() =>
    this.linkCandidates().filter((i) => i.review_status !== 'rejected'),
  );
  readonly linkSearchModel = signal({ q: '' });
  readonly linkSearchFields = form(this.linkSearchModel);
  private linkRequest = 0;
  readonly loginModel = signal({ username: '', password: '' });
  readonly loginFields = form(this.loginModel, (p) => {
    required(p.username);
    required(p.password);
  });
  readonly searchModel = signal({ q: '', status: '' });
  readonly searchFields = form(this.searchModel);
  readonly shownCatalog = computed(() =>
    this.catalog().filter(
      (i) => !this.searchModel().status || i.review_status === this.searchModel().status,
    ),
  );
  readonly reviewModel = signal({
    name: '',
    target_id: '',
    category_id: '',
    aliases: '',
    attributes: [] as AttributeInput[],
  });
  readonly reviewFields = form(this.reviewModel, (p) => {
    required(p.name);
    maxLength(p.name, 300);
    required(p.category_id);
    applyEach(p.attributes, (a) => {
      required(a.key);
      required(a.value);
      maxLength(a.value, 300);
    });
  });
  readonly reviewCategory = computed(() =>
    this.categories().find((c) => String(c.id) === this.reviewModel().category_id),
  );
  readonly reviewDefinitions = computed(() =>
    categoryInputAttributes(
      this.reviewCategory(),
      Object.fromEntries(this.reviewModel().attributes.map((a) => [a.key, a.value])),
    ),
  );
  readonly taxonomyModel = signal({ id: 0, name: '', slug: '' });
  readonly taxonomyFields = form(this.taxonomyModel, (p) => {
    required(p.name);
    required(p.slug);
  });
  readonly configuredCategory = computed(() =>
    this.categories().find((c) => c.id === this.taxonomyModel().id),
  );
  readonly typeOptions = computed(() => this.categoryTypes(this.configuredCategory()));
  readonly typeModel = signal({ previous: '', value: '' });
  readonly typeFields = form(this.typeModel, (p) => {
    required(p.value);
    maxLength(p.value, 300);
  });
  readonly bindingModel = signal({ attributes: [] as AttributeBindingInput[] });
  readonly bindingFields = form(this.bindingModel, (p) =>
    applyEach(p.attributes, (a) => required(a.key)),
  );
  readonly bindingDefinitions = computed(() => {
    const typeKeys = new Set(
      this.categories()
        .map((c) => c.type_attribute)
        .filter(Boolean),
    );
    return this.attributeDefinitions().filter((a) => !typeKeys.has(a.key));
  });
  readonly productSearchModel = signal({ q: '' });
  readonly productSearchFields = form(this.productSearchModel);
  readonly linkModel = signal({ item_id: '' });
  readonly linkFields = form(this.linkModel, (p) => required(p.item_id));
  readonly selectedGeneric = computed(() =>
    this.usableItems().find((item) => item.id === this.linkModel().item_id),
  );
  readonly decisionModel = signal({ note: '', action: 'dismiss' });
  readonly decisionFields = form(this.decisionModel, (p) => required(p.note));
  readonly templateEditing = signal(false);
  readonly templateNoteIds = signal<string[]>([]);
  readonly showAccountPassword = signal(false);
  readonly showLoginPassword = signal(false);
  readonly templateModel = signal({
    id: '',
    name: '',
    grade: '',
    instructions: '',
    items: [] as Item[],
  });
  readonly templateFields = form(this.templateModel, (p) => {
    required(p.name);
    required(p.grade);
    applyEach(p.items, (item) => {
      required(item.name);
      required(item.quantity);
      required(item.unit);
    });
  });
  readonly schoolModel = signal({ canonical_name: '', alias: '', comuna: '', region: '' });
  readonly schoolFields = form(this.schoolModel, (p) => {
    required(p.canonical_name);
    required(p.alias);
    required(p.comuna);
    required(p.region);
  });
  readonly accountModel = signal({ username: '', password: '' });
  readonly accountFields = form(this.accountModel, (p) => {
    required(p.username);
    required(p.password);
    minLength(p.password, 8);
  });
  readonly units = UNITS;
  readonly dateLabel = dateLabel;
  constructor() {
    void this.initialize();
  }
  private async initialize() {
    try {
      const { admin } = await this.api.get<{ admin: Administrator | null }>('/admin/me');
      this.administrator.set(admin || undefined);
      if (admin) await this.load();
    } catch (error) {
      this.fail(error);
    } finally {
      this.loading.set(false);
    }
  }
  private clearPrivateData() {
    this.reports.set([]);
    this.products.set([]);
    this.matches.set([]);
    this.selectedReport.set(undefined);
    this.selectedProduct.set(undefined);
    this.decisionModel.set({ note: '', action: 'dismiss' });
    this.accountModel.set({ username: '', password: '' });
    this.showAccountPassword.set(false);
    this.showLoginPassword.set(false);
  }
  private fail(error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      this.administrator.set(undefined);
      this.clearPrivateData();
    }
    this.error.set(error instanceof Error ? error.message : 'No se pudo completar la acción.');
  }
  async selectTab(tab: Tab) {
    if (this.busy()) return;
    this.attempted.set('');
    this.tab.set(tab);
    this.error.set('');
    this.selectedItem.set(undefined);
    this.itemEditing.set(false);
    this.selectedProduct.set(undefined);
    this.selectedReport.set(undefined);
    this.loading.set(true);
    try {
      await this.load();
    } catch (error) {
      this.fail(error);
    } finally {
      this.loading.set(false);
    }
  }
  private async load() {
    switch (this.tab()) {
      case 'summary':
        this.counts.set(await this.api.get<Record<string, number>>('/admin/dashboard'));
        break;
      case 'catalog': {
        const [items, categories, definitions] = await Promise.all([
          this.api.get<AdminItem[]>('/admin/catalog?q=' + encodeURIComponent(this.searchModel().q)),
          this.api.get<Category[]>('/catalog/categories'),
          this.api.get<AttributeDefinition[]>('/admin/attributes'),
        ]);
        this.catalog.set(items);
        this.categories.set(categories);
        this.attributeDefinitions.set(definitions);
        break;
      }
      case 'taxonomy': {
        const [categories, definitions] = await Promise.all([
          this.api.get<Category[]>('/catalog/categories'),
          this.api.get<AttributeDefinition[]>('/admin/attributes'),
        ]);
        this.categories.set(categories);
        this.attributeDefinitions.set(definitions);
        const options = this.typeOptions();
        this.bindingModel.update((model) => ({
          attributes: model.attributes.map((row) => ({
            ...row,
            types: options.map((value) => ({
              value,
              selected: row.types.find((t) => t.value === value)?.selected || false,
            })),
          })),
        }));
        break;
      }
      case 'products': {
        const [products, matches] = await Promise.all([
          this.api.get<Product[]>(
            '/admin/products?q=' + encodeURIComponent(this.productSearchModel().q),
          ),
          this.api.get<Match[]>('/admin/matches'),
        ]);
        this.products.set(products);
        this.matches.set(matches);
        break;
      }
      case 'reports':
        this.reports.set(await this.api.get<Report[]>('/admin/reports'));
        break;
      case 'templates': {
        const [templates, categories] = await Promise.all([
          this.api.get<(Template & { active: boolean })[]>('/admin/templates'),
          this.api.get<Category[]>('/catalog/categories'),
        ]);
        this.templates.set(templates);
        this.categories.set(categories);
        break;
      }
      case 'schools':
        this.schools.set(await this.api.get<School[]>('/admin/schools'));
        break;
      case 'accounts':
        break;
    }
  }
  async refresh() {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.load();
    } catch (error) {
      this.fail(error);
    } finally {
      this.loading.set(false);
    }
  }
  private async action(work: () => Promise<unknown>, message: string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await work();
      await this.load();
      this.api.success(message);
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
  login() {
    this.attempted.set('login');
    void submit(this.loginFields, async () => {
      this.busy.set(true);
      this.error.set('');
      try {
        const result = await this.api.post<{ admin: Administrator }>(
          '/admin/login',
          this.loginModel(),
        );
        this.administrator.set(result.admin);
        this.loginModel.update((v) => ({ ...v, password: '' }));
        await this.load();
      } catch (error) {
        this.fail(error);
      } finally {
        this.busy.set(false);
      }
    });
  }
  async logout() {
    this.busy.set(true);
    try {
      await this.api.post('/admin/logout');
      this.administrator.set(undefined);
      this.clearPrivateData();
      this.catalog.set([]);
      this.selectedItem.set(undefined);
      this.tab.set('summary');
      this.api.success('Sesión administrativa cerrada.');
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
  status(value: string) {
    return (
      (
        {
          pending: 'Pendiente',
          approved: 'Aprobado',
          rejected: 'Rechazado',
          open: 'Abierto',
          closed: 'Cerrado',
          hide: 'Oculto',
          restore: 'Restaurado',
          remove: 'Retirado',
          dismiss: 'Descartado',
        } as Record<string, string>
      )[value] || value
    );
  }
  attributeLabel(item: CatalogItem) {
    return Object.entries(item.attributes || {})
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null && 'value' in value) {
          const v = value as { name?: string; value: unknown; unit?: string };
          return `${v.name || key}: ${this.attributeValue(v.value)}${v.unit ? ' ' + v.unit : ''}`;
        }
        return `${key}: ${String(value)}`;
      })
      .join(' · ');
  }
  chooseItem(item: AdminItem) {
    this.itemEditing.set(true);
    this.selectedItem.set(item);
    this.reviewModel.set({
      name: item.name,
      target_id: '',
      category_id: String(item.category_id || ''),
      aliases: (item.aliases || []).join('\n'),
      attributes: Object.entries(item.attributes || {}).map(([key, attribute]) => {
        const value =
          typeof attribute === 'object' && attribute !== null && 'value' in attribute
            ? (attribute as { value: unknown }).value
            : attribute;
        return { key, value: String(value) };
      }),
    });
    this.mergeModel.set({ q: '' });
    this.mergeCandidates.set([]);
    void this.findMergeTargets();
  }
  newSupply() {
    this.attempted.set('');
    this.itemEditing.set(true);
    this.selectedItem.set(undefined);
    this.reviewModel.set({
      name: '',
      target_id: '',
      category_id: '',
      aliases: '',
      attributes: [],
    });
  }
  closeSupply() {
    this.attempted.set('');
    this.itemEditing.set(false);
    this.selectedItem.set(undefined);
  }
  changeReviewCategory(category_id: string) {
    const category = this.categories().find((c) => String(c.id) === category_id);
    const keys = new Set(category?.attributes.map((a) => a.key) || []);
    this.reviewModel.update((v) => ({
      ...v,
      category_id,
      attributes: v.attributes.filter((a) => keys.has(a.key)),
    }));
    this.reviewAttributeChanged();
  }
  reviewAttributeChanged(index?: number) {
    const category = this.reviewCategory();
    const original = this.selectedItem();
    const originalValue = (key: string) => {
      const value = original?.attributes[key];
      return value && typeof value === 'object' && 'value' in value ? value.value : value;
    };
    this.reviewModel.update((model) => {
      const rows = model.attributes.map((row, i) => (i === index ? { ...row, value: '' } : row));
      const values = Object.fromEntries(rows.map((a) => [a.key, a.value]));
      const typeChanged =
        !!category?.type_attribute &&
        values[category.type_attribute] !== originalValue(category.type_attribute);
      const allowed = new Set(applicableCategoryAttributes(category, values).map((a) => a.key));
      return {
        ...model,
        attributes: rows.filter((a) => {
          if (!a.key || allowed.has(a.key)) return true;
          const unchanged =
            original?.category_id === category?.id &&
            originalValue(a.key) !== undefined &&
            String(originalValue(a.key)) === a.value;
          const assigned = category?.attributes.some((definition) => definition.key === a.key);
          return unchanged && (!assigned || !typeChanged);
        }),
      };
    });
  }
  reviewAttributeChoices(index: number) {
    const current = this.reviewModel().attributes[index]?.key;
    const definitions: AttributeDefinition[] = [...this.reviewDefinitions()];
    if (current && !definitions.some((a) => a.key === current)) {
      const legacy = this.attributeDefinition(current);
      if (legacy) definitions.push(legacy);
    }
    return definitions;
  }
  reviewAttributeOptions(key: string) {
    return this.reviewCategory()?.attributes.find((a) => a.key === key)?.options || [];
  }
  addAttribute() {
    this.reviewModel.update((v) => ({
      ...v,
      attributes: [...v.attributes, { key: '', value: '' }],
    }));
  }
  removeAttribute(index: number) {
    this.reviewModel.update((v) => ({
      ...v,
      attributes: v.attributes.filter((_, i) => i !== index),
    }));
  }
  attributeDefinition(key: string) {
    return (
      this.reviewCategory()?.attributes.find((a) => a.key === key) ||
      this.attributeDefinitions().find((a) => a.key === key)
    );
  }
  private supplyInput() {
    const value = this.reviewModel();
    const attributes: Record<string, string | number | boolean> = {};
    for (const row of value.attributes) {
      const definition = this.attributeDefinition(row.key);
      if (!definition || Object.hasOwn(attributes, row.key))
        throw new Error('Selecciona cada atributo una sola vez.');
      if (definition.data_type === 'number') {
        const number = Number(row.value);
        if (!row.value.trim() || !Number.isFinite(number) || number <= 0 || number > 1000000)
          throw new Error('Los atributos numéricos requieren un valor positivo de hasta 1000000.');
        attributes[row.key] = number;
      } else if (definition.data_type === 'boolean') {
        if (!['true', 'false'].includes(row.value))
          throw new Error('Selecciona Sí o No para el atributo.');
        attributes[row.key] = row.value === 'true';
      } else attributes[row.key] = row.value;
    }
    return {
      name: value.name,
      category_id: Number(value.category_id),
      subcategory_id: null,
      attributes,
      aliases: value.aliases
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean),
    };
  }
  async findMergeTargets() {
    const request = ++this.mergeRequest;
    try {
      const candidates = await this.api.get<CatalogItem[]>(
        '/catalog?q=' + encodeURIComponent(this.mergeModel().q),
      );
      if (request === this.mergeRequest && this.administrator() && this.selectedItem())
        this.mergeCandidates.set(candidates);
    } catch (error) {
      this.fail(error);
    }
  }
  review(action: 'update' | 'approve' | 'reject' | 'merge') {
    const item = this.selectedItem();
    if (action === 'merge') {
      if (!item || !this.reviewModel().target_id) {
        this.error.set('Selecciona un artículo aprobado como destino.');
        return;
      }
      if (
        !window.confirm(
          '¿Unir este útil con el destino elegido? Las listas publicadas conservarán su contenido.',
        )
      )
        return;
      void this.action(async () => {
        await this.api.patch('/admin/catalog/' + item.id, {
          action,
          target_id: this.reviewModel().target_id,
        });
        this.closeSupply();
      }, 'Revisión guardada.');
      return;
    }
    if (action === 'reject') {
      if (
        !item ||
        !window.confirm(
          '¿Retirar este útil del catálogo compartido? Las listas existentes lo conservarán.',
        )
      )
        return;
      void this.action(async () => {
        await this.api.patch('/admin/catalog/' + item.id, { action });
        this.closeSupply();
      }, 'Útil retirado del catálogo.');
      return;
    }
    this.attempted.set('review');
    void submit(this.reviewFields, async () => {
      await this.action(
        async () => {
          const input = this.supplyInput();
          if (item) await this.api.patch('/admin/catalog/' + item.id, { ...input, action });
          else await this.api.post('/admin/catalog', { ...input, approve: true });
          this.closeSupply();
        },
        item ? 'Correcciones guardadas.' : 'Útil creado y aprobado.',
      );
    });
  }
  editCategory(category: Category) {
    if (this.busy()) return;
    this.taxonomyModel.set({
      id: category.id,
      name: category.name,
      slug: category.slug,
    });
    this.typeModel.set({ previous: '', value: '' });
    this.loadCategoryBindings(category);
    requestAnimationFrame(() => document.getElementById('taxonomy-editor-heading')?.focus());
  }
  clearTaxonomy() {
    this.attempted.set('');
    this.taxonomyModel.set({ id: 0, name: '', slug: '' });
    this.typeModel.set({ previous: '', value: '' });
    this.bindingModel.set({ attributes: [] });
  }
  saveTaxonomy() {
    this.attempted.set('taxonomy');
    void submit(this.taxonomyFields, async () => {
      const value = this.taxonomyModel();
      await this.action(async () => {
        const body = {
          name: value.name,
          slug: value.slug,
        };
        if (value.id) await this.api.patch('/admin/categories/' + value.id, body);
        else {
          const result = await this.api.post<{ id: number }>('/admin/categories', body);
          this.taxonomyModel.update((model) => ({ ...model, id: result.id }));
        }
      }, 'Categoría guardada.');
    });
  }
  removeTaxonomy(id: number) {
    if (
      window.confirm('¿Eliminar esta categoría? Solo se permite si no tiene artículos asociados.')
    )
      void this.action(async () => {
        await this.api.delete('/admin/categories/' + id);
        if (this.taxonomyModel().id === id) this.clearTaxonomy();
      }, 'Categoría eliminada.');
  }
  chooseProduct(product: Product) {
    this.selectedProduct.set(product);
    this.linkModel.set({ item_id: '' });
    this.linkSearchModel.set({ q: '' });
    this.linkCandidates.set([]);
    void this.findLinkTargets();
  }
  async findLinkTargets() {
    const request = ++this.linkRequest;
    this.linkModel.set({ item_id: '' });
    try {
      const items = await this.api.get<CatalogItem[]>(
        '/catalog?q=' + encodeURIComponent(this.linkSearchModel().q),
      );
      if (request === this.linkRequest && this.administrator() && this.selectedProduct())
        this.linkCandidates.set(items);
    } catch (error) {
      this.fail(error);
    }
  }
  variantAttributes(attributes: Record<string, unknown>) {
    return Object.entries(attributes || {})
      .map(
        ([key, value]) =>
          `${key}: ${typeof value === 'object' ? JSON.stringify(value) : typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value)}`,
      )
      .join(' · ');
  }
  addLink() {
    this.attempted.set('link');
    void submit(this.linkFields, async () => {
      const product = this.selectedProduct();
      if (!product) return;
      await this.action(async () => {
        await this.api.post('/admin/matches', {
          item_id: this.linkModel().item_id,
          source_product_id: product.id,
        });
        this.selectedProduct.set(undefined);
      }, 'Vínculo confirmado.');
    });
  }
  reviewLink(match: Match, status: string) {
    void this.action(
      () =>
        this.api.patch('/admin/matches', {
          item_id: match.item_id,
          source_product_id: match.source_product_id,
          review_status: status,
        }),
      'Estado del vínculo actualizado.',
    );
  }
  removeLink(match: Match) {
    if (window.confirm('¿Eliminar este vínculo con el producto?'))
      void this.action(
        () =>
          this.api.delete('/admin/matches', {
            item_id: match.item_id,
            source_product_id: match.source_product_id,
          }),
        'Vínculo eliminado.',
      );
  }
  chooseReport(report: Report) {
    this.selectedReport.set(report);
    this.decisionModel.set({ note: '', action: 'dismiss' });
    this.evidenceLimit.set(50);
  }
  decide() {
    this.attempted.set('decision');
    void submit(this.decisionFields, async () => {
      const report = this.selectedReport();
      if (!report) return;
      const input = this.decisionModel();
      if (
        input.action === 'remove' &&
        !window.confirm(
          report.comment_id
            ? '¿Eliminar permanentemente el comentario reportado?'
            : '¿Eliminar la lista reportada, sus versiones y archivos sin otras referencias?',
        )
      )
        return;
      await this.action(async () => {
        await this.api.post('/admin/reports/' + report.id, input);
        this.selectedReport.set(undefined);
      }, 'Decisión registrada.');
    });
  }
  newTemplate() {
    this.attempted.set('');
    this.templateEditing.set(true);
    this.templateModel.set({ id: '', name: '', grade: '', instructions: '', items: [newItem()] });
    this.templateNoteIds.set([this.templateModel().items[0].id]);
  }
  editTemplate(template: Template) {
    this.templateEditing.set(true);
    this.templateModel.set({
      id: template.id,
      name: template.name,
      grade: template.grade,
      instructions: template.content.instructions,
      items: structuredClone(template.content.items),
    });
    this.templateNoteIds.set(template.content.items.slice(0, 1).map((item) => item.id));
  }
  addTemplateItem() {
    this.templateModel.update((v) => ({ ...v, items: [...v.items, newItem()] }));
  }
  removeTemplateItem(index: number) {
    this.templateModel.update((v) => ({ ...v, items: v.items.filter((_, i) => i !== index) }));
  }
  templateNoteOpen(index: number) {
    return this.templateNoteIds().includes(this.templateModel().items[index].id);
  }
  toggleTemplateNote(index: number) {
    const id = this.templateModel().items[index].id;
    this.templateNoteIds.update((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
  }
  categoryTypes(category: Category | undefined) {
    return category?.attributes.find((a) => a.key === category.type_attribute)?.options || [];
  }
  editType(value: string) {
    this.typeModel.set({ previous: value, value });
    requestAnimationFrame(() => document.getElementById('taxonomy-type-name')?.focus());
  }
  saveType() {
    const category = this.configuredCategory();
    if (!category) return;
    this.attempted.set('type');
    void submit(this.typeFields, async () => {
      const { previous, value } = this.typeModel();
      await this.action(
        async () => {
          await this.api.post(`/admin/categories/${category.id}/types`, {
            action: previous ? 'rename' : 'add',
            value: previous || value,
            new_value: previous ? value : undefined,
          });
          if (this.taxonomyModel().id !== category.id) return;
          if (previous)
            this.bindingModel.update((model) => ({
              attributes: model.attributes.map((row) => ({
                ...row,
                types: row.types.map((type) =>
                  type.value === previous ? { ...type, value: value.trim() } : type,
                ),
              })),
            }));
          if (this.typeModel().previous === previous && this.typeModel().value === value)
            this.typeModel.set({ previous: '', value: '' });
        },
        previous
          ? 'Tipo actualizado. Las listas publicadas conservan su contenido.'
          : 'Tipo agregado.',
      );
    });
  }
  removeType(value: string) {
    const category = this.configuredCategory();
    if (
      !category ||
      !window.confirm(`¿Quitar el tipo «${value}»? Los tipos usados por útiles deben conservarse.`)
    )
      return;
    void this.action(
      () => this.api.post(`/admin/categories/${category.id}/types`, { action: 'remove', value }),
      'Tipo eliminado.',
    );
  }
  private loadCategoryBindings(category: Category) {
    const options = this.categoryTypes(category);
    this.bindingModel.set({
      attributes: category.attributes
        .filter((a) => a.key !== category.type_attribute)
        .map((a) => ({
          key: a.key,
          options: a.options.join('\n'),
          all_types: !a.applies_to_types.length,
          types: options.map((value) => ({ value, selected: a.applies_to_types.includes(value) })),
        })),
    });
  }
  addBinding() {
    const index = this.bindingModel().attributes.length;
    this.bindingModel.update((model) => ({
      attributes: [
        ...model.attributes,
        {
          key: '',
          options: '',
          all_types: true,
          types: this.typeOptions().map((value) => ({ value, selected: false })),
        },
      ],
    }));
    requestAnimationFrame(() => document.getElementById('binding-key-' + index)?.focus());
  }
  removeBinding(index: number) {
    this.bindingModel.update((model) => ({
      attributes: model.attributes.filter((_, i) => i !== index),
    }));
    requestAnimationFrame(() => {
      const target = this.bindingModel().attributes.length
        ? document.getElementById(
            'binding-key-' + Math.min(index, this.bindingModel().attributes.length - 1),
          )
        : document.getElementById('add-category-binding');
      target?.focus();
    });
  }
  bindingKeyChanged(index: number) {
    this.bindingModel.update((model) => ({
      attributes: model.attributes.map((row, i) => (i === index ? { ...row, options: '' } : row)),
    }));
  }
  bindingDefinition(key: string) {
    return this.attributeDefinitions().find((a) => a.key === key);
  }
  resetBindings() {
    const category = this.configuredCategory();
    if (category) this.loadCategoryBindings(category);
  }
  saveBindings() {
    const category = this.configuredCategory();
    if (!category) return;
    this.attempted.set('bindings');
    void submit(this.bindingFields, async () => {
      await this.action(async () => {
        const type = category.attributes.find((a) => a.key === category.type_attribute);
        const attributes: Pick<
          CategoryAttribute,
          'key' | 'options' | 'applies_to_types' | 'sort_order'
        >[] = type
          ? [
              {
                key: type.key,
                options: type.options,
                applies_to_types: [],
                sort_order: 0,
              },
            ]
          : [];
        const seen = new Set(attributes.map((a) => a.key));
        for (const [index, row] of this.bindingModel().attributes.entries()) {
          if (seen.has(row.key)) throw new Error('Cada característica debe aparecer una sola vez.');
          seen.add(row.key);
          const types = row.all_types
            ? []
            : row.types.filter((t) => t.selected).map((t) => t.value);
          if (!row.all_types && !types.length)
            throw new Error('Selecciona los tipos a los que se aplica cada característica.');
          attributes.push({
            key: row.key,
            options:
              this.bindingDefinition(row.key)?.data_type === 'text'
                ? row.options
                    .split('\n')
                    .map((v) => v.trim())
                    .filter(Boolean)
                : [],
            applies_to_types: types,
            sort_order: (index + 1) * 10,
          });
        }
        await this.api.patch(`/admin/categories/${category.id}/attributes`, { attributes });
      }, 'Características de la categoría guardadas.');
    });
  }
  attributeRows(item: CatalogItem) {
    return Object.entries(item.attributes || {}).map(([key, attribute]) => {
      if (typeof attribute === 'object' && attribute !== null && 'value' in attribute) {
        const value = attribute as { name?: string; value: unknown; unit?: string };
        return {
          name: value.name || key,
          value: this.attributeValue(value.value) + (value.unit ? ' ' + value.unit : ''),
        };
      }
      return { name: key, value: this.attributeValue(attribute) };
    });
  }
  variantRows(attributes: Record<string, unknown>) {
    return Object.entries(attributes || {}).map(([name, value]) => ({
      name,
      value: this.attributeValue(value),
    }));
  }
  private attributeValue(value: unknown): string {
    return typeof value === 'boolean'
      ? value
        ? 'Sí'
        : 'No'
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  }
  importedPrice(value: number) {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(value);
  }
  decisionHint() {
    return (
      {
        hide: 'Ocultar mantiene el caso abierto.',
        dismiss: 'Descartar cierra el caso y elimina su copia de evidencia.',
        restore:
          'Restaurar cierra el caso. Otro reporte abierto puede mantener el contenido oculto.',
        remove:
          'Eliminar retira el contenido y sus copias de evidencia. Esta acción es permanente.',
      } as Record<string, string>
    )[this.decisionModel().action];
  }
  saveTemplate() {
    this.attempted.set('template');
    void submit(this.templateFields, async () => {
      const value = this.templateModel();
      if (!value.items.length) {
        this.error.set('Agrega al menos un artículo a la plantilla.');
        return;
      }
      const content = { ...emptyContent(), instructions: value.instructions, items: value.items };
      await this.action(async () => {
        await this.api.post('/admin/templates', {
          id: value.id || undefined,
          name: value.name,
          grade: value.grade,
          content,
        });
        this.templateModel.set({ id: '', name: '', grade: '', instructions: '', items: [] });
        this.templateEditing.set(false);
      }, 'Plantilla guardada.');
    });
  }
  removeTemplate(template: Template) {
    if (window.confirm('¿Retirar esta plantilla? Las listas ya creadas se conservarán.'))
      void this.action(
        () => this.api.delete('/admin/templates/' + template.id),
        'Plantilla retirada.',
      );
  }
  saveSchool() {
    this.attempted.set('school');
    void submit(this.schoolFields, async () => {
      await this.action(async () => {
        await this.api.post('/admin/schools', this.schoolModel());
        this.schoolModel.set({ canonical_name: '', alias: '', comuna: '', region: '' });
      }, 'Nombre de colegio asociado.');
    });
  }
  removeSchool(school: School) {
    if (window.confirm('¿Eliminar esta asociación de nombres?'))
      void this.action(
        () => this.api.delete('/admin/schools/' + school.id),
        'Asociación eliminada.',
      );
  }
  createAccount() {
    this.attempted.set('account');
    void submit(this.accountFields, async () => {
      await this.action(async () => {
        await this.api.post('/admin/accounts', this.accountModel());
        this.accountModel.set({ username: '', password: '' });
      }, 'Cuenta administrativa creada.');
    });
  }
}
