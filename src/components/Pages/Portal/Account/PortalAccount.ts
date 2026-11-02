import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Card, Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { ago } from '../../../Utils/dates';
import { formatDate, istBusinessDate } from '../../../Utils/format';
import type { IconName } from '../../../Utils/icons';
import type { Invoice } from '../portal.api';
import { PortalStore } from '../portal.store';
import { InvoiceDrawer, PaySheet } from '../Shared/PortalPay';
import { Usage } from '../Shared/PortalUsage';
import {
  PageHead,
  Ring,
  STEP,
  byWho,
  cycleDays,
  daysBetween,
  eventOf,
  gstOn,
  inr,
  inr0,
  paiseOf,
  planLine,
} from '../Shared/PortalUi';

/** The checklist register's labels (SAS-008 `missing`) → the portal's step names. */
const MISSING_LABEL: Readonly<Record<string, keyof typeof STEP>> = {
  'Institution details and administrator': 'details',
  'Plan selected': 'plan',
  'Bank corporate code and pool account': 'bank',
  'Feature toggles set': 'toggles',
  'User types and departments': 'usertypes',
  'Academic year declared': 'year',
  'Fee account designated': 'feeacct',
  'Logo and branding': 'branding',
  'First users onboarded': 'firstusers',
};

const TRACK = [
  ['Pending activation', 'Onboarding'],
  ['Trial', 'Trial'],
  ['Active', 'Active'],
  ['Suspended', 'Suspended'],
  ['Cancelled', 'Cancelled'],
] as const;

type Act =
  | { kind: 'go'; label: string; style: string; path: string; disabled?: boolean; title?: string }
  | { kind: 'pay' | 'view'; label: string; style: string; invoice: Invoice };

interface StateCard {
  readonly tone: string;
  readonly title: string;
  /** Text with bold parts (the prototype's <b>). */
  readonly text: readonly { t: string; b?: boolean }[];
  readonly lead:
    | { kind: 'ring'; pct: number; value: string; caption: string; color: string | null }
    | { kind: 'icon'; icon: IconName; bg: string; fg: string };
  readonly acts: readonly Act[];
}

/**
 * s.account — the overview (FR-SAS-05/06/08/09, FR-INS-05; SAS-007; prototype s.account): where the
 * institution is in its lifecycle and what to do next, the plan, what is owed, active members,
 * usage this cycle, set-up progress and the latest notices.
 */
@Component({
  selector: 'rp-portal-account',
  imports: [Card, Empty, Icon, InvoiceDrawer, PageHead, PaySheet, Ring, Usage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-sp-head title="Overview" [sub]="sub()" />
    @if (store.account(); as a) {
      @if (card(); as c) {
        <div class="sp-state" [class]="'sp-state st-' + c.tone">
          @if (c.lead.kind === 'ring') {
            <rp-sp-ring [pct]="c.lead.pct" [size]="84" [stroke]="7" [color]="c.lead.color">
              <div style="text-align: center">
                <b class="t-num" style="font-size: 19px; display: block">{{ c.lead.value }}</b>
                @if (c.lead.caption) {
                  <small class="t-xs t-muted">{{ c.lead.caption }}</small>
                }
              </div>
            </rp-sp-ring>
          } @else {
            <span
              class="li-ic"
              style="width: 64px; height: 64px; border-radius: 50%"
              [style.background]="c.lead.bg"
              [style.color]="c.lead.fg"
              ><rp-icon [name]="c.lead.icon" [size]="28"
            /></span>
          }
          <div>
            <h2>{{ c.title }}</h2>
            <p>
              @for (s of c.text; track $index) {
                @if (s.b) {
                  <b>{{ s.t }}</b>
                } @else {
                  {{ s.t }}
                }
              }
            </p>
            <div class="sp-track" aria-label="Lifecycle">
              @for (t of track(); track t.key) {
                <div class="s" [class]="'s ' + t.cls">
                  <i></i><span>{{ t.label }}</span>
                </div>
              }
            </div>
          </div>
          <div class="acts">
            @for (x of c.acts; track x.label) {
              <button
                type="button"
                [class]="'btn ' + x.style"
                [disabled]="x.kind === 'go' && x.disabled"
                [attr.title]="x.kind === 'go' ? (x.title ?? null) : null"
                (click)="act(x)"
              >
                <span>{{ x.label }}</span>
              </button>
            }
          </div>
        </div>
      }
      <div class="c-grid k4">
        <div
          class="kpi hover"
          role="button"
          tabindex="0"
          (click)="go('/portal/plan')"
          (keydown.enter)="go('/portal/plan')"
        >
          <span class="k-ic"><rp-icon name="layers" [size]="17" /></span>
          <span class="k-l">Plan</span>
          <span class="k-v">{{ shortPlan() }}</span>
          <span class="k-d">{{ planDelta() }}</span>
        </div>
        <div class="kpi">
          <span
            class="k-ic"
            [style.background]="oweTone() ? 'var(--' + oweTone() + '-soft)' : null"
            [style.color]="oweTone() ? 'var(--' + oweTone() + ')' : null"
            ><rp-icon name="receipt" [size]="17"
          /></span>
          <span class="k-l">{{ store.unpaid().length ? 'Outstanding' : 'Next invoice' }}</span>
          <span class="k-v">{{ oweValue() }}</span>
          @if (oweDelta()) {
            <span class="k-d">{{ oweDelta() }}</span>
          }
        </div>
        <div class="kpi">
          <span class="k-ic"><rp-icon name="users" [size]="17" /></span>
          <span class="k-l">Active members</span>
          <span class="k-v">{{ num(a.billing.usage.members) }}</span>
          <span class="k-d"
            >of {{ num(a.billing.plan?.allowances?.members ?? 0) }} in the plan</span
          >
        </div>
        <div class="kpi">
          <span class="k-ic"><rp-icon name="percent" [size]="17" /></span>
          <span class="k-l">Platform fees · {{ month }}</span>
          <span class="k-v">—</span>
          <span class="k-d">No settlements yet</span>
        </div>
      </div>
      <div class="c-grid s21" style="align-items: start">
        <rp-card title="Usage this cycle" icon="gauge" [plainIcon]="true">
          <button type="button" class="linkbtn" card-right (click)="go('/portal/plan')">
            Plan &amp; usage<rp-icon name="right" [size]="14" />
          </button>
          <rp-sp-usage [summary]="a.billing" />
        </rp-card>
        <div class="stack g14">
          @if (a.onboarding.done < a.onboarding.total) {
            <rp-card title="Set-up" icon="clipcheck" [plainIcon]="true">
              <div class="stack g8">
                <div class="row between t-sm">
                  <span>{{ a.onboarding.done }} of {{ a.onboarding.total }} steps</span>
                  <button type="button" class="linkbtn" (click)="go('/portal/onboard')">
                    Open checklist<rp-icon name="right" [size]="14" />
                  </button>
                </div>
                <div class="bar warn">
                  <i [style.width.%]="(100 * a.onboarding.done) / (a.onboarding.total || 1)"></i>
                </div>
              </div>
            </rp-card>
          }
          <rp-card title="Recent notices" icon="bell" [plainIcon]="true" [flush]="true">
            <button type="button" class="linkbtn" card-right (click)="go('/portal/notices')">
              All<rp-icon name="right" [size]="14" />
            </button>
            @if (a.notices.length) {
              <div class="list plain" style="padding: 0 14px">
                @for (n of a.notices.slice(0, 4); track $index) {
                  <div class="li">
                    <span class="li-ic sm"
                      ><rp-icon [name]="event(n.action).icon" [size]="16"
                    /></span>
                    <span class="li-main"
                      ><span class="li-t wrap">{{ event(n.action).title }}</span
                      ><span class="li-s wrap">{{ when(n.at) }} · {{ who(n.by) }}</span></span
                    >
                  </div>
                }
              </div>
            } @else {
              <rp-empty icon="mail" title="No notices yet" />
            }
          </rp-card>
        </div>
      </div>
    } @else if (store.error()) {
      <div class="card pad">
        <rp-empty icon="wifioff" title="Couldn't load your account" [text]="store.error()" />
      </div>
    } @else {
      <div class="stack g16">
        <div class="sk" style="height: 150px; border-radius: 22px"></div>
        <div class="c-grid k4">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="sk" style="height: 92px; border-radius: 16px"></div>
          }
        </div>
        <div class="sk" style="height: 240px; border-radius: 16px"></div>
      </div>
    }
    @if (drawer(); as v) {
      <rp-sp-invoice
        [invoice]="v"
        [suspended]="store.shown() === 'Suspended'"
        (closed)="drawer.set(null)"
        (pay)="drawer.set(null); payFor.set($event)"
      />
    }
    @if (payFor(); as v) {
      <rp-sp-pay
        [invoice]="v"
        [payee]="store.account()?.billing?.payee ?? null"
        (closed)="payFor.set(null)"
        (paid)="paid()"
      />
    }
  `,
})
export class PortalAccount {
  private readonly router = inject(Router);
  protected readonly store = inject(PortalStore);
  protected readonly drawer = signal<Invoice | null>(null);
  protected readonly payFor = signal<Invoice | null>(null);
  private readonly today = istBusinessDate();
  protected readonly month = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ][Number(this.today.slice(5, 7)) - 1];

  protected readonly sub = computed(() => {
    const a = this.store.account();
    return a ? `${a.institution.name} · ${a.billing.plan?.name ?? 'No plan yet'}` : '';
  });
  protected readonly shortPlan = computed(
    () => this.store.account()?.billing.plan?.name.replace(/^Campus /, '') ?? '—',
  );
  protected readonly planDelta = computed(() => {
    const p = this.store.account()?.billing.plan;
    return p ? `${p.name} · ${planLine(p)}` : '';
  });
  protected readonly oweTone = computed(() => {
    const u = this.store.unpaid();
    return u.some((v) => v.status !== 'DUE') ? 'bad' : u.length ? 'warn' : null;
  });
  protected readonly oweValue = computed(() => {
    const a = this.store.account();
    const u = this.store.unpaid();
    if (u.length) return inr0(u.reduce((s, v) => s + paiseOf(v.total), 0));
    const p = a?.billing.plan;
    if (p && this.store.shown() === 'Active' && a.billing.subscription?.renewsOn) {
      const price = paiseOf(p.price);
      return inr0(price + gstOn(price, a.billing.billing.gstPercent));
    }
    return '—';
  });
  protected readonly oweDelta = computed(() => {
    const a = this.store.account();
    const u = this.store.unpaid();
    if (u.length) return `${u.length} unpaid`;
    const renews = a?.billing.subscription?.renewsOn;
    if (renews && this.store.shown() === 'Active')
      return `at renewal, ${formatDate(renews).slice(0, 6)}`;
    return this.store.shown() === 'Trial' ? 'when the trial converts' : '';
  });

  protected readonly track = computed(() => {
    const a = this.store.account();
    const cur = this.store.shown();
    const reached = new Set<string>(['Pending activation']);
    for (const n of a?.notices ?? []) {
      if (n.action === 'TRIAL_STARTED') reached.add('Trial');
      const to = { ACTIVE: 'Active', SUSPENDED: 'Suspended', CANCELLED: 'Cancelled' }[n.to ?? ''];
      if (to) reached.add(to);
    }
    return TRACK.map(([key, label]) => ({
      key,
      label,
      cls:
        key === cur
          ? `cur ${key === 'Suspended' ? 'bad' : key === 'Cancelled' ? 'warn' : ''}`
          : reached.has(key)
            ? 'past'
            : '',
    }));
  });

  /** SP.stateCard */
  protected readonly card = computed<StateCard | null>(() => {
    const a = this.store.account();
    const s = this.store.shown();
    if (!a || !s) return null;
    const name = a.institution.name;
    const p = a.billing.plan;
    const sub = a.billing.subscription;
    const unpaid = this.store.unpaid();
    const late = unpaid.find((v) => v.status === 'GRACE' || v.status === 'OVERDUE');
    const due = unpaid.find((v) => v.status === 'DUE' && paiseOf(v.total) > 0);
    const money = (v: Invoice) => inr(paiseOf(v.total));
    const pay = (v: Invoice, label: string): Act => ({
      kind: 'pay',
      label,
      style: 'btn-accent',
      invoice: v,
    });
    const view = (v: Invoice): Act => ({
      kind: 'view',
      label: 'View invoice',
      style: 'btn-sec',
      invoice: v,
    });
    if (s === 'Pending activation') {
      const { done, total, canGoLive, missing } = a.onboarding;
      const still = missing.map((m) =>
        (MISSING_LABEL[m] ? STEP[MISSING_LABEL[m]].t : m).toLowerCase(),
      );
      return {
        tone: 'info',
        title: 'Finish onboarding to go live',
        text: [
          {
            t: `${done} of ${total} steps done. ${
              still.length
                ? `Still needed: ${still.join(', ')}.`
                : "Everything required is done — go live whenever you're ready."
            }`,
          },
        ],
        lead: {
          kind: 'ring',
          pct: (100 * done) / (total || 1),
          value: `${done}/${total}`,
          caption: '',
          color: null,
        },
        acts: [
          { kind: 'go', label: 'Continue onboarding', style: 'btn-pri', path: '/portal/onboard' },
          {
            kind: 'go',
            label: 'Go live',
            style: canGoLive ? 'btn-accent' : 'btn-sec',
            path: '/portal/activate',
            disabled: !canGoLive,
            title: canGoLive ? '' : 'Finish the required steps first',
          },
        ],
      };
    }
    if (s === 'Trial') {
      const days = sub?.trialEndsOn ? daysBetween(this.today, sub.trialEndsOn) : 0;
      const left = Math.max(0, days);
      return {
        tone: days <= 7 ? 'warn' : 'info',
        title: `Trial · ${left} day${left === 1 ? '' : 's'} left`,
        text: [
          { t: `Your trial of ${p?.name ?? 'your plan'} ends on ` },
          { t: formatDate(sub?.trialEndsOn ?? this.today), b: true },
          {
            t: `. Choose a plan and pay the first invoice to keep going — if it ends unpaid, ${name} is suspended until you pay.`,
          },
        ],
        lead: {
          kind: 'ring',
          pct: Math.max(0, (100 * days) / (p?.trialDays || 30)),
          value: String(left),
          caption: 'days',
          color: days <= 7 ? 'var(--accent)' : null,
        },
        acts: [
          { kind: 'go', label: 'Choose a plan', style: 'btn-accent', path: '/portal/activate' },
          { kind: 'go', label: 'Compare plans', style: 'btn-sec', path: '/portal/plan' },
        ],
      };
    }
    if (s === 'Suspended') {
      const v = late ?? unpaid[0];
      const since = a.notices.find((n) => n.action === 'SUSPENDED')?.at;
      return {
        tone: 'bad',
        title: since ? `Suspended since ${formatDate(since)}` : 'Suspended',
        text: [
          {
            t: "Members can't sign in, pay or be paid, and scheduled jobs are paused. Nothing has been deleted. ",
          },
          ...(v
            ? [
                { t: 'Paying ' },
                { t: v.invoiceNo, b: true },
                { t: ` (${money(v)}) restores ${name} straight away.` },
              ]
            : [{ t: 'Contact CampusOne to restore it.' }]),
        ],
        lead: { kind: 'icon', icon: 'pause', bg: 'var(--bad-soft)', fg: 'var(--bad)' },
        acts: v ? [pay(v, `Pay ${money(v)} and restore`), view(v)] : [],
      };
    }
    if (s === 'Cancelled') {
      const on = a.notices.find((n) => n.action === 'CANCELLED')?.at;
      return {
        tone: 'neutral',
        title: on ? `Cancelled on ${formatDate(on)}` : 'Cancelled',
        text: [
          {
            t: "Everything is blocked and balances are frozen. Export your data while it's kept — the retention period is still being agreed.",
          },
        ],
        lead: { kind: 'icon', icon: 'archive', bg: 'var(--surface-3)', fg: 'var(--ink-2)' },
        acts: [{ kind: 'go', label: 'Export data', style: 'btn-sec', path: '/portal/data' }],
      };
    }
    if (late) {
      const left = Math.max(0, daysBetween(this.today, late.graceUntilOn));
      const grace = a.billing.billing.graceDays;
      return {
        tone: 'warn',
        title: `Invoice ${late.invoiceNo} is overdue`,
        text: [
          { t: `Pay ${money(late)} by ` },
          { t: formatDate(late.graceUntilOn), b: true },
          {
            t: ` — ${left} day${left === 1 ? '' : 's'} left in the ${grace}-day grace period. After that, ${name} is suspended: members can't sign in, pay or be paid until it's paid.`,
          },
        ],
        lead: {
          kind: 'ring',
          pct: Math.max(0, (100 * left) / (grace || 14)),
          value: String(left),
          caption: 'days',
          color: 'var(--accent)',
        },
        acts: [pay(late, `Pay ${money(late)}`), view(late)],
      };
    }
    const renews = sub?.renewsOn ?? null;
    const days = renews ? daysBetween(this.today, renews) : 0;
    return {
      tone: 'ok',
      title: `Active · renews ${renews ? formatDate(renews) : '—'}`,
      text: [
        { t: `Members can sign in and pay, and tonight's scheduled processing includes ${name}.` },
        ...(due
          ? [
              { t: ' Invoice ' },
              { t: due.invoiceNo, b: true },
              { t: ` for ${money(due)} is due ${formatDate(due.dueOn)}.` },
            ]
          : []),
        ...(a.billing.scheduledChange
          ? [
              { t: ' Moving to ' },
              { t: a.billing.scheduledChange.plan, b: true },
              { t: ' at renewal.' },
            ]
          : []),
      ],
      lead: {
        kind: 'ring',
        pct: Math.max(2, Math.min(100, 100 - (100 * days) / (p ? cycleDays(p) : 365))),
        value: String(Math.max(0, days)),
        caption: 'days',
        color: null,
      },
      acts: due
        ? [pay(due, `Pay ${money(due)}`)]
        : [{ kind: 'go', label: 'Billing', style: 'btn-sec', path: '/portal/billing' }],
    };
  });

  constructor() {
    void this.store.refresh();
  }

  protected num(v: number) {
    return v.toLocaleString('en-IN');
  }
  protected event(action: string) {
    return eventOf(action);
  }
  protected when(at: string) {
    return ago(at);
  }
  protected who(by: string) {
    return byWho(by);
  }
  protected go(path: string) {
    void this.router.navigateByUrl(path);
  }
  protected act(x: Act) {
    if (x.kind === 'go') this.go(x.path);
    else if (x.kind === 'pay') this.payFor.set(x.invoice);
    else this.drawer.set(x.invoice);
  }
  protected paid() {
    this.payFor.set(null);
    void this.store.refresh();
  }
}
