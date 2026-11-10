import { Component, inject, input, signal, effect, untracked, OnDestroy } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Modal } from '../modal';
import { Pdf } from '../../core/pdf';
import { Api } from '../../core/api';
import { Session } from '../../core/session';
import { PdfPreferences, User } from '../../core/models';
@Component({
  selector: 'app-pdf-options',
  imports: [FormField, Modal],
  template: `<div class="pdf-options">
      <div class="pdf-layouts" role="group" aria-label="Diseño del PDF">
        @for (layout of layouts; track layout.value) {
          <button
            type="button"
            class="pdf-choice"
            [class.selected]="model().layout === layout.value"
            [attr.aria-pressed]="model().layout === layout.value"
            (click)="choose(layout.value)"
          >
            <svg viewBox="0 0 60 58" aria-hidden="true">
              <rect x="8" y="2" width="44" height="53" fill="#fff" stroke="#96aa96" />
              <path [attr.d]="layout.path" stroke="#719178" stroke-width="4" fill="none" /></svg
            >{{ layout.name }}
          </button>
        }
      </div>
      <div class="fields">
        <label
          >Papel<select [formField]="fields.paper">
            <option value="LETTER">Carta</option>
            <option value="A4">A4</option>
          </select></label
        ><label class="check"><input type="checkbox" [formField]="fields.color" />En color</label>
      </div>
      <small>El PDF tiene casillas vacías para marcar en papel.</small>
      <div class="actions">
        <button class="btn secondary small" [disabled]="busy()" (click)="generate(true)">
          Vista previa</button
        ><button class="btn small" [disabled]="busy()" (click)="generate(false)">
          {{ busy() ? 'Preparando…' : '↓ Descargar PDF' }}
        </button>
      </div>
      @if (session.user()) {
        <button class="text-button" (click)="savePreferences()">Guardar estas preferencias</button>
      }
    </div>
    @if (previewUrl()) {
      <div class="modal-backdrop">
        <section
          class="modal"
          appModal
          (dismissed)="close()"
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa del PDF"
        >
          <div class="modal-head">
            <h2>Tu PDF</h2>
            <button class="modal-close" aria-label="Cerrar vista previa" (click)="close()">
              ×
            </button>
          </div>
          @if (api.error()) {
            <p class="notice error" role="alert">{{ api.error() }}</p>
          }
          <iframe
            title="Vista previa del PDF"
            [src]="previewUrl()"
            style="width:100%;height:70vh;border:0"
          ></iframe>
          <p>
            <a [href]="rawUrl()" target="_blank" rel="noopener">Abrir PDF en una nueva pestaña</a>
          </p>
        </section>
      </div>
    }`,
})
export class PdfOptions implements OnDestroy {
  readonly listId = input.required<string>();
  readonly version = input(0);
  readonly draft = input(false);
  readonly beforeGenerate = input<(() => Promise<void>) | undefined>(undefined);
  readonly session = inject(Session);
  readonly api = inject(Api);
  private pdf = inject(Pdf);
  private sanitizer = inject(DomSanitizer);
  readonly busy = signal(false);
  readonly previewUrl = signal<SafeResourceUrl | undefined>(undefined);
  readonly rawUrl = signal('');
  readonly model = signal<PdfPreferences>({ layout: 'columns', paper: 'LETTER', color: true });
  readonly fields = form(this.model);
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
  async generate(preview: boolean) {
    this.api.clear();
    this.busy.set(true);
    try {
      await this.beforeGenerate()?.();
      const url = await this.pdf.generate(
        this.listId(),
        this.version(),
        this.model(),
        preview,
        this.draft(),
      );
      if (preview) {
        this.close();
        this.rawUrl.set(url);
        this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
      }
    } catch (error) {
      this.api.fail(error);
    } finally {
      this.busy.set(false);
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
  close() {
    if (this.rawUrl()) URL.revokeObjectURL(this.rawUrl());
    this.rawUrl.set('');
    this.previewUrl.set(undefined);
  }
  ngOnDestroy() {
    this.close();
  }
}
