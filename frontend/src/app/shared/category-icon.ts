import { Component, computed, input } from '@angular/core';

const CATEGORY_PATHS: Record<string, string> = {
  cuadernos:
    'M7 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM3 6h5M3 10h5M3 14h5M3 18h5',
  escritura: 'm4 16-1 5 5-1L20 8a3 3 0 0 0-4-4L4 16Zm10-10 4 4M4 16l4 4',
  'arte-y-dibujo':
    'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4 2 2 0 0 1 1-4h3a3 3 0 0 0 3-3c0-4-4-7-9-7ZM7 9h.01M11 6h.01M16 7h.01M6 14h.01',
  manualidades:
    'M6 3h9v3H6V3Zm0 15h9v3H6v-3ZM8 6v12M13 6v12M8 9h5M8 12h5M8 15h5M15 19h3a3 3 0 0 0 3-3V7m-1-4h2v4h-2V3Z',
  geometria: 'M4 3v18h16L4 3Zm4 10v4h4M4 8h2M4 12h2M4 16h2',
  'material-didactico':
    'M3 13h8v8H3v-8Zm4-10 5 7H2l5-7Zm10 0a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 10 5 8H12l5-8Z',
  papeles:
    'M7 3h8l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 0v5h5M3 6v13M9 12h8M9 16h8',
  'pegado-y-corte':
    'M5 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm3-6L20 3M8 18 20 3M9 11l11 10',
  musica:
    'M9 18V6l11-3v12M9 10l11-3M9 18a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Zm11-3a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Z',
  organizacion:
    'M3 6a1 1 0 0 1 1-1h6l2 3h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Zm0 5h18',
  tecnologia:
    'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 3h8v4H8V6Zm0 8h1m3 0h1m3 0h.01M8 18h1m3 0h1m3 0h.01',
  'lectura-y-consulta':
    'M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15M6 8h3M6 12h3m6-4h3m-3 4h3',
  aseo: 'M9 3h7M12 3v5M9 8h6l2 4v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-8l2-4Zm-2 6h10M16 3v2',
  otros: 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z',
};

@Component({
  selector: 'app-category-icon',
  host: { 'aria-hidden': 'true' },
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path [attr.d]="path()" />
  </svg>`,
  styles: `
    :host {
      display: inline-flex;
      width: 24px;
      height: 24px;
      flex: 0 0 auto;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class CategoryIcon {
  readonly slug = input('');
  readonly path = computed(() => CATEGORY_PATHS[this.slug()] || CATEGORY_PATHS['otros']);
}
