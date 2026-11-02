import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { inrText } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import type { IconName } from '../../../Utils/icons';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import {
  CHANNEL_LABEL,
  KIND_LABEL,
  TICKET_NO,
  dt,
  priorityTone,
  statusOf,
  txnType,
} from '../../Console/Grievances/grievance-format';
import type { CallLog, MemberTxn } from '../../Console/Grievances/grievances.api';
import { SupportCallForm } from './SupportCallForm';
import { SupportApi, type SupportTicket, type SupportTransactions } from './support.api';

/**
 * o.support — Support desk (SRS 16, FR-GRV-04; GRV-011…013; RNG-GOV-008; prototype o.support): a
 * ticket found by its number or the member's mobile across institutions — with the reason for the
 * look-up, which the server records — the ticket, the member's last five transactions (recorded
 * too), and the calls logged against it (SupportCallForm). Support reads and logs calls; the
 * institution's grievance officer changes the ticket.
 */
@Component({
  selector: 'rp-backoffice-support',
  imports: [Avatar, Empty, Icon, PageHead, SupportCallForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Support desk"
        sub="Find a ticket by its number or the member's mobile, see the member's recent transactions, and log every call against the ticket."
      />

      @if (!canLookup()) {
        <rp-empty
          icon="lock"
          title="This page isn't part of your role"
          text="The support desk is for CampusOne's support officers. Pages your role can open are listed in the menu."
        />
      } @else {
        <div class="c-filters" id="ob-sp-bar">
          <label class="search"
            ><rp-icon name="search" [size]="16" /><input
              type="search"
              id="ob-spq"
              placeholder="Ticket or mobile number"
              aria-label="Ticket number or member mobile"
              aria-describedby="ob-spq-e"
              autocomplete="off"
              maxlength="20"
              [value]="q()"
              (input)="setQ($event)"
              (keydown.enter)="search()"
          /></label>
          <div
            class="fld sup-why"
            [class.invalid]="whyError()"
            [class.shake]="shake() && whyError()"
          >
            <div class="fld-in">
              <input
                id="ob-sp-why"
                type="text"
                autocomplete="off"
                maxlength="200"
                placeholder="Why you are looking (recorded)"
                aria-label="Reason for the look-up"
                aria-describedby="ob-sp-why-e"
                [value]="reason()"
                (input)="setReason($event)"
                (keydown.enter)="search()"
              />
            </div>
          </div>
          <button
            type="button"
            class="btn btn-pri btn-sm"
            id="ob-sp-go"
            [class.is-busy]="searching()"
            [disabled]="searching()"
            (click)="search()"
          >
            <rp-icon name="search" [size]="15" /><span>Find</span>
          </button>
          @if (selected() && (results()?.length ?? 0) > 1) {
            <button type="button" class="btn btn-ghost btn-sm" (click)="selected.set(null)">
              <rp-icon name="arrowl" [size]="15" /><span>All results</span>
            </button>
          }
          <span class="fsum"
            ><rp-icon name="shield" [size]="13" /> Look-ups are recorded with your reason</span
          >
        </div>
        @if (qError() || whyError()) {
          <div class="fld invalid sup-errs">
            @if (qError()) {
              <div class="fld-e" id="ob-spq-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ qError() }}</span>
              </div>
            }
            @if (whyError()) {
              <div class="fld-e" id="ob-sp-why-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ whyError() }}</span>
              </div>
            }
          </div>
        }

        @if (error()) {
          <div class="card pad">
            <rp-empty icon="alertc" title="Couldn't search" [text]="error()">
              <button type="button" class="btn btn-sec btn-sm" (click)="search()">
                <span>Try again</span>
              </button>
            </rp-empty>
          </div>
        } @else if (searching() && !results()) {
          <div class="card pad"><rp-empty icon="hourglass" title="Searching…" /></div>
        } @else if (selected(); as t) {
          <div class="c-grid s21" id="ob-sp-desk">
            <div class="stack g16">
              <div class="card">
                <div class="card-h">
                  <span class="li-ic sm"><rp-icon name="help" [size]="16" /></span>
                  <span class="t-h4"
                    ><span class="t-mono">{{ t.ticketNo }}</span> · {{ heading(t) }}</span
                  >
                </div>
                <div class="card-b">
                  <div class="stack g16">
                    <div class="row wrap g8">
                      <span [class]="'chip dot tone-' + st(t).tone">{{ t.statusLabel }}</span>
                      @if (t.awaitingApproval) {
                        <span class="chip dot tone-violet">Awaiting approval</span>
                      }
                      <span [class]="'chip tone-' + tone(t.priority)"
                        >Priority {{ t.priority }}</span
                      >
                      <span class="tag"
                        ><rp-icon [name]="channelIcon(t)" [size]="12" />{{ channel(t) }}</span
                      >
                      <span class="t-xs t-muted">raised {{ when(t.createdAt) }}</span>
                    </div>
                    <div class="card flat pad">
                      <div class="t-xs t-muted">{{ kind(t) }}</div>
                      <div class="t-md mt4" style="line-height: 1.55">“{{ t.issue }}”</div>
                    </div>
                    <dl class="kv" id="ob-sp-kv">
                      @if (t.transaction; as x) {
                        <dt>Transaction</dt>
                        <dd>
                          <span class="t-mono">{{ x.reference }}</span>
                        </dd>
                        <dt>Amount</dt>
                        <dd>{{ x.amount ? inr(x.amount) : '—' }}</dd>
                        <dt>Transaction type</dt>
                        <dd>{{ type(x.type) }}</dd>
                        <dt>Transaction time</dt>
                        <dd>{{ when(x.at) }}</dd>
                      }
                      <dt>Institution</dt>
                      <dd>{{ t.institution.name }}</dd>
                      @if (t.resolution) {
                        <dt>Resolution</dt>
                        <dd>{{ t.resolution }}</dd>
                      }
                    </dl>
                    <div class="note tone-info">
                      <rp-icon name="info" [size]="17" />
                      <div class="grow">
                        Support logs calls and reads transactions. Changing the ticket's status,
                        priority or resolution is done by the institution's grievance officer;
                        Priority 1 resolutions go to a checker.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="card" id="ob-sp-calls">
                <div class="card-h">
                  <span class="li-ic sm"><rp-icon name="phone" [size]="16" /></span>
                  <span class="t-h4">Call log · {{ callsOf(t).length }}</span>
                  @if (canCall()) {
                    <button
                      type="button"
                      class="btn btn-pri btn-sm"
                      id="ob-sp-call"
                      (click)="calling.set(true)"
                    >
                      <rp-icon name="plus" [size]="15" /><span>Log a call</span>
                    </button>
                  } @else {
                    <span class="cp-why" [attr.title]="noCalls"
                      ><button type="button" class="btn btn-pri btn-sm" disabled>
                        <rp-icon name="plus" [size]="15" /><span>Log a call</span>
                      </button></span
                    >
                  }
                </div>
                @if (callsOf(t).length) {
                  <div class="list">
                    @for (c of callsOf(t); track c.id) {
                      <div class="li">
                        <span class="li-ic sm"
                          ><rp-icon
                            [name]="c.direction === 'INBOUND' ? 'arrowdl' : 'arrowur'"
                            [size]="16"
                        /></span>
                        <span class="li-main">
                          <span class="li-t wrap"
                            >{{ c.direction === 'INBOUND' ? 'Inbound' : 'Outbound' }} ·
                            {{ c.caller }} · {{ c.minutes }} min</span
                          >
                          <span class="li-s wrap"
                            >{{ c.summary }}<br />{{ when(c.at) }} · {{ c.loggedBy ?? 'You' }}</span
                          >
                        </span>
                      </div>
                    }
                  </div>
                } @else {
                  <div class="card-b">
                    <rp-empty
                      icon="phone"
                      title="No calls logged here yet"
                      text="Log every call so the next person picking up the ticket has the full story. Calls are kept with the ticket and shown on the institution's grievance desk."
                    />
                  </div>
                }
              </div>
            </div>

            <div class="card" id="ob-sp-member">
              <div class="card-h">
                <span class="li-ic sm"><rp-icon name="user" [size]="16" /></span>
                <span class="t-h4">Member</span>
              </div>
              <div class="card-b">
                <div class="row g12">
                  <rp-av [name]="t.member.name" size="lg" />
                  <div class="grow">
                    <b class="t-h4">{{ t.member.name }}</b>
                    <div class="t-xs t-muted">{{ t.institution.name }}</div>
                  </div>
                </div>
                @if (t.member.mobile) {
                  <div class="mt12">
                    <dl class="kv">
                      <dt>Mobile</dt>
                      <dd>
                        <span class="t-mono">{{ t.member.mobile }}</span>
                      </dd>
                    </dl>
                  </div>
                }
                <div class="row between mt16">
                  <span class="eyebrow">Last five transactions</span>
                  @if (txns(); as x) {
                    <span class="t-xs t-muted"
                      >Total: <b class="t-num">{{ num(x.total) }}</b> transaction{{
                        x.total === 1 ? '' : 's'
                      }}</span
                    >
                  }
                </div>
                @if (txnError()) {
                  <div class="note tone-bad mt8" role="alert">
                    <rp-icon name="alertc" [size]="17" />
                    <div class="grow">{{ txnError() }}</div>
                    <button type="button" class="btn btn-sec btn-xs" (click)="loadTxns(t)">
                      <span>Try again</span>
                    </button>
                  </div>
                } @else if (txns(); as x) {
                  @if (x.items.length) {
                    <div class="list plain" id="ob-sp-txns">
                      @for (m of x.items; track $index) {
                        <div class="li">
                          <span class="li-ic sm"
                            ><rp-icon
                              [name]="m.direction === 'CREDIT' ? 'arrowdl' : 'arrowur'"
                              [size]="16"
                          /></span>
                          <span class="li-main">
                            <span class="li-t">{{ m.remarks || type(m.type) }}</span>
                            <span class="li-s"
                              ><span class="t-mono">{{ m.reference }}</span> ·
                              {{ when(m.at) }}</span
                            >
                          </span>
                          <span class="li-r"
                            ><b class="t-num" [class.t-ok]="m.direction === 'CREDIT'">{{
                              signed(m)
                            }}</b
                            ><span class="chip tone-ok dot">Success</span></span
                          >
                        </div>
                      }
                    </div>
                  } @else {
                    <p class="t-sm t-muted mt8">No wallet transactions yet.</p>
                  }
                } @else {
                  <p class="t-sm t-muted mt8">Loading…</p>
                }
              </div>
            </div>
          </div>
        } @else if (results(); as list) {
          @if (list.length) {
            <div class="sec-h">
              <h3>Tickets for “{{ searchedFor() }}” · {{ list.length }}</h3>
            </div>
            <div class="tbl-wrap">
              <table class="tbl" id="ob-sp-table">
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Issue</th>
                    <th>Member</th>
                    <th>Transaction</th>
                    <th>Priority</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of list; track t.id) {
                    <tr
                      tabindex="0"
                      [attr.aria-label]="'Ticket ' + t.ticketNo"
                      (click)="open(t)"
                      (keydown.enter)="open(t)"
                    >
                      <td>
                        <div class="stack g4" style="gap: 1px">
                          <span class="cell-t"
                            ><span class="t-mono">{{ t.ticketNo }}</span></span
                          >
                          <span class="cell-s">{{ when(t.createdAt) }}</span>
                        </div>
                      </td>
                      <td>
                        <span class="t-sm">{{ heading(t) }}</span>
                      </td>
                      <td>
                        <div class="stack g4" style="gap: 1px">
                          <span class="cell-t">{{ t.member.name }}</span>
                          <span class="cell-s">{{ t.institution.name }}</span>
                        </div>
                      </td>
                      <td>
                        @if (t.transaction; as x) {
                          <div class="stack g4" style="gap: 1px">
                            <span class="cell-t"
                              ><span class="t-mono">{{ x.reference }}</span></span
                            >
                            <span class="cell-s"
                              >{{ x.amount ? inr(x.amount) : '—' }} · {{ type(x.type) }}</span
                            >
                          </div>
                        } @else {
                          <span class="t-faint">—</span>
                        }
                      </td>
                      <td>
                        <span [class]="'chip tone-' + tone(t.priority)"
                          >Priority {{ t.priority }}</span
                        >
                      </td>
                      <td>
                        <span [class]="'chip dot tone-' + st(t).tone">{{ t.statusLabel }}</span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="pager">
              <span>{{ list.length }} ticket{{ list.length === 1 ? '' : 's' }}</span>
            </div>
          } @else {
            <div class="card pad" id="ob-sp-none">
              <rp-empty
                icon="search"
                [title]="'Nothing found for “' + searchedFor() + '”'"
                text="Check the number with the caller — tickets start with TKT, feedback with FBK and fraud reports with FRD; a mobile number has ten digits."
              />
            </div>
          }
        } @else {
          <div class="card pad" id="ob-sp-start">
            <rp-empty
              icon="search"
              title="Find a ticket"
              text="Enter a ticket number (TKT-, FBK- or FRD-) or the member's ten-digit mobile, and say why you are looking. Every look-up is recorded with your reason."
            />
          </div>
        }
      }
    </div>

    @if (calling() && selected(); as t) {
      <rp-support-call-form
        [ticket]="t"
        (closed)="calling.set(false)"
        (logged)="logged(t, $event)"
      />
    }
  `,
  styles: `
    .sup-why {
      flex: 1 1 260px;
      max-width: 360px;
    }
    .sup-why .fld-in {
      min-height: 40px;
    }
    .sup-errs {
      margin-top: -6px;
    }
  `,
})
export class BackofficeSupport {
  private readonly api = inject(SupportApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).ops;

  protected readonly inr = inrText;
  protected readonly noCalls = "Your role doesn't include logging calls.";
  protected readonly q = signal('');
  protected readonly reason = signal('');
  protected readonly qError = signal('');
  protected readonly whyError = signal('');
  protected readonly shake = signal(false);
  protected readonly searching = signal(false);
  protected readonly error = signal('');
  protected readonly results = signal<readonly SupportTicket[] | null>(null);
  protected readonly searchedFor = signal('');
  protected readonly selected = signal<SupportTicket | null>(null);
  protected readonly txns = signal<SupportTransactions | null>(null);
  protected readonly txnError = signal('');
  protected readonly calling = signal(false);
  /** Calls logged here, per ticket (the support API has no call list). */
  private readonly logs = signal<Readonly<Record<string, readonly CallLog[]>>>({});
  /** The reason the current results were looked up with (the member look-up uses it too). */
  private lookupReason = '';
  private seq = 0;

  protected readonly canLookup = computed(() => this.can('support.lookup'));
  protected readonly canCall = computed(() => this.can('support.calls'));

  protected setQ(e: Event) {
    this.q.set((e.target as HTMLInputElement).value);
    this.qError.set('');
  }
  protected setReason(e: Event) {
    this.reason.set((e.target as HTMLInputElement).value);
    this.whyError.set('');
  }

  /** GRV-011: a ticket number, or a ten-digit mobile; with the reason (recorded). */
  protected async search() {
    if (this.searching()) return;
    const q = this.q().trim();
    const reason = this.reason().trim();
    const digits = q.replace(/[\s+-]/g, '').replace(/^91(?=\d{10}$)/, '');
    const mobile = /^\d{10}$/.test(digits) ? digits : '';
    this.qError.set(!mobile && !TICKET_NO.test(q) ? translate('GRV.LOOKUP_CRITERIA') : '');
    this.whyError.set(
      reason.length < 3 || reason.length > 200 ? translate('GRV.LOOKUP_REASON') : '',
    );
    if (this.qError() || this.whyError()) {
      this.shake.set(false);
      setTimeout(() => this.shake.set(true));
      return;
    }
    const n = ++this.seq;
    this.searching.set(true);
    this.error.set('');
    this.selected.set(null);
    this.results.set(null);
    try {
      const out = await this.api.tickets({
        ...(mobile ? { mobile } : { ticketNo: q.toUpperCase() }),
        reason,
      });
      if (n !== this.seq) return;
      this.lookupReason = reason;
      this.searchedFor.set(q);
      this.results.set(out.items);
      if (out.items.length === 1) this.open(out.items[0]!);
    } catch (e) {
      if (n !== this.seq) return;
      if (e instanceof ApiProblem && e.errors.length) {
        for (const x of e.errors) {
          if (x.field === 'reason') this.whyError.set(x.message);
          else this.qError.set(x.message);
        }
      } else {
        this.error.set(this.problem(e));
      }
    } finally {
      if (n === this.seq) this.searching.set(false);
    }
  }

  /** Opens a ticket: the member's last transactions are looked up with the same reason (GRV-012). */
  protected open(t: SupportTicket) {
    this.selected.set(t);
    void this.loadTxns(t);
  }

  protected async loadTxns(t: SupportTicket) {
    this.txns.set(null);
    this.txnError.set('');
    try {
      const x = await this.api.transactions(t.institution.id, t.member.id, this.lookupReason);
      if (this.selected()?.id === t.id) this.txns.set(x);
    } catch (e) {
      if (this.selected()?.id === t.id) this.txnError.set(this.problem(e));
    }
  }

  protected logged(t: SupportTicket, c: CallLog) {
    this.calling.set(false);
    this.logs.update((m) => ({ ...m, [t.id]: [c, ...(m[t.id] ?? [])] }));
    this.overlays.toast(`Call logged against ${t.ticketNo}`, {
      sub: "Visible to the institution's grievance desk",
    });
  }

  // --- formatting ----------------------------------------------------------------------------------
  protected callsOf(t: SupportTicket) {
    return this.logs()[t.id] ?? [];
  }
  protected can(sub: string) {
    return this.session()?.subTasks.includes(sub) ?? false;
  }
  protected heading(t: SupportTicket) {
    return t.categoryLabel ?? KIND_LABEL[t.kind];
  }
  protected kind(t: SupportTicket) {
    return t.kind === 'TRANSACTION' ? 'Issue' : KIND_LABEL[t.kind];
  }
  protected st(t: SupportTicket) {
    return statusOf(t.status);
  }
  protected tone(p: number) {
    return priorityTone(p);
  }
  protected channel(t: SupportTicket) {
    return CHANNEL_LABEL[t.channel] ?? t.channel;
  }
  protected channelIcon(t: SupportTicket): IconName {
    return t.channel === 'APP' ? 'mobile' : t.channel === 'WEB' ? 'globe' : 'phone';
  }
  protected type(x: string | null) {
    return txnType(x);
  }
  protected when(v: string | null) {
    return dt(v);
  }
  protected signed(m: MemberTxn) {
    return `${m.direction === 'CREDIT' ? '+' : '−'}${inrText(m.amount).replace('₹', '')}`;
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
  private problem(e: unknown) {
    return e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE');
  }
}
