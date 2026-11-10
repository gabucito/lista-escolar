import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Session } from '../../core/session';
import { ListSummary, Template } from '../../core/models';
import { ListCard } from '../../shared/list-card/list-card';
@Component({
  selector: 'app-mine',
  imports: [RouterLink, ListCard],
  template: `<header class="page-head">
      <div>
        <p class="eyebrow">Mi espacio</p>
        <h1>Todo listo para organizarte.</h1>
        <p>Tus listas, las que compartes y las que sigues.</p>
      </div>
      <a routerLink="/crear" class="btn">＋ Crear lista</a>
    </header>
    @if (transfers().length) {
      <section class="panel soft">
        <h2>Te invitaron a ser propietario</h2>
        @for (transfer of transfers(); track transfer.id) {
          <div class="share-row">
            <div>
              <strong>{{ transfer.school || 'Lista escolar' }}</strong>
              <p class="muted">{{ transfer.owner_name }} quiere transferirte esta lista.</p>
            </div>
            <button class="btn secondary" (click)="accept(transfer.id)">Aceptar propiedad</button>
          </div>
        }
      </section>
    }
    @if (loading()) {
      <div class="loading">Cargando tus listas…</div>
    } @else if (lists().length) {
      <div class="list-stack">
        @for (list of lists(); track list.id) {
          <app-list-card [item]="list" />
        }
      </div>
    } @else {
      <div class="empty">
        <div class="empty-icon">▤</div>
        <h2>Tu primera lista empieza aquí</h2>
        <p>
          Crea una lista desde cero o usa una plantilla. También puedes seguir listas públicas para
          encontrarlas fácilmente.
        </p>
        <a routerLink="/crear" class="btn">Crear mi primera lista</a>
      </div>
    }
    <section class="spaced">
      <div class="section-row">
        <div>
          <p class="eyebrow">Un punto de partida</p>
          <h2>Plantillas por nivel</h2>
        </div>
      </div>
      <p class="muted">Adáptalas a tu curso. Son orientaciones generales, no listas oficiales.</p>
      @if (templates().length) {
        <div class="template-grid">
          @for (template of templates(); track template.id) {
            <article class="template-card">
              <span class="badge">{{ template.grade }}</span>
              <h3>{{ template.name }}</h3>
              <p class="muted">{{ template.content.items.length }} útiles para comenzar</p>
              <button class="btn secondary small" (click)="fromTemplate(template.id)">
                Usar plantilla
              </button>
            </article>
          }
        </div>
      } @else {
        <p class="muted">
          Todavía no hay plantillas compartidas. Puedes crear tu propia lista o copiar una lista
          pública.
        </p>
      }
    </section>`,
})
export class Mine implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  readonly session = inject(Session);
  readonly lists = signal<ListSummary[]>([]);
  readonly templates = signal<Template[]>([]);
  readonly transfers = signal<{ id: string; school: string; owner_name: string }[]>([]);
  readonly loading = signal(true);
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
    try {
      const result = await this.api.post<{ id: string }>('/templates/' + id + '/copy', {});
      await this.router.navigate(['/editar', result.id]);
    } catch (error) {
      this.api.fail(error);
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
