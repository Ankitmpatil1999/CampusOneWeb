import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Amount } from '../../../Shared/Amount';
import { Empty } from '../../../Shared/Blocks';
import { HBars, type HBarItem } from '../../../Shared/Charts';
import { Icon } from '../../../Shared/Icon';
import { money, paiseOf, plural, rate, saveCsv } from '../Fees/fee-format';
import type { CollectionReport } from './fee-records.api';
import { classOf } from './record-format';

type By = 'cls' | 'sec';

interface Row {
  readonly name: string;
  readonly students: number;
  readonly records: number;
  readonly billed: number;
  readonly collected: number;
  readonly outstanding: number;
  readonly overdue: number;
  readonly rate: number;
}

/**
 * The collection report (prototype frReport; FEE-017): billed, collected and outstanding by class
 * or by class and section, the collection rate as bars, the totals and a CSV export.
 */
@Component({
  selector: 'rp-fee-collection-report',
  imports: [Amount, Empty, HBars, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="c-filters">
      <div class="seg" role="radiogroup" aria-label="Group by" style="flex: 0 0 auto">
        <span
          class="seg-ind"
          style="width: calc((100% - 8px) / 2)"
          [style.left]="'calc(3px + ' + (by() === 'cls' ? 0 : 1) + ' * ((100% - 8px) / 2 + 2px))'"
        ></span>
        @for (o of options; track o.v) {
          <button
            type="button"
            role="radio"
            [class.on]="by() === o.v"
            [attr.aria-checked]="by() === o.v"
            (click)="by.set(o.v)"
          >
            {{ o.l }}
          </button>
        }
      </div>
      <span class="fsum">{{ plural(rows().length, 'row') }}</span>
      <button type="button" class="btn btn-sec btn-sm" id="frr-export" (click)="export()">
        <rp-icon name="download" [size]="15" /><span>Export</span>
      </button>
    </div>
    @if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the report" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="reload.emit()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else if (!report()) {
      <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
    } @else {
      @if (rows().length) {
        <div class="card pad">
          <div class="row between">
            <b class="t-h4">Collected vs billed</b>
            <div class="legend">
              <span><i style="background: var(--brand-3)"></i>Collection rate</span>
            </div>
          </div>
          <div class="mt12"><rp-hbars [items]="bars()" [fmt]="pct" /></div>
        </div>
      }
      <div class="tbl-wrap">
        <table class="tbl" id="frr-table">
          <thead>
            <tr>
              <th>{{ by() === 'sec' ? 'Class and section' : 'Class' }}</th>
              <th class="r">Billed</th>
              <th class="r">Collected</th>
              <th class="r">Outstanding</th>
              <th class="r">Overdue</th>
              <th class="r">Collected</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.name) {
              <tr>
                <td>
                  <b>{{ r.name }}</b>
                  <div class="cell-s">
                    {{ plural(r.students, 'student') }} · {{ plural(r.records, 'record') }}
                  </div>
                </td>
                <td class="r"><rp-amt [value]="m(r.billed)" /></td>
                <td class="r"><rp-amt [value]="m(r.collected)" /></td>
                <td class="r"><rp-amt [value]="m(r.outstanding)" /></td>
                <td class="r t-num">
                  @if (r.overdue) {
                    <span class="t-bad">{{ plural(r.overdue, 'record') }}</span>
                  } @else {
                    0
                  }
                </td>
                <td class="r t-num">{{ pct(r.rate) }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6">
                  <rp-empty icon="chart" title="Nothing to report for this year" />
                </td>
              </tr>
            }
          </tbody>
          @if (rows().length && report()!.totals; as t) {
            <tfoot>
              <tr>
                <td>Total</td>
                <td class="r"><rp-amt [value]="t.billed" /></td>
                <td class="r"><rp-amt [value]="t.collected" /></td>
                <td class="r"><rp-amt [value]="t.outstanding" /></td>
                <td class="r t-num">{{ t.overdue }}</td>
                <td class="r t-num">
                  {{ pct(rate(paise(t.collected), paise(t.billed))) }}
                </td>
              </tr>
            </tfoot>
          }
        </table>
      </div>
      @if (rows().length) {
        <div class="pager">
          <span>{{ plural(rows().length, 'row') }}</span>
        </div>
      }
    }
  `,
})
export class FeeCollectionReport {
  readonly report = input<CollectionReport | null>(null);
  readonly error = input('');
  /** The class names in order (to group "Grade 6 A" under "Grade 6"). */
  readonly classes = input<readonly string[]>([]);
  readonly yearLabel = input('');
  readonly reload = output<void>();

  protected readonly plural = plural;
  protected readonly rate = rate;
  protected readonly options: readonly { v: By; l: string }[] = [
    { v: 'cls', l: 'By class' },
    { v: 'sec', l: 'By section' },
  ];
  protected readonly by = signal<By>('cls');

  protected readonly rows = computed<Row[]>(() => {
    const r = this.report();
    if (!r) return [];
    const by = this.by();
    const acc = new Map<string, Omit<Row, 'rate'>>();
    for (const x of r.rows) {
      const name = by === 'sec' ? x.classSection : classOf(x.classSection, this.classes());
      const a = acc.get(name) ?? {
        name,
        students: 0,
        records: 0,
        billed: 0,
        collected: 0,
        outstanding: 0,
        overdue: 0,
      };
      acc.set(name, {
        name,
        students: a.students + x.students,
        records: a.records + x.records,
        billed: a.billed + paiseOf(x.billed),
        collected: a.collected + paiseOf(x.collected),
        outstanding: a.outstanding + paiseOf(x.outstanding),
        overdue: a.overdue + x.overdue,
      });
    }
    return [...acc.values()].map((a) => ({ ...a, rate: rate(a.collected, a.billed) }));
  });
  protected readonly bars = computed<HBarItem[]>(() =>
    this.rows()
      .slice(0, 14)
      .map((r) => ({ label: r.name, value: r.rate, max: 100, tone: r.rate >= 60 ? 'ok' : 'warn' })),
  );

  protected readonly pct = (v: number) => `${v.toFixed(1)}%`;
  protected m(p: number) {
    return money(p);
  }
  protected paise(m: { amount: string }) {
    return paiseOf(m);
  }

  protected export() {
    const by = this.by();
    saveCsv(`fee-collection-${by === 'sec' ? 'section' : 'class'}-${this.yearLabel()}.csv`, [
      [
        by === 'sec' ? 'Class and section' : 'Class',
        'Students',
        'Records',
        'Billed',
        'Collected',
        'Outstanding',
        'Overdue records',
        'Collected %',
      ],
      ...this.rows().map((r) => [
        r.name,
        r.students,
        r.records,
        money(r.billed).amount,
        money(r.collected).amount,
        money(r.outstanding).amount,
        r.overdue,
        r.rate.toFixed(1),
      ]),
    ]);
  }
}
