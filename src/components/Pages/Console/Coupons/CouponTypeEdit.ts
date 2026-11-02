import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { amountPaise, inrText } from '../../../Shared/Amount';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { newIdempotencyKey } from '../../../Utils/ids';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { amountText, cleanTyped } from '../../../Utils/typing';
import { moneyInput } from '../Allowances/allowance-format';
import type { Merchant } from '../Merchants/merchants.api';
import { KINDS, PERIODS } from './coupon-format';
import {
  CouponsApi,
  type CouponKind,
  type CouponPeriod,
  type CouponSlot,
  type CouponType,
  type CouponTypeInput,
} from './coupons.api';

type Field =
  'name' | 'value' | 'hold' | 'redeem' | 'from' | 'to' | 'slot' | 'ifrom' | 'ito' | 'desc';
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The coupon type modal (prototype cm.ct.edit; CR-15, OI-CPN-10…12; CPN-004, CPN-005): name and
 * kind; the time window (an institution slot, or the type's own window); value, holding and
 * redemption maxima; the accepting regular merchants (none ticked: every regular merchant); when it
 * can be issued; active or not. A value above ₹0 is refused while value-bearing types are off.
 */
@Component({
  selector: 'rp-coupon-type-edit',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      [title]="type() ? 'Edit ' + type()!.name : 'New coupon type'"
      sub="Type master (CR-15)"
      icon="ticket"
      [wide]="true"
      cls="cm-m"
      [dismiss]="!busy()"
      (closed)="closed.emit()"
    >
      <div class="stack g16">
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow">{{ readOnly() }}</div>
          </div>
        }
        <div class="c-form">
          <div class="fld" [class.invalid]="err('name')">
            <label class="fld-l" for="ct-name">Type name<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="ct-name"
                maxlength="40"
                autocomplete="off"
                placeholder="e.g. Evening milk"
                aria-describedby="ct-name-e"
                [value]="f().name"
                (input)="set('name', $event)"
              />
            </div>
            <div class="fld-e" id="ct-name-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
            </div>
          </div>
          <div class="fld">
            <label class="fld-l" for="ct-kind">Kind</label>
            <div class="fld-in">
              <select id="ct-kind" [value]="f().kind" (change)="set('kind', $event)">
                @for (k of kinds; track k.v) {
                  <option [value]="k.v" [selected]="k.v === f().kind">{{ k.l }}</option>
                }
              </select>
            </div>
          </div>
        </div>

        <div class="fs">
          <h4><rp-icon name="clock" [size]="16" /> Time window</h4>
          <div class="fs-b stack g12">
            <div class="grid c2" role="radiogroup" aria-label="Time window">
              @for (c of windows; track c.v) {
                <div
                  class="choice"
                  [class.on]="f().own === (c.v === 'own')"
                  tabindex="0"
                  role="radio"
                  [attr.aria-checked]="f().own === (c.v === 'own')"
                  (click)="setOwn(c.v === 'own')"
                  (keydown.enter)="setOwn(c.v === 'own')"
                  (keydown.space)="$event.preventDefault(); setOwn(c.v === 'own')"
                >
                  <span class="li-ic sm"><rp-icon [name]="c.icon" [size]="17" /></span
                  ><span class="grow"
                    ><span class="t-h4" style="display: block">{{ c.title }}</span
                    ><span class="t-sm t-muted" style="display: block; margin-top: 1px">{{
                      c.sub
                    }}</span></span
                  ><span class="radio"></span>
                </div>
              }
            </div>
            @if (!f().own) {
              <div class="fld" [class.invalid]="err('slot')">
                <label class="fld-l" for="ct-slot">Slot</label>
                <div class="fld-in">
                  <select id="ct-slot" [value]="f().slotId" (change)="set('slotId', $event)">
                    @for (s of slots(); track s.id) {
                      <option [value]="s.id" [selected]="s.id === f().slotId">
                        {{ s.name }} · {{ s.start }}–{{ s.end }}
                      </option>
                    }
                  </select>
                </div>
                <div class="fld-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('slot') }}</span>
                </div>
              </div>
            } @else {
              <div class="c-form">
                <div class="fld" [class.invalid]="err('from')">
                  <label class="fld-l" for="ct-from">From</label>
                  <div class="fld-in">
                    <input
                      id="ct-from"
                      type="time"
                      aria-describedby="ct-from-e"
                      [value]="f().from"
                      (input)="set('from', $event)"
                    />
                  </div>
                  <div class="fld-e" id="ct-from-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{ err('from') }}</span>
                  </div>
                </div>
                <div class="fld" [class.invalid]="err('to')">
                  <label class="fld-l" for="ct-to">To</label>
                  <div class="fld-in">
                    <input
                      id="ct-to"
                      type="time"
                      aria-describedby="ct-to-e"
                      [value]="f().to"
                      (input)="set('to', $event)"
                    />
                  </div>
                  <div class="fld-e" id="ct-to-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{ err('to') }}</span>
                  </div>
                </div>
              </div>
            }
          </div>
        </div>

        <div class="c-form">
          <div class="fld" [class.invalid]="err('value')">
            <label class="fld-l" for="ct-value">Value<span class="opt">(optional)</span></label>
            <div class="fld-in">
              <span class="pre">₹</span
              ><input
                id="ct-value"
                inputmode="decimal"
                autocomplete="off"
                placeholder="0.00"
                aria-describedby="ct-value-e"
                [value]="f().value"
                (input)="set('value', $event)"
              />
            </div>
            <div class="fld-e" id="ct-value-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('value') }}</span>
            </div>
            <div class="fld-h">
              <rp-icon name="alert" [size]="11" /> A value-bearing type is an entitlement the
              merchant can't yet be reimbursed for — redemption posts no ledger entry or settlement
              line (OI-CPN-10).
            </div>
          </div>
          <div class="fld" [class.invalid]="err('hold')">
            <label class="fld-l" for="ct-hold">Holding maximum<span class="req">*</span></label>
            <div class="fld-in">
              <input
                id="ct-hold"
                inputmode="numeric"
                maxlength="4"
                autocomplete="off"
                aria-describedby="ct-hold-e"
                [value]="f().hold"
                (input)="set('hold', $event)"
              />
            </div>
            <div class="fld-e" id="ct-hold-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('hold') }}</span>
            </div>
            <div class="fld-h">Most active coupons of this type one student may hold.</div>
          </div>
          <div class="fld" [class.invalid]="err('redeem')">
            <label class="fld-l" for="ct-redeem"
              >Redemption maximum<span class="req">*</span></label
            >
            <div class="fld-in">
              <input
                id="ct-redeem"
                inputmode="numeric"
                maxlength="4"
                autocomplete="off"
                aria-describedby="ct-redeem-e"
                [value]="f().redeem"
                (input)="set('redeem', $event)"
              />
            </div>
            <div class="fld-e" id="ct-redeem-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('redeem') }}</span>
            </div>
          </div>
          <div class="fld">
            <label class="fld-l" for="ct-period">Counted per</label>
            <div class="fld-in">
              <select id="ct-period" [value]="f().period" (change)="set('period', $event)">
                @for (p of periods; track p.v) {
                  <option [value]="p.v" [selected]="p.v === f().period">{{ p.l }}</option>
                }
              </select>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('ifrom')">
            <label class="fld-l" for="ct-ifrom"
              >Issuable from<span class="opt">(optional)</span></label
            >
            <div class="fld-in">
              <input
                id="ct-ifrom"
                type="date"
                aria-describedby="ct-ifrom-e"
                [value]="f().issueFrom"
                (input)="set('issueFrom', $event)"
              />
            </div>
            <div class="fld-e" id="ct-ifrom-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('ifrom') }}</span>
            </div>
          </div>
          <div class="fld" [class.invalid]="err('ito')">
            <label class="fld-l" for="ct-ito">Issuable to<span class="opt">(optional)</span></label>
            <div class="fld-in">
              <input
                id="ct-ito"
                type="date"
                aria-describedby="ct-ito-e"
                [value]="f().issueTo"
                (input)="set('issueTo', $event)"
              />
            </div>
            <div class="fld-e" id="ct-ito-e" role="alert">
              <rp-icon name="alertc" [size]="14" /><span>{{ err('ito') }}</span>
            </div>
          </div>
          <div class="full">
            <div class="fld" [class.invalid]="err('desc')">
              <label class="fld-l" for="ct-desc"
                >Description<span class="opt">(optional)</span></label
              >
              <div class="fld-in">
                <input
                  id="ct-desc"
                  maxlength="200"
                  autocomplete="off"
                  placeholder="What members see in the app, e.g. Lunch at the mess or canteen"
                  [value]="f().description"
                  (input)="set('description', $event)"
                />
              </div>
              <div class="fld-e" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('desc') }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="fs">
          <h4><rp-icon name="store" [size]="16" /> Accepting merchants</h4>
          <div class="fs-b">
            @if (regulars().length) {
              <div class="row g16 wrap">
                @for (m of regulars(); track m.id) {
                  <label class="chk"
                    ><input
                      type="checkbox"
                      [id]="'ct-m-' + m.id"
                      [checked]="f().merchants.includes(m.id)"
                      (change)="toggleMerchant(m.id)"
                    /><span
                      >{{ m.displayName }}
                      @if (!m.accepts.coupon) {
                        <span class="t-faint">(coupon QR not enabled)</span>
                      }
                    </span></label
                  >
                }
              </div>
            } @else {
              <div class="t-sm t-muted">{{ merchantsNote() }}</div>
            }
            <div class="fld-h mt8">
              None ticked: every regular merchant accepts this type.
              @if (vendors().length) {
                {{ vendorNames() }} {{ vendors().length === 1 ? 'is a vendor' : 'are vendors' }}
                and can't accept coupons (BR-42).
              }
            </div>
            @if (err('merchants')) {
              <div class="fld-e" style="display: flex; margin-top: 6px" role="alert">
                <rp-icon name="alertc" [size]="14" /><span>{{ err('merchants') }}</span>
              </div>
            }
          </div>
        </div>

        <div class="li" style="min-height: 52px">
          <span class="li-ic sm"><rp-icon name="power" [size]="16" /></span>
          <span class="li-main"
            ><span class="li-t wrap">Active</span
            ><span class="li-s wrap"
              >Inactive types can't be issued or redeemed; issued coupons stay but are refused at
              the reader.</span
            ></span
          >
          <button
            type="button"
            class="toggle"
            role="switch"
            id="ct-active"
            aria-label="Active"
            [attr.aria-checked]="f().active"
            [disabled]="!!readOnly()"
            (click)="toggleActive()"
          ></button>
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
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="ct-save"
          [class.is-busy]="busy()"
          [disabled]="busy() || !!readOnly()"
          [title]="readOnly()"
          (click)="save()"
        >
          <span>{{ type() ? 'Save type' : 'Create type' }}</span>
        </button>
      </div>
    </rp-modal>
  `,
})
export class CouponTypeEdit {
  private readonly api = inject(CouponsApi);
  private readonly overlays = inject(Overlays);

  /** null: a new type. */
  readonly type = input<CouponType | null>(null);
  readonly types = input<readonly CouponType[]>([]);
  readonly slots = input<readonly CouponSlot[]>([]);
  readonly merchants = input<readonly Merchant[] | null>(null);
  /** Why the type can't be changed here; '' when it can. */
  readonly readOnly = input('');
  readonly closed = output<void>();
  readonly saved = output<CouponType>();

  protected readonly kinds = KINDS;
  protected readonly periods = PERIODS;
  protected readonly windows = [
    { v: 'slot', title: 'Institution slot', sub: 'Meal types point at a slot', icon: 'layers' },
    { v: 'own', title: 'Own window', sub: 'For value-bearing or event types', icon: 'clock' },
  ] as const;
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly errors = signal<Partial<Record<Field | 'merchants', string>>>({});
  protected readonly f = signal({
    name: '',
    kind: 'MEAL' as CouponKind,
    own: false,
    slotId: '',
    from: '09:00',
    to: '17:00',
    value: '',
    hold: '31',
    redeem: '1',
    period: 'DAY' as CouponPeriod,
    issueFrom: '',
    issueTo: '',
    description: '',
    merchants: [] as string[],
    active: true,
  });
  private readonly key = newIdempotencyKey();

  protected readonly regulars = computed(() =>
    (this.merchants() ?? []).filter((m) => m.subType === 'REGULAR' && m.status === 'ACTIVE'),
  );
  protected readonly vendors = computed(() =>
    (this.merchants() ?? []).filter((m) => m.subType === 'VENDOR'),
  );
  protected readonly vendorNames = computed(() =>
    this.vendors()
      .map((m) => m.displayName)
      .join(', '),
  );
  protected readonly merchantsNote = computed(() =>
    this.merchants() === null
      ? 'The merchant list isn’t available to your role; the type keeps its merchants.'
      : 'No regular merchants yet.',
  );

  constructor() {
    queueMicrotask(() => this.fill());
  }

  /** The form from the type being edited (or the defaults of a new meal type). */
  private fill() {
    const t = this.type();
    const firstSlot = this.slots()[0]?.id ?? '';
    if (!t) {
      this.f.update((v) => ({ ...v, slotId: firstSlot }));
      return;
    }
    this.f.set({
      name: t.name,
      kind: t.kind,
      own: !t.slot,
      slotId: t.slot?.id ?? firstSlot,
      from: t.window.start,
      to: t.window.end,
      value: amountPaise(t.value) ? t.value.amount : '',
      hold: String(t.holdMax),
      redeem: String(t.redeemMax),
      period: t.period,
      issueFrom: t.issueFrom ?? '',
      issueTo: t.issueTo ?? '',
      description: t.description ?? '',
      merchants: t.acceptsAll ? [] : t.merchants.map((m) => m.id),
      active: t.status === 'ACTIVE',
    });
  }

  protected set(
    k:
      | 'name'
      | 'kind'
      | 'slotId'
      | 'from'
      | 'to'
      | 'value'
      | 'hold'
      | 'redeem'
      | 'period'
      | 'issueFrom'
      | 'issueTo'
      | 'description',
    e: Event,
  ) {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    // The value in rupees takes numbers only (client 2026-10-14).
    const v = k === 'value' ? cleanTyped(el as HTMLInputElement, amountText) : el.value;
    this.f.update((x) => ({ ...x, [k]: v }));
    const map: Partial<Record<typeof k, Field>> = {
      name: 'name',
      slotId: 'slot',
      from: 'from',
      to: 'to',
      value: 'value',
      hold: 'hold',
      redeem: 'redeem',
      issueFrom: 'ifrom',
      issueTo: 'ito',
      description: 'desc',
    };
    const fk = map[k];
    if (fk && this.errors()[fk]) this.errors.update((x) => ({ ...x, [fk]: undefined }));
  }
  protected setOwn(own: boolean) {
    this.f.update((x) => ({ ...x, own }));
    this.errors.update((x) => ({ ...x, from: undefined, to: undefined, slot: undefined }));
  }
  protected toggleMerchant(id: string) {
    this.f.update((x) => ({
      ...x,
      merchants: x.merchants.includes(id)
        ? x.merchants.filter((m) => m !== id)
        : [...x.merchants, id],
    }));
    this.errors.update((x) => ({ ...x, merchants: undefined }));
  }
  protected toggleActive() {
    this.f.update((x) => ({ ...x, active: !x.active }));
  }
  protected err(k: Field | 'merchants') {
    return this.errors()[k] ?? '';
  }

  private validate(): CouponTypeInput | null {
    const v = this.f();
    const e: Partial<Record<Field | 'merchants', string>> = {};
    const name = v.name.trim();
    const t = this.type();
    if (!name) e.name = 'Enter the type name';
    else if (name.length < 3 || name.length > 40) e.name = 'Use 3–40 characters';
    else if (
      this.types().some((o) => o.id !== t?.id && o.name.toLowerCase() === name.toLowerCase())
    ) {
      e.name = translate('CPN.TYPE_NAME_TAKEN');
    }
    const value = v.value.trim() ? moneyInput(v.value) : '0.00';
    if (value === null) e.value = translate('VALIDATION.AMOUNT');
    const whole = (s: string, label: string) => {
      if (!s.trim()) return `Enter the ${label}`;
      const n = Number(s);
      return /^\d+$/.test(s.trim()) && n >= 1 && n <= 1000
        ? ''
        : 'Enter a whole number from 1 to 1,000';
    };
    const hold = whole(v.hold, 'holding maximum');
    if (hold) e.hold = hold;
    const redeem = whole(v.redeem, 'redemption maximum');
    if (redeem) e.redeem = redeem;
    if (v.own) {
      if (!TIME.test(v.from)) e.from = 'Enter the start time';
      if (!TIME.test(v.to)) e.to = 'Enter the end time';
      else if (TIME.test(v.from) && v.to <= v.from) e.to = translate('CPN.WINDOW_INVALID');
    } else if (!v.slotId) {
      e.slot = 'Choose the slot';
    }
    if (value && value !== '0.00' && !v.own && !e.value) {
      e.value = 'A value-bearing type carries its own time window — choose “Own window”.';
    }
    if (v.issueFrom && v.issueTo && v.issueTo < v.issueFrom) {
      e.ito = translate('FEE.EVENT_DATES_INVALID');
    }
    this.errors.set(e);
    if (Object.values(e).some(Boolean)) return null;
    if (v.kind === 'MEAL' && v.own && value === '0.00') {
      this.overlays.toast('Meal types point at an institution slot', {
        tone: 'bad',
        sub: 'Choose “Institution slot”, or give the type a value (OI-CPN-12).',
      });
      return null;
    }
    return {
      name,
      kind: v.kind,
      description: v.description.trim() || null,
      ...(v.own
        ? { slotId: null, window: { start: v.from, end: v.to } }
        : { slotId: v.slotId, window: null }),
      value: { amount: value!, currency: 'INR' },
      holdMax: Number(v.hold),
      redeemMax: Number(v.redeem),
      period: v.period,
      // Without the merchant list (no merchants.view) the type keeps its merchants.
      ...(this.merchants() !== null ? { merchantIds: v.merchants } : {}),
      issueFrom: v.issueFrom || null,
      issueTo: v.issueTo || null,
      active: v.active,
    };
  }

  protected async save() {
    if (this.readOnly() || this.busy()) return;
    this.error.set('');
    const body = this.validate();
    if (!body) return;
    const t = this.type();
    const n = body.merchantIds?.length ?? 0;
    const valued = body.value && amountPaise(body.value) > 0;
    const who = !body.merchantIds
      ? t
        ? 'accepting merchants unchanged'
        : 'every regular merchant'
      : n
        ? `${n} accepting merchant${n === 1 ? '' : 's'}`
        : 'every regular merchant';
    const ok = await this.overlays.confirm({
      title: t ? `Save changes to ${t.name}?` : `Create ${body.name}?`,
      text: `${body.active ? 'Active' : 'Inactive'} · ${who}${valued ? ` · value ${inrText(body.value!)} (reimbursement not settled — OI-CPN-10)` : ''}.${t && t.status === 'ACTIVE' && !body.active ? ' Issued coupons of this type will be refused at readers.' : ''}`,
      ok: t ? 'Save type' : 'Create type',
      tone: valued ? 'warn' : 'brand',
      icon: 'ticket',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const out = t
        ? await this.api.updateType(t, body)
        : await this.api.createType(body, this.key);
      this.saved.emit(out);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(e: unknown) {
    if (!(e instanceof ApiProblem)) {
      this.error.set(translate('GEN.UNAVAILABLE'));
      return;
    }
    if (e.status === 412) {
      this.error.set('Someone else changed this type. Close it and open it again.');
      return;
    }
    if (e.code === 'CPN.TYPE_NAME_TAKEN') {
      this.errors.update((x) => ({ ...x, name: e.detail }));
      return;
    }
    if (e.code === 'CPN.VALUE_TYPES_OFF') {
      this.errors.update((x) => ({ ...x, value: e.detail }));
      return;
    }
    const map: Record<string, Field | 'merchants'> = {
      name: 'name',
      value: 'value',
      holdMax: 'hold',
      redeemMax: 'redeem',
      slotId: 'slot',
      window: 'from',
      'window.start': 'from',
      'window.end': 'to',
      merchantIds: 'merchants',
      issueFrom: 'ifrom',
      issueTo: 'ito',
      description: 'desc',
    };
    const fe: Partial<Record<Field | 'merchants', string>> = {};
    for (const x of e.errors) {
      const k = map[x.field];
      if (k) fe[k] = x.message;
    }
    if (Object.keys(fe).length) this.errors.set(fe);
    else this.error.set(e.detail);
  }
}
