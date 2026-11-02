import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnInit,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, formatInr, istBusinessDate } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { amountText, cleanTyped } from '../../../Utils/typing';
import { money, paiseOf, paiseToInput, rupeesToPaise } from '../Fees/fee-format';
import {
  FeeRecordsApi,
  type FeeRecord,
  type FeeRecordDetail,
  type RecordChange,
} from './fee-records.api';
import { fieldMessage } from './record-format';

type Field = 'amt' | 'due' | 'rem';
const MIN_REASON = 5;

/**
 * Ask to change an unpaid record (prototype cm.fr.update; FEE-013): the amount and the due date,
 * with the reason. A checker approves it before it takes effect (maker ≠ checker); an
 * administrator's own request applies directly (ADR-0015). One change waits per record.
 */
@Component({
  selector: 'rp-fee-record-change',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="'Update ' + record().instalment.label"
      [sub]="record().student.name + ' · the change goes to a checker before it takes effect.'"
      icon="edit"
      cls="cm-m"
      [narrow]="false"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="c-form">
        <div class="fld" [class.invalid]="err('amt')">
          <label class="fld-l" for="fu-amt">Amount<span class="req">*</span></label>
          <div class="fld-in">
            <span class="pre">₹</span>
            <input
              id="fu-amt"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              aria-describedby="fu-amt-e"
              [value]="amt()"
              (input)="amt.set(amountOf($event)); clear('amt')"
            />
          </div>
          <div class="fld-e" id="fu-amt-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('amt') }}</span>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('due')">
          <label class="fld-l" for="fu-due">Due date<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="fu-due"
              type="date"
              aria-describedby="fu-due-e"
              [attr.min]="today"
              [value]="due()"
              (input)="due.set(val($event)); clear('due')"
              (change)="due.set(val($event)); clear('due')"
            />
          </div>
          <div class="fld-e" id="fu-due-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('due') }}</span>
          </div>
          <div class="fld-h">Not earlier than today.</div>
        </div>
        <div class="full">
          <div class="fld" [class.invalid]="err('rem')">
            <label class="fld-l" for="fu-rem">Remarks<span class="req">*</span></label>
            <div class="fld-in">
              <textarea
                id="fu-rem"
                rows="3"
                maxlength="200"
                placeholder="Why is this changing? e.g. Sibling concession approved by the principal"
                aria-describedby="fu-rem-e"
                [value]="rem()"
                (input)="rem.set(val($event)); clear('rem')"
              ></textarea>
            </div>
            <div class="fld-e" id="fu-rem-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('rem') }}</span>
            </div>
          </div>
        </div>
      </div>
      @if (error()) {
        <div class="note tone-bad" role="alert" style="margin-top: 14px">
          <rp-icon name="alertc" [size]="17" />
          <div class="grow">{{ error() }}</div>
        </div>
      }
      <div modal-foot class="row g8">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="fu-send"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="send()"
        >
          <rp-icon name="send" [size]="17" /><span>Send for approval</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class FeeRecordChangeForm implements OnInit {
  private readonly api = inject(FeeRecordsApi);
  private readonly overlays = inject(Overlays);

  readonly record = input.required<FeeRecord>();
  readonly closed = output<void>();
  readonly sent = output<{ record: FeeRecordDetail; applied: boolean }>();

  protected readonly today = istBusinessDate(new Date());
  protected readonly amt = signal('');
  protected readonly due = signal('');
  protected readonly rem = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private readonly key = newIdempotencyKey();

  ngOnInit() {
    this.amt.set(paiseToInput(paiseOf(this.record().amount)));
    this.due.set(this.record().dueDate);
  }

  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected clear(f: Field) {
    if (this.errors()[f]) this.errors.update((e) => ({ ...e, [f]: '' }));
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  /** An amount: numbers only, in the box too (client 2026-10-14). */
  protected amountOf(e: Event) {
    return cleanTyped(e.target as HTMLInputElement, amountText);
  }

  protected async send() {
    this.error.set('');
    const r = this.record();
    const e: Partial<Record<Field, string>> = {};
    const amount = rupeesToPaise(this.amt());
    if (!this.amt().trim()) e.amt = 'Enter the amount';
    else if (!amount) e.amt = translate('VALIDATION.AMOUNT');
    if (!this.due()) e.due = 'Choose the due date';
    else if (this.due() < this.today && this.due() !== r.dueDate) {
      e.due = "The due date can't be earlier than today";
    }
    const reason = this.rem().trim();
    if (!reason) e.rem = 'Say why the record is changing';
    else if (reason.length < MIN_REASON) e.rem = `Write at least ${MIN_REASON} characters`;
    const was = paiseOf(r.amount);
    if (!e.amt && !e.due && amount === was && this.due() === r.dueDate) {
      e.amt = 'Nothing has changed — change the amount or the due date.';
    }
    if (!e.amt && amount !== null && paiseOf(r.lateFine) > amount) {
      e.amt = `The late fine (${formatInr(paiseOf(r.lateFine))}) can't be more than the fee amount.`;
    }
    this.errors.set(e);
    if (Object.values(e).some(Boolean) || amount === null) return;
    const body: RecordChange = {
      ...(amount !== was ? { amount: money(amount) } : {}),
      ...(this.due() !== r.dueDate ? { dueDate: this.due() } : {}),
      reason,
    };
    const parts = [
      amount !== was ? `${formatInr(was)} → ${formatInr(amount)}` : '',
      this.due() !== r.dueDate ? `due ${formatDate(r.dueDate)} → ${formatDate(this.due())}` : '',
    ].filter(Boolean);
    const ok = await this.overlays.confirm({
      title: 'Send this update for approval?',
      text: `${parts.join('; ')}. Nothing changes until a checker approves it.`,
      ok: 'Send for approval',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const res = await this.api.requestChange(r.id, body, this.key);
      this.overlays.toast(res.appliedDirectly ? 'Record updated' : 'Update sent for approval', {
        sub: res.appliedDirectly
          ? `${res.no} · applied directly — your own request as the administrator`
          : `${res.no} · a checker will review it`,
      });
      this.sent.emit({ record: res.record, applied: res.appliedDirectly });
    } catch (x) {
      if (x instanceof ApiProblem && x.errors.length) {
        const map: Record<string, Field> = { amount: 'amt', dueDate: 'due', reason: 'rem' };
        const f: Partial<Record<Field, string>> = {};
        for (const y of x.errors) if (map[y.field]) f[map[y.field]!] = fieldMessage(y);
        this.errors.set(f);
        if (!Object.keys(f).length) this.error.set(x.detail);
      } else {
        this.error.set(x instanceof ApiProblem ? x.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
