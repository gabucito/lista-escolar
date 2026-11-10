import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PdfPreview } from './pdf-preview';

const pdfjs = vi.hoisted(() => ({ getDocument: vi.fn(), GlobalWorkerOptions: { workerSrc: '' } }));
vi.mock('pdfjs-dist', () => pdfjs);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function mockDocument() {
  const cancel = vi.fn();
  const render = vi.fn(() => ({ promise: Promise.resolve(), cancel }));
  const page = {
    getViewport: vi.fn(() => ({ width: 612, height: 792 })),
    render,
    getTextContent: vi.fn().mockResolvedValue({ items: [{ str: 'Contenido de la página' }] }),
    cleanup: vi.fn(),
  };
  const getPage = vi.fn().mockResolvedValue(page);
  const destroy = vi.fn().mockResolvedValue(undefined);
  pdfjs.getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: 2, getPage }),
    destroy,
  });
  return { getPage, render, cancel, destroy };
}

async function mount() {
  TestBed.configureTestingModule({ imports: [PdfPreview] });
  const fixture = TestBed.createComponent(PdfPreview);
  fixture.componentRef.setInput('url', 'blob:mock-preview');
  await fixture.whenStable();
  await vi.waitFor(() =>
    expect(fixture.componentInstance.image()).toBe('data:image/png;base64,preview'),
  );
  return fixture;
}

describe('PDF page rendering lifecycle', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,preview',
    );
    pdfjs.getDocument.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('clears the old page on render failure and removes the error after a successful retry', async () => {
    const document = mockDocument();
    const fixture = await mount();
    const preview = fixture.componentInstance;
    expect(preview.pageText()).toBe('Contenido de la página');
    document.render.mockReturnValueOnce({
      promise: Promise.reject(new Error('Render failed')),
      cancel: document.cancel,
    });

    preview.turn(1);
    expect(preview.page()).toBe(2);
    expect(preview.image()).toBe('');
    expect(preview.pageText()).toBe('');
    await vi.waitFor(() => expect(preview.error()).toContain('No pudimos mostrar esta página'));
    expect(preview.busy()).toBe(false);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();

    preview.resize(100); // Retry the current page without changing the PDF or its options.
    expect(preview.error()).toBe('');
    await vi.waitFor(() => expect(preview.image()).toBe('data:image/png;base64,preview'));
    expect(preview.pageText()).toBe('Contenido de la página');
    expect(preview.error()).toBe('');
    expect(preview.page()).toBe(2);
    expect(document.getPage).toHaveBeenLastCalledWith(2);
    fixture.destroy();
  });

  it('cancels a pending render and never restores its image after the preview is destroyed', async () => {
    const document = mockDocument();
    const fixture = await mount();
    const preview = fixture.componentInstance;
    const pending = deferred();
    document.render.mockReturnValueOnce({ promise: pending.promise, cancel: document.cancel });
    preview.turn(1);
    await vi.waitFor(() => expect(document.render).toHaveBeenCalledTimes(2));

    fixture.destroy();
    expect(document.cancel).toHaveBeenCalled();
    expect(document.destroy).toHaveBeenCalled();
    expect(preview.image()).toBe('');
    pending.resolve();
    await pending.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(preview.image()).toBe('');
    expect(preview.pageText()).toBe('');
    expect(preview.pages()).toBe(0);
  });
});
