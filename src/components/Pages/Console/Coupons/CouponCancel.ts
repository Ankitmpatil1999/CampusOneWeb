import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { formatDate, istBusinessDate } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { plural } from '../Allowances/allowance-format';
import type { ClassView, MemberRow } from '../Members/members.api';
import { addDays, isIsoDate, monthEnd } from './coupon-format';
import { CouponsApi, type CouponType } from './coupons.api';
import { StudentPicker } from './StudentPicker';

type Field = 'from' | 'to' | 'reason';

/**
 * Cancel coupons (OI-CPN-03; CPN-012): students, a date range of future days and optionally some
 * types, with a reason. Active coupons from tomorrow on are cancelled; used, expired and today's
 * coupons stay.
 */
@Component({
  selector: 'rp-coupon-cancel',
  imports: [Icon, Modal, StudentPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Cancel coupons"
      sub="Cancel students' future coupons in a date range, with a reason."
      icon="ticket"
      [wide]="true"
      cls="cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16">
        <div class="fs">
          <h4><rp-icon name="users" [size]="16" /> Students</h4>
          <div class="fs-b">
            <rp-student-picker
              key="cc"
              [classes]="classes()"
              [selected]="sel()"
              (selectedChange)="sel.set($event); error.set('')"
            />
          </div>
        </div>
        <div class="c-form">
          <div class="fld" [class.invalid]="err('from')">
            <label class="fld-l" for="cc-from">From<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="cc-from"
                type="date"
                aria-describedby="cc-from-e"
                [value]="from()"
                (input)="from.set(val($event)); clear('from')"
              />
            </div>
            <div class="fld-e" id="cc-from-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('from') }}</span>
            </div>
            <div class="fld-h">Only future coupons are cancelled — today's and used ones stay.</div>
          </div>
          <div class="fld" [class.invalid]="err('to')">
            <label class="fld-l" for="cc-to">To<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="cc-to"
                type="date"
                aria-describedby="cc-to-e"
                [value]="to()"
                (input)="to.set(val($event)); clear('to')"
              />
            </div>
            <div class="fld-e" id="cc-to-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('to') }}</span>
            </div>
          </div>
          <div class="full">
            <span class="fld-l">Coupon types<span class="opt">(optional)</span></span>
            <div class="cm-clsgrid mt4" role="group" aria-label="Coupon types">
              @for (t of types(); track t.id) {
                <label class="cm-clschip" [class.on]="typeOn(t.id)"
                  ><input type="checkbox" [checked]="typeOn(t.id)" (change)="toggleType(t.id)" />{{
                    t.name
                  }}</label
                >
              }
            </div>
            <div class="fld-h">None ticked: coupons of every type are cancelled.</div>
          </div>
          <div class="full">
            <div class="fld" [class.invalid]="err('reason')">
              <label class="fld-l" for="cc-reason">Reason<span class="req">*</span></label>
              <div class="fld-in">
                <textarea
                  id="cc-reason"
                  rows="2"
                  maxlength="200"
                  placeholder="e.g. Left the hostel from November"
                  aria-describedby="cc-reason-e"
                  [value]="reason()"
                  (input)="reason.set(val($event)); clear('reason')"
                ></textarea>
              </div>
              <div class="fld-e" id="cc-reason-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('reason') }}</span>
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
      </div>
      <div modal-foot class="row g8" style="justify-content: flex-end; width: 100%">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Keep them</span>
        </button>
        <button
          type="button"
          class="btn btn-danger"
          id="cc-go"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="submit()"
        >
          <rp-icon name="x" [size]="17" /><span>Cancel coupons</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class CouponCancel {
  private readonly api = inject(CouponsApi);
  private readonly overlays = inject(Overlays);

  readonly classes = input<readonly ClassView[]>([]);
  readonly types = input<readonly CouponType[]>([]);
  readonly closed = output<void>();
  readonly cancelled = output<number>();

  protected readonly sel = signal<readonly MemberRow[]>([]);
  protected readonly typeIds = signal<readonly string[]>([]);
  protected readonly from = signal(addDays(istBusinessDate(new Date()), 1));
  protected readonly to = signal(monthEnd(addDays(istBusinessDate(new Date()), 1)));
  protected readonly reason = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private readonly key = newIdempotencyKey();

  protected readonly chosen = computed(() =>
    this.types().filter((t) => this.typeIds().includes(t.id)),
  );

  protected typeOn(id: string) {
    return this.typeIds().includes(id);
  }
  protected toggleType(id: string) {
    this.typeIds.update((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  }
  protected clear(k: Field) {
    if (this.errors()[k]) this.errors.update((x) => ({ ...x, [k]: undefined }));
    this.error.set('');
  }
  protected err(k: Field) {
    return this.errors()[k] ?? '';
  }

  protected async submit() {
    if (this.busy()) return;
    const today = istBusinessDate(new Date());
    const e: Partial<Record<Field, string>> = {};
    if (!isIsoDate(this.from())) e.from = 'Choose the start date';
    else if (this.from() <= today) e.from = translate('CPN.DATES_NOT_FUTURE');
    if (!isIsoDate(this.to())) e.to = 'Choose the end date';
    else if (isIsoDate(this.from()) && this.to() < this.from()) {
      e.to = translate('FEE.EVENT_DATES_INVALID');
    }
    const reason = this.reason().trim();
    if (!reason) e.reason = 'Enter a reason to continue';
    else if (reason.length < 5) e.reason = 'Write at least 5 characters';
    this.errors.set(e);
    if (!this.sel().length) this.error.set('Choose at least one student.');
    if (Object.values(e).some(Boolean) || !this.sel().length) return;
    const types = this.chosen().map((t) => t.name);
    const ok = await this.overlays.confirm({
      title: `Cancel coupons for ${plural(this.sel().length, 'student')}?`,
      text: `${types.length ? types.join(', ') : 'Every type'} · ${formatDate(this.from())} to ${formatDate(this.to())}. Active coupons in this range can no longer be used.`,
      ok: 'Cancel coupons',
      cancel: 'Keep them',
      tone: 'bad',
      icon: 'x',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const r = await this.api.cancel(
        {
          studentIds: this.sel().map((s) => s.id),
          from: this.from(),
          to: this.to(),
          ...(this.typeIds().length ? { typeIds: [...this.typeIds()] } : {}),
          reason,
        },
        this.key,
      );
      this.cancelled.emit(r.cancelled);
    } catch (err) {
      if (err instanceof ApiProblem && err.errors.length) {
        const fe: Partial<Record<Field, string>> = {};
        for (const x of err.errors) {
          if (x.field === 'from' || x.field === 'to' || x.field === 'reason') {
            fe[x.field] = x.message;
          }
        }
        this.errors.set(fe);
        if (!Object.keys(fe).length) this.error.set(err.errors[0]!.message);
      } else {
        this.error.set(err instanceof ApiProblem ? err.detail : translate('GEN.UNAVAILABLE'));
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected val(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
}
