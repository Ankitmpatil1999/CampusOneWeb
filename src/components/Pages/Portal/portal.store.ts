import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiProblem } from '../../Utils/problem';
import { translate } from '../../Utils/translate';
import { PortalApi, type Invoice, type PortalAccount } from './portal.api';
import { shownStatus } from './Shared/PortalUi';

export const payable = (v: Pick<Invoice, 'status'>) =>
  v.status === 'DUE' || v.status === 'GRACE' || v.status === 'OVERDUE';

/**
 * The signed-in institution's overview (SAS-007): status, plan, invoices, checklist progress and
 * recent notices. The account frame loads it; pages read it and reload it after a change so the
 * header, the menu counts and the overview stay current.
 */
@Injectable({ providedIn: 'root' })
export class PortalStore {
  private readonly api = inject(PortalApi);
  readonly account = signal<PortalAccount | null>(null);
  readonly error = signal('');
  private inflight: Promise<void> | null = null;

  readonly shown = computed(() => {
    const a = this.account();
    return a ? shownStatus(a.institution.status, a.billing.subscription?.status) : null;
  });
  readonly unpaid = computed(() => (this.account()?.billing.invoices ?? []).filter(payable));
  readonly late = computed(() =>
    this.unpaid().some((v) => v.status === 'GRACE' || v.status === 'OVERDUE'),
  );
  /** SP.homeFor: the checklist until the institution is live and set up, then the overview. */
  readonly home = computed(() => {
    const a = this.account();
    if (!a) return '/portal/account';
    return a.institution.status === 'PENDING_ACTIVATION' || a.onboarding.missing.length
      ? '/portal/onboard'
      : '/portal/account';
  });

  /** Loads the overview again (parallel callers share one request). */
  refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        this.account.set(await this.api.account());
        this.error.set('');
      } catch (e) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  clear() {
    this.account.set(null);
    this.error.set('');
  }
}
