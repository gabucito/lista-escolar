import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { Api } from './core/api';
import { Session } from './core/session';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  readonly api = inject(Api);
  readonly session = inject(Session);
  private router = inject(Router);
  readonly menu = signal(false);
  readonly offline = signal(!navigator.onLine);
  constructor() {
    window.addEventListener('online', () => this.offline.set(false));
    window.addEventListener('offline', () => this.offline.set(true));
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
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
