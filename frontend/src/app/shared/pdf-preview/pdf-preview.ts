import { Component, effect, input, signal, untracked } from '@angular/core';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

@Component({
  imports: [],
  selector: 'app-pdf-preview',
  styleUrl: './pdf-preview.scss',
  templateUrl: './pdf-preview.html',
})
export class PdfPreview {
  readonly url = input.required<string>();
  readonly pages = signal(0);
  readonly page = signal(1);
  readonly zoom = signal(100);
  readonly image = signal('');
  readonly pageText = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  private document?: PDFDocumentProxy;
  private loading?: PDFDocumentLoadingTask;
  private rendering?: RenderTask;
  private sequence = 0;

  constructor() {
    effect((onCleanup) => {
      const url = this.url();
      untracked(() => void this.load(url));
      onCleanup(() => this.release());
    });
  }
  private release() {
    this.sequence++;
    this.rendering?.cancel();
    void this.loading?.destroy().catch(() => {});
    this.rendering = undefined;
    this.loading = undefined;
    this.document = undefined;
    this.image.set('');
    this.pageText.set('');
    this.pages.set(0);
  }
  private async load(url: string) {
    this.release();
    const sequence = this.sequence;
    this.busy.set(true);
    this.error.set('');
    this.page.set(1);
    this.zoom.set(100);
    try {
      const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
      if (sequence !== this.sequence) return;
      GlobalWorkerOptions.workerSrc = '/assets/pdf/pdf.worker.min.mjs';
      this.loading = getDocument({ url });
      const document = await this.loading.promise;
      if (sequence !== this.sequence) return;
      this.document = document;
      this.pages.set(document.numPages);
      await this.render(sequence);
    } catch {
      if (sequence === this.sequence) {
        this.error.set('No pudimos mostrar la vista previa. Puedes abrir o descargar el PDF.');
        this.busy.set(false);
      }
    }
  }
  private async render(sequence = this.sequence) {
    if (!this.document) return;
    this.busy.set(true);
    this.error.set('');
    this.image.set('');
    this.pageText.set('');
    try {
      const page = await this.document.getPage(this.page());
      if (sequence !== this.sequence) return;
      const viewport = page.getViewport({ scale: (1.5 * this.zoom()) / 100 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      this.rendering = page.render({ canvas, viewport });
      await this.rendering.promise;
      const text = await page.getTextContent();
      if (sequence !== this.sequence) return;
      this.image.set(canvas.toDataURL('image/png'));
      this.pageText.set(text.items.map((item) => ('str' in item ? item.str : '')).join(' '));
      page.cleanup();
    } catch {
      if (sequence === this.sequence)
        this.error.set('No pudimos mostrar esta página. Puedes descargar el PDF.');
    } finally {
      if (sequence === this.sequence) this.busy.set(false);
    }
  }
  turn(delta: number) {
    if (this.busy()) return;
    const next = this.page() + delta;
    if (next < 1 || next > this.pages()) return;
    this.page.set(next);
    void this.render();
  }
  resize(value: number) {
    if (this.busy() || value < 75 || value > 200) return;
    this.zoom.set(value);
    void this.render();
  }
}
