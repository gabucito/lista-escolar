import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { App } from './app';
import { Session } from './core/session';

describe('Application navigation', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: Session, useValue: { user: signal(undefined) } }],
    });
  });
  it('exposes search, account access and the local administration entry', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const links = [...fixture.nativeElement.querySelectorAll('a')].map((a: HTMLAnchorElement) =>
      a.getAttribute('href'),
    );
    expect(links).toContain('/');
    expect(links).toContain('/ingresar');
    expect(links).toContain('/admin');
  });
});
