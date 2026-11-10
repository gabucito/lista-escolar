import { Component, inject, signal, computed, effect, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { form, FormField, disabled } from '@angular/forms/signals';
import { Api, ApiError } from '../../core/api';
import { Draft, dateLabel } from '../../core/models';
interface Access {
  grants: { user_id: string; email: string; display_name: string; role: string }[];
  invitations: { id: string; email: string; role: string; expires_at: string }[];
  requests: { id: string; email: string; display_name: string }[];
  transfers: { id: string; recipient_id: string; recipient_name: string; expires_at: string }[];
  request_link: string;
}
@Component({
  selector: 'app-share',
  imports: [RouterLink, FormField],
  template: `<div class="breadcrumb"><a [routerLink]="['/editar', id]">← Volver al editor</a></div>
    <header class="page-head">
      <div>
        <p class="eyebrow">Mejor en comunidad</p>
        <h1>Comparte y colabora.</h1>
        <p>
          {{ draft()?.content?.school || 'Tu lista escolar' }} · {{ draft()?.content?.class_name }}
        </p>
      </div>
      @if (draft()?.current_version) {
        <a class="btn secondary" [routerLink]="['/listas', id]">Ver lista publicada</a>
      }
    </header>
    @if (loading()) {
      <div class="loading">Cargando permisos…</div>
    } @else if (access(); as access) {
      <div class="split">
        <div>
          <section class="panel">
            <h2>Quién puede encontrarla</h2>
            <form (submit)="settings(); $event.preventDefault()">
              <label
                >Visibilidad<select [formField]="settingFields.visibility">
                  <option value="public">
                    Pública: cualquiera puede ver las versiones publicadas
                  </option>
                  <option value="private">Privada: solo las personas con acceso</option>
                </select></label
              >
              <p class="muted spaced">
                El borrador siempre es privado para el propietario y los editores. Los cambios de
                acceso se aplican de inmediato a todas las versiones.
              </p>
              @if (draft()?.role === 'owner') {
                <label class="check"
                  ><input type="checkbox" [formField]="settingFields.comments_enabled" />Permitir
                  nuevos comentarios</label
                ><small>Al desactivarlos, los comentarios anteriores permanecen visibles.</small>
              }
              <button class="btn secondary spaced" [disabled]="busy() || !canManage()">
                Guardar permisos
              </button>
            </form>
          </section>
          <section class="panel">
            <h2>Invitar a una persona</h2>
            <form (submit)="invite(); $event.preventDefault()">
              <div class="fields">
                <label
                  >Correo electrónico<input
                    type="email"
                    [formField]="inviteFields.email"
                    placeholder="persona@correo.cl" /></label
                ><label
                  >Permiso<select [formField]="inviteFields.role">
                    <option value="viewer">Puede leer</option>
                    <option value="editor">Puede editar y publicar</option>
                  </select></label
                >
              </div>
              <button
                class="btn spaced"
                [disabled]="busy() || !canManage() || !invitation().email.trim()"
              >
                Crear invitación
              </button>
            </form>
            <p class="muted spaced">
              En desarrollo local comparte el enlace directamente. La persona debe ingresar con el
              correo invitado y aceptar; reenviarlo no da acceso a otra cuenta.
            </p>
            @if (invitationLink()) {
              <div class="copy-field">
                <code>{{ invitationLink() }}</code
                ><button class="btn secondary small" (click)="copy(invitationLink())">
                  Copiar
                </button>
              </div>
            }
          </section>
          <section class="panel">
            <h2>Personas con acceso</h2>
            @for (grant of access.grants; track grant.user_id) {
              <div class="share-row">
                <div>
                  <strong>{{ grant.display_name }}</strong
                  ><small style="display:block"
                    >{{ grant.email }} ·
                    {{ grant.role === 'editor' ? 'Puede editar y publicar' : 'Puede leer' }}</small
                  >
                </div>
                <button
                  class="text-button danger-text"
                  [disabled]="!canManage()"
                  (click)="revoke(grant.user_id)"
                >
                  Quitar acceso
                </button>
              </div>
            }
            @if (!access.grants.length) {
              <p class="muted">
                Todavía no hay colaboradores. El propietario conserva siempre el control de la
                lista.
              </p>
            }
            @if (access.invitations.length) {
              <h3 class="spaced">Invitaciones pendientes</h3>
              @for (invite of access.invitations; track invite.id) {
                <div class="share-row">
                  <div>
                    {{ invite.email
                    }}<small style="display:block"
                      >{{ invite.role === 'editor' ? 'Edición' : 'Lectura' }} · vence
                      {{ date(invite.expires_at) }}</small
                    >
                  </div>
                  <button
                    class="text-button"
                    [disabled]="!canManage()"
                    (click)="cancelInvitation(invite.id)"
                  >
                    Cancelar
                  </button>
                </div>
              }
            }
          </section>
          <section class="panel">
            <h2>Solicitudes de acceso</h2>
            @for (request of access.requests; track request.id) {
              <div class="share-row">
                <div>
                  <strong>{{ request.display_name }}</strong
                  ><small style="display:block">{{ request.email }}</small>
                </div>
                <div class="actions">
                  <button
                    class="btn secondary small"
                    [disabled]="!canManage()"
                    (click)="decide(request.id, true, 'viewer')"
                  >
                    Permitir lectura</button
                  ><button
                    class="btn secondary small"
                    [disabled]="!canManage()"
                    (click)="decide(request.id, true, 'editor')"
                  >
                    Permitir edición</button
                  ><button
                    class="text-button danger-text"
                    [disabled]="!canManage()"
                    (click)="decide(request.id, false, 'viewer')"
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            }
            @if (!access.requests.length) {
              <p class="muted">No hay solicitudes pendientes.</p>
            }
            @if (access.request_link) {
              <p class="muted">
                Este enlace permite solicitar acceso. Cada solicitud debe ser aprobada.
              </p>
              <div class="copy-field">
                <code>{{ absolute(access.request_link) }}</code
                ><button class="btn secondary small" (click)="copy(absolute(access.request_link))">
                  Copiar
                </button>
              </div>
            }
          </section>
        </div>
        <aside>
          <section class="panel soft">
            <h3>Enlace de la lista</h3>
            <p class="muted">
              Siempre abre la versión publicada más reciente. Si la lista es privada, se verificará
              el acceso.
            </p>
            <div class="copy-field">
              <code>{{ publicLink }}</code>
            </div>
            <button class="btn secondary spaced" (click)="copy(publicLink)">Copiar enlace</button>
          </section>
          @if (draft()?.role === 'owner') {
            <section class="panel">
              <h3>Transferir propiedad</h3>
              <p class="muted">
                La otra persona debe aceptar. Después quedarás como colaborador con edición.
              </p>
              <label
                >Colaborador<select [formField]="transferFields.recipient_id">
                  <option value="">Selecciona una persona</option>
                  @for (person of access.grants; track person.user_id) {
                    <option [value]="person.user_id">{{ person.display_name }}</option>
                  }
                </select></label
              ><button
                class="btn secondary spaced"
                [disabled]="!transfer().recipient_id || busy()"
                (click)="offerTransfer()"
              >
                Ofrecer propiedad
              </button>
              @for (transfer of access.transfers; track transfer.id) {
                <div class="share-row">
                  <span
                    >Pendiente: {{ transfer.recipient_name
                    }}<small style="display:block"
                      >Vence {{ date(transfer.expires_at) }}</small
                    ></span
                  ><button class="text-button" (click)="cancelTransfer(transfer.id)">
                    Cancelar
                  </button>
                </div>
              }
            </section>
            <section class="panel danger-zone">
              <h3>Administrar lista</h3>
              <p class="muted">
                Archivar conserva las versiones y los enlaces, pero oculta la lista de la búsqueda.
                Eliminar retira todo su contenido de la aplicación.
              </p>
              <div class="sidebar-actions">
                <button class="btn secondary" [disabled]="busy()" (click)="archive()">
                  {{ draft()?.archived ? 'Restaurar lista' : 'Archivar lista' }}</button
                ><button class="btn danger" [disabled]="busy()" (click)="remove()">
                  Eliminar lista
                </button>
              </div>
            </section>
          }
        </aside>
      </div>
    }`,
})
export class Share implements OnInit {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly id = this.route.snapshot.paramMap.get('id') || '';
  readonly publicLink = location.origin + '/listas/' + this.id;
  readonly draft = signal<(Draft & { comments_enabled?: boolean }) | undefined>(undefined);
  readonly access = signal<Access | undefined>(undefined);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly invitationLink = signal('');
  readonly date = dateLabel;
  readonly canManage = computed(
    () =>
      this.draft()?.role === 'owner' ||
      (this.draft()?.role === 'editor' && !this.draft()?.archived),
  );
  readonly setting = signal({ visibility: 'public', comments_enabled: true });
  readonly settingFields = form(this.setting, (p) => disabled(p, () => !this.canManage()));
  readonly invitation = signal({ email: '', role: 'viewer' });
  readonly inviteFields = form(this.invitation, (p) => disabled(p, () => !this.canManage()));
  readonly transfer = signal({ recipient_id: '' });
  readonly transferFields = form(this.transfer);
  constructor() {
    let resetVersion = this.api.contentReset();
    effect(() => {
      const current = this.api.contentReset();
      if (current !== resetVersion) {
        resetVersion = current;
        this.access.set(undefined);
        this.draft.set(undefined);
        this.invitationLink.set('');
      }
    });
    effect(() => {
      const denial = this.api.denial();
      if (denial?.path.startsWith('/lists/' + this.id)) void this.recheckAccess();
    });
  }
  async recheckAccess() {
    try {
      await this.api.get('/lists/' + this.id + '/draft', false);
    } catch (error) {
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        this.access.set(undefined);
        this.draft.set(undefined);
        this.invitationLink.set('');
        this.loading.set(false);
      }
    }
  }
  ngOnInit() {
    void this.load();
  }
  async load() {
    try {
      const [access, draft] = await Promise.all([
        this.api.get<Access>(`/lists/${this.id}/access`),
        this.api.get<Draft & { comments_enabled?: boolean }>(`/lists/${this.id}/draft`),
      ]);
      this.access.set(access);
      this.draft.set(draft);
      this.setting.set({
        visibility: draft.visibility,
        comments_enabled: draft.comments_enabled ?? true,
      });
    } catch (error) {
      this.api.fail(error);
    } finally {
      this.loading.set(false);
    }
  }
  absolute(path: string) {
    return path.startsWith('/') ? location.origin + path : path;
  }
  async copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      this.api.success('Enlace copiado.');
    } catch {
      this.api.fail(new Error('Selecciona y copia el enlace manualmente.'));
    }
  }
  async settings() {
    this.busy.set(true);
    try {
      const { visibility, comments_enabled } = this.setting();
      if (
        visibility !== this.draft()?.visibility &&
        !confirm(
          visibility === 'public'
            ? 'Las versiones publicadas podrán verse sin invitación. ¿Hacer pública la lista?'
            : 'Las personas sin un permiso explícito perderán acceso y seguimiento. ¿Hacer privada la lista?',
        )
      )
        return;
      await this.api.patch(
        `/lists/${this.id}/settings`,
        this.draft()?.role === 'owner' ? { visibility, comments_enabled } : { visibility },
      );
      await this.load();
      this.api.success('Permisos actualizados.');
    } catch (error) {
      this.api.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
  async invite() {
    this.busy.set(true);
    try {
      const result = await this.api.post<{ invitation_token: string }>(
        `/lists/${this.id}/access`,
        this.invitation(),
      );
      this.invitationLink.set(location.origin + '/invitaciones/' + result.invitation_token);
      this.invitation.update((m) => ({ ...m, email: '' }));
      await this.load();
    } catch (error) {
      this.api.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
  async revoke(user: string) {
    if (
      !confirm(
        '¿Quitar el acceso de esta persona? Si la lista es privada, ya no podrá ver sus versiones.',
      )
    )
      return;
    try {
      await this.api.delete(`/lists/${this.id}/access/${user}`);
      await this.load();
    } catch (error) {
      this.api.fail(error);
    }
  }
  async cancelInvitation(id: string) {
    try {
      await this.api.delete(`/lists/${this.id}/invitations/${id}`);
      this.invitationLink.set('');
      await this.load();
    } catch (error) {
      this.api.fail(error);
    }
  }
  async decide(request: string, approve: boolean, role: string) {
    try {
      await this.api.post(`/lists/${this.id}/requests/${request}`, { approve, role });
      await this.load();
    } catch (error) {
      this.api.fail(error);
    }
  }
  async offerTransfer() {
    try {
      await this.api.post(`/lists/${this.id}/transfer`, this.transfer());
      await this.load();
      this.api.success('Oferta enviada. La otra persona puede aceptarla desde Mis listas.');
    } catch (error) {
      this.api.fail(error);
    }
  }
  async cancelTransfer(id: string) {
    try {
      await this.api.delete('/transfers/' + id);
      await this.load();
    } catch (error) {
      this.api.fail(error);
    }
  }
  async archive() {
    const archived = !this.draft()?.archived;
    if (
      !confirm(
        archived
          ? '¿Archivar esta lista y detener nuevas publicaciones y comentarios?'
          : '¿Restaurar la lista? El borrador no se publicará automáticamente.',
      )
    )
      return;
    try {
      await this.api.post(`/lists/${this.id}/archive`, { archived });
      await this.load();
      this.api.success(archived ? 'Lista archivada.' : 'Lista restaurada.');
    } catch (error) {
      this.api.fail(error);
    }
  }
  async remove() {
    if (
      !confirm(
        'Se eliminarán esta lista, sus versiones, comentarios y checklists. Esta acción no se puede deshacer. ¿Eliminar definitivamente?',
      )
    )
      return;
    try {
      await this.api.delete('/lists/' + this.id);
      await this.router.navigate(['/mis-listas']);
      this.api.success('Lista eliminada.');
    } catch (error) {
      this.api.fail(error);
    }
  }
}
