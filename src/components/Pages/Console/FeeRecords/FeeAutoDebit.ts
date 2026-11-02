import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Avatar } from '../../../Shared/Avatar';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { ago } from '../../../Utils/dates';
import { formatDate, formatTime } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import { inr0, paiseOf, plural } from '../Fees/fee-format';
import type { CollectionAttempt, InstitutionRun } from './fee-records.api';
import { waitingWhy } from './record-format';

/**
 * The auto-debit tab (prototype frJob, "Retry job"; FEE-018, GOV-006, GOV-007): what the tuition
 * auto-debit does and when, the collections waiting for a top-up, "Run auto-debit now" for this
 * institution only (fees.collect; a reason is recorded) and the job's runs for the institution.
 */
@Component({
  selector: 'rp-fee-auto-debit',
  imports: [Avatar, Empty, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="c-grid s21">
      <div class="card pad stack g12">
        <div class="row g12">
          <span class="li-ic"><rp-icon name="refresh" [size]="19" /></span>
          <div class="grow">
            <b class="t-h4">Tuition auto-debit</b>
            <div class="t-sm t-muted">
              <!-- FINANCING-OFF (client 2026-10-22): "financed records" left out of the text. -->
              Re-attempts every pending fee payment. Records without valid consent and wallets still
              short are left waiting; each success closes the pending attempt and
              posts the accounting entry. Unpaid records past their due date become overdue with the
              late fine.
            </div>
          </div>
        </div>
        <div class="note tone-info">
          <rp-icon name="clock" [size]="17" />
          <div class="grow">
            Schedule: every 30 minutes, 08:00–20:00 IST, and after each top-up.
          </div>
        </div>
        <div class="grid c4">
          <div class="cm-tile" [class.tone-warn]="pending().length > 0">
            <span>Pending now</span><b class="t-num" id="ad-pending">{{ num(pending().length) }}</b>
          </div>
          <div class="cm-tile">
            <span>Waiting amount</span><b class="t-num">{{ inr0(waiting()) }}</b>
          </div>
          <div class="cm-tile" [class.tone-ok]="!!lastRun()?.processed">
            <span>Last run collected</span
            ><b class="t-num">{{ lastRun() ? num(lastRun()!.processed) : '—' }}</b>
          </div>
          <div class="cm-tile">
            <span>Last run</span
            ><b class="t-num">{{ lastRun() ? since(lastRun()!.startedAt) : '—' }}</b>
          </div>
        </div>
        <div class="row g8">
          @if (runWhy()) {
            <span class="cp-why" [attr.title]="runWhy()"
              ><button type="button" class="btn btn-pri" disabled>
                <rp-icon name="play" [size]="17" /><span>Run auto-debit now</span>
              </button></span
            >
          } @else {
            <button
              type="button"
              class="btn btn-pri"
              id="ad-run"
              [class.is-busy]="running()"
              [disabled]="running()"
              (click)="run.emit()"
            >
              <rp-icon name="play" [size]="17" /><span>Run auto-debit now</span>
            </button>
          }
          <span class="t-xs t-muted">For this institution only; a reason is recorded.</span>
        </div>
      </div>
      <div class="card pad">
        <b class="t-h4">Pending payments</b>
        <div class="mt12">
          @if (attemptsError()) {
            <rp-empty
              icon="alertc"
              title="Couldn't load the pending payments"
              [text]="attemptsError()"
            />
          } @else if (pending().length) {
            <div class="list plain" id="ad-list">
              @for (a of pending().slice(0, 8); track a.id) {
                <button type="button" class="li" (click)="open.emit(a.record.id)">
                  <rp-av [name]="a.student.name" size="sm" />
                  <span class="li-main"
                    ><span class="li-t">{{ a.student.name }}</span
                    ><span class="li-s"
                      >{{ a.record.label }} · due {{ inr0(paise(a.outstanding)) }}</span
                    ></span
                  ><span class="li-r"
                    ><span class="chip dot tone-warn" [attr.title]="tried(a)">{{
                      why(a.lastFailureCode)
                    }}</span></span
                  >
                </button>
              }
            </div>
            @if (pending().length > 8) {
              <p class="t-xs t-muted mt8">and {{ plural(pending().length - 8, 'more') }}</p>
            }
          } @else {
            <rp-empty
              icon="checkc"
              title="Nothing pending"
              text="Every attempted collection has either succeeded or not started."
            />
          }
        </div>
      </div>
    </div>

    <div class="sec-h"><h3>Run history</h3></div>
    @if (runsError()) {
      <div class="card pad">
        <rp-empty icon="alertc" title="Couldn't load the runs" [text]="runsError()" />
      </div>
    } @else {
      <div class="tbl-wrap">
        <table class="tbl" id="ad-runs">
          <thead>
            <tr>
              <th>Run at</th>
              <th>Trigger</th>
              <th class="r">Collected</th>
              <th class="r">Failed</th>
              <th>Duration</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            @for (r of runs(); track r.runId) {
              <tr>
                <td>
                  <div class="cell-t t-num" style="font-weight: 550">{{ date(r.startedAt) }}</div>
                  <div class="cell-s">{{ time(r.startedAt) }}</div>
                </td>
                <td>{{ trigger(r.trigger) }}</td>
                <td class="r">
                  <span class="t-ok t-num">{{ r.processed }}</span>
                </td>
                <td class="r t-num">
                  @if (r.failed) {
                    <span class="t-bad">{{ r.failed }}</span>
                  } @else {
                    0
                  }
                </td>
                <td>{{ duration(r) }}</td>
                <td>
                  <span [class]="'chip dot tone-' + outcome(r).tone">{{ outcome(r).l }}</span>
                  @if (r.note) {
                    <div class="cell-s" style="white-space: normal; max-width: 34ch">
                      {{ r.note }}
                    </div>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6">
                  <rp-empty
                    icon="history"
                    title="No runs yet"
                    text="Runs appear here as the job collects for this institution."
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (runs().length) {
        <div class="pager">
          <span>{{ plural(runs().length, 'run') }}</span>
        </div>
      }
    }
  `,
})
export class FeeAutoDebit {
  readonly attempts = input<readonly CollectionAttempt[]>([]);
  readonly attemptsError = input('');
  readonly runs = input<readonly InstitutionRun[]>([]);
  readonly runsError = input('');
  /** Why this person can't run the job (no fees.collect, read-only); '' when they can. */
  readonly runWhy = input('');
  readonly running = input(false);
  readonly run = output<void>();
  readonly open = output<string>();

  protected readonly plural = plural;
  protected readonly inr0 = inr0;
  protected readonly pending = computed(() =>
    this.attempts().filter((a) => a.status === 'PENDING'),
  );
  protected readonly waiting = computed(() =>
    this.pending().reduce((a, x) => a + paiseOf(x.outstanding), 0),
  );
  protected readonly lastRun = computed(() => this.runs()[0] ?? null);

  protected why(code: string | null) {
    return waitingWhy(code);
  }
  protected tried(a: CollectionAttempt) {
    return `Tried ${a.tries === 1 ? 'once' : `${a.tries} times`}${a.lastTriedAt ? `, last ${ago(a.lastTriedAt)}` : ''}`;
  }
  protected trigger(t: InstitutionRun['trigger']) {
    return t === 'MANUAL' ? 'Run now' : t === 'CATCH_UP' ? 'Catch-up' : 'Scheduled';
  }
  /** This institution's line of the run (status register: job_run_item). */
  protected outcome(r: InstitutionRun) {
    const tone = r.status === 'SUCCESS' ? 'ok' : r.status === 'FAILED' ? 'bad' : 'neutral';
    return { l: translate(`status.job_run_item.${r.status.toLowerCase()}`), tone };
  }
  protected duration(r: InstitutionRun) {
    if (!r.endedAt) return '—';
    const s = (Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 1000;
    return `${Math.max(0.1, s).toFixed(1)} s`;
  }
  protected since(d: string) {
    return ago(d);
  }
  protected paise(m: { amount: string }) {
    return paiseOf(m);
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected time(d: string) {
    return formatTime(d);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
}
