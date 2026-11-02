import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { person } from '../../Console/Applications/app-format';
import { plural } from '../../Console/Fees/fee-format';
import { problemText, today } from '../../Console/Structure/academic-format';
import {
  CrossInstApi,
  type OpsInstitution,
  type XiColumn,
  type XiComparison,
  type XiDrill,
  type XiFigure,
  type XiStatus,
} from './crossinst.api';
import { DrillDrawer } from './DrillDrawer';
import {
  FIGURES,
  PERIODS,
  STATUSES,
  days,
  presetRange,
  shortRange,
  statusChip,
  valueText,
  type PeriodPreset,
} from './xi-format';

const REASON = { min: 10, max: 300 } as const;
type Field = 'insts' | 'figures' | 'period' | 'reason';

/**
 * o.crossinst — Cross-institution report (CR-18, RNG-GOV-030…034; RPT-009, RPT-010; prototype
 * o.crossinst): a stated selection (named institutions or a status), the figures, a period and a
 * reason; the aggregated result side by side with totals and averages, recorded with its access
 * number; a drill-through into one institution as a separate recorded access. Roles without the
 * entitlement see the refusal (and a refused run is recorded by the server).
 */
@Component({
  selector: 'rp-backoffice-crossinst',
  imports: [DrillDrawer, Empty, Icon, Modal, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Cross-institution report"
        sub="Aggregated figures for a stated set of institutions over a stated period. Operator roles only — every run is recorded."
      />

      @if (!entitled() || refused()) {
        <div class="card pad">
          <rp-empty
            icon="shieldx"
            title="Cross-institution reporting isn't available to your role"
            [text]="deniedText()"
          >
            <button type="button" class="btn btn-sec" (click)="home()">
              <span>Back to home</span>
            </button>
          </rp-empty>
        </div>
      } @else {
        <div class="card">
          <div class="card-h">
            <span class="li-ic sm"><rp-icon name="sliders" [size]="16" /></span>
            <span class="t-h4">Report definition</span>
            <span class="t-xs t-muted">Every run is recorded</span>
          </div>
          <div class="card-b">
            <div class="ob-xgrid" id="xi-form">
              <div class="stack g8">
                <div class="eyebrow">1 · Institutions</div>
                <div class="seg" role="radiogroup" aria-label="Selection">
                  <span
                    class="seg-ind"
                    style="width: calc((100% - 8px) / 2)"
                    [style.left]="
                      'calc(3px + ' + (mode() === 'status' ? 1 : 0) + ' * ((100% - 8px) / 2 + 2px))'
                    "
                  ></span>
                  <button
                    type="button"
                    role="radio"
                    [class.on]="mode() === 'named'"
                    [attr.aria-checked]="mode() === 'named'"
                    (click)="setMode('named')"
                  >
                    Choose institutions
                  </button>
                  <button
                    type="button"
                    role="radio"
                    [class.on]="mode() === 'status'"
                    [attr.aria-checked]="mode() === 'status'"
                    (click)="setMode('status')"
                  >
                    By status
                  </button>
                </div>
                @if (mode() === 'named') {
                  <div class="ob-ilist" id="xi-insts">
                    @if (instLoading()) {
                      <div
                        class="sk"
                        style="height: 180px; border-radius: 10px"
                        aria-busy="true"
                      ></div>
                    }
                    @for (i of institutions(); track i.id) {
                      <label class="ob-irow"
                        ><input
                          type="checkbox"
                          [checked]="picked().includes(i.id)"
                          (change)="toggle(i.id)"
                        /><span class="grow t-clip">{{ i.name }}</span
                        ><span class="chip dot" [class]="'chip dot tone-' + chip(i).tone">{{
                          chip(i).l
                        }}</span></label
                      >
                    }
                  </div>
                  <div class="ob-selbar">
                    <span>{{ plural(picked().length, 'institution') }} selected</span>
                    <span class="row g12 nogrow"
                      ><button type="button" class="linkbtn" (click)="selectLive()">
                        Select live ones</button
                      ><button
                        type="button"
                        class="linkbtn"
                        (click)="picked.set([]); clear('insts')"
                      >
                        Clear
                      </button></span
                    >
                  </div>
                } @else {
                  <div class="ob-ilist" style="max-height: none" id="xi-statuses">
                    @for (s of statuses; track s) {
                      <label class="ob-irow"
                        ><input
                          type="radio"
                          name="xi-status"
                          [checked]="status() === s"
                          (change)="status.set(s); clear('insts')"
                        /><span class="grow">{{ statusLabel(s).l }}</span
                        ><span class="t-xs t-muted">{{ countOf(s) }}</span></label
                      >
                    }
                  </div>
                }
                @if (err('insts')) {
                  <div class="fld invalid">
                    <div class="fld-e" role="alert">
                      <rp-icon name="alertc" [size]="14" /><span>{{ err('insts') }}</span>
                    </div>
                  </div>
                }
              </div>

              <div class="stack g8">
                <div class="eyebrow">2 · Figures (aggregated only)</div>
                <div class="ob-ilist" style="max-height: none" id="xi-figures">
                  @for (f of figures; track f.v) {
                    <label class="ob-irow"
                      ><input
                        type="checkbox"
                        [checked]="figs().includes(f.v)"
                        (change)="toggleFig(f.v)"
                      /><span class="grow"
                        ><b class="t-sm">{{ f.l }}</b
                        ><span class="t-xs t-muted" style="display: block">{{ f.s }}</span></span
                      ></label
                    >
                  }
                </div>
                @if (err('figures')) {
                  <div class="fld invalid">
                    <div class="fld-e" role="alert">
                      <rp-icon name="alertc" [size]="14" /><span>{{ err('figures') }}</span>
                    </div>
                  </div>
                }
              </div>

              <div class="stack g12">
                <div class="stack g8">
                  <div class="eyebrow">3 · Period</div>
                  <div class="fld">
                    <div class="fld-in">
                      <select
                        id="xi-per"
                        aria-label="Period"
                        [value]="preset()"
                        (change)="setPreset($any($event.target).value)"
                      >
                        @for (p of periods; track p.v) {
                          <option [value]="p.v" [selected]="preset() === p.v">{{ p.l }}</option>
                        }
                      </select>
                    </div>
                  </div>
                  @if (preset() === 'custom') {
                    <div class="row g8">
                      <div class="fld cc-date grow">
                        <div class="fld-in">
                          <input
                            id="xi-from"
                            type="date"
                            aria-label="From"
                            [max]="to()"
                            [value]="from()"
                            (change)="from.set($any($event.target).value); clear('period')"
                          />
                        </div>
                      </div>
                      <span class="t-muted">to</span>
                      <div class="fld cc-date grow">
                        <div class="fld-in">
                          <input
                            id="xi-to"
                            type="date"
                            aria-label="To"
                            [min]="from()"
                            [max]="todayIso"
                            [value]="to()"
                            (change)="to.set($any($event.target).value); clear('period')"
                          />
                        </div>
                      </div>
                    </div>
                  }
                  <span
                    class="t-xs"
                    [class.t-muted]="!err('period')"
                    [class.t-bad]="!!err('period')"
                    >{{ err('period') || periodText() }}</span
                  >
                </div>
                <div class="stack g8">
                  <div class="eyebrow">4 · Reason</div>
                  <div class="fld" [class.invalid]="err('reason')">
                    <div class="fld-in">
                      <textarea
                        id="xi-reason"
                        rows="3"
                        placeholder="Why you need these figures — recorded with the access"
                        aria-label="Reason"
                        aria-describedby="xi-reason-e"
                        [attr.maxlength]="reasonMax"
                        [value]="reason()"
                        (input)="reason.set($any($event.target).value); clear('reason')"
                      ></textarea>
                    </div>
                    <div class="fld-e" id="xi-reason-e" role="alert">
                      <rp-icon name="alertc" [size]="14" /><span>{{ err('reason') }}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  class="btn btn-pri btn-lg btn-block"
                  id="xi-run"
                  [class.is-busy]="running()"
                  [disabled]="running()"
                  (click)="run()"
                >
                  <rp-icon name="shieldck" [size]="18" /><span>Run report</span>
                </button>
                <p class="t-xs t-muted" style="margin: 0">
                  Recorded with you, the institutions, the period, the figures and your reason —
                  refusals included.
                </p>
              </div>
            </div>
          </div>
        </div>

        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }

        @if (result(); as r) {
          <div class="card" id="xi-result">
            <div class="card-h">
              <span class="li-ic sm"><rp-icon name="globe" [size]="16" /></span>
              <span class="t-h4"
                >{{ plural(r.rows.length, 'institution') }} · {{ ranLabel() }} ·
                {{ shortRange(r.period.from, r.period.to) }}</span
              >
              <span class="chip tone-brand">Recorded · {{ r.accessNo }}</span>
            </div>
            <div class="card-b stack g12">
              <div class="note tone-brand">
                <rp-icon name="shieldck" [size]="17" />
                <div class="grow">
                  <b>Aggregated figures only.</b> No member, no transaction line, no message and no
                  document of any institution is shown. Institutions were taken from the stated
                  selection — “{{ ranSelection() }}” — never from an empty filter.
                </div>
              </div>
              <div class="ob-xtbl">
                <div class="tbl-wrap">
                  <table class="tbl" id="xi-table">
                    <thead>
                      <tr>
                        <th>Institution</th>
                        @for (c of r.columns; track c.key) {
                          <th class="r" [attr.title]="c.definition">{{ c.label }}</th>
                        }
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of r.rows; track row.institutionId) {
                        <tr>
                          <td>
                            <div class="stack" style="gap: 1px">
                              <span class="cell-t">{{ row.name }}</span>
                              <span class="cell-s">{{ statusLabel(row.status).l }}</span>
                            </div>
                          </td>
                          @for (c of r.columns; track c.key) {
                            <td class="r">
                              @if (cell(row.values[c.key], c) === '') {
                                <span
                                  class="ob-na"
                                  title="This figure can't be produced for this period"
                                  ><rp-icon name="info" [size]="12" /> n/a</span
                                >
                              } @else {
                                <span class="t-num">{{ cell(row.values[c.key], c) }}</span>
                              }
                            </td>
                          }
                          <td>
                            @if (canDrill()) {
                              <div class="row-acts">
                                <button
                                  type="button"
                                  class="btn btn-ghost btn-xs"
                                  [attr.aria-label]="'Drill into ' + row.name"
                                  (click)="askDrill(row.institutionId, row.name)"
                                >
                                  <span>Drill in</span><rp-icon name="right" [size]="14" />
                                </button>
                              </div>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>Total</td>
                        @for (c of r.columns; track c.key) {
                          <td class="r t-num">{{ cell(r.totals[c.key], c) || '—' }}</td>
                        }
                        <td></td>
                      </tr>
                      <tr>
                        <td>Average</td>
                        @for (c of r.columns; track c.key) {
                          <td class="r t-num">{{ cell(r.averages[c.key], c) || '—' }}</td>
                        }
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div class="pager">
                  <span>{{ plural(r.rows.length, 'institution') }}</span>
                </div>
              </div>
              @if (r.unavailable.length) {
                <div class="note tone-warn">
                  <rp-icon name="info" [size]="17" />
                  <div class="grow">
                    A figure its module can't yet produce over a period says so instead of showing a
                    number: {{ r.unavailable.join(', ') }}.
                  </div>
                </div>
              }
              <div class="t-xs t-muted">
                Run by {{ me() }} · {{ ranAt() }} · reason: “{{ ranReason() }}”. Drilling into one
                institution is recorded as a separate access.
              </div>
            </div>
          </div>
        } @else if (!running()) {
          <div class="card pad">
            <rp-empty
              icon="globe"
              title="Define a report and run it"
              text="Pick the institutions explicitly or by status, a period and the figures you need, and say why. Results show aggregated figures only — never a name, a transaction line or a document."
            />
          </div>
        }
      }

      @if (entitled() && !refused()) {
        <div class="card">
          <div class="card-h">
            <span class="li-ic sm"><rp-icon name="shield" [size]="16" /></span>
            <span class="t-h4">How this page is governed</span>
            @if (canAccess()) {
              <button type="button" class="linkbtn" (click)="go('/backoffice/access')">
                Access record<rp-icon name="right" [size]="14" />
              </button>
            }
          </div>
          <div class="card-b">
            <div class="ob-rules4">
              <div class="ob-rule">
                <rp-icon name="lock" [size]="18" />
                <div>
                  <b>Operator roles only</b
                  ><span
                    >No institution role reaches this page; an institution administrator has no
                    cross-institution reading of any kind.</span
                  >
                </div>
              </div>
              <div class="ob-rule">
                <rp-icon name="layers" [size]="18" />
                <div>
                  <b>Aggregated only</b
                  ><span
                    >Counts, sums, averages and rates per institution. No role holds a record-level
                    detail entitlement.</span
                  >
                </div>
              </div>
              <div class="ob-rule">
                <rp-icon name="history" [size]="18" />
                <div>
                  <b>Every access recorded</b
                  ><span
                    >Actor, institutions, period, figures, time, outcome and reason — refusals
                    included.</span
                  >
                </div>
              </div>
              <div class="ob-rule">
                <rp-icon name="target" [size]="18" />
                <div>
                  <b>Stated selection</b
                  ><span
                    >Institutions come from your explicit choice or a stated status, never from an
                    empty filter.</span
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
      }
    </div>

    @if (drillAsk(); as a) {
      <rp-modal
        [title]="'Drill into ' + a.name + '?'"
        [sub]="'From ' + (result()?.accessNo ?? '') + ' · ' + ranLabel() + ' · ' + resultRange()"
        icon="globe"
        [dismiss]="!drilling()"
        (closed)="drillAsk.set(null)"
      >
        <div class="stack g12">
          <div class="note tone-brand">
            <rp-icon name="shieldck" [size]="17" />
            <div class="grow">
              A drill-through is recorded as a <b>separate access</b> naming {{ a.name }}. You'll
              see this institution's figures broken down by member type, class, status and kind —
              still aggregated, with no names or transaction lines.
            </div>
          </div>
          <div class="fld" [class.invalid]="drillErr()">
            <label class="fld-l" for="xi-dr-why">Reason (recorded)<span class="req">*</span></label>
            <div class="fld-in">
              <textarea
                id="xi-dr-why"
                rows="2"
                aria-describedby="xi-dr-why-e"
                [attr.maxlength]="reasonMax"
                [value]="drillReason()"
                (input)="drillReason.set($any($event.target).value); drillErr.set('')"
              ></textarea>
            </div>
            <div class="fld-e" id="xi-dr-why-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ drillErr() }}</span>
            </div>
          </div>
        </div>
        <div modal-foot class="row g8">
          <button
            type="button"
            class="btn btn-sec"
            [disabled]="drilling()"
            (click)="drillAsk.set(null)"
          >
            <span>Cancel</span>
          </button>
          <button
            type="button"
            class="btn btn-pri"
            id="xi-drill-go"
            [class.is-busy]="drilling()"
            [disabled]="drilling()"
            (click)="drill(a.id, a.name)"
          >
            <rp-icon name="shieldck" [size]="17" /><span>Drill in</span>
          </button>
        </div>
      </rp-modal>
    }
    @if (drillView(); as d) {
      @if (result(); as r) {
        <rp-xi-drill
          [d]="d"
          [parent]="r"
          [periodLabel]="ranLabel()"
          (closed)="drillView.set(null)"
        />
      }
    }
  `,
})
export class BackofficeCrossInst implements OnInit {
  private readonly api = inject(CrossInstApi);
  private readonly overlays = inject(Overlays);
  private readonly router = inject(Router);
  private readonly session = inject(SessionContext).ops;

  protected readonly plural = plural;
  protected readonly shortRange = shortRange;
  protected readonly figures = FIGURES;
  protected readonly periods = PERIODS;
  protected readonly statuses = STATUSES;
  protected readonly todayIso = today();
  protected readonly reasonMax = REASON.max;

  protected readonly institutions = signal<readonly OpsInstitution[]>([]);
  protected readonly instLoading = signal(true);
  protected readonly mode = signal<'named' | 'status'>('named');
  protected readonly picked = signal<readonly string[]>([]);
  protected readonly status = signal<XiStatus | ''>('');
  protected readonly figs = signal<readonly XiFigure[]>([
    'members',
    'wallets',
    'settlement',
    'attendance',
  ]);
  protected readonly preset = signal<PeriodPreset>('7d');
  protected readonly from = signal(presetRange('7d').from);
  protected readonly to = signal(presetRange('7d').to);
  protected readonly reason = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly running = signal(false);
  protected readonly refused = signal(false);
  protected readonly result = signal<XiComparison | null>(null);
  private readonly ran = signal<{
    label: string;
    selection: string;
    reason: string;
    at: string;
  } | null>(null);
  protected readonly drillAsk = signal<{ id: string; name: string } | null>(null);
  protected readonly drillReason = signal('');
  protected readonly drillErr = signal('');
  protected readonly drilling = signal(false);
  protected readonly drillView = signal<XiDrill | null>(null);

  private readonly can = (s: string) => this.session()?.subTasks.includes(s) ?? false;
  protected readonly entitled = computed(() => !this.session() || this.can('xi.aggregate'));
  protected readonly canDrill = computed(() => this.can('xi.drill'));
  protected readonly canAccess = computed(() => this.can('task.access'));
  protected readonly me = computed(() => person(this.session()?.name) || 'you');
  protected readonly deniedText = computed(
    () =>
      `${translate('RPT.XI_NOT_ENTITLED')} Only platform-operator roles holding the cross-institution entitlement can read figures across institutions. You're signed in as ${this.session()?.role.name ?? 'an operator'}.${this.refused() ? ' This attempt was recorded in the access record.' : ''}`,
  );
  protected readonly periodText = computed(() => {
    const f = this.from();
    const t = this.to();
    if (!f || !t || f > t) return 'Choose the dates.';
    return `${shortRange(f, t)} · ${plural(days(f, t), 'day')}`;
  });
  protected readonly ranLabel = computed(() => this.ran()?.label ?? '');
  protected readonly ranSelection = computed(() => this.ran()?.selection ?? '');
  protected readonly ranReason = computed(() => this.ran()?.reason ?? '');
  protected readonly ranAt = computed(() => {
    const at = this.ran()?.at;
    return at ? `${formatDate(at)}, ${formatTime(at)}` : '';
  });
  protected readonly resultRange = computed(() => {
    const r = this.result();
    return r ? shortRange(r.period.from, r.period.to) : '';
  });

  ngOnInit() {
    if (!this.entitled()) return;
    void this.loadInstitutions();
  }

  private async loadInstitutions() {
    try {
      const r = await this.api.institutions();
      this.institutions.set(
        [...r.items].sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status)),
      );
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.instLoading.set(false);
    }
  }

  protected chip(i: OpsInstitution) {
    return statusChip(i.status, i.subscriptionStatus);
  }
  protected statusLabel(s: string) {
    return statusChip(s);
  }
  protected countOf(s: XiStatus) {
    return plural(this.institutions().filter((i) => i.status === s).length, 'institution');
  }
  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected clear(f: Field) {
    if (this.errors()[f]) this.errors.update((e) => ({ ...e, [f]: '' }));
  }
  protected setMode(m: 'named' | 'status') {
    this.mode.set(m);
    this.clear('insts');
  }
  protected toggle(id: string) {
    const p = this.picked();
    this.picked.set(p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
    this.clear('insts');
  }
  protected selectLive() {
    this.picked.set(
      this.institutions()
        .filter((i) => i.status === 'ACTIVE')
        .map((i) => i.id),
    );
    this.clear('insts');
  }
  protected toggleFig(f: XiFigure) {
    const p = this.figs();
    this.figs.set(p.includes(f) ? p.filter((x) => x !== f) : [...p, f]);
    this.clear('figures');
  }
  protected setPreset(p: PeriodPreset) {
    this.preset.set(p);
    if (p !== 'custom') {
      const r = presetRange(p);
      this.from.set(r.from);
      this.to.set(r.to);
    }
    this.clear('period');
  }
  protected cell(v: number | null | undefined, c: XiColumn) {
    return valueText(v, c.unit);
  }
  protected home() {
    void this.router.navigateByUrl('/backoffice');
  }
  protected go(p: string) {
    void this.router.navigateByUrl(p);
  }

  private validate() {
    const e: Partial<Record<Field, string>> = {};
    if (this.mode() === 'named' ? !this.picked().length : !this.status())
      e.insts = translate('RPT.XI_SELECTION');
    if (!this.figs().length) e.figures = 'Choose at least one figure.';
    if (!this.from() || !this.to() || this.from() > this.to())
      e.period = translate('COM.REPORT_RANGE');
    const r = this.reason().trim();
    if (r.length < REASON.min || r.length > REASON.max) e.reason = translate('RPT.XI_REASON');
    this.errors.set(e);
    return Object.values(e).every((x) => !x);
  }

  /** ob.xi.run: RPT-009, recorded by the server with the outcome. */
  protected async run() {
    if (this.running() || !this.validate()) return;
    this.running.set(true);
    this.error.set('');
    const named = this.mode() === 'named';
    const selection = named
      ? { institutionIds: this.picked() }
      : { status: this.status() as XiStatus };
    try {
      const r = await this.api.compare({
        selection,
        period: { from: this.from(), to: this.to() },
        figures: FIGURES.map((f) => f.v).filter((f) => this.figs().includes(f)),
        reason: this.reason().trim(),
      });
      this.result.set(r);
      this.ran.set({
        label: PERIODS.find((p) => p.v === this.preset())?.l.replace(/ \(.*\)|…$/g, '') ?? '',
        selection: named
          ? `Named: ${plural(this.picked().length, 'institution')}`
          : `Status: ${statusChip(this.status()).l}`,
        reason: this.reason().trim(),
        at: new Date().toISOString(),
      });
      this.overlays.toast(`Report recorded as ${r.accessNo}`, {
        sub: plural(r.rows.length, 'institution'),
      });
    } catch (e) {
      if (e instanceof ApiProblem && e.code === 'RPT.XI_NOT_ENTITLED') this.refused.set(true);
      else if (e instanceof ApiProblem && e.errors.length) {
        const f: Partial<Record<Field, string>> = {};
        for (const x of e.errors)
          f[
            x.field.startsWith('selection')
              ? 'insts'
              : x.field.startsWith('period')
                ? 'period'
                : x.field.startsWith('figures')
                  ? 'figures'
                  : 'reason'
          ] = x.message;
        this.errors.set(f);
      } else if (e instanceof ApiProblem && e.code.startsWith('RPT.XI_SELECTION'))
        this.errors.set({ insts: problemText(e) });
      else this.error.set(problemText(e));
    } finally {
      this.running.set(false);
    }
  }

  protected askDrill(id: string, name: string) {
    this.drillReason.set(this.ranReason());
    this.drillErr.set('');
    this.drillAsk.set({ id, name });
  }

  /** ob.xi.drill.go: RPT-010, a separate recorded access. */
  protected async drill(id: string, name: string) {
    const r = this.result();
    const why = this.drillReason().trim();
    if (!r) return;
    if (why.length < REASON.min || why.length > REASON.max) {
      this.drillErr.set(translate('RPT.XI_REASON'));
      return;
    }
    this.drilling.set(true);
    try {
      const d = await this.api.drill(r.accessId, id, why);
      this.drillAsk.set(null);
      this.drillView.set(d);
      this.overlays.toast(`Drill-through recorded as ${d.accessNo}`, { sub: name });
    } catch (e) {
      if (e instanceof ApiProblem && e.code === 'RPT.XI_NOT_ENTITLED') {
        this.drillAsk.set(null);
        this.overlays.toast(translate('RPT.XI_NOT_ENTITLED'), {
          sub: 'The attempt was recorded in the access record.',
          tone: 'bad',
        });
      } else this.drillErr.set(problemText(e));
    } finally {
      this.drilling.set(false);
    }
  }
}
