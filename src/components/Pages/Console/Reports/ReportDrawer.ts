import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  type OnInit,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { formatDate } from '../../../Utils/format';
import { plural } from '../Fees/fee-format';
import { problemText } from '../Structure/academic-format';
import { ReportsApi, type ReportEntry, type ReportRun, type RunParams } from './reports.api';
import { cellText, isNumeric, reportIcon } from './report-format';

/**
 * A report's rows (RPT-003): the year in context or a date range, paged by the server, with the
 * export of every row and the screen that owns the report.
 */
@Component({
  selector: 'rp-report-drawer',
  imports: [Empty, Icon, Modal, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="report().title"
      [sub]="sub()"
      [icon]="icon()"
      [drawer]="true"
      (closed)="closed.emit()"
    >
      <div class="stack g12" id="rep-body">
        @if (report().period === 'range') {
          <div class="c-filters" style="margin: 0">
            <div class="fld cc-date">
              <div class="fld-in">
                <input
                  id="rep-from"
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
                  id="rep-to"
                  type="date"
                  aria-label="To"
                  [min]="from()"
                  [value]="to()"
                  (change)="setRange($event, 'to')"
                />
              </div>
            </div>
          </div>
        }
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        } @else if (loading() && !rows().length) {
          <div class="sk" style="height: 280px; border-radius: 12px" aria-busy="true"></div>
        } @else {
          <div class="tbl-wrap">
            <table class="tbl dense" id="rep-table">
              <thead>
                <tr>
                  @for (c of columns(); track c.key) {
                    <th [class.r]="numeric(c.type)">{{ c.label }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (r of rows(); track $index) {
                  <tr>
                    @for (c of columns(); track c.key) {
                      <td [class.r]="numeric(c.type)" [class.t-num]="numeric(c.type)">
                        {{ cell(r[c.key], c.type) }}
                      </td>
                    }
                  </tr>
                } @empty {
                  <tr>
                    <td [attr.colspan]="columns().length || 1">
                      <rp-empty
                        icon="report"
                        title="Nothing to report"
                        text="Try a longer period."
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="row between">
            <span class="t-xs t-muted"
              >{{ plural(rows().length, 'row') }}{{ next() ? ' so far' : '' }}</span
            >
            @if (next()) {
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                [class.is-busy]="loading()"
                [disabled]="loading()"
                (click)="more()"
              >
                <span>Show more</span>
              </button>
            }
          </div>
        }
      </div>
      <div modal-foot class="cc-foot">
        <a class="btn btn-ghost" [routerLink]="'/console/' + report().screen.slice(2)"
          ><span>Open the page</span></a
        >
        <button
          type="button"
          class="btn btn-pri"
          id="rep-export"
          [class.is-busy]="exporting()"
          [disabled]="exporting()"
          (click)="exportIt.emit(params())"
        >
          <rp-icon name="download" [size]="17" /><span>Export</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class ReportDrawer implements OnInit {
  private readonly api = inject(ReportsApi);

  readonly report = input.required<ReportEntry>();
  /** The year in context (id and dates) for year and range reports. */
  readonly yearId = input('');
  readonly start = input('');
  readonly end = input('');
  readonly exporting = input(false);
  readonly closed = output<void>();
  readonly exportIt = output<RunParams>();

  protected readonly plural = plural;
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly run = signal<ReportRun | null>(null);
  protected readonly rows = signal<ReportRun['rows']>([]);
  protected readonly next = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly icon = computed(() => reportIcon(this.report().id));
  protected readonly columns = computed(() => this.run()?.columns ?? this.report().columns);
  protected readonly sub = computed(() => {
    const r = this.run();
    const p = r?.period;
    const what = p
      ? `${formatDate(p.from)} – ${formatDate(p.to)}`
      : r?.year && this.report().period === 'year'
        ? `Academic year ${r.year.label}`
        : 'As it stands now';
    return `${this.report().area} · ${what}`;
  });
  protected readonly params = computed<RunParams>(() => {
    const p = this.report().period;
    if (p === 'year') return this.yearId() ? { yearId: this.yearId() } : {};
    if (p === 'range') return { from: this.from(), to: this.to() };
    return {};
  });

  ngOnInit() {
    this.from.set(this.start());
    this.to.set(this.end());
    void this.load();
  }

  async load(cursor: string | null = null) {
    this.loading.set(true);
    try {
      const r = await this.api.run(this.report().id, { ...this.params(), cursor });
      this.run.set(r);
      this.rows.set(cursor ? [...this.rows(), ...r.rows] : r.rows);
      this.next.set(r.nextCursor);
      if (!cursor && r.period && !this.from()) {
        this.from.set(r.period.from);
        this.to.set(r.period.to);
      }
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected more() {
    const c = this.next();
    if (c) void this.load(c);
  }
  protected setRange(e: Event, k: 'from' | 'to') {
    const v = (e.target as HTMLInputElement).value;
    if (!v) return;
    (k === 'from' ? this.from : this.to).set(v);
    void this.load();
  }
  protected numeric(t: string) {
    return isNumeric(t);
  }
  protected cell(v: Parameters<typeof cellText>[0], t: string) {
    return cellText(v, t);
  }
}
