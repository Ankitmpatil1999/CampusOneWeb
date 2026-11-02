import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate, formatTime } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import { channelOf } from '../Announcements/announcement-format';
import { person } from '../Applications/app-format';
import { taskAccess } from '../Attendance/attendance-format';
import { plural } from '../Fees/fee-format';
import { ExportsApi, download } from '../Reports/report-export';
import { addDays, num, problemText, today } from '../Structure/academic-format';
import {
  CommReportApi,
  KINDS,
  OUTCOME,
  kindOf,
  type CommChannel,
  type CommFilters,
  type CommKind,
  type CommOutcome,
  type CommReport,
  type CommRow,
} from './comm-report.api';

/**
 * c.commreport — Communication report (SRS 23.18.1, FR-COM-07, CR-16, OI-COM-46…50; COM-007,
 * COM-008, RPT-005; prototype c.commreport): every dispatch to the institution's members with its
 * outcome — kind pills, channel, outcome and date filters, totals over the filtered set, the
 * retention note and the export of exactly the filtered rows.
 */
@Component({
  selector: 'rp-console-commreport',
  imports: [Dropdown, Empty, Icon, Kpi, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Communication report"
        sub="Every notification, announcement, direct message, one-time password and operational alert sent to this institution's members"
      >
        @if (!access.denied()) {
          <button
            type="button"
            class="btn btn-sec"
            id="cr-export"
            [class.is-busy]="exporting()"
            [disabled]="exporting() || !report()?.totals?.attempts"
            (click)="exportIt()"
          >
            <rp-icon name="download" [size]="17" /><span>Export</span>
          </button>
        }
      </rp-page-head>

      @if (access.denied()) {
        <rp-empty
          icon="lock"
          title="You don't have access to this page"
          [text]="access.deniedText()"
        />
      } @else if (loading() && !report()) {
        <div class="stack g16" aria-busy="true" aria-label="Loading">
          <div class="c-grid k4 cc-kp">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="sk" style="height: 104px; border-radius: 16px"></div>
            }
          </div>
          <div class="sk" style="height: 64px; border-radius: 12px"></div>
          <div class="sk" style="height: 380px; border-radius: 16px"></div>
        </div>
      } @else if (error() && !report()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the communication report" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else if (report(); as r) {
        <div class="c-grid k4 cc-kp" id="cr-kpis">
          <rp-kpi
            label="Dispatches"
            icon="send"
            [value]="num(r.totals.attempts)"
            [delta]="date(r.period.from) + ' – ' + date(r.period.to)"
          />
          <rp-kpi
            label="Delivered"
            icon="checkc"
            tone="ok"
            [value]="deliveredPct() + '%'"
            [delta]="num(out(r, 'SUCCESS')) + ' successful'"
          />
          <rp-kpi
            label="Failed"
            icon="alert"
            tone="bad"
            [value]="num(out(r, 'FAILED'))"
            [delta]="'Kept ' + r.retention.failedDays + ' days'"
          />
          <rp-kpi
            label="Skipped"
            icon="minus"
            [value]="num(out(r, 'SKIPPED'))"
            delta="Channel off or no contact"
          />
        </div>
        <div class="row g8 wrap">
          <div class="note tone-info grow">
            <rp-icon name="info" [size]="17" />
            <div class="grow">
              <b>Complete from {{ date(r.completeFrom) }}.</b> Rows are kept
              {{ r.retention.successDays }} days when delivered or skipped and
              {{ r.retention.failedDays }} days when failed, then purged each night — longer periods
              need a longer retention.
              @if (r.unrecorded) {
                {{ plural(r.unrecorded, 'dispatch', 'dispatches') }} in this period weren't
                recorded.
              }
            </div>
          </div>
          <div class="note tone-brand grow">
            <rp-icon name="shield" [size]="17" />
            <div class="grow">
              <b>Privacy.</b> A direct message shows that it was sent, between whom and the outcome
              — never its content. One-time passwords show the event that raised them, never the
              code.
            </div>
          </div>
        </div>
        <div class="pills" role="group" aria-label="Kind">
          <button
            type="button"
            class="pill"
            [class.on]="!kind()"
            [attr.aria-pressed]="!kind()"
            (click)="setKind('')"
          >
            All kinds<span class="n">{{ num(r.totals.attempts) }}</span>
          </button>
          @for (k of kinds; track k.v) {
            <button
              type="button"
              class="pill"
              [class.on]="kind() === k.v"
              [attr.aria-pressed]="kind() === k.v"
              (click)="setKind(k.v)"
            >
              {{ k.many }}<span class="n">{{ num(kindCount(k.v)) }}</span>
            </button>
          }
        </div>
        <div class="c-filters">
          <label class="search">
            <rp-icon name="search" [size]="16" />
            <input
              type="search"
              id="cr-q"
              placeholder="Recipient, raised by or subject"
              aria-label="Search the rows shown"
              autocomplete="off"
              [value]="q()"
              (input)="q.set($any($event.target).value)"
            />
          </label>
          <div class="fld">
            <rp-dd
              inputId="cr-ch"
              placeholder="All channels"
              [options]="channelOptions"
              [value]="channel()"
              (changed)="set('channel', $event)"
            />
          </div>
          <div class="fld">
            <rp-dd
              inputId="cr-out"
              placeholder="All outcomes"
              [options]="outcomeOptions"
              [value]="outcome()"
              (changed)="set('outcome', $event)"
            />
          </div>
          <div class="fld cc-date">
            <div class="fld-in">
              <input
                id="cr-from"
                type="date"
                aria-label="From"
                [max]="to()"
                [value]="from()"
                (change)="setDate('from', $event)"
              />
            </div>
          </div>
          <span class="t-muted">to</span>
          <div class="fld cc-date">
            <div class="fld-in">
              <input
                id="cr-to"
                type="date"
                aria-label="To"
                [min]="from()"
                [max]="todayIso"
                [value]="to()"
                (change)="setDate('to', $event)"
              />
            </div>
          </div>
        </div>
        @if (rangeError()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ rangeError() }}</div>
          </div>
        }
        <div class="tbl-wrap" [attr.aria-busy]="loading()">
          <table class="tbl" id="cr-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Kind</th>
                <th>Channel</th>
                <th>Recipient</th>
                <th>Raised by</th>
                <th>Subject</th>
                <th>Outcome</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              @for (x of shown(); track x.id) {
                <tr>
                  <td>
                    {{ time(x.at) }}
                    <div class="cell-s">{{ date(x.at) }}</div>
                  </td>
                  <td>
                    <span class="chip" [class]="'chip tone-' + kindOf(x.kind).tone">{{
                      kindOf(x.kind).l
                    }}</span>
                  </td>
                  <td>
                    <span class="row g6"
                      ><rp-icon [name]="channelOf(x.channel).icon" [size]="14" />{{
                        channelOf(x.channel).l
                      }}</span
                    >
                  </td>
                  <td>
                    <b class="t-sb">{{ person(x.recipient.name) || '—' }}</b>
                    @if (x.recipient.address) {
                      <div class="cell-s">{{ x.recipient.address }}</div>
                    }
                  </td>
                  <td>{{ raiser(x) }}</td>
                  <td>
                    @if (x.subject === null && x.kind === 'DIRECT_MESSAGE') {
                      <span class="t-muted">Private message</span>
                    } @else {
                      <span class="t-clip" style="display: block; max-width: 240px">{{
                        x.subject ?? '—'
                      }}</span>
                    }
                  </td>
                  <td>
                    <span class="chip dot" [class]="'chip dot tone-' + outcomeOf(x.outcome).tone">{{
                      outcomeOf(x.outcome).l()
                    }}</span>
                  </td>
                  <td>
                    @if (x.reason) {
                      <span class="t-sm">{{ x.reason }}</span>
                    } @else {
                      <span class="t-faint">—</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="8">
                    <rp-empty
                      icon="chats"
                      [title]="
                        filtered() ? 'Nothing matches these filters' : 'Nothing sent in this period'
                      "
                      [text]="
                        filtered()
                          ? 'Try another kind, channel, outcome or date range.'
                          : 'Messages appear here as they are sent.'
                      "
                    >
                      @if (filtered()) {
                        <button type="button" class="btn btn-sec btn-sm" (click)="reset()">
                          <span>Clear filters</span>
                        </button>
                      }
                    </rp-empty>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="row between">
          <span class="t-xs t-muted"
            >{{ plural(items().length, 'row') }} shown of {{ num(r.totals.attempts) }} ·
            {{ plural(r.totals.recipients, 'recipient') }}</span
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
  `,
})
export class ConsoleCommReport implements OnInit {
  private readonly api = inject(CommReportApi);
  private readonly exportsApi = inject(ExportsApi);
  private readonly overlays = inject(Overlays);
  protected readonly access = taskAccess(inject(SessionContext).console, 'commreport.view');

  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly person = person;
  protected readonly kindOf = kindOf;
  protected readonly channelOf = channelOf;
  protected readonly kinds = KINDS;
  protected readonly todayIso = today();
  protected readonly channelOptions = [
    { v: '', l: 'All channels' },
    ...(['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'] as const).map((c) => ({
      v: c,
      l: c === 'PUSH' ? 'Push' : channelOf(c).l,
    })),
  ];
  protected readonly outcomeOptions = [
    { v: '', l: 'All outcomes' },
    ...(['SUCCESS', 'FAILED', 'SKIPPED'] as const).map((o) => ({ v: o, l: OUTCOME[o].l() })),
  ];

  protected readonly report = signal<CommReport | null>(null);
  protected readonly items = signal<readonly CommRow[]>([]);
  protected readonly next = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly exporting = signal(false);
  protected readonly q = signal('');
  protected readonly kind = signal<CommKind | ''>('');
  protected readonly channel = signal<CommChannel | ''>('');
  protected readonly outcome = signal<CommOutcome | ''>('');
  protected readonly from = signal(addDays(today(), -29));
  protected readonly to = signal(today());
  protected readonly rangeError = signal('');
  /** The kind counts of the unfiltered kind (the pills keep their numbers while one is chosen). */
  private readonly kindTotals = signal<Readonly<Partial<Record<CommKind, number>>>>({});

  protected readonly filters = computed<CommFilters>(() => ({
    from: this.from(),
    to: this.to(),
    kind: this.kind(),
    channel: this.channel(),
    outcome: this.outcome(),
  }));
  protected readonly filtered = computed(
    () => !!(this.kind() || this.channel() || this.outcome() || this.q().trim()),
  );
  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    if (!q) return this.items();
    return this.items().filter((x) =>
      `${x.recipient.name ?? ''} ${x.recipient.address ?? ''} ${this.raiser(x)} ${x.subject ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  });
  protected readonly deliveredPct = computed(() => {
    const r = this.report();
    if (!r?.totals.attempts) return 0;
    return Math.round(((r.totals.byOutcome.SUCCESS ?? 0) * 100) / r.totals.attempts);
  });

  ngOnInit() {
    void this.load();
  }

  async load(cursor: string | null = null) {
    if (this.access.denied()) return;
    this.loading.set(true);
    try {
      const r = await this.api.list(this.filters(), cursor);
      this.report.set(r);
      this.items.set(cursor ? [...this.items(), ...r.items] : r.items);
      this.next.set(r.nextCursor);
      if (!this.kind() && !cursor) this.kindTotals.set(r.totals.byKind);
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
  protected setKind(k: CommKind | '') {
    this.kind.set(k);
    void this.load();
  }
  protected set(k: 'channel' | 'outcome', v: string) {
    if (k === 'channel') this.channel.set(v as CommChannel | '');
    else this.outcome.set(v as CommOutcome | '');
    void this.load();
  }
  protected setDate(k: 'from' | 'to', e: Event) {
    const v = (e.target as HTMLInputElement).value;
    if (!v) return;
    (k === 'from' ? this.from : this.to).set(v);
    if (this.from() > this.to()) {
      this.rangeError.set(translate('COM.REPORT_RANGE'));
      return;
    }
    this.rangeError.set('');
    void this.load();
  }
  protected reset() {
    this.q.set('');
    this.kind.set('');
    this.channel.set('');
    this.outcome.set('');
    void this.load();
  }
  protected kindCount(k: CommKind) {
    return (this.kind() ? this.kindTotals() : (this.report()?.totals.byKind ?? {}))[k] ?? 0;
  }
  protected out(r: CommReport, o: CommOutcome) {
    return r.totals.byOutcome[o] ?? 0;
  }
  protected outcomeOf(o: CommOutcome) {
    return OUTCOME[o] ?? { l: () => o, tone: 'neutral' };
  }
  protected raiser(x: CommRow) {
    return x.raisedBy.name ? person(x.raisedBy.name) : `System (${readable(x.raisedBy.event)})`;
  }
  protected date(iso: string) {
    return formatDate(iso);
  }
  protected time(iso: string) {
    return formatTime(iso);
  }

  /** COM-008: exactly the filtered rows, prepared off the request, then downloaded. */
  protected async exportIt() {
    this.exporting.set(true);
    try {
      const { exportId } = await this.api.exportLog(this.filters());
      const x = await this.exportsApi.ready(exportId, 'console');
      if (x.file) download(x.file);
      this.overlays.toast('CSV export prepared', {
        sub: `${plural(x.rows ?? 0, 'row')} · ${formatDate(this.from())} – ${formatDate(this.to())}`,
      });
    } catch (e) {
      this.overlays.toast("Couldn't export the report", { sub: problemText(e), tone: 'bad' });
    } finally {
      this.exporting.set(false);
    }
  }
}

/** "fee.reminder" → "Fee reminder" for a system event. */
function readable(e: string | null) {
  if (!e) return 'event';
  const s = e.replace(/[._]/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
