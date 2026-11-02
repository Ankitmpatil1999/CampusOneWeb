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
import { Router } from '@angular/router';
import { amountPaise, inrText } from '../../../Shared/Amount';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { ago } from '../../../Utils/dates';
import { formatDate, formatInr } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import type { IconName } from '../../../Utils/icons';
import { formatAmount } from '../../../Utils/money';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { amountText, cleanTyped } from '../../../Utils/typing';
import { ApprovalsApi } from '../Approvals/approvals.api';
import { CallLogForm } from './CallLogForm';
import {
  CHANNEL_LABEL,
  DIRECTION_LABEL,
  DONE,
  KIND_LABEL,
  PRIORITIES,
  TICKET_MOVES,
  dt,
  priorityTone,
  rupeesToPaise,
  statusOf,
  txnType,
} from './grievance-format';
import {
  GrievancesApi,
  type HistoryRow,
  type TicketDetail,
  type TicketStatus,
  type TicketUpdate,
} from './grievances.api';

type Field = 'status' | 'priority' | 'reason' | 'resolution' | 'comment' | 'refundAmount';

interface Step {
  readonly title: string;
  readonly sub: string;
  readonly state: 'done' | 'bad' | 'now';
  readonly icon?: IconName;
}

/**
 * The ticket drawer (prototype cm.grv.open — grvBody / grvFoot; GRV-007, GRV-008): the status and
 * priority, the member's words, the transaction snapshot, the member's last five transactions, the
 * history, the calls, and the update form — status (RC-20 moves only), priority, reason, resolution,
 * an optional refund and a comment for the history. Priority 1 and every refund wait for a checker
 * (c.approvals); Closed is read-only. "Log a call" opens the call form on this ticket.
 */
@Component({
  selector: 'rp-ticket-drawer',
  imports: [CallLogForm, Empty, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="title()"
      [sub]="sub()"
      icon="help"
      [drawer]="true"
      cls="cm-m"
      (closed)="closed.emit()"
    >
      <div class="cm-dr">
        @if (error() && !d()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
            <button type="button" class="btn btn-sec btn-sm note-a" (click)="load()">
              <span>Try again</span>
            </button>
          </div>
        } @else if (d(); as t) {
          <div class="stack g16">
            @if (editWhy()) {
              <div class="note tone-info">
                <rp-icon name="lock" [size]="17" />
                <div class="grow">{{ editWhy() }}</div>
              </div>
            }
            <div class="row g8 wrap">
              <span [class]="'chip dot lg tone-' + st(t.status).tone">{{ t.statusLabel }}</span>
              @if (t.awaitingApproval) {
                <span class="chip dot lg tone-violet">Awaiting approval</span>
              }
              <span [class]="'chip tone-' + tone(t.priority)">Priority {{ t.priority }}</span>
              <span class="t-sm t-muted">{{ raised() }}</span>
            </div>
            <div class="card flat pad">
              <div class="t-xs t-muted">{{ issueLabel() }}</div>
              <div class="t-md mt4" style="line-height: 1.55">“{{ t.issue }}”</div>
            </div>
            @if (t.status === 'CLOSED') {
              <div class="note tone-neutral">
                <rp-icon name="lock" [size]="17" />
                <div class="grow">{{ closedText }}</div>
              </div>
            }
            @if (t.awaitingApproval) {
              <div class="note tone-info" id="grv-awaiting">
                <rp-icon name="hourglass" [size]="17" />
                <div class="grow">{{ awaitingText() }}</div>
                @if (canApprovals()) {
                  <button type="button" class="btn btn-sec btn-xs" (click)="openApproval()">
                    <span>Open approvals</span>
                  </button>
                }
              </div>
            }
            @if (error()) {
              <div class="note tone-bad" role="alert">
                <rp-icon name="alertc" [size]="17" />
                <div class="grow">{{ error() }}</div>
              </div>
            }

            @if (t.transaction; as x) {
              <div class="sec-h"><h3>Transaction snapshot</h3></div>
              <dl class="kv" id="grv-txn">
                <dt>Reference</dt>
                <dd>
                  <span class="t-mono">{{ x.reference }}</span>
                </dd>
                <dt>Date</dt>
                <dd>{{ when(x.at) }}</dd>
                <dt>Amount</dt>
                <dd>{{ x.amount ? inr(x.amount) : '—' }}</dd>
                <dt>Type</dt>
                <dd>{{ type(x.type) }}</dd>
                @if (remarks(); as r) {
                  <dt>Remarks</dt>
                  <dd>{{ r }}</dd>
                }
              </dl>
            }
            @if (t.fraud; as f) {
              <div class="sec-h"><h3>Report details</h3></div>
              <dl class="kv">
                <dt>When it happened</dt>
                <dd>
                  @if (f.happenedOn) {
                    {{ date(f.happenedOn) }}
                  } @else {
                    <span class="t-faint">—</span>
                  }
                </dd>
                <dt>Where</dt>
                <dd>
                  @if (f.location) {
                    {{ f.location }}
                  } @else {
                    <span class="t-faint">—</span>
                  }
                </dd>
                <dt>Screenshot</dt>
                <dd>{{ t.hasAttachment ? 'Attached by the member' : 'None' }}</dd>
              </dl>
            } @else if (t.kind === 'FEEDBACK' && t.hasAttachment) {
              <dl class="kv">
                <dt>Screenshot</dt>
                <dd>Attached by the member</dd>
              </dl>
            }

            <div class="sec-h">
              <h3>Member lookup</h3>
              <span class="t-xs t-muted">{{ total() }}</span>
            </div>
            @if (t.member.transactions.items.length) {
              <div class="list" id="grv-last5">
                @for (m of t.member.transactions.items; track $index) {
                  <div class="li">
                    <span class="li-ic sm"><rp-icon name="checkc" [size]="16" /></span>
                    <span class="li-main">
                      <span class="li-t"
                        >{{ m.remarks || type(m.type) }} ·
                        {{ (m.direction === 'CREDIT' ? '+' : '') + inr(m.amount) }}</span
                      >
                      <span class="li-s"
                        >{{ when(m.at) }} · <span class="t-mono">{{ m.reference }}</span></span
                      >
                    </span>
                    <span class="li-r"><span class="chip tone-ok dot">Success</span></span>
                  </div>
                }
              </div>
            } @else {
              <p class="t-sm t-muted">No wallet transactions for this member yet.</p>
            }

            <div class="sec-h"><h3>History</h3></div>
            <div class="tl" id="grv-history">
              @for (x of history(); track $index) {
                <div [class]="'tl-i ' + x.state">
                  <span class="tl-dot"
                    ><rp-icon
                      [name]="x.icon ?? (x.state === 'bad' ? 'x' : 'check')"
                      [size]="13"
                      [stroke]="2.6"
                  /></span>
                  <div class="tl-c">
                    <div class="tl-t">{{ x.title }}</div>
                    <div class="tl-s">{{ x.sub }}</div>
                  </div>
                </div>
              }
            </div>

            @if (t.calls.length) {
              <div class="sec-h"><h3>Calls</h3></div>
              <div class="tl" id="grv-calls">
                @for (c of t.calls; track c.id) {
                  <div class="tl-i done">
                    <span class="tl-dot"><rp-icon name="phone" [size]="13" [stroke]="2.6" /></span>
                    <div class="tl-c">
                      <div class="tl-t">
                        {{ dir(c.direction) }} call · {{ c.caller }} · {{ c.minutes }} min
                      </div>
                      <div class="tl-s">
                        {{ when(c.at) }} · {{ c.summary
                        }}{{ c.source === 'SUPPORT' ? ' · logged by CampusOne support' : '' }}
                      </div>
                    </div>
                  </div>
                }
              </div>
            }

            @if (editable()) {
              <div class="fs" id="gu-form">
                <h4><rp-icon name="edit" [size]="16" /> Update ticket</h4>
                <div class="fs-b">
                  <div class="c-form">
                    <div
                      class="fld"
                      [class.invalid]="err('status')"
                      [class.shake]="shook('status')"
                    >
                      <label class="fld-l" for="gu-status">Status</label>
                      <div class="fld-in">
                        <select
                          id="gu-status"
                          aria-describedby="gu-status-e"
                          (change)="setStatus($event)"
                        >
                          @for (s of statuses(); track s) {
                            <option [value]="s" [selected]="s === status()">{{ st(s).l() }}</option>
                          }
                        </select>
                      </div>
                      <div class="fld-e" id="gu-status-e" role="alert">
                        <rp-icon name="alertc" [size]="14" /><span>{{ err('status') }}</span>
                      </div>
                    </div>
                    <div
                      class="fld"
                      [class.invalid]="err('priority')"
                      [class.shake]="shook('priority')"
                    >
                      <label class="fld-l" for="gu-pri">Priority</label>
                      <div class="fld-in">
                        <select
                          id="gu-pri"
                          aria-describedby="gu-pri-e"
                          (change)="setPriority($event)"
                        >
                          @for (p of priorities; track p) {
                            <option [value]="p" [selected]="p === priority()">
                              Priority {{ p }}
                            </option>
                          }
                        </select>
                      </div>
                      <div class="fld-e" id="gu-pri-e" role="alert">
                        <rp-icon name="alertc" [size]="14" /><span>{{ err('priority') }}</span>
                      </div>
                    </div>
                    @if (reasons().length) {
                      <div class="full">
                        <div
                          class="fld"
                          [class.invalid]="err('reason')"
                          [class.shake]="shook('reason')"
                        >
                          <label class="fld-l" for="gu-reason"
                            >Reason
                            @if (isDone()) {
                              <span class="req">*</span>
                            }
                          </label>
                          <div class="fld-in">
                            <select
                              id="gu-reason"
                              aria-describedby="gu-reason-e"
                              (change)="setReason($event)"
                            >
                              <option value="" [selected]="!reason()">Choose a reason</option>
                              @for (r of reasons(); track r.v) {
                                <option [value]="r.v" [selected]="r.v === reason()">
                                  {{ r.l }}
                                </option>
                              }
                            </select>
                          </div>
                          <div class="fld-e" id="gu-reason-e" role="alert">
                            <rp-icon name="alertc" [size]="14" /><span>{{ err('reason') }}</span>
                          </div>
                        </div>
                      </div>
                    }
                    <div class="full">
                      <div
                        class="fld"
                        [class.invalid]="err('resolution')"
                        [class.shake]="shook('resolution')"
                      >
                        <label class="fld-l" for="gu-res">Resolution</label>
                        <div class="fld-in">
                          <textarea
                            id="gu-res"
                            name="gu-res"
                            rows="2"
                            maxlength="500"
                            autocomplete="off"
                            placeholder="Required when resolving or closing — what was done"
                            aria-describedby="gu-res-e"
                            [value]="resolution()"
                            (input)="setText('resolution', $event)"
                          ></textarea>
                        </div>
                        <div class="fld-e" id="gu-res-e" role="alert">
                          <rp-icon name="alertc" [size]="14" /><span>{{ err('resolution') }}</span>
                        </div>
                      </div>
                    </div>
                    @if (t.refundable) {
                      <div class="full">
                        <label class="chk">
                          <input
                            type="checkbox"
                            id="gu-refund"
                            [checked]="refund()"
                            (change)="setRefund($event)"
                          /><span
                            >Refund the member through the ledger — Priority 1, after a checker
                            approves</span
                          >
                        </label>
                        @if (refund()) {
                          <div
                            class="fld mt8"
                            [class.invalid]="err('refundAmount')"
                            [class.shake]="shook('refundAmount')"
                          >
                            <label class="fld-l" for="gu-ramt"
                              >Refund amount<span class="opt">(optional)</span></label
                            >
                            <div class="fld-in">
                              <span class="pre">₹</span
                              ><input
                                id="gu-ramt"
                                type="text"
                                inputmode="decimal"
                                autocomplete="off"
                                maxlength="14"
                                [placeholder]="refundPlaceholder()"
                                aria-describedby="gu-ramt-e gu-ramt-h"
                                [value]="refundAmount()"
                                (input)="setText('refundAmount', $event)"
                              />
                            </div>
                            <div class="fld-e" id="gu-ramt-e" role="alert">
                              <rp-icon name="alertc" [size]="14" /><span>{{
                                err('refundAmount')
                              }}</span>
                            </div>
                            <div class="fld-h" id="gu-ramt-h">
                              Leave it empty to refund the whole transaction.
                            </div>
                          </div>
                        }
                      </div>
                    }
                    <div class="full">
                      <div
                        class="fld"
                        [class.invalid]="err('comment')"
                        [class.shake]="shook('comment')"
                      >
                        <label class="fld-l" for="gu-com"
                          >Comment for the history<span class="req">*</span></label
                        >
                        <div class="fld-in">
                          <textarea
                            id="gu-com"
                            name="gu-com"
                            rows="2"
                            maxlength="400"
                            autocomplete="off"
                            placeholder="e.g. Called the canteen; they confirmed one plate served"
                            aria-describedby="gu-com-e"
                            [value]="comment()"
                            (input)="setText('comment', $event)"
                          ></textarea>
                        </div>
                        <div class="fld-e" id="gu-com-e" role="alert">
                          <rp-icon name="alertc" [size]="14" /><span>{{ err('comment') }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p class="fld-h mt8">
                    <rp-icon name="shield" [size]="11" /> Priority 1 updates go to a checker
                    (maker-checker) and show “Awaiting approval” until decided. A refund always
                    does.
                  </p>
                </div>
              </div>
            }
          </div>
        } @else {
          <rp-empty icon="hourglass" title="Loading…" />
        }
      </div>
      <ng-container modal-foot>
        @if (editWhy()) {
          <span class="cp-why" [attr.title]="editWhy()"
            ><button type="button" class="btn btn-sec" disabled>
              <rp-icon name="phone" [size]="17" /><span>Log a call</span>
            </button></span
          >
        } @else {
          <button
            type="button"
            class="btn btn-sec"
            id="gu-call"
            [disabled]="!d()"
            (click)="calling.set(true)"
          >
            <rp-icon name="phone" [size]="17" /><span>Log a call</span>
          </button>
        }
        @if (editable()) {
          <button
            type="button"
            class="btn btn-pri"
            id="gu-save"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="save()"
          >
            <rp-icon name="check" [size]="17" /><span>Save update</span>
          </button>
        }
      </ng-container>
    </rp-modal>

    @if (calling() && d(); as t) {
      <rp-call-log-form
        [tickets]="[{ id: t.id, ticketNo: t.ticketNo, name: t.member.name }]"
        [ticketId]="t.id"
        (closed)="calling.set(false)"
        (logged)="called()"
      />
    }
  `,
})
export class TicketDrawer {
  private readonly api = inject(GrievancesApi);
  private readonly approvals = inject(ApprovalsApi);
  private readonly overlays = inject(Overlays);
  private readonly router = inject(Router);

  readonly ticketId = input.required<string>();
  /** Why this person can't change tickets ('' when they can). */
  readonly editWhy = input('');
  /** The person can open the approvals queue. */
  readonly canApprovals = input(false);
  readonly closed = output<void>();
  /** The ticket changed or a call was logged: the queue reloads. */
  readonly changed = output<void>();

  protected readonly priorities = PRIORITIES;
  protected readonly closedText = translate('GRV.CLOSED_READ_ONLY');
  protected readonly inr = inrText;
  protected readonly d = signal<TicketDetail | null>(null);
  protected readonly error = signal('');
  protected readonly approval = signal<{ no: string; maker: string; at: string } | null>(null);
  protected readonly calling = signal(false);

  protected readonly status = signal<TicketStatus>('OPEN');
  protected readonly priority = signal(2);
  protected readonly reason = signal('');
  protected readonly resolution = signal('');
  protected readonly comment = signal('');
  protected readonly refund = signal(false);
  protected readonly refundAmount = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  private readonly shaking = signal(false);
  protected readonly busy = signal(false);
  private key = newIdempotencyKey();

  protected readonly title = computed(() => {
    const t = this.d();
    if (!t) return 'Ticket';
    const noun =
      t.kind === 'FEEDBACK' ? 'Feedback' : t.kind === 'FRAUD' ? 'Fraud report' : 'Ticket';
    return `${noun} ${t.ticketNo}`;
  });
  protected readonly sub = computed(() => {
    const t = this.d();
    if (!t) return '';
    const amount = t.transaction?.amount;
    return amount ? `${t.member.name} · ${inrText(amount)}` : t.member.name;
  });
  protected readonly raised = computed(() => {
    const t = this.d();
    if (!t) return '';
    return `Raised ${dt(t.createdAt)} via ${CHANNEL_LABEL[t.channel]} by ${t.member.name}`;
  });
  protected readonly issueLabel = computed(() => {
    const t = this.d();
    if (!t) return '';
    const cat = t.categoryLabel ? ` · ${t.categoryLabel}` : '';
    return t.kind === 'TRANSACTION' ? `Issue${cat}` : `${KIND_LABEL[t.kind]}${cat}`;
  });
  protected readonly editable = computed(() => {
    const t = this.d();
    return !!t && t.status !== 'CLOSED' && !t.awaitingApproval && !this.editWhy();
  });
  protected readonly statuses = computed(() => {
    const t = this.d();
    return t ? [t.status, ...TICKET_MOVES[t.status]] : [];
  });
  protected readonly reasons = computed(() => {
    const t = this.d();
    const s = this.status();
    if (!t || s === 'OPEN') return [];
    return Object.entries(t.reasons[s] ?? {}).map(([v, l]) => ({ v, l }));
  });
  protected readonly isDone = computed(() => DONE.includes(this.status()));
  protected readonly total = computed(() => {
    const n = this.d()?.member.transactions.total ?? 0;
    return `${n.toLocaleString('en-IN')} transaction${n === 1 ? '' : 's'} in total`;
  });
  /** The remarks of the ticket's movement, when it is among the member's last five. */
  protected readonly remarks = computed(() => {
    const t = this.d();
    const ref = t?.transaction?.reference;
    return t?.member.transactions.items.find((m) => m.reference === ref)?.remarks ?? null;
  });
  protected readonly refundPlaceholder = computed(() => {
    const a = this.d()?.transaction?.amount;
    return a ? `Whole transaction: ${inrText(a)}` : '';
  });
  protected readonly awaitingText = computed(() => {
    const a = this.approval();
    if (!a) return translate('GRV.UPDATE_PENDING');
    return `An update is awaiting checker approval (${a.no}, raised by ${a.maker} ${ago(a.at)}). The ticket can't be changed until it's decided.`;
  });
  protected readonly history = computed((): Step[] => {
    const t = this.d();
    if (!t) return [];
    return t.history.map((h) => this.step(t, h));
  });

  constructor() {
    effect(() => {
      this.ticketId();
      untracked(() => void this.load());
    });
  }

  protected async load() {
    this.error.set('');
    try {
      this.show(await this.api.detail(this.ticketId()));
    } catch (e) {
      this.error.set(this.problem(e));
    }
  }

  /** Shows a ticket and resets the form to it. */
  private show(t: TicketDetail) {
    this.d.set(t);
    this.status.set(t.status);
    this.priority.set(t.priority);
    this.reason.set(t.reasonCode ?? '');
    this.resolution.set(t.resolution ?? '');
    this.comment.set('');
    this.refund.set(false);
    this.refundAmount.set('');
    this.errors.set({});
    this.approval.set(null);
    if (t.awaitingApproval && this.canApprovals()) void this.loadApproval(t.awaitingApproval);
  }

  private async loadApproval(id: string) {
    try {
      const a = await this.approvals.detail('console', id);
      this.approval.set({ no: a.no, maker: a.maker.you ? 'you' : a.maker.name, at: a.raisedAt });
    } catch {
      // The register text says the same without the request number.
    }
  }

  private step(t: TicketDetail, h: HistoryRow): Step {
    const first = h.byType === 'MEMBER' && h.status === 'OPEN' && !h.comment;
    let title = h.comment ?? (first ? this.raisedTitle(t) : h.statusLabel);
    if (h.resolution && DONE.includes(h.status) && h.resolution !== h.comment) {
      title += ` Resolution: ${h.resolution}`;
    }
    const reason =
      h.reasonCode && h.status !== 'OPEN' ? t.reasons[h.status]?.[h.reasonCode] : undefined;
    const sub = [
      dt(h.at),
      // The server names the member "You" (its member view); the console names them.
      h.byType === 'MEMBER' ? t.member.name : h.by,
      h.statusLabel,
      `Priority ${h.priority}`,
      reason ?? '',
      h.approved ? 'approved by a checker' : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      title,
      sub,
      state: h.status === 'ESCALATED_VENDOR' || h.status === 'ESCALATED_INTERNAL' ? 'bad' : 'done',
    };
  }

  private raisedTitle(t: TicketDetail) {
    const via = t.channel === 'APP' ? 'the app' : t.channel === 'WEB' ? 'the web' : 'a call';
    return t.kind === 'FEEDBACK'
      ? `Feedback sent from ${via}`
      : t.kind === 'FRAUD'
        ? `Fraud reported from ${via}`
        : `Ticket raised from ${via}`;
  }

  // --- the update form ---------------------------------------------------------------------------------
  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected shook(f: Field) {
    return this.shaking() && !!this.errors()[f];
  }
  private clear(f: Field) {
    if (this.errors()[f]) this.errors.update((x) => ({ ...x, [f]: '' }));
  }
  private val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected setStatus(e: Event) {
    const s = this.val(e) as TicketStatus;
    this.status.set(s);
    if (this.reason() && !this.reasons().some((r) => r.v === this.reason())) this.reason.set('');
    this.clear('status');
    this.clear('reason');
  }
  protected setPriority(e: Event) {
    this.priority.set(Number(this.val(e)));
    this.clear('priority');
    this.clear('status');
  }
  protected setReason(e: Event) {
    this.reason.set(this.val(e));
    this.clear('reason');
    this.clear('resolution');
  }
  protected setRefund(e: Event) {
    const on = (e.target as HTMLInputElement).checked;
    this.refund.set(on);
    // A refund needs Priority 1 (GRV.REFUND_PRIORITY): the form sets it.
    if (on) this.priority.set(1);
    this.clear('priority');
    this.clear('status');
  }
  protected setText(f: 'resolution' | 'comment' | 'refundAmount', e: Event) {
    ({ resolution: this.resolution, comment: this.comment, refundAmount: this.refundAmount })[
      f
      // The refund amount takes numbers only (client 2026-10-14).
    ].set(
      f === 'refundAmount' ? cleanTyped(e.target as HTMLInputElement, amountText) : this.val(e),
    );
    this.clear(f);
    if (f === 'resolution') this.clear('reason');
  }

  protected async save() {
    const t = this.d();
    if (!t || this.busy()) return;
    this.error.set('');
    const status = this.status();
    const priority = this.priority();
    const reason = this.reason();
    const resolution = this.resolution().trim();
    const comment = this.comment().trim();
    const refund = this.refund();
    const e: Partial<Record<Field, string>> = {};
    if (comment.length < 5 || comment.length > 400) e.comment = translate('GRV.COMMENT');
    if (DONE.includes(status) && !reason && !resolution)
      e.reason = translate('GRV.REASON_REQUIRED');
    if (reason === 'OTHER' && !resolution) e.resolution = translate('GRV.OTHER_COMMENT');
    if (refund && priority !== 1) e.priority = translate('GRV.REFUND_PRIORITY');
    let refundPaise: number | null = null;
    if (refund && this.refundAmount().trim()) {
      refundPaise = rupeesToPaise(this.refundAmount());
      const max = t.transaction?.amount ? amountPaise(t.transaction.amount) : null;
      if (!refundPaise || (max !== null && refundPaise > max)) {
        e.refundAmount = translate('VALIDATION.AMOUNT');
      }
    }
    if (
      !Object.values(e).some(Boolean) &&
      status === t.status &&
      priority === t.priority &&
      (reason || null) === (t.reasonCode ?? null) &&
      (resolution || null) === (t.resolution ?? null) &&
      !refund
    ) {
      e.status = translate('GRV.NOTHING_CHANGED');
    }
    this.errors.set(e);
    if (Object.values(e).some(Boolean)) {
      this.shaking.set(false);
      setTimeout(() => this.shaking.set(true));
      return;
    }
    const label = (s: TicketStatus) => statusOf(s).l();
    const p1 = priority === 1 || t.priority === 1 || refund;
    const refundText = refund
      ? `; refund ${refundPaise ? formatInr(refundPaise) : 'of the whole transaction'}`
      : '';
    const moves = [
      status !== t.status ? `${label(t.status)} → ${label(status)}` : '',
      priority !== t.priority ? `Priority ${t.priority} → Priority ${priority}` : '',
    ].filter(Boolean);
    const ok = await this.overlays.confirm(
      p1
        ? {
            title: 'Send this Priority 1 update for approval?',
            text: `Proposed: ${label(status)} · Priority ${priority}${refundText}. It takes effect only when a different checker approves it.`,
            ok: 'Send for approval',
            icon: 'shield',
          }
        : {
            title: `Update ${t.ticketNo}?`,
            text: `${moves.length ? moves.join('; ') + '.' : 'The reason and resolution change.'}${
              status === 'CLOSED' ? ' Closed tickets become read-only.' : ''
            } The member is notified.`,
            ok: 'Save update',
            tone: status === 'CLOSED' ? 'warn' : 'brand',
          },
    );
    if (!ok) return;
    const body: TicketUpdate = {
      status,
      priority,
      reasonCode: reason || null,
      resolution: resolution || null,
      comment,
      ...(refund
        ? {
            refund: refundPaise
              ? { amount: { amount: formatAmount(refundPaise), currency: 'INR' as const } }
              : {},
          }
        : {}),
    };
    this.busy.set(true);
    try {
      const out = await this.api.update(t.id, t.version, body, this.key);
      this.key = newIdempotencyKey();
      const waits = !!out.approvalId && !out.appliedDirectly;
      this.overlays.toast(translate(out.code), {
        sub: waits
          ? `${t.ticketNo} · shows “Awaiting approval” until a checker decides`
          : out.approvalId
            ? `${t.ticketNo} · applied directly — your own request as the administrator`
            : `${t.ticketNo} · ${out.ticket.statusLabel} · Priority ${out.ticket.priority}`,
      });
      this.show(out.ticket);
      this.changed.emit();
    } catch (x) {
      if (x instanceof ApiProblem && x.status >= 400 && x.status < 500) {
        this.key = newIdempotencyKey();
      }
      if (x instanceof ApiProblem && x.errors.length) {
        const map: Record<string, Field> = {
          status: 'status',
          priority: 'priority',
          reasonCode: 'reason',
          resolution: 'resolution',
          comment: 'comment',
          'refund.amount': 'refundAmount',
        };
        const f: Partial<Record<Field, string>> = {};
        for (const y of x.errors) if (map[y.field]) f[map[y.field]!] = y.message;
        this.errors.set(f);
        if (!Object.keys(f).length) this.error.set(x.detail);
      } else {
        this.error.set(this.problem(x));
        // Changed meanwhile (412), a pending request or a closed ticket (409): show it as it is now.
        if (x instanceof ApiProblem && (x.status === 409 || x.status === 412)) {
          try {
            const now = await this.api.detail(t.id);
            const msg = this.error();
            this.show(now);
            this.error.set(msg);
            this.changed.emit();
          } catch {
            // The message stays; the person can close and reopen the ticket.
          }
        }
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async called() {
    this.calling.set(false);
    this.changed.emit();
    try {
      const t = await this.api.detail(this.ticketId());
      // Keep what is being typed in the form; only the calls and history are new.
      const cur = this.d();
      if (cur && cur.version === t.version) this.d.set(t);
      else this.show(t);
    } catch {
      // The call is logged; the drawer shows it when reopened.
    }
  }

  protected openApproval() {
    const id = this.d()?.awaitingApproval;
    if (!id) return;
    this.closed.emit();
    void this.router.navigate(['/console/approvals'], { queryParams: { open: id } });
  }

  // --- formatting ----------------------------------------------------------------------------------------
  protected st(s: TicketStatus) {
    return statusOf(s);
  }
  protected tone(p: number) {
    return priorityTone(p);
  }
  protected type(t: string | null) {
    return txnType(t);
  }
  protected dir(d: 'INBOUND' | 'OUTBOUND') {
    return DIRECTION_LABEL[d];
  }
  protected when(v: string | null) {
    return dt(v);
  }
  protected date(v: string) {
    return formatDate(v);
  }
  private problem(e: unknown) {
    return e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE');
  }
}
