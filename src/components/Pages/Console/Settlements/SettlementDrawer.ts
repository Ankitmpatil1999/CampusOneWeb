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
import { Amount, amountPaise } from '../../../Shared/Amount';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import type { IconName } from '../../../Utils/icons';
import { formatDate, formatTime } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import {
  SETTLEMENT_STATUS,
  STATEMENT_FILES,
  dlong,
  dt,
  inr,
  plural,
  sumPaise,
  toMoney,
} from './settlement-format';
import { SettlementsApi, type SettlementDetail } from './settlements.api';

interface Step {
  readonly title: string;
  readonly sub: string;
  readonly state: 'done' | 'now' | 'bad' | '';
  readonly icon?: IconName;
}

/**
 * The settlement drawer (prototype cm.stl.open; STL-011, STL-014): the status, the totals, the
 * merchant summary, the four statement files, the tuition collections it marks settled and the
 * approval timeline (run → stage one → final approval or rejection → payout reference).
 */
@Component({
  selector: 'rp-settlement-drawer',
  imports: [Amount, Empty, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="title()"
      [sub]="sub()"
      icon="bank"
      [drawer]="true"
      cls="cm-m"
      [foot]="false"
      (closed)="closed.emit()"
    >
      <div class="cm-dr">
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
            <button type="button" class="btn btn-sec btn-sm note-a" (click)="load()">
              <span>Try again</span>
            </button>
          </div>
        } @else if (d(); as s) {
          <div class="stack g16">
            <div class="row g8">
              <span [class]="'chip dot lg tone-' + status().tone">{{ status().l() }}</span>
              <span class="t-sm t-muted">{{
                s.status === 'FAILED'
                  ? 'Investigated through reconciliation; its lines are collected again by the next run (FR-SET-08).'
                  : ''
              }}</span>
            </div>

            <div class="c-grid k4">
              <div class="cm-tile">
                <span>Transactions</span><b class="t-num">{{ num(s.lines) }}</b>
              </div>
              <div class="cm-tile">
                <span>Gross</span><b class="t-num">{{ inr(s.gross) }}</b>
              </div>
              <div class="cm-tile">
                <span>Platform fee</span><b class="t-num">{{ inr(s.fee) }}</b>
              </div>
              <div class="cm-tile tone-brand">
                <span>Net to merchants</span><b class="t-num">{{ inr(s.net) }}</b>
              </div>
            </div>
            @if (paise(s.adjustments)) {
              <div class="note tone-info">
                <rp-icon name="info" [size]="17" />
                <div class="grow">
                  Refunds and chargebacks of {{ inr(s.adjustments) }} are deducted from this
                  settlement.
                </div>
              </div>
            }
            @if (s.recollected) {
              <div class="note tone-warn">
                <rp-icon name="alert" [size]="17" />
                <div class="grow">
                  {{ plural(s.recollected, 'line') }} of a rejected settlement
                  {{ s.recollected === 1 ? 'is' : 'are' }} collected again here.
                </div>
              </div>
            }

            <div class="sec-h"><h3>Merchant summary</h3></div>
            <div class="tbl-wrap">
              <table class="tbl dense" id="stl-merchants">
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th class="r">Txns</th>
                    <th class="r">Gross</th>
                    <th class="r">Fee</th>
                    <th class="r">Net</th>
                  </tr>
                </thead>
                <tbody>
                  @for (m of s.merchantsList; track m.id) {
                    <tr>
                      <td>
                        <b>{{ m.name }}</b>
                        <div class="cell-s">
                          <span class="t-mono">{{ m.uniqueId ?? '' }}</span>
                          @if (m.carried) {
                            · <span class="t-warn">Carried forward — merchant suspended</span>
                          } @else if (m.suspended) {
                            · <span class="t-warn">Suspended</span>
                          }
                        </div>
                      </td>
                      <td class="r t-num">{{ num(m.lines) }}</td>
                      <td class="r"><rp-amt [value]="m.gross" /></td>
                      <td class="r"><rp-amt [value]="m.fee" /></td>
                      <td class="r"><rp-amt [value]="m.net" /></td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="5">
                        <rp-empty icon="store" title="No merchant lines in this settlement" />
                      </td>
                    </tr>
                  }
                </tbody>
                @if (s.merchantsList.length) {
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td class="r t-num">{{ num(s.lines) }}</td>
                      <td class="r"><rp-amt [value]="s.gross" /></td>
                      <td class="r"><rp-amt [value]="s.fee" /></td>
                      <td class="r"><rp-amt [value]="s.net" /></td>
                    </tr>
                  </tfoot>
                }
              </table>
            </div>

            <div class="sec-h"><h3>Statements</h3></div>
            @if (files().length) {
              <div class="cm-dls">
                @for (f of files(); track f.fileNo) {
                  <button
                    type="button"
                    class="cm-dl"
                    [id]="'stl-dl-' + f.fileNo"
                    [class.is-busy]="busy() === f.fileNo"
                    [disabled]="busy() === f.fileNo"
                    (click)="download(f.fileNo)"
                  >
                    <rp-icon [name]="f.icon" [size]="18" /><span class="grow"
                      ><b>{{ f.title }}</b
                      ><small>{{ f.sub }}</small></span
                    ><rp-icon name="download" [size]="16" />
                  </button>
                }
              </div>
            } @else {
              <p class="t-sm t-muted">The run writes the statement files with the settlement.</p>
            }
            @if (tuition(); as t) {
              <div class="note tone-ok">
                <rp-icon name="checkc" [size]="17" />
                <div class="grow">
                  {{ plural(t.n, 'tuition collection') }} ({{ t.amount }}) in this settlement
                  {{ t.n === 1 ? 'is' : 'are' }} marked Settled (FR-SET-04).
                </div>
              </div>
            }

            <div class="sec-h"><h3>Approval</h3></div>
            <div class="tl" id="stl-approval">
              @for (x of steps(); track $index) {
                <div [class]="'tl-i ' + x.state">
                  <span class="tl-dot"
                    ><rp-icon [name]="x.icon ?? dot(x.state)" [size]="13" [stroke]="2.6"
                  /></span>
                  <div class="tl-c">
                    <div class="tl-t">{{ x.title }}</div>
                    <div class="tl-s">{{ x.sub }}</div>
                  </div>
                </div>
              }
            </div>
          </div>
        } @else {
          <rp-empty icon="hourglass" title="Loading…" />
        }
      </div>
    </rp-modal>
  `,
})
export class SettlementDrawer {
  private readonly api = inject(SettlementsApi);
  private readonly overlays = inject(Overlays);

  readonly settlementId = input.required<string>();
  readonly closed = output<void>();

  protected readonly inr = inr;
  protected readonly plural = plural;
  protected readonly d = signal<SettlementDetail | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal<number | null>(null);

  protected readonly title = computed(() => {
    const s = this.d();
    return s ? `Settlement ${s.settlementNo}` : 'Settlement';
  });
  protected readonly sub = computed(() => {
    const s = this.d();
    return s ? `${dlong(s.date)} · ${s.institution.name}` : '';
  });
  protected readonly status = computed(() => SETTLEMENT_STATUS[this.d()?.status ?? 'PENDING']);
  protected readonly files = computed(() => {
    const got = this.d()?.statements ?? [];
    return STATEMENT_FILES.flatMap((f) => {
      const x = got.find((g) => g.kind === f.kind);
      return x ? [{ ...f, fileNo: x.fileNo }] : [];
    });
  });
  protected readonly tuition = computed(() => {
    const lines = (this.d()?.linesList ?? []).filter((l) => l.type === 'TUITION' && !l.adjustment);
    return lines.length
      ? { n: lines.length, amount: inr(toMoney(sumPaise(lines, (l) => l.amount))) }
      : null;
  });
  protected readonly steps = computed((): Step[] => {
    const s = this.d();
    if (!s) return [];
    const quote = (r: string | null) => (r ? ` · “${r}”` : '');
    const when = (at: string | null) => (at ? dt(at) : '');
    const run = s.windowTo ?? s.createdAt;
    const out: (Step | null)[] = [
      {
        title: 'Settlement run',
        sub: `${formatDate(s.date)}${run ? ', ' + formatTime(run) : ''} · ${plural(s.lines, 'transaction')}`,
        state: 'done',
        icon: 'timer',
      },
      s.stage1
        ? {
            title: `Stage-1 approved by ${s.stage1.by}`,
            sub: `${when(s.stage1.at)}${quote(s.stage1.remarks)}`,
            state: 'done',
          }
        : s.status === 'PENDING'
          ? {
              title: 'Stage-1 approval',
              sub: 'Waiting for the CampusOne settlement maker',
              state: 'now',
            }
          : null,
      s.rejection
        ? {
            title: `Rejected by ${s.rejection.by}`,
            sub: `${when(s.rejection.at)}${quote(s.rejection.remarks)}`,
            state: 'bad',
          }
        : s.final
          ? {
              title: `Final approval by ${s.final.by}`,
              sub: `${when(s.final.at)}${quote(s.final.remarks)} · primary contact e-mailed`,
              state: 'done',
            }
          : s.status === 'APPROVAL_STAGE_1'
            ? { title: 'Final approval', sub: 'Waiting for a different checker', state: 'now' }
            : s.status === 'PENDING'
              ? { title: 'Final approval', sub: 'After stage one', state: '' }
              : null,
      s.payout
        ? {
            title: `Paid out · UTR ${s.payout.utr}`,
            sub: `${s.payout.at ? dt(s.payout.at) + ' · ' : ''}${inr(s.payout.amount)}`,
            state: 'done',
            icon: 'bank',
          }
        : s.status === 'APPROVED'
          ? {
              title: 'Bank payout reference',
              sub: 'The checker records the UTR after the bank transfer',
              state: 'now',
            }
          : null,
    ];
    return out.filter((x): x is Step => x !== null);
  });

  constructor() {
    effect(() => {
      this.settlementId();
      untracked(() => void this.load());
    });
  }

  protected async load() {
    this.error.set('');
    try {
      this.d.set(await this.api.detail(this.settlementId()));
    } catch (e) {
      this.error.set(this.problem(e));
    }
  }

  protected async download(fileNo: number) {
    const s = this.d();
    if (!s || this.busy() !== null) return;
    this.busy.set(fileNo);
    try {
      const name = await this.api.statement(s.id, fileNo);
      this.overlays.toast('Statement downloaded', { sub: name });
    } catch (e) {
      this.overlays.toast("Couldn't download the statement", { sub: this.problem(e), tone: 'bad' });
    } finally {
      this.busy.set(null);
    }
  }

  protected dot(state: Step['state']): IconName {
    return state === 'done' ? 'check' : state === 'bad' ? 'x' : 'dot';
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  protected paise(m: { amount: string }) {
    return amountPaise(m);
  }
  private problem(e: unknown) {
    return e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE');
  }
}
