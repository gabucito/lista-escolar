import { Service, inject, signal } from '@angular/core';
import { Api } from './api';
import { User } from './models';
@Service()
export class Session {
  private api = inject(Api);
  readonly user = signal<User | undefined>(undefined);
  readonly loaded = signal(false);
  readonly ready = this.refresh();
  async refresh() {
    try {
      const result = await this.api.get<{ user: User | null }>('/auth/me');
      this.user.set(result.user ?? undefined);
    } catch (error) {
      this.api.fail(error);
    } finally {
      this.loaded.set(true);
    }
  }
  async logout() {
    await this.api.post('/auth/logout');
    this.user.set(undefined);
    this.api.clearContent();
  }
}
