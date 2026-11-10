import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { form, FormField } from '@angular/forms/signals';
import { Api } from '../../core/api';
import { LOCALITIES } from '../../core/localities';
import { ListSummary } from '../../core/models';
import { ListCard } from '../../shared/list-card/list-card';
@Component({
  selector: 'app-search',
  imports: [RouterLink, FormField, ListCard],
  template: `
    <section class="hero">
      <div>
        <p class="eyebrow">Para empezar un gran año</p>
        <h1>La lista de útiles,<br />más cerca de todos.</h1>
        <span class="underline" aria-hidden="true"></span>
        <p>
          Encuentra la lista de tu colegio, organízate a tu ritmo y comparte un buen comienzo con tu
          comunidad.
        </p>
      </div>
      <svg
        class="hero-art"
        viewBox="0 0 340 270"
        role="img"
        aria-label="Cuaderno y lápices escolares"
      >
        <ellipse cx="170" cy="240" rx="146" ry="15" fill="#eadfc8" />
        <g transform="rotate(-8 150 140)">
          <rect x="70" y="30" width="150" height="206" rx="13" fill="#9dad81" />
          <rect x="84" y="30" width="5" height="206" fill="#758b66" />
          <rect x="107" y="70" width="94" height="58" rx="5" fill="#f9f3dd" />
          <path d="M122 88h62M122 103h48" stroke="#9dad81" stroke-width="4" />
          <path
            d="M76 55h-13q-14 0-14 9t14 9h13M76 95h-13q-14 0-14 9t14 9h13M76 135h-13q-14 0-14 9t14 9h13M76 175h-13q-14 0-14 9t14 9h13"
            fill="none"
            stroke="#45573b"
            stroke-width="5"
          />
        </g>
        <g transform="rotate(12 260 130)">
          <path d="M236 42h17v135h-17z" fill="#e1a448" />
          <path d="m236 177 9 27 8-27" fill="#e7d4aa" />
          <path d="m242 194 3 10 4-10" fill="#324238" />
          <path d="M236 40v-9q9-8 17 0v9" fill="#d88764" />
          <path d="M236 44h17" stroke="#ede2c7" stroke-width="8" />
        </g>
        <path d="m270 64 21 6-31 119-21-6z" fill="#d0b47a" />
        <path
          d="m280 78 9 3m-13 13 9 3m-13 13 9 3m-13 13 9 3m-13 13 9 3"
          stroke="#9a7e4e"
          stroke-width="2"
        />
        <path d="M215 162h77l-9 78h-59z" fill="#f0dfb7" />
        <path d="M222 177h64" stroke="#cfb583" stroke-width="2" />
        <rect x="104" y="214" width="61" height="29" rx="5" fill="#d48b70" />
        <path d="M104 214h26v29h-26" fill="#f7e6c8" />
        <path
          d="m304 147 9-12m-6 35 17-1"
          stroke="#d1a255"
          stroke-width="4"
          stroke-linecap="round"
        />
      </svg>
    </section>
    <form class="search-bar" (submit)="search(); $event.preventDefault()">
      <label
        >Colegio<input
          [formField]="fields.school"
          placeholder="Ej. Colegio Los Andes"
          autocomplete="off" /></label
      ><label>Curso<input [formField]="fields.class_name" placeholder="Ej. 5° básico" /></label
      ><label
        >Año escolar<input
          [formField]="fields.school_year"
          inputmode="numeric"
          placeholder="Todos" /></label
      ><button class="btn" type="submit" [disabled]="loading()">⌕ Buscar listas</button>
      <details class="search-more">
        <summary>Filtrar por ubicación</summary>
        <div class="fields">
          <label
            >Comuna<input
              [formField]="fields.comuna"
              list="search-comunas"
              placeholder="Cualquier comuna" /></label
          ><label
            >Región<input
              [formField]="fields.region"
              list="search-regions"
              placeholder="Cualquier región"
          /></label>
        </div>
      </details>
      <datalist id="search-comunas">
        @for (locality of localities; track locality.name) {
          <option [value]="locality.name"></option>
        }</datalist
      ><datalist id="search-regions">
        @for (region of regions; track region) {
          <option [value]="region"></option>
        }
      </datalist>
    </form>
    <div class="section-row">
      <div>
        <h2>{{ searched() ? 'Resultados de búsqueda' : 'Listas de la comunidad' }}</h2>
        <p class="muted">La versión más reciente de cada lista, en un solo lugar.</p>
      </div>
      <label class="field"
        >Ordenar<select [formField]="fields.sort" (change)="search()">
          <option value="recent">Más recientes</option>
          <option value="votes">Más relevantes</option>
        </select></label
      >
    </div>
    @if (loading()) {
      <div class="loading" role="status">Buscando listas…</div>
    } @else if (lists().length) {
      <div class="list-stack">
        @for (list of lists(); track list.id) {
          <app-list-card [item]="list" />
        }
      </div>
    } @else {
      <div class="empty">
        <div class="empty-icon" aria-hidden="true">▤</div>
        <h2>
          {{ searched() ? 'Aún no encontramos esa lista' : 'Todo gran año empieza con una lista' }}
        </h2>
        <p>
          {{
            searched()
              ? 'Prueba otro nombre, curso o año escolar. También puedes crear la lista que tu comunidad necesita.'
              : 'Cuando la comunidad publique sus primeras listas, aparecerán aquí. Puedes empezar con la de tu curso.'
          }}
        </p>
        <a routerLink="/crear" class="btn secondary">＋ Crear una lista</a>
      </div>
    }
  `,
})
export class Search implements OnInit, OnDestroy {
  private api = inject(Api);
  private requestSequence = 0;
  readonly lists = signal<ListSummary[]>([]);
  readonly loading = signal(false);
  readonly searched = signal(false);
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
