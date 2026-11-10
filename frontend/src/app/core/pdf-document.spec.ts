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

function checkboxCount(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((total, value) => total + checkboxCount(value), 0);
  if (!node || typeof node !== 'object') return 0;
  const record = node as Record<string, unknown>;
  const own = record['type'] === 'rect' && record['w'] === 8 && record['h'] === 8 ? 1 : 0;
  return (
    own + Object.values(record).reduce<number>((total, value) => total + checkboxCount(value), 0)
  );
}

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

  for (const layout of ['columns', 'sidebar', 'cards'] as const) {
    it(`${layout} prints every accepted option with one checkbox and quantity per requirement`, () => {
      const alternatives = Array.from({ length: 12 }, (_, index) => ({
        catalog_id: '',
        name: `Opción ${index + 1}: ${'descripción amplia '.repeat(13)}FINOPCION${index}`,
        attributes: {
          formato: { name: 'Formato', value: `FORMATO${index}` },
          autoadhesivo: { name: 'Autoadhesivo', value: false },
        },
      }));
      const choice: Content = {
        ...content,
        items: [
          {
            ...content.items[0],
            name: 'Material a elección',
            quantity: '2',
            unit: 'unidad',
            alternatives,
          },
          { ...content.items[1], name: 'Útil obligatorio separado' },
        ],
      };
      const document = makeDocument(choice, meta, { layout, paper: 'A4', color: false });
      const serialized = JSON.stringify(document);
      expect(checkboxCount(document.content)).toBe(2);
      expect(serialized.match(/Cualquiera de estas opciones/g)).toHaveLength(1);
      expect(serialized.match(/en total/g)).toHaveLength(1);
      expect(serialized).toContain('Completa la cantidad con cualquiera de estas opciones.');
      expect(serialized).toContain('Útil obligatorio separado');
      let previous = -1;
      for (const [index, option] of alternatives.entries()) {
        expect(serialized).toContain(option.name);
        expect(serialized).toContain(`FORMATO${index}`);
        const position = serialized.indexOf(option.name);
        expect(position).toBeGreaterThan(previous);
        previous = position;
      }
      expect(serialized.match(/Autoadhesivo: No/g)).toHaveLength(12);
      for (const match of serialized.matchAll(/#([a-f0-9]{6})/gi)) {
        expect(match[1].slice(0, 2)).toBe(match[1].slice(2, 4));
        expect(match[1].slice(2, 4)).toBe(match[1].slice(4, 6));
      }
    });

    it(`${layout} leaves legacy supplies unchanged when alternatives are absent or empty`, () => {
      const preferences: PdfPreferences = { layout, paper: 'LETTER', color: true };
      const emptyAlternatives: Content = {
        ...content,
        items: content.items.map((item) => ({ ...item, alternatives: [] })),
      };
      expect(JSON.stringify(makeDocument(emptyAlternatives, meta, preferences))).toBe(
        JSON.stringify(makeDocument(content, meta, preferences)),
      );
    });
  }
});
