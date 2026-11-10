import { afterNextRender, DestroyRef, Directive, ElementRef, inject, output } from '@angular/core';

/** Keyboard and focus behavior shared by the app's modal dialogs. */
@Directive({ selector: '[appModal]', host: { '(keydown)': 'keydown($event)', tabindex: '-1' } })
export class Modal {
  readonly dismissed = output<void>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  private readonly previousOverflow = document.body.style.overflow;
  private readonly siblings: { element: HTMLElement; inert: boolean }[] = [];
  private readonly isolated = new Set<HTMLElement>();
  private readonly observer = new MutationObserver(() => this.isolateBackground());

  private isolateBackground() {
    let branch: HTMLElement | null = this.element;
    while (branch?.parentElement && branch !== document.body) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (
          sibling !== branch &&
          sibling instanceof HTMLElement &&
          !['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName) &&
          !this.isolated.has(sibling)
        ) {
          this.siblings.push({ element: sibling, inert: sibling.inert });
          this.isolated.add(sibling);
          sibling.inert = true;
        }
      }
      this.observer.observe(branch.parentElement, { childList: true });
      branch = branch.parentElement;
    }
  }

  constructor() {
    afterNextRender(() => {
      this.isolateBackground();
      document.body.style.overflow = 'hidden';
      (this.focusable()[0] || this.element).focus();
    });
    inject(DestroyRef).onDestroy(() => {
      this.observer.disconnect();
      for (const sibling of this.siblings) sibling.element.inert = sibling.inert;
      document.body.style.overflow = this.previousOverflow;
      if (this.previousFocus?.isConnected) this.previousFocus.focus();
    });
  }

  private focusable(): HTMLElement[] {
    return Array.from(
      this.element.querySelectorAll<HTMLElement>(
        'a[href],button,input,select,textarea,iframe,[tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        !element.matches(':disabled, [aria-disabled="true"]') &&
        !element.closest('[inert]') &&
        element.getClientRects().length > 0,
    );
  }

  keydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      this.dismissed.emit();
    }
    if (event.key !== 'Tab') return;
    const elements = this.focusable(),
      first = elements[0],
      last = elements.at(-1);
    if (!first) {
      event.preventDefault();
      this.element.focus();
      return;
    }
    const active = document.activeElement;
    // Navigation may focus a heading with tabindex=-1 before the first control.
    // Reverse tabbing from that heading must stay inside the modal too.
    const beforeFirst =
      active !== null &&
      !!(first.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_PRECEDING);
    const afterLast =
      active !== null &&
      !!(last!.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (event.shiftKey && (active === first || active === this.element || beforeFirst)) {
      event.preventDefault();
      last!.focus();
    } else if (!event.shiftKey && (active === last || afterLast)) {
      event.preventDefault();
      first.focus();
    }
  }
}
