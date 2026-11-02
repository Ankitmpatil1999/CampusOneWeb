import { HttpClient } from '@angular/common/http';
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
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { downloadFile } from '../../../Utils/download';
import { formatDate, formatDateTime } from '../../../Utils/format';
import type { IconName } from '../../../Utils/icons';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import {
  STATEMENTS,
  STATUS_TONE,
  inr,
  longDay,
  paiseOf,
  permsOf,
  plural,
  statusLabel,
  type Perm,
} from './settlement-format';
import { SettlementsApi, type SettlementDetail } from './settlements.api';

export type SettlementAction = 'stage1' | 'final' | 'reject' | 'payout';

interface Step {
  readonly title: string;
  readonly sub: string;
  readonly state: '' | 'done' | 'now' | 'bad';
  readonly icon: IconName;
}

/**
 * One settlement (prototype stlView; STL-002): the figures, the approval trail, what the signed-in
 * operator may do and why, the merchant lines and the four statement files. The actions are run by
 * the page (it owns the confirmations), which bumps `rev` so the drawer reads the settlement again.
 */
@Component({
  selector: 'rp-stl-drawer',
  imports: [Empty, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ov fixed" (click)="closed.emit()" (keydown.escape)="closed.emit()" tabindex="-1">
      <div
        class="drawer wide"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
        (click)="$event.stopPropagation()"
        (keydown)="$event.stopPropagation()"
        tabindex="-1"
      >
        <div class="sh-h">
          <span class="li-ic" style="background: var(--brand-soft); color: var(--brand-2)"
            ><rp-icon name="bank" [size]="19"
          /></span>
          <div class="sh-t">
            <h3>{{ title() }}</h3>
            @if (s(); as x) {
              <p>
                {{ x.institution.name }} · {{ long(x.date) }} ·
                <span [class]="'chip dot tone-' + tone(x)">{{ label(x) }}</span>
              </p>
            }
          </div>
          <button type="button" class="x-btn" aria-label="Close" (click)="closed.emit()">
            <rp-icon name="x" [size]="18" />
          </button>
        </div>
        <div class="sh-b">
          @if (error()) {
            <rp-empty icon="alertc" title="Couldn't load the settlement" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="load()">
                <span>Try again</span>
              </button>
            </rp-empty>
          } @else if (s(); as x) {
            <div class="stack g16">
              <div class="c-grid k4 ob-mini">
                <div class="kpi">
                  <span class="k-l">Transactions</span
                  ><span class="k-v" style="font-size: 18px">{{ num(x.lines) }}</span>
                </div>
                <div class="kpi">
                  <span class="k-l">Gross</span
                  ><span class="k-v" style="font-size: 18px">{{ money(x.gross) }}</span>
                </div>
                <div class="kpi">
                  <span class="k-l">Platform fee</span
                  ><span class="k-v" style="font-size: 18px">{{ money(x.fee) }}</span>
                </div>
                <div class="kpi">
                  <span class="k-l">Settlement amount</span
                  ><span class="k-v" style="font-size: 18px"
                    ><b>{{ money(x.net) }}</b></span
                  >
                </div>
              </div>
              @for (n of notes(); track n.text) {
                <div class="note" [class]="'tone-' + n.tone">
                  <rp-icon [name]="n.tone === 'warn' ? 'alert' : 'info'" [size]="17" />
                  <div class="grow">{{ n.text }}</div>
                </div>
              }
              <div class="c-grid k2">
                <div class="fs">
                  <h4><rp-icon name="history" [size]="15" /> Approval trail</h4>
                  <div class="fs-b">
                    <div class="tl">
                      @for (t of trail(); track t.title) {
                        <div class="tl-i" [class]="t.state">
                          <span class="tl-dot"
                            ><rp-icon [name]="t.icon" [size]="13" [stroke]="2.6"
                          /></span>
                          <div class="tl-c">
                            <div class="tl-t">{{ t.title }}</div>
                            <div class="tl-s">{{ t.sub }}</div>
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                </div>
                <div class="fs">
                  <h4><rp-icon name="shieldck" [size]="15" /> What you can do here</h4>
                  <div class="fs-b">
                    @for (p of permList(); track p.l) {
                      <div class="ob-perm" [class.ok]="p.p.ok" [class.no]="!p.p.ok">
                        <rp-icon [name]="p.p.ok ? 'checkc' : 'xc'" [size]="16" />
                        <div>
                          <b>{{ p.l }}</b
                          ><span>{{ p.p.why }}</span>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              </div>
              <div class="fs">
                <h4><rp-icon name="store" [size]="15" /> Merchant lines</h4>
                <div class="fs-b" style="padding: 0">
                  @if (x.merchantsList.length) {
                    <div class="tbl-wrap" style="border: 0; border-radius: 0">
                      <table class="tbl dense">
                        <thead>
                          <tr>
                            <th>Merchant</th>
                            <th class="r">Txns</th>
                            <th class="r">Gross</th>
                            <th class="r">Fee</th>
                            @if (hasAdjustments()) {
                              <th class="r">Adjustments</th>
                            }
                            <th class="r">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (m of x.merchantsList; track m.id) {
                            <tr>
                              <td>
                                {{ m.name }}
                                @if (m.carried || m.suspended) {
                                  <span
                                    class="chip tone-warn"
                                    title="Paid in a later settlement once the merchant is active again"
                                    >Carried forward</span
                                  >
                                } @else if (m.paid) {
                                  <span class="chip tone-ok">Paid out</span>
                                }
                              </td>
                              <td class="r">{{ num(m.lines) }}</td>
                              <td class="r">{{ money(m.gross) }}</td>
                              <td class="r">{{ money(m.fee) }}</td>
                              @if (hasAdjustments()) {
                                <td class="r">{{ minus(m.adjustments) }}</td>
                              }
                              <td class="r">
                                <b>{{ money(m.net) }}</b>
                              </td>
                            </tr>
                          }
                        </tbody>
                        <tfoot>
                          <tr>
                            <td>Total</td>
                            <td class="r">{{ num(x.lines) }}</td>
                            <td class="r">{{ money(x.gross) }}</td>
                            <td class="r">{{ money(x.fee) }}</td>
                            @if (hasAdjustments()) {
                              <td class="r">{{ minus(x.adjustments) }}</td>
                            }
                            <td class="r">{{ money(x.net) }}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  } @else {
                    <rp-empty
                      icon="store"
                      title="No merchant collections in this window"
                      text="Nothing was credited to the institution's merchants up to the 23:30 cut-off, so nothing is paid out."
                    />
                  }
                </div>
              </div>
              <div class="fs">
                <h4><rp-icon name="download" [size]="15" /> Statements</h4>
                <div class="fs-b">
                  @if (x.statements.length) {
                    <div class="ob-dl">
                      @for (f of x.statements; track f.fileNo) {
                        <button
                          type="button"
                          class="ob-dlb"
                          [class.is-busy]="downloading() === f.fileNo"
                          [attr.aria-label]="'Download ' + statementOf(f.kind).l"
                          (click)="download(f)"
                        >
                          <rp-icon name="sheet" [size]="18" /><span
                            ><b>{{ statementOf(f.kind).l }}</b
                            ><small>{{ statementOf(f.kind).cols }}</small></span
                          ><rp-icon name="download" [size]="15" />
                        </button>
                      }
                    </div>
                  } @else {
                    <p class="t-sm t-muted">No statement files were written for this settlement.</p>
                  }
                  <p class="t-xs t-muted mt8">
                    Statements are available only to roles holding the settlement task. Each link
                    works for a few minutes.
                  </p>
                </div>
              </div>
            </div>
          } @else {
            <div class="stack g16" aria-busy="true">
              <div class="c-grid k4">
                @for (i of [1, 2, 3, 4]; track i) {
                  <div class="sk" style="height: 68px; border-radius: 16px"></div>
                }
              </div>
              <div class="sk" style="height: 260px; border-radius: 16px"></div>
              <div class="sk" style="height: 160px; border-radius: 16px"></div>
            </div>
          }
        </div>
        <div class="sh-f">
          @if (s(); as x) {
            @if (anyAction()) {
              @if (perms()?.reject?.ok) {
                <button
                  type="button"
                  class="btn btn-danger-o"
                  id="ob-stl-reject"
                  (click)="act.emit({ kind: 'reject', s: x })"
                >
                  <rp-icon name="xc" [size]="17" /><span>Reject</span>
                </button>
              }
              @if (perms()?.stage1?.ok) {
                <button
                  type="button"
                  class="btn btn-pri"
                  id="ob-stl-s1"
                  (click)="act.emit({ kind: 'stage1', s: x })"
                >
                  <rp-icon name="check" [size]="17" /><span>Approve stage 1</span>
                </button>
              }
              @if (perms()?.final?.ok) {
                <button
                  type="button"
                  class="btn btn-pri"
                  id="ob-stl-final"
                  (click)="act.emit({ kind: 'final', s: x })"
                >
                  <rp-icon name="checkc" [size]="17" /><span>Give final approval</span>
                </button>
              }
              @if (perms()?.payout?.ok) {
                <button
                  type="button"
                  class="btn btn-pri"
                  id="ob-stl-payout"
                  (click)="act.emit({ kind: 'payout', s: x })"
                >
                  <rp-icon name="bank" [size]="17" /><span>Record payout reference</span>
                </button>
              }
            } @else {
              <span class="t-sm t-muted" style="margin-right: auto; align-self: center">{{
                x.status === 'APPROVED' && x.payout
                  ? 'Settled and paid out — no further action.'
                  : x.status === 'FAILED'
                    ? label(x) + ' settlements are final.'
                    : 'No action available to your role.'
              }}</span>
              <button type="button" class="btn btn-sec" (click)="closed.emit()">
                <span>Close</span>
              </button>
            }
          } @else {
            <button type="button" class="btn btn-sec" (click)="closed.emit()">
              <span>Close</span>
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class SettlementDrawer {
  private readonly api = inject(SettlementsApi);
  private readonly http = inject(HttpClient);
  private readonly overlays = inject(Overlays);

  readonly id = input.required<string>();
  /** Bumped by the page after an action: the settlement is read again. */
  readonly rev = input(0);
  readonly me = input.required<{ name: string; role: string; subTasks: readonly string[] }>();
  readonly closed = output<void>();
  readonly act = output<{ kind: SettlementAction; s: SettlementDetail }>();
  /** The settlement as read (the page keeps its row in step). */
  readonly loaded = output<SettlementDetail>();

  protected readonly s = signal<SettlementDetail | null>(null);
  protected readonly error = signal('');
  protected readonly downloading = signal<number | null>(null);
  private seq = 0;

  protected readonly title = computed(() => {
    const x = this.s();
    return x ? `Settlement ${x.settlementNo}` : 'Settlement';
  });
  protected readonly perms = computed(() => {
    const x = this.s();
    return x ? permsOf(x, this.me()) : null;
  });
  protected readonly permList = computed(() => {
    const p = this.perms();
    if (!p) return [];
    const list: { l: string; p: Perm }[] = [
      { l: 'Stage-1 approval', p: p.stage1 },
      { l: 'Final approval', p: p.final },
      { l: 'Reject', p: p.reject },
      { l: 'Record payout reference', p: p.payout },
    ];
    return list;
  });
  protected readonly anyAction = computed(() => {
    const p = this.perms();
    return !!p && (p.stage1.ok || p.final.ok || p.reject.ok || p.payout.ok);
  });
  protected readonly hasAdjustments = computed(() => paiseOf(this.s()?.adjustments) !== 0);
  protected readonly trail = computed<Step[]>(() => {
    const x = this.s();
    if (!x) return [];
    const out: Step[] = [
      {
        title: 'Created by the 23:30 settlement run',
        sub: `${formatDate(x.date)} · ${plural(x.lines, 'transaction')} · status Pending`,
        state: 'done',
        icon: 'timer',
      },
    ];
    if (x.stage1) {
      out.push({
        title: `Stage 1 approved by ${x.stage1.by}`,
        sub: this.said(x.stage1),
        state: 'done',
        icon: 'check',
      });
    } else if (x.status === 'PENDING') {
      out.push({
        title: 'Stage-1 approval (maker)',
        sub: 'Waiting — remarks are mandatory',
        state: 'now',
        icon: 'dot',
      });
    }
    if (x.rejection) {
      out.push({
        title: `Rejected by ${x.rejection.by}`,
        sub: this.said(x.rejection),
        state: 'bad',
        icon: 'x',
      });
      return out;
    }
    out.push(
      x.final
        ? {
            title: `Final approval by ${x.final.by}`,
            sub: this.said(x.final),
            state: 'done',
            icon: 'check',
          }
        : {
            title: 'Final approval (a different checker)',
            sub:
              x.status === 'APPROVAL_STAGE_1' ? 'Waiting — remarks are mandatory' : 'After stage 1',
            state: x.status === 'APPROVAL_STAGE_1' ? 'now' : '',
            icon: 'dot',
          },
    );
    out.push(
      x.payout
        ? {
            title: `Payout recorded · ${x.payout.utr}`,
            sub: `${inr(x.payout.amount)}${x.payout.at ? ' · ' + formatDateTime(x.payout.at) : ''} · recorded by ${x.payout.by}`,
            state: 'done',
            icon: 'bank',
          }
        : {
            title: 'Bank payout reference',
            sub:
              x.status === 'APPROVED'
                ? 'Waiting for the UTR from the bank'
                : 'After final approval',
            state: x.status === 'APPROVED' ? 'now' : '',
            icon: 'bank',
          },
    );
    return out;
  });
  protected readonly notes = computed(() => {
    const x = this.s();
    if (!x) return [];
    const out: { tone: 'info' | 'warn'; text: string }[] = [];
    if (x.recollected) {
      out.push({
        tone: 'info',
        text: `${plural(x.recollected, 'transaction')} of a rejected settlement collected again — once, with their original references.`,
      });
    }
    if (paiseOf(x.adjustments)) {
      out.push({
        tone: 'info',
        text: `Refunds and chargebacks of ${inr(x.adjustments)} taken back from merchants after an earlier settlement are deducted here.`,
      });
    }
    if (x.status === 'APPROVED' && !x.payout && paiseOf(x.payableNow) !== paiseOf(x.net)) {
      out.push({
        tone: 'warn',
        text: `${inr(x.payableNow)} is payable now: merchants suspended since the run, or whose deductions exceed their collections, are carried forward to a later settlement.`,
      });
    }
    return out;
  });

  constructor() {
    effect(() => {
      this.id();
      this.rev();
      untracked(() => void this.load());
    });
  }

  protected async load() {
    const n = ++this.seq;
    this.error.set('');
    try {
      const x = await this.api.detail(this.id());
      if (n !== this.seq) return;
      this.s.set(x);
      this.loaded.emit(x);
    } catch (e) {
      if (n === this.seq) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    }
  }

  /** STL-007: a signed link, then the file itself. */
  protected async download(f: { fileNo: number; kind: string; name: string }) {
    const x = this.s();
    if (!x || this.downloading() !== null) return;
    this.downloading.set(f.fileNo);
    try {
      const link = await this.api.statement(x.id, f.fileNo);
      await downloadFile(this.http, link.url, link.name || f.name);
      this.overlays.toast(`Downloading ${link.name || f.name}`, {
        sub: this.statementOf(f.kind).cols,
        tone: 'info',
      });
    } catch (e) {
      this.overlays.toast('Not downloaded', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    } finally {
      this.downloading.set(null);
    }
  }

  private said(d: { at: string | null; remarks: string | null }) {
    return [d.at ? formatDateTime(d.at) : '', d.remarks ? `“${d.remarks}”` : '']
      .filter(Boolean)
      .join(' · ');
  }

  protected statementOf(kind: string) {
    return STATEMENTS[kind] ?? { l: kind, cols: '' };
  }
  protected label(x: SettlementDetail) {
    return statusLabel(x.status);
  }
  protected tone(x: SettlementDetail) {
    return STATUS_TONE[x.status];
  }
  protected long(d: string) {
    return longDay(d);
  }
  protected money(m: { amount: string }) {
    return inr(m);
  }
  protected minus(m: { amount: string }) {
    return paiseOf(m) ? `−${inr(m)}` : inr(m);
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
}
