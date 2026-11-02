import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Amount, inrText } from '../../../Shared/Amount';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal } from '../../../Shared/Overlays';
import { ago } from '../../../Utils/dates';
import { formatDate, formatDateTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { audienceText, eventState } from './event-format';
import { EventsApi, type EventReport, type PaidEvent } from './events.api';

/**
 * The event drawer (prototype evDrawer, cm.ev.open; SRS 13.8–13.9, OI-FEE-16; FEE-030, FEE-031):
 * status, title, description, the payment period, audience and payee; the payment heads and the
 * total paid once; the event report (payers, collected, last payment and each payment) with the CSV
 * export. The footer activates or deactivates the event and opens the edit form.
 */
@Component({
  selector: 'rp-event-drawer',
  imports: [Amount, Empty, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Event"
      [sub]="event().title"
      icon="calendar"
      [drawer]="true"
      cls="cm-m"
      [foot]="!readOnly()"
      (closed)="closed.emit()"
    >
      <div class="cm-dr">
        @let ev = event();
        <div class="stack g16">
          @if (readOnly()) {
            <div class="note tone-info">
              <rp-icon name="lock" [size]="17" />
              <div class="grow">{{ readOnly() }}</div>
            </div>
          }
          <div class="cm-evhead">
            <div class="grow stack g6">
              <div class="row g8">
                <span
                  class="chip dot"
                  [class.tone-ok]="ev.status === 'ACTIVE'"
                  [class.tone-neutral]="ev.status !== 'ACTIVE'"
                  >{{ ev.status === 'ACTIVE' ? 'Active' : 'Inactive' }}</span
                >
                @if (ev.status === 'ACTIVE' && state() !== 'Active') {
                  <span class="chip dot tone-neutral">{{ state() }}</span>
                }
              </div>
              <div class="t-h3">{{ ev.title }}</div>
              @if (ev.description) {
                <p class="t-sm t-muted" style="line-height: 1.55">{{ ev.description }}</p>
              }
              <dl class="kv">
                <dt>Open for payment</dt>
                <dd>{{ date(ev.startDate) }} – {{ date(ev.endDate) }}</dd>
                <dt>Audience</dt>
                <dd>{{ audience() }}</dd>
                <dt>Paid to</dt>
                <dd>{{ ev.merchant }}</dd>
                <dt>Created</dt>
                <dd>{{ date(ev.createdAt) }}</dd>
              </dl>
            </div>
            <div class="cm-evqr">
              <div class="cm-qr-ph" style="width: 128px; height: 128px">
                <rp-icon name="wallet" [size]="40" />
              </div>
              <small>Members pay from Events in the CampusOne app, from their wallet.</small>
            </div>
          </div>

          <div class="sec-h"><h3>Payment heads</h3></div>
          <div class="tbl-wrap">
            <table class="tbl dense">
              <tbody>
                @for (h of ev.heads; track $index) {
                  <tr>
                    <td>{{ h.name }}</td>
                    <td class="r"><rp-amt [value]="h.amount" /></td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <td>Total — paid in full, once</td>
                  <td class="r"><rp-amt [value]="ev.total" /></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div class="sec-h">
            <h3>Event report</h3>
            <button
              type="button"
              class="btn btn-sec btn-xs"
              id="ev-export"
              [class.is-busy]="exporting()"
              [disabled]="exporting()"
              (click)="export()"
            >
              <rp-icon name="download" [size]="15" /><span>Export</span>
            </button>
          </div>
          @if (reportError()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ reportError() }}</div>
              <button type="button" class="btn btn-sec btn-sm note-a" (click)="loadReport()">
                <span>Try again</span>
              </button>
            </div>
          } @else {
            <div class="c-grid k3">
              <div class="cm-tile">
                <span>Payers</span
                ><b class="t-num">{{ report() ? num(report()!.totals.paid) : '—' }}</b>
              </div>
              <div class="cm-tile">
                <span>Collected</span
                ><b class="t-num">{{ report() ? inr(report()!.totals.collected) : '—' }}</b>
              </div>
              <div class="cm-tile">
                <span>Last payment</span><b class="t-num">{{ last() }}</b>
              </div>
            </div>
            @if (!report()) {
              <rp-empty icon="hourglass" title="Loading…" />
            } @else if (paid().length) {
              <div class="tbl-wrap cm-scroll">
                <table class="tbl dense">
                  <thead>
                    <tr>
                      <th>Payer</th>
                      <th>Class</th>
                      <th>Paid</th>
                      <th>Reference</th>
                      <th class="r">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (p of paid(); track p.reference) {
                      <tr>
                        <td>
                          <b>{{ p.payer }}</b>
                        </td>
                        <td>{{ p.grade ?? '—' }}</td>
                        <td>{{ dt(p.at) }}</td>
                        <td>
                          <span class="t-mono">{{ p.reference }}</span>
                        </td>
                        <td class="r"><rp-amt [value]="p.amount" /></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <rp-empty
                icon="users"
                title="No payments yet"
                text="Payments appear here as members pay from the app."
              />
            }
            @if (report()?.totals?.failed) {
              <div class="t-xs t-muted">{{ failedNote() }}</div>
            }
          }
        </div>
      </div>
      <div modal-foot class="row g8" style="width: 100%">
        @if (!readOnly()) {
          <button type="button" class="btn btn-sec" id="ev-edit" (click)="edit.emit()">
            <rp-icon name="edit" [size]="17" /><span>Edit event</span>
          </button>
          <span class="grow"></span>
          <button
            type="button"
            class="btn"
            id="ev-toggle"
            [class.btn-danger-o]="event().status === 'ACTIVE'"
            [class.btn-ok]="event().status !== 'ACTIVE'"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="activation.emit()"
          >
            <rp-icon name="power" [size]="17" /><span>{{
              event().status === 'ACTIVE' ? 'Deactivate event' : 'Activate event'
            }}</span>
          </button>
        }
      </div>
    </rp-modal>
  `,
})
export class EventDrawer {
  private readonly api = inject(EventsApi);

  readonly event = input.required<PaidEvent>();
  /** Why the event can't be changed here; '' when it can. */
  readonly readOnly = input('');
  readonly busy = input(false);
  readonly closed = output<void>();
  readonly activation = output<void>();
  readonly edit = output<void>();

  protected readonly report = signal<EventReport | null>(null);
  protected readonly reportError = signal('');
  protected readonly exporting = signal(false);
  private reportKey = '';

  protected readonly state = computed(() => eventState(this.event()));
  protected readonly audience = computed(() => audienceText(this.event()));
  protected readonly paid = computed(
    () => this.report()?.items.filter((i) => i.status === 'SUCCESS') ?? [],
  );
  protected readonly failedNote = computed(() => {
    const n = this.report()?.totals.failed ?? 0;
    return n === 1
      ? "1 failed attempt isn't listed here — the export includes it."
      : `${this.num(n)} failed attempts aren't listed here — the export includes them.`;
  });
  protected readonly last = computed(() => {
    const p = this.paid()[0];
    return this.report() ? (p ? ago(p.at) : '—') : '—';
  });

  constructor() {
    effect(() => {
      // A changed event (another one, or a new version) reloads its report.
      const key = `${this.event().id}:${this.event().version}`;
      untracked(() => void this.loadReport(key));
    });
  }

  /** Loads the report; a later load (another event or version) wins over an earlier one. */
  protected async loadReport(key = `${this.event().id}:${this.event().version}`) {
    this.reportKey = key;
    this.reportError.set('');
    try {
      const r = await this.api.report(this.event().id);
      if (this.reportKey === key) this.report.set(r);
    } catch (e) {
      if (this.reportKey === key) {
        this.reportError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    }
  }

  protected async export() {
    this.exporting.set(true);
    try {
      await this.api.reportCsv(this.event());
    } catch (e) {
      this.reportError.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    } finally {
      this.exporting.set(false);
    }
  }

  protected inr(m: { amount: string }) {
    return inrText(m);
  }
  protected date(v: string) {
    return formatDate(v);
  }
  protected dt(v: string) {
    return formatDateTime(v);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
}
