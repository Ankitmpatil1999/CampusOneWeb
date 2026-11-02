import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Icon } from '../../../Shared/Icon';
import { Modal, Overlays } from '../../../Shared/Overlays';
import { PATTERNS } from '../../../Utils/patterns';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import {
  MerchantsApi,
  type MerchantInput,
  type MerchantSubType,
  type QrKind,
} from './merchants.api';
import { IFSC_BANKS, fileSize } from './merchant-format';

const MAX_FILE = 2 * 1024 * 1024;
const CHEQUE_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const LOGO_TYPES = ['image/png', 'image/jpeg'];

interface Draft {
  name: string;
  op: string;
  sub: MerchantSubType;
  dept: string;
  mobile: string;
  email: string;
  allowance: boolean;
  coupon: boolean;
  acct: string;
  acct2: string;
  ifsc: string;
  holder: string;
  cheque: File | null;
  logo: File | null;
}

type TextKey = 'name' | 'op' | 'mobile' | 'email' | 'acct' | 'acct2' | 'ifsc' | 'holder';

/** Server field names → the form's fields. */
const FIELD: Record<string, string> = {
  displayName: 'name',
  operatorFirstName: 'op',
  operatorLastName: 'op',
  subType: 'sub',
  departmentId: 'dept',
  mobile: 'mobile',
  email: 'email',
  acceptsAllowance: 'acc',
  acceptsCoupon: 'acc',
  'bank.accountNumber': 'acct',
  'bank.ifsc': 'ifsc',
  'bank.holderName': 'holder',
  chequeFileId: 'cheque',
  logoFileId: 'logo',
};

const DIGITS_ONLY = new Set<TextKey>(['acct', 'acct2', 'mobile']);

/**
 * The prototype's "Register merchant" modal (cm.mer.new; PAY-017, FR-MER-01): the merchant with its
 * sub-type, department, mobile and what it accepts, then the settlement bank account and the
 * cancelled cheque. Vendors accept wallet payments only (BR-42). On success the static codes the
 * merchant accepts are generated once (PAY-022), as the prototype's registration does.
 */
@Component({
  selector: 'rp-merchant-register',
  imports: [Icon, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-modal
      title="Register merchant"
      sub="Creates the merchant profile with its wallets and generates its static codes once."
      icon="store"
      [wide]="true"
      cls="cm-m"
      (closed)="closed.emit()"
    >
      <div class="stack g16">
        <div class="fs">
          <h4><rp-icon name="store" [size]="16" /> Merchant</h4>
          <div class="fs-b">
            <div class="c-form">
              <div class="fld" [class.invalid]="err('name')">
                <label class="fld-l" for="mn-name">Display name<span class="req">*</span></label>
                <div class="fld-in">
                  <input
                    id="mn-name"
                    name="mn-name"
                    type="text"
                    placeholder="e.g. Fresh Fruits Counter"
                    maxlength="40"
                    autocomplete="off"
                    aria-describedby="mn-name-e"
                    [value]="d().name"
                    (input)="set('name', $event)"
                  />
                </div>
                <div class="fld-e" id="mn-name-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('name') }}</span>
                </div>
              </div>
              <div class="fld" [class.invalid]="err('op')">
                <label class="fld-l" for="mn-op">Operator name<span class="req">*</span></label>
                <div class="fld-in">
                  <input
                    id="mn-op"
                    name="mn-op"
                    type="text"
                    placeholder="Person running the counter"
                    maxlength="121"
                    autocomplete="off"
                    aria-describedby="mn-op-e"
                    [value]="d().op"
                    (input)="set('op', $event)"
                  />
                </div>
                <div class="fld-e" id="mn-op-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('op') }}</span>
                </div>
              </div>
              <div class="full">
                <span class="fld-l" id="mn-sub-l">Sub-type<span class="req">*</span></span>
                <div
                  class="grid c2"
                  style="margin-top: 6px"
                  role="radiogroup"
                  aria-labelledby="mn-sub-l"
                >
                  @for (s of subTypes; track s.v) {
                    <div
                      class="choice"
                      [class.on]="d().sub === s.v"
                      tabindex="0"
                      role="radio"
                      [attr.aria-checked]="d().sub === s.v"
                      (click)="pickSub(s.v)"
                      (keydown.enter)="pickSub(s.v)"
                      (keydown.space)="$event.preventDefault(); pickSub(s.v)"
                    >
                      <span class="li-ic sm"><rp-icon [name]="s.icon" [size]="17" /></span>
                      <span class="grow"
                        ><span class="t-h4" style="display: block">{{ s.l }}</span
                        ><span class="t-sm t-muted" style="display: block; margin-top: 1px">{{
                          s.sub
                        }}</span></span
                      >
                      <span class="radio"></span>
                    </div>
                  }
                </div>
              </div>
              <div class="fld" [class.invalid]="err('dept')">
                <label class="fld-l" for="mn-dept"
                  >Department
                  @if (departments().length) {
                    <span class="req">*</span>
                  } @else {
                    <span class="opt">(optional)</span>
                  }
                </label>
                <div class="fld-in">
                  <select id="mn-dept" aria-describedby="mn-dept-e" (change)="pickDept($event)">
                    @if (!departments().length) {
                      <option value="">No departments</option>
                    }
                    @for (o of departments(); track o.id) {
                      <option [value]="o.id" [selected]="dept() === o.id">{{ o.name }}</option>
                    }
                  </select>
                </div>
                <div class="fld-e" id="mn-dept-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('dept') }}</span>
                </div>
              </div>
              <div class="fld" [class.invalid]="err('mobile')">
                <label class="fld-l" for="mn-mobile">Mobile<span class="req">*</span></label>
                <div class="fld-in">
                  <span class="pre">+91</span
                  ><input
                    id="mn-mobile"
                    name="mn-mobile"
                    type="text"
                    placeholder="10-digit mobile"
                    maxlength="10"
                    inputmode="numeric"
                    autocomplete="off"
                    aria-describedby="mn-mobile-e"
                    [value]="d().mobile"
                    (input)="set('mobile', $event)"
                  />
                </div>
                <div class="fld-e" id="mn-mobile-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('mobile') }}</span>
                </div>
              </div>
              <div class="fld" [class.invalid]="err('email')">
                <label class="fld-l" for="mn-email"
                  >E-mail<span class="opt">(optional)</span></label
                >
                <div class="fld-in">
                  <input
                    id="mn-email"
                    name="mn-email"
                    type="email"
                    placeholder="QR codes and statements are sent here"
                    maxlength="254"
                    autocomplete="off"
                    aria-describedby="mn-email-e"
                    [value]="d().email"
                    (input)="set('email', $event)"
                  />
                </div>
                <div class="fld-e" id="mn-email-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('email') }}</span>
                </div>
              </div>
              <div class="full" id="mn-acc">
                <span class="fld-l">Accepts</span>
                <div class="row g16 wrap" style="margin-top: 6px">
                  <label class="chk"
                    ><input type="checkbox" id="mn-a-w" checked disabled /><span
                      >Wallet payments</span
                    ></label
                  >
                  <label class="chk"
                    ><input
                      type="checkbox"
                      id="mn-a-a"
                      [checked]="d().allowance"
                      [disabled]="d().sub === 'VENDOR'"
                      (change)="tick('allowance', $event)"
                    /><span>Allowance</span></label
                  >
                  <label class="chk"
                    ><input
                      type="checkbox"
                      id="mn-a-c"
                      [checked]="d().coupon"
                      [disabled]="d().sub === 'VENDOR'"
                      (change)="tick('coupon', $event)"
                    /><span>Coupons</span></label
                  >
                </div>
                <div class="fld-h" id="mn-acc-h">
                  {{
                    d().sub === 'VENDOR'
                      ? "Vendors are paid only against an invoice and an approved asset — they can't accept allowances or coupons (BR-42)."
                      : 'Wallet payments are always on. Allowance and coupon codes are generated only if accepted.'
                  }}
                </div>
                @if (err('acc')) {
                  <div class="fld-e" role="alert" style="display: flex">
                    <rp-icon name="alertc" [size]="14" /><span>{{ err('acc') }}</span>
                  </div>
                }
              </div>
              <div class="full">
                <div class="fld" [class.invalid]="err('logo')">
                  <span class="fld-l">Logo<span class="opt">(optional)</span></span>
                  <label class="upl" [class.done]="d().logo" for="mn-logo"
                    ><span class="upl-ic"
                      ><rp-icon [name]="d().logo ? 'checkc' : 'upload'" [size]="20" /></span
                    ><span class="grow" style="min-width: 0"
                      ><span class="t-h4 t-clip" style="display: block">{{
                        d().logo?.name ?? 'Choose a file'
                      }}</span
                      ><span class="t-xs t-muted">{{
                        d().logo
                          ? size(d().logo!.size) + ' · ready to upload'
                          : 'PNG or JPG · up to 2 MB (CR-07)'
                      }}</span></span
                    ><input
                      type="file"
                      id="mn-logo"
                      accept="image/png,image/jpeg"
                      aria-describedby="mn-logo-e"
                      (change)="pick('logo', $event)"
                  /></label>
                  <div class="fld-e" id="mn-logo-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{ err('logo') }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="fs">
          <h4><rp-icon name="bank" [size]="16" /> Bank account for settlement</h4>
          <div class="fs-b">
            <div class="c-form">
              <div class="fld" [class.invalid]="err('acct')">
                <label class="fld-l" for="mn-acct">Account number<span class="req">*</span></label>
                <div class="fld-in">
                  <input
                    id="mn-acct"
                    name="mn-acct"
                    type="text"
                    placeholder="9–18 digits"
                    maxlength="18"
                    inputmode="numeric"
                    autocomplete="off"
                    aria-describedby="mn-acct-e"
                    [value]="d().acct"
                    (input)="set('acct', $event)"
                  />
                </div>
                <div class="fld-e" id="mn-acct-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('acct') }}</span>
                </div>
              </div>
              <div class="fld" [class.invalid]="err('acct2')">
                <label class="fld-l" for="mn-acct2"
                  >Confirm account number<span class="req">*</span></label
                >
                <div class="fld-in">
                  <input
                    id="mn-acct2"
                    name="mn-acct2"
                    type="text"
                    maxlength="18"
                    inputmode="numeric"
                    autocomplete="off"
                    aria-describedby="mn-acct2-e"
                    [value]="d().acct2"
                    (input)="set('acct2', $event)"
                  />
                </div>
                <div class="fld-e" id="mn-acct2-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('acct2') }}</span>
                </div>
              </div>
              <div class="fld" [class.invalid]="err('ifsc')">
                <label class="fld-l" for="mn-ifsc">IFSC<span class="req">*</span></label>
                <div class="fld-in">
                  <input
                    id="mn-ifsc"
                    name="mn-ifsc"
                    type="text"
                    placeholder="e.g. SBIN0001234"
                    maxlength="11"
                    autocomplete="off"
                    aria-describedby="mn-ifsc-e mn-bank"
                    [value]="d().ifsc"
                    (input)="set('ifsc', $event)"
                  />
                </div>
                <div class="fld-e" id="mn-ifsc-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('ifsc') }}</span>
                </div>
                <div class="fld-h">
                  <span id="mn-bank">
                    @if (d().ifsc.length < 4) {
                      The bank is looked up from the code.
                    } @else if (bank()) {
                      <rp-icon name="checkc" [size]="12" /> {{ bank() }}
                    } @else {
                      Bank not recognised from this code
                    }
                  </span>
                </div>
              </div>
              <div class="fld" [class.invalid]="err('holder')">
                <label class="fld-l" for="mn-holder"
                  >Account holder name<span class="req">*</span></label
                >
                <div class="fld-in">
                  <input
                    id="mn-holder"
                    name="mn-holder"
                    type="text"
                    placeholder="As printed on the cheque"
                    maxlength="120"
                    autocomplete="off"
                    aria-describedby="mn-holder-e"
                    [value]="d().holder"
                    (input)="set('holder', $event)"
                  />
                </div>
                <div class="fld-e" id="mn-holder-e" role="alert">
                  <rp-icon name="alertc" [size]="14" /><span>{{ err('holder') }}</span>
                </div>
              </div>
              <div class="full">
                <div class="fld" [class.invalid]="err('cheque')">
                  <span class="fld-l">Cancelled cheque<span class="req">*</span></span>
                  <label class="upl" [class.done]="d().cheque" for="mn-cheque"
                    ><span class="upl-ic"
                      ><rp-icon [name]="d().cheque ? 'checkc' : 'upload'" [size]="20" /></span
                    ><span class="grow" style="min-width: 0"
                      ><span class="t-h4 t-clip" style="display: block">{{
                        d().cheque?.name ?? 'Choose a file'
                      }}</span
                      ><span class="t-xs t-muted">{{
                        d().cheque
                          ? size(d().cheque!.size) + ' · ready to upload'
                          : 'PDF, JPG or PNG · up to 2 MB (CR-07)'
                      }}</span></span
                    ><input
                      type="file"
                      id="mn-cheque"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/png,image/jpeg"
                      aria-describedby="mn-cheque-e"
                      (change)="pick('cheque', $event)"
                  /></label>
                  <div class="fld-e" id="mn-cheque-e" role="alert">
                    <rp-icon name="alertc" [size]="14" /><span>{{ err('cheque') }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ng-container modal-foot>
        <button type="button" class="btn btn-sec" (click)="closed.emit()">
          <span>Cancel</span>
        </button>
        <button
          type="button"
          class="btn btn-pri"
          id="mn-ok"
          [class.is-busy]="busy()"
          [disabled]="busy()"
          (click)="submit()"
        >
          <rp-icon name="check" [size]="17" /><span>Register merchant</span>
        </button>
      </ng-container>
    </rp-modal>
  `,
})
export class MerchantRegister {
  private readonly api = inject(MerchantsApi);
  private readonly overlays = inject(Overlays);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The MERCHANT user type's departments (IDN-040). */
  readonly departments = input<readonly { id: string; name: string }[]>([]);
  /** Names already in use (the prototype checks before sending; the server checks again). */
  readonly names = input<readonly string[]>([]);
  readonly closed = output<void>();
  /** Registered (its codes generated straight after; one that failed is generated in the drawer). */
  readonly registered = output<{ merchantId: string; uniqueId: string; name: string }>();

  protected readonly subTypes: readonly {
    v: MerchantSubType;
    l: string;
    sub: string;
    icon: 'store' | 'truck';
  }[] = [
    {
      v: 'REGULAR',
      l: 'Regular',
      sub: 'Canteen, bookstore, mess — wallet, allowance and coupons',
      icon: 'store',
    },
    {
      v: 'VENDOR',
      l: 'Vendor',
      sub: 'External supplier paid against an invoice and asset',
      icon: 'truck',
    },
  ];

  protected readonly d = signal<Draft>({
    name: '',
    op: '',
    sub: 'REGULAR',
    dept: '',
    mobile: '',
    email: '',
    allowance: false,
    coupon: false,
    acct: '',
    acct2: '',
    ifsc: '',
    holder: '',
    cheque: null,
    logo: null,
  });
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  /** The chosen department, else the first one matching the sub-type (the prototype's "Canteen"). */
  protected readonly dept = computed(() => this.d().dept || this.defaultDept(this.d().sub));
  protected readonly bank = computed(() => IFSC_BANKS[this.d().ifsc.slice(0, 4)] ?? '');
  /** Files already uploaded for this registration (a retry does not upload them again). */
  private readonly uploaded = new Map<File, string>();

  private defaultDept(sub: MerchantSubType) {
    const list = this.departments();
    const vendors = list.find((x) => /vendor/i.test(x.name));
    if (sub === 'VENDOR') return (vendors ?? list[0])?.id ?? '';
    return (list.find((x) => x !== vendors) ?? list[0])?.id ?? '';
  }

  protected err(k: string) {
    return this.errors()[k] ?? '';
  }
  private clear(...keys: string[]) {
    const e = { ...this.errors() };
    for (const k of keys) delete e[k];
    this.errors.set(e);
  }

  protected set(k: TextKey, e: Event) {
    const el = e.target as HTMLInputElement;
    let v = el.value;
    if (DIGITS_ONLY.has(k)) v = v.replace(/\D/g, '');
    if (k === 'ifsc') v = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v !== el.value) el.value = v;
    this.d.update((x) => ({ ...x, [k]: v }));
    this.clear(k);
  }

  protected tick(k: 'allowance' | 'coupon', e: Event) {
    const on = (e.target as HTMLInputElement).checked;
    this.d.update((x) => ({ ...x, [k]: on }));
    this.clear('acc');
  }

  protected pickSub(v: MerchantSubType) {
    const x = this.d();
    if (x.sub === v) return;
    const list = this.departments();
    const vendors = list.find((o) => /vendor/i.test(o.name));
    let dept = this.dept();
    if (v === 'VENDOR') dept = this.defaultDept('VENDOR');
    else if (vendors && dept === vendors.id) dept = this.defaultDept('REGULAR');
    this.d.set({
      ...x,
      sub: v,
      dept,
      ...(v === 'VENDOR' ? { allowance: false, coupon: false } : {}),
    });
    this.clear('sub', 'acc', 'dept');
  }

  protected pickDept(e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    this.d.update((x) => ({ ...x, dept: v }));
    this.clear('dept');
  }

  protected pick(k: 'cheque' | 'logo', e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0] ?? null;
    const types = k === 'cheque' ? CHEQUE_TYPES : LOGO_TYPES;
    let error = '';
    if (file && !types.includes(file.type)) {
      error = translate('FILE.TYPE_NOT_ALLOWED', {
        types: k === 'cheque' ? 'PDF, PNG, JPEG' : 'PNG, JPEG',
      });
    } else if (file && file.size > MAX_FILE) {
      error = translate('FILE.TOO_LARGE', { limit: '2 MB' });
    }
    this.d.update((x) => ({ ...x, [k]: error ? null : file }));
    this.errors.set({ ...this.errors(), [k]: error });
  }

  protected size(b: number) {
    return fileSize(b);
  }

  /** The prototype's checks (cm.mer.new) with the register's wording; the server checks again. */
  private check(x: Draft) {
    const e: Record<string, string> = {};
    const required = translate('VALIDATION.REQUIRED');
    const name = x.name.trim().replace(/\s+/g, ' ');
    if (!name) e['name'] = required;
    else if (name.length < 3 || name.length > 40) e['name'] = 'Use 3–40 characters';
    else if (this.names().some((n) => n.toLowerCase() === name.toLowerCase())) {
      e['name'] = translate('MER.NAME_TAKEN');
    }
    const op = x.op.trim().replace(/\s+/g, ' ');
    if (!op) e['op'] = required;
    else if (!PATTERNS.personName.test(op)) e['op'] = translate('IDN.NAME_LETTERS_ONLY');
    if (this.departments().length && !this.dept()) e['dept'] = required;
    if (!x.mobile) e['mobile'] = required;
    else if (!PATTERNS.mobile.test(x.mobile)) e['mobile'] = translate('VALIDATION.MOBILE');
    const email = x.email.trim().toLowerCase();
    if (email && (!PATTERNS.email.test(email) || email.length > 254)) {
      e['email'] = translate('VALIDATION.EMAIL');
    }
    if (!x.acct) e['acct'] = required;
    else if (!/^\d{9,18}$/.test(x.acct)) e['acct'] = 'Account numbers have 9 to 18 digits';
    if (!x.acct2) e['acct2'] = required;
    else if (x.acct2 !== x.acct) e['acct2'] = translate('IDN.ACCOUNT_NUMBER_MISMATCH');
    if (!x.ifsc) e['ifsc'] = required;
    else if (!PATTERNS.ifsc.test(x.ifsc)) e['ifsc'] = translate('IDN.IFSC_INVALID');
    const holder = x.holder.trim().replace(/\s+/g, ' ');
    if (!holder) e['holder'] = required;
    else if (!PATTERNS.personName.test(holder)) e['holder'] = translate('IDN.NAME_LETTERS_ONLY');
    if (!x.cheque) e['cheque'] = required;
    return e;
  }

  /** Moves the focus to the first field in error (the prototype's RP.validate does the same). */
  private focusInvalid() {
    setTimeout(() =>
      this.host.nativeElement
        .querySelector<HTMLElement>(
          '.fld.invalid input:not([disabled]), .fld.invalid select, .fld.invalid textarea',
        )
        ?.focus(),
    );
  }

  private async fileId(purpose: 'document' | 'logo', file: File, field: string) {
    const known = this.uploaded.get(file);
    if (known) return known;
    try {
      const { fileId } = await this.api.upload(purpose, file);
      this.uploaded.set(file, fileId);
      return fileId;
    } catch (err) {
      this.errors.set({
        ...this.errors(),
        [field]: err instanceof ApiProblem ? err.detail : translate('GEN.UNAVAILABLE'),
      });
      return null;
    }
  }

  protected async submit() {
    if (this.busy()) return;
    const x = this.d();
    const e = this.check(x);
    if (Object.keys(e).length) {
      this.errors.set(e);
      this.focusInvalid();
      return;
    }
    const name = x.name.trim().replace(/\s+/g, ' ');
    const kinds: QrKind[] = [
      'PAYMENT',
      ...(x.sub === 'REGULAR' && x.allowance ? (['ALLOWANCE'] as const) : []),
      ...(x.sub === 'REGULAR' && x.coupon ? (['COUPON'] as const) : []),
    ];
    const ok = await this.overlays.confirm({
      title: `Register ${name}?`,
      text: `${x.sub === 'VENDOR' ? 'Vendor' : 'Regular'} merchant. We'll create the profile and wallet and generate ${kinds.length} static QR code${kinds.length === 1 ? '' : 's'} — codes can't be regenerated later.`,
      ok: 'Register merchant',
      icon: 'store',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      const cheque = await this.fileId('document', x.cheque!, 'cheque');
      if (!cheque) return;
      const logo = x.logo ? await this.fileId('logo', x.logo, 'logo') : null;
      if (x.logo && !logo) return;
      const op = x.op.trim().replace(/\s+/g, ' ');
      const cut = op.indexOf(' ');
      const body: MerchantInput = {
        displayName: name,
        operatorFirstName: cut > 0 ? op.slice(0, cut) : op,
        operatorLastName: cut > 0 ? op.slice(cut + 1) : null,
        subType: x.sub,
        departmentId: this.dept() || null,
        mobile: x.mobile,
        email: x.email.trim().toLowerCase() || null,
        acceptsAllowance: x.sub === 'REGULAR' && x.allowance,
        acceptsCoupon: x.sub === 'REGULAR' && x.coupon,
        bank: {
          holderName: x.holder.trim().replace(/\s+/g, ' '),
          bankName: this.bank() || null,
          accountNumber: x.acct,
          ifsc: x.ifsc,
        },
        chequeFileId: cheque,
        logoFileId: logo,
      };
      const r = await this.api.create(body);
      // The static codes the merchant accepts, generated once; a code that fails here is
      // generated later from the drawer.
      for (const kind of kinds) {
        try {
          await this.api.generateQr(r.merchantId, kind);
        } catch {
          // Shown as "Not generated yet" in the drawer.
        }
      }
      this.registered.emit({ merchantId: r.merchantId, uniqueId: r.uniqueId, name });
    } catch (err) {
      if (err instanceof ApiProblem && err.errors.length) {
        this.errors.set(
          Object.fromEntries(err.errors.map((f) => [FIELD[f.field] ?? 'name', f.message])),
        );
        this.focusInvalid();
      } else {
        this.overlays.toast('Not registered', {
          sub: err instanceof ApiProblem ? err.detail : translate('GEN.UNAVAILABLE'),
          tone: 'bad',
        });
      }
    } finally {
      this.busy.set(false);
    }
  }
}
