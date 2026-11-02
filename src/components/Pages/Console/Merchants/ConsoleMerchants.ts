import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Amount, amountPaise } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { InstitutionSetupApi } from '../Institution/institution.api';
import { MerchantDrawer } from './MerchantDrawer';
import { MerchantRegister } from './MerchantRegister';
import { ACCEPTS, STATUS, inrWhole, plural } from './merchant-format';
import {
  MerchantsApi,
  type Merchant,
  type MerchantList,
  type MerchantStatus,
  type MerchantSubType,
} from './merchants.api';

type SortKey = 'name' | 'sub' | 'uid' | 'status' | 'today';
const PAGE = 12;
const COLUMNS: readonly { k: SortKey | 'acc'; l: string; r: boolean; sort: boolean }[] = [
  { k: 'name', l: 'Merchant', r: false, sort: true },
  { k: 'sub', l: 'Sub-type', r: false, sort: true },
  { k: 'uid', l: 'Merchant ID', r: false, sort: true },
  { k: 'acc', l: 'Accepts', r: false, sort: false },
  { k: 'status', l: 'Status', r: false, sort: true },
  { k: 'today', l: 'Collections today', r: true, sort: true },
];

/**
 * c.merchants — Merchants & QR (SRS 12, FR-MER-01, FR-PAY-01; PAY-016…024, PAY-029, PAY-031;
 * prototype c.merchants): the key figures, search and filters, the merchants with what they accept
 * and today's collections, the merchant drawer (MerchantDrawer) and the registration modal
 * (MerchantRegister). Settlement figures arrive with settlements (Phase 6) and coupon redemptions
 * with coupons (Phase 4); until then their figures show "—".
 */
@Component({
  selector: 'rp-console-merchants',
  imports: [Amount, Avatar, Dropdown, Empty, Icon, MerchantDrawer, MerchantRegister, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Merchants & QR"
        sub="Campus sellers, vendors and the fee account — codes, bank details and today's collections."
      >
        @if (editWhy()) {
          <span class="cp-why" [attr.title]="editWhy()"
            ><button type="button" class="btn btn-pri" disabled>
              <rp-icon name="plus" [size]="17" /><span>Register merchant</span>
            </button></span
          >
        } @else {
          <button type="button" class="btn btn-pri" id="mer-new" (click)="openRegister()">
            <rp-icon name="plus" [size]="17" /><span>Register merchant</span>
          </button>
        }
      </rp-page-head>

      @if (readOnly()) {
        <div class="note tone-info">
          <rp-icon name="lock" [size]="17" />
          <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
        </div>
      }

      <div class="c-grid k4">
        <div class="kpi">
          <span class="k-ic"><rp-icon name="store" [size]="17" /></span>
          <span class="k-l">Active merchants</span>
          <span class="k-v"
            >{{ kpis() ? num(kpis()!.active) : '—' }}
            @if (kpis(); as k) {
              <small class="cm-of"> of {{ num(k.total) }}</small>
            }
          </span>
        </div>
        <div class="kpi">
          <span class="k-ic"><rp-icon name="rupee" [size]="17" /></span>
          <span class="k-l">Collections today</span>
          <span class="k-v">{{ kpis() ? whole(kpis()!.collectionsToday) : '—' }}</span>
          @if (kpis(); as k) {
            <span class="k-d">{{ successful(k.paymentsToday) }}</span>
          }
        </div>
        <div class="kpi">
          <span class="k-ic" style="background: var(--accent-soft); color: var(--accent)"
            ><rp-icon name="ticket" [size]="17"
          /></span>
          <span class="k-l">Coupon redemptions today</span>
          <span class="k-v">—</span>
        </div>
        <div class="kpi">
          <span class="k-ic"><rp-icon name="bank" [size]="17" /></span>
          <span class="k-l">Latest settlement</span>
          <span class="k-v">—</span>
        </div>
      </div>

      <div class="c-filters">
        <label class="search"
          ><rp-icon name="search" [size]="16" /><input
            type="search"
            id="mer-q"
            placeholder="Search name, merchant ID, operator"
            aria-label="Search merchants"
            autocomplete="off"
            [value]="q()"
            (input)="setQ($event)"
        /></label>
        <div class="pills" role="group" aria-label="Sub-type">
          @for (p of subPills; track p.v) {
            <button
              type="button"
              class="pill"
              [class.on]="sub() === p.v"
              [attr.aria-pressed]="sub() === p.v"
              (click)="sub.set(p.v)"
            >
              {{ p.l }}
            </button>
          }
        </div>
        <div class="fld">
          <rp-dd
            inputId="mer-st"
            placeholder="Any status"
            [options]="statusOptions"
            [value]="status()"
            (changed)="setStatus($event)"
          />
        </div>
        <span class="fsum">{{ summary() }}</span>
      </div>

      @if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the merchants" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else {
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                @for (c of columns; track c.k) {
                  <th
                    [class.sort]="c.sort"
                    [class.r]="c.r"
                    [class.asc]="c.sort && sort()?.k === c.k && sort()?.dir === 'asc'"
                    [class.desc]="c.sort && sort()?.k === c.k && sort()?.dir === 'desc'"
                    [attr.aria-sort]="ariaSort(c.k)"
                    (click)="c.sort && sortBy(c.k)"
                  >
                    @if (c.sort) {
                      <button
                        type="button"
                        class="cp-th"
                        (click)="$event.stopPropagation(); sortBy(c.k)"
                      >
                        {{ c.l
                        }}<span class="sa" aria-hidden="true">{{
                          sort()?.k === c.k && sort()?.dir === 'desc' ? '↓' : '↑'
                        }}</span>
                      </button>
                    } @else {
                      {{ c.l }}
                    }
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @if (loading() && !rows().length) {
                <tr>
                  <td [attr.colspan]="columns.length">
                    <rp-empty icon="hourglass" title="Loading…" />
                  </td>
                </tr>
              }
              @for (r of shown(); track r.id) {
                <tr tabindex="0" (click)="open(r.id)" (keydown.enter)="open(r.id)">
                  <td>
                    <div class="cell-main">
                      <rp-av [name]="r.displayName" size="sm" [sq]="true" />
                      <div style="min-width: 0">
                        <div class="cell-t t-clip">{{ r.displayName }}</div>
                        <div class="cell-s">
                          {{ r.department ?? '—' }}{{ r.operator ? ' · ' + r.operator : '' }}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      class="chip"
                      [class]="'chip tone-' + (r.subType === 'VENDOR' ? 'violet' : 'brand')"
                      >{{ r.subType === 'VENDOR' ? 'Vendor' : 'Regular' }}</span
                    >
                  </td>
                  <td>
                    <span class="t-mono">{{ r.uniqueId }}</span>
                  </td>
                  <td>
                    <span class="cm-accs">
                      @for (a of acceptsOf(r); track a.k) {
                        <span class="cm-acc on" [attr.title]="'Accepts ' + a.l.toLowerCase()"
                          ><rp-icon [name]="a.icon" [size]="12" />{{ a.l }}</span
                        >
                      }
                    </span>
                  </td>
                  <td>
                    <span class="chip dot" [class]="'chip dot tone-' + tone(r.status)">{{
                      statusLabel(r.status)
                    }}</span>
                  </td>
                  <td class="r">
                    <rp-amt [value]="r.today.amount" />
                    <div class="cell-s">{{ payments(r.today.count) }}</div>
                  </td>
                </tr>
              } @empty {
                @if (!loading()) {
                  <tr>
                    <td [attr.colspan]="columns.length">
                      <rp-empty
                        icon="store"
                        [title]="filtered() ? 'No merchants match' : 'No merchants yet'"
                        [text]="
                          filtered()
                            ? 'Clear the search or change the filters.'
                            : 'Register the canteen, bookstore or a vendor to start collecting payments.'
                        "
                      />
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        @if (rows().length > pageSize || data()?.nextCursor) {
          <div class="pager">
            <span
              >Showing
              <b class="t-num"
                >{{ (page() - 1) * pageSize + 1 }}–{{ min(page() * pageSize, rows().length) }}</b
              >
              of
              <b class="t-num">{{ num(rows().length) }}{{ data()?.nextCursor ? '+' : '' }}</b></span
            >
            <div class="pg">
              <button
                type="button"
                [disabled]="page() <= 1"
                aria-label="Previous"
                (click)="page.set(page() - 1)"
              >
                <rp-icon name="left" [size]="14" />
              </button>
              @for (n of pages(); track n) {
                <button type="button" [class.on]="n === page()" (click)="page.set(n)">
                  {{ n }}
                </button>
              }
              <button
                type="button"
                [disabled]="page() >= pages().length && !data()?.nextCursor"
                aria-label="Next"
                (click)="next()"
              >
                <rp-icon name="right" [size]="14" />
              </button>
            </div>
          </div>
        } @else if (rows().length) {
          <div class="pager">
            <span>{{ summary() }}</span>
          </div>
        }
      }
    </div>

    @if (openId(); as id) {
      <rp-merchant-drawer
        [merchantId]="id"
        [names]="names()"
        (closed)="openId.set(null)"
        (changed)="load()"
      />
    }
    @if (registering()) {
      <rp-merchant-register
        [departments]="departments()"
        [names]="nameList()"
        (closed)="registering.set(false)"
        (registered)="registered($event)"
      />
    }
  `,
  styles: `
    .cp-th {
      font: inherit;
      color: inherit;
      text-transform: inherit;
      letter-spacing: inherit;
      background: none;
      border: 0;
      padding: 0;
      cursor: pointer;
    }
    .cp-th:focus-visible {
      outline: 2px solid var(--brand-3);
      outline-offset: 2px;
      border-radius: 4px;
    }
  `,
})
export class ConsoleMerchants {
  private readonly api = inject(MerchantsApi);
  private readonly setup = inject(InstitutionSetupApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;
  private readonly route = inject(ActivatedRoute);

  protected readonly columns = COLUMNS;
  protected readonly pageSize = PAGE;
  protected readonly noTask = "Your role doesn't include this task.";
  protected readonly subPills: readonly { v: MerchantSubType | ''; l: string }[] = [
    { v: '', l: 'All' },
    { v: 'REGULAR', l: 'Regular' },
    { v: 'VENDOR', l: 'Vendor' },
  ];
  protected readonly statusOptions: DropdownOption[] = [
    { v: '', l: 'Any status' },
    { v: 'ACTIVE', l: 'Active' },
    { v: 'INACTIVE', l: 'Inactive' },
  ];

  protected readonly q = signal('');
  protected readonly sub = signal<MerchantSubType | ''>('');
  protected readonly status = signal<MerchantStatus | ''>('');
  protected readonly data = signal<MerchantList | null>(null);
  protected readonly rows = signal<readonly Merchant[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly openId = signal<string | null>(null);
  protected readonly registering = signal(false);
  protected readonly departments = signal<readonly { id: string; name: string }[]>([]);
  /** Every merchant of the institution (unfiltered), for the name checks. */
  private readonly all = signal<readonly { id: string; name: string }[]>([]);
  private seq = 0;
  private qTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The administrator makes changes here.'
      : '',
  );
  protected readonly editWhy = computed(
    () => this.readOnly() || (this.can('merchants.edit') ? '' : this.noTask),
  );
  protected readonly kpis = computed(() => this.data()?.kpis ?? null);
  protected readonly filtered = computed(() => Boolean(this.q() || this.sub() || this.status()));
  protected readonly names = computed(() => this.all());
  protected readonly nameList = computed(() => this.all().map((x) => x.name));
  protected readonly sorted = computed(() => {
    const list = [...this.rows()];
    const s = this.sort();
    if (!s) return list;
    const get = (r: Merchant): string | number =>
      s.k === 'name'
        ? r.displayName
        : s.k === 'sub'
          ? r.subType
          : s.k === 'uid'
            ? r.uniqueId
            : s.k === 'status'
              ? r.status
              : amountPaise(r.today.amount);
    list.sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const r =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'en', { numeric: true });
      return s.dir === 'desc' ? -r : r;
    });
    return list;
  });
  protected readonly pages = computed(() =>
    Array.from({ length: Math.max(1, Math.ceil(this.rows().length / PAGE)) }, (_, i) => i + 1),
  );
  protected readonly shown = computed(() =>
    this.sorted().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );
  protected readonly summary = computed(() => {
    const n = this.rows().length;
    return `${plural(n, 'merchant')}${this.data()?.nextCursor ? '+' : ''}`;
  });

  constructor() {
    effect(() => {
      // A filter change reloads the first page.
      this.sub();
      this.status();
      untracked(() => void this.load());
    });
    void this.lookups();
    const open = this.route.snapshot.queryParamMap.get('open');
    if (open) this.openId.set(open);
    // From Onboard → Staff: "Register a merchant" (client 2026-10-14).
    if (this.route.snapshot.queryParamMap.get('register')) this.openRegister();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.qTimer));
  }

  private async lookups() {
    try {
      const t = await this.setup.userTypes();
      const merchant = t.items.find((x) => x.category === 'MERCHANT' && x.status === 'ACTIVE');
      this.departments.set((merchant?.departments ?? []).map((d) => ({ id: d.id, name: d.name })));
    } catch {
      // The registration form then offers no department; the server still checks.
    }
  }

  protected async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.list({
        q: this.q().trim() || undefined,
        subType: this.sub() || undefined,
        status: this.status() || undefined,
        limit: 200,
      });
      if (n !== this.seq) return;
      this.data.set(d);
      this.rows.set(d.items);
      this.page.set(1);
      this.error.set('');
      if (!this.filtered()) this.all.set(d.items.map((m) => ({ id: m.id, name: m.displayName })));
      else void this.loadNames();
    } catch (e) {
      if (n === this.seq) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  /** The unfiltered names (the KPIs count every merchant; the name check needs them all). */
  private async loadNames() {
    if (this.all().length) return;
    try {
      const d = await this.api.list({ limit: 200 });
      this.all.set(d.items.map((m) => ({ id: m.id, name: m.displayName })));
    } catch {
      // The server still refuses a taken name (MER.NAME_TAKEN).
    }
  }

  protected async next() {
    if (this.page() < this.pages().length) {
      this.page.set(this.page() + 1);
      return;
    }
    const cursor = this.data()?.nextCursor;
    if (!cursor) return;
    try {
      const d = await this.api.list({
        q: this.q().trim() || undefined,
        subType: this.sub() || undefined,
        status: this.status() || undefined,
        limit: 200,
        cursor,
      });
      this.data.set({ ...d, kpis: this.data()!.kpis });
      this.rows.set([...this.rows(), ...d.items]);
      this.page.set(this.page() + 1);
    } catch (e) {
      this.overlays.toast("Couldn't load more merchants", {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
  }

  // --- filters ---------------------------------------------------------------------------------------
  protected setQ(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    clearTimeout(this.qTimer);
    this.qTimer = setTimeout(() => void this.load(), 250);
  }
  protected setStatus(v: string) {
    this.status.set(v as MerchantStatus | '');
  }
  protected sortBy(k: SortKey | 'acc') {
    if (k === 'acc') return;
    const s = this.sort();
    this.sort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }
  protected ariaSort(k: SortKey | 'acc') {
    const s = this.sort();
    if (k === 'acc') return null;
    return s?.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  // --- drawer and registration -----------------------------------------------------------------------
  protected open(id: string) {
    this.openId.set(id);
  }
  protected openRegister() {
    if (this.editWhy()) return;
    this.registering.set(true);
  }
  protected registered(r: { merchantId: string; uniqueId: string; name: string }) {
    this.registering.set(false);
    this.overlays.toast('Merchant registered', { sub: `${r.name} · ${r.uniqueId}` });
    this.all.set([]);
    void this.load();
    this.openId.set(r.merchantId);
  }

  // --- formatting ------------------------------------------------------------------------------------
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
  protected acceptsOf(r: Merchant) {
    return ACCEPTS.filter((a) => r.accepts[a.k]);
  }
  protected tone(s: MerchantStatus) {
    return STATUS[s]?.tone ?? 'neutral';
  }
  protected statusLabel(s: MerchantStatus) {
    return STATUS[s]?.l ?? s;
  }
  protected whole(m: { amount: string }) {
    return inrWhole(m);
  }
  protected successful(n: number) {
    return `${n.toLocaleString('en-IN')} successful payment${n === 1 ? '' : 's'}`;
  }
  protected payments(n: number) {
    return plural(n, 'payment');
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected min(a: number, b: number) {
    return Math.min(a, b);
  }
}
