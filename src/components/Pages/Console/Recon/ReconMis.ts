import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Amount } from '../../../Shared/Amount';
import { Empty } from '../../../Shared/Blocks';
import { HBars, type HBarItem } from '../../../Shared/Charts';
import { Dropdown, type DropdownOption } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { Pager } from '../../../Shared/Pager';
import { formatDate, formatTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { PERIOD_LABEL, periodRange, plural, type Period } from '../Settlements/settlement-format';
import { ReconApi, type MatchKind, type MatchPage, type MatchRow } from './recon.api';
import { MATCH, attemptTone, saveCsv } from './recon-format';

type View = '' | 'matched' | 'unmatched' | 'mismatched';
const PAGE = 14;
const KINDS: readonly MatchKind[] = ['MATCHED', 'UNMATCHED', 'MISMATCHED'];
const DONUT = 120;
const THICK = 16;
const R = (DONUT - THICK) / 2;
const CIRC = 2 * Math.PI * R;

/**
 * The MIS tab (REC-014; FR-REC-01, OI-REC-04): payer ↔ merchant matching of the institution's
 * payments for a period — the counts as bars and a donut (the prototype's MIS cards), the view
 * filter, the payments with both sides and whether they are settled, and an export of every row.
 */
@Component({
  selector: 'rp-recon-mis',
  imports: [Amount, Dropdown, Empty, HBars, Icon, Pager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="c-filters">
      <div class="pills" role="group" aria-label="Period">
        @for (p of periods; track p) {
          <button
            type="button"
            class="pill"
            [class.on]="dp() === p"
            [attr.aria-pressed]="dp() === p"
            (click)="dp.set(p)"
          >
            {{ label(p) }}
          </button>
        }
      </div>
      <div class="fld">
        <rp-dd
          inputId="rm-view"
          placeholder="All payments"
          [options]="viewOptions()"
          [value]="view()"
          (changed)="setView($event)"
        />
      </div>
      <span class="fsum">{{ summary() }}</span>
      <button
        type="button"
        class="btn btn-sec btn-sm"
        id="rm-export"
        [class.is-busy]="exporting()"
        [disabled]="exporting() || !data()"
        (click)="export()"
      >
        <rp-icon name="download" [size]="15" /><span>Export MIS</span>
      </button>
    </div>

    @if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the MIS" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else {
      <div class="c-grid s21">
        <div class="card pad">
          <div class="row between">
            <b class="t-h4">Payer ↔ merchant matching</b
            ><span class="t-xs t-muted">{{ range() }}</span>
          </div>
          <div class="mt12">
            <rp-hbars [items]="bars()" [fmt]="countText" />
          </div>
          <div class="stack g6 mt12">
            @for (k of kinds; track k) {
              <div class="t-xs t-muted">
                <b class="t-ink2">{{ match(k).l }}:</b> {{ match(k).sub }}.
              </div>
            }
          </div>
        </div>
        <div class="card pad">
          <b class="t-h4">By match</b>
          <div class="row g16 mt12" style="align-items: center">
            <div class="ring" [style.width.px]="size" [style.height.px]="size">
              <svg [attr.width]="size" [attr.height]="size" aria-hidden="true">
                <circle
                  [attr.cx]="size / 2"
                  [attr.cy]="size / 2"
                  [attr.r]="r"
                  fill="none"
                  stroke="var(--surface-3)"
                  [attr.stroke-width]="thick"
                />
                @for (p of donut(); track p.k; let i = $index) {
                  <circle
                    [attr.cx]="size / 2"
                    [attr.cy]="size / 2"
                    [attr.r]="r"
                    fill="none"
                    [attr.stroke]="p.c"
                    [attr.stroke-width]="thick"
                    [attr.stroke-dasharray]="p.dash"
                    [attr.stroke-dashoffset]="p.offset"
                    [style.animation]="'fade .5s ' + i * 0.12 + 's both'"
                  >
                    <title>{{ p.l }}: {{ p.n }}</title>
                  </circle>
                }
              </svg>
              <div class="ring-c">
                <div>
                  <b class="t-num" style="font-size: 15px">{{ num(total()) }}</b>
                </div>
              </div>
            </div>
            <div class="stack g6 grow">
              @for (k of kinds; track k) {
                <div class="row between t-sm">
                  <span class="row g6"
                    ><i class="cm-sw" [style.background]="match(k).color"></i>{{ match(k).l }}</span
                  ><b class="t-num">{{ num(n(k)) }}</b>
                </div>
              }
            </div>
          </div>
        </div>
      </div>

      <div class="sec-h"><h3>Payments to merchants</h3></div>
      <div class="tbl-wrap">
        <table class="tbl dense" id="rm-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Reference</th>
              <th>Payer</th>
              <th class="r">Debited</th>
              <th>Merchant</th>
              <th class="r">Credited</th>
              <th>Match</th>
              <th>Settlement</th>
            </tr>
          </thead>
          <tbody>
            @if (loading() && !rows().length) {
              <tr>
                <td colspan="8"><rp-empty icon="hourglass" title="Loading…" /></td>
              </tr>
            }
            @for (x of shown(); track x.reference) {
              <tr>
                <td>
                  @if (x.at) {
                    <div class="cell-t t-num" style="font-weight: 550">{{ date(x.at) }}</div>
                    <div class="cell-s">{{ time(x.at) }}</div>
                  } @else {
                    —
                  }
                </td>
                <td>
                  <span class="t-mono">{{ x.reference }}</span>
                </td>
                <td>
                  <span class="t-clip" style="display: block; max-width: 170px">{{
                    x.payer.name
                  }}</span>
                  <div class="cell-s">
                    <span [class]="'t-' + attemptTone(x.payer.status)">{{ x.payer.status }}</span>
                  </div>
                </td>
                <td class="r"><rp-amt [value]="x.payer.amount" /></td>
                <td>
                  @if (x.merchant) {
                    <span class="t-clip" style="display: block; max-width: 170px">{{
                      x.merchant.name
                    }}</span>
                  } @else {
                    <span class="t-faint">Not credited</span>
                  }
                </td>
                <td class="r">
                  @if (x.merchant) {
                    <rp-amt [value]="x.merchant.amount" />
                  } @else {
                    <span class="t-faint">—</span>
                  }
                </td>
                <td>
                  <span [class]="'chip dot tone-' + match(x.match).tone">{{
                    match(x.match).l
                  }}</span>
                </td>
                <td>
                  @if (x.settled) {
                    <span class="chip tone-brand">Settled</span>
                  } @else {
                    <span class="t-faint">Not settled yet</span>
                  }
                </td>
              </tr>
            } @empty {
              @if (!loading()) {
                <tr>
                  <td colspan="8">
                    <rp-empty
                      icon="chart"
                      title="No payments to merchants in this period"
                      text="Widen the period or choose another view."
                    />
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      @if (rows().length > pageSize) {
        <rp-pager
          [total]="rows().length"
          [page]="page()"
          [size]="pageSize"
          (go)="page.set($event)"
        />
      } @else if (rows().length) {
        <div class="pager">
          <span>{{ plural(rows().length, 'payment') }}</span>
        </div>
      }
      @if (data()?.nextCursor) {
        <div class="row" style="justify-content: center">
          <button
            type="button"
            class="btn btn-sec btn-sm"
            id="rm-more"
            [class.is-busy]="more()"
            [disabled]="more()"
            (click)="loadMore()"
          >
            <span>Load more payments</span>
          </button>
        </div>
      }
    }
  `,
})
export class ReconMis {
  private readonly api = inject(ReconApi);
  private readonly overlays = inject(Overlays);

  protected readonly pageSize = PAGE;
  protected readonly plural = plural;
  protected readonly attemptTone = attemptTone;
  protected readonly kinds = KINDS;
  protected readonly size = DONUT;
  protected readonly thick = THICK;
  protected readonly r = R;
  protected readonly periods: readonly Period[] = ['7', '30', 'month'];
  protected readonly countText = (v: number) => v.toLocaleString('en-IN');

  protected readonly dp = signal<Period>('30');
  protected readonly view = signal<View>('');
  protected readonly data = signal<MatchPage | null>(null);
  protected readonly rows = signal<readonly MatchRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly more = signal(false);
  protected readonly exporting = signal(false);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  private seq = 0;

  protected readonly total = computed(() => {
    const c = this.data()?.counts;
    return c ? c.matched + c.unmatched + c.mismatched : 0;
  });
  protected readonly viewOptions = computed((): DropdownOption[] => [
    { v: '', l: 'All payments' },
    ...KINDS.map((k) => ({
      v: k.toLowerCase(),
      l: MATCH[k].l,
      sub: this.data() ? plural(this.n(k), 'payment') : '',
    })),
  ]);
  protected readonly summary = computed(() => {
    const d = this.data();
    if (!d) return '';
    const v = this.view();
    return plural(v ? this.n(v.toUpperCase() as MatchKind) : this.total(), 'payment');
  });
  protected readonly range = computed(() => {
    const d = this.data();
    return d ? `${formatDate(d.from)} – ${formatDate(d.to)}` : '';
  });
  protected readonly bars = computed((): HBarItem[] =>
    KINDS.map((k) => ({
      label: MATCH[k].l,
      value: this.n(k),
      max: Math.max(1, this.total()),
      tone: k === 'MATCHED' ? 'ok' : k === 'UNMATCHED' ? 'warn' : 'bad',
    })),
  );
  /** ui.donut: one arc per kind with a 2 px gap. */
  protected readonly donut = computed(() => {
    const tot = this.total() || 1;
    let acc = 0;
    return KINDS.map((k) => {
      const len = (CIRC * this.n(k)) / tot;
      const out = {
        k,
        l: MATCH[k].l,
        n: this.n(k),
        c: MATCH[k].color,
        dash: `${Math.max(0, len - 2)} ${CIRC}`,
        offset: -acc,
      };
      acc += len;
      return out;
    }).filter((p) => p.n > 0);
  });
  protected readonly shown = computed(() =>
    this.rows().slice((this.page() - 1) * PAGE, this.page() * PAGE),
  );

  constructor() {
    effect(() => {
      this.dp();
      this.view();
      untracked(() => void this.load());
    });
  }

  private query(cursor?: string) {
    return {
      ...periodRange(this.dp()),
      ...(this.view() ? { view: this.view() as Exclude<View, ''> } : {}),
      ...(cursor ? { cursor } : {}),
    };
  }

  protected async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const d = await this.api.matching(this.query());
      if (n !== this.seq) return;
      this.data.set(d);
      this.rows.set(d.items);
      this.page.set(1);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(this.problem(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  protected async loadMore() {
    const c = this.data()?.nextCursor;
    if (!c) return;
    this.more.set(true);
    try {
      const d = await this.api.matching(this.query(c));
      this.data.set({ ...d, counts: this.data()!.counts });
      this.rows.set([...this.rows(), ...d.items]);
    } catch (e) {
      this.overlays.toast("Couldn't load more payments", { sub: this.problem(e), tone: 'bad' });
    } finally {
      this.more.set(false);
    }
  }

  /** Every row of the period and view (page by page, at most 10,000) as a CSV file. */
  protected async export() {
    const d = this.data();
    if (!d) return;
    this.exporting.set(true);
    try {
      const all: MatchRow[] = [];
      let cursor: string | undefined;
      do {
        const p = await this.api.matching(this.query(cursor));
        all.push(...p.items);
        cursor = p.nextCursor ?? undefined;
      } while (cursor && all.length < 10_000);
      const lines = [
        [
          'Date',
          'Time',
          'Reference',
          'Payer',
          'Payer status',
          'Debited',
          'Merchant',
          'Credited',
          'Match',
          'Settled',
        ],
        ...all.map((x) => [
          x.at ? formatDate(x.at) : '',
          x.at ? formatTime(x.at) : '',
          x.reference,
          x.payer.name,
          x.payer.status,
          x.payer.amount.amount,
          x.merchant?.name ?? '',
          x.merchant?.amount.amount ?? '',
          MATCH[x.match].l,
          x.settled ? 'Yes' : 'No',
        ]),
      ];
      const name = `mis-${d.from}-to-${d.to}${this.view() ? '-' + this.view() : ''}.csv`;
      saveCsv(name, lines);
      this.overlays.toast('Export ready', { sub: `${name} · ${plural(all.length, 'row')}` });
    } catch (e) {
      this.overlays.toast("Couldn't export the MIS", { sub: this.problem(e), tone: 'bad' });
    } finally {
      this.exporting.set(false);
    }
  }

  protected setView(v: string) {
    this.view.set(v as View);
  }
  protected label(p: Period) {
    return PERIOD_LABEL[p];
  }
  protected n(k: MatchKind) {
    const c = this.data()?.counts;
    if (!c) return 0;
    return k === 'MATCHED' ? c.matched : k === 'UNMATCHED' ? c.unmatched : c.mismatched;
  }
  protected match(k: MatchKind) {
    return MATCH[k];
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected time(v: string) {
    return formatTime(v);
  }
  private problem(e: unknown) {
    return e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE');
  }
}
