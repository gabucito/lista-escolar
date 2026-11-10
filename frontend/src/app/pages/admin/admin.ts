import { Component, computed, inject, signal } from '@angular/core';
import {
  FormField,
  applyEach,
  disabled,
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
  Content,
  Item,
  Template,
  UNITS,
  emptyContent,
  newItem,
  dateLabel,
} from '../../core/models';

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
    subcategory_id: '',
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
  readonly reviewSubcategories = computed(
    () =>
      this.categories().find((c) => String(c.id) === this.reviewModel().category_id)
        ?.subcategories || [],
  );
  readonly taxonomyModel = signal({ kind: 'category', id: 0, name: '', slug: '', category_id: '' });
  readonly taxonomyFields = form(this.taxonomyModel, (p) => {
    required(p.name);
    required(p.slug);
    disabled(p.kind, ({ valueOf }) => valueOf(p.id) !== 0);
  });
  readonly productSearchModel = signal({ q: '' });
  readonly productSearchFields = form(this.productSearchModel);
  readonly linkModel = signal({ item_id: '' });
  readonly linkFields = form(this.linkModel, (p) => required(p.item_id));
  readonly decisionModel = signal({ note: '', action: 'dismiss' });
  readonly decisionFields = form(this.decisionModel, (p) => required(p.note));
  readonly templateEditing = signal(false);
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
      case 'taxonomy':
        this.categories.set(await this.api.get<Category[]>('/catalog/categories'));
        break;
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
          return `${v.name || key}: ${String(v.value)}${v.unit ? ' ' + v.unit : ''}`;
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
      subcategory_id: String(item.subcategory_id || ''),
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
    this.itemEditing.set(true);
    this.selectedItem.set(undefined);
    this.reviewModel.set({
      name: '',
      target_id: '',
      category_id: '',
      subcategory_id: '',
      aliases: '',
      attributes: [],
    });
  }
  closeSupply() {
    this.itemEditing.set(false);
    this.selectedItem.set(undefined);
  }
  changeReviewCategory(category_id: string) {
    this.reviewModel.update((v) => ({ ...v, category_id, subcategory_id: '' }));
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
    return this.attributeDefinitions().find((a) => a.key === key);
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
      subcategory_id: value.subcategory_id ? Number(value.subcategory_id) : null,
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
    this.taxonomyModel.set({
      kind: 'category',
      id: category.id,
      name: category.name,
      slug: category.slug,
      category_id: '',
    });
  }
  editSubcategory(parent: Category, sub: Category['subcategories'][number]) {
    this.taxonomyModel.set({
      kind: 'subcategory',
      id: sub.id,
      name: sub.name,
      slug: sub.slug,
      category_id: String(parent.id),
    });
  }
  clearTaxonomy() {
    this.taxonomyModel.set({ kind: 'category', id: 0, name: '', slug: '', category_id: '' });
  }
  saveTaxonomy() {
    void submit(this.taxonomyFields, async () => {
      const value = this.taxonomyModel();
      if (value.kind === 'subcategory' && !value.category_id) {
        this.error.set('Selecciona la categoría principal.');
        return;
      }
      const route = '/admin/' + (value.kind === 'category' ? 'categories' : 'subcategories');
      await this.action(async () => {
        const body = {
          name: value.name,
          slug: value.slug,
          category_id: value.category_id ? Number(value.category_id) : undefined,
        };
        if (value.id) await this.api.patch(route + '/' + value.id, body);
        else await this.api.post(route, body);
        this.clearTaxonomy();
      }, 'Categoría guardada.');
    });
  }
  removeTaxonomy(kind: 'categories' | 'subcategories', id: number) {
    if (
      window.confirm('¿Eliminar esta categoría? Solo se permite si no tiene artículos asociados.')
    )
      void this.action(() => this.api.delete('/admin/' + kind + '/' + id), 'Categoría eliminada.');
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
    this.templateEditing.set(true);
    this.templateModel.set({ id: '', name: '', grade: '', instructions: '', items: [newItem()] });
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
  }
  addTemplateItem() {
    this.templateModel.update((v) => ({ ...v, items: [...v.items, newItem()] }));
  }
  removeTemplateItem(index: number) {
    this.templateModel.update((v) => ({ ...v, items: v.items.filter((_, i) => i !== index) }));
  }
  saveTemplate() {
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
    void submit(this.accountFields, async () => {
      await this.action(async () => {
        await this.api.post('/admin/accounts', this.accountModel());
        this.accountModel.set({ username: '', password: '' });
      }, 'Cuenta administrativa creada.');
    });
  }
}
