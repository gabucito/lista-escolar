import { Component, inject, signal, OnInit, afterNextRender, Injector } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, required, maxLength } from '@angular/forms/signals';
import { Api, ApiError } from '../../core/api';
import { Session } from '../../core/session';
import { User, PdfPreferences } from '../../core/models';
interface DeletionPreview {
  disposition_token: string;
  transfers: {
    id: string;
    list_id: string;
    status: 'pending' | 'accepted';
    direction: 'sent' | 'received';
    school: string;
    other_party: string;
    expired: boolean;
  }[];
  lists: {
    id: string;
    school: string;
    visibility: string;
    current_version: number;
    disposition: string;
  }[];
}
@Component({
  selector: 'app-account',
  imports: [RouterLink, FormField],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class Account implements OnInit {
  private api = inject(Api);
  readonly session = inject(Session);
  private router = inject(Router);
  private injector = inject(Injector);
  readonly busy = signal(false);
  readonly preview = signal<DeletionPreview | undefined>(undefined);
  readonly model = signal({ display_name: '', layout: 'columns', paper: 'LETTER', color: true });
  readonly fields = form(this.model, (path) => {
    required(path.display_name);
    maxLength(path.display_name, 80);
  });
  readonly deletion = signal({ password: '', confirm: false });
  readonly deletionFields = form(this.deletion);
  ngOnInit() {
    const user = this.session.user();
    if (user)
      this.model.set({
        display_name: user.display_name,
        layout: user.preferences.layout || 'columns',
        paper: user.preferences.paper || 'LETTER',
        color: user.preferences.color ?? true,
      });
  }
  cancelDeletion() {
    this.deletion.set({ password: '', confirm: false });
    this.preview.set(undefined);
    afterNextRender(() => document.getElementById('review-deletion-button')?.focus(), {
      injector: this.injector,
    });
  }
  async save() {
    this.busy.set(true);
    try {
      const m = this.model();
      const result = await this.api.patch<{ user: User }>('/auth/me', {
        display_name: m.display_name,
        preferences: { layout: m.layout, paper: m.paper, color: m.color } as PdfPreferences,
      });
      this.session.user.set(result.user);
      this.api.success('Cambios guardados.');
    } catch (error) {
      this.api.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
  async reviewDeletion() {
    this.busy.set(true);
    try {
      this.preview.set(await this.api.get<DeletionPreview>('/auth/deletion-preview'));
      this.deletion.set({ password: '', confirm: false });
      afterNextRender(
        () => {
          const heading = document.getElementById('deletion-review-title');
          heading?.focus({ preventScroll: true });
          document
            .getElementById('deletion-review')
            ?.scrollIntoView({ block: 'start', behavior: 'instant' });
        },
        { injector: this.injector },
      );
    } catch (error) {
      this.api.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
  disposition(value: string) {
    return (
      (
        {
          archive: 'Se conserva como archivo sin propietario',
          archive_public: 'Se conserva como archivo sin propietario',
          delete: 'Se elimina',
          retain: 'Se conserva con su nuevo propietario',
        } as Record<string, string>
      )[value] || value
    );
  }
  async remove() {
    const preview = this.preview();
    if (!preview || !this.deletion().confirm) return;
    this.busy.set(true);
    try {
      await this.api.delete('/auth/me', {
        ...this.deletion(),
        disposition_token: preview.disposition_token,
      });
      this.session.user.set(undefined);
      this.api.clearContent();
      await this.router.navigate(['/']);
      this.api.success('Tu cuenta fue eliminada.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        this.preview.set(undefined);
        this.deletion.set({ password: '', confirm: false });
      }
      this.api.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
}
