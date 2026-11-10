import { Component, inject, signal, computed, effect, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { form, FormField } from '@angular/forms/signals';
import { Subscription, combineLatest } from 'rxjs';
import { Api, ApiError } from '../../core/api';
import { Session } from '../../core/session';
import { Comment, ListDetail, Progress, dateLabel, attributeSummary } from '../../core/models';
import { Modal } from '../../shared/modal';
import { PdfOptions } from '../../shared/pdf-options/pdf-options';
@Component({
  selector: 'app-list',
  imports: [RouterLink, FormField, PdfOptions, Modal],
  templateUrl: './list.html',
})
export class List implements OnInit, OnDestroy {
  readonly api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly session = inject(Session);
  readonly detail = signal<ListDetail | undefined>(undefined);
  readonly progress = signal<Progress | undefined>(undefined);
  readonly comments = signal<Comment[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly date = dateLabel;
  readonly attributes = attributeSummary;
  readonly versionModel = signal({ version: '' });
  readonly versionFields = form(this.versionModel);
  readonly commentModel = signal({ body: '' });
  readonly commentFields = form(this.commentModel);
  readonly reportModel = signal({ reason: '', kind: 'content' });
  readonly reportFields = form(this.reportModel);
  readonly reporting = signal(false);
  private reportComment = '';
  private routeChanges?: Subscription;
  private loadSequence = 0;
  readonly progressModel = signal({
    items: [] as { id: string; checked: boolean; review: boolean }[],
  });
  readonly progressFields = form(this.progressModel);
  readonly completed = computed(() => this.progressModel().items.filter((i) => i.checked).length);
  readonly groups = computed(() => {
    const groups = new Map<
      string,
      { item: ListDetail['content']['items'][number]; index: number }[]
    >();
    this.detail()?.content.items.forEach((item, index) => {
      const category = item.category || 'Otros materiales';
      groups.set(category, [...(groups.get(category) || []), { item, index }]);
    });
    return [...groups].map(([name, items]) => ({ name, items }));
  });
  constructor() {
    let resetVersion = this.api.contentReset();
    effect(() => {
      const current = this.api.contentReset();
      if (current !== resetVersion) {
        resetVersion = current;
        this.loadSequence++;
        this.detail.set(undefined);
        this.comments.set([]);
        this.progress.set(undefined);
        this.progressModel.set({ items: [] });
        this.reporting.set(false);
        this.loading.set(false);
      }
    });
    effect(() => {
      const denial = this.api.denial(),
        detail = this.detail();
      if (
        denial &&
        detail &&
        (denial.path.startsWith('/lists/' + detail.id) ||
          denial.path === '/assets/' + detail.content.logo_id ||
          this.comments().some((c) => denial.path === '/comments/' + c.id))
      )
        void this.recheckAccess(detail);
    });
  }
  private async recheckAccess(detail: ListDetail) {
    try {
      await this.api.get(`/lists/${detail.id}?version=${detail.version}`, false);
    } catch (error) {
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        this.loadSequence++;
        this.detail.set(undefined);
        this.comments.set([]);
        this.progress.set(undefined);
        this.progressModel.set({ items: [] });
        this.reporting.set(false);
        this.loading.set(false);
      }
    }
  }
  ngOnInit() {
    this.routeChanges = combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(
      () => void this.load(),
    );
  }
  ngOnDestroy() {
    this.routeChanges?.unsubscribe();
    this.loadSequence++;
  }
  async load() {
    const sequence = ++this.loadSequence;
    this.loading.set(true);
    this.detail.set(undefined);
    this.progressModel.set({ items: [] });
    try {
      await this.session.ready;
      const id = this.route.snapshot.paramMap.get('id') || '',
        version = this.route.snapshot.queryParamMap.get('version');
      const detail = await this.api.get<ListDetail>(
        `/lists/${id}${version ? '?version=' + encodeURIComponent(version) : ''}`,
      );
      const comments = await this.api.get<Comment[]>(
        `/lists/${id}/comments?version=${detail.version}`,
      );
      let progress: Progress | undefined;
      if (this.session.user())
        progress = await this.api.get<Progress>(`/lists/${id}/progress?version=${detail.version}`);
      if (sequence !== this.loadSequence) return;
      this.comments.set(comments);
      this.detail.set(detail);
      this.versionModel.set({ version: String(detail.version) });
      this.progress.set(progress);
      this.progressModel.set({
        items: detail.content.items.map((i) => ({
          id: i.id,
          checked: progress?.items[i.id]?.checked ?? false,
          review: progress?.items[i.id]?.review ?? false,
        })),
      });
      if (this.route.snapshot.queryParamMap.get('report') === 'privacy' && this.session.user()) {
        this.reportModel.set({ reason: '', kind: 'privacy' });
        this.reporting.set(true);
      }
    } catch (error) {
      this.api.fail(error);
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }
  showPdf() {
    const panel = document.getElementById('published-pdf');
    panel?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
    panel?.focus({ preventScroll: true });
  }
  changeVersion() {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { version: this.versionModel().version },
    });
  }
  private requireLogin() {
    if (this.session.user()) return true;
    void this.router.navigate(['/ingresar'], { queryParams: { next: this.router.url } });
    return false;
  }
  async toggleVote() {
    if (!this.requireLogin()) return;
    const d = this.detail();
    if (!d) return;
    try {
      const result = await this.api.post<{ votes: number; voted: boolean }>(`/lists/${d.id}/vote`, {
        version: d.version,
        voted: !d.voted,
      });
      this.detail.update((v) => (v ? { ...v, ...result } : v));
    } catch (error) {
      this.api.fail(error);
    }
  }
  async follow() {
    if (!this.requireLogin()) return;
    const d = this.detail();
    if (!d) return;
    try {
      const result = await this.api.post<{ following: boolean }>(`/lists/${d.id}/follow`, {
        following: !d.following,
      });
      this.detail.update((v) => (v ? { ...v, ...result } : v));
      this.api.success(
        result.following
          ? 'Lista guardada en tu seguimiento. El envío de correos está pendiente en esta versión local.'
          : 'Dejaste de seguir la lista.',
      );
    } catch (error) {
      this.api.fail(error);
    }
  }
  async mark(index: number, acknowledge = false) {
    const d = this.detail();
    if (!d || !this.session.user()) return;
    if (acknowledge)
      this.progressModel.update((m) => ({
        items: m.items.map((row, i) => (i === index ? { ...row, review: false } : row)),
      }));
    const row = { ...this.progressModel().items[index] };
    try {
      this.progress.set(
        await this.api.put<Progress>(`/lists/${d.id}/progress`, {
          version: d.version,
          item_id: row.id,
          checked: row.checked,
          review: row.review,
        }),
      );
    } catch (error) {
      this.api.fail(error);
      this.progressModel.update((m) => ({
        items: m.items.map((v, i) =>
          i === index
            ? {
                ...v,
                checked: this.progress()?.items[v.id]?.checked ?? false,
                review: this.progress()?.items[v.id]?.review ?? false,
              }
            : v,
        ),
      }));
    }
  }
  async copy() {
    if (!this.requireLogin()) return;
    const d = this.detail();
    if (!d) return;
    try {
      const result = await this.api.post<{ id: string }>(`/lists/${d.id}/copy`, {
        version: d.version,
      });
      await this.router.navigate(['/editar', result.id]);
    } catch (error) {
      this.api.fail(error);
    }
  }
  async addComment() {
    const d = this.detail();
    if (!d || !this.commentModel().body.trim()) return;
    this.busy.set(true);
    try {
      await this.api.post(`/lists/${d.id}/comments`, {
        version: d.version,
        body: this.commentModel().body,
      });
      this.commentModel.set({ body: '' });
      this.comments.set(
        await this.api.get<Comment[]>(`/lists/${d.id}/comments?version=${d.version}`),
      );
    } catch (error) {
      this.api.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
  async removeComment(id: string) {
    if (!confirm('¿Eliminar este comentario?')) return;
    try {
      await this.api.delete('/comments/' + id);
      const d = this.detail()!;
      this.comments.set(
        await this.api.get<Comment[]>(`/lists/${d.id}/comments?version=${d.version}`),
      );
    } catch (error) {
      this.api.fail(error);
    }
  }
  report(comment = '') {
    this.api.clear();
    if (!this.requireLogin()) return;
    this.reportComment = comment;
    this.reportModel.set({ reason: '', kind: 'content' });
    this.reporting.set(true);
  }
  async sendReport() {
    const d = this.detail();
    if (!d || !this.reportModel().reason.trim()) return;
    this.busy.set(true);
    try {
      await this.api.post(`/lists/${d.id}/reports`, {
        version: d.version,
        comment_id: this.reportComment || undefined,
        ...this.reportModel(),
      });
      this.reporting.set(false);
      this.api.success('Reporte enviado para revisión.');
    } catch (error) {
      this.api.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
  async shareLink() {
    try {
      await navigator.clipboard.writeText(location.origin + '/listas/' + this.detail()!.id);
      this.api.success('Enlace copiado.');
    } catch {
      this.api.fail(
        new Error(
          'No pudimos copiar automáticamente. Puedes copiar la dirección desde tu navegador.',
        ),
      );
    }
  }
}
