import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { inrText } from '../../../Shared/Amount';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import type { DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { ago } from '../../../Utils/dates';
import { formatDateTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { MembersApi } from '../Members/members.api';
import { MerchantsApi, type Merchant } from '../Merchants/merchants.api';
import { ReaderDrawer } from './ReaderDrawer';
import { ReaderForm } from './ReaderForm';
import { ReaderPairing } from './ReaderPairing';
import { HEALTH, PURPOSES, boundTo, healthOf, plural, purposeOf } from './reader-format';
import {
  ReadersApi,
  type PairingCode,
  type PosCounter,
  type Terminal,
  type TerminalPurpose,
} from './readers.api';

type SortKey = 'name' | 'purpose' | 'device' | 'status' | 'seen';
const COLUMNS: readonly { k: SortKey | 'a'; l: string; sort: boolean }[] = [
  { k: 'name', l: 'Reader', sort: true },
  { k: 'purpose', l: 'Purpose', sort: true },
  { k: 'device', l: 'Device fingerprint', sort: true },
  { k: 'status', l: 'Status', sort: true },
  { k: 'seen', l: 'Last seen', sort: true },
  { k: 'a', l: '', sort: false },
];
const CAPTURE_COLUMNS = ['Time', 'Reader at capture', 'Purpose', 'Member', 'Result'];

/**
 * c.readers — Readers (SRS 6.38.8, 21.2, 21.5, CR-10, RNG-IDN-413; INS-030…034, MER-012; prototype
 * c.readers): the key figures, the readers with their purpose, binding, paired device and status,
 * the register / rename drawer (ReaderForm), the reader drawer (ReaderDrawer) with disable and
 * enable, the one-time pairing code (ReaderPairing) and the point-of-sale counters with today's
 * orders and collections. Captures are listed once attendance capture arrives (Phase 7).
 */
@Component({
  selector: 'rp-console-readers',
  imports: [Empty, Icon, Kpi, PageHead, ReaderDrawer, ReaderForm, ReaderPairing],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Readers"
        sub="Every attendance and coupon reader is registered and bound to its device. The reader shows its purpose, and each capture records it."
      >
        @if (canView()) {
          @if (editWhy()) {
            <span class="cp-why" [attr.title]="editWhy()"
              ><button type="button" class="btn btn-pri" disabled>
                <rp-icon name="plus" [size]="17" /><span>Register a reader</span>
              </button></span
            >
          } @else {
            <button type="button" class="btn btn-pri" id="rd-new" (click)="form.set('new')">
              <rp-icon name="plus" [size]="17" /><span>Register a reader</span>
            </button>
          }
        }
      </rp-page-head>

      @if (!canView()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="Readers are managed by the institution administrator. Pages your role can open are listed in the menu."
        />
      } @else {
        <div class="c-grid k4">
          <rp-kpi label="Online" icon="wifi" tone="ok" [value]="fig(counts().online)" />
          <rp-kpi
            label="Offline"
            icon="wifioff"
            tone="bad"
            [value]="fig(counts().offline)"
            [delta]="offlineNote()"
          />
          <rp-kpi
            label="Captures today"
            icon="nfc"
            tone="info"
            value="—"
            delta="Arrives with attendance"
          />
          <rp-kpi
            label="Awaiting pairing"
            icon="hourglass"
            tone="accent"
            [value]="fig(counts().unpaired)"
          />
        </div>

        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
          </div>
        }

        <div class="c-filters">
          <label class="search"
            ><rp-icon name="search" [size]="16" /><input
              type="search"
              id="rd-q"
              placeholder="Search reader, location or fingerprint"
              aria-label="Search readers"
              autocomplete="off"
              [value]="q()"
              (input)="q.set(val($event))"
          /></label>
          <div class="pills" role="group" aria-label="Purpose">
            @for (p of pills(); track p.v) {
              <button
                type="button"
                class="pill"
                [class.on]="pur() === p.v"
                [attr.aria-pressed]="pur() === p.v"
                (click)="pur.set(p.v)"
              >
                {{ p.l }}<span class="n">{{ p.n }}</span>
              </button>
            }
          </div>
        </div>

        @if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't load the readers" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else {
          <div class="tbl-wrap">
            <table class="tbl" id="rd-table">
              <thead>
                <tr>
                  @for (c of columns; track c.k) {
                    <th
                      [class.sort]="c.sort"
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
                @if (loading() && !readers().length) {
                  <tr>
                    <td [attr.colspan]="columns.length">
                      <rp-empty icon="hourglass" title="Loading…" />
                    </td>
                  </tr>
                }
                @for (r of shown(); track r.id) {
                  <tr
                    tabindex="0"
                    [class.cp-dim]="r.status === 'DISABLED'"
                    (click)="openId.set(r.id)"
                    (keydown.enter)="openId.set(r.id)"
                  >
                    <td>
                      <div class="cell-main">
                        <span class="li-ic sm"
                          ><rp-icon [name]="purposeOf(r.purpose).icon" [size]="16"
                        /></span>
                        <div>
                          <div class="cell-t">{{ r.name }}</div>
                          <div class="cell-s">{{ r.location ?? '—' }}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>{{ purposeOf(r.purpose).l }}</div>
                      @if (bound(r)) {
                        <div class="t-xs t-muted">{{ bound(r) }}</div>
                      }
                    </td>
                    <td>
                      @if (r.device) {
                        <span class="t-mono">{{ r.device }}</span>
                      } @else {
                        <span class="t-faint">Not paired</span>
                      }
                    </td>
                    <td>
                      <span [class]="chipClass(r)">
                        @if (health(r).icon) {
                          <rp-icon [name]="health(r).icon!" [size]="12" />
                        }
                        {{ health(r).l() }}</span
                      >
                    </td>
                    <td>
                      @if (r.lastSeenAt) {
                        <span [attr.title]="dateTime(r.lastSeenAt)">{{ seen(r.lastSeenAt) }}</span>
                      } @else {
                        —
                      }
                    </td>
                    <td>
                      @if (!editWhy()) {
                        <div class="row-acts">
                          <button
                            type="button"
                            class="btn btn-ghost btn-xs"
                            [attr.aria-label]="'Edit ' + r.name"
                            (click)="$event.stopPropagation(); editing.set(r)"
                            (keydown.enter)="$event.stopPropagation()"
                          >
                            <rp-icon name="edit" [size]="15" /><span>Edit</span>
                          </button>
                        </div>
                      }
                    </td>
                  </tr>
                } @empty {
                  @if (!loading()) {
                    <tr>
                      <td [attr.colspan]="columns.length">
                        <rp-empty
                          icon="nfc"
                          [title]="readers().length ? 'No readers match' : 'No readers yet'"
                          [text]="
                            readers().length
                              ? 'Try another purpose or search.'
                              : 'Register the gate, library and coupon readers, then pair each device with its one-time code.'
                          "
                        />
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
          @if (shown().length) {
            <div class="pager">
              <span>{{ plural(shown().length, 'reader') }}</span>
            </div>
          }
        }

        <section class="stack g8">
          <div class="sec-h">
            <h3>Recent captures</h3>
            <span class="t-xs t-muted"
              >Reports show the reader's name in force when the tap was captured</span
            >
          </div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  @for (c of captureColumns; track c) {
                    <th>{{ c }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td [attr.colspan]="captureColumns.length">
                    <rp-empty
                      icon="nfc"
                      title="No captures to show yet"
                      text="Gate, period and location taps are listed here with the reader's name at the time once attendance capture arrives (Phase 7)."
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="stack g8">
          <div class="sec-h">
            <h3>Point-of-sale terminals</h3>
            <span class="t-xs t-muted"
              >Registered and bound to their device the same way (OI-IDN-45)</span
            >
          </div>
          @if (posCounters().length) {
            <div class="list" id="rd-pos">
              @for (p of posCounters(); track p.id) {
                <button type="button" class="li" (click)="openId.set(p.id)">
                  <span class="li-ic"><rp-icon name="store" [size]="18" /></span>
                  <span class="li-main"
                    ><span class="li-t">{{ p.name }}</span
                    ><span class="li-s">{{ posSub(p) }}</span
                    ><span class="li-s">{{ posToday(p) }}</span></span
                  >
                  <span class="li-r"
                    ><span [class]="posChip(p).cls">{{ posChip(p).l }}</span></span
                  >
                </button>
              }
            </div>
          } @else if (!loading()) {
            <div class="card pad">
              <rp-empty
                icon="store"
                title="No point-of-sale counters"
                text="Register a reader with the point-of-sale purpose for a merchant's billing counter."
              />
            </div>
          }
        </section>
      }
    </div>

    @if (openTerminal(); as t) {
      <rp-reader-drawer
        [terminal]="t"
        (closed)="openId.set(null)"
        (edit)="openId.set(null); editing.set($event)"
        (pair)="pairFor($event)"
        (changed)="changed($event)"
      />
    }
    @if (form() === 'new') {
      <rp-reader-form
        [sections]="sections()"
        [merchants]="merchants()"
        [others]="readersAll()"
        (closed)="form.set(null)"
        (registered)="registered($event)"
      />
    }
    @if (editing(); as t) {
      <rp-reader-form
        [terminal]="t"
        [sections]="sections()"
        [merchants]="merchants()"
        [others]="readersAll()"
        (closed)="editing.set(null)"
        (updated)="updated($event)"
      />
    }
    @if (pairing(); as p) {
      <rp-reader-pairing
        [terminal]="p.terminal"
        [code]="p.code"
        [issuedAt]="p.at"
        [busy]="pairBusy()"
        (closed)="pairing.set(null)"
        (renew)="pairFor(p.terminal, true)"
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
export class ConsoleReaders {
  private readonly api = inject(ReadersApi);
  private readonly members = inject(MembersApi);
  private readonly merchantsApi = inject(MerchantsApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly columns = COLUMNS;
  protected readonly captureColumns = CAPTURE_COLUMNS;
  protected readonly purposeOf = purposeOf;
  protected readonly plural = plural;

  protected readonly q = signal('');
  protected readonly pur = signal<TerminalPurpose | ''>('');
  /** Every terminal of the institution: readers and POS counters. */
  protected readonly readersAll = signal<readonly Terminal[]>([]);
  protected readonly pos = signal<readonly PosCounter[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly sort = signal<{ k: SortKey; dir: 'asc' | 'desc' } | null>(null);
  protected readonly openId = signal<string | null>(null);
  protected readonly form = signal<'new' | null>(null);
  protected readonly editing = signal<Terminal | null>(null);
  protected readonly pairing = signal<{ terminal: Terminal; code: PairingCode; at: number } | null>(
    null,
  );
  protected readonly pairBusy = signal(false);
  protected readonly sections = signal<readonly DropdownOption[]>([]);
  protected readonly merchants = signal<readonly Merchant[]>([]);
  /** Re-renders the "x min ago" and the online / offline split every half minute. */
  private readonly now = signal(Date.now());

  protected readonly canView = computed(
    () => this.session()?.subTasks.includes('readers.view') ?? false,
  );
  protected readonly readOnly = computed(() =>
    this.session()?.roles.some((r) => r.readOnly)
      ? 'Management has read-only access. The administrator makes changes here.'
      : '',
  );
  protected readonly editWhy = computed(
    () =>
      this.readOnly() ||
      (this.session()?.subTasks.includes('readers.edit')
        ? ''
        : "Your role doesn't include this task."),
  );
  /** The readers (the POS counters have their own section, as in the prototype). */
  protected readonly readers = computed(() => this.readersAll().filter((r) => r.purpose !== 'POS'));
  protected readonly counts = computed(() => {
    const now = this.now();
    const live = this.readers().map((r) => healthOf(r, now));
    return {
      online: live.filter((h) => h === 'ONLINE').length,
      offline: live.filter((h) => h === 'OFFLINE').length,
      unpaired: live.filter((h) => h === 'UNPAIRED').length,
      loaded: !this.loading() || this.readersAll().length > 0,
    };
  });
  protected readonly offlineNote = computed(() => {
    if (!this.counts().loaded) return '';
    const now = this.now();
    const first = this.readers().find((r) => healthOf(r, now) === 'OFFLINE');
    return first ? first.name : 'All readers reporting';
  });
  protected readonly pills = computed(() => {
    const list = this.readers();
    return [
      { v: '' as const, l: 'All purposes', n: list.length },
      ...PURPOSES.filter((p) => p.v !== 'POS').map((p) => ({
        v: p.v,
        l: p.l,
        n: list.filter((r) => r.purpose === p.v).length,
      })),
    ];
  });
  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    const p = this.pur();
    let list = this.readers().filter(
      (r) =>
        (!p || r.purpose === p) &&
        (!q ||
          [r.name, r.location ?? '', r.device ?? '', boundTo(r)].some((x) =>
            x.toLowerCase().includes(q),
          )),
    );
    const s = this.sort();
    if (s) {
      const now = this.now();
      const get = (r: Terminal): string | number =>
        s.k === 'name'
          ? r.name
          : s.k === 'purpose'
            ? purposeOf(r.purpose).l
            : s.k === 'device'
              ? (r.device ?? '')
              : s.k === 'status'
                ? r.status === 'DISABLED'
                  ? 'z'
                  : HEALTH[healthOf(r, now)].l()
                : r.lastSeenAt
                  ? new Date(r.lastSeenAt).getTime()
                  : 0;
      list = [...list].sort((a, b) => {
        const x = get(a);
        const y = get(b);
        const c =
          typeof x === 'number' && typeof y === 'number'
            ? x - y
            : String(x).localeCompare(String(y), 'en', { numeric: true });
        return s.dir === 'desc' ? -c : c;
      });
    }
    return list;
  });
  /** MER-012's counters; without merchants.view, the POS terminals of INS-030. */
  protected readonly posCounters = computed<PosCounter[]>(() => {
    const fromMer = this.pos();
    if (fromMer.length) return [...fromMer];
    return this.readersAll()
      .filter((r) => r.purpose === 'POS')
      .map((r) => ({
        id: r.id,
        name: r.name,
        location: r.location,
        status: r.status,
        merchant: r.merchant?.name ?? null,
        outlet: null,
        operator: null,
        lastSeenAt: r.lastSeenAt,
        lastSyncAt: null,
        today: {
          orders: 0,
          paid: 0,
          collected: { amount: '0.00', currency: 'INR' as const },
          unpaid: 0,
          offlineAccepted: 0,
          offlineRefused: 0,
        },
      }));
  });
  protected readonly openTerminal = computed(() => {
    const id = this.openId();
    return id ? (this.readersAll().find((r) => r.id === id) ?? null) : null;
  });

  constructor() {
    void this.load();
    void this.lookups();
    const t = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  protected async load() {
    if (!this.canView()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const [r, p] = await Promise.all([
        this.api.list(),
        this.can('merchants.view') ? this.api.pos().catch(() => null) : Promise.resolve(null),
      ]);
      this.readersAll.set(r.items);
      if (p) this.pos.set(p.items);
      this.error.set('');
      this.now.set(Date.now());
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.loading.set(false);
    }
  }

  /** The form's choices: class sections and merchants (each needs its own sub-task). */
  private async lookups() {
    if (!this.canView() || this.editWhy()) return;
    if (this.can('academics.view')) {
      try {
        const c = await this.members.classes();
        this.sections.set(
          c.items.flatMap((k) => k.sections.map((s) => ({ v: s.id, l: `${k.name} ${s.name}` }))),
        );
      } catch {
        // The class list stays empty; the server still checks the section.
      }
    }
    if (this.can('merchants.view')) {
      try {
        this.merchants.set((await this.merchantsApi.list({ limit: 200 })).items);
      } catch {
        // No merchants to bind; the server still checks the merchant.
      }
    }
  }

  // --- actions ---------------------------------------------------------------------------------------
  protected async registered(r: { id: string; name: string }) {
    this.form.set(null);
    await this.load();
    const t = this.readersAll().find((x) => x.id === r.id);
    if (t) {
      const ok = await this.pairFor(t);
      if (ok) {
        const left = Math.max(
          1,
          Math.round((new Date(ok.expiresAt).getTime() - Date.now()) / 60_000),
        );
        this.overlays.toast('Reader registered', {
          sub: `Enter the pairing code on the device within ${left} minutes`,
        });
      }
    } else {
      this.overlays.toast('Reader registered', { sub: r.name });
    }
  }

  protected updated(t: Terminal) {
    this.editing.set(null);
    this.replace(t);
    this.overlays.toast('Reader updated', {
      sub: 'Earlier captures keep the name in force at the time',
    });
    void this.load();
  }

  protected changed(t: Terminal) {
    this.replace(t);
    void this.load();
  }

  /** INS-033: a one-time code, shown in the pairing drawer (the reader drawer closes). */
  protected async pairFor(t: Terminal, renew = false): Promise<PairingCode | null> {
    this.pairBusy.set(true);
    try {
      const code = await this.api.pairingCode(t.id);
      this.openId.set(null);
      this.pairing.set({ terminal: t, code, at: Date.now() });
      if (renew) {
        this.overlays.toast('New pairing code issued', {
          sub: 'The previous code no longer works',
        });
      }
      return code;
    } catch (e) {
      this.overlays.toast("Couldn't issue a pairing code", {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
      return null;
    } finally {
      this.pairBusy.set(false);
    }
  }

  private replace(t: Terminal) {
    this.readersAll.update((list) => list.map((x) => (x.id === t.id ? t : x)));
  }

  // --- table -----------------------------------------------------------------------------------------
  protected sortBy(k: SortKey | 'a') {
    if (k === 'a') return;
    const s = this.sort();
    this.sort.set({ k, dir: s?.k === k && s.dir === 'asc' ? 'desc' : 'asc' });
  }
  protected ariaSort(k: SortKey | 'a') {
    if (k === 'a') return null;
    const s = this.sort();
    return s?.k === k ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  // --- formatting ------------------------------------------------------------------------------------
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
  protected health(r: Terminal) {
    return HEALTH[healthOf(r, this.now())];
  }
  protected chipClass(r: Terminal) {
    const h = this.health(r);
    return `chip tone-${h.tone}${h.icon ? '' : ' dot'}`;
  }
  protected bound(r: Terminal) {
    return boundTo(r);
  }
  protected seen(iso: string) {
    return ago(iso, this.now());
  }
  protected dateTime(iso: string) {
    return formatDateTime(iso);
  }
  protected fig(n: number) {
    return this.counts().loaded ? String(n) : '—';
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected posSub(p: PosCounter) {
    const sync = p.lastSyncAt ?? p.lastSeenAt;
    return [
      p.merchant ?? '—',
      p.operator ? `operator ${p.operator}` : 'no operator signed in',
      sync ? `last sync ${ago(sync, this.now())}` : 'not synced yet',
    ].join(' · ');
  }
  /** "Today 12 orders · ₹1,240.00 collected · 1 unpaid · offline 2 accepted, 0 refused". */
  protected posToday(p: PosCounter) {
    const t = p.today;
    return [
      `Today ${plural(t.orders, 'order')}`,
      `${inrText(t.collected)} collected`,
      t.unpaid ? `${t.unpaid} unpaid` : '',
      t.offlineAccepted || t.offlineRefused
        ? `offline ${t.offlineAccepted} accepted, ${t.offlineRefused} refused`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }
  /** The counter's status: the reader list knows whether it is paired. */
  protected posChip(p: PosCounter) {
    const t = this.readersAll().find((r) => r.id === p.id);
    const h = t
      ? healthOf(t, this.now())
      : p.status === 'DISABLED'
        ? 'DISABLED'
        : healthOf(
            { status: p.status, paired: !!p.lastSeenAt, lastSeenAt: p.lastSeenAt },
            this.now(),
          );
    const x = HEALTH[h];
    return { l: x.l(), cls: `chip tone-${x.tone}${x.icon ? '' : ' dot'}` };
  }
}
