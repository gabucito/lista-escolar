import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  form,
  FormField,
  required,
  email,
  minLength,
  maxLength,
  submit,
} from '@angular/forms/signals';
import { Api } from '../../core/api';
import { Session } from '../../core/session';
import { User } from '../../core/models';
@Component({
  selector: 'app-auth',
  imports: [RouterLink, FormField],
  template: `<div class="auth-wrap">
    <p class="eyebrow">Tu comunidad escolar</p>
    <div class="panel">
      <h1>{{ register ? 'Crea tu cuenta' : 'Qué bueno verte' }}</h1>
      <p class="muted">
        {{
          register
            ? 'Guarda tus listas, comparte con tu curso y lleva tu propio avance.'
            : 'Ingresa para continuar con tus listas y tus útiles pendientes.'
        }}
      </p>
      <form (submit)="send(); $event.preventDefault()">
        @if (register) {
          <label
            >Nombre para mostrar<input
              [formField]="fields.display_name"
              autocomplete="nickname"
              placeholder="Así te verá la comunidad"
          /></label>
        }
        <label
          >Correo electrónico<input
            type="email"
            [formField]="fields.email"
            autocomplete="email"
            placeholder="tu@correo.cl" /></label
        ><label
          >Contraseña<input
            type="password"
            [formField]="fields.password"
            [attr.autocomplete]="register ? 'new-password' : 'current-password'"
          /><small>Al menos 8 caracteres.</small></label
        >
        @if (error()) {
          <p class="error-inline" role="alert">{{ error() }}</p>
        }
        <button type="submit" class="btn" [disabled]="busy()">
          {{ busy() ? 'Un momento…' : register ? 'Crear cuenta' : 'Ingresar' }}
        </button>
      </form>
      <p class="spaced">
        @if (register) {
          ¿Ya tienes cuenta?
          <a routerLink="/ingresar" [queryParams]="{ next: next }">Ingresa aquí</a>.
        } @else {
          ¿Primera vez?
          <a routerLink="/registro" [queryParams]="{ next: next }">Crea una cuenta</a>.
        }
      </p>
      <small
        >Versión local: las cuentas pueden comenzar de inmediato. No se envían correos ni está
        habilitado el acceso con Google.</small
      >
    </div>
  </div>`,
})
export class Auth {
  private api = inject(Api);
  private session = inject(Session);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly register = this.route.snapshot.routeConfig?.path === 'registro';
  readonly next = this.route.snapshot.queryParamMap.get('next') || '/mis-listas';
  readonly busy = signal(false);
  readonly error = signal('');
  readonly model = signal({ email: '', password: '', display_name: '' });
  readonly fields = form(this.model, (p) => {
    required(p.email);
    email(p.email);
    required(p.password);
    minLength(p.password, 8);
    if (this.register) {
      required(p.display_name);
      maxLength(p.display_name, 80);
    }
  });
  send() {
    if (this.fields().invalid()) {
      this.error.set(
        this.register
          ? 'Completa tu nombre (hasta 80 caracteres), un correo válido y una contraseña de al menos 8 caracteres.'
          : 'Ingresa un correo válido y una contraseña de al menos 8 caracteres.',
      );
      return;
    }
    void submit(this.fields, async () => {
      this.busy.set(true);
      this.error.set('');
      try {
        const { user } = await this.api.post<{ user: User }>(
          this.register ? '/auth/register' : '/auth/login',
          this.model(),
        );
        this.session.user.set(user);
        await this.router.navigateByUrl(
          this.next.startsWith('/') && !this.next.startsWith('//') ? this.next : '/mis-listas',
        );
      } catch (error) {
        this.error.set(error instanceof Error ? error.message : 'No se pudo ingresar.');
      } finally {
        this.busy.set(false);
      }
    });
  }
}
