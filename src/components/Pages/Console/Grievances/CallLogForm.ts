import {
  ChangeDetectionStrategy,
  Component,
  type OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { GrievancesApi, type CallDirection, type CallLog } from './grievances.api';

type Field = 'caller' | 'minutes' | 'summary';

/** A ticket the call can be kept against (not Closed). */
export interface CallTicket {
  readonly id: string;
  readonly ticketNo: string;
  readonly name: string;
}

/**
 * Log a call (prototype cm.call.new; GRV-010; FR-GRV-04): the ticket (or a general enquiry), the
 * direction, the caller, the minutes and the notes — never a PIN, password or code. The server's
 * register texts are the field messages.
 */
@Component({
  selector: 'rp-call-log-form',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rp-modal
      title="Log a call"
      sub="Calls are kept against the ticket."
      icon="phone"
      cls="cm-m"
      [narrow]="false"
      (closed)="closed.emit()"
    >
      <div class="c-form">
        <div class="fld">
          <label class="fld-l" for="cl-t">Ticket</label>
          <div class="fld-in">
            <select id="cl-t" [value]="ticket()" (change)="ticket.set(val($event))">
              <option value="">No ticket (general enquiry)</option>
              @for (t of tickets(); track t.id) {
                <option [value]="t.id" [selected]="t.id === ticket()">
                  {{ t.ticketNo }} · {{ t.name }}
                </option>
              }
            </select>
          </div>
        </div>
        <div class="fld">
          <label class="fld-l" for="cl-dir">Direction</label>
          <div class="fld-in">
            <select id="cl-dir" (change)="setDirection($event)">
              <option value="INBOUND" [selected]="direction() === 'INBOUND'">Incoming</option>
              <option value="OUTBOUND" [selected]="direction() === 'OUTBOUND'">Outgoing</option>
            </select>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('caller')" [class.shake]="shake() && err('caller')">
          <label class="fld-l" for="cl-caller">Caller<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="cl-caller"
              name="cl-caller"
              type="text"
              placeholder="e.g. Parent — Meera Hegde"
              autocomplete="off"
              maxlength="100"
              aria-describedby="cl-caller-e"
              [value]="caller()"
              (input)="set('caller', $event)"
            />
          </div>
          <div class="fld-e" id="cl-caller-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('caller') }}</span>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('minutes')" [class.shake]="shake() && err('minutes')">
          <label class="fld-l" for="cl-min">Duration (minutes)<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="cl-min"
              name="cl-min"
              type="text"
              maxlength="3"
              inputmode="numeric"
              autocomplete="off"
              aria-describedby="cl-min-e"
              [value]="minutes()"
              (input)="set('minutes', $event)"
            />
          </div>
          <div class="fld-e" id="cl-min-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('minutes') }}</span>
          </div>
        </div>
        <div class="full">
          <div
            class="fld"
            [class.invalid]="err('summary')"
            [class.shake]="shake() && err('summary')"
          >
            <label class="fld-l" for="cl-notes">Notes<span class="req">*</span></label>
            <div class="fld-in">
              <textarea
                id="cl-notes"
                name="cl-notes"
                rows="3"
                maxlength="400"
                autocomplete="off"
                placeholder="What was discussed. Never record a PIN, password or OTP."
                aria-describedby="cl-notes-e"
                [value]="summary()"
                (input)="set('summary', $event)"
              ></textarea>
            </div>
            <div class="fld-e" id="cl-notes-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('summary') }}</span>
            </div>
          </div>
        </div>
      </div>
      @if (error()) {
        <div class="note tone-bad mt12" role="alert">
          <rp-icon name="alertc" [size]="17" />
          <div class="grow">{{ error() }}</div>
        </div>
      }
      <ng-container modal-foot>
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="cl-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <span>Log call</span>
        </button>
      </ng-container>
    </rp-modal>
  `,
})
export class CallLogForm implements OnInit {
  private readonly api = inject(GrievancesApi);
  private readonly overlays = inject(Overlays);

  /** The tickets that are not Closed (the queue's), for the ticket choice. */
  readonly tickets = input<readonly CallTicket[]>([]);
  /** The ticket the call is about (from the ticket drawer), or none. */
  readonly ticketId = input<string>('');
  readonly closed = output<void>();
  readonly logged = output<CallLog>();

  protected readonly ticket = signal('');
  protected readonly direction = signal<CallDirection>('INBOUND');
  protected readonly caller = signal('');
  protected readonly minutes = signal('3');
  protected readonly summary = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly shake = signal(false);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  /** One key per form: a retry after a lost answer is not logged twice. */
  private key = newIdempotencyKey();

  ngOnInit() {
    this.ticket.set(this.ticketId());
  }

  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  protected setDirection(e: Event) {
    this.direction.set(this.val(e) === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND');
  }
  protected set(f: Field, e: Event) {
    const v = this.val(e);
    ({ caller: this.caller, minutes: this.minutes, summary: this.summary })[f].set(v);
    if (this.errors()[f]) this.errors.update((x) => ({ ...x, [f]: '' }));
  }

  protected async save() {
    if (this.busy()) return;
    this.error.set('');
    const caller = this.caller().trim();
    const minutes = this.minutes().trim();
    const summary = this.summary().trim();
    const e: Partial<Record<Field, string>> = {};
    if (caller.length < 2 || caller.length > 100) e.caller = translate('GRV.CALL_CALLER');
    const n = Number(minutes);
    if (!/^\d{1,3}$/.test(minutes) || n < 1 || n > 180) e.minutes = translate('GRV.CALL_MINUTES');
    if (summary.length < 5 || summary.length > 400) e.summary = translate('GRV.CALL_NOTES');
    this.errors.set(e);
    if (Object.values(e).some(Boolean)) {
      this.shake.set(false);
      setTimeout(() => this.shake.set(true));
      return;
    }
    this.busy.set(true);
    try {
      const out = await this.api.logCall(
        {
          ticketId: this.ticket() || null,
          direction: this.direction(),
          caller,
          minutes: n,
          summary,
        },
        this.key,
      );
      this.overlays.toast('Call logged', {
        sub: out.ticket?.ticketNo ? `Kept against ${out.ticket.ticketNo}` : 'General enquiry',
      });
      this.logged.emit(out);
    } catch (x) {
      // A refused request (4xx) is kept with its key: the next try is a new request.
      if (x instanceof ApiProblem && x.status >= 400 && x.status < 500) {
        this.key = newIdempotencyKey();
      }
      if (x instanceof ApiProblem && x.errors.length) {
        const f: Partial<Record<Field, string>> = {};
        for (const y of x.errors) {
          if (y.field === 'caller' || y.field === 'minutes' || y.field === 'summary') {
            f[y.field] = y.message;
          }
        }
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
