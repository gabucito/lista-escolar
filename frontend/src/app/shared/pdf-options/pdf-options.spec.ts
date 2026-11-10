import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { Api } from '../../core/api';
import { Pdf } from '../../core/pdf';
import { Session } from '../../core/session';
import { PdfOptions } from './pdf-options';

describe('PDF preview authorization lifecycle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('closes on a new access event and permits a fresh authorized preview after logout or denial', async () => {
    const revoke = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override revokeObjectURL = revoke;
      },
    );
    const generate = vi.fn().mockResolvedValue('blob:authorized-preview');
    TestBed.configureTestingModule({
      imports: [PdfOptions],
      providers: [
        { provide: Pdf, useValue: { generate } },
        { provide: Session, useValue: { user: signal(undefined) } },
      ],
    });
    const api = TestBed.inject(Api);
    api.clearContent(); // A preceding logout must not poison newly mounted previews.
    const fixture = TestBed.createComponent(PdfOptions);
    fixture.componentRef.setInput('listId', 'example');
    await fixture.whenStable();
    await fixture.componentInstance.generate(true);
    await fixture.whenStable();
    expect(fixture.componentInstance.rawUrl()).toBe('blob:authorized-preview');
    api.reportDenial('/lists/example/vote', 403);
    await fixture.whenStable();
    expect(fixture.componentInstance.rawUrl()).toBe('');
    await fixture.componentInstance.generate(true);
    await fixture.whenStable();
    expect(fixture.componentInstance.rawUrl()).toBe('blob:authorized-preview');
    api.clearContent();
    await fixture.whenStable();
    expect(fixture.componentInstance.rawUrl()).toBe('');
    expect(revoke).toHaveBeenCalledWith('blob:authorized-preview');
    fixture.destroy();
  });
});
