import { DestroyRef, inject } from '@angular/core';

/**
 * Keeps a page current without a reload (client 2026-10-15: lists that change elsewhere — a leave
 * decided by the principal, homework handed in — show the change on their own): calls `refresh`
 * every `everyMs` while the page is visible, and at once when the person comes back to the tab.
 * Call it in an injection context (a field initializer or the constructor); it stops with the page.
 */
export function refreshWhileVisible(refresh: () => unknown, everyMs: number) {
  const run = () => {
    if (document.visibilityState !== 'hidden') void refresh();
  };
  const timer = setInterval(run, everyMs);
  document.addEventListener('visibilitychange', run);
  inject(DestroyRef).onDestroy(() => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', run);
  });
}
