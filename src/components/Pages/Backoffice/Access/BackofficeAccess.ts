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
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatTime } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import { person } from '../../Console/Applications/app-format';
import { plural } from '../../Console/Fees/fee-format';
import { ExportsApi, download } from '../../Console/Reports/report-export';
import { addDays, num, problemText, today } from '../../Console/Structure/academic-format';
import { CrossInstApi, type AccessFilters, type AccessRecord } from '../CrossInst/crossinst.api';
import { figureLabel, longRange, readable, shortRange } from '../CrossInst/xi-format';

type Outcome = '' | 'Returned' | 'Refused';
const KPI_DAYS = 30;
const KIND_TONE: Readonly<Record<string, string>> = {
  Comparison: 'info',
  'Drill-through': 'violet',
};

/**
 * o.access — Access record (CR-18, RNG-GOV-033, RNG-GOV-035; RPT-011, RPT-012, RPT-005; prototype
 * o.access): every read across institutions — who, which institutions, period and figures, why and
 * the outcome, refusals included — with the last 30 days in figures, filters, a record's drawer and
 * the export of exactly the filtered records.
 */
@Component({
  selector: 'rp-backoffice-access',
  imports: [Dropdown, Empty, Icon, Kpi, Modal, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Access record"
        sub="Every read across institutions — who, which institutions, which period and figures, why, and the outcome, refusals included."
      >
        @if (allowed()) {
          <button
            type="button"
            class="btn btn-sec"
            id="acc-export"
            [class.is-busy]="exporting()"
            [disabled]="exporting() || !items().length"
            (click)="exportIt()"
          >
            <rp-icon name="download" [size]="17" /><span>Export</span>
          </button>
        }
      </rp-page-head>

      @if (!allowed()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="The access record is for operators who audit cross-institution reading. Pages your role can open are listed in the menu."
        />
      } @else if (loading() && !loaded()) {
        <div class="stack g16" aria-busy="true" aria-label="Loading">
          <div class="c-grid k4">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="sk" style="height: 104px; border-radius: 16px"></div>
            }
          </div>
          <div class="sk" style="height: 44px; border-radius: 12px"></div>
          <div class="sk" style="height: 340px; border-radius: 16px"></div>
        </div>
      } @else if (error() && !loaded()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the access record" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else {
        <div class="c-grid k4" id="acc-kpis">
          <rp-kpi label="Accesses · 30 days" icon="history" [value]="num(recent().length)" />
          <rp-kpi
            label="Refused · 30 days"
            icon="shieldx"
            tone="warn"
            [value]="num(recentRefused())"
          />
          <rp-kpi label="Drill-throughs · 30 days" icon="target" [value]="num(recentDrills())" />
          <rp-kpi
            label="Institutions read · 30 days"
            icon="building"
            [value]="num(recentInstitutions())"
            [delta]="plural(recentActors(), 'distinct actor')"
          />
        </div>
        <div class="c-filters">
          <label class="search">
            <rp-icon name="search" [size]="16" />
            <input
              type="search"
              id="acc-q"
              placeholder="Actor, institution or reason"
              aria-label="Search the records shown"
              autocomplete="off"
              [value]="q()"
              (input)="q.set($any($event.target).value)"
            />
          </label>
          <div class="fld">
            <rp-dd
              inputId="acc-kind"
              placeholder="Every kind"
              [options]="kindOptions()"
              [value]="kind()"
              (changed)="kind.set($event)"
            />
          </div>
          <div class="fld">
            <rp-dd
              inputId="acc-actor"
              placeholder="Every actor"
              [options]="actorOptions()"
              [value]="actor()"
              (changed)="actor.set($event); load()"
            />
          </div>
          <div class="ob-drange">
            <div class="fld">
              <div class="fld-in">
                <input
                  id="acc-from"
                  type="date"
                  aria-label="From"
                  [max]="to()"
                  [value]="from()"
                  (change)="setDate('from', $event)"
                />
              </div>
            </div>
            <span class="t-muted">to</span>
            <div class="fld">
              <div class="fld-in">
                <input
                  id="acc-to"
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
        </div>
        @if (rangeError()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ rangeError() }}</div>
          </div>
        }
        <div class="pills" role="group" aria-label="Outcome">
          @for (o of outcomes; track o.v) {
            <button
              type="button"
              class="pill"
              [class.on]="outcome() === o.v"
              [attr.aria-pressed]="outcome() === o.v"
              (click)="setOutcome(o.v)"
            >
              {{ o.l }}
            </button>
          }
        </div>
        <div class="tbl-wrap" [attr.aria-busy]="loading()">
          <table class="tbl" id="acc-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Kind</th>
                <th>Institutions</th>
                <th>Period</th>
                <th>Figures</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              @for (a of shown(); track a.accessId) {
                <tr
                  tabindex="0"
                  [attr.aria-label]="a.accessNo"
                  (click)="open.set(a)"
                  (keydown.enter)="open.set(a)"
                >
                  <td>
                    <div class="stack" style="gap: 1px">
                      <span class="cell-t">{{ when(a.at) }}</span>
                      <span class="cell-s"
                        ><span class="t-mono">{{ a.accessNo }}</span></span
                      >
                    </div>
                  </td>
                  <td>
                    <div class="stack" style="gap: 1px">
                      <span class="cell-t">{{ person(a.actor.name) }}</span>
                      <span class="cell-s">{{ roleName(a.actor.role) }}</span>
                    </div>
                  </td>
                  <td>
                    <span class="chip" [class]="'chip tone-' + kindTone(a.kind)">{{ a.kind }}</span>
                  </td>
                  <td>
                    @if (a.institutions.length) {
                      <div class="stack" style="gap: 1px">
                        <span class="cell-t">{{
                          plural(a.institutions.length, 'institution')
                        }}</span>
                        <span
                          class="cell-s t-clip"
                          style="max-width: 220px"
                          [attr.title]="a.institutions.join(', ')"
                          >{{ a.institutions.join(', ') }}</span
                        >
                      </div>
                    } @else {
                      <span class="t-muted">{{ a.selection || '—' }}</span>
                    }
                  </td>
                  <td>
                    @if (a.period && a.period.from && a.period.to) {
                      <span class="ob-nw t-sm">{{ shortRange(a.period.from, a.period.to) }}</span>
                    } @else {
                      <span class="t-muted">—</span>
                    }
                  </td>
                  <td>
                    @if (a.figures.length) {
                      <span
                        class="t-sm t-clip"
                        style="display: block; max-width: 200px"
                        [attr.title]="figuresText(a)"
                        >{{ figuresText(a) }}</span
                      >
                    } @else {
                      <span class="t-muted">—</span>
                    }
                  </td>
                  <td>
                    <span
                      class="chip dot"
                      [class]="'chip dot tone-' + (a.outcome === 'Refused' ? 'bad' : 'ok')"
                      >{{ a.outcome }}</span
                    >
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7">
                    <rp-empty
                      icon="history"
                      title="No accesses match"
                      text="Try another outcome, kind or date range."
                    >
                      <button type="button" class="btn btn-sec btn-sm" (click)="reset()">
                        <span>Clear filters</span>
                      </button>
                    </rp-empty>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="row between">
          <span class="t-xs t-muted">{{ plural(shown().length, 'access', 'accesses') }} shown</span>
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

    @if (open(); as a) {
      <rp-modal
        [title]="'Access ' + a.accessNo"
        [sub]="whenLong(a.at) + ' · ' + person(a.actor.name)"
        icon="history"
        [drawer]="true"
        [slim]="true"
        [foot]="false"
        (closed)="open.set(null)"
      >
        <div class="stack g16" id="acc-detail">
          <div class="row g8">
            <span
              class="chip dot"
              [class]="'chip dot tone-' + (a.outcome === 'Refused' ? 'bad' : 'ok')"
              >{{ a.outcome }}</span
            >
            <span class="chip" [class]="'chip tone-' + kindTone(a.kind)">{{ a.kind }}</span>
          </div>
          <dl class="kv">
            <dt>Actor</dt>
            <dd>
              {{ person(a.actor.name) }}
              <span class="t-xs t-muted" style="display: block">{{ roleName(a.actor.role) }}</span>
            </dd>
            @if (a.parentAccessNo) {
              <dt>From</dt>
              <dd>
                <span class="t-mono">{{ a.parentAccessNo }}</span>
              </dd>
            }
            <dt>Selection</dt>
            <dd>{{ a.selection || '—' }}</dd>
            <dt>Institutions read</dt>
            <dd>
              @if (a.outcome === 'Refused' || !a.institutions.length) {
                <span class="t-muted">None — nothing was returned</span>
              } @else {
                {{ a.institutions.join(', ') }}
              }
            </dd>
            <dt>Period</dt>
            <dd>
              {{
                a.period && a.period.from && a.period.to
                  ? longRange(a.period.from, a.period.to)
                  : '—'
              }}
            </dd>
            <dt>Figures</dt>
            <dd>{{ figuresText(a) || '—' }}</dd>
            <dt>Reason</dt>
            <dd>{{ a.reason || '—' }}</dd>
            <dt>Outcome</dt>
            <dd>
              {{ a.outcome }}
              @if (a.note) {
                <span class="t-xs t-muted" style="display: block">{{ noteText(a.note) }}</span>
              }
            </dd>
          </dl>
          <div class="note tone-info">
            <rp-icon name="info" [size]="17" />
            <div class="grow">A refused access is recorded exactly like a returned one.</div>
          </div>
        </div>
      </rp-modal>
    }
  `,
})
export class BackofficeAccess implements OnInit {
  private readonly api = inject(CrossInstApi);
  private readonly http = inject(HttpClient);
  private readonly exportsApi = inject(ExportsApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).ops;

  protected readonly num = num;
  protected readonly plural = plural;
  protected readonly person = person;
  protected readonly shortRange = shortRange;
  protected readonly longRange = longRange;
  protected readonly todayIso = today();
  protected readonly outcomes: readonly { v: Outcome; l: string }[] = [
    { v: '', l: 'All' },
    { v: 'Returned', l: 'Returned' },
    { v: 'Refused', l: 'Refused' },
  ];

  protected readonly items = signal<readonly AccessRecord[]>([]);
  /** The last 30 days, unfiltered, for the figures. */
  protected readonly recent = signal<readonly AccessRecord[]>([]);
  protected readonly next = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');
  protected readonly exporting = signal(false);
  protected readonly q = signal('');
  protected readonly kind = signal('');
  protected readonly actor = signal('');
  protected readonly outcome = signal<Outcome>('');
  protected readonly from = signal(addDays(today(), -89));
  protected readonly to = signal(today());
  protected readonly rangeError = signal('');
  protected readonly open = signal<AccessRecord | null>(null);
  private readonly roles = signal<Readonly<Record<string, string>>>({});

  protected readonly allowed = computed(
    () => !this.session() || (this.session()?.subTasks.includes('access.view') ?? false),
  );
  protected readonly filters = computed<AccessFilters>(() => ({
    from: this.from(),
    to: this.to(),
    outcome: this.outcome(),
    ...(this.actor() ? { actor: this.actor() } : {}),
  }));
  protected readonly kindOptions = computed(() => [
    { v: '', l: 'Every kind' },
    ...[...new Set(['Comparison', 'Drill-through', ...this.recent().map((a) => a.kind)])].map(
      (k) => ({ v: k, l: k }),
    ),
  ]);
  protected readonly actorOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const a of [...this.recent(), ...this.items()]) seen.set(a.actor.id, person(a.actor.name));
    return [
      { v: '', l: 'Every actor' },
      ...[...seen].sort((a, b) => a[1].localeCompare(b[1])).map(([v, l]) => ({ v, l })),
    ];
  });
  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.items().filter(
      (a) =>
        (!this.kind() || a.kind === this.kind()) &&
        (!q ||
          `${a.actor.name} ${a.institutions.join(' ')} ${a.reason ?? ''} ${a.accessNo}`
            .toLowerCase()
            .includes(q)),
    );
  });
  protected readonly recentRefused = computed(
    () => this.recent().filter((a) => a.outcome === 'Refused').length,
  );
  protected readonly recentDrills = computed(
    () => this.recent().filter((a) => a.kind === 'Drill-through').length,
  );
  protected readonly recentInstitutions = computed(
    () =>
      new Set(
        this.recent()
          .filter((a) => a.outcome === 'Returned')
          .flatMap((a) => a.institutions),
      ).size,
  );
  protected readonly recentActors = computed(
    () => new Set(this.recent().map((a) => a.actor.id)).size,
  );

  ngOnInit() {
    if (!this.allowed()) return;
    void this.load();
    void this.loadRecent();
    if (this.session()?.subTasks.includes('task.roles')) void this.loadRoles();
  }

  async load(cursor: string | null = null) {
    this.loading.set(true);
    try {
      const r = await this.api.records(this.filters(), cursor);
      this.items.set(cursor ? [...this.items(), ...r.items] : r.items);
      this.next.set(r.nextCursor);
      this.error.set('');
      this.loaded.set(true);
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** The figures read the last 30 days (up to four pages). */
  private async loadRecent() {
    const all: AccessRecord[] = [];
    let cursor: string | null = null;
    try {
      for (let i = 0; i < 4; i++) {
        const r = await this.api.records(
          { from: addDays(today(), -(KPI_DAYS - 1)), to: today() },
          cursor,
        );
        all.push(...r.items);
        cursor = r.nextCursor;
        if (!cursor) break;
      }
      this.recent.set(all);
    } catch {
      // The figures stay at zero; the list shows its own error.
    }
  }

  private async loadRoles() {
    try {
      const r = await firstValueFrom(
        this.http.get<{ items: { code: string | null; name: string }[] }>('/api/v1/ops/roles'),
      );
      this.roles.set(
        Object.fromEntries(r.items.filter((x) => x.code).map((x) => [x.code, x.name])),
      );
    } catch {
      // Role codes are shown readable instead.
    }
  }

  protected more() {
    const c = this.next();
    if (c) void this.load(c);
  }
  protected setOutcome(o: Outcome) {
    this.outcome.set(o);
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
    this.actor.set('');
    this.outcome.set('');
    this.from.set(addDays(today(), -89));
    this.to.set(today());
    this.rangeError.set('');
    void this.load();
  }
  protected when(iso: string) {
    return `${formatDate(iso).slice(0, 6)} · ${formatTime(iso)}`;
  }
  protected whenLong(iso: string) {
    return `${formatDate(iso)}, ${formatTime(iso)}`;
  }
  protected roleName(code: string | null) {
    return code ? (this.roles()[code] ?? readable(code)) : '—';
  }
  protected kindTone(k: string) {
    return KIND_TONE[k] ?? 'neutral';
  }
  protected figuresText(a: AccessRecord) {
    return a.figures.map(figureLabel).join(', ');
  }
  protected noteText(code: string) {
    const t = translate(code);
    return t === code ? readable(code) : t;
  }

  /** RPT-012: exactly the filtered records, prepared off the request, then downloaded. */
  protected async exportIt() {
    this.exporting.set(true);
    try {
      const { exportId } = await this.api.exportRecords(this.filters());
      const x = await this.exportsApi.ready(exportId, 'ops');
      if (x.file) download(x.file);
      this.overlays.toast('CSV export prepared', {
        sub: `${plural(x.rows ?? 0, 'record')} · ${longRange(this.from(), this.to())}`,
      });
    } catch (e) {
      this.overlays.toast("Couldn't export the access record", {
        sub: problemText(e),
        tone: 'bad',
      });
    } finally {
      this.exporting.set(false);
    }
  }
}
