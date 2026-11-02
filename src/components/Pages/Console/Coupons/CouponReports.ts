import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Empty, Kpi } from '../../../Shared/Blocks';
import { Bars, type BarItem } from '../../../Shared/Charts';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { istBusinessDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural } from '../Allowances/allowance-format';
import { addDays, csvCell, dshort, monthEnd, monthStart, rate } from './coupon-format';
import { CouponsApi, type CouponReports } from './coupons.api';

type Period = 'month' | '30' | 'all';

/** The period of a pill: this month (to its end), the last 30 days, or everything around now. */
export function periodRange(p: Period, today: string): { from: string; to: string } {
  if (p === 'month') return { from: monthStart(today), to: monthEnd(today) };
  if (p === '30') return { from: addDays(today, -29), to: today };
  // "All issued": two years back and the year ahead (coupons are issued for future days).
  return { from: addDays(today, -730), to: addDays(today, 365) };
}

/**
 * The Reports tab (prototype cpnReports; SRS 11.4, FR-CPN-05, OI-CPN-05; CPN-011): issued, used,
 * expired and the redemption rate for a period; by coupon type with the redemption bar; redemptions
 * per day over the last 14 days; redemptions by merchant; and a CSV export (types, merchants and
 * students).
 */
@Component({
  selector: 'rp-coupon-reports',
  imports: [Bars, Empty, Icon, Kpi],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="c-filters">
      <div class="pills" role="group" aria-label="Period">
        @for (p of periods; track p.v) {
          <button
            type="button"
            class="pill"
            [class.on]="period() === p.v"
            [attr.aria-pressed]="period() === p.v"
            (click)="setPeriod(p.v)"
          >
            {{ p.l }}
          </button>
        }
      </div>
      <span class="fsum">{{ data() ? count(all(), 'coupon') : '' }}</span>
      <button
        type="button"
        class="btn btn-sec btn-sm"
        id="cr-export"
        [disabled]="!data()"
        (click)="export()"
      >
        <rp-icon name="download" [size]="15" /><span>Export</span>
      </button>
    </div>
    @if (error()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the reports" [text]="error()">
          <button type="button" class="btn btn-sec btn-sm" (click)="load()">
            <span>Try again</span>
          </button>
        </rp-empty>
      </div>
    } @else if (!data()) {
      <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
    } @else {
      @let d = data()!;
      <div class="c-grid k4">
        <rp-kpi label="Issued" icon="ticket" [value]="num(d.kpis.issued)" />
        <rp-kpi label="Used" icon="checkc" tone="ok" [value]="num(d.kpis.used)" />
        <rp-kpi label="Expired unused" icon="hourglass" tone="warn" [value]="num(d.kpis.expired)" />
        <rp-kpi
          label="Redemption rate"
          icon="percent"
          [value]="pct(rate(d.kpis.used, d.kpis.expired), 1)"
          delta="Used ÷ (used + expired)"
        />
      </div>
      <div class="c-grid s21">
        <div>
          <div class="sec-h"><h3>By coupon type</h3></div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Type</th>
                  <th class="r">Issued</th>
                  <th class="r">Used</th>
                  <th class="r">Expired</th>
                  <th class="r">Still active</th>
                  <th class="r">Redemption</th>
                </tr>
              </thead>
              <tbody>
                @for (r of d.byType; track r.type) {
                  <tr>
                    <td>
                      <span class="cm-tchip"
                        ><rp-icon name="ticket" [size]="12" />{{ r.type }}</span
                      >
                    </td>
                    <td class="r">{{ num(r.issued) }}</td>
                    <td class="r">{{ num(r.used) }}</td>
                    <td class="r">{{ num(r.expired) }}</td>
                    <td class="r">{{ num(r.active) }}</td>
                    <td class="r">
                      <div class="row g8 end">
                        <div style="width: 70px">
                          <div
                            class="bar"
                            [class.ok]="rate(r.used, r.expired) > 80"
                            [class.warn]="rate(r.used, r.expired) <= 80"
                            role="meter"
                            [attr.aria-label]="r.type + ' redemption'"
                            [attr.aria-valuenow]="rate(r.used, r.expired)"
                            aria-valuemin="0"
                            aria-valuemax="100"
                          >
                            <i [style.width.%]="rate(r.used, r.expired)"></i>
                          </div>
                        </div>
                        <span class="t-num">{{ pct(rate(r.used, r.expired), 0) }}</span>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6">
                      <rp-empty icon="ticket" title="No coupons in this period" />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (d.byType.length) {
            <div class="pager">
              <span>{{ count(d.byType.length, 'type') }}</span>
            </div>
          }
        </div>
        <div class="card pad">
          <b class="t-h4">Redemptions per day · 14 days</b>
          <div class="mt12">
            @if (perDay().length) {
              <rp-bars
                [items]="perDay()"
                [w]="360"
                [h]="150"
                [hi]="perDay().length - 2"
                aria="Coupons used per day"
              />
            } @else {
              <rp-empty icon="hourglass" title="Loading…" />
            }
          </div>
        </div>
      </div>
      <div class="sec-h"><h3>By merchant</h3></div>
      <div>
        <div class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th>Merchant</th>
                <th class="r">Redemptions</th>
              </tr>
            </thead>
            <tbody>
              @for (m of d.byMerchant; track m.merchant) {
                <tr>
                  <td>
                    <b>{{ m.merchant }}</b>
                  </td>
                  <td class="r">{{ num(m.used) }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="2"><rp-empty icon="store" title="No redemptions yet" /></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (d.byMerchant.length) {
          <div class="pager">
            <span>{{ count(d.byMerchant.length, 'merchant') }}</span>
          </div>
        }
      </div>
    }
  `,
})
export class CouponReportsTab {
  private readonly api = inject(CouponsApi);
  private readonly overlays = inject(Overlays);

  protected readonly periods: readonly { v: Period; l: string }[] = [
    { v: 'month', l: 'This month' },
    { v: '30', l: 'Last 30 days' },
    { v: 'all', l: 'All issued' },
  ];
  protected readonly period = signal<Period>('month');
  protected readonly data = signal<CouponReports | null>(null);
  protected readonly days14 = signal<CouponReports | null>(null);
  protected readonly error = signal('');
  protected readonly rate = rate;
  private seq = 0;

  protected readonly all = computed(() => {
    const k = this.data()?.kpis;
    return k ? k.issued + k.cancelled : 0;
  });
  protected readonly perDay = computed<BarItem[]>(
    () => this.days14()?.byDay.map((d) => ({ label: dshort(d.date), value: d.used })) ?? [],
  );

  constructor() {
    void this.load();
    void this.loadDays();
  }

  protected setPeriod(p: Period) {
    if (p === this.period()) return;
    this.period.set(p);
    void this.load();
  }

  protected async load() {
    const n = ++this.seq;
    this.error.set('');
    this.data.set(null);
    try {
      const d = await this.api.reports(periodRange(this.period(), istBusinessDate(new Date())));
      if (n === this.seq) this.data.set(d);
    } catch (e) {
      if (n === this.seq) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    }
  }

  /** The last 14 days (the server's default period) for the chart. */
  private async loadDays() {
    try {
      this.days14.set(await this.api.reports());
    } catch {
      // The chart stays empty; the figures above still show.
    }
  }

  /** The period's figures as a CSV file: by type, by merchant and per student. */
  protected export() {
    const d = this.data();
    if (!d) return;
    const rows: (string | number)[][] = [
      ['Coupon report', `${d.from} to ${d.to}`],
      [],
      ['Type', 'Issued', 'Used', 'Expired', 'Still active', 'Redemption %'],
      ...d.byType.map((r) => [
        r.type,
        r.issued,
        r.used,
        r.expired,
        r.active,
        rate(r.used, r.expired),
      ]),
      [],
      ['Merchant', 'Redemptions'],
      ...d.byMerchant.map((m) => [m.merchant, m.used]),
      [],
      ['Student', 'Issued', 'Used', 'Expired', 'Still active'],
      ...d.perStudent.map((s) => [s.student.name, s.issued, s.used, s.expired, s.active]),
    ];
    const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = href;
    a.download = `coupon-report_${d.from}_${d.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    this.overlays.toast('Report exported', { sub: a.download });
  }

  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected pct(v: number, dp: number) {
    return `${v.toFixed(dp)}%`;
  }
  protected count(n: number, noun: string) {
    return plural(n, noun);
  }
}
