import {
  Component,
  computed,
  effect,
  inject,
  viewChild,
  OnInit,
  OnDestroy,
  signal,
} from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { form, FormField, disabled } from '@angular/forms/signals';
import { Api, ApiError } from '../../core/api';
import {
  CatalogItem,
  Category,
  Content,
  Draft,
  Item,
  UNITS,
  emptyContent,
  newItem,
  normalized,
  attributeSummary,
} from '../../core/models';
import { LOCALITIES, localityRegion } from '../../core/localities';
import { spreadsheetRows } from '../../core/import-rows';
import { Modal } from '../../shared/modal';
import { PdfOptions } from '../../shared/pdf-options/pdf-options';
interface ImportPreview {
  id: string;
  revision: number;
  sheets: { name: string; rows: string[][] }[];
}
interface ImportRow extends Item {
  include: boolean;
  reviewed: boolean;
  share_with_catalog: boolean;
  category_id: string;
  source_row: number;
  duplicate: boolean;
}
@Component({
  selector: 'app-editor',
  imports: [RouterLink, FormField, PdfOptions, Modal],
  templateUrl: './editor.html',
})
export class Editor implements OnInit, OnDestroy {
  readonly api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private mobileQuery = window.matchMedia('(max-width: 720px)');
  readonly mobile = signal(this.mobileQuery.matches);
  readonly pdfOptions = viewChild(PdfOptions);
  private updateMobile = () => this.mobile.set(this.mobileQuery.matches);
  readonly accessLost = signal(false);
  readonly id = signal('');
  readonly draft = signal<Draft | undefined>(undefined);
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly saveState = signal('Guardado');
  readonly conflict = signal(false);
  readonly latest = signal<Draft | undefined>(undefined);
  readonly readOnly = computed(() => this.draft()?.archived ?? false);
  readonly model = signal<Content>(emptyContent());
  readonly fields = form(this.model, (p) =>
    disabled(p, () => this.readOnly() || this.busy() || !!this.importPreview()),
  );
  readonly units = UNITS;
  readonly catalog = signal<CatalogItem[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly attributes = attributeSummary;
  readonly localities = LOCALITIES;
  readonly regions = [...new Set(LOCALITIES.map((l) => l.region))];
  readonly search = signal({ q: '', category: '', subcategory: '' });
  readonly visibleCatalog = computed(() =>
    this.catalog().filter(
      (item) => !this.search().subcategory || item.subcategory === this.search().subcategory,
    ),
  );
  readonly browseSubcategories = computed(
    () => this.categories().find((c) => c.slug === this.search().category)?.subcategories || [],
  );
  readonly searchFields = form(this.search);
  readonly catalogBusy = signal(true);
  readonly custom = signal({
    name: '',
    quantity: '1',
    unit: 'unidad',
    note: '',
    category_id: '',
    subcategory_id: '',
    share: false,
  });
  readonly customFields = form(this.custom);
  readonly customSubcategories = computed(
    () =>
      this.categories().find((c) => String(c.id) === this.custom().category_id)?.subcategories ||
      [],
  );
  readonly customAttributes = signal({
    rows: [] as {
      key: string;
      name: string;
      data_type: string;
      unit: string;
      text: string;
      checked: boolean;
      include: boolean;
    }[],
  });
  readonly attributeFields = form(this.customAttributes);
  readonly importFile = signal<File | undefined>(undefined);
  readonly uploadOptions = signal({ encoding: 'utf-8', delimiter: '' });
  readonly uploadFields = form(this.uploadOptions);
  readonly importPreview = signal<ImportPreview | undefined>(undefined);
  readonly importing = signal(false);
  readonly mapped = signal(false);
  readonly mapping = signal({
    sheet: '0',
    name: '0',
    quantity: '1',
    unit: '-1',
    note: '-1',
    header: true,
  });
  readonly mappingFields = form(this.mapping, (path) => disabled(path, () => this.importing()));
  readonly importModel = signal({ items: [] as ImportRow[] });
  readonly importFields = form(this.importModel, (path) => disabled(path, () => this.importing()));
  readonly importColumns = computed(() => {
    const preview = this.importPreview(),
      mapping = this.mapping();
    const rows = preview?.sheets[Number(mapping.sheet)]?.rows || [];
    const width = Math.max(0, ...rows.slice(0, 20).map((r) => r.length));
    return Array.from({ length: width }, (_, i) => ({
      index: String(i),
      label: `${i + 1}: ${rows[0]?.[i]?.slice(0, 45) || 'Sin título'}`,
    }));
  });
  readonly includedCount = computed(() => this.importModel().items.filter((i) => i.include).length);
  readonly importPage = signal(0);
  readonly importPageSize = 25;
  readonly importPageCount = computed(() =>
    Math.max(1, Math.ceil(this.importModel().items.length / this.importPageSize)),
  );
  readonly importPageRows = computed(() => {
    const start = this.importPage() * this.importPageSize;
    const length = Math.max(
      0,
      Math.min(this.importPageSize, this.importModel().items.length - start),
    );
    return Array.from({ length }, (_, index) => start + index);
  });
  readonly reviewedCount = computed(
    () => this.importModel().items.filter((row) => row.include && row.reviewed).length,
  );
  private saved = '';
  private pending: Promise<void> | undefined;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private catalogTimer: ReturnType<typeof setTimeout> | undefined;
  private revision = 0;
  private loadSequence = 0;
  private publishRequest:
    { revision: number; current_version: number; request_id: string } | undefined;
  readonly saveBeforePdf = () => this.save();
  private beforeUnload = (event: BeforeUnloadEvent) => {
    if (this.dirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  constructor() {
    let resetVersion = this.api.contentReset();
    effect(() => {
      const current = this.api.contentReset();
      if (current !== resetVersion) {
        resetVersion = current;
        this.clearExposed();
      }
    });
    effect(() => {
      const denial = this.api.denial(),
        id = this.id();
      if (
        denial &&
        id &&
        (denial.path.startsWith('/lists/' + id) ||
          denial.path === '/assets/' + this.model().logo_id)
      )
        void this.recheckAccess();
    });
    effect(() => {
      const content = this.model(),
        ready = this.ready(),
        conflict = this.conflict();
      if (this.saveTimer) clearTimeout(this.saveTimer);
      if (ready && !conflict && !this.readOnly() && JSON.stringify(content) !== this.saved) {
        this.saveState.set('Cambios sin guardar');
        this.saveTimer = setTimeout(() => void this.save().catch(() => {}), 800);
      }
    });
    effect(() => {
      const q = this.search().q,
        category = this.search().category;
      if (this.catalogTimer) clearTimeout(this.catalogTimer);
      this.catalogTimer = setTimeout(() => void this.findCatalog(q, category), 250);
    });
  }
  jumpTo(id: string) {
    const section = document.getElementById(id);
    const details = section?.querySelector('details');
    if (details) details.open = true;
    section?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
    section?.focus({ preventScroll: true });
  }
  async previewPdf() {
    const details = document.querySelector<HTMLDetailsElement>('#editor-pdf details');
    if (details) details.open = true;
    await this.pdfOptions()?.generate(true);
  }
  async ngOnInit() {
    this.mobileQuery.addEventListener('change', this.updateMobile);
    window.addEventListener('beforeunload', this.beforeUnload);
    try {
      const categories = await this.api.get<Category[]>('/catalog/categories');
      this.categories.set(categories);
      if (categories.length)
        this.custom.update((m) => ({ ...m, category_id: String(categories[0].id) }));
      const id = this.route.snapshot.paramMap.get('id');
      if (!id) {
        const created = await this.api.post<{ id: string }>('/lists', {});
        await this.router.navigate(['/editar', created.id], { replaceUrl: true });
        return;
      }
      this.id.set(id);
      await this.reload();
    } catch (error) {
      this.api.fail(error);
    }
  }
  localityChanged() {
    const region = localityRegion(this.model().comuna);
    if (region) this.model.update((m) => ({ ...m, region }));
  }
  clearExposed() {
    this.ready.set(false);
    this.accessLost.set(true);
    this.model.set(emptyContent());
    this.draft.set(undefined);
    this.latest.set(undefined);
    this.importPreview.set(undefined);
    this.importModel.set({ items: [] });
    this.importPage.set(0);
    this.saved = '';
  }
  async recheckAccess() {
    try {
      await this.api.get('/lists/' + this.id() + '/draft', false);
    } catch (error) {
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        this.clearExposed();
      }
    }
  }
  async reload() {
    this.ready.set(false);
    const draft = await this.api.get<Draft>(`/lists/${this.id()}/draft`);
    this.draft.set(draft);
    this.model.set(draft.content);
    this.revision = draft.revision;
    this.saved = JSON.stringify(draft.content);
    this.conflict.set(false);
    this.latest.set(undefined);
    this.saveState.set(draft.archived ? 'Archivada · solo lectura' : 'Guardado');
    this.ready.set(true);
  }
  dirty() {
    return this.ready() && JSON.stringify(this.model()) !== this.saved;
  }
  canLeave() {
    return (
      !this.dirty() || confirm('Hay cambios sin guardar. ¿Salir de esta página y descartarlos?')
    );
  }
  async saveManually() {
    try {
      await this.save();
    } catch (error) {
      this.api.fail(error);
    }
  }
  async save(): Promise<void> {
    if (this.pending) {
      await this.pending;
      if (this.dirty()) return this.save();
      return;
    }
    if (!this.ready() || this.readOnly() || !this.dirty()) return;
    if (this.conflict()) throw new Error('Resuelve el conflicto antes de continuar.');
    const content = structuredClone(this.model());
    content.items = content.items.map((i) => ({
      ...i,
      quantity: String(i.quantity).replace(',', '.'),
    }));
    const snapshot = JSON.stringify(this.model());
    this.saveState.set('Guardando…');
    this.pending = (async () => {
      try {
        const result = await this.api.put<{ revision: number }>(`/lists/${this.id()}/draft`, {
          content,
          revision: this.revision,
        });
        this.revision = result.revision;
        this.saved = snapshot;
        this.saveState.set('Guardado');
        this.draft.update((d) => (d ? { ...d, revision: result.revision } : d));
      } catch (error) {
        this.saveState.set('No se guardó');
        if (error instanceof ApiError && error.status === 409) {
          this.conflict.set(true);
          this.latest.set(
            await this.api.get<Draft>(`/lists/${this.id()}/draft`).catch(() => undefined),
          );
        } else this.api.fail(error);
        throw error;
      }
    })();
    try {
      await this.pending;
    } finally {
      this.pending = undefined;
    }
  }
  async resolve(useServer: boolean) {
    try {
      if (useServer) {
        if (
          !confirm(
            'Se cargarán los cambios del servidor y se descartarán los de este editor. ¿Continuar?',
          )
        )
          return;
        await this.reload();
      } else {
        const latest = await this.api.get<Draft>(`/lists/${this.id()}/draft`);
        this.revision = latest.revision;
        this.draft.set(latest);
        this.saved = JSON.stringify(latest.content);
        this.conflict.set(false);
        this.latest.set(undefined);
        await this.save();
      }
    } catch (error) {
      this.api.fail(error);
    }
  }
  async findCatalog(q: string, category = '') {
    const sequence = ++this.loadSequence;
    this.catalogBusy.set(true);
    try {
      const items = await this.api.get<CatalogItem[]>(
        '/catalog?q=' + encodeURIComponent(q) + '&category=' + encodeURIComponent(category),
      );
      if (sequence === this.loadSequence) this.catalog.set(items);
    } catch (error) {
      this.api.fail(error);
    } finally {
      if (sequence === this.loadSequence) this.catalogBusy.set(false);
    }
  }
  add(item: CatalogItem) {
    if (this.readOnly()) return;
    this.model.update((m) => ({
      ...m,
      items: [
        ...m.items,
        { ...newItem(item.name, item.category), catalog_id: item.id, attributes: item.attributes },
      ],
    }));
  }
  categoryChanged() {
    this.custom.update((m) => ({ ...m, subcategory_id: '' }));
    this.customAttributes.set({ rows: [] });
  }
  subcategoryChanged() {
    const subcategory = this.customSubcategories().find(
      (s) => String(s.id) === this.custom().subcategory_id,
    );
    this.customAttributes.set({
      rows: (subcategory?.attributes || []).map((a) => ({
        ...a,
        unit: a.unit || '',
        text: '',
        checked: false,
        include: false,
      })),
    });
  }
  customAttributeValues() {
    const values: Record<string, unknown> = {};
    for (const row of this.customAttributes().rows) {
      if (!row.include) continue;
      const value =
        row.data_type === 'boolean'
          ? row.checked
          : row.data_type === 'number'
            ? Number(row.text.replace(',', '.'))
            : row.text.trim();
      if (row.data_type !== 'boolean' && !row.text.trim())
        throw new Error('Completa el atributo ' + row.name + '.');
      if (row.data_type === 'number' && (!Number.isFinite(value) || Number(value) <= 0))
        throw new Error('El atributo ' + row.name + ' debe ser un número positivo.');
      values[row.key] = { name: row.name, unit: row.unit, value };
    }
    return values;
  }
  async addCustom() {
    const value = this.custom();
    if (!value.name.trim()) {
      this.api.fail(new Error('Escribe el nombre del útil.'));
      return;
    }
    const category = this.categories().find((c) => String(c.id) === value.category_id);
    let catalog_id = '';
    try {
      const attributes = this.customAttributeValues();
      if (value.share) {
        const created = await this.api.post<{ id: string }>('/catalog', {
          name: value.name.trim(),
          category_id: Number(value.category_id),
          subcategory_id: value.subcategory_id ? Number(value.subcategory_id) : undefined,
          attributes,
        });
        catalog_id = created.id;
      }
      this.model.update((m) => ({
        ...m,
        items: [
          ...m.items,
          {
            ...newItem(value.name.trim(), category?.name || 'Otros'),
            quantity: value.quantity,
            unit: value.unit,
            note: value.note,
            catalog_id,
            attributes,
          },
        ],
      }));
      this.custom.update((m) => ({ ...m, name: '', quantity: '1', note: '', share: false }));
    } catch (error) {
      this.api.fail(error);
    }
  }
  remove(index: number) {
    this.model.update((m) => ({ ...m, items: m.items.filter((_, i) => i !== index) }));
  }
  move(index: number, delta: number) {
    this.model.update((m) => {
      const items = [...m.items],
        target = index + delta;
      if (target < 0 || target >= items.length) return m;
      [items[index], items[target]] = [items[target], items[index]];
      return { ...m, items };
    });
  }
  async uploadLogo(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await this.api.post<{ id: string }>('/assets', form);
      this.model.update((m) => ({ ...m, logo_id: result.id }));
    } catch (error) {
      this.api.fail(error);
    }
  }
  removeLogo() {
    this.model.update((m) => ({ ...m, logo_id: '' }));
  }
  async publish() {
    this.busy.set(true);
    try {
      await this.save();
      const current = this.draft()?.current_version || 0;
      if (
        !this.publishRequest ||
        this.publishRequest.revision !== this.revision ||
        this.publishRequest.current_version !== current
      )
        this.publishRequest = {
          revision: this.revision,
          current_version: current,
          request_id: crypto.randomUUID(),
        };
      const result = await this.api.post<{ version: number }>(
        `/lists/${this.id()}/publish`,
        this.publishRequest,
      );
      this.publishRequest = undefined;
      await this.reload();
      await this.router.navigate(['/listas', this.id()]);
      this.api.success(`Versión ${result.version} publicada.`);
    } catch (error) {
      this.api.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
  chooseFile(event: Event) {
    this.importFile.set((event.target as HTMLInputElement).files?.[0]);
  }
  async uploadImport() {
    this.api.clear();
    const file = this.importFile();
    if (!file) return;
    this.importing.set(true);
    try {
      await this.save();
      const form = new FormData();
      form.append('file', file);
      const options = this.uploadOptions();
      const query = new URLSearchParams();
      if (options.encoding !== 'utf-8') query.set('encoding', options.encoding);
      if (options.delimiter) query.set('delimiter', options.delimiter);
      this.importPreview.set(
        await this.api.post<ImportPreview>(`/lists/${this.id()}/imports?${query}`, form),
      );
      this.mapped.set(false);
      this.mapping.set({
        sheet: '0',
        name: '0',
        quantity: '1',
        unit: '-1',
        note: '-1',
        header: true,
      });
    } catch (error) {
      this.api.fail(error);
    } finally {
      this.importing.set(false);
    }
  }
  async mapImport() {
    this.api.clear();
    const preview = this.importPreview();
    if (!preview) return;
    this.importing.set(true);
    try {
      const mapping = this.mapping(),
        sheet = preview.sheets[Number(mapping.sheet)];
      if (!sheet) throw new Error('Selecciona una hoja.');
      const sourceRows = spreadsheetRows(sheet.rows, mapping.header);
      const matchResult = await this.api.post<{
        rows: { name: string; candidates: CatalogItem[] }[];
      }>('/catalog/match', {
        names: sourceRows.map(({ cells }) => cells[Number(mapping.name)] || ''),
      });
      const allCatalog = await this.api.get<CatalogItem[]>('/catalog');
      const options = new Map(allCatalog.map((item) => [item.id, item]));
      for (const row of matchResult.rows)
        for (const candidate of row.candidates) options.set(candidate.id, candidate);
      this.catalog.set([...options.values()]);
      const seen = new Set<string>();
      const rows: ImportRow[] = sourceRows.map(({ cells, source_row }, index) => {
        const name = cells[Number(mapping.name)] || '',
          quantity = cells[Number(mapping.quantity)] || '',
          note = Number(mapping.note) >= 0 ? cells[Number(mapping.note)] || '' : '',
          unit = Number(mapping.unit) >= 0 ? cells[Number(mapping.unit)] || 'unidad' : 'unidad';
        const candidates = matchResult.rows[index]?.candidates || [];
        const match = candidates.length === 1 ? candidates[0] : undefined;
        const key = normalized(name) + '|' + unit + '|' + note;
        const duplicate = seen.has(key);
        seen.add(key);
        return {
          ...newItem(match?.name || name, match?.category || 'Otros'),
          quantity,
          unit,
          note,
          catalog_id: match?.id || '',
          attributes: match?.attributes || {},
          include: true,
          reviewed: false,
          share_with_catalog: false,
          category_id: String(this.categories()[0]?.id || ''),
          source_row,
          duplicate,
        };
      });
      this.importModel.set({ items: rows });
      this.importPage.set(0);
      this.mapped.set(true);
    } catch (error) {
      this.api.fail(error);
    } finally {
      this.importing.set(false);
    }
  }
  selectImportCatalog(index: number) {
    this.importModel.update((m) => {
      const items = [...m.items],
        row = { ...items[index] },
        match = this.catalog().find((c) => c.id === row.catalog_id);
      if (match) {
        row.name = match.name;
        row.category = match.category;
        row.attributes = match.attributes;
        row.share_with_catalog = false;
      }
      row.reviewed = false;
      items[index] = row;
      return { items };
    });
  }
  setImportPage(page: number) {
    this.importPage.set(Math.max(0, Math.min(page, this.importPageCount() - 1)));
    document
      .getElementById('import-title')
      ?.closest('.modal')
      ?.scrollTo({ top: 0, behavior: 'instant' });
  }
  unreviewImport(index: number) {
    if (!this.importModel().items[index].reviewed) return;
    this.importModel.update((model) => ({
      items: model.items.map((row, i) => (i === index ? { ...row, reviewed: false } : row)),
    }));
  }
  async confirmImport() {
    this.api.clear();
    const preview = this.importPreview();
    if (!preview) return;
    const rows = this.importModel().items.filter((i) => i.include);
    if (!rows.length) {
      this.api.fail(new Error('Incluye al menos una fila.'));
      return;
    }
    const unreviewed = this.importModel().items.findIndex((row) => row.include && !row.reviewed);
    if (unreviewed !== -1) {
      this.setImportPage(Math.floor(unreviewed / this.importPageSize));
      this.api.fail(new Error('Revisa y confirma cada fila incluida antes de importar.'));
      return;
    }
    this.importing.set(true);
    try {
      if (this.dirty())
        throw new Error(
          'El borrador cambió después de abrir la importación. Cancela y vuelve a cargar el archivo para revisarlo con los cambios actuales.',
        );
      const items = rows.map((row) => ({
        id: row.id,
        catalog_id: row.catalog_id,
        name: row.name,
        quantity: row.quantity.replace(',', '.'),
        unit: row.unit,
        category: row.category,
        note: row.note,
        attributes: row.attributes,
        share_with_catalog: row.share_with_catalog,
        category_id: row.share_with_catalog ? Number(row.category_id) : undefined,
      }));
      await this.api.post(`/lists/${this.id()}/imports/${preview.id}/confirm`, {
        revision: preview.revision,
        request_id: this.importRequestId(preview.id),
        items,
      });
      this.importPreview.set(undefined);
      this.importModel.set({ items: [] });
      this.importPage.set(0);
      await this.reload();
      this.api.success(`${items.length} útiles importados al borrador.`);
    } catch (error) {
      this.api.fail(error);
    } finally {
      this.importing.set(false);
    }
  }
  private importRequest: { preview: string; payload: string; id: string } | undefined;
  private importRequestId(preview: string) {
    const payload = JSON.stringify(this.importModel());
    if (
      !this.importRequest ||
      this.importRequest.preview !== preview ||
      this.importRequest.payload !== payload
    )
      this.importRequest = { preview, payload, id: crypto.randomUUID() };
    return this.importRequest.id;
  }
  async cancelImport() {
    if (this.importing()) return;
    const preview = this.importPreview();
    if (preview) {
      try {
        await this.api.delete(`/lists/${this.id()}/imports/${preview.id}`);
      } catch (error) {
        this.api.fail(error);
      }
    }
    this.importPreview.set(undefined);
    this.importModel.set({ items: [] });
    this.importPage.set(0);
  }
  ngOnDestroy() {
    this.mobileQuery.removeEventListener('change', this.updateMobile);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.catalogTimer) clearTimeout(this.catalogTimer);
    window.removeEventListener('beforeunload', this.beforeUnload);
  }
}
