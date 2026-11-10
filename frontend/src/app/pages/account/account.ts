import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField } from '@angular/forms/signals';
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
  template: `<header class="page-head">
      <div>
        <p class="eyebrow">Mi espacio</p>
        <h1>Tu cuenta.</h1>
        <p>Elige cómo te ve la comunidad y cómo prefieres imprimir.</p>
      </div>
    </header>
    <div class="split">
      <section class="panel">
        <h2>Perfil y preferencias</h2>
        <form (submit)="save(); $event.preventDefault()">
          <div class="fields">
            <label>Nombre para mostrar<input [formField]="fields.display_name" /></label>
            <div class="field">
              Correo
              <p>{{ session.user()?.email }}</p>
            </div>
            <label
              >Diseño de PDF<select [formField]="fields.layout">
                <option value="columns">Dos columnas</option>
                <option value="sidebar">Barra lateral</option>
                <option value="cards">Fichas</option>
              </select></label
            ><label
              >Papel<select [formField]="fields.paper">
                <option value="LETTER">Carta</option>
                <option value="A4">A4</option>
              </select></label
            ><label class="check"
              ><input type="checkbox" [formField]="fields.color" />PDF en color por defecto</label
            >
          </div>
          <button class="btn spaced" [disabled]="busy()">Guardar cambios</button>
        </form>
      </section>
      <aside class="panel danger-zone">
        <h3>Eliminar mi cuenta</h3>
        <p class="muted">
          Antes de confirmar, revisa qué pasará con tus listas y transfiere las que quieras mantener
          en edición.
        </p>
        <button class="btn danger" [disabled]="busy()" (click)="reviewDeletion()">
          Revisar eliminación
        </button>
      </aside>
    </div>
    @if (preview(); as preview) {
      <section class="panel danger-zone">
        <h2>Revisa antes de eliminar</h2>
        <p>
          Se eliminarán tu cuenta, comentarios, votos, checklists personales y preferencias. Las
          listas públicas publicadas sin propietario quedarán archivadas y sin tu nombre. Las listas
          privadas y borradores que aún te pertenezcan se eliminarán.
        </p>
        <p>
          Quitar tu nombre no elimina automáticamente los datos personales escritos en una lista o
          en su logo. Puedes reportarlos antes de continuar.
        </p>
        @for (list of preview.lists; track list.id) {
          <div class="share-row">
            <div>
              <strong>{{ list.school || 'Borrador sin nombre' }}</strong
              ><small style="display:block"
                >{{ disposition(list.disposition) }} ·
                {{ list.visibility === 'private' ? 'Privada' : 'Pública' }}</small
              >
            </div>
            <div class="actions">
              <a class="btn secondary small" [routerLink]="['/listas', list.id, 'compartir']"
                >Transferir propiedad</a
              >
              @if (list.current_version && list.visibility === 'public') {
                <a
                  class="text-button"
                  [routerLink]="['/listas', list.id]"
                  [queryParams]="{ report: 'privacy' }"
                  >Reportar datos personales</a
                >
              }
            </div>
          </div>
        }
        @if (!preview.lists.length) {
          <p>No tienes listas propias pendientes de resolver.</p>
        }
        @if (preview.transfers?.length) {
          <h3 class="spaced">Transferencias de propiedad</h3>
          @for (transfer of preview.transfers; track transfer.id) {
            <div class="share-row">
              <div>
                <strong>{{ transfer.school || 'Lista escolar' }}</strong>
                <small style="display:block">
                  {{ transfer.direction === 'sent' ? 'Enviada a' : 'Recibida de' }}
                  {{ transfer.other_party || 'Usuario eliminado' }}
                </small>
                <p class="muted" style="margin: .4rem 0 0">
                  @if (transfer.status === 'accepted') {
                    @if (transfer.direction === 'sent') {
                      Aceptada: la lista permanece con su nuevo propietario. Eliminar tu cuenta no
                      la elimina.
                    } @else {
                      Aceptada: recibiste la propiedad. Si la lista todavía te pertenece, se aplica
                      el destino indicado arriba.
                    }
                  } @else if (transfer.expired) {
                    Oferta vencida: no cambió la propiedad y el registro se retirará al eliminar tu
                    cuenta.
                  } @else {
                    Oferta pendiente: se cancelará al eliminar tu cuenta. La propiedad todavía no
                    cambió.
                  }
                </p>
              </div>
              <span class="badge" [class.warm]="transfer.status === 'pending'">
                {{
                  transfer.status === 'accepted'
                    ? 'Aceptada'
                    : transfer.expired
                      ? 'Vencida'
                      : 'Pendiente'
                }}
              </span>
            </div>
          }
        }
        <form (submit)="remove(); $event.preventDefault()">
          <label class="spaced"
            >Confirma tu contraseña<input
              type="password"
              [formField]="deletionFields.password"
              autocomplete="current-password" /></label
          ><label class="check spaced"
            ><input type="checkbox" [formField]="deletionFields.confirm" />Entiendo y acepto la
            eliminación de mi cuenta y los efectos indicados.</label
          >
          <div class="form-actions">
            <button
              class="btn danger"
              [disabled]="busy() || !deletion().confirm || !deletion().password"
            >
              Eliminar cuenta definitivamente</button
            ><button type="button" class="btn quiet" (click)="cancelDeletion()">Cancelar</button>
          </div>
        </form>
      </section>
    }`,
})
export class Account implements OnInit {
  private api = inject(Api);
  readonly session = inject(Session);
  private router = inject(Router);
  readonly busy = signal(false);
  readonly preview = signal<DeletionPreview | undefined>(undefined);
  readonly model = signal({ display_name: '', layout: 'columns', paper: 'LETTER', color: true });
  readonly fields = form(this.model);
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
    this.preview.set(undefined);
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
