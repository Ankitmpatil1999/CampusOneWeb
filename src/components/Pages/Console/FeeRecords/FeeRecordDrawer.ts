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
import { Amount } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatDateTime, formatInr } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { MembersApi } from '../Members/members.api';
import { paiseOf } from '../Fees/fee-format';
import { FeeRecordChangeForm } from './FeeRecordChange';
import {
  FeeRecordsApi,
  type Collection,
  type FeeRecord,
  type FeeRecordDetail,
} from './fee-records.api';
import {
  RECORD_STATUS,
  collectionSource,
  collectionStatus,
  isOpen,
  processing,
  shortRef,
  waitingWhy,
} from './record-format';

/** The outcome of the last collection tried from this drawer. */
interface Last {
  readonly tone: 'ok' | 'warn' | 'bad';
  readonly title: string;
  readonly text: string;
}

interface Line {
  readonly at: string | null;
  readonly reference: string;
  readonly sub: string;
  readonly amount: { amount: string };
  readonly status: { l: string; tone: string };
}

/**
 * The fee record drawer (prototype frDrawer / frFoot, cm.fr.open; FEE-011, FEE-013, FEE-016): the
 * student and the status, the last collection's outcome, the amount, what is due now (with the
 * late fine once it applies) and the wallet balance, the record's details, its fee heads, and the
 * collections and attempts. The footer asks for a change (FeeRecordChangeForm) and collects now —
 * a short balance leaves the collection pending for the auto-debit job (202).
 */
@Component({
  selector: 'rp-fee-record-drawer',
  imports: [Amount, Avatar, Empty, FeeRecordChangeForm, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="r().instalment.label + ' · ' + r().student.name"
      [sub]="'Fee record ' + short(r().id)"
      icon="receipt"
      [drawer]="true"
      cls="cm-m"
      (closed)="closed.emit()"
    >
      @let x = r();
      <div class="cm-dr">
        <div class="stack g16">
          @if (readOnly()) {
            <div class="note tone-info">
              <rp-icon name="lock" [size]="17" />
              <div class="grow">{{ readOnly() }}</div>
            </div>
          }
          <div class="cm-hero">
            <rp-av [name]="x.student.name" size="lg" />
            <div class="grow">
              <div class="t-h3">{{ x.student.name }}</div>
              <div class="t-sm t-muted">
                {{ x.student.admissionNo ?? 'No admission no.' }} ·
                {{ x.student.classSection ?? 'Not enrolled' }}
              </div>
            </div>
            <span [class]="'chip dot lg tone-' + status().tone">{{ status().l() }}</span>
          </div>
          @if (last(); as l) {
            <div [class]="'note tone-' + l.tone" id="fr-last" role="status">
              <rp-icon
                [name]="l.tone === 'ok' ? 'checkc' : l.tone === 'warn' ? 'alert' : 'alertc'"
                [size]="17"
              />
              <div class="grow">
                <b>{{ l.title }}</b> {{ l.text }}
              </div>
            </div>
          } @else if (x.pendingAttempt && open()) {
            <div class="note tone-warn" id="fr-waiting">
              <rp-icon name="hourglass" [size]="17" />
              <div class="grow">
                <b>Waiting for balance.</b> Tried {{ tries(x.pendingAttempt.tries)
                }}{{
                  x.pendingAttempt.lastTriedAt
                    ? ', last ' + when(x.pendingAttempt.lastTriedAt)
                    : ''
                }}: {{ why(x.pendingAttempt.lastFailureCode) }}. The auto-debit job collects it
                after a top-up.
              </div>
            </div>
          }
          @if (x.status === 'PAID' && !last()) {
            <div class="note tone-ok">
              <rp-icon name="checkc" [size]="17" />
              <div class="grow">
                Paid{{ x.paidAt ? ' ' + when(x.paidAt) : '' }}. A paid instalment can't be updated
                or collected again.
              </div>
            </div>
          }
          @if (error()) {
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ error() }}</div>
              <button type="button" class="btn btn-sec btn-sm note-a" (click)="reload()">
                <span>Try again</span>
              </button>
            </div>
          }

          <div class="c-grid k3">
            <div class="cm-tile">
              <span>Amount</span><b class="t-num">{{ inr(x.amount) }}</b>
            </div>
            @if (x.status === 'PAID') {
              <div class="cm-tile tone-ok">
                <span>Paid</span><b class="t-num">{{ inr(x.paid) }}</b>
              </div>
            } @else {
              <div class="cm-tile" [class.tone-bad]="late()">
                <span>{{ late() ? 'Due now (incl. fine)' : 'Due now' }}</span
                ><b class="t-num">{{ inr(x.outstanding) }}</b>
              </div>
            }
            <div class="cm-tile" [class.tone-ok]="enough()">
              <span>Wallet balance</span><b class="t-num" id="fr-balance">{{ balance() }}</b>
            </div>
          </div>

          <dl class="kv">
            <dt>Record</dt>
            <dd>
              <span class="t-mono" [attr.title]="x.id">{{ short(x.id) }}</span>
            </dd>
            <dt>Structure</dt>
            <dd>{{ structure() }}</dd>
            <dt>Academic year</dt>
            <dd>{{ x.year.label }}</dd>
            <dt>Instalment</dt>
            <dd>{{ x.instalment.label }}</dd>
            <dt>Due date</dt>
            <dd>{{ date(x.dueDate) }}</dd>
            <dt>Late fine</dt>
            <dd>{{ fineText() }}</dd>
            <dt>Processing</dt>
            <dd>
              <span [class]="'chip dot tone-' + proc().tone">{{ proc().l }}</span>
              <!-- FINANCING-OFF (client 2026-10-22): the fee financing partner is commented out in the whole application; uncomment to bring it back.
              @if (x.financed) {
                <span class="t-xs t-muted">
                  Collected by the financing partner, never from the wallet</span
                >
              }
              -->
            </dd>
            @if (x.remarks) {
              <dt>Remarks</dt>
              <dd>{{ x.remarks }}</dd>
            }
            @if (x.paidAt) {
              <dt>Paid</dt>
              <dd>
                {{ when(x.paidAt) }}
                @if (receipt()) {
                  · <span class="t-mono">{{ receipt() }}</span>
                }
              </dd>
            }
          </dl>

          @if (detail(); as d) {
            @if (d.heads.length) {
              <div class="sec-h"><h3>Fee heads</h3></div>
              <div class="tbl-wrap">
                <table class="tbl dense" id="fr-heads">
                  <thead>
                    <tr>
                      <th>Head</th>
                      <th class="r">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (h of d.heads; track $index) {
                      <tr>
                        <td>{{ h.name }}</td>
                        <td class="r"><rp-amt [value]="h.amount" /></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
            <div class="sec-h"><h3>Collections and attempts</h3></div>
            @if (lines().length) {
              <div class="tbl-wrap">
                <table class="tbl dense" id="fr-lines">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Reference</th>
                      <th class="r">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (l of lines(); track $index) {
                      <tr>
                        <td>{{ l.at ? when(l.at) : '—' }}</td>
                        <td>
                          <span class="t-mono">{{ l.reference }}</span>
                          @if (l.sub) {
                            <div class="cell-s">{{ l.sub }}</div>
                          }
                        </td>
                        <td class="r"><rp-amt [value]="l.amount" /></td>
                        <td>
                          <span [class]="'chip dot tone-' + l.status.tone">{{ l.status.l }}</span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="t-sm t-muted">No collection attempts yet.</p>
            }
          } @else if (!error()) {
            <rp-empty icon="hourglass" title="Loading…" />
          }
        </div>
      </div>

      <div modal-foot class="row g8">
        @if (changeWhy()) {
          <span class="cp-why" [attr.title]="changeWhy()"
            ><button type="button" class="btn btn-sec" disabled>
              <rp-icon name="edit" [size]="17" /><span>Update record</span>
            </button></span
          >
        } @else {
          <button type="button" class="btn btn-sec" id="fr-update" (click)="changing.set(true)">
            <rp-icon name="edit" [size]="17" /><span>Update record</span>
          </button>
        }
        @if (collectWhy()) {
          <span class="cp-why" [attr.title]="collectWhy()"
            ><button type="button" class="btn btn-pri" disabled>
              <rp-icon name="zap" [size]="17" /><span>Attempt collection now</span>
            </button></span
          >
        } @else {
          <button
            type="button"
            class="btn btn-pri"
            id="fr-collect"
            [class.is-busy]="busy()"
            [disabled]="busy()"
            (click)="collect()"
          >
            <rp-icon name="zap" [size]="17" /><span>Attempt collection now</span>
          </button>
        }
      </div>
    </rp-modal>

    @if (changing()) {
      <rp-fee-record-change
        [record]="r()"
        (closed)="changing.set(false)"
        (sent)="changeSent($event)"
      />
    }
  `,
})
export class FeeRecordDrawer {
  private readonly api = inject(FeeRecordsApi);
  private readonly membersApi = inject(MembersApi);
  private readonly overlays = inject(Overlays);

  /** The record as listed; its detail loads when the drawer opens. */
  readonly record = input.required<FeeRecord>();
  /** Why the record can't be changed here (read-only role, no fees.edit); '' when it can. */
  readonly readOnly = input('');
  /** Why this person can't collect (no fees.collect); '' when they can. */
  readonly collectBlocked = input('');
  /** The member's wallet can be read (members.view). */
  readonly canSeeWallet = input(false);
  readonly closed = output<void>();
  /** The record changed (collected, pending, or a change applied): the list reloads. */
  readonly changed = output<FeeRecordDetail>();

  protected readonly detail = signal<FeeRecordDetail | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly last = signal<Last | null>(null);
  protected readonly changing = signal(false);
  protected readonly wallet = signal<{ amount: string } | null | undefined>(undefined);
  private loaded = '';

  protected readonly r = computed<FeeRecord>(() => this.detail() ?? this.record());
  protected readonly status = computed(() => RECORD_STATUS[this.r().status]);
  protected readonly proc = computed(() => processing(this.r()));
  protected readonly open = computed(() => isOpen(this.r()));
  protected readonly late = computed(() => paiseOf(this.r().fine) > 0);
  protected readonly structure = computed(() => {
    const x = this.r();
    if (x.structure) {
      return x.structure.version
        ? `${x.structure.name} · version ${x.structure.version}`
        : x.structure.name;
    }
    return x.source === 'UPLOAD' ? 'Uploaded fee sheet' : 'Created individually';
  });
  protected readonly fineText = computed(() => {
    const x = this.r();
    const f = paiseOf(x.lateFine);
    if (!f) return "Doesn't apply";
    if (paiseOf(x.fine)) return `${formatInr(f)} · applies now`;
    return `${formatInr(f)} · if paid after the due date`;
  });
  protected readonly receipt = computed(() => this.detail()?.collections.at(-1)?.reference ?? null);
  protected readonly balance = computed(() => {
    const w = this.wallet();
    if (w === undefined) return this.canSeeWallet() ? '…' : '—';
    return w ? formatInr(paiseOf(w)) : 'No wallet';
  });
  protected readonly enough = computed(() => {
    const w = this.wallet();
    return !!w && this.open() && paiseOf(w) >= paiseOf(this.r().outstanding);
  });
  protected readonly lines = computed<Line[]>(() => {
    const d = this.detail();
    if (!d) return [];
    const out: Line[] = d.attempts.map((a) => ({
      at: a.at,
      reference: a.reference,
      sub: a.failureCode ? this.why(a.failureCode) : '',
      amount: a.amount,
      status: this.attemptStatus(a.status),
    }));
    for (const c of d.collections) {
      if (d.attempts.some((a) => a.reference === c.reference)) continue;
      out.push({
        at: c.collectedAt,
        reference: c.reference,
        sub: collectionSource(c.source),
        amount: c.amount,
        status: collectionStatus(c.status),
      });
    }
    return out;
  });
  protected readonly changeWhy = computed(
    () =>
      this.readOnly() ||
      (this.r().status === 'PAID'
        ? "Paid records can't be changed"
        : !this.open()
          ? translate('FEE.RECORD_PAID')
          : ''),
  );
  protected readonly collectWhy = computed(
    () =>
      this.collectBlocked() ||
      (this.r().status === 'PAID'
        ? 'Already paid'
        : !this.open()
          ? translate('FEE.RECORD_PAID')
          : this.r().financed
            ? translate('FEE.FINANCED')
            : ''),
  );

  constructor() {
    effect(() => {
      const id = this.record().id;
      untracked(() => {
        if (id === this.loaded) return;
        this.loaded = id;
        this.detail.set(null);
        this.last.set(null);
        this.wallet.set(undefined);
        void this.reload();
        void this.loadWallet();
      });
    });
  }

  protected async reload() {
    const id = this.record().id;
    this.error.set('');
    try {
      const d = await this.api.record(id);
      if (this.record().id === id) this.detail.set(d);
    } catch (e) {
      if (this.record().id === id) {
        this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
      }
    }
  }

  private async loadWallet() {
    if (!this.canSeeWallet()) return;
    const id = this.record().student.id;
    try {
      const m = await this.membersApi.detail(id);
      if (this.record().student.id === id) this.wallet.set(m.wallet?.balance ?? null);
    } catch {
      if (this.record().student.id === id) this.wallet.set(undefined);
    }
  }

  /** FEE-016 after a confirmation (prototype cm.fr.collect). */
  protected async collect() {
    const x = this.r();
    const due = formatInr(paiseOf(x.outstanding));
    const ok = await this.overlays.confirm({
      title: `Collect ${x.instalment.label} now?`,
      text: `We'll try to collect ${due}${this.late() ? ' (includes the late fine)' : ''} from ${x.student.name}'s campus wallet and pay it to the fee account.`,
      ok: `Collect ${due}`,
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const res: Collection = await this.api.collect(x.id, newIdempotencyKey());
      this.detail.set(res.record);
      if (res.collected) {
        const amt = formatInr(paiseOf(res.receipt.amount));
        this.last.set({
          tone: 'ok',
          title: `Collected ${amt}`,
          text: `from the campus wallet · receipt ${res.receipt.reference}`,
        });
        this.overlays.toast(`Collected ${amt}`, {
          sub: `${x.student.name} · ${res.receipt.reference}`,
        });
      } else {
        this.last.set({
          tone: 'warn',
          title: `Pending — ${waitingWhy(res.pendingAttempt.reasonCode).toLowerCase()}.`,
          text: 'The payment stays pending and the auto-debit job collects it after a top-up.',
        });
        this.overlays.toast('Pending — balance short', {
          tone: 'warn',
          sub: 'The auto-debit job will collect it after a top-up.',
        });
      }
      void this.loadWallet();
      this.changed.emit(res.record);
    } catch (e) {
      const why = e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE');
      this.last.set({ tone: 'bad', title: 'Not collected.', text: why });
      this.overlays.toast('Not collected', { tone: 'bad', sub: why });
      if (e instanceof ApiProblem && e.status === 409) void this.reload();
    } finally {
      this.busy.set(false);
    }
  }

  protected changeSent(e: { record: FeeRecordDetail }) {
    this.changing.set(false);
    this.detail.set(e.record);
    this.changed.emit(e.record);
  }

  protected attemptStatus(s: string) {
    const k = s.toLowerCase();
    const tone = k === 'success' ? 'ok' : k === 'failure' ? 'bad' : k === 'pending' ? 'warn' : '';
    return { l: translate(`status.payment_attempt.${k}`), tone: tone || 'neutral' };
  }
  protected why(code: string | null) {
    return waitingWhy(code);
  }
  protected tries(n: number) {
    return n === 1 ? 'once' : `${n} times`;
  }
  protected inr(m: { amount: string }) {
    return formatInr(paiseOf(m));
  }
  protected date(d: string) {
    return formatDate(d);
  }
  protected when(d: string) {
    return formatDateTime(d);
  }
  /** The short form of an id shown in mono (the full id is in the title). */
  protected short(id: string) {
    return shortRef(id);
  }
}
