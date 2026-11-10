import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Session } from '../../core/session';
@Component({
  selector: 'app-invitation',
  imports: [RouterLink],
  templateUrl: './invitation.html',
  styleUrl: './invitation.scss',
})
export class Invitation {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly session = inject(Session);
  readonly request = (this.route.snapshot.routeConfig?.path || '').startsWith('solicitar');
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly error = signal('');
  readonly returnUrl = this.router.url;
  async changeAccount() {
    this.busy.set(true);
    try {
      await this.session.logout();
      await this.router.navigate(['/ingresar'], { queryParams: { next: this.returnUrl } });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo cambiar de cuenta.');
    } finally {
      this.busy.set(false);
    }
  }
  async accept() {
    this.error.set('');
    this.busy.set(true);
    try {
      const token = this.route.snapshot.paramMap.get('token') || '';
      if (this.request) {
        await this.api.post('/access-requests/' + token, {});
        this.done.set(true);
      } else {
        const result = await this.api.post<{ list_id: string }>(
          '/invitations/' + token + '/accept',
          {},
        );
        await this.router.navigate(['/listas', result.list_id]);
        this.api.success('Invitación aceptada.');
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo completar la solicitud.');
    } finally {
      this.busy.set(false);
    }
  }
}
