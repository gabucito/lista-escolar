import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { form, FormField } from '@angular/forms/signals';
import { Api } from '../../core/api';
import { LOCALITIES } from '../../core/localities';
import { ListSummary, dateLabel } from '../../core/models';
@Component({
  selector: 'app-search',
  imports: [RouterLink, FormField],
  templateUrl: './search.html',
  styleUrl: './search.scss',
})
export class Search implements OnInit, OnDestroy {
  private api = inject(Api);
  private requestSequence = 0;
  readonly lists = signal<ListSummary[]>([]);
  readonly loading = signal(false);
  readonly searched = signal(false);
  readonly showLocation = signal(false);
  readonly localities = LOCALITIES;
  readonly regions = [...new Set(LOCALITIES.map((l) => l.region))];
  readonly model = signal({
    school: '',
    class_name: '',
    school_year: '',
    comuna: '',
    region: '',
    sort: 'recent',
  });
  readonly fields = form(this.model);
  readonly date = dateLabel;
  clearFilters() {
    this.model.set({
      school: '',
      class_name: '',
      school_year: '',
      comuna: '',
      region: '',
      sort: 'recent',
    });
    this.searched.set(false);
    void this.search(false);
  }
  ngOnInit() {
    void this.search(false);
  }
  ngOnDestroy() {
    this.requestSequence++;
  }
  async search(mark = true) {
    const sequence = ++this.requestSequence;
    this.api.clear();
    this.loading.set(true);
    if (mark) this.searched.set(true);
    try {
      const m = this.model();
      const query = new URLSearchParams({
        q: [m.school, m.class_name].filter(Boolean).join(' '),
        comuna: m.comuna,
        region: m.region,
        sort: m.sort,
      });
      if (m.school_year.trim()) {
        if (!/^\d{4}$/.test(m.school_year.trim())) {
          throw new Error('Ingresa un año de cuatro cifras o déjalo vacío para buscar todos.');
        }
        query.set('school_year', m.school_year.trim());
      }
      const lists = await this.api.get<ListSummary[]>('/lists?' + query);
      if (sequence === this.requestSequence) this.lists.set(lists);
    } catch (error) {
      if (sequence === this.requestSequence) {
        this.lists.set([]);
        this.api.fail(error);
      }
    } finally {
      if (sequence === this.requestSequence) this.loading.set(false);
    }
  }
}
