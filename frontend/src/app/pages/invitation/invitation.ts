import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Session } from '../../core/session';
@Component({
  selector: 'app-invitation',
  imports: [RouterLink],
  template: `<div class="auth-wrap">
    <section class="panel">
      <p class="eyebrow">Compartir con confianza</p>
      <h1>{{ request ? 'Solicitar acceso' : 'Te invitaron a una lista' }}</h1>
      <p>
        {{
          request
            ? 'El propietario o un editor debe aprobar tu solicitud antes de que puedas ver la lista.'
            : 'Solo la cuenta con el correo invitado puede aceptar este enlace.'
        }}
      </p>
      <p>
        Estás conectado como <strong>{{ session.user()?.email }}</strong
        >.
      </p>
      @if (done()) {
        <div class="notice success" role="status">
          Solicitud enviada. La lista aparecerá en Mis listas cuando te den acceso.
        </div>
      } @else {
        <button class="btn" [disabled]="busy()" (click)="accept()">
          {{ busy() ? 'Un momento…' : request ? 'Enviar solicitud' : 'Aceptar invitación' }}
        </button>
      }
      <p class="spaced"><a routerLink="/mis-listas">Ir a mis listas</a></p>
    </section>
  </div>`,
})
export class Invitation {
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly session = inject(Session);
  readonly request = (this.route.snapshot.routeConfig?.path || '').startsWith('solicitar');
  readonly busy = signal(false);
  readonly done = signal(false);
  async accept() {
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
      this.api.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
}
