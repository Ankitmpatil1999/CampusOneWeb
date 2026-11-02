/**
 * Shared pieces of the customer portal (prototype 60_s_portal.js `SP.*`): the module and checklist
 * texts, money and status helpers, and the small blocks every portal page draws — the plan card
 * (SP.planCard), the progress ring (ui.ring), the field (ui.field), the code boxes, the "working"
 * overlay (RP.process) and the terms sheet (sp.terms). They emit the prototype's markup so its
 * stylesheet (`sp-*`) applies unchanged.
 */
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  type WritableSignal,
  afterNextRender,
  computed,
  input,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import type { PortalInstitutionStatus } from '../../../../Context/PortalContext';
import { Icon } from '../../../Shared/Icon';
import { Mark } from '../../../Shared/Mark';
import { Modal } from '../../../Shared/Overlays';
import { formatInr } from '../../../Utils/format';
import type { IconName } from '../../../Utils/icons';
import { parseAmount } from '../../../Utils/money';
import type { Money, Onboarding, PortalPlan, StepKey } from '../portal.api';

// --- texts ------------------------------------------------------------------------------------------

/** The plan modules in the prototype's order (MODULES; FR-SAS-05). */
export const MODULES = [
  'Academics',
  'Attendance',
  'Transport',
  'Communication',
  'Fees',
  'Wallet and payments',
  'Coupons',
  'Allowances',
  'Events',
  'Point of sale',
] as const;

/** SP.MOD_INFO */
export const MOD_INFO: Readonly<Record<string, { icon: IconName; t: string }>> = {
  Academics: { icon: 'grad', t: 'Classes, timetables, homework, exams and marks for every year.' },
  Attendance: {
    icon: 'calcheck',
    t: 'Card readers at the gate and in classrooms, plus period and manual registers.',
  },
  Transport: { icon: 'bus', t: 'Routes, live trips and stop-by-stop alerts for parents.' },
  Communication: {
    icon: 'megaphone',
    t: 'Announcements by class and channel, with acknowledgements and a full log.',
  },
  Fees: {
    icon: 'receipt',
    t: 'Fee structures, instalments, consent and automatic collection from the wallet.',
  },
  'Wallet and payments': {
    icon: 'wallet',
    t: 'A campus wallet for every member, topped up by bank transfer; QR and card payments.',
  },
  Coupons: { icon: 'ticket', t: 'Meal and other coupons with time windows, redeemed at readers.' },
  Allowances: { icon: 'gift', t: 'A restricted allowance parents fund for specific spending.' },
  Events: { icon: 'flag', t: 'Paid events with passes checked at the gate.' },
  'Point of sale': { icon: 'store', t: 'Menus, orders and card collection at canteen counters.' },
};

/** The checklist steps as the portal names them (STEP in 61_s_account.js). */
export const STEP: Readonly<Record<StepKey, { t: string; d: string; icon: IconName }>> = {
  details: {
    t: 'Institution details and administrator',
    d: 'Name, address, contacts and your first administrator — done when you signed up.',
    icon: 'building',
  },
  plan: {
    t: 'Plan',
    d: "The plan you'll start on, and whether you begin with a trial.",
    icon: 'layers',
  },
  bank: {
    t: 'Bank collection account',
    d: "CampusOne and our sponsor bank set up the corporate code that prefixes every member's virtual account, and your pool account.",
    icon: 'bank',
  },
  toggles: {
    t: 'Features',
    d: "Switch on the features you'll use. Your plan decides what's available.",
    icon: 'toggle',
  },
  usertypes: {
    t: 'User types and departments',
    d: 'The kinds of people at your institution, each with at least one department.',
    icon: 'users',
  },
  year: {
    t: 'Academic year',
    d: 'The year every listing, report and record is filed under.',
    icon: 'calendar',
  },
  feeacct: {
    t: 'Fee account',
    d: 'The merchant profile that receives tuition and other fees, and the bank account it settles to.',
    icon: 'receipt',
  },
  branding: {
    t: 'Logo and branding',
    d: 'Your crest and colour on the member app, receipts and sign-in pages.',
    icon: 'image',
  },
  firstusers: {
    t: 'First users',
    d: 'Import students, parents and staff from a spreadsheet so they can sign in on day one.',
    icon: 'userplus',
  },
};

/** The checklist (CHECKLIST register order; SRS references as the prototype shows them). */
export const CHECKLIST: readonly { k: StepKey; req: boolean; ref: string }[] = [
  { k: 'details', req: true, ref: 'FR-INS-01' },
  { k: 'plan', req: true, ref: 'FR-SAS-06' },
  { k: 'bank', req: true, ref: 'FR-WAL-03' },
  { k: 'toggles', req: true, ref: 'FR-INS-04' },
  { k: 'usertypes', req: true, ref: 'FR-INS-03' },
  { k: 'year', req: true, ref: 'FR-ACA-01' },
  { k: 'feeacct', req: true, ref: 'FR-INS-06' },
  { k: 'branding', req: false, ref: 'FR-INS-03' },
  { k: 'firstusers', req: false, ref: 'FR-IDN-15' },
];

export const BOARDS = ['CBSE', 'ICSE', 'State', 'State PU', 'IB', 'Other'] as const;

/** SP.nextStep: the first required step still open on the institution's side, then optional. */
export function nextStep(o: Onboarding): StepKey | null {
  const open = (req: boolean | null) =>
    CHECKLIST.find(
      (c) =>
        c.k !== 'bank' &&
        (req === null || c.req === req) &&
        !o.steps.find((s) => s.key === c.k)?.done,
    );
  return (open(true) ?? open(null))?.k ?? null;
}

// --- money -----------------------------------------------------------------------------------------

/** Paise of an API amount ("0.00" allowed: a trial invoice). */
export const paiseOf = (m: Money | null | undefined): number =>
  m ? parseAmount(m.amount, { allowZero: true }) : 0;
/** fmt.inr: "₹1,24,560.00". */
export const inr = (paise: number) => formatInr(Math.round(paise));
/** fmt.inr0: whole rupees without paise when there are none ("₹1,80,000"). */
export const inr0 = (paise: number) => formatInr(Math.round(paise)).replace(/\.00$/, '');
export const per = (p: Pick<PortalPlan, 'cycle'>) => (p.cycle === 'MONTHLY' ? 'month' : 'year');
export const cycleWord = (p: Pick<PortalPlan, 'cycle'>) =>
  p.cycle === 'MONTHLY' ? 'monthly' : 'annual';
export const cycleDays = (p: Pick<PortalPlan, 'cycle'>) => (p.cycle === 'MONTHLY' ? 30 : 365);
/** SP.annual: the yearly price, to compare plans of different cycles. */
export const annual = (p: Pick<PortalPlan, 'cycle' | 'price'>) =>
  p.cycle === 'MONTHLY' ? paiseOf(p.price) * 12 : paiseOf(p.price);
/** SP.planLine: "₹6,500 / month + GST". */
export const planLine = (p: Pick<PortalPlan, 'cycle' | 'price'>) =>
  `${inr0(paiseOf(p.price))} / ${per(p)} + GST`;
/** SP.feeText */
export function feeText(p: Pick<PortalPlan, 'platformFee'> | null | undefined): string {
  const f = p?.platformFee;
  if (!f) return 'A platform fee per successful merchant payment';
  return `${inr(paiseOf(f.flat))} per successful merchant payment up to ${inr0(paiseOf(f.upTo))}, ${Number(f.percent)}% above`;
}
/** GST on an amount at the invoice percentage ("18.00"). */
export const gstOn = (paise: number, percent: string | number) =>
  Math.round((paise * Number(percent)) / 100);

// --- dates -----------------------------------------------------------------------------------------

/** Whole days from `from` to `to` (YYYY-MM-DD). */
export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
/** A calendar date plus days (YYYY-MM-DD). */
export function addDays(day: string, n: number): string {
  const d = new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

// --- status ----------------------------------------------------------------------------------------

export type Shown = 'Pending activation' | 'Trial' | 'Active' | 'Suspended' | 'Cancelled';

/** The prototype's lifecycle names: an Active institution on its trial shows "Trial". */
export function shownStatus(inst: PortalInstitutionStatus | string, sub?: string | null): Shown {
  if (inst === 'PENDING_ACTIVATION') return 'Pending activation';
  if (inst === 'SUSPENDED') return 'Suspended';
  if (inst === 'CANCELLED') return 'Cancelled';
  return sub === 'TRIAL' ? 'Trial' : 'Active';
}

/** ui.status tones (STATUS in 01_ui.js). */
export const TONE: Readonly<Record<string, string>> = {
  'Pending activation': 'warn',
  Trial: 'info',
  Active: 'ok',
  Suspended: 'bad',
  Cancelled: 'neutral',
  Due: 'warn',
  Grace: 'warn',
  Overdue: 'bad',
  Paid: 'ok',
  Draft: 'neutral',
  Void: 'neutral',
  Submitted: 'info',
  Pending: 'warn',
  Approved: 'ok',
  Rejected: 'bad',
};
export const toneOf = (s: string) => TONE[s] ?? 'neutral';

const STATUS_WORD: Readonly<Record<string, string>> = {
  PENDING_ACTIVATION: 'Pending activation',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  CANCELLED: 'Cancelled',
  TRIAL: 'Trial',
};
export const statusWord = (s: string | null) => (s ? (STATUS_WORD[s] ?? s) : '');

/** Lifecycle history entries (institution_lifecycle_events) as the prototype titles them. */
export const EVENT: Readonly<
  Record<string, { title: string; icon: IconName; state: 'done' | 'now' | 'bad' }>
> = {
  REGISTERED: { title: 'Registered', icon: 'check', state: 'done' },
  TRIAL_STARTED: { title: 'Trial started', icon: 'hourglass', state: 'done' },
  ACTIVATED: { title: 'Activated', icon: 'check', state: 'done' },
  SUSPENDED: { title: 'Suspended', icon: 'pause', state: 'bad' },
  REACTIVATED: { title: 'Reactivated', icon: 'check', state: 'done' },
  CANCELLED: { title: 'Cancelled', icon: 'x', state: 'bad' },
  PLAN_CHANGE: { title: 'Plan change', icon: 'layers', state: 'done' },
  PLAN_CHANGE_SCHEDULED: { title: 'Plan change scheduled', icon: 'layers', state: 'done' },
  PLAN_CHANGE_CANCELLED: {
    title: 'Scheduled plan change withdrawn',
    icon: 'layers',
    state: 'done',
  },
  PLAN_CHANGE_REQUESTED: { title: 'Plan change requested', icon: 'layers', state: 'done' },
  PLAN_CHANGE_REQUEST_WITHDRAWN: {
    title: 'Plan change request withdrawn',
    icon: 'layers',
    state: 'done',
  },
  PLAN_CHANGE_REQUEST_DECLINED: {
    title: 'Plan change request declined',
    icon: 'layers',
    state: 'done',
  },
  GRACE_STARTED: { title: 'Grace period started', icon: 'alert', state: 'now' },
  GRACE_ENDED: { title: 'Grace period ended unpaid', icon: 'alert', state: 'bad' },
  STEP_COMPLETED: { title: 'Onboarding step completed', icon: 'check', state: 'done' },
  CORPORATE_CODE_SET: { title: 'Bank collection account set up', icon: 'bank', state: 'done' },
  INVOICE_ISSUED: { title: 'Invoice issued', icon: 'receipt', state: 'done' },
  INVOICE_PAID: { title: 'Invoice paid', icon: 'receipt', state: 'done' },
  INVOICE_TRANSFER_REPORTED: { title: 'Bank transfer reported', icon: 'receipt', state: 'done' },
  DATA_EXPORTED: { title: 'Data export requested', icon: 'archive', state: 'done' },
  DETAILS_CHANGE_REQUESTED: { title: 'Change of details requested', icon: 'edit', state: 'done' },
  CANCELLATION_REQUESTED: { title: 'Cancellation requested', icon: 'xc', state: 'done' },
  CANCELLATION_WITHDRAWN: {
    title: 'Cancellation request withdrawn',
    icon: 'check',
    state: 'done',
  },
  CANCELLATION_DECLINED: { title: 'Cancellation request declined', icon: 'check', state: 'done' },
};

/** The lifecycle changes the "Lifecycle changes" filter keeps (prototype s.notices). */
export const LIFECYCLE_EVENTS = new Set([
  'REGISTERED',
  'TRIAL_STARTED',
  'ACTIVATED',
  'SUSPENDED',
  'REACTIVATED',
  'CANCELLED',
  'PLAN_CHANGE',
  'PLAN_CHANGE_SCHEDULED',
  'PLAN_CHANGE_CANCELLED',
  'GRACE_STARTED',
  'GRACE_ENDED',
]);

export function eventOf(action: string) {
  return (
    EVENT[action] ?? {
      title: action.charAt(0) + action.slice(1).toLowerCase().replace(/_/g, ' '),
      icon: 'check' as IconName,
      state: 'done' as const,
    }
  );
}

/** Who made a change: the automatic jobs show as "CampusOne (automatic)". */
export const byWho = (by: string) =>
  by === 'CampusOne' || by === 'System' ? 'CampusOne (automatic)' : by;

// --- blocks ----------------------------------------------------------------------------------------

/** The rocket the portal adds to the icon set (RP.IP.rocket in 60_s_portal.js). */
@Component({
  selector: 'rp-sp-rocket',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<svg
    class="ic"
    [attr.width]="size()"
    [attr.height]="size()"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"
    />
    <path
      d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"
    />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>`,
})
export class Rocket {
  readonly size = input(17);
}

/** ui.ring: a progress ring that draws in, with content in the middle. */
@Component({
  selector: 'rp-sp-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="ring" [style.width.px]="size()" [style.height.px]="size()">
    <svg [attr.width]="size()" [attr.height]="size()">
      <circle
        class="trk"
        [attr.cx]="size() / 2"
        [attr.cy]="size() / 2"
        [attr.r]="radius()"
        [attr.stroke-width]="stroke()"
      />
      <circle
        class="val"
        [attr.cx]="size() / 2"
        [attr.cy]="size() / 2"
        [attr.r]="radius()"
        [attr.stroke-width]="stroke()"
        [attr.stroke-dasharray]="circumference()"
        [attr.stroke-dashoffset]="drawn() ? offset() : circumference()"
        [style.stroke]="color()"
      />
    </svg>
    <div class="ring-c"><ng-content /></div>
  </div>`,
})
export class Ring {
  readonly pct = input(0);
  readonly size = input(64);
  readonly stroke = input(6);
  readonly color = input<string | null>(null);
  protected readonly radius = computed(() => (this.size() - this.stroke()) / 2);
  protected readonly circumference = computed(() => 2 * Math.PI * this.radius());
  protected readonly offset = computed(
    () => this.circumference() * (1 - Math.max(0, Math.min(100, this.pct())) / 100),
  );
  /** Drawn after the first paint so the stroke animates in (the prototype's data-off). */
  protected readonly drawn = signal(false);

  constructor() {
    afterNextRender(() => setTimeout(() => this.drawn.set(true), 30));
  }
}

/** ui.field: label, the control (projected into `.fld-in`), the error line and a hint. */
@Component({
  selector: 'rp-sp-fld',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="fld" [class.full]="full()" [class.invalid]="!!error()">
    @if (label()) {
      <label class="fld-l" [for]="fid()"
        >{{ label() }}
        @if (req()) {
          <span class="req">*</span>
        }
        @if (opt()) {
          <span class="opt">(optional)</span>
        }
      </label>
    }
    <div class="fld-in"><ng-content /></div>
    <div class="fld-e" [id]="fid() + '-e'" role="alert">
      <rp-icon name="alertc" [size]="14" /><span>{{ error() }}</span>
    </div>
    @if (hint()) {
      <div class="fld-h">{{ hint() }}</div>
    }
  </div>`,
})
export class Field {
  readonly fid = input.required<string>();
  readonly label = input('');
  readonly req = input(false);
  readonly opt = input(false);
  readonly full = input(false);
  readonly error = input<string | null | undefined>('');
  readonly hint = input('');
}

/** SP.planCard */
@Component({
  selector: 'rp-sp-plan',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="sp-plan" [class.rec]="rec()">
    @if (rec()) {
      <span class="badge-r"><rp-icon name="star" [size]="11" /> {{ recLabel() }}</span>
    }
    <div>
      <h3>{{ plan().name }}</h3>
      <p class="desc mt4">{{ plan().description ?? '' }}</p>
    </div>
    <div>
      <div class="sp-price">
        <b>{{ price() }}</b>
      </div>
      <div class="t-sm t-muted" style="margin-top: 2px">
        per {{ per() }} + GST ·
        {{ plan().cycle === 'MONTHLY' ? 'billed monthly' : 'about ' + monthly() + ' a month' }}
      </div>
    </div>
    <ul class="sp-ul">
      @for (m of list(); track m) {
        <li [class.off]="!plan().modules.includes(m)">
          <rp-icon
            [name]="plan().modules.includes(m) ? 'check' : 'minus'"
            [size]="14"
            [stroke]="2.4"
          />
          <span>{{ m }}</span>
        </li>
      }
    </ul>
    <div class="stack g4 t-sm" style="padding-top: 12px; border-top: 1px solid var(--line)">
      <span class="row between"
        ><span class="t-muted">Active members</span
        ><b class="t-num">{{ num(plan().allowances.members) }}</b></span
      >
      <span class="row between"
        ><span class="t-muted">SMS a month</span
        ><b class="t-num">{{ num(plan().allowances.sms) }}</b></span
      >
      <span class="row between"
        ><span class="t-muted">WhatsApp a month</span
        ><b class="t-num">{{
          plan().allowances.whatsapp ? num(plan().allowances.whatsapp) : '—'
        }}</b></span
      >
      <span class="row between"
        ><span class="t-muted">Storage</span
        ><b class="t-num">{{ plan().allowances.storageGb }} GB</b></span
      >
    </div>
    <ng-content />
  </div>`,
})
export class PlanCard {
  readonly plan = input.required<PortalPlan>();
  readonly rec = input(false);
  readonly recLabel = input('Recommended');
  /** Every module, those outside the plan struck through (the pricing page and Plan & usage). */
  readonly full = input(false);
  protected readonly list = computed(() => (this.full() ? MODULES : this.plan().modules));
  protected readonly price = computed(() => inr0(paiseOf(this.plan().price)));
  protected readonly per = computed(() => per(this.plan()));
  protected readonly monthly = computed(() =>
    inr0(Math.round(paiseOf(this.plan().price) / 1200) * 100),
  );
  protected num(v: number) {
    return v.toLocaleString('en-IN');
  }
}

/** The four-to-six code boxes with paste, backspace and the wrong-code shake. */
@Component({
  selector: 'rp-sp-otp',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div
      class="otp sp-otp"
      role="group"
      aria-label="One-time code"
      [class.bad]="!!error()"
      [class.shake]="shake()"
    >
      @for (i of slots(); track i) {
        <input
          #digit
          type="text"
          inputmode="numeric"
          maxlength="1"
          [attr.autocomplete]="i === 0 ? 'one-time-code' : 'off'"
          [attr.aria-label]="'Digit ' + (i + 1)"
          [class.fill]="!!code()[i]"
          [value]="code()[i] ?? ''"
          (input)="typed(i, $event)"
          (keydown)="key(i, $event)"
          (paste)="pasted($event)"
        />
      }
    </div>
    <div class="fld" [class.invalid]="!!error()">
      <div class="fld-e" role="alert">
        <rp-icon name="alertc" [size]="14" /><span>{{ error() }}</span>
      </div>
    </div>`,
})
export class CodeBoxes {
  readonly digits = input(4);
  readonly error = input<string>('');
  /** All boxes filled (or Enter pressed): the code to check. */
  readonly entered = output<string>();
  /** A box changed: the parent clears its error. */
  readonly typing = output<void>();
  protected readonly slots = computed(() => Array.from({ length: this.digits() }, (_, i) => i));
  protected readonly code = signal<string[]>([]);
  protected readonly shake = signal(false);
  private readonly inputs = viewChildren<ElementRef<HTMLInputElement>>('digit');

  constructor() {
    afterNextRender(() => this.focus());
  }

  /** The code typed so far. */
  value() {
    return this.code().join('');
  }

  focus() {
    setTimeout(() => this.inputs()[0]?.nativeElement.focus(), 0);
  }

  /** A wrong code: the boxes empty and shake. */
  reset() {
    this.code.set([]);
    for (const i of this.inputs()) i.nativeElement.value = '';
    this.shake.set(false);
    setTimeout(() => this.shake.set(true), 0);
    this.focus();
  }

  protected typed(i: number, e: Event) {
    const el = e.target as HTMLInputElement;
    const digit = el.value.replace(/\D/g, '').slice(-1);
    el.value = digit;
    const next = [...this.code()];
    next[i] = digit;
    this.code.set(next);
    this.typing.emit();
    if (digit) this.inputs()[i + 1]?.nativeElement.focus();
    if (this.code().filter(Boolean).length === this.digits()) this.entered.emit(this.value());
  }

  protected key(i: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !this.code()[i]) this.inputs()[i - 1]?.nativeElement.focus();
    if (e.key === 'Enter') this.entered.emit(this.value());
  }

  protected pasted(e: ClipboardEvent) {
    const digits = (e.clipboardData?.getData('text') ?? '')
      .replace(/\D/g, '')
      .slice(0, this.digits());
    if (!digits) return;
    e.preventDefault();
    this.code.set(digits.split(''));
    this.typing.emit();
    if (digits.length === this.digits()) this.entered.emit(digits);
  }
}

// --- the "working" overlay (RP.process) --------------------------------------------------------------

export interface ProcessState {
  readonly title: string;
  readonly sub: string;
  readonly icon: IconName;
  readonly steps: readonly string[];
  /** The step running now; steps before it are done. */
  readonly at: number;
  /** The failure text shown on the running step. */
  readonly failed: string | null;
}

/**
 * Runs `work` behind the prototype's step-by-step overlay: the steps tick by while the request is
 * on its way and all turn done when it succeeds; a failure marks the running step and rethrows.
 */
export async function runProcess<T>(
  state: WritableSignal<ProcessState | null>,
  o: { title: string; sub: string; icon: IconName; steps: readonly string[] },
  work: () => Promise<T>,
  failText: (e: unknown) => string,
): Promise<T> {
  state.set({ ...o, at: 0, failed: null });
  const timer = setInterval(() => {
    const s = state();
    if (s && s.at < s.steps.length - 1) state.set({ ...s, at: s.at + 1 });
  }, 230);
  try {
    const out = await work();
    clearInterval(timer);
    const s = state();
    if (s) state.set({ ...s, at: s.steps.length });
    await new Promise((r) => setTimeout(r, 260));
    state.set(null);
    return out;
  } catch (e) {
    clearInterval(timer);
    const s = state();
    if (s) state.set({ ...s, failed: failText(e) });
    await new Promise((r) => setTimeout(r, 700));
    state.set(null);
    throw e;
  }
}

@Component({
  selector: 'rp-sp-process',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `@if (state(); as s) {
    <div class="ov fixed">
      <div class="proc" role="status" aria-live="polite">
        <div class="proc-ring"><rp-icon [name]="s.icon" [size]="26" /></div>
        <h4>{{ s.title }}</h4>
        <p class="t-xs t-muted" style="margin-top: 3px">{{ s.sub }}</p>
        <div class="proc-steps">
          @for (step of s.steps; track $index; let i = $index) {
            <div
              class="ps"
              [class.ok]="i < s.at"
              [class.run]="i === s.at && !s.failed"
              [class.bad]="i === s.at && !!s.failed"
            >
              <i></i><span>{{ i === s.at && s.failed ? s.failed : step }}</span>
            </div>
          }
        </div>
      </div>
    </div>
  }`,
})
export class ProcessOverlay {
  readonly state = input<ProcessState | null>(null);
}

// --- terms (sp.terms) --------------------------------------------------------------------------------

@Component({
  selector: 'rp-sp-terms',
  imports: [Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<rp-modal
    [title]="kind() === 'dp' ? 'Data-processing terms (summary)' : 'Subscription terms (summary)'"
    icon="filetext"
    (closed)="closed.emit()"
  >
    @if (kind() === 'dp') {
      <div class="stack g12 t-sm" style="line-height: 1.6">
        <p>
          CampusOne processes your members' data only to provide the service you subscribe to. Every
          record carries your institution's identifier and no query, report or export crosses
          institutions <span class="srs" title="SRS reference">FR-SAS-01</span>.
        </p>
        <p>
          You can export your institution's data at any time from <b>Data &amp; cancellation</b>
          <span class="srs" title="SRS reference">FR-SAS-04</span>.
        </p>
        <p>
          After cancellation, data is deleted at the end of the retention period. The retention
          period for each kind of data is still being agreed
          <span class="srs" title="SRS reference">OQ-30</span>; until it is, nothing is deleted.
        </p>
      </div>
    } @else {
      <div class="stack g12 t-sm" style="line-height: 1.6">
        <p>
          One plan per institution, billed monthly or yearly in advance; 18% GST applies
          <span class="srs" title="SRS reference">FR-SAS-06</span>.
        </p>
        <p>
          Invoices are raised on activation, at renewal, on a plan upgrade (prorated) and for usage
          above the plan's allowances at the end of the cycle
          <span class="srs" title="SRS reference">FR-SAS-07</span>.
        </p>
        <p>
          An unpaid invoice gets a {{ graceDays() }}-day grace period; after that the institution is
          suspended until it's paid — members can't sign in or pay, but nothing is deleted
          <span class="srs" title="SRS reference">FR-SAS-08</span>.
        </p>
        <p>
          Merchant payments carry a platform fee deducted in each settlement
          <span class="srs" title="SRS reference">OQ-06</span>.
        </p>
      </div>
    }
    <ng-container modal-foot>
      <button type="button" class="btn btn-sec" (click)="closed.emit()"><span>Close</span></button>
    </ng-container>
  </rp-modal>`,
})
export class Terms {
  readonly kind = input<'sub' | 'dp'>('sub');
  readonly graceDays = input(14);
  readonly closed = output<void>();
}

/** The site logo (`.sp-logo`): the mark and "CampusOne for Schools". */
@Component({
  selector: 'rp-sp-logo',
  imports: [Mark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<span class="sp-logo"
    ><rp-mark [size]="30" /><span>CampusOne<small>for Schools</small></span></span
  >`,
})
export class SiteLogo {}

/** Keyboard and pointer selection of a `.choice` card (ui.choice). */
export const choiceKeys = (e: KeyboardEvent, pick: () => void) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    pick();
  }
};

/** The account page head (`.sp-ph`): title, the line under it and the page's actions. */
@Component({
  selector: 'rp-sp-head',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<div class="sp-ph">
    <div class="t">
      <h1>{{ title() }}</h1>
      @if (sub()) {
        <p>{{ sub() }}</p>
      }
    </div>
    <div class="acts"><ng-content /></div>
  </div>`,
})
export class PageHead {
  readonly title = input.required<string>();
  readonly sub = input('');
}
