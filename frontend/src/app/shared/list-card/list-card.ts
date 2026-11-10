import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ListSummary, dateLabel } from '../../core/models';
@Component({
  selector: 'app-list-card',
  imports: [RouterLink],
  template: `<article class="list-card">
    <div class="monogram" aria-hidden="true">{{ item().school?.charAt(0) || 'L' }}</div>
    <div>
      <h3>
        <a
          [routerLink]="item().current_version ? ['/listas', item().id] : ['/editar', item().id]"
          >{{ item().school || 'Lista sin nombre' }}</a
        >
      </h3>
      <p>
        {{ item().class_name || 'Curso por definir' }} ·
        {{ item().school_year || 'Año por definir' }}
        @if (item().comuna) {
          · {{ item().comuna }}
        }
      </p>
      <div class="badges">
        @if (!item().current_version) {
          <span class="badge warm">Borrador</span>
        }
        @if (item().visibility === 'private') {
          <span class="badge gray">Privada</span>
        }
        @if (item().archived) {
          <span class="badge gray">Archivada</span>
        }
        @if (item().hidden) {
          <span class="badge red">En moderación</span>
        }
        @if (item().role === 'owner') {
          <span class="badge">Mi lista</span>
        } @else if (item().role === 'editor') {
          <span class="badge">Colaboro</span>
        }
      </div>
    </div>
    <div class="card-meta">
      <span class="badge">♡ {{ item().votes || 0 }} votos</span
      ><small>{{ date(item().published_at) }}</small>
    </div>
  </article>`,
})
export class ListCard {
  readonly item = input.required<ListSummary>();
  readonly date = dateLabel;
}
