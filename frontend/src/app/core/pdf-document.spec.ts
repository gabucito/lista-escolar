import { makeDocument } from './pdf-document';
import { Content, PdfPreferences } from './models';

const content: Content = {
  school: 'Colegio Los Andes',
  class_name: '4° básico',
  school_year: 2027,
  comuna: 'Ñuñoa',
  region: 'Metropolitana',
  instructions: 'Marcar todos los útiles. No retirar las etiquetas.',
  logo_id: '',
  items: Array.from({ length: 65 }, (_, index) => ({
    id: String(index),
    catalog_id: '',
    name: `Útil único ${index}`,
    quantity: index === 0 ? '0.75' : '2',
    unit: index === 0 ? 'L' : 'unidad',
    category: `Categoría ${index % 5}`,
    note: `Indicación ${index}`,
    attributes: {},
  })),
};
const meta = {
  version: 3,
  published_at: '2026-11-01T12:00:00Z',
  url: 'http://localhost/listas/example',
};
describe('Printable documents', () => {
  for (const layout of ['columns', 'sidebar', 'cards'] as const)
    for (const paper of ['LETTER', 'A4'] as const)
      for (const color of [true, false]) {
        it(`${layout} / ${paper} / ${color ? 'color' : 'monochrome'} retains all materials and exact quantities`, () => {
          const preferences: PdfPreferences = { layout, paper, color };
          const document = makeDocument(content, meta, preferences);
          const serialized = JSON.stringify(document);
          expect(document.pageSize).toBe(paper);
          for (const item of content.items) expect(serialized).toContain(item.name);
          expect(serialized).toContain('0,75');
          expect(serialized).toContain(content.instructions);
          if (!color)
            for (const match of serialized.matchAll(/#([a-f0-9]{6})/gi)) {
              const hex = match[1];
              expect(hex.slice(0, 2)).toBe(hex.slice(2, 4));
              expect(hex.slice(2, 4)).toBe(hex.slice(4, 6));
            }
        });
      }
  it('distinguishes archived drafts and retains published version information', () => {
    const document = makeDocument(
      content,
      { ...meta, draft: true, archived: true },
      { layout: 'columns', paper: 'LETTER', color: true },
    );
    expect(JSON.stringify(document)).toContain('LISTA ARCHIVADA');
    expect(document.info?.subject).toBe('BORRADOR');
  });
});
