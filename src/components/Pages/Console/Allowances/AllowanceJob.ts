import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatInr, formatDate, formatTime, istBusinessDate } from '../../../Utils/format';
import { amountPaise } from '../../../Shared/Amount';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { plural } from './allowance-format';
import type { AllowanceGrant } from './allowances.api';

/** What the job did on one day, read from the grants it credited and expired. */
interface JobDay {
  readonly date: string;
  readonly at: string;
  readonly credited: number;
  readonly creditedPaise: number;
  readonly expired: number;
}

/**
 * The Daily job tab (prototype alwJob; SRS 10.6, FR-ALW-02): what the 00:05 job does, the next
 * scheduled credit and the days on which it credited or expired allowances. The job's run log and
 * its manual run are the operator's (back office, Scheduled processing): the console has no job
 * endpoint, so "Run job now" is shown disabled with the reason.
 */
@Component({
  selector: 'rp-allowance-job',
  imports: [Empty, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="c-grid s21">
      <div class="card pad stack g12">
        <div class="row g12">
          <span class="li-ic"><rp-icon name="timer" [size]="19" /></span>
          <div class="grow">
            <b class="t-h4">Daily allowance job · 00:05</b>
            <div class="t-sm t-muted">
              Expires allowances whose expiry date is today (balance set to ₹0.00 and recorded),
              then credits allowances whose start date is today. Runs at most once a day, and on
              start-up if it hasn't run yet.
            </div>
          </div>
          <span class="chip dot tone-info">Scheduled</span>
        </div>
        <div class="note tone-info">
          <rp-icon name="info" [size]="17" />
          <div class="grow">
            Allowances are credited <b>once</b> on the start date and lapse on expiry. A recurring
            monthly credit is an open decision (OQ-08) — this build keeps the one-off credit.
          </div>
        </div>
        <div class="row g8">
          <span class="cp-why" [attr.title]="runWhy"
            ><button
              type="button"
              class="btn btn-sec"
              disabled
              [attr.aria-describedby]="'alw-job-why'"
            >
              <rp-icon name="play" [size]="17" /><span>Run job now</span>
            </button></span
          >
          <span class="t-xs t-muted" id="alw-job-next">{{ next() }}</span>
        </div>
        <span class="t-xs t-faint" id="alw-job-why">{{ runWhy }}</span>
      </div>
      <div class="card pad">
        <b class="t-h4">What the job did</b>
        <div class="mt12">
          @if (loading()) {
            <rp-empty icon="hourglass" title="Loading…" />
          } @else if (days().length) {
            <div class="tl">
              @for (d of days(); track d.date) {
                <div class="tl-i done">
                  <span class="tl-dot"><rp-icon name="check" [size]="13" [stroke]="2.6" /></span>
                  <div class="tl-c">
                    <div class="tl-t">{{ when(d) }}</div>
                    <div class="tl-s">{{ what(d) }}</div>
                  </div>
                </div>
              }
            </div>
          } @else {
            <rp-empty
              icon="timer"
              title="Nothing credited or expired yet"
              text="Days on which the job credits or expires allowances appear here."
            />
          }
        </div>
      </div>
    </div>
  `,
})
export class AllowanceJob {
  readonly grants = input.required<readonly AllowanceGrant[]>();
  readonly loading = input(false);

  protected readonly runWhy =
    'The job runs on its own at 00:05. A manual run is started by the CampusOne operator (Scheduled processing).';

  /** "Next credit: 6 students on 01 Nov 2026" (the earliest scheduled start date). */
  protected readonly next = computed(() => {
    const scheduled = this.grants().filter((g) => g.state === 'SCHEDULED');
    if (!scheduled.length) return 'No scheduled credits';
    const first = scheduled.map((g) => g.startDate).sort()[0]!;
    const n = scheduled.filter((g) => g.startDate === first).length;
    return `Next credit: ${plural(n, 'student')} on ${formatDate(first)}`;
  });

  /** The latest five days with a credit or an expiry (newest first). */
  protected readonly days = computed(() => {
    const by = new Map<string, JobDay>();
    const at = (iso: string) => {
      const date = istBusinessDate(iso);
      const cur = by.get(date) ?? { date, at: iso, credited: 0, creditedPaise: 0, expired: 0 };
      return { cur: { ...cur, at: iso < cur.at ? iso : cur.at }, date };
    };
    for (const g of this.grants()) {
      if (g.creditedAt) {
        const { cur, date } = at(g.creditedAt);
        by.set(date, {
          ...cur,
          credited: cur.credited + 1,
          creditedPaise: cur.creditedPaise + amountPaise(g.amount),
        });
      }
      if (g.state === 'EXPIRED' && g.endedAt) {
        const { cur, date } = at(g.endedAt);
        by.set(date, { ...cur, expired: cur.expired + 1 });
      }
    }
    return [...by.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  });

  protected when(d: JobDay) {
    return `${formatDate(d.date)}, ${formatTime(d.at)}`;
  }
  protected what(d: JobDay) {
    const parts = [
      `${d.credited.toLocaleString('en-IN')} credited`,
      `${d.expired.toLocaleString('en-IN')} expired`,
    ];
    if (d.credited) parts.push(`${formatInr(d.creditedPaise)} credited`);
    return parts.join(' · ');
  }
}
