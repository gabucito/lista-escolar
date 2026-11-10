import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { Api } from './core/api';
import { Session } from './core/session';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '[class.editing]': 'workspace()' },
})
export class App {
  readonly api = inject(Api);
  readonly session = inject(Session);
  private router = inject(Router);
  readonly currentPath = signal(this.router.url);
  readonly workspace = computed(() => /^\/(crear|editar)(\/|\?|$)/.test(this.currentPath()));
  readonly administration = computed(() => this.currentPath().split('?')[0] === '/admin');
  readonly menu = signal(false);
  readonly offline = signal(!navigator.onLine);
  constructor() {
    const online = () => this.offline.set(false),
      offline = () => this.offline.set(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    });
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.currentPath.set(event.urlAfterRedirects);
        this.menu.set(false);
        this.api.clear();
        window.scrollTo({ top: 0 });
      }
    });
  }
  async logout() {
    try {
      await this.session.logout();
      await this.router.navigate(['/']);
      this.api.success('Sesión cerrada.');
    } catch (error) {
      this.api.fail(error);
    }
  }
}
