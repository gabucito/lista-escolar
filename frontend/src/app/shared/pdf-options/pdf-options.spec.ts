import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { Api } from '../../core/api';
import { Pdf } from '../../core/pdf';
import { Session } from '../../core/session';
import { PdfOptions } from './pdf-options';

describe('PDF preview authorization lifecycle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('revokes a late preview when the dialog was closed while generating', async () => {
    const revoke = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override revokeObjectURL = revoke;
      },
    );
    let finish!: (url: string) => void;
    const generate = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    TestBed.configureTestingModule({
      imports: [PdfOptions],
      providers: [
        { provide: Pdf, useValue: { generate } },
        { provide: Session, useValue: { user: signal(undefined) } },
      ],
    });
    const fixture = TestBed.createComponent(PdfOptions);
    fixture.componentRef.setInput('listId', 'example');
    await fixture.whenStable();
    const pending = fixture.componentInstance.open();
    await Promise.resolve();
    expect(generate).toHaveBeenCalled();
    fixture.componentInstance.close();
    finish('blob:late-preview');
    await pending;
    expect(fixture.componentInstance.opened()).toBe(false);
    expect(fixture.componentInstance.rawUrl()).toBe('');
    expect(revoke).toHaveBeenCalledWith('blob:late-preview');
    fixture.destroy();
  });

  it('keeps download overrides local until remembering preferences is selected', async () => {
    const user = {
      id: 'user',
      email: 'qa@example.invalid',
      display_name: 'QA',
      preferences: { layout: 'columns', paper: 'LETTER', color: true },
    };
    TestBed.configureTestingModule({
      imports: [PdfOptions],
      providers: [
        { provide: Pdf, useValue: { generate: vi.fn().mockResolvedValue('') } },
        { provide: Session, useValue: { user: signal(user) } },
      ],
    });
    const api = TestBed.inject(Api);
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ user });
    const fixture = TestBed.createComponent(PdfOptions);
    fixture.componentRef.setInput('listId', 'example');
    await fixture.whenStable();
    fixture.componentInstance.choose('cards');
    await fixture.componentInstance.generate(false);
    expect(patch).not.toHaveBeenCalled();
    fixture.componentInstance.downloadOptions.set({ remember: true });
    await fixture.componentInstance.generate(false);
    expect(patch).toHaveBeenCalledWith('/auth/me', {
      display_name: 'QA',
      preferences: { layout: 'cards', paper: 'LETTER', color: true },
    });
    fixture.destroy();
  });

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
