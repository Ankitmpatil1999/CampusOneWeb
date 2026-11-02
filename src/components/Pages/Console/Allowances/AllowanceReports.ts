import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { amountPaise, inrText } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, Kpi } from '../../../Shared/Blocks';
import { Bars, HBars, type BarItem, type HBarItem } from '../../../Shared/Charts';
import { Pager } from '../../../Shared/Pager';
import { formatInr } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { inrWhole } from '../Merchants/merchant-format';
import { shortDate } from './allowance-format';
import { AllowancesApi, type AllowanceReports } from './allowances.api';

const PAGE = 8;
const rupees0 = (paise: number) => formatInr(paise).replace(/\.00$/, '');

/**
 * The Reports tab (prototype alwReports; SRS 10.4, FR-ALW-03, OI-ALW-06; ALW-005): issued (credited),
 * spent, lapsed and scheduled; the allowance spend of the last 14 days and by merchant; spent of
 * issued by class; and per student — one row per student, never once per history row.
 */
@Component({
  selector: 'rp-allowance-reports',
  imports: [Avatar, Bars, Empty, HBars, Kpi, Pager],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
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
        <rp-kpi label="Issued (credited)" icon="gift" [value]="whole(d.kpis.issued)" />
        <rp-kpi label="Spent" icon="cart" [value]="whole(d.kpis.spent)" [delta]="spentShare()" />
        <rp-kpi
          label="Expired (lapsed)"
          icon="hourglass"
          [value]="whole(d.kpis.expired)"
          delta="Unspent balances return to the school"
        />
        <rp-kpi
          label="Scheduled to credit"
          icon="calendar"
          tone="info"
          [value]="whole(d.kpis.scheduled)"
        />
      </div>
      <div class="c-grid s21">
        <div class="card pad">
          <div class="row between">
            <b class="t-h4">Allowance spend · last {{ d.byDay.length }} days</b
            ><span class="t-xs t-muted">{{ inr(d.kpis.spent) }}</span>
          </div>
          <div class="mt12">
            <rp-bars
              [items]="byDay()"
              [w]="560"
              [h]="150"
              [hi]="byDay().length - 1"
              [fmt]="money"
              aria="Allowance spend by day"
            />
          </div>
        </div>
        <div class="card pad">
          <b class="t-h4">Spend by merchant</b>
          <div class="mt12">
            @if (byMerchant().length) {
              <rp-hbars [items]="byMerchant()" [fmt]="money" />
            } @else {
              <rp-empty icon="store" title="No allowance spend yet" />
            }
          </div>
        </div>
      </div>
      <div class="c-grid s12">
        <div class="card pad">
          <b class="t-h4">Spent of issued, by class</b>
          <div class="mt12">
            @if (byClass().length) {
              <rp-hbars [items]="byClass()" [fmt]="money" />
            } @else {
              <rp-empty icon="layers" title="Nothing issued yet" />
            }
          </div>
        </div>
        <div>
          <div class="sec-h"><h3>Per student</h3></div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th>Student</th>
                  <th class="r">Issued</th>
                  <th class="r">Spent</th>
                  <th class="r">Balance</th>
                  <th class="r">Expired</th>
                </tr>
              </thead>
              <tbody>
                @for (r of shown(); track r.student.id) {
                  <tr>
                    <td>
                      <div class="cell-main">
                        <rp-av [name]="r.student.name" size="sm" />
                        <div style="min-width: 0">
                          <div class="cell-t t-clip">{{ r.student.name }}</div>
                          <div class="cell-s">{{ r.student.grade ?? 'Not enrolled' }}</div>
                        </div>
                      </div>
                    </td>
                    <td class="r">{{ inr(r.issued) }}</td>
                    <td class="r">{{ inr(r.spent) }}</td>
                    <td class="r">{{ inr(r.balance) }}</td>
                    <td class="r">{{ inr(r.expired) }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5">
                      <rp-empty
                        icon="gift"
                        title="No allowances credited yet"
                        text="Students appear here once the 00:05 job credits their allowance."
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <rp-pager
            [total]="d.perStudent.length"
            [page]="page()"
            [size]="pageSize"
            (go)="page.set($event)"
          />
        </div>
      </div>
    }
  `,
})
export class AllowanceReportsTab {
  private readonly api = inject(AllowancesApi);

  protected readonly pageSize = PAGE;
  protected readonly data = signal<AllowanceReports | null>(null);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly money = rupees0;

  protected readonly byDay = computed<BarItem[]>(
    () =>
      this.data()?.byDay.map((d) => ({ label: shortDate(d.date), value: amountPaise(d.spent) })) ??
      [],
  );
  protected readonly byMerchant = computed<HBarItem[]>(
    () =>
      this.data()?.byMerchant.map((m) => ({ label: m.merchant, value: amountPaise(m.spent) })) ??
      [],
  );
  protected readonly byClass = computed<HBarItem[]>(
    () =>
      this.data()?.byClass.map((c) => ({
        label: c.class,
        value: amountPaise(c.spent),
        max: amountPaise(c.issued),
      })) ?? [],
  );
  protected readonly shown = computed(
    () => this.data()?.perStudent.slice((this.page() - 1) * PAGE, this.page() * PAGE) ?? [],
  );
  protected readonly spentShare = computed(() => {
    const d = this.data();
    if (!d) return '';
    const issued = amountPaise(d.kpis.issued);
    if (!issued) return '';
    const pct = (100 * amountPaise(d.kpis.spent)) / issued;
    return `${pct.toFixed(1)}% of issued`;
  });

  constructor() {
    void this.load();
  }

  protected async load() {
    this.error.set('');
    try {
      this.data.set(await this.api.reports());
      this.page.set(1);
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected inr(m: { amount: string; currency: 'INR' }) {
    return inrText(m);
  }
  protected whole(m: { amount: string }) {
    return inrWhole(m);
  }
}
