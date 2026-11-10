import type {
  Content as PdfContent,
  TDocumentDefinitions,
  TableCell,
  ContentCanvas,
} from 'pdfmake/interfaces';
import { attributeSummary } from './models';
import type { Content, Item, PdfPreferences } from './models';
export interface PdfMeta {
  version: number;
  published_at: string;
  url: string;
  draft?: boolean;
  archived?: boolean;
}
export function makeDocument(
  list: Content,
  meta: PdfMeta,
  prefs: PdfPreferences,
  logo = '',
): TDocumentDefinitions {
  const muted = prefs.color ? '#657173' : '#626262',
    border = prefs.color ? '#d6dfd4' : '#d6d6d6',
    paper = prefs.color ? '#f5f1e9' : '#f3f3f3';
  const ink = prefs.color ? '#294657' : '#252525',
    green = prefs.color ? '#5c8066' : '#444444',
    light = prefs.color ? '#eef4ea' : '#f1f1f1',
    warm = prefs.color ? '#f8eadf' : '#f5f5f5',
    accent = prefs.color ? '#bd7359' : '#555555';
  const groups = new Map<string, Item[]>();
  for (const item of list.items) {
    const key = item.category || 'Otros materiales';
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  const date = meta.published_at ? new Date(meta.published_at).toLocaleDateString('es-CL') : '';
  const version = meta.draft ? 'BORRADOR' : `Versión ${meta.version} · ${date}`;
  const compact = (text: string, limit: number) => {
    const characters = Array.from(text);
    return characters.length <= limit ? text : characters.slice(0, limit - 1).join('') + '…';
  };
  const locality = [list.comuna, list.region].filter(Boolean).join(' · ');
  const extendedIdentity =
    list.school.length > 80 || list.class_name.length > 45 || locality.length > 100;
  const checkbox = (): ContentCanvas => ({
    canvas: [{ type: 'rect', x: 0, y: 1, w: 8, h: 8, r: 1, lineWidth: 1, lineColor: green }],
  });
  // Options describe one requirement. Keep this block breakable so a long choice
  // set can flow across pages without duplicating its quantity or checklist box.
  const alternatives = (item: Item): PdfContent[] =>
    item.alternatives?.length
      ? [
          {
            text: 'Cualquiera de estas opciones',
            bold: true,
            fontSize: 8,
            color: green,
            margin: [0, 5, 0, 3],
          },
          ...item.alternatives.flatMap((option, index): PdfContent[] => [
            ...(index
              ? [
                  {
                    text: 'o',
                    italics: true,
                    fontSize: 8,
                    color: muted,
                    margin: [5, 2, 0, 2],
                  } as PdfContent,
                ]
              : []),
            { text: option.name, bold: true, fontSize: 8.5, margin: [5, 0, 0, 1] },
            ...(attributeSummary(option.attributes)
              ? [
                  {
                    text: attributeSummary(option.attributes),
                    fontSize: 8,
                    color: muted,
                    margin: [5, 0, 0, 2],
                  } as PdfContent,
                ]
              : []),
          ]),
          {
            text: 'Completa la cantidad con cualquiera de estas opciones.',
            fontSize: 7.5,
            color: muted,
            margin: [0, 4, 0, 3],
          },
        ]
      : [];
  const itemRow = (item: Item): TableCell[] => [
    checkbox() as TableCell,
    {
      stack: [
        { text: item.name, bold: true, fontSize: 9.5 },
        ...(attributeSummary(item.attributes)
          ? [{ text: attributeSummary(item.attributes), fontSize: 8, color: muted }]
          : []),
        ...alternatives(item),
        ...(item.note
          ? [
              {
                text: item.note,
                fontSize: 8.2,
                color: muted,
                margin: [0, 3, 0, 0] as [number, number, number, number],
              },
            ]
          : []),
      ],
      margin: [0, 0, 4, 3],
    },
    {
      text: `${item.quantity.replace('.', ',')}\n${item.unit}${item.alternatives?.length ? '\nen total' : ''}`,
      alignment: 'right',
      fontSize: 9,
      color: green,
    },
  ];
  const group = (name: string, items: Item[]): PdfContent => ({
    margin: [0, 0, 0, 12],
    table: {
      widths: [12, '*', 48],
      headerRows: 1,
      // A choice can exceed a whole page. Keeping its entire first row with
      // the heading creates an oversized unbreakable block and loses content.
      keepWithHeaderRows: items[0]?.alternatives?.length ? 0 : 1,
      body: [
        [
          {
            text: name,
            bold: true,
            fontSize: 11,
            color: green,
            fillColor: light,
            colSpan: 3,
            margin: [3, 5, 3, 5],
          },
          {},
          {},
        ],
        ...items.map(itemRow),
      ],
    },
    layout: {
      hLineWidth: (i) => (i === 0 ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => border,
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
  });
  const identification: PdfContent = {
    margin: [0, 0, 0, 18],
    table: {
      widths: ['*', 110, 60],
      body: [
        [
          {
            stack: [
              { text: 'COLEGIO', fontSize: 7, color: accent },
              { text: list.school, bold: true, margin: [0, 4, 0, 0] },
              {
                text: [list.comuna, list.region].filter(Boolean).join(' · '),
                fontSize: 8,
                color: muted,
              },
            ],
            fillColor: paper,
          },
          {
            stack: [
              { text: 'CURSO', fontSize: 7, color: accent },
              { text: list.class_name, bold: true, margin: [0, 4, 0, 0] },
            ],
            fillColor: paper,
          },
          {
            stack: [
              { text: 'AÑO ESCOLAR', fontSize: 7, color: accent },
              { text: String(list.school_year), bold: true, margin: [0, 4, 0, 0] },
            ],
            fillColor: paper,
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingTop: () => 10,
      paddingBottom: () => 10,
      paddingLeft: () => 10,
      paddingRight: () => 10,
    },
  };
  // Fixed sidebars cannot paginate. Long identity fields flow in the document body in full.
  const fullIdentity: PdfContent = {
    stack: [
      { text: 'ESTABLECIMIENTO', fontSize: 7, color: accent },
      { text: list.school, fontSize: 11, bold: true, margin: [0, 4, 0, 10] },
      { text: 'CURSO', fontSize: 7, color: accent },
      { text: list.class_name, bold: true, margin: [0, 4, 0, 10] },
      ...(list.comuna
        ? [
            {
              text: list.comuna,
              fontSize: 9,
              margin: [0, 0, 0, 5] as [number, number, number, number],
            },
          ]
        : []),
      ...(list.region
        ? [
            {
              text: list.region,
              fontSize: 9,
              margin: [0, 0, 0, 5] as [number, number, number, number],
            },
          ]
        : []),
      { text: `Año escolar ${list.school_year}`, fontSize: 9, color: green },
    ],
    margin: [0, 0, 0, 18],
  };
  const instructions: PdfContent = list.instructions
    ? {
        margin: [0, 10, 0, 12],
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: [
                  { text: 'Antes de preparar la mochila', bold: true, fontSize: 9, color: accent },
                  { text: list.instructions, fontSize: 9, margin: [0, 5, 0, 0] },
                ],
                fillColor: warm,
                margin: [8, 8, 8, 8],
              },
            ],
          ],
        },
        layout: 'noBorders',
      }
    : { text: '' };
  let content: PdfContent[] = [];
  if (prefs.layout === 'columns') {
    content = [
      {
        text: `LISTA ESCOLAR · ${list.school_year}`,
        fontSize: 8,
        bold: true,
        color: accent,
        characterSpacing: 2,
        margin: [0, 0, 0, 9],
      },
      {
        columns: [
          {
            stack: [
              { text: 'Todo a mano', fontSize: 27, bold: true, color: ink },
              {
                text: 'para empezar',
                fontSize: 27,
                bold: true,
                color: green,
                margin: [0, 0, 0, 8],
              },
              {
                text: 'Tu lista de útiles, organizada para marcar lo que ya tienes.',
                fontSize: 9,
                color: muted,
                margin: [0, 0, 0, 18],
              },
            ],
          },
          ...(logo ? [{ image: logo, fit: [60, 60] as [number, number], width: 65 }] : []),
        ],
      },
      identification,
    ];
    const entries = [...groups];
    for (let i = 0; i < entries.length; i += 2) {
      content.push({
        columns: [group(...entries[i]), entries[i + 1] ? group(...entries[i + 1]) : { text: '' }],
        columnGap: 14,
      });
    }
    content.push(instructions);
  } else if (prefs.layout === 'sidebar') {
    content = [
      {
        text: 'GUÍA PARA FAMILIAS',
        fontSize: 8,
        bold: true,
        color: green,
        characterSpacing: 2,
        margin: [0, 0, 0, 10],
      },
      {
        text: 'Lista de\nútiles escolares.',
        fontSize: 25,
        bold: true,
        color: ink,
        margin: [0, 0, 0, 10],
      },
      {
        text: 'Una lista simple para preparar el año escolar.',
        fontSize: 9,
        color: muted,
        margin: [0, 0, 0, 20],
      },
      ...(extendedIdentity ? [fullIdentity] : []),
      ...[...groups].map(([name, items], index) =>
        group(`${String(index + 1).padStart(2, '0')}  ${name}`, items),
      ),
      instructions,
    ];
  } else {
    content = [
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: [
                  {
                    text: `AÑO ESCOLAR ${list.school_year}`,
                    fontSize: 8,
                    bold: true,
                    color: green,
                    characterSpacing: 2,
                  },
                  {
                    text: 'Tu lista,\nen un vistazo.',
                    fontSize: 27,
                    bold: true,
                    color: ink,
                    margin: [0, 10, 0, 8],
                  },
                  { text: 'Marca cada útil a medida que lo consigas.', fontSize: 9, color: green },
                ],
                fillColor: light,
                margin: [12, 10, 12, 10],
              },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 14],
      },
      identification,
    ];
    if (logo) content.push({ image: logo, fit: [55, 55], margin: [0, 0, 0, 12] });
    const card = (item: Item): TableCell => ({
      stack: [
        {
          unbreakable: true,
          stack: [
            {
              columns: [
                { ...checkbox(), width: 12 },
                { text: item.category, fontSize: 8, color: green, bold: true },
                {
                  text: `${item.quantity.replace('.', ',')} ${item.unit}${item.alternatives?.length ? '\nen total' : ''}`,
                  fontSize: 11,
                  bold: true,
                  color: accent,
                  alignment: 'right',
                  width: 70,
                },
              ],
            },
            { text: item.name, bold: true, fontSize: 10, margin: [0, 12, 0, 5] },
          ],
        },
        ...(attributeSummary(item.attributes)
          ? [{ text: attributeSummary(item.attributes), fontSize: 8, color: muted }]
          : []),
        ...alternatives(item),
        ...(item.note ? [{ text: item.note, fontSize: 8.5, color: muted }] : []),
      ],
      margin: [9, 9, 9, 10],
    });
    const rows: TableCell[][] = [];
    for (let i = 0; i < list.items.length; i += 2) {
      rows.push([
        card(list.items[i]),
        list.items[i + 1]
          ? card(list.items[i + 1])
          : { text: '', border: [false, false, false, false] },
      ]);
    }
    if (rows.length)
      content.push({
        table: { widths: ['*', '*'], body: rows },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => border,
          vLineColor: () => border,
          paddingLeft: () => 2,
          paddingRight: () => 2,
          paddingTop: () => 3,
          paddingBottom: () => 3,
        },
      });
    content.push(instructions);
  }
  if (meta.archived)
    content.unshift({
      text: 'LISTA ARCHIVADA · Ya no se mantiene actualizada',
      fontSize: 9,
      bold: true,
      color: accent,
      margin: [0, 0, 0, 10],
    });
  const sidebar = prefs.layout === 'sidebar';
  return {
    pageSize: prefs.paper,
    pageMargins: sidebar ? [180, 42, 30, 65] : [38, 38, 38, 65],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: ink },
    info: {
      title: `Lista escolar · ${list.school} · ${list.class_name}`,
      subject: version,
      creator: 'Lista Escolar',
    },
    content,
    background: sidebar
      ? (_page, size) => ({
          stack: [
            {
              canvas: [
                {
                  type: 'rect',
                  x: 0,
                  y: 0,
                  w: 150,
                  h: size.height,
                  color: prefs.color ? '#294c5d' : '#e8e8e8',
                },
              ],
            },
            {
              absolutePosition: { x: 20, y: 34 },
              columns: [
                {
                  width: 110,
                  stack: [
                    ...(logo
                      ? [
                          {
                            image: logo,
                            fit: [55, 55] as [number, number],
                            margin: [0, 0, 0, 15] as [number, number, number, number],
                          },
                        ]
                      : [
                          {
                            text: 'LE',
                            fontSize: 25,
                            bold: true,
                            margin: [0, 0, 0, 20] as [number, number, number, number],
                          },
                        ]),
                    {
                      text: 'LISTA ESCOLAR',
                      fontSize: 8,
                      characterSpacing: 2,
                      margin: [0, 0, 0, 24],
                    },
                    { text: 'ESTABLECIMIENTO', fontSize: 7, margin: [0, 0, 0, 6] },
                    {
                      text: compact(list.school, 80),
                      bold: true,
                      fontSize: 13,
                      margin: [0, 0, 0, 20],
                    },
                    {
                      text: compact(list.class_name, 45),
                      bold: true,
                      fontSize: 12,
                      margin: [0, 0, 0, 20],
                    },
                    {
                      text: String(list.school_year),
                      fontSize: 25,
                      bold: true,
                      margin: [0, 0, 0, 20],
                    },
                    {
                      text: compact(locality, 100),
                      fontSize: 9,
                      margin: [0, 0, 0, 20],
                    },
                    { text: version, fontSize: 8 },
                    ...(extendedIdentity
                      ? [
                          {
                            text: 'Datos completos al inicio de la lista.',
                            fontSize: 8,
                            margin: [0, 14, 0, 0] as [number, number, number, number],
                          },
                        ]
                      : []),
                  ],
                  color: prefs.color ? '#ffffff' : '#252525',
                },
                { text: '', width: '*' },
              ],
            },
          ],
        })
      : undefined,
    footer: (page, pages) => ({
      margin: sidebar ? [180, 10, 30, 0] : [38, 10, 38, 0],
      stack: [
        {
          text: `${compact(list.school, 70)} · ${compact(list.class_name, 40)} · ${version}`,
          fontSize: 7,
          color: green,
        },
        {
          columns: [
            { text: meta.url, link: meta.url, fontSize: 7, color: green, margin: [0, 4, 0, 0] },
            { text: `${page} / ${pages}`, fontSize: 7, alignment: 'right', width: 40 },
          ],
        },
      ],
    }),
  };
}
