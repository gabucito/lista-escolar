import {
  Component,
  computed,
  inject,
  input,
  signal,
  effect,
  untracked,
  OnDestroy,
} from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { PdfPreview } from '../pdf-preview/pdf-preview';
import { Modal } from '../modal';
import { Pdf } from '../../core/pdf';
import { Api } from '../../core/api';
import { Session } from '../../core/session';
import { PdfPreferences, User } from '../../core/models';

@Component({
  selector: 'app-pdf-options',
  imports: [FormField, Modal, PdfPreview],
  templateUrl: './pdf-options.html',
  styleUrl: './pdf-options.scss',
})
export class PdfOptions implements OnDestroy {
  readonly listId = input.required<string>();
  readonly version = input(0);
  readonly draft = input(false);
  readonly showLauncher = input(true);
  readonly beforeGenerate = input<(() => Promise<void>) | undefined>(undefined);
  readonly session = inject(Session);
  readonly api = inject(Api);
  private pdf = inject(Pdf);
  private generationSequence = 0;
  readonly opened = signal(false);
  readonly busy = signal(false);
  readonly rawUrl = signal('');
  readonly model = signal<PdfPreferences>({ layout: 'columns', paper: 'LETTER', color: true });
  readonly fields = form(this.model);
  readonly downloadOptions = signal({ remember: false });
  readonly downloadFields = form(this.downloadOptions);
  private renderedOptions = signal('');
  readonly previewChanged = computed(
    () => !!this.rawUrl() && this.renderedOptions() !== JSON.stringify(this.model()),
  );
  readonly layouts: { value: PdfPreferences['layout']; name: string; path: string }[] = [
    {
      value: 'columns',
      name: 'Dos columnas',
      path: 'M14 12h32M14 23h13m6 0h13M14 32h13m6 0h13M14 41h13m6 0h13',
    },
    {
      value: 'sidebar',
      name: 'Barra lateral',
      path: 'M16 8v40M25 14h20M25 24h20M25 34h20M25 44h20',
    },
    { value: 'cards', name: 'Fichas', path: 'M14 12h32M14 24h13m6 0h13M14 38h13m6 0h13' },
  ];
  constructor() {
    let resetVersion = this.api.contentReset();
    effect(() => {
      const current = this.api.contentReset();
      if (current !== resetVersion) {
        resetVersion = current;
        untracked(() => this.close());
      }
    });
    let denialSequence = this.api.denial()?.sequence;
    effect(() => {
      const denial = this.api.denial();
      if (
        denial &&
        denial.sequence !== denialSequence &&
        (denial.path.startsWith('/lists/' + this.listId()) || denial.path.startsWith('/assets/'))
      ) {
        denialSequence = denial.sequence;
        untracked(() => this.close());
      }
    });
    let previousTarget = '';
    effect(() => {
      const target = [this.listId(), this.version(), this.draft()].join(':');
      if (previousTarget && target !== previousTarget) untracked(() => this.close());
      previousTarget = target;
    });
    effect(() => {
      const prefs = this.session.user()?.preferences;
      if (prefs)
        this.model.set({
          layout: prefs.layout || 'columns',
          paper: prefs.paper || 'LETTER',
          color: prefs.color ?? true,
        });
    });
  }
  choose(layout: PdfPreferences['layout']) {
    this.model.update((m) => ({ ...m, layout }));
  }
  open() {
    return this.generate(true);
  }
  async generate(preview: boolean) {
    if (this.busy()) return;
    this.api.clear();
    if (preview) this.opened.set(true);
    this.busy.set(true);
    const sequence = ++this.generationSequence;
    const preferences = { ...this.model() };
    try {
      await this.beforeGenerate()?.();
      if (sequence !== this.generationSequence) return;
      const url = await this.pdf.generate(
        this.listId(),
        this.version(),
        preferences,
        preview,
        this.draft(),
      );
      if (sequence !== this.generationSequence) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (preview) {
        this.releasePreview();
        this.rawUrl.set(url);
        this.renderedOptions.set(JSON.stringify(preferences));
      } else if (this.downloadOptions().remember) {
        await this.savePreferences();
      }
    } catch (error) {
      if (sequence === this.generationSequence) this.api.fail(error);
    } finally {
      if (sequence === this.generationSequence) this.busy.set(false);
    }
  }
  async savePreferences() {
    const user = this.session.user();
    if (!user) return;
    try {
      const result = await this.api.patch<{ user: User }>('/auth/me', {
        display_name: user.display_name,
        preferences: this.model(),
      });
      this.session.user.set(result.user);
      this.api.success('Preferencias de PDF guardadas.');
    } catch (error) {
      this.api.fail(error);
    }
  }
  private releasePreview() {
    if (this.rawUrl()) URL.revokeObjectURL(this.rawUrl());
    this.rawUrl.set('');
  }
  close() {
    this.generationSequence++;
    this.opened.set(false);
    this.busy.set(false);
    this.releasePreview();
  }
  ngOnDestroy() {
    this.close();
  }
}
