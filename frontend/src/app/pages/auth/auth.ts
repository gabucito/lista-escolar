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
  templateUrl: './auth.html',
  styleUrl: './auth.scss',
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
  readonly showPassword = signal(false);
  readonly attempted = signal(false);
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
    this.attempted.set(true);
    if (this.fields().invalid()) {
      this.error.set('Revisa los campos indicados antes de continuar.');
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
