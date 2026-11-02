import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SessionContext } from '../../../../Context/SessionContext';
import { Avatar } from '../../../Shared/Avatar';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Dropdown } from '../../../Shared/Dropdown';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import type { IconName } from '../../../Utils/icons';
import { PATTERNS } from '../../../Utils/patterns';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { cleanTyped, onlyDigits, phoneText } from '../../../Utils/typing';
import type { ChannelRow, FeatureRow } from '../../Backoffice/Institutions/institutions.api';
import {
  InstitutionSetupApi,
  type ConsoleInstitutionView,
  type ConsoleInstitutionUpdate,
} from './institution.api';

interface Form {
  name: string;
  address: string;
  city: string;
  pin: string;
  phone: string;
  email: string;
  board: string;
  short: string;
  pn: string;
  pe: string;
  pp: string;
  sn: string;
  se: string;
  sp: string;
  cons: string;
}

const MAX_LOGO = 2 * 1024 * 1024;

const EMPTY: Form = {
  name: '',
  address: '',
  city: '',
  pin: '',
  phone: '',
  email: '',
  board: '',
  short: '',
  pn: '',
  pe: '',
  pp: '',
  sn: '',
  se: '',
  sp: '',
  cons: '',
};

const formOf = (i: ConsoleInstitutionView): Form => ({
  name: i.name,
  address: i.address,
  city: i.city,
  pin: i.pinCode ?? '',
  phone: i.officePhone ?? '',
  email: i.officeEmail ?? '',
  board: i.board ?? '',
  short: i.shortName,
  pn: i.contacts.primary?.name ?? '',
  pe: i.contacts.primary?.email ?? '',
  pp: i.contacts.primary?.mobile ?? '',
  sn: i.contacts.secondary?.name ?? '',
  se: i.contacts.secondary?.email ?? '',
  sp: i.contacts.secondary?.mobile ?? '',
  cons: String(i.consentValidityMonths),
});

const fmtSize = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/**
 * c.institution — Institution & features (SRS 7.2, 7.5; FR-INS-03/04/06; INS-010…013; prototype
 * c.institution): details, contacts, fee account and banking, logo, the features CampusOne switched
 * on (read-only here, OI-ONB-08) and the notification channels the plan allows. One "Save changes"
 * lists what changes and asks to confirm.
 */
@Component({
  selector: 'rp-console-institution',
  imports: [Avatar, Dropdown, Empty, Icon, PageHead],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head
        title="Institution & features"
        sub="Your institution's details, contacts, fee account and the features members can use."
      >
        @if (readOnly()) {
          <span class="cp-why" [attr.title]="readOnly()"
            ><button type="button" class="btn btn-pri" disabled>
              <rp-icon name="check" [size]="17" /><span>Save changes</span>
            </button></span
          >
        } @else {
          <button type="button" class="btn btn-pri" [class.is-busy]="busy()" (click)="save()">
            <rp-icon name="check" [size]="17" /><span>Save changes</span>
          </button>
        }
      </rp-page-head>
      @if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the institution" [text]="error()" />
        </div>
      } @else if (inst(); as i) {
        @if (readOnly()) {
          <div class="note tone-info">
            <rp-icon name="lock" [size]="17" />
            <div class="grow"><b>Read-only.</b> {{ readOnly() }}</div>
          </div>
        }
        <div class="c-grid s21 cp-inst" id="cp-inf">
          <div class="stack g16">
            <div class="fs">
              <h4><rp-icon name="building" [size]="15" /> Details</h4>
              <div class="fs-b">
                <div class="c-form">
                  @for (f of detailFields; track f.k) {
                    <div class="fld" [class.full]="f.full" [class.invalid]="err(f.k)">
                      <label class="fld-l" [for]="'cp-in-' + f.k"
                        >{{ f.l }}
                        @if (f.req) {
                          <span class="req">*</span>
                        }
                      </label>
                      <div class="fld-in">
                        <input
                          [id]="'cp-in-' + f.k"
                          [type]="f.k === 'email' ? 'email' : 'text'"
                          [attr.inputmode]="
                            f.k === 'pin' ? 'numeric' : f.k === 'phone' ? 'tel' : null
                          "
                          [attr.maxlength]="f.max"
                          [disabled]="!!readOnly()"
                          [value]="form()[f.k]"
                          (input)="set(f.k, $event)"
                        />
                      </div>
                      <div class="fld-e" role="alert">
                        <rp-icon name="alertc" [size]="14" /><span>{{ err(f.k) }}</span>
                      </div>
                      @if (f.hint) {
                        <div class="fld-h">{{ f.hint }}</div>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>
            <div class="fs">
              <h4><rp-icon name="users" [size]="15" /> Contacts</h4>
              <div class="fs-b stack g16">
                @for (c of contactKinds; track c.title) {
                  <div>
                    <div class="eyebrow" style="margin-bottom: 8px">{{ c.title }}</div>
                    <div class="c-form c3">
                      @for (f of c.fields; track f.k) {
                        <div class="fld" [class.invalid]="err(f.k)">
                          <label class="fld-l" [for]="'cp-in-' + f.k"
                            >{{ f.l }}
                            @if (c.req) {
                              <span class="req">*</span>
                            }
                          </label>
                          <div class="fld-in">
                            <input
                              [id]="'cp-in-' + f.k"
                              [type]="f.l === 'E-mail' ? 'email' : 'text'"
                              [attr.inputmode]="f.l === 'Mobile' ? 'numeric' : null"
                              [attr.maxlength]="f.l === 'Mobile' ? 10 : null"
                              [disabled]="!!readOnly()"
                              [value]="form()[f.k]"
                              (input)="set(f.k, $event)"
                            />
                          </div>
                          <div class="fld-e" role="alert">
                            <rp-icon name="alertc" [size]="14" /><span>{{ err(f.k) }}</span>
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                }
                <p class="t-xs t-muted">
                  The primary contact receives settlement approvals and lifecycle notices
                  (FR-SET-06, FR-SAS-11).
                </p>
              </div>
            </div>
            <div class="fs">
              <h4><rp-icon name="bank" [size]="15" /> Fee account and banking</h4>
              <div class="fs-b">
                <div class="c-form">
                  <div class="fld">
                    <label class="fld-l" for="cp-in-fee-b"
                      >Fee account<span class="req">*</span></label
                    >
                    <rp-dd
                      inputId="cp-in-fee"
                      [options]="feeOptions()"
                      [value]="i.feeAccount?.id ?? ''"
                      [placeholder]="i.feeAccount?.name ?? 'No merchant profile yet'"
                      [disabled]="!!readOnly() || !feeOptions().length"
                      (changed)="setFee($event)"
                    />
                    <div class="fld-e" id="cp-in-fee-e" role="alert">
                      <rp-icon name="alertc" [size]="14" /><span></span>
                    </div>
                    <div class="fld-h">
                      The merchant profile that receives tuition and other institutional fees
                      (FR-INS-06)
                    </div>
                  </div>
                  <div class="fld" [class.invalid]="err('cons')">
                    <label class="fld-l" for="cp-in-cons">Fee consent valid for</label>
                    <div class="fld-in">
                      <input
                        id="cp-in-cons"
                        inputmode="numeric"
                        maxlength="2"
                        [disabled]="!!readOnly()"
                        [value]="form().cons"
                        (input)="set('cons', $event)"
                      /><span class="suf">months</span>
                    </div>
                    <div class="fld-e" role="alert">
                      <rp-icon name="alertc" [size]="14" /><span>{{ err('cons') }}</span>
                    </div>
                  </div>
                  <div class="fld locked">
                    <label class="fld-l" for="cp-in-code">Virtual-account corporate code</label>
                    <div class="fld-in">
                      <input id="cp-in-code" readonly [value]="i.corporateCode ?? ''" /><span
                        class="suf plain"
                        ><rp-icon name="lock" [size]="15"
                      /></span>
                    </div>
                    <div class="fld-h">
                      Set by CampusOne with the sponsor bank; prefixes every wallet's virtual account
                      (OQ-28).
                    </div>
                  </div>
                  <div class="fld locked">
                    <label class="fld-l" for="cp-in-ifsc">Sponsor bank IFSC</label>
                    <div class="fld-in">
                      <input
                        id="cp-in-ifsc"
                        readonly
                        value=""
                        placeholder="Set when the sponsor bank is chosen"
                      /><span class="suf plain"><rp-icon name="lock" [size]="15" /></span>
                    </div>
                  </div>
                  <div class="fld locked full">
                    <label class="fld-l" for="cp-in-id">Institution ID</label>
                    <div class="fld-in">
                      <input id="cp-in-id" readonly [value]="i.identifier" /><span class="suf plain"
                        ><rp-icon name="lock" [size]="15"
                      /></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="stack g16">
            <div class="fs">
              <h4><rp-icon name="image" [size]="15" /> Logo</h4>
              <div class="fs-b stack g12">
                <div class="row g12">
                  <rp-av
                    [name]="i.shortName"
                    [text]="i.shortName.slice(0, 2)"
                    [sq]="true"
                    [px]="56"
                    color="#0C6F7D"
                  />
                  <div class="t-sm t-muted" style="line-height: 1.45">
                    @if (i.logo; as l) {
                      <b style="color: var(--ink)">{{ l.name }}</b> · {{ size(l.sizeBytes) }}<br />
                    }
                    Shown on receipts, the app and the admission form.
                  </div>
                </div>
                @if (!readOnly()) {
                  <div class="fld" [class.invalid]="err('logo')">
                    <span class="fld-l">Replace logo<span class="opt">(optional)</span></span>
                    <label class="upl" [class.done]="logo()" for="cp-in-logo"
                      ><span class="upl-ic"
                        ><rp-icon [name]="logo() ? 'checkc' : 'upload'" [size]="20" /></span
                      ><span class="grow" style="min-width: 0"
                        ><span class="t-h4 t-clip" style="display: block">{{
                          logo()?.name ?? 'Choose a file'
                        }}</span
                        ><span class="t-xs t-muted">{{
                          logo()
                            ? size(logo()!.size) + ' · ready to save'
                            : 'PNG or JPG · square · up to 2 MB'
                        }}</span></span
                      ><input
                        type="file"
                        id="cp-in-logo"
                        accept="image/png,image/jpeg"
                        (change)="pickLogo($event)"
                    /></label>
                    <div class="fld-e" role="alert">
                      <rp-icon name="alertc" [size]="14" /><span>{{ err('logo') }}</span>
                    </div>
                  </div>
                }
              </div>
            </div>
            <div class="fs">
              <h4>
                <rp-icon name="toggle" [size]="15" /> Features <span class="grow"></span
                ><span class="chip tone-brand">{{ i.plan?.name ?? 'No' }} plan</span>
              </h4>
              <div class="fs-b cp-tg">
                @for (f of consoleOrder(i.features); track f.key) {
                  <div class="li" style="min-height: 52px">
                    <span class="li-ic sm"><rp-icon [name]="icon(f.icon)" [size]="16" /></span>
                    <span class="li-main"
                      ><span class="li-t wrap"
                        >{{ f.consoleLabel }}
                        @if (f.lock?.kind === 'PLAN') {
                          <span class="chip tone-neutral"
                            ><rp-icon name="lock" [size]="12" />Not in plan</span
                          >
                        }</span
                      ><span class="li-s wrap">{{ f.consoleSub }}</span></span
                    >
                    <button
                      type="button"
                      class="toggle"
                      role="switch"
                      [attr.aria-checked]="featureOn(f)"
                      [attr.aria-label]="f.consoleLabel"
                      [attr.title]="featureLock(f)"
                      [disabled]="!!readOnly() || !!featureLock(f)"
                      (click)="flipFeature(f)"
                    ></button>
                  </div>
                }
                <p class="t-xs t-muted" style="padding: 10px 4px 0">
                  Switched-off features disappear from menus and their operations are refused.
                  Features are limited to what your plan includes (FR-SAS-05).
                </p>
              </div>
            </div>
            <div class="fs">
              <h4><rp-icon name="bell" [size]="15" /> Notification channels</h4>
              <div class="fs-b cp-tg">
                @for (c of i.channels; track c.key) {
                  <div class="cp-chrow">
                    <div class="li" style="min-height: 52px">
                      <span class="li-ic sm"><rp-icon [name]="icon(c.icon)" [size]="16" /></span>
                      <span class="li-main"
                        ><span class="li-t wrap"
                          >{{ c.label }}
                          @if (c.lock?.kind === 'PLAN') {
                            <span class="chip tone-neutral"
                              ><rp-icon name="lock" [size]="12" />Not in plan</span
                            >
                          }</span
                        ><span class="li-s wrap">{{ channelSub(c, i) }}</span></span
                      >
                      <button
                        type="button"
                        class="toggle"
                        role="switch"
                        [attr.aria-checked]="channelOn(c)"
                        [attr.aria-label]="c.label"
                        [disabled]="!!readOnly() || !!c.lock"
                        (click)="flip(c)"
                      ></button>
                    </div>
                  </div>
                }
              </div>
            </div>
            <div class="row end">
              @if (readOnly()) {
                <span class="cp-why" [attr.title]="readOnly()"
                  ><button type="button" class="btn btn-pri" disabled>
                    <rp-icon name="check" [size]="17" /><span>Save changes</span>
                  </button></span
                >
              } @else {
                <button type="button" class="btn btn-pri" [class.is-busy]="busy()" (click)="save()">
                  <rp-icon name="check" [size]="17" /><span>Save changes</span>
                </button>
              }
            </div>
          </div>
        </div>
      } @else {
        <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
      }
    </div>
  `,
})
export class ConsoleInstitution {
  private readonly api = inject(InstitutionSetupApi);
  private readonly overlays = inject(Overlays);
  private readonly session = inject(SessionContext).console;

  protected readonly detailFields = [
    { k: 'name', l: 'Institution name', req: true, full: true, max: 80, hint: '' },
    {
      k: 'address',
      l: 'Address',
      req: true,
      full: true,
      max: 200,
      hint: 'Name and address together must be unique on CampusOne (FR-INS-01).',
    },
    { k: 'city', l: 'City', req: true, full: false, max: 80, hint: '' },
    { k: 'pin', l: 'PIN code', req: true, full: false, max: 6, hint: '' },
    { k: 'phone', l: 'Office phone', req: false, full: false, max: 15, hint: '' },
    { k: 'email', l: 'Office e-mail', req: true, full: false, max: 254, hint: '' },
    { k: 'board', l: 'Board', req: false, full: false, max: 40, hint: '' },
    {
      k: 'short',
      l: 'Short name',
      req: false,
      full: false,
      max: 6,
      hint: 'Shown on cards and receipts',
    },
  ] as const;
  protected readonly contactKinds = [
    {
      title: 'Primary contact',
      req: true,
      fields: [
        { k: 'pn', l: 'Name' },
        { k: 'pe', l: 'E-mail' },
        { k: 'pp', l: 'Mobile' },
      ],
    },
    {
      title: 'Secondary contact',
      req: false,
      fields: [
        { k: 'sn', l: 'Name' },
        { k: 'se', l: 'E-mail' },
        { k: 'sp', l: 'Mobile' },
      ],
    },
  ] as const;

  protected readonly error = signal('');
  protected readonly inst = signal<ConsoleInstitutionView | null>(null);
  protected readonly form = signal<Form>(EMPTY);
  protected readonly channels = signal<Record<string, boolean>>({});
  protected readonly features = signal<Record<string, boolean>>({});
  protected readonly logo = signal<File | null>(null);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly busy = signal(false);
  /** Merchant profiles arrive with members (2.5); until then the list is empty. */
  protected readonly feeOptions = signal<readonly { v: string; l: string; sub?: string }[]>([]);
  protected readonly readOnly = computed(() => {
    const s = this.session();
    if (!s) return '';
    if (s.roles.some((r) => r.readOnly)) {
      return 'Management has read-only access. Ask the institution administrator to make this change.';
    }
    return s.subTasks.includes('config.edit') ? '' : "Your role doesn't include this task.";
  });

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      this.apply(await this.api.institution());
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  private apply(i: ConsoleInstitutionView) {
    this.inst.set(i);
    this.form.set(formOf(i));
    this.channels.set(Object.fromEntries(i.channels.map((c) => [c.key, c.enabled])));
    this.features.set(Object.fromEntries(i.features.map((f) => [f.key, f.enabled])));
    this.logo.set(null);
    this.errors.set({});
  }

  /** The console lists features in the prototype's order (c.institution FEATURES). */
  protected consoleOrder(list: ConsoleInstitutionView['features']) {
    const order = [
      'tuition',
      'feeConsent',
      'coupons',
      'allowances',
      'nfc',
      'transfers',
      'events',
      'attendance',
      'transport',
      'quiz',
    ];
    return [...list].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }

  protected icon(name: string) {
    return name as IconName;
  }
  protected size(b: number) {
    return fmtSize(b);
  }
  protected err(k: string) {
    return this.errors()[k] ?? '';
  }
  protected set(k: keyof Form, e: Event) {
    const f = this.form();
    if (!f) return;
    // Contact numbers take numbers only (client 2026-10-14): the mobiles digits, the office phone
    // digits after an optional "+" country code.
    const el = e.target as HTMLInputElement;
    const v =
      k === 'pp' || k === 'sp'
        ? cleanTyped(el, onlyDigits)
        : k === 'phone'
          ? cleanTyped(el, phoneText)
          : el.value;
    this.form.set({ ...f, [k]: v });
    if (this.errors()[k]) {
      const next = { ...this.errors() };
      delete next[k];
      this.errors.set(next);
    }
  }
  protected featureOn(f: FeatureRow) {
    return this.features()[f.key] ?? f.enabled;
  }
  /** Why a feature can't be switched here: not in the plan, or it needs another feature. */
  protected featureLock(f: FeatureRow) {
    if (f.lock?.kind === 'PLAN') return f.lock.text;
    if (f.key === 'feeConsent' && !this.features()['tuition'])
      return 'Needs tuition-fee collection';
    return null;
  }
  protected flipFeature(f: FeatureRow) {
    const on = !this.featureOn(f);
    // Switching tuition off also switches off the fee consent that needs it (prototype o.features).
    const next = { ...this.features(), [f.key]: on };
    if (f.key === 'tuition' && !on) next['feeConsent'] = false;
    this.features.set(next);
  }
  protected channelOn(c: ChannelRow) {
    return c.key === 'IN_APP' || (this.channels()[c.key] ?? c.enabled);
  }
  protected flip(c: ChannelRow) {
    this.channels.set({ ...this.channels(), [c.key]: !this.channelOn(c) });
  }
  protected channelSub(c: ChannelRow, i: ConsoleInstitutionView) {
    if (c.lock?.kind === 'PLAN') {
      return `${c.consoleSub}. ${c.label} isn't included in ${i.plan?.name ?? 'your plan'}. Request the messaging add-on from Plan & billing.`;
    }
    return c.lock?.kind === 'ALWAYS_ON' ? `${c.consoleSub}. ${c.lock.text}` : c.consoleSub;
  }

  protected pickLogo(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0] ?? null;
    const next = { ...this.errors() };
    delete next['logo'];
    if (file && !['image/png', 'image/jpeg'].includes(file.type)) {
      next['logo'] = translate('FILE.TYPE_NOT_ALLOWED', { types: 'PNG, JPEG' });
      this.logo.set(null);
    } else if (file && file.size > MAX_LOGO) {
      next['logo'] = translate('FILE.TOO_LARGE', { limit: '2 MB' });
      this.logo.set(null);
    } else {
      this.logo.set(file);
    }
    this.errors.set(next);
  }

  protected async setFee(merchantId: string) {
    const i = this.inst();
    if (!i) return;
    try {
      this.apply(await this.api.feeAccount(i.version, merchantId));
      this.overlays.toast('Fee account designated');
    } catch (e) {
      this.overlays.toast('Not saved', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
  }

  private validate(f: Form) {
    const e: Record<string, string> = {};
    const t = (v: string) => v.trim();
    const req = (k: keyof Form) => !t(f[k]) && (e[k] = translate('VALIDATION.REQUIRED'));
    const text = PATTERNS.institutionText;
    const email = (v: string) => PATTERNS.email.test(t(v).toLowerCase());
    const nameRule = PATTERNS.institutionName;
    if (!req('name') && (!nameRule.test(t(f.name)) || t(f.name).length < 3)) {
      e['name'] = translate('INS.NAME_FORMAT');
    }
    if (!req('address') && !nameRule.test(t(f.address))) {
      e['address'] = translate('INS.ADDRESS_FORMAT');
    }
    if (!req('city') && !/^[A-Za-z][A-Za-z .'-]*$/.test(t(f.city))) {
      e['city'] = translate('VALIDATION.FORMAT');
    }
    if (!req('pin') && !PATTERNS.postalCode.test(t(f.pin)))
      e['pin'] = translate('VALIDATION.PIN_CODE');
    if (!req('email') && !email(f.email)) e['email'] = translate('VALIDATION.EMAIL');
    if (t(f.phone) && !/^[0-9+ -]{6,15}$/.test(t(f.phone)))
      e['phone'] = translate('VALIDATION.FORMAT');
    if (!/^[A-Z0-9]{2,6}$/.test(t(f.short))) e['short'] = translate('VALIDATION.FORMAT');
    if (!req('pn') && !text.test(t(f.pn))) e['pn'] = translate('INS.PRIMARY_NAME_FORMAT');
    if (!req('pe') && !email(f.pe)) e['pe'] = translate('INS.PRIMARY_EMAIL_FORMAT');
    if (!req('pp') && !PATTERNS.mobile.test(t(f.pp)))
      e['pp'] = translate('INS.PRIMARY_PHONE_FORMAT');
    if (t(f.sn) || t(f.se) || t(f.sp)) {
      if (!t(f.sn)) e['sn'] = translate('VALIDATION.REQUIRED');
      else if (!text.test(t(f.sn))) e['sn'] = translate('INS.SECONDARY_NAME_FORMAT');
      if (!email(f.se)) e['se'] = translate('INS.SECONDARY_EMAIL_FORMAT');
      if (!PATTERNS.mobile.test(t(f.sp))) e['sp'] = translate('INS.SECONDARY_PHONE_FORMAT');
    }
    const months = Number(t(f.cons));
    if (!t(f.cons)) e['cons'] = translate('VALIDATION.REQUIRED');
    else if (!Number.isInteger(months) || months < 1 || months > 12) {
      e['cons'] = translate('VALIDATION.RANGE', { min: 1, max: 12 });
    }
    return e;
  }

  protected async save() {
    const i = this.inst();
    const f = this.form();
    if (!i || !f || this.busy() || this.readOnly()) return;
    const errors = this.validate(f);
    this.errors.set(errors);
    if (Object.keys(errors).length) return;

    const was = formOf(i);
    const body: { -readonly [K in keyof ConsoleInstitutionUpdate]: ConsoleInstitutionUpdate[K] } =
      {};
    const changes: string[] = [];
    const t = (v: string) => v.trim();
    const field = <K extends keyof Form>(k: K, label: string, put: () => void) => {
      if (t(f[k]) !== t(was[k])) {
        changes.push(label);
        put();
      }
    };
    field('name', 'name', () => (body.name = t(f.name)));
    field('address', 'address', () => (body.address = t(f.address)));
    field('city', 'city', () => (body.city = t(f.city)));
    field('pin', 'PIN code', () => (body.pinCode = t(f.pin)));
    field('email', 'office e-mail', () => (body.officeEmail = t(f.email)));
    field('short', 'short name', () => (body.shortName = t(f.short)));
    field('phone', 'office phone', () => (body.officePhone = t(f.phone) || null));
    field('board', 'board', () => (body.board = t(f.board) || null));
    if (t(f.pn) !== t(was.pn) || t(f.pe) !== t(was.pe) || t(f.pp) !== t(was.pp)) {
      changes.push('primary contact');
      body.primaryContact = { name: t(f.pn), email: t(f.pe), mobile: t(f.pp) };
    }
    if (t(f.sn) !== t(was.sn) || t(f.se) !== t(was.se) || t(f.sp) !== t(was.sp)) {
      changes.push('secondary contact');
      body.secondaryContact = t(f.sn) ? { name: t(f.sn), email: t(f.se), mobile: t(f.sp) } : null;
    }
    field('cons', 'consent validity', () => (body.consentValidityMonths = Number(t(f.cons))));
    const channelChanges: string[] = [];
    const channels: Partial<Record<'EMAIL' | 'SMS' | 'WHATSAPP', boolean>> = {};
    for (const c of i.channels) {
      if (c.key === 'IN_APP' || c.lock) continue;
      const on = this.channelOn(c);
      if (on !== c.enabled) {
        channels[c.key] = on;
        channelChanges.push(`${c.label} ${on ? 'on' : 'off'}`);
      }
    }
    if (channelChanges.length) body.channels = channels;
    const featureChanges: string[] = [];
    const features: Record<string, boolean> = {};
    for (const x of this.consoleOrder(i.features)) {
      const on = this.featureOn(x);
      if (on !== x.enabled && x.lock?.kind !== 'PLAN') {
        features[x.key] = on;
        featureChanges.push(`${x.consoleLabel} ${on ? 'on' : 'off'}`);
      }
    }
    if (featureChanges.length) body.features = features;
    const off = featureChanges.filter((x) => x.endsWith(' off'));
    const logo = this.logo();
    const all = [...changes, ...(logo ? ['logo'] : []), ...featureChanges, ...channelChanges];
    if (!all.length) {
      this.overlays.toast('No changes to save', { tone: 'info' });
      return;
    }
    const ok = await this.overlays.confirm({
      title: 'Save institution settings?',
      text: `You're changing: ${all.join(', ')}.${off.length ? " Switched-off features disappear from every member's app straight away and their operations are refused." : ''}`,
      ok: 'Save settings',
      tone: off.length ? 'warn' : 'brand',
    });
    if (!ok) return;
    this.busy.set(true);
    try {
      let next = i;
      if (Object.keys(body).length) next = await this.api.update(i.version, body);
      if (logo) next = await this.api.uploadLogo(logo);
      this.apply(next);
      this.overlays.toast('Settings saved', { sub: all.join(', ') });
    } catch (e) {
      if (e instanceof ApiProblem) {
        const map: Record<string, string> = {
          name: 'name',
          address: 'address',
          city: 'city',
          pinCode: 'pin',
          officeEmail: 'email',
          officePhone: 'phone',
          shortName: 'short',
          'primaryContact.name': 'pn',
          'primaryContact.email': 'pe',
          'primaryContact.mobile': 'pp',
          'secondaryContact.name': 'sn',
          'secondaryContact.email': 'se',
          'secondaryContact.mobile': 'sp',
          consentValidityMonths: 'cons',
        };
        const fe: Record<string, string> = {};
        for (const x of e.errors) {
          const k = map[x.field];
          if (k) fe[k] = x.message;
        }
        if (e.code === 'INS.NAME_ADDRESS_TAKEN') fe['address'] = e.detail;
        this.errors.set(fe);
        if (!Object.keys(fe).length) {
          this.overlays.toast('Not saved', { sub: e.detail, tone: 'bad' });
        }
        if (e.status === 412) await this.load();
      } else {
        this.overlays.toast('Not saved', { sub: translate('GEN.UNAVAILABLE'), tone: 'bad' });
      }
    } finally {
      this.busy.set(false);
    }
  }
}
