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
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { form, FormField, disabled } from '@angular/forms/signals';
import { Api, ApiError } from '../../core/api';
import {
  CatalogItem,
  CatalogFacet,
  CatalogBrowseResult,
  CatalogAttributeValue,
  CategoryAttribute,
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
import {
  applicableCategoryAttributes,
  categoryInputAttributes,
} from '../../core/catalog-attributes';
import { CategoryIcon } from '../../shared/category-icon';
import {
  comparisonColumns,
  comparisonLabel,
  comparisonValue,
  comparisonSummary,
} from './catalog-comparison';
import { Modal } from '../../shared/modal';
import { PdfOptions } from '../../shared/pdf-options/pdf-options';
import { quantityIssue, steppedQuantity } from './editor-workspace';
import { AlternativeSelectionBar } from './alternative-selection-bar/alternative-selection-bar';
import { ItemOptionsEditor, OptionsReview } from './item-options-editor/item-options-editor';
import {
  AlternativeSelection,
  MAX_ALTERNATIVES,
  alternativeKey,
  alternativeRequirement,
  beginAlternatives,
  catalogChoice,
} from './item-alternatives';
import {
  attributeChoice,
  browseQuery,
  catalogAttributeSummary,
  compatibleAttributes,
  selectedAttributes,
} from './catalog-filters';
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
  source_name: string;
  duplicate: boolean;
}
@Component({
  selector: 'app-editor',
  imports: [
    RouterLink,
    FormField,
    PdfOptions,
    Modal,
    NgTemplateOutlet,
    CategoryIcon,
    AlternativeSelectionBar,
    ItemOptionsEditor,
  ],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class Editor implements OnInit, OnDestroy {
  readonly api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private mobileQuery = window.matchMedia('(max-width: 720px)');
  readonly mobile = signal(this.mobileQuery.matches);
  readonly pdfOptions = viewChild(PdfOptions);
  private updateMobile = () => {
    this.mobile.set(this.mobileQuery.matches);
    if (!this.mobile() && this.panel() === 'picker') this.panel.set(null);
  };
  readonly accessLost = signal(false);
  readonly id = signal('');
  readonly draft = signal<Draft | undefined>(undefined);
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly saveState = signal('Guardado');
  readonly conflict = signal(false);
  readonly latest = signal<Draft | undefined>(undefined);
  readonly readOnly = computed(() => this.draft()?.archived ?? false);
  readonly editingBlocked = computed(
    () => this.readOnly() || this.busy() || !!this.importPreview(),
  );
  readonly panel = signal<
    'metadata' | 'custom' | 'upload' | 'import' | 'picker' | 'alternatives' | null
  >(null);
  readonly alternativeSelection = signal<AlternativeSelection | undefined>(undefined);
  readonly maxAlternatives = MAX_ALTERNATIVES;
  readonly metadata = signal<Content>(emptyContent());
  readonly metadataFields = form(this.metadata, (path) =>
    disabled(path, () => this.readOnly() || this.metadataBusy()),
  );
  readonly metadataBusy = signal(false);
  readonly customBusy = signal(false);
  readonly lastAdded = signal<{ id: string; name: string; catalogId: string } | undefined>(
    undefined,
  );
  readonly quantityIssue = quantityIssue;
  private returnToPicker = false;
  private pickerScroll = 0;
  private sidenavScroll = 0;
  private pickerFocus = 'catalog-search';
  private filtersScroll = 0;
  private filterStartQuery = '';
  private metadataSnapshot = '';
  readonly model = signal<Content>(emptyContent());
  readonly fields = form(this.model, (p) =>
    disabled(
      p,
      () =>
        this.readOnly() || this.busy() || !!this.importPreview() || !!this.alternativeSelection(),
    ),
  );
  readonly units = UNITS;
  readonly catalog = signal<CatalogItem[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly attributes = attributeSummary;
  readonly catalogAttributes = catalogAttributeSummary;
  readonly localities = LOCALITIES;
  readonly regions = [...new Set(LOCALITIES.map((l) => l.region))];
  readonly search = signal({ q: '', category: '' });
  readonly visibleCatalog = this.catalog;
  readonly catalogTotal = signal(0);
  readonly catalogCountLabel = computed(
    () => `${this.catalogTotal()} ${this.catalogTotal() === 1 ? 'útil' : 'útiles'}`,
  );
  readonly catalogFacets = signal<CatalogFacet[]>([]);
  readonly facetSelection = signal({ values: {} as Record<string, string> });
  readonly facetFields = form(this.facetSelection);
  readonly filtersOpen = signal(true);
  readonly categoryChooserOpen = signal(true);
  readonly categorySearch = signal({ q: '' });
  readonly categorySearchFields = form(this.categorySearch);
  readonly matchingCategories = computed(() => {
    const query = normalized(this.categorySearch().q);
    return this.categories().filter((category) => normalized(category.name).includes(query));
  });
  readonly selectedCategory = computed(() =>
    this.categories().find((category) => category.slug === this.search().category),
  );
  readonly visibleCatalogFacets = computed(() => {
    const category = this.selectedCategory();
    if (!category) return [];
    const keys = new Set(
      applicableCategoryAttributes(category, selectedAttributes(this.facetSelection().values)).map(
        (attribute) => attribute.key,
      ),
    );
    return this.catalogFacets().filter((facet) => keys.has(facet.key));
  });
  readonly comparisonColumns = computed(() =>
    comparisonColumns(this.selectedCategory(), selectedAttributes(this.facetSelection().values)),
  );
  readonly comparisonLabel = comparisonLabel;
  readonly comparisonValue = comparisonValue;
  readonly comparisonSummary = comparisonSummary;
  categorySlug(name: string): string {
    return this.categories().find((category) => category.name === name)?.slug || 'otros';
  }
  readonly catalogError = signal('');
  readonly catalogQuery = computed(() => browseQuery(this.search(), this.facetSelection().values));
  readonly activeAttributes = computed(() =>
    Object.entries(selectedAttributes(this.facetSelection().values)).map(([key, value]) => {
      const facet = this.catalogFacets().find((facet) => facet.key === key);
      return {
        key,
        name: facet?.name || key.replaceAll('_', ' '),
        label: attributeChoice(value, facet?.unit || null),
      };
    }),
  );
  readonly hasCatalogFilters = computed(
    () => !!this.search().q || !!this.search().category || this.activeAttributes().length > 0,
  );
  readonly catalogScope = computed(() => this.selectedCategory()?.name || 'Todo el catálogo');
  readonly attributeChoice = attributeChoice;
  readonly encodeChoice = (value: CatalogAttributeValue) => JSON.stringify(value);
  readonly searchFields = form(this.search);
  readonly catalogBusy = signal(true);
  readonly custom = signal({
    name: '',
    quantity: '1',
    unit: 'unidad',
    note: '',
    category_id: '',
    share: false,
  });
  readonly customFields = form(this.custom, (path) =>
    disabled(path, () => this.readOnly() || this.customBusy()),
  );
  readonly customCategory = computed(() =>
    this.categories().find((c) => String(c.id) === this.custom().category_id),
  );
  readonly customAttributes = signal({
    rows: [] as (CategoryAttribute & { text: string })[],
  });
  readonly visibleCustomAttributeKeys = computed(() => {
    const values = Object.fromEntries(
      this.customAttributes()
        .rows.filter((row) => row.text)
        .map((row) => [row.key, row.text]),
    );
    return new Set(categoryInputAttributes(this.customCategory(), values).map((a) => a.key));
  });
  readonly attributeFields = form(this.customAttributes, (path) =>
    disabled(path, () => this.readOnly() || this.customBusy()),
  );
  readonly importFile = signal<File | undefined>(undefined);
  readonly uploadOptions = signal({ encoding: 'utf-8', delimiter: '' });
  readonly uploadFields = form(this.uploadOptions, (path) =>
    disabled(path, () => this.importing()),
  );
  readonly importCatalog = signal<CatalogItem[]>([]);
  readonly importFilter = signal({ value: 'all' });
  readonly importFilterFields = form(this.importFilter);
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
  readonly filteredImportRows = computed(() =>
    this.importModel().items.flatMap((row, index) => {
      const filter = this.importFilter().value;
      return filter === 'all' ||
        (filter === 'pending' && row.include && !row.reviewed) ||
        (filter === 'invalid' && row.include && !!this.importIssue(row)) ||
        (filter === 'duplicate' && row.duplicate)
        ? [index]
        : [];
    }),
  );
  readonly importPageCount = computed(() =>
    Math.max(1, Math.ceil(this.filteredImportRows().length / this.importPageSize)),
  );
  readonly importPageRows = computed(() => {
    const start = this.importPage() * this.importPageSize;
    return this.filteredImportRows().slice(start, start + this.importPageSize);
  });
  readonly invalidImportCount = computed(
    () => this.importModel().items.filter((row) => row.include && !!this.importIssue(row)).length,
  );
  readonly duplicateImportCount = computed(
    () => this.importModel().items.filter((row) => row.include && row.duplicate).length,
  );
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
    if (this.dirty() || this.alternativeSelection()) {
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
      const query = this.catalogQuery();
      if (this.catalogTimer) clearTimeout(this.catalogTimer);
      ++this.loadSequence;
      this.catalogBusy.set(true);
      this.catalogError.set('');
      this.catalog.set([]);
      this.catalogTotal.set(0);
      this.catalogTimer = setTimeout(() => void this.findCatalog(query), 250);
    });
    effect(() => {
      const lastPage = this.importPageCount() - 1;
      if (this.importPage() > lastPage) this.importPage.set(lastPage);
    });
  }
  openPanel(panel: 'metadata' | 'custom' | 'upload') {
    if (this.alternativeSelection()) return;
    this.api.clear();
    this.returnToPicker = this.panel() === 'picker';
    if (this.returnToPicker) this.rememberPicker();
    if (panel === 'metadata') {
      this.metadata.set(structuredClone(this.model()));
      this.metadataSnapshot = JSON.stringify(this.metadata());
    }
    this.panel.set(panel);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLInputElement>('.editor-dialog input:not([type="checkbox"])')
        ?.focus(),
    );
  }
  openPicker() {
    this.api.clear();
    this.returnToPicker = false;
    this.panel.set('picker');
    this.restorePicker();
  }
  private rememberPicker() {
    const results = document.getElementById('catalog-results');
    if (results) this.pickerScroll = results.scrollTop;
    const sidenav = document.querySelector('.catalog-sidenav .attribute-panel-body');
    if (sidenav) this.sidenavScroll = sidenav.scrollTop;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest('.catalog-pane') && active.id)
      this.pickerFocus = active.id;
  }
  rememberCatalogFocus(event: FocusEvent) {
    if (this.panel() !== 'picker') return;
    const target = event.target;
    if (target instanceof HTMLElement && target.id) this.pickerFocus = target.id;
  }
  private restorePicker() {
    requestAnimationFrame(() => {
      const results = document.getElementById('catalog-results');
      if (results) results.scrollTop = this.pickerScroll;
      const sidenav = document.querySelector('.catalog-sidenav .attribute-panel-body');
      if (sidenav) sidenav.scrollTop = this.sidenavScroll;
      (
        document.getElementById(this.pickerFocus) ||
        document.getElementById(
          this.filtersOpen()
            ? this.categoryChooserOpen()
              ? 'category-chooser-heading'
              : 'catalog-filter-heading'
            : 'catalog-search',
        )
      )?.focus({ preventScroll: true });
    });
  }
  async closePanel() {
    if (this.importing() || this.customBusy() || this.metadataBusy()) return;
    if (this.panel() === 'alternatives') {
      this.cancelAlternatives();
      return;
    }
    if (this.panel() === 'import') {
      await this.cancelImport();
      return;
    }
    if (this.panel() === 'picker') this.rememberPicker();
    this.api.clear();
    if (this.returnToPicker && this.mobile()) {
      this.returnToPicker = false;
      this.panel.set('picker');
      this.restorePicker();
    } else this.panel.set(null);
  }
  async saveMetadata() {
    this.api.clear();
    const metadata = this.metadata();
    if (!metadata.school.trim() || !metadata.class_name.trim()) {
      this.api.fail(new Error('Completa el colegio y el curso.'));
      return;
    }
    if (
      !Number.isInteger(metadata.school_year) ||
      metadata.school_year < 1900 ||
      metadata.school_year > 2200
    ) {
      this.api.fail(new Error('Escribe un año escolar entre 1900 y 2200.'));
      return;
    }
    this.metadataBusy.set(true);
    try {
      this.model.update((current) => ({
        ...metadata,
        school: metadata.school.trim(),
        class_name: metadata.class_name.trim(),
        items: current.items,
      }));
      await this.save();
      this.metadataSnapshot = JSON.stringify(this.metadata());
      this.panel.set(null);
    } catch (error) {
      this.api.fail(error);
      if (this.conflict()) this.panel.set(null);
    } finally {
      this.metadataBusy.set(false);
    }
  }
  async previewPdf() {
    this.panel.set(null);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await this.pdfOptions()?.generate(true);
  }
  async ngOnInit() {
    this.mobileQuery.addEventListener('change', this.updateMobile);
    window.addEventListener('beforeunload', this.beforeUnload);
    try {
      const categories = await this.api.get<Category[]>('/catalog/categories');
      this.categories.set(categories);
      if (categories.length) {
        this.custom.update((m) => ({ ...m, category_id: String(categories[0].id) }));
        this.categoryChanged();
      }
      const id = this.route.snapshot.paramMap.get('id');
      if (!id) {
        const created = await this.api.post<{ id: string }>('/lists', {});
        await this.router.navigate(['/editar', created.id], { replaceUrl: true });
        return;
      }
      this.id.set(id);
      await this.reload();
      if (!this.model().school || !this.model().class_name) this.openPanel('metadata');
    } catch (error) {
      this.api.fail(error);
    }
  }
  localityChanged() {
    const region = localityRegion(this.metadata().comuna);
    if (region) this.metadata.update((m) => ({ ...m, region }));
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
    this.panel.set(null);
    this.alternativeSelection.set(undefined);
    this.metadata.set(emptyContent());
    this.custom.set({
      name: '',
      quantity: '1',
      unit: 'unidad',
      note: '',
      category_id: '',
      share: false,
    });
    this.customAttributes.set({ rows: [] });
    this.importCatalog.set([]);
    this.lastAdded.set(undefined);
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
    this.alternativeSelection.set(undefined);
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
      (!this.dirty() &&
        !this.alternativeSelection() &&
        !(
          this.panel() === 'metadata' && JSON.stringify(this.metadata()) !== this.metadataSnapshot
        )) ||
      confirm('Hay cambios sin guardar. ¿Salir de esta página y descartarlos?')
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
  async findCatalog(query = this.catalogQuery(), append = false) {
    const sequence = ++this.loadSequence;
    this.catalogBusy.set(true);
    this.catalogError.set('');
    const offset = append ? this.catalog().length : 0;
    try {
      const result = await this.api.get<CatalogBrowseResult>(
        '/catalog/browse?' + query + '&offset=' + offset + '&limit=40',
      );
      if (sequence === this.loadSequence) {
        this.catalog.update((existing) =>
          append
            ? [
                ...existing,
                ...result.items.filter((item) => !existing.some((row) => row.id === item.id)),
              ]
            : result.items,
        );
        this.catalogTotal.set(result.total);
        const values = { ...this.facetSelection().values };
        for (const facet of result.facets) values[facet.key] ??= '';
        this.facetSelection.set({ values });
        this.catalogFacets.set(result.facets);
      }
    } catch (error) {
      if (sequence === this.loadSequence)
        this.catalogError.set(
          error instanceof Error ? error.message : 'No pudimos cargar el catálogo.',
        );
    } finally {
      if (sequence === this.loadSequence) this.catalogBusy.set(false);
    }
  }
  async loadMoreCatalog() {
    if (this.catalogBusy() || this.catalog().length >= this.catalogTotal()) return;
    const offset = this.catalog().length;
    const trigger = document.getElementById('catalog-load-more');
    let retainFocus = document.activeElement === trigger;
    const focusMoved = (event: FocusEvent) => {
      if (event.target !== trigger) retainFocus = false;
    };
    document.addEventListener('focusin', focusMoved);
    await this.findCatalog(this.catalogQuery(), true);
    requestAnimationFrame(() => {
      document.removeEventListener('focusin', focusMoved);
      if (!retainFocus) return;
      const next = this.catalog()[offset];
      const target =
        document.getElementById('catalog-load-more') ||
        (next && document.getElementById('add-' + next.id));
      target?.focus({ preventScroll: true });
    });
  }
  chooseCatalogCategory(slug: string) {
    if (slug !== this.search().category) {
      this.search.update((search) => ({ ...search, category: slug }));
      this.facetSelection.set({ values: {} });
      this.catalogFacets.set([]);
    }
    this.categoryChooserOpen.set(!slug);
    this.filtersOpen.set(true);
    if (!slug && this.mobile()) this.showCatalogResults();
    else
      requestAnimationFrame(() => {
        document
          .getElementById(slug ? 'catalog-filter-heading' : 'category-chooser-heading')
          ?.focus({ preventScroll: true });
      });
  }
  openCategoryChooser() {
    const viewport = this.catalogViewport();
    if (!this.filtersOpen()) {
      if (this.mobile()) this.rememberPicker();
      this.filtersScroll = viewport.scroll;
      this.filterStartQuery = viewport.query;
    }
    this.categorySearch.set({ q: '' });
    this.categoryChooserOpen.set(true);
    this.filtersOpen.set(true);
    requestAnimationFrame(() => {
      if (!this.mobile()) this.restoreCatalogViewport(viewport);
      document.getElementById('category-chooser-heading')?.focus({ preventScroll: true });
    });
  }
  catalogAttributeChanged(key: string, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.facetSelection.update((selection) => ({
      values: compatibleAttributes({ ...selection.values, [key]: value }, this.selectedCategory()),
    }));
  }
  facetChoiceUnavailable(facet: CatalogFacet, value: CatalogAttributeValue, count: number) {
    const values = this.facetSelection().values;
    if (count > 0 || values[facet.key] === this.encodeChoice(value)) return false;
    if (facet.key !== this.selectedCategory()?.type_attribute) return true;
    const next = { ...values, [facet.key]: this.encodeChoice(value) };
    const compatible = compatibleAttributes(next, this.selectedCategory());
    // A type change can remove the incompatible constraint responsible for zero matches.
    return !Object.keys(selectedAttributes(next)).some((key) => !(key in compatible));
  }
  clearCatalogFilters() {
    this.search.set({ q: '', category: '' });
    this.facetSelection.set({ values: {} });
    this.catalogFacets.set([]);
    this.categoryChooserOpen.set(true);
  }
  clearAttributeFilters() {
    this.facetSelection.update((selection) => ({
      values: Object.fromEntries(Object.keys(selection.values).map((key) => [key, ''])),
    }));
  }
  removeAttributeFilter(key: string) {
    this.facetSelection.update((selection) => ({ values: { ...selection.values, [key]: '' } }));
  }
  private catalogViewport() {
    const results = document.getElementById('catalog-results');
    const top = results?.getBoundingClientRect().top || 0;
    const row = results
      ? Array.from(results.querySelectorAll<HTMLElement>('.catalog-result')).find(
          (element) => element.getBoundingClientRect().bottom > top + 1,
        )
      : undefined;
    return {
      id: row?.querySelector('button')?.id,
      offset: row ? row.getBoundingClientRect().top - top : 0,
      scroll: results?.scrollTop || 0,
      query: this.catalogQuery(),
    };
  }
  private restoreCatalogViewport(viewport: ReturnType<Editor['catalogViewport']>) {
    if (viewport.query !== this.catalogQuery()) return;
    const results = document.getElementById('catalog-results');
    if (!results) return;
    const row = viewport.id
      ? document.getElementById(viewport.id)?.closest('.catalog-result')
      : undefined;
    if (row)
      results.scrollTop +=
        row.getBoundingClientRect().top - results.getBoundingClientRect().top - viewport.offset;
    else results.scrollTop = viewport.scroll;
  }
  showCatalogFilters() {
    const viewport = this.catalogViewport();
    if (this.mobile()) this.rememberPicker();
    this.filtersScroll = document.getElementById('catalog-results')?.scrollTop || 0;
    this.filterStartQuery = this.catalogQuery();
    this.categoryChooserOpen.set(!this.selectedCategory());
    this.filtersOpen.set(true);
    requestAnimationFrame(() => {
      if (!this.mobile()) this.restoreCatalogViewport(viewport);
      document
        .getElementById(
          this.categoryChooserOpen() ? 'category-chooser-heading' : 'catalog-filter-heading',
        )
        ?.focus({ preventScroll: true });
    });
  }
  showCatalogResults() {
    const viewport = this.catalogViewport();
    this.filtersOpen.set(false);
    requestAnimationFrame(() => {
      const results = document.getElementById('catalog-results');
      if (!this.mobile()) this.restoreCatalogViewport(viewport);
      else if (results)
        results.scrollTop = this.filterStartQuery === this.catalogQuery() ? this.filtersScroll : 0;
      document.getElementById('catalog-filter-toggle')?.focus({ preventScroll: true });
    });
  }
  catalogKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.filtersOpen()) {
      event.preventDefault();
      event.stopPropagation();
      this.showCatalogResults();
    }
  }
  add(item: CatalogItem) {
    if (this.editingBlocked() || this.catalogBusy()) return;
    if (this.alternativeSelection()) {
      this.toggleAlternative(item);
      return;
    }
    const added = {
      ...newItem(item.name, item.category),
      catalog_id: item.id,
      attributes: structuredClone(item.attributes),
    };
    this.model.update((m) => ({
      ...m,
      items: [...m.items, added],
    }));
    this.lastAdded.set({ id: added.id, name: added.name, catalogId: item.id });
  }
  startAlternatives(item?: Item) {
    if (this.editingBlocked() || this.alternativeSelection()) return;
    this.api.clear();
    this.alternativeSelection.set({
      ...beginAlternatives(item),
      category: item?.category || this.selectedCategory()?.name,
    });
    this.lastAdded.set(undefined);
    if (item) this.chooseCatalogCategory(this.categorySlug(item.category));
    if (this.mobile()) this.openPicker();
  }
  alternativeSelected(item: CatalogItem): boolean {
    const key = alternativeKey({
      catalog_id: item.id,
      name: item.name,
      attributes: item.attributes,
    });
    return (
      this.alternativeSelection()?.options.some((option) => alternativeKey(option) === key) ?? false
    );
  }
  toggleAlternative(item: CatalogItem) {
    if (this.editingBlocked()) return;
    this.api.clear();
    const choice = catalogChoice(item),
      key = alternativeKey(choice);
    this.alternativeSelection.update((selection) => {
      if (!selection) return selection;
      const exists = selection.options.some((option) => alternativeKey(option) === key);
      if (!exists && selection.options.length >= MAX_ALTERNATIVES) return selection;
      return {
        ...selection,
        options: exists
          ? selection.options.filter((option) => alternativeKey(option) !== key)
          : [...selection.options, choice],
      };
    });
  }
  removeAlternative(index: number) {
    if (this.editingBlocked()) return;
    this.alternativeSelection.update((selection) =>
      selection
        ? { ...selection, options: selection.options.filter((_, i) => i !== index) }
        : selection,
    );
  }
  reviewAlternatives() {
    if (this.editingBlocked() || !this.alternativeSelection()) return;
    if (this.panel() === 'picker') this.rememberPicker();
    this.returnToPicker = false;
    this.panel.set('alternatives');
  }
  backToAlternatives(review: OptionsReview) {
    this.alternativeSelection.set({ ...review.selection, details: review.details });
    this.panel.set(this.mobile() ? 'picker' : null);
    this.restorePicker();
  }
  cancelAlternatives() {
    this.alternativeSelection.set(undefined);
    this.api.clear();
    if (this.panel() === 'alternatives') this.panel.set(this.mobile() ? 'picker' : null);
    requestAnimationFrame(() => document.getElementById('start-item-alternatives')?.focus());
  }
  saveAlternatives(review: OptionsReview) {
    if (this.editingBlocked() || !this.alternativeSelection()) return;
    const original = review.selection.original;
    if (original && !this.model().items.some((item) => item.id === original.id)) {
      this.api.fail(
        new Error('El útil original ya no está en el borrador. Cancela y revisa la lista.'),
      );
      return;
    }
    const item = alternativeRequirement(review.selection, review.details);
    this.model.update((model) => ({
      ...model,
      items: original
        ? model.items.map((existing) => (existing.id === original.id ? item : existing))
        : [...model.items, item],
    }));
    this.alternativeSelection.set(undefined);
    this.panel.set(null);
    this.lastAdded.set(original ? undefined : { id: item.id, name: item.name, catalogId: '' });
    this.api.clear();
    requestAnimationFrame(() => document.getElementById('item-options-' + item.id)?.focus());
  }
  undoAdd() {
    const added = this.lastAdded();
    if (!added || this.editingBlocked()) return;
    this.model.update((model) => ({
      ...model,
      items: model.items.filter((item) => item.id !== added.id),
    }));
    this.lastAdded.set(undefined);
  }
  stepQuantity(index: number, delta: number) {
    if (this.editingBlocked() || this.alternativeSelection()) return;
    this.model.update((model) => ({
      ...model,
      items: model.items.map((item, i) =>
        i === index
          ? { ...item, quantity: steppedQuantity(item.quantity, item.unit, delta) }
          : item,
      ),
    }));
  }
  categoryChanged() {
    this.customAttributes.set({
      rows: categoryInputAttributes(this.customCategory(), {}).map((a) => ({
        ...a,
        text: '',
      })),
    });
  }
  customAttributeChanged(key: string, event: Event) {
    const text = (event.target as HTMLInputElement).value;
    const category = this.customCategory();
    this.customAttributes.update((model) => {
      const rows = model.rows.map((row) => (row.key === key ? { ...row, text } : row));
      const values = Object.fromEntries(
        rows.filter((row) => row.text).map((row) => [row.key, row.text]),
      );
      const keys = new Set(applicableCategoryAttributes(category, values).map((a) => a.key));
      return { rows: rows.map((row) => (keys.has(row.key) ? row : { ...row, text: '' })) };
    });
  }
  customAttributeValues() {
    const values: Record<string, unknown> = {};
    for (const row of this.customAttributes().rows) {
      if (!row.text.trim() || !this.visibleCustomAttributeKeys().has(row.key)) continue;
      const value =
        row.data_type === 'boolean'
          ? row.text === 'true'
          : row.data_type === 'number'
            ? Number(row.text.replace(',', '.'))
            : row.text.trim();
      if (row.data_type === 'number' && (!Number.isFinite(value) || Number(value) <= 0))
        throw new Error('El atributo ' + row.name + ' debe ser un número positivo.');
      values[row.key] = { name: row.name, unit: row.unit, data_type: row.data_type, value };
    }
    return values;
  }
  async addCustom() {
    if (this.editingBlocked() || this.customBusy()) return;
    this.api.clear();
    const value = this.custom();
    if (!value.name.trim()) {
      this.api.fail(new Error('Escribe el nombre del útil.'));
      return;
    }
    const issue = quantityIssue(value.quantity, value.unit);
    if (issue) {
      this.api.fail(new Error(issue));
      return;
    }
    if (value.share && !value.category_id) {
      this.api.fail(new Error('Elige una categoría para compartir el útil.'));
      return;
    }
    const category = this.categories().find((c) => String(c.id) === value.category_id);
    let catalog_id = '';
    this.customBusy.set(true);
    try {
      const attributes = this.customAttributeValues();
      if (value.share) {
        const created = await this.api.post<{ id: string }>('/catalog', {
          name: value.name.trim(),
          category_id: Number(value.category_id),
          attributes,
        });
        catalog_id = created.id;
      }
      const added = {
        ...newItem(value.name.trim(), category?.name || 'Otros'),
        quantity: value.quantity.trim().replace(',', '.'),
        unit: value.unit,
        note: value.note,
        catalog_id,
        attributes,
      };
      this.model.update((m) => ({ ...m, items: [...m.items, added] }));
      this.lastAdded.set({ id: added.id, name: added.name, catalogId: catalog_id });
      this.custom.update((m) => ({ ...m, name: '', quantity: '1', note: '', share: false }));
      this.customAttributes.update((model) => ({
        rows: model.rows.map((row) => ({ ...row, text: '' })),
      }));
      this.customBusy.set(false);
      await this.closePanel();
    } catch (error) {
      this.api.fail(error);
    } finally {
      this.customBusy.set(false);
    }
  }
  remove(index: number) {
    if (this.editingBlocked() || this.alternativeSelection()) return;
    if (this.model().items[index]?.id === this.lastAdded()?.id) this.lastAdded.set(undefined);
    this.model.update((m) => ({ ...m, items: m.items.filter((_, i) => i !== index) }));
  }
  move(index: number, delta: number) {
    if (this.editingBlocked() || this.alternativeSelection()) return;
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
      this.metadata.update((m) => ({ ...m, logo_id: result.id }));
    } catch (error) {
      this.api.fail(error);
    }
  }
  removeLogo() {
    this.metadata.update((m) => ({ ...m, logo_id: '' }));
  }
  async publish() {
    if (this.alternativeSelection()) {
      this.api.fail(new Error('Guarda o cancela las opciones antes de publicar.'));
      return;
    }
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
      this.panel.set('import');
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
      // Manual overrides must include supplies beyond the legacy array route's cap.
      const options = new Map<string, CatalogItem>();
      let offset = 0;
      while (true) {
        const page = await this.api.get<CatalogBrowseResult>(
          `/catalog/browse?limit=100&offset=${offset}`,
        );
        for (const item of page.items) options.set(item.id, item);
        offset += page.items.length;
        if (!page.items.length || offset >= page.total) break;
      }
      for (const row of matchResult.rows)
        for (const candidate of row.candidates) options.set(candidate.id, candidate);
      this.importCatalog.set([...options.values()]);
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
          source_name: name,
          duplicate,
        };
      });
      this.importModel.set({ items: rows });
      this.importPage.set(0);
      this.importFilter.set({ value: 'all' });
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
        match = this.importCatalog().find((c) => c.id === row.catalog_id);
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
    document.getElementById('import-rows')?.scrollTo({ top: 0, behavior: 'instant' });
  }
  importIssue(row: ImportRow) {
    if (!row.name.trim()) return 'Falta el nombre.';
    if (!row.category.trim()) return 'Falta la categoría.';
    if (row.share_with_catalog && !row.category_id) return 'Elige una categoría del catálogo.';
    return quantityIssue(row.quantity, row.unit);
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
    const invalid = this.importModel().items.findIndex(
      (row) => row.include && !!this.importIssue(row),
    );
    if (invalid !== -1) {
      this.importFilter.set({ value: 'all' });
      this.setImportPage(Math.floor(invalid / this.importPageSize));
      this.api.fail(
        new Error(
          `Fila ${this.importModel().items[invalid].source_row}: ${this.importIssue(this.importModel().items[invalid])}`,
        ),
      );
      return;
    }
    const unreviewed = this.importModel().items.findIndex((row) => row.include && !row.reviewed);
    if (unreviewed !== -1) {
      this.importFilter.set({ value: 'all' });
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
      this.panel.set(null);
      this.returnToPicker = false;
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
    this.panel.set(null);
    this.returnToPicker = false;
  }
  ngOnDestroy() {
    ++this.loadSequence;
    this.mobileQuery.removeEventListener('change', this.updateMobile);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    if (this.catalogTimer) clearTimeout(this.catalogTimer);
    window.removeEventListener('beforeunload', this.beforeUnload);
  }
}
