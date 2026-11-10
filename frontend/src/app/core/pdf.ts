import { Service, inject } from '@angular/core';
import { Api } from './api';
import { Content, Draft, ListDetail, PdfPreferences } from './models';
import { makeDocument } from './pdf-document';
@Service()
export class Pdf {
  private api = inject(Api);
  async generate(
    listId: string,
    version: number,
    prefs: PdfPreferences,
    preview = false,
    draft = false,
  ) {
    const context = draft
      ? await this.api.get<Draft>(`/lists/${listId}/draft`)
      : await this.api.get<ListDetail>(`/lists/${listId}?version=${version}`);
    const content: Content = context.content;
    let logo = '';
    if (content.logo_id) {
      const response = await fetch('/api/assets/' + content.logo_id, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) {
        this.api.reportDenial('/assets/' + content.logo_id, response.status);
        throw new Error(
          'El logo ya no está disponible. Actualiza la lista e inténtalo nuevamente.',
        );
      }
      const blob = await response.blob();
      logo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    if (logo && !prefs.color) logo = await this.monochrome(logo);
    const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
      import('pdfmake/build/pdfmake'),
      import('pdfmake/build/vfs_fonts'),
    ]);
    pdfMake.addVirtualFileSystem(fonts);
    const doc = pdfMake.createPdf(
      makeDocument(
        content,
        {
          version,
          published_at: 'published_at' in context ? context.published_at : '',
          url: location.origin + '/listas/' + listId,
          draft,
          archived: context.archived,
        },
        prefs,
        logo,
      ),
    );
    const blob = await doc.getBlob();
    const url = URL.createObjectURL(blob);
    if (preview) return url;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `lista-${content.school.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60)}-${content.school_year}.pdf`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return '';
  }
  private async monochrome(source: string): Promise<string> {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No fue posible preparar el logo en blanco y negro.');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const gray = Math.round(
        pixels.data[i] * 0.2126 + pixels.data[i + 1] * 0.7152 + pixels.data[i + 2] * 0.0722,
      );
      pixels.data[i] = gray;
      pixels.data[i + 1] = gray;
      pixels.data[i + 2] = gray;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL('image/png');
  }
}
