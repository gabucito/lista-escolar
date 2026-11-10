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
  templateUrl: './share.html',
  styleUrl: './share.scss',
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
  readonly accessView = signal<'people' | 'invitations' | 'requests'>('people');
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
