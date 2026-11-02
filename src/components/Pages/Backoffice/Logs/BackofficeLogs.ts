import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { person } from '../../Console/Applications/app-format';
import { exportCsv } from '../../Console/Attendance/attendance-format';
import { plural } from '../../Console/Fees/fee-format';
import { num, problemText, today } from '../../Console/Structure/academic-format';
import { copyText } from '../../../Utils/clipboard';

interface LogRow {
  readonly id: string;
  readonly at: string;
  readonly correlationId: string | null;
  readonly method: string;
  readonly route: string;
  readonly path: string;
  readonly status: number;
  readonly latencyMs: number;
  readonly surface: string | null;
  readonly user: { readonly id: string; readonly name: string | null } | null;
  readonly institution: string | null;
  readonly problemCode: string | null;
}

interface LogDetail extends LogRow {
  readonly clientAddress: string | null;
  readonly userAgent: string | null;
  readonly queryKeys: readonly string[];
  readonly activity: readonly { action: string; entity: string; at: string }[];
}

interface LogPage {
  readonly from: string;
  readonly to: string;
  readonly items: readonly LogRow[];
  readonly nextCursor: string | null;
}

type Window = '1h' | 'today' | '24h' | '3d' | 'custom';
const WINDOWS: readonly { v: Window; l: string }[] = [
  { v: '1h', l: 'Last hour' },
  { v: 'today', l: 'Today' },
  { v: '24h', l: 'Last 24 hours' },
  { v: '3d', l: 'Last 3 days' },
  { v: 'custom', l: 'Custom dates' },
];
const SURFACE: Readonly<Record<string, string>> = {
  console: 'Console',
  ops: 'Back office',
  portal: 'Customer portal',
  member: 'App',
  terminal: 'Terminal',
  admissions: 'Admissions',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Field = 'user' | 'from' | 'corr';

/**
 * o.logs — Log analyser (FR-PLT-03, NFR-06, NFR-32, RNG-GOV-023; IDN-075, IDN-076; prototype
 * o.logs): the request log by user, institution, time, endpoint, status and correlation reference —
 * paths and query parameter names only, never values or bodies — with figures over the result, a
 * request's drawer with the activity it caused and the other entries of its correlation. Every query
 * is itself logged.
 */
@Component({
  selector: 'rp-backoffice-logs',
  imports: [Empty, Icon, Kpi, Modal, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Log analyser"
        sub="Query request and activity logs by user, time, operation and status. Personal data is masked; every query is itself logged."
      />

      @if (!allowed()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="The log analyser is for CampusOne's log analysts. Pages your role can open are listed in the menu."
        />
      } @else {
        <div class="c-grid k4" id="lg-kpis">
          <rp-kpi
            label="Requests"
            icon="activity"
            [value]="page() ? num(rows().length) + (next() ? '+' : '') : '—'"
            [delta]="windowText()"
          />
          <rp-kpi
            label="Server errors"
            icon="alertc"
            tone="bad"
            [value]="page() ? num(count5()) : '—'"
          />
          <rp-kpi label="Client errors" icon="alert" [value]="page() ? num(count4()) : '—'" />
          <rp-kpi
            label="p95 latency"
            icon="timer"
            [value]="page() && rows().length ? num(p95()) + ' ms' : '—'"
            delta="Payments target: 2 s"
          />
        </div>
        <div class="card pad">
          <div class="ob-qform" id="lg-form">
            <div class="fld" [class.invalid]="err('user')">
              <label class="fld-l" for="lg-user">User</label>
              <div class="fld-in">
                <input
                  id="lg-user"
                  type="text"
                  placeholder="User id — pick one from a result"
                  autocomplete="off"
                  aria-describedby="lg-user-e"
                  [value]="user()"
                  (input)="user.set($any($event.target).value); clear('user')"
                />
              </div>
              <div class="fld-e" id="lg-user-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('user') }}</span>
              </div>
            </div>
            <div class="fld">
              <label class="fld-l" for="lg-op">Operation</label>
              <div class="fld-in">
                <input
                  id="lg-op"
                  type="text"
                  placeholder="Endpoint, e.g. /console/members"
                  autocomplete="off"
                  [value]="endpoint()"
                  (input)="endpoint.set($any($event.target).value)"
                />
              </div>
            </div>
            <div class="fld">
              <label class="fld-l" for="lg-code">Status</label>
              <div class="fld-in">
                <select id="lg-code" (change)="status.set($any($event.target).value)">
                  @for (s of statuses; track s.v) {
                    <option [value]="s.v" [selected]="status() === s.v">{{ s.l }}</option>
                  }
                </select>
              </div>
            </div>
            <div class="fld">
              <label class="fld-l" for="lg-inst">Institution</label>
              <div class="fld-in">
                <select id="lg-inst" (change)="inst.set($any($event.target).value)">
                  <option value="" [selected]="!inst()">Every institution</option>
                  @for (i of institutions(); track i.id) {
                    <option [value]="i.id" [selected]="inst() === i.id">{{ i.name }}</option>
                  }
                </select>
              </div>
            </div>
            <div class="fld">
              <label class="fld-l" for="lg-win">Time range</label>
              <div class="fld-in">
                <select id="lg-win" (change)="win.set($any($event.target).value); clear('from')">
                  @for (w of windows; track w.v) {
                    <option [value]="w.v" [selected]="win() === w.v">{{ w.l }}</option>
                  }
                </select>
              </div>
            </div>
            <div class="fld" [class.invalid]="err('from')">
              <label class="fld-l" for="lg-from">From</label>
              <div class="fld-in">
                <input
                  id="lg-from"
                  type="date"
                  aria-describedby="lg-from-e"
                  [max]="todayIso"
                  [disabled]="win() !== 'custom'"
                  [value]="from()"
                  (change)="from.set($any($event.target).value); clear('from')"
                />
              </div>
              <div class="fld-e" id="lg-from-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('from') }}</span>
              </div>
            </div>
            <div class="fld">
              <label class="fld-l" for="lg-to">To</label>
              <div class="fld-in">
                <input
                  id="lg-to"
                  type="date"
                  [max]="todayIso"
                  [disabled]="win() !== 'custom'"
                  [value]="to()"
                  (change)="to.set($any($event.target).value); clear('from')"
                />
              </div>
            </div>
            <div class="fld" [class.invalid]="err('corr')">
              <label class="fld-l" for="lg-corr">Correlation reference</label>
              <div class="fld-in">
                <input
                  id="lg-corr"
                  type="text"
                  placeholder="The id a problem page shows"
                  autocomplete="off"
                  aria-describedby="lg-corr-e"
                  [value]="corr()"
                  (input)="corr.set($any($event.target).value); clear('corr')"
                />
              </div>
              <div class="fld-e" id="lg-corr-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('corr') }}</span>
              </div>
            </div>
            <div class="ob-qbtns">
              <button
                type="button"
                class="btn btn-pri"
                id="lg-run"
                [class.is-busy]="loading()"
                [disabled]="loading()"
                (click)="query()"
              >
                <rp-icon name="search" [size]="17" /><span>Run query</span>
              </button>
              <button type="button" class="btn btn-ghost" (click)="reset()">
                <span>Reset</span>
              </button>
            </div>
          </div>
          <p class="t-xs t-muted mt8" style="margin-bottom: 0">
            From and To apply when the time range is “Custom dates”, up to 31 days. Paths and query
            parameter names are kept — never values, bodies or personal data.
          </p>
        </div>

        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }

        @if (loading() && !page()) {
          <div class="sk" style="height: 320px; border-radius: 16px" aria-busy="true"></div>
        } @else if (page()) {
          <div class="row between wrap">
            <span class="t-sm t-muted"
              >{{ plural(rows().length, 'entry', 'entries') }}{{ next() ? ' so far' : '' }} ·
              {{ windowText() }}</span
            >
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              [disabled]="!rows().length"
              (click)="exportRows()"
            >
              <rp-icon name="download" [size]="15" /><span>Export results</span>
            </button>
          </div>
          <div class="tbl-wrap">
            <table class="tbl" id="lg-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Institution</th>
                  <th>Operation</th>
                  <th>Status</th>
                  <th class="r">Duration</th>
                  <th>Correlation</th>
                </tr>
              </thead>
              <tbody>
                @for (r of rows(); track r.id) {
                  <tr
                    tabindex="0"
                    [attr.aria-label]="r.method + ' ' + r.route"
                    (click)="openRow(r)"
                    (keydown.enter)="openRow(r)"
                  >
                    <td>
                      <div class="stack" style="gap: 1px">
                        <span class="cell-t">{{ clock(r.at) }}</span>
                        <span class="cell-s">{{ date(r.at) }}</span>
                      </div>
                    </td>
                    <td>
                      @if (r.user) {
                        <div class="stack" style="gap: 1px">
                          <span class="cell-t">{{ person(r.user.name) || 'Unnamed account' }}</span>
                          <span class="cell-s">{{ surface(r.surface) }}</span>
                        </div>
                      } @else {
                        <span class="t-muted">Not signed in</span>
                      }
                    </td>
                    <td>
                      @if (r.institution) {
                        {{ r.institution }}
                      } @else {
                        <span class="t-muted">Platform</span>
                      }
                    </td>
                    <td>
                      <div class="stack" style="gap: 1px">
                        <span class="cell-t t-mono t-sm"
                          >{{ r.method }} {{ shortRoute(r.route) }}</span
                        >
                        @if (r.problemCode) {
                          <span class="cell-s">{{ r.problemCode }}</span>
                        }
                      </div>
                    </td>
                    <td>
                      <span class="chip" [class]="'chip tone-' + tone(r.status)">{{
                        r.status
                      }}</span>
                    </td>
                    <td class="r">
                      <span class="t-num">{{ num(r.latencyMs) }} ms</span>
                    </td>
                    <td>
                      <span class="t-mono t-xs">{{ shortCorr(r.correlationId) }}</span>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="7">
                      <rp-empty
                        icon="terminal"
                        title="No entries match"
                        text="Widen the time range or clear a filter, then run the query again."
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (next()) {
            <div class="row" style="justify-content: center">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                [class.is-busy]="loading()"
                [disabled]="loading()"
                (click)="more()"
              >
                <span>Show older entries</span>
              </button>
            </div>
          }
        }
      }
    </div>

    @if (open(); as o) {
      <rp-modal
        [title]="o.method + ' ' + shortRoute(o.route)"
        [sub]="shortCorr(o.correlationId) + ' · ' + date(o.at) + ', ' + clock(o.at)"
        icon="terminal"
        [drawer]="true"
        [wide]="true"
        [foot]="false"
        (closed)="open.set(null)"
      >
        <div class="stack g16" id="lg-detail">
          <div class="row wrap g8">
            <span class="chip" [class]="'chip tone-' + tone(o.status)">{{ o.status }}</span>
            <span class="t-mono t-sm">{{ o.method }} {{ o.path }}</span>
          </div>
          @if (detailError()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ detailError() }}</div>
            </div>
          }
          <div class="fs">
            <h4><rp-icon name="info" [size]="15" /> Request</h4>
            <div class="fs-b">
              <dl class="kv">
                <dt>Correlation reference</dt>
                <dd>
                  <span class="t-mono">{{ o.correlationId ?? '—' }}</span>
                  @if (o.correlationId) {
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs btn-icon"
                      title="Copy"
                      aria-label="Copy"
                      (click)="copy(o.correlationId)"
                    >
                      <rp-icon name="copy" [size]="13" />
                    </button>
                  }
                </dd>
                <dt>Time</dt>
                <dd>{{ date(o.at) }}, {{ clock(o.at) }}</dd>
                <dt>User</dt>
                <dd>
                  @if (o.user) {
                    {{ person(o.user.name) || 'Unnamed account' }} ·
                    <button type="button" class="linkbtn" (click)="byUser(o.user.id)">
                      Only this user
                    </button>
                  } @else {
                    Not signed in
                  }
                </dd>
                <dt>Surface</dt>
                <dd>{{ surface(o.surface) }}</dd>
                <dt>Institution</dt>
                <dd>{{ o.institution ?? 'Platform (operator)' }}</dd>
                <dt>Route</dt>
                <dd>
                  <span class="t-mono">{{ o.route }}</span>
                </dd>
                @if (detail(); as d) {
                  <dt>Client address</dt>
                  <dd>
                    <span class="t-mono">{{ d.clientAddress ?? '—' }}</span>
                  </dd>
                  <dt>Client</dt>
                  <dd class="t-sm">{{ d.userAgent ?? '—' }}</dd>
                  <dt>Query parameters</dt>
                  <dd>
                    @if (d.queryKeys.length) {
                      <span class="row g4 wrap">
                        @for (k of d.queryKeys; track k) {
                          <span class="tag t-mono">{{ k }}</span>
                        }
                      </span>
                    } @else {
                      <span class="t-muted">None</span>
                    }
                  </dd>
                }
                <dt>Duration</dt>
                <dd>{{ num(o.latencyMs) }} ms</dd>
                @if (o.problemCode) {
                  <dt>Problem</dt>
                  <dd>
                    <span class="t-mono">{{ o.problemCode }}</span>
                    <span class="t-xs t-muted" style="display: block">{{
                      problemWords(o.problemCode)
                    }}</span>
                  </dd>
                }
              </dl>
            </div>
          </div>
          <div class="fs">
            <h4><rp-icon name="history" [size]="15" /> Activity recorded by this request</h4>
            <div class="fs-b">
              @if (!detail()) {
                <div class="sk" style="height: 60px; border-radius: 10px" aria-busy="true"></div>
              } @else if (detail()!.activity.length) {
                <div class="tl">
                  @for (a of detail()!.activity; track $index) {
                    <div class="tl-i">
                      <span class="tl-dot"></span>
                      <div class="tl-c">
                        <b class="t-sm">{{ a.action }}</b>
                        <div class="t-xs t-muted">{{ a.entity }} · {{ clock(a.at) }}</div>
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <p class="t-sm t-muted" style="margin: 0">
                  No activity was recorded — a read changes nothing.
                </p>
              }
            </div>
          </div>
          <div class="fs">
            <h4><rp-icon name="link" [size]="15" /> Other entries with this correlation</h4>
            <div class="fs-b">
              @if (related() === null) {
                <div class="sk" style="height: 40px; border-radius: 10px" aria-busy="true"></div>
              } @else if (related()!.length) {
                <div class="stack g6">
                  @for (r of related(); track r.id) {
                    <div class="row between t-sm">
                      <span class="t-mono">{{ r.method }} {{ shortRoute(r.route) }}</span>
                      <span class="row g8"
                        ><span class="chip" [class]="'chip tone-' + tone(r.status)">{{
                          r.status
                        }}</span
                        ><span class="t-muted">{{ clock(r.at) }}</span></span
                      >
                    </div>
                  }
                </div>
              } @else {
                <p class="t-sm t-muted" style="margin: 0">None — this request stands alone.</p>
              }
            </div>
          </div>
        </div>
      </rp-modal>
    }
  `,
})
export class BackofficeLogs implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).ops;

  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly person = person;
  protected readonly windows = WINDOWS;
  protected readonly todayIso = today();
  protected readonly statuses = [
    { v: '', l: 'Every status' },
    { v: '2xx', l: 'Success (2xx)' },
    { v: '4xx', l: 'Client error (4xx)' },
    { v: '5xx', l: 'Server error (5xx)' },
  ];

  protected readonly user = signal('');
  protected readonly endpoint = signal('');
  protected readonly status = signal('');
  protected readonly inst = signal('');
  protected readonly win = signal<Window>('24h');
  protected readonly from = signal(today());
  protected readonly to = signal(today());
  protected readonly corr = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly institutions = signal<readonly { id: string; name: string }[]>([]);

  protected readonly page = signal<LogPage | null>(null);
  protected readonly rows = signal<readonly LogRow[]>([]);
  protected readonly next = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly open = signal<LogRow | null>(null);
  protected readonly detail = signal<LogDetail | null>(null);
  protected readonly detailError = signal('');
  protected readonly related = signal<readonly LogRow[] | null>(null);
  private lastParams: Record<string, string> = {};

  protected readonly allowed = computed(
    () => !this.session() || (this.session()?.subTasks.includes('logs.query') ?? false),
  );
  protected readonly count5 = computed(() => this.rows().filter((r) => r.status >= 500).length);
  protected readonly count4 = computed(
    () => this.rows().filter((r) => r.status >= 400 && r.status < 500).length,
  );
  protected readonly p95 = computed(() => {
    const l = this.rows()
      .map((r) => r.latencyMs)
      .sort((a, b) => a - b);
    return l.length ? l[Math.min(l.length - 1, Math.ceil(l.length * 0.95) - 1)]! : 0;
  });
  protected readonly windowText = computed(() => {
    const p = this.page();
    if (!p) return '';
    if (this.win() !== 'custom') return WINDOWS.find((w) => w.v === this.win())!.l.toLowerCase();
    const f = Date.parse(p.from) ? p.from : this.from();
    const t = Date.parse(p.to) ? p.to : this.to();
    return f && t ? `${formatDate(f)} – ${formatDate(t)}` : 'the chosen dates';
  });

  ngOnInit() {
    if (!this.allowed()) return;
    void this.loadInstitutions();
    void this.query();
  }

  private async loadInstitutions() {
    try {
      const r = await firstValueFrom(
        this.http.get<{ items: { id: string; name: string }[] }>('/api/v1/ops/institutions'),
      );
      this.institutions.set(r.items);
    } catch {
      // Without the institutions list the filter offers every institution only.
    }
  }

  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected clear(f: Field) {
    if (this.errors()[f]) this.errors.update((e) => ({ ...e, [f]: '' }));
  }

  /** The time range of the chosen window (ISO instants). */
  private range(): { from: string; to: string } | null {
    const now = Date.now();
    const w = this.win();
    if (w === '1h')
      return { from: new Date(now - 3_600_000).toISOString(), to: new Date(now).toISOString() };
    if (w === '24h')
      return { from: new Date(now - 86_400_000).toISOString(), to: new Date(now).toISOString() };
    if (w === '3d')
      return {
        from: new Date(now - 3 * 86_400_000).toISOString(),
        to: new Date(now).toISOString(),
      };
    if (w === 'today')
      return {
        from: new Date(`${today()}T00:00:00+05:30`).toISOString(),
        to: new Date(now).toISOString(),
      };
    const f = this.from();
    const t = this.to();
    if (!f || !t) return null;
    return {
      from: new Date(`${f}T00:00:00+05:30`).toISOString(),
      to: new Date(Math.min(now, Date.parse(`${t}T23:59:59.999+05:30`))).toISOString(),
    };
  }

  private validate(): Record<string, string> | null {
    const e: Partial<Record<Field, string>> = {};
    const u = this.user().trim();
    if (u && !UUID.test(u)) e.user = 'Enter a user id as the results show it.';
    const r = this.range();
    if (
      !r ||
      Date.parse(r.to) < Date.parse(r.from) ||
      Date.parse(r.to) - Date.parse(r.from) > 31 * 86_400_000
    )
      e.from = translate('LOG.RANGE', { days: 31 });
    const c = this.corr().trim();
    if (c.length > 64) e.corr = 'Enter the correlation reference as a problem page shows it.';
    this.errors.set(e);
    if (Object.values(e).some((x) => x) || !r) return null;
    const p: Record<string, string> = { from: r.from, to: r.to };
    if (u) p['user'] = u;
    if (this.inst()) p['institutionId'] = this.inst();
    if (this.endpoint().trim()) p['endpoint'] = this.endpoint().trim();
    if (this.status()) p['status'] = this.status();
    if (c) p['correlationId'] = c;
    return p;
  }

  /** ob.log.q: IDN-075 (the query is itself logged). */
  async query() {
    const p = this.validate();
    if (!p) return;
    this.lastParams = p;
    await this.fetch(null);
  }

  private async fetch(cursor: string | null) {
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await firstValueFrom(
        this.http.get<LogPage>('/api/v1/ops/logs', {
          params: { ...this.lastParams, ...(cursor ? { cursor } : {}) },
        }),
      );
      this.page.set(r);
      this.rows.set(cursor ? [...this.rows(), ...r.items] : r.items);
      this.next.set(r.nextCursor);
    } catch (e) {
      if (e instanceof ApiProblem && e.errors.some((x) => x.field === 'from'))
        this.errors.set({ from: e.errors.find((x) => x.field === 'from')!.message });
      else this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected more() {
    const c = this.next();
    if (c) void this.fetch(c);
  }
  protected reset() {
    this.user.set('');
    this.endpoint.set('');
    this.status.set('');
    this.inst.set('');
    this.win.set('24h');
    this.from.set(today());
    this.to.set(today());
    this.corr.set('');
    this.errors.set({});
    void this.query();
  }

  protected async openRow(r: LogRow) {
    this.open.set(r);
    this.detail.set(null);
    this.detailError.set('');
    this.related.set(null);
    try {
      this.detail.set(
        await firstValueFrom(
          this.http.get<LogDetail>(`/api/v1/ops/logs/${encodeURIComponent(r.id)}`),
        ),
      );
    } catch (e) {
      this.detailError.set(problemText(e));
    }
    if (!r.correlationId) {
      this.related.set([]);
      return;
    }
    try {
      const at = Date.parse(r.at);
      const rel = await firstValueFrom(
        this.http.get<LogPage>('/api/v1/ops/logs', {
          params: {
            correlationId: r.correlationId,
            from: new Date(at - 86_400_000).toISOString(),
            to: new Date(at + 86_400_000).toISOString(),
          },
        }),
      );
      this.related.set(rel.items.filter((x) => x.id !== r.id));
    } catch {
      this.related.set([]);
    }
  }

  protected byUser(id: string) {
    this.open.set(null);
    this.user.set(id);
    void this.query();
  }
  protected async copy(v: string) {
    try {
      await copyText(v);
      this.overlays.toast('Copied', { sub: v });
    } catch {
      this.overlays.toast("Couldn't copy", { tone: 'bad' });
    }
  }

  protected exportRows() {
    exportCsv(
      `request-log_${today()}.csv`,
      [
        'Time',
        'User',
        'Surface',
        'Institution',
        'Method',
        'Route',
        'Status',
        'Duration (ms)',
        'Problem',
        'Correlation',
      ],
      this.rows().map((r) => [
        `${formatDate(r.at)} ${this.clock(r.at)}`,
        person(r.user?.name) || '',
        this.surface(r.surface),
        r.institution ?? 'Platform',
        r.method,
        r.route,
        r.status,
        r.latencyMs,
        r.problemCode ?? '',
        r.correlationId ?? '',
      ]),
    );
  }

  protected date(iso: string) {
    return formatDate(iso);
  }
  /** "12:40:58" in IST (24-hour, as the prototype's log time). */
  protected clock(iso: string) {
    const d = new Date(Date.parse(iso) + 330 * 60_000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  }
  protected time(iso: string) {
    return formatTime(iso);
  }
  protected surface(s: string | null) {
    return s ? (SURFACE[s] ?? s) : '—';
  }
  protected shortRoute(r: string) {
    return r.replace(/^\/api\/v1/, '');
  }
  protected shortCorr(c: string | null) {
    return c ? `${c.slice(0, 8)}…${c.slice(-4)}` : '—';
  }
  protected tone(s: number) {
    return s >= 500 ? 'bad' : s >= 400 ? 'warn' : s >= 300 ? 'info' : 'ok';
  }
  protected problemWords(code: string) {
    const t = translate(code);
    return t === code ? '' : t;
  }
}
