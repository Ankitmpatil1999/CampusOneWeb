import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Amount } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { formatDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { OpsHomeApi, type OpsSearch } from '../Home/home.api';
import { INVOICE_STATUS, type InvoiceStatus } from '../Plans/plans.api';

const INSTITUTION: Readonly<Record<string, { l: string; tone: string }>> = {
  ACTIVE: { l: 'Active', tone: 'ok' },
  PENDING_ACTIVATION: { l: 'Pending activation', tone: 'warn' },
  SUSPENDED: { l: 'Suspended', tone: 'bad' },
  CANCELLED: { l: 'Cancelled', tone: 'neutral' },
};
const TRIAL = { l: 'Trial', tone: 'info' } as const;
const TYPE_DELAY_MS = 300;

type InstitutionHit = OpsSearch['institutions'][number];
type InvoiceHit = OpsSearch['invoices'][number];

/**
 * o.search — Search (RNG-GOV-008; RPT-008; prototype o.search): the top bar's search opens here
 * with `?q=`. Institutions by name, identifier, short name or city, and invoices by number — never
 * a member's personal record. Every search is recorded in the activity log by the server.
 * Settlements, transaction references and tickets join with their modules (Phases 3, 6, 8).
 */
@Component({
  selector: 'rp-backoffice-search',
  imports: [Amount, Avatar, Empty, Icon, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head title="Search" [sub]="sub()" />
      <div class="c-filters">
        <label class="search"
          ><rp-icon name="search" [size]="16" /><input
            type="search"
            id="ob-sq"
            placeholder="Institution, identifier, city or invoice number"
            autocomplete="off"
            aria-label="Search"
            [value]="text()"
            (input)="typed($event)"
            (keydown.enter)="submit()"
        /></label>
        <span class="fsum"
          ><rp-icon name="shield" [size]="13" /> Searches are recorded in the activity log</span
        >
      </div>
      @if (query().length < 2) {
        <div class="card pad">
          <rp-empty
            icon="search"
            title="Type at least two characters"
            text="Try an institution name, its identifier or city, or an invoice number like INV-2026-0902."
          />
        </div>
      } @else if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't search" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="run(query())">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else if (results(); as r) {
        @if (!r.data.institutions.length && !r.data.invoices.length) {
          <div class="card pad">
            <rp-empty
              icon="search"
              [title]="'No results for “' + r.q + '”'"
              [text]="
                'Your role (' +
                role() +
                ') searches institutions and invoices. Check the spelling or search by identifier or invoice number.'
              "
            />
          </div>
        }
        @if (r.data.institutions.length) {
          <div>
            <div class="sec-h">
              <h3>Institutions · {{ r.data.institutions.length }}</h3>
            </div>
            <div class="list">
              @for (i of r.data.institutions; track i.id) {
                @if (can('task.tenants')) {
                  <button type="button" class="li" (click)="openInstitution(i)">
                    <rp-av [name]="i.name" />
                    <span class="li-main"
                      ><span class="li-t">{{ i.name }}</span
                      ><span class="li-s"
                        ><span class="t-mono">{{ i.identifier }}</span> · {{ i.city
                        }}{{ i.plan ? ' · ' + i.plan : '' }}</span
                      ></span
                    ><span class="li-r"
                      ><span [class]="'chip dot tone-' + inst(i).tone">{{ inst(i).l }}</span></span
                    ><span class="li-chev"><rp-icon name="right" [size]="16" /></span>
                  </button>
                } @else {
                  <div class="li">
                    <rp-av [name]="i.name" />
                    <span class="li-main"
                      ><span class="li-t">{{ i.name }}</span
                      ><span class="li-s"
                        ><span class="t-mono">{{ i.identifier }}</span> · {{ i.city
                        }}{{ i.plan ? ' · ' + i.plan : '' }}</span
                      ></span
                    ><span class="li-r"
                      ><span [class]="'chip dot tone-' + inst(i).tone">{{ inst(i).l }}</span></span
                    >
                  </div>
                }
              }
            </div>
          </div>
        }
        @if (r.data.invoices.length) {
          <div>
            <div class="sec-h">
              <h3>Invoices · {{ r.data.invoices.length }}</h3>
            </div>
            <div class="list">
              @for (v of r.data.invoices; track v.id) {
                <button
                  type="button"
                  class="li"
                  [disabled]="!can('task.tenants')"
                  (click)="openInvoice(v)"
                >
                  <span class="li-ic sm"><rp-icon name="receipt" [size]="16" /></span>
                  <span class="li-main"
                    ><span class="li-t"
                      ><span class="t-mono">{{ v.invoiceNo }}</span> · {{ v.institution }}</span
                    ><span class="li-s">Issued {{ date(v.issuedOn) }}</span></span
                  ><span class="li-r"
                    ><b class="t-num"><rp-amt [value]="v.total" /></b
                    ><span [class]="'chip dot tone-' + invoice(v).tone">{{
                      invoice(v).label
                    }}</span></span
                  >
                  @if (can('task.tenants')) {
                    <span class="li-chev"><rp-icon name="right" [size]="16" /></span>
                  }
                </button>
              }
            </div>
          </div>
        }
      } @else if (loading()) {
        <div class="card pad"><rp-empty icon="hourglass" title="Searching…" /></div>
      }
    </div>
  `,
})
export class BackofficeSearch {
  private readonly api = inject(OpsHomeApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly session = inject(SessionContext).ops;

  protected readonly text = signal('');
  protected readonly query = signal('');
  protected readonly results = signal<{ q: string; data: OpsSearch } | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly role = computed(() => this.session()?.role.name ?? 'operator');
  protected readonly sub = computed(() => {
    const q = this.query();
    return q
      ? `Results for “${q}” across the areas your role can see`
      : 'Search institutions and invoices';
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      const q = (p.get('q') ?? '').trim();
      if (q !== this.text().trim()) this.text.set(q);
      void this.run(q);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected async run(q: string) {
    this.query.set(q);
    const n = ++this.seq;
    if (q.length < 2) {
      this.results.set(null);
      this.loading.set(false);
      this.error.set('');
      return;
    }
    this.loading.set(true);
    try {
      const data = await this.api.search(q);
      if (n !== this.seq) return;
      this.results.set({ q, data });
      this.error.set('');
    } catch (e) {
      if (n !== this.seq) return;
      this.results.set(null);
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  /** Typing searches after a short pause; the address keeps the search (back and reload work). */
  protected typed(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    this.text.set(v);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.go(v), TYPE_DELAY_MS);
  }

  protected submit() {
    clearTimeout(this.timer);
    this.go(this.text());
  }

  private go(v: string) {
    const q = v.trim();
    if (q === this.query()) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: q || null },
      replaceUrl: true,
    });
  }

  protected openInstitution(i: InstitutionHit) {
    void this.router.navigate(['/backoffice/institutions'], { queryParams: { open: i.id } });
  }

  protected openInvoice(v: InvoiceHit) {
    if (!this.can('task.tenants')) return;
    void this.router.navigate(['/backoffice/plans'], { queryParams: { invoice: v.id } });
  }

  protected can(subTask: string) {
    return this.session()?.subTasks.includes(subTask) ?? false;
  }
  protected inst(i: InstitutionHit) {
    // Trials are active institutions on a trial subscription (the institutions page's rule).
    if (i.status === 'ACTIVE' && i.subscription === 'TRIAL') return TRIAL;
    return INSTITUTION[i.status] ?? { l: i.status, tone: 'neutral' };
  }
  protected invoice(v: InvoiceHit) {
    return INVOICE_STATUS[v.status as InvoiceStatus] ?? { label: v.status, tone: 'neutral' };
  }
  protected date(v: string) {
    return formatDate(v);
  }
}
