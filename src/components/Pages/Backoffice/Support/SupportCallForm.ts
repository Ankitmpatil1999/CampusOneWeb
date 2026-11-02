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
import { Modal } from '../../../Shared/Overlays';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import type { CallDirection, CallLog } from '../../Console/Grievances/grievances.api';
import { SupportApi, type SupportTicket } from './support.api';

type Field = 'caller' | 'minutes' | 'summary';

/**
 * Log a support call against a ticket (prototype ob.sup.call; GRV-013; FR-GRV-04): inbound or
 * outbound, who was on the call, the minutes and what was discussed. The call is kept with the
 * institution's ticket and shown on its grievance desk. The register texts are the field messages.
 */
@Component({
  selector: 'rp-support-call-form',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <rp-modal
      [title]="'Log a call · ' + ticket().ticketNo"
      [sub]="ticket().categoryLabel ?? ticket().issue"
      icon="phone"
      [narrow]="false"
      (closed)="closed.emit()"
    >
      <div class="stack g12">
        <div class="seg" role="radiogroup" aria-label="Direction" id="ob-cl-dir">
          <span
            class="seg-ind"
            style="width: calc((100% - 8px) / 2)"
            [style.left]="
              'calc(3px + ' + (direction() === 'OUTBOUND' ? 1 : 0) + ' * ((100% - 8px) / 2 + 2px))'
            "
          ></span>
          <button
            type="button"
            role="radio"
            [class.on]="direction() === 'INBOUND'"
            [attr.aria-checked]="direction() === 'INBOUND'"
            (click)="direction.set('INBOUND')"
          >
            <rp-icon name="arrowdl" [size]="14" />Inbound
          </button>
          <button
            type="button"
            role="radio"
            [class.on]="direction() === 'OUTBOUND'"
            [attr.aria-checked]="direction() === 'OUTBOUND'"
            (click)="direction.set('OUTBOUND')"
          >
            <rp-icon name="arrowur" [size]="14" />Outbound
          </button>
        </div>
        <div class="c-form">
          <div class="fld" [class.invalid]="err('caller')" [class.shake]="shook('caller')">
            <label class="fld-l" for="ob-cl-who">Caller<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="ob-cl-who"
                name="ob-cl-who"
                type="text"
                autocomplete="off"
                maxlength="100"
                aria-describedby="ob-cl-who-e"
                [value]="caller()"
                (input)="set('caller', $event)"
              />
            </div>
            <div class="fld-e" id="ob-cl-who-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('caller') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('minutes')" [class.shake]="shook('minutes')">
            <label class="fld-l" for="ob-cl-dur"
              >Duration (minutes)<span class="req">*</span></label
            >
            <div class="fld-in">
              <input
                id="ob-cl-dur"
                name="ob-cl-dur"
                type="text"
                maxlength="3"
                inputmode="numeric"
                autocomplete="off"
                aria-describedby="ob-cl-dur-e"
                [value]="minutes()"
                (input)="set('minutes', $event)"
              />
            </div>
            <div class="fld-e" id="ob-cl-dur-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('minutes') }}</span>
            </div>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('summary')" [class.shake]="shook('summary')">
          <label class="fld-l" for="ob-cl-sum"
            >What was discussed<span class="req">*</span
            ><span class="count">{{ summary().length }}/400</span></label
          >
          <div class="fld-in">
            <textarea
              id="ob-cl-sum"
              name="ob-cl-sum"
              rows="3"
              maxlength="400"
              autocomplete="off"
              placeholder="e.g. Confirmed from the ledger that no debit was posted; asked the member to check the statement tomorrow."
              aria-describedby="ob-cl-sum-e"
              [value]="summary()"
              (input)="set('summary', $event)"
            ></textarea>
          </div>
          <div class="fld-e" id="ob-cl-sum-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('summary') }}</span>
          </div>
          <div class="fld-h">Never record a PIN, password or one-time code.</div>
        </div>
        @if (error()) {
          <div class="note tone-bad" role="alert">
            <rp-icon name="alertc" [size]="17" />
            <div class="grow">{{ error() }}</div>
          </div>
        }
      </div>
      <ng-container modal-foot>
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="ob-cl-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>Save call</span>
        </button>
      </ng-container>
    </rp-modal>
  `,
})
export class SupportCallForm implements OnInit {
  private readonly api = inject(SupportApi);

  readonly ticket = input.required<SupportTicket>();
  readonly closed = output<void>();
  readonly logged = output<CallLog>();

  protected readonly direction = signal<CallDirection>('INBOUND');
  protected readonly caller = signal('');
  protected readonly minutes = signal('3');
  protected readonly summary = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  private readonly shaking = signal(false);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private key = newIdempotencyKey();

  ngOnInit() {
    this.caller.set(this.ticket().member.name);
  }

  protected err(f: Field) {
    return this.errors()[f] ?? '';
  }
  protected shook(f: Field) {
    return this.shaking() && !!this.errors()[f];
  }
  protected set(f: Field, e: Event) {
    ({ caller: this.caller, minutes: this.minutes, summary: this.summary })[f].set(
      (e.target as HTMLInputElement).value,
    );
    if (this.errors()[f]) this.errors.update((x) => ({ ...x, [f]: '' }));
  }

  protected async save() {
    if (this.busy()) return;
    this.error.set('');
    const caller = this.caller().trim();
    const minutes = this.minutes().trim();
    const summary = this.summary().trim();
    const n = Number(minutes);
    const e: Partial<Record<Field, string>> = {};
    if (caller.length < 2 || caller.length > 100) e.caller = translate('GRV.CALL_CALLER');
    if (!/^\d{1,3}$/.test(minutes) || n < 1 || n > 180) e.minutes = translate('GRV.CALL_MINUTES');
    if (summary.length < 5 || summary.length > 400) e.summary = translate('GRV.CALL_NOTES');
    this.errors.set(e);
    if (Object.values(e).some(Boolean)) {
      this.shaking.set(false);
      setTimeout(() => this.shaking.set(true));
      return;
    }
    const t = this.ticket();
    this.busy.set(true);
    try {
      const out = await this.api.logCall(
        {
          institutionId: t.institution.id,
          ticketId: t.id,
          direction: this.direction(),
          caller,
          minutes: n,
          summary,
        },
        this.key,
      );
      this.logged.emit(out);
    } catch (x) {
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
