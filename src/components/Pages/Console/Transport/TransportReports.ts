import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Empty } from '../../../Shared/Blocks';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate, formatTime } from '../../../Utils/format';
import { exportCsv, pct } from '../Attendance/attendance-format';
import { plural } from '../Fees/fee-format';
import { addDays, daysBetween, num, problemText, today } from '../Structure/academic-format';
import { TransportApi, type ReportKind, type TransportReport } from './transport.api';

type Row = Readonly<Record<string, string | number | null>>;

interface Col {
  readonly k: string;
  readonly l: string;
  readonly r?: boolean;
  /** 'bar': completed of trips as the prototype's cc-pbar; 'date' / 'dt': dates; 'km', 'min'. */
  readonly as?: 'bar' | 'date' | 'dt' | 'km' | 'min' | 'b';
}

const PERF: readonly Col[] = [
  { k: 'trips', l: 'Trips', r: true },
  { k: 'completed', l: 'Completed', as: 'bar' },
  { k: 'cancelled', l: 'Cancelled', r: true },
  { k: 'onTime', l: 'On time', r: true },
  { k: 'averageDelayMinutes', l: 'Average delay', r: true, as: 'min' },
];

/** The reports (TRN-026, OI-TRN-20) and their columns. */
const REPORTS: Readonly<Record<ReportKind, { l: string; noun: string; cols: readonly Col[] }>> = {
  'route-performance': {
    l: 'Route performance',
    noun: 'route',
    cols: [{ k: 'route', l: 'Route', as: 'b' }, ...PERF],
  },
  'vehicle-utilisation': {
    l: 'Vehicle utilisation',
    noun: 'vehicle',
    cols: [
      { k: 'vehicle', l: 'Vehicle', as: 'b' },
      { k: 'capacity', l: 'Seats', r: true },
      { k: 'trips', l: 'Trips', r: true },
      { k: 'completed', l: 'Completed', as: 'bar' },
      { k: 'cancelled', l: 'Cancelled', r: true },
      { k: 'distanceKm', l: 'Distance', r: true, as: 'km' },
    ],
  },
  'cancelled-trips': {
    l: 'Cancelled trips',
    noun: 'trip',
    cols: [
      { k: 'date', l: 'Date', as: 'date' },
      { k: 'route', l: 'Route' },
      { k: 'session', l: 'Session' },
      { k: 'vehicle', l: 'Vehicle' },
      { k: 'remarks', l: 'Remarks' },
      { k: 'cancelledAt', l: 'Cancelled at', as: 'dt' },
    ],
  },
  'daily-summary': {
    l: 'Daily summary',
    noun: 'day',
    cols: [{ k: 'date', l: 'Date', as: 'date' }, ...PERF],
  },
  'driver-performance': {
    l: 'Driver performance',
    noun: 'driver',
    cols: [{ k: 'driver', l: 'Driver', as: 'b' }, ...PERF],
  },
  'attendant-performance': {
    l: 'Attendant performance',
    noun: 'attendant',
    cols: [{ k: 'attendant', l: 'Attendant', as: 'b' }, ...PERF],
  },
  allocation: {
    l: 'Allocation by stop',
    noun: 'stop',
    cols: [
      { k: 'route', l: 'Route', as: 'b' },
      { k: 'stop', l: 'Stop' },
      { k: 'passengers', l: 'Passengers', r: true },
    ],
  },
  'trip-stops': {
    l: 'Stops reached and skipped',
    noun: 'stop',
    cols: [
      { k: 'stop', l: 'Stop', as: 'b' },
      { k: 'reached', l: 'Reached', r: true },
      { k: 'skipped', l: 'Skipped', r: true },
      { k: 'upcoming', l: 'Not reached', r: true },
    ],
  },
};
const MAIN: readonly ReportKind[] = ['route-performance', 'vehicle-utilisation', 'cancelled-trips'];
const MORE: readonly ReportKind[] = [
  'daily-summary',
  'driver-performance',
  'attendant-performance',
  'allocation',
  'trip-stops',
];

/**
 * Transport reports (prototype transportReports / cc.trp.export; TRN-026): route performance,
 * vehicle utilisation and cancelled trips — and the daily summary, driver and attendant performance,
 * allocation by stop and stops reached — over a date range (the last seven days to start), with the
 * CSV export.
 */
@Component({
  selector: 'rp-transport-reports',
  imports: [Dropdown, Empty, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="c-filters" id="trp-filters">
      <div class="seg" role="radiogroup" aria-label="Report" style="flex: 0 0 auto">
        @if (mainIndex() >= 0) {
          <span
            class="seg-ind"
            style="width: calc((100% - 8px) / 3)"
            [style.left]="'calc(3px + ' + mainIndex() + ' * ((100% - 8px) / 3 + 2px))'"
          ></span>
        }
        @for (k of main; track k) {
          <button
            type="button"
            role="radio"
            [class.on]="kind() === k"
            [attr.aria-checked]="kind() === k"
            (click)="pick(k)"
          >
            {{ reports[k].l }}
          </button>
        }
      </div>
      <div class="fld">
        <rp-dd
          inputId="trp-more"
          placeholder="More reports"
          [options]="moreOptions"
          [value]="mainIndex() < 0 ? kind() : ''"
          (changed)="pick($any($event))"
        />
      </div>
      <div class="fld cc-date">
        <div class="fld-in">
          <input
            id="trp-from"
            type="date"
            aria-label="From"
            [max]="to()"
            [value]="from()"
            (change)="setRange($event, 'from')"
          />
        </div>
      </div>
      <span class="t-muted">to</span>
      <div class="fld cc-date">
        <div class="fld-in">
          <input
            id="trp-to"
            type="date"
            aria-label="To"
            [min]="from()"
            [max]="todayIso"
            [value]="to()"
            (change)="setRange($event, 'to')"
          />
        </div>
      </div>
      <button
        type="button"
        class="btn btn-sec btn-sm"
        id="trp-export"
        style="margin-left: auto"
        [disabled]="!rows().length"
        (click)="export()"
      >
        <rp-icon name="download" [size]="15" /><span>Export</span>
      </button>
    </div>
    @if (loading() && !report()) {
      <div class="sk" style="height: 260px; border-radius: 16px" aria-busy="true"></div>
    } @else if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the report" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else {
      <div class="tbl-wrap">
        <table class="tbl" id="trp-table">
          <thead>
            <tr>
              @for (c of cols(); track c.k) {
                <th [class.r]="c.r" [style.width]="c.as === 'bar' ? '200px' : null">{{ c.l }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track $index) {
              <tr>
                @for (c of cols(); track c.k) {
                  <td [class.r]="c.r">
                    @switch (c.as) {
                      @case ('b') {
                        <b class="t-sb">{{ r[c.k] }}</b>
                      }
                      @case ('bar') {
                        @if (+(r['trips'] ?? 0)) {
                          <div class="cc-pbar">
                            <span class="t-num">{{ share(r) }}%</span>
                            <div [class]="'bar ' + (share(r) >= 95 ? 'ok' : 'warn')">
                              <i [style.width.%]="share(r)"></i>
                            </div>
                          </div>
                        } @else {
                          <span class="t-faint">No trips</span>
                        }
                      }
                      @default {
                        {{ cell(r, c) }}
                      }
                    }
                  </td>
                }
              </tr>
            } @empty {
              <tr>
                <td [attr.colspan]="cols().length">
                  <rp-empty
                    [icon]="kind() === 'cancelled-trips' ? 'checkc' : 'chart'"
                    [title]="
                      kind() === 'cancelled-trips' ? 'No cancelled trips' : 'Nothing in this range'
                    "
                    text="Try a longer range."
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (rows().length) {
        <div class="pager">
          <span>{{ plural(rows().length, reports[kind()].noun) }} · {{ rangeText() }}</span>
        </div>
      }
    }
  `,
})
export class TransportReports {
  private readonly api = inject(TransportApi);
  private readonly overlays = inject(Overlays);

  protected readonly plural = plural;
  protected readonly reports = REPORTS;
  protected readonly main = MAIN;
  protected readonly moreOptions = MORE.map((k) => ({ v: k, l: REPORTS[k].l }));
  protected readonly todayIso = today();
  protected readonly kind = signal<ReportKind>('route-performance');
  protected readonly from = signal(addDays(today(), -7));
  protected readonly to = signal(today());
  protected readonly report = signal<TransportReport | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  private seq = 0;

  protected readonly mainIndex = computed(() => MAIN.indexOf(this.kind()));
  protected readonly cols = computed(() => REPORTS[this.kind()].cols);
  protected readonly rows = computed<readonly Row[]>(() =>
    this.report()?.kind === this.kind() ? (this.report()?.items ?? []) : [],
  );
  protected readonly rangeText = computed(() => {
    const n = daysBetween(this.from(), this.to());
    const span = `${formatDate(this.from())} – ${formatDate(this.to())}`;
    return n === 7 && this.to() === today() ? `Last 7 days · ${span}` : span;
  });

  constructor() {
    void this.load();
  }

  async load() {
    const n = ++this.seq;
    this.loading.set(true);
    try {
      const r = await this.api.report(this.kind(), this.from(), this.to());
      if (n !== this.seq) return;
      this.report.set(r);
      this.error.set('');
    } catch (e) {
      if (n === this.seq) this.error.set(problemText(e));
    } finally {
      if (n === this.seq) this.loading.set(false);
    }
  }

  protected pick(k: ReportKind) {
    if (!REPORTS[k]) return;
    this.kind.set(k);
    void this.load();
  }
  protected setRange(e: Event, k: 'from' | 'to') {
    const v = (e.target as HTMLInputElement).value;
    if (!v) return;
    (k === 'from' ? this.from : this.to).set(v);
    if (this.from() > this.to()) {
      const f = this.from();
      this.from.set(this.to());
      this.to.set(f);
    }
    void this.load();
  }

  protected share(r: Row) {
    return pct(Number(r['completed'] ?? 0), Number(r['trips'] ?? 0));
  }
  protected cell(r: Row, c: Col): string {
    const v = r[c.k];
    if (v === null || v === undefined || v === '') return c.as === 'min' ? '—' : '';
    switch (c.as) {
      case 'date':
        return formatDate(String(v));
      case 'dt':
        return `${formatDate(String(v))}, ${formatTime(String(v))}`;
      case 'km':
        return `${(Math.round(Number(v) * 10) / 10).toFixed(1)} km`;
      case 'min':
        return `${num(Number(v))} min`;
      default:
        return typeof v === 'number' ? num(v) : String(v);
    }
  }

  /** cc.trp.export: the rows as shown. */
  protected export() {
    const cols = this.cols();
    exportCsv(
      `${this.kind()}_${this.from()}_${this.to()}.csv`,
      cols.map((c) => c.l),
      this.rows().map((r) =>
        cols.map((c) => (c.as === 'bar' ? `${this.share(r)}%` : this.cell(r, c))),
      ),
    );
    this.overlays.toast('Report exported', {
      sub: `${plural(this.rows().length, 'row')} · CSV`,
    });
  }
}
