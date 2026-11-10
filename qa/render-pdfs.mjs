import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, DOMMatrix, Path2D, ImageData } from '@napi-rs/canvas';
import { inspectCheckboxes } from './pdf-inspection.mjs';

Object.assign(globalThis, { DOMMatrix, Path2D, ImageData });
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, '.local/qa/artifacts');
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, '.local/qa/rendered');
mkdirSync(output, { recursive: true });
const sources = readdirSync(artifacts).filter(name => name.endsWith('.pdf')).sort().map(name => ({ file: path.join(artifacts, name), name, reference: false }));
const concepts = path.join(root, 'design/concepts/pdf/alternativas');
for (const name of readdirSync(concepts).filter(name => /^(04|05|06)-.*\.pdf$/.test(name)).sort()) sources.push({ file: path.join(concepts, name), name: 'reference-' + name, reference: true });

async function contactSheet(pages, file, columns = 4, width = 220) {
  const cellWidth = width + 16, cellHeight = Math.round(width * 1.46) + 46;
  const canvas = createCanvas(columns * cellWidth + 16, Math.ceil(pages.length / columns) * cellHeight + 16);
  const context = canvas.getContext('2d');
  context.fillStyle = '#dfe3e6'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = '11px sans-serif'; context.textBaseline = 'top';
  for (let index = 0; index < pages.length; index++) {
    const entry = pages[index]; const image = await loadImage(entry.file);
    const x = 16 + index % columns * cellWidth, y = 16 + Math.floor(index / columns) * cellHeight;
    const height = image.height * width / image.width;
    context.drawImage(image, x, y + 30, width, height);
    context.fillStyle = '#172b36'; context.fillText(entry.label.slice(0, 39), x, y, width);
    context.fillText(`página ${entry.page}`, x, y + 13, width);
  }
  writeFileSync(path.join(output, file), canvas.toBuffer('image/png'));
}

const results = [], generatedPages = [], referencePages = [];
for (const source of sources) {
  const stem = source.name.replace(/\.pdf$/, '').replace(/[^\p{L}\p{N}._-]/gu, '-');
  const task = getDocument({ data: new Uint8Array(readFileSync(source.file)), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    const record = { filename: source.name, reference: source.reference, pages: pdf.numPages, bounds: [], text: [], images: [], chromatic_pixels: [], checkboxes: [] };
    const thumbnails = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const native = page.getViewport({ scale: 1 }), viewport = page.getViewport({ scale: 1.5 });
      record.checkboxes.push({ page: number, ...await inspectCheckboxes(page) });
      const text = await page.getTextContent();
      const textRows = [];
      for (const item of text.items) if ('str' in item && item.str.trim()) {
        const row = { text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height };
        textRows.push(row);
        if (row.x < -1 || row.x + row.width > native.width + 1 || row.y < -1 || row.y > native.height + 1) record.bounds.push({ page: number, ...row });
      }
      record.text.push({ page: number, width: native.width, height: native.height, rows: textRows });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context, viewport }).promise;
      const file = path.join(output, `${stem}-page-${String(number).padStart(2, '0')}.png`);
      writeFileSync(file, canvas.toBuffer('image/png'));
      record.images.push(path.basename(file));
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let chromatic = 0;
      for (let pixel = 0; pixel < data.length; pixel += 4) if (data[pixel + 3] > 250 && Math.max(data[pixel], data[pixel + 1], data[pixel + 2]) - Math.min(data[pixel], data[pixel + 1], data[pixel + 2]) > 8) chromatic++;
      record.chromatic_pixels.push(chromatic);
      const thumbnail = { file, label: stem, page: number }; thumbnails.push(thumbnail);
      (source.reference ? referencePages : generatedPages).push(thumbnail);
      page.cleanup();
    }
    record.contact = `${stem}-contact.png`;
    await contactSheet(thumbnails, record.contact, Math.min(4, thumbnails.length));
    results.push(record);
    console.log(JSON.stringify({ filename: source.name, pages: pdf.numPages, bounds: record.bounds.length, chromatic_pixels: record.chromatic_pixels }));
  } finally { await task.destroy(); }
}
if (generatedPages.length) await contactSheet(generatedPages, 'all-generated-pages.png', 6, 180);
if (referencePages.length) await contactSheet(referencePages, 'approved-reference-pages.png', 3, 280);
writeFileSync(path.join(output, 'render-report.json'), JSON.stringify(results, null, 2));
const escape = text => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
writeFileSync(path.join(output, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Lista Escolar · PDF visual QA</title><style>body{font:16px system-ui;background:#eef0f2;padding:24px}img{max-width:100%}section{margin-bottom:40px}p{color:#456}</style><h1>PDF visual QA</h1><p>Every rendered page, approved references, text bounds and color measurements are available alongside this file.</p>${results.map(row => `<section><h2>${escape(row.filename)}</h2><p>${row.pages} pages · ${row.bounds.length} text-bound warnings</p><a href="${row.contact}"><img src="${row.contact}" alt="${escape(row.filename)} contact sheet"></a><p>${row.images.map((name, index) => `<a href="${name}">Page ${index + 1}</a>`).join(' · ')}</p></section>`).join('')}`);
console.log(JSON.stringify({ output, pdfs: results.length, generated_pages: generatedPages.length, reference_pages: referencePages.length }));
