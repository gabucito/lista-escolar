import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Session } from '../../core/session';
import { ListSummary, Template, dateLabel } from '../../core/models';
import { form, FormField } from '@angular/forms/signals';
@Component({
  selector: 'app-mine',
  imports: [RouterLink, FormField],
  templateUrl: './mine.html',
  styleUrl: './mine.scss',
})
export class Mine implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  readonly session = inject(Session);
  readonly lists = signal<ListSummary[]>([]);
  readonly templates = signal<Template[]>([]);
  readonly transfers = signal<{ id: string; school: string; owner_name: string }[]>([]);
  readonly loading = signal(true);
  readonly creating = signal('');
  readonly date = dateLabel;
  readonly selected = signal<'all' | 'owner' | 'shared' | 'following'>('all');
  readonly filter = signal({ status: 'all' });
  readonly filterFields = form(this.filter);
  readonly sections = [
    { key: 'all', label: 'Todas' },
    { key: 'owner', label: 'Propias' },
    { key: 'shared', label: 'Compartidas' },
    { key: 'following', label: 'Siguiendo' },
  ] as const;
  belongs(list: ListSummary, section: string) {
    if (section === 'owner') return list.role === 'owner';
    if (section === 'shared') return list.role === 'editor' || list.role === 'viewer';
    if (section === 'following') return list.following === true;
    return true;
  }
  count(section: string) {
    return this.lists().filter((list) => this.belongs(list, section)).length;
  }
  readonly visibleLists = computed(() =>
    this.lists().filter(
      (list) =>
        this.belongs(list, this.selected()) &&
        (this.filter().status === 'all' ||
          (this.filter().status === 'archived'
            ? list.archived
            : this.filter().status === 'draft'
              ? !list.current_version
              : !!list.current_version && !list.archived)),
    ),
  );
  ngOnInit() {
    void this.load();
  }
  async load() {
    try {
      const [lists, templates, transfers] = await Promise.all([
        this.api.get<ListSummary[]>('/lists/mine'),
        this.api.get<Template[]>('/templates'),
        this.api.get<{ id: string; school: string; owner_name: string }[]>('/transfers'),
      ]);
      this.lists.set(lists);
      this.templates.set(templates);
      this.transfers.set(transfers);
    } catch (error) {
      this.api.fail(error);
    } finally {
      this.loading.set(false);
    }
  }
  async fromTemplate(id: string) {
    if (this.creating()) return;
    this.creating.set(id);
    try {
      const result = await this.api.post<{ id: string }>('/templates/' + id + '/copy', {});
      await this.router.navigate(['/editar', result.id]);
    } catch (error) {
      this.api.fail(error);
    } finally {
      this.creating.set('');
    }
  }
  async accept(id: string) {
    if (
      !confirm(
        'Al aceptar serás responsable de administrar, compartir y mantener esta lista. ¿Aceptar propiedad?',
      )
    )
      return;
    try {
      await this.api.post('/transfers/' + id + '/accept', {});
      await this.load();
      this.api.success('Ahora eres propietario de la lista.');
    } catch (error) {
      this.api.fail(error);
    }
  }
}
