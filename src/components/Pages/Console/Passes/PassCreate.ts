import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { istBusinessDate } from '../../../Utils/format';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { addDays } from '../Coupons/coupon-format';
import { HolderSelect, type Holder } from './HolderSelect';
import { longDay } from './pass-format';
import { PassesApi } from './passes.api';

type Field = 'type' | 'holder' | 'purpose' | 'desc' | 'date' | 'max' | 'com';

/**
 * Create an entry pass (prototype cm.ps.new; SRS 9.7, FR-PAY-08, BR-72, OI-PAY-09, OQ-18; PAY-027):
 * a single-day pass of a configured type for a student or visitor, bound to the holder's registered
 * phone, with a number of scans. One live pass per holder, phone and day; a holder without a
 * registered phone is refused.
 */
@Component({
  selector: 'rp-pass-create',
  imports: [HolderSelect, Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Create entry pass"
      sub="A single-day pass the holder shows from their registered device."
      icon="door"
      [wide]="true"
      cls="cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="c-form">
        <div class="fld" [class.invalid]="err('type')">
          <label class="fld-l" for="pn-type">Pass type<span class="req">*</span></label>
          <div class="fld-in">
            <select id="pn-type" [value]="f().type" (change)="set('type', $event)">
              @for (t of types(); track t.code) {
                <option [value]="t.code" [selected]="t.code === f().type">{{ t.label }}</option>
              }
            </select>
          </div>
          <div class="fld-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('type') }}</span>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('holder')">
          <label class="fld-l" for="pn-holder-b">Holder<span class="req">*</span></label>
          <rp-holder-select
            inputId="pn-holder"
            [value]="holder()"
            (valueChange)="holder.set($event); clear('holder')"
          />
          <div class="fld-e" id="pn-holder-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('holder') }}</span>
          </div>
          <div class="fld-h">Students and visitors with the app on a registered phone.</div>
        </div>
        <div class="full">
          <div class="fld" [class.invalid]="err('purpose')">
            <label class="fld-l" for="pn-purpose">Purpose<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="pn-purpose"
                maxlength="120"
                autocomplete="off"
                placeholder="e.g. Inter-school fest — performer"
                aria-describedby="pn-purpose-e"
                [value]="f().purpose"
                (input)="set('purpose', $event)"
              />
            </div>
            <div class="fld-e" id="pn-purpose-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('purpose') }}</span>
            </div>
          </div>
        </div>
        <div class="full">
          <div class="fld" [class.invalid]="err('desc')">
            <label class="fld-l" for="pn-desc">Description<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="pn-desc"
                maxlength="300"
                autocomplete="off"
                placeholder="e.g. Entry to the auditorium and the green room"
                aria-describedby="pn-desc-e"
                [value]="f().desc"
                (input)="set('desc', $event)"
              />
            </div>
            <div class="fld-e" id="pn-desc-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('desc') }}</span>
            </div>
          </div>
        </div>
        <div class="fld" [class.invalid]="err('date')">
          <label class="fld-l" for="pn-date">Valid on<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="pn-date"
              type="date"
              aria-describedby="pn-date-e"
              [value]="f().date"
              (input)="set('date', $event)"
            />
          </div>
          <div class="fld-e" id="pn-date-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('date') }}</span>
          </div>
          <div class="fld-h">A future date — the pass is valid for that day only.</div>
        </div>
        <div class="fld" [class.invalid]="err('max')">
          <label class="fld-l" for="pn-max">Maximum scans<span class="req">*</span></label>
          <div class="fld-in">
            <input
              id="pn-max"
              inputmode="numeric"
              maxlength="3"
              autocomplete="off"
              aria-describedby="pn-max-e"
              [value]="f().max"
              (input)="set('max', $event)"
            />
          </div>
          <div class="fld-e" id="pn-max-e" role="alert">
            <rp-icon name="alertc" [size]="14" /><span>{{ err('max') }}</span>
          </div>
        </div>
        <div class="full">
          <div class="li" style="min-height: 52px">
            <span class="li-ic sm"><rp-icon name="share" [size]="16" /></span>
            <span class="li-main"
              ><span class="li-t wrap">Transfer to another holder allowed</span
              ><span class="li-s wrap"
                >Recorded on the pass; the transfer action itself is still to be defined
                (OQ-18).</span
              ></span
            >
            <button
              type="button"
              class="toggle"
              role="switch"
              id="pn-tr"
              aria-label="Transfer to another holder allowed"
              [attr.aria-checked]="f().transfer"
              (click)="toggleTransfer()"
            ></button>
          </div>
        </div>
        <div class="full">
          <div class="fld" [class.invalid]="err('com')">
            <label class="fld-l" for="pn-com">Comments<span class="opt">(optional)</span></label>
            <div class="fld-in">
              <textarea
                id="pn-com"
                rows="2"
                maxlength="300"
                aria-describedby="pn-com-e"
                [value]="f().com"
                (input)="set('com', $event)"
              ></textarea>
            </div>
            <div class="fld-e" id="pn-com-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('com') }}</span>
            </div>
          </div>
        </div>
        @if (error()) {
          <div class="full">
            <div class="note tone-bad" role="alert">
              <rp-icon name="alertc" [size]="17" />
              <div class="grow">{{ error() }}</div>
            </div>
          </div>
        }
      </div>
      <div modal-foot class="row g8" style="justify-content: flex-end; width: 100%">
        <button type="button" class="btn btn-sec" [disabled]="busy()" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="pn-save"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="save()"
        >
          <rp-icon name="check" [size]="17" /><span>Create pass</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class PassCreate {
  private readonly api = inject(PassesApi);
  private readonly overlays = inject(Overlays);

  readonly types = input<readonly { code: string; label: string }[]>([]);
  readonly closed = output<void>();
  readonly created = output<{ passId: string; holder: Holder; validOn: string }>();

  protected readonly holder = signal<Holder | null>(null);
  protected readonly f = signal({
    type: '',
    purpose: '',
    desc: '',
    date: addDays(istBusinessDate(new Date()), 1),
    max: '1',
    transfer: false,
    com: '',
  });
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  private key = newIdempotencyKey();

  constructor() {
    queueMicrotask(() => {
      const first = this.types()[0];
      if (first && !this.f().type) this.f.update((x) => ({ ...x, type: first.code }));
    });
  }

  protected set(k: 'type' | 'purpose' | 'desc' | 'date' | 'max' | 'com', e: Event) {
    const v = (e.target as HTMLInputElement).value;
    this.f.update((x) => ({ ...x, [k]: v }));
    this.clear(k === 'type' ? 'type' : k);
    this.key = newIdempotencyKey();
  }
  protected toggleTransfer() {
    this.f.update((x) => ({ ...x, transfer: !x.transfer }));
  }
  protected clear(k: Field) {
    if (this.errors()[k]) this.errors.update((x) => ({ ...x, [k]: undefined }));
    this.error.set('');
  }
  protected err(k: Field) {
    return this.errors()[k] ?? '';
  }

  protected async save() {
    if (this.busy()) return;
    const v = this.f();
    const e: Partial<Record<Field, string>> = {};
    if (!v.type) e.type = 'Choose the pass type';
    const h = this.holder();
    if (!h) e.holder = 'Choose the holder';
    const purpose = v.purpose.trim();
    if (!purpose) e.purpose = 'Enter the purpose';
    else if (purpose.length < 4) e.purpose = 'Use 4–120 characters';
    const desc = v.desc.trim();
    if (!desc) e.desc = 'Enter a description';
    if (!v.date) e.date = 'Choose the date';
    else if (v.date <= istBusinessDate(new Date())) e.date = translate('PAY.PASS_DATE_NOT_FUTURE');
    const max = Number(v.max);
    if (!v.max.trim()) e.max = 'Enter the maximum scans';
    else if (!/^\d+$/.test(v.max.trim()) || max < 1 || max > 100) e.max = 'Enter 1 to 100 scans';
    this.errors.set(e);
    if (Object.values(e).some(Boolean) || !h) return;
    const type = this.types().find((t) => t.code === v.type)?.label ?? v.type;
    const ok = await this.overlays.confirm({
      title: `Create a pass for ${h.name}?`,
      text: `${type} · ${longDay(v.date)} · up to ${max} scan${max === 1 ? '' : 's'}. It opens only on the holder's registered device.`,
      ok: 'Create pass',
      icon: 'door',
    });
    if (!ok) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await this.api.issue(
        {
          type: v.type,
          purpose,
          description: desc,
          holderIds: [h.id],
          validOn: v.date,
          maxScans: max,
          transferAllowed: v.transfer,
          comments: v.com.trim() || null,
        },
        this.key,
      );
      const issued = r.issued[0];
      if (issued) {
        this.created.emit({ passId: issued.passId, holder: h, validOn: v.date });
        return;
      }
      const code = r.refused[0]?.code ?? 'GEN.INTERNAL';
      // The same request again would be refused the same way: a new key for the next try.
      this.key = newIdempotencyKey();
      if (code === 'PAY.PASS_DUPLICATE') this.errors.set({ date: translate(code) });
      else this.errors.set({ holder: translate(code) });
    } catch (err) {
      if (err instanceof ApiProblem && err.errors.length) {
        const map: Record<string, Field> = {
          type: 'type',
          purpose: 'purpose',
          description: 'desc',
          validOn: 'date',
          maxScans: 'max',
          holderIds: 'holder',
          comments: 'com',
        };
        const fe: Partial<Record<Field, string>> = {};
        for (const x of err.errors) {
          const k = map[x.field];
          if (k) fe[k] = x.message;
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
}
