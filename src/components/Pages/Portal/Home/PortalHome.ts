import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Mark } from '../../../Shared/Mark';
import type { IconName } from '../../../Utils/icons';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { PortalApi, type PortalPlans } from '../portal.api';
import { CHECKLIST, MOD_INFO, MODULES, PlanCard, Rocket, STEP, feeText } from '../Shared/PortalUi';

const ring = (mods: readonly string[], start: number) =>
  mods.map((m, k) => {
    const a = start + k * (360 / mods.length);
    return {
      m,
      a,
      acc: k % 2 === 1,
      icon: MOD_INFO[m]?.icon ?? ('bulb' as IconName),
      label: m === 'Wallet and payments' ? 'Wallet' : m,
    };
  });

const FACTS: readonly { icon: IconName; t: string; d: string; ref: string }[] = [
  {
    icon: 'shieldck',
    t: 'Money stays on campus',
    d: 'Payments only move between members of the same institution, and payees must be your approved merchants.',
    ref: 'BR-12',
  },
  {
    icon: 'scale',
    t: 'Every rupee ledgered twice',
    d: 'Each balance change is a balanced debit and credit with a unique key, so a retry never pays twice.',
    ref: 'BR-14',
  },
  {
    icon: 'users',
    t: 'Two people approve settlement',
    d: 'Merchant settlements need a maker and a different checker before any payout reference is recorded.',
    ref: 'FR-SET-04',
  },
  {
    icon: 'archive',
    t: 'Your data, your export',
    d: 'Export your institution’s data whenever you like; no report ever crosses institutions.',
    ref: 'FR-SAS-04',
  },
];

/**
 * s.home — the portal's website (SRS 7, FR-SAS-05/10, UC 4.10; prototype s.home): the hero with the
 * module orbit, the ten modules and which plans include them, how onboarding works with the
 * checklist preview, the safety facts, the plans (SAS-001), the questions and the closing band.
 */
@Component({
  selector: 'rp-portal-home',
  imports: [Empty, Icon, Mark, PlanCard, Rocket],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block' },
  template: `
    <section class="sp-hero">
      <div class="sp-wrap">
        <div>
          <span class="sp-eyebrow"
            ><rp-icon name="school" [size]="14" /> For schools and colleges in India</span
          >
          <h1>Fees, payments and the school day — <em>on one ring.</em></h1>
          <p class="sp-lede">
            CampusOne gives every student, parent and teacher a campus wallet and app, and gives your
            office one console for fees, attendance, transport and communication. Sign up here,
            finish a guided checklist and go live with a {{ trialDays() }}-day trial.
          </p>
          <div class="sp-cta">
            <button type="button" class="btn btn-accent btn-lg" (click)="go('/portal/signup')">
              <span>Start your free trial</span><rp-icon name="arrowr" [size]="15" />
            </button>
            <button type="button" class="btn btn-sec btn-lg" (click)="go('/portal/pricing')">
              <span>See plans and pricing</span>
            </button>
          </div>
          <div class="sp-micro">
            <span
              ><rp-icon name="check" [size]="14" [stroke]="2.6" /> No payment needed for the
              trial</span
            >
            <span><rp-icon name="check" [size]="14" [stroke]="2.6" /> GST invoices</span>
            <span
              ><rp-icon name="check" [size]="14" [stroke]="2.6" /> Export your data any time</span
            >
          </div>
        </div>
        <div class="sp-orbit" aria-hidden="true">
          @for (o of orbits; track $index) {
            <div class="sp-orb" [class]="'sp-orb ' + o.cls">
              @for (c of o.chips; track c.m) {
                <div
                  class="sp-arm"
                  [style.transform]="'rotate(' + c.a + 'deg)'"
                  [style.--a]="c.a + 'deg'"
                >
                  <div class="sp-chipw">
                    <span class="sp-oc" [class.acc]="c.acc"
                      ><i><rp-icon [name]="c.icon" [size]="13" /></i>{{ c.label }}</span
                    >
                  </div>
                </div>
              }
            </div>
          }
          <div class="sp-orb o3"></div>
          <div class="sp-core"><rp-mark [size]="66" /></div>
          <div class="sp-float f1">
            <span class="li-ic" style="background: var(--ok-soft); color: var(--ok)"
              ><rp-icon name="check" [size]="17"
            /></span>
            <span><b>₹60.00 paid</b><small>Canteen · campus wallet</small></span>
          </div>
          <div class="sp-float f2">
            <span class="li-ic" style="background: var(--accent-soft); color: var(--accent-ink)"
              ><rp-icon name="bus" [size]="17"
            /></span>
            <span><b>Bus 07 reached Vidyanagar</b><small>Parents notified</small></span>
          </div>
        </div>
      </div>
    </section>

    <section class="sp-sec">
      <div class="sp-wrap">
        <div class="sp-sech">
          <span class="eyebrow">What's inside</span>
          <h2 class="sp-h2">Ten modules, <em>one campus record</em></h2>
          <p class="sp-lede">
            Every module works on the same members, wallets and academic year, so a fee collected, a
            bus boarded or a lunch coupon used shows up everywhere it matters.
          </p>
        </div>
        <div class="sp-mods enter">
          @for (m of modules; track m) {
            <div class="sp-mod">
              <span class="li-ic"><rp-icon [name]="info(m).icon" [size]="19" /></span>
              <b>{{ m }}</b>
              <p>{{ info(m).t }}</p>
              <span class="sp-in">{{ inPlans(m) }}</span>
            </div>
          }
        </div>
      </div>
    </section>

    <section class="sp-sec alt" id="sp-how">
      <div class="sp-wrap">
        <div class="sp-sech">
          <span class="eyebrow">How onboarding works</span>
          <h2 class="sp-h2">Live in days, <em>not months</em></h2>
          <p class="sp-lede">
            A guided checklist walks your office through set-up. You can see every step — and so can
            the CampusOne team helping you <span class="srs" title="SRS reference">FR-SAS-10</span>.
          </p>
        </div>
        <div class="sp-how">
          <div class="sp-steps4" style="grid-template-columns: repeat(2, minmax(0, 1fr))">
            <div class="sp-st4">
              <span class="n">1</span><b><rp-sp-rocket [size]="15" /> Sign up</b>
              <p>
                Verify your CampusOne account, tell us about your institution and pick a plan. About
                five minutes.
              </p>
            </div>
            <div class="sp-st4">
              <span class="n">2</span><b><rp-icon name="clipcheck" [size]="15" /> Set up</b>
              <p>
                Features, user types, academic year, fee account, branding and first users. CampusOne
                sets up your bank collection account in parallel.
              </p>
            </div>
            <div class="sp-st4">
              <span class="n">3</span><b><rp-icon name="power" [size]="15" /> Go live</b>
              <p>
                Start a {{ trialDays() }}-day trial or pay the first invoice. Members can sign in
                the moment you're live.
              </p>
            </div>
            <div class="sp-st4">
              <span class="n">4</span><b><rp-icon name="trendup" [size]="15" /> Grow</b>
              <p>
                Change plan whenever you need to — upgrades are prorated, downgrades apply at
                renewal.
              </p>
            </div>
          </div>
          <div class="card raise">
            <div class="card-h">
              <span class="li-ic sm"><rp-icon name="clipcheck" [size]="16" /></span
              ><span class="t-h4">Your onboarding checklist</span
              ><span class="t-xs t-muted" style="margin-left: auto"
                >{{ checklist.length }} steps</span
              >
            </div>
            <div class="sp-ckp">
              @for (c of checklist; track c.k; let k = $index) {
                <div class="r" [class.d]="k < 4" [style.animation-delay]="k * 0.06 + 's'">
                  <i><rp-icon name="check" [size]="11" [stroke]="3" /></i>
                  <span
                    >{{ step(c.k) }}
                    @if (!c.req) {
                      <span class="t-faint">(optional)</span>
                    }
                  </span>
                  <span class="who">{{ c.k === 'bank' ? 'CampusOne' : 'You' }}</span>
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="sp-sec">
      <div class="sp-wrap">
        <div class="sp-sech">
          <span class="eyebrow">Built the careful way</span>
          <h2 class="sp-h2">Money moves by <em>the rules</em></h2>
        </div>
        <div class="sp-facts">
          @for (f of facts; track f.t) {
            <div class="sp-fact">
              <span class="li-ic"><rp-icon [name]="f.icon" [size]="18" /></span>
              <b>{{ f.t }}</b>
              <p>
                {{ f.d }} <span class="srs" title="SRS reference">{{ f.ref }}</span>
              </p>
            </div>
          }
        </div>
      </div>
    </section>

    <section class="sp-sec alt">
      <div class="sp-wrap">
        <div class="sp-sech center">
          <span class="eyebrow">Pricing</span>
          <h2 class="sp-h2">Plans that grow with your campus</h2>
          <p class="sp-lede">
            Prices exclude 18% GST. Every plan includes the member app, the institution console and
            a {{ trialDays() }}-day trial.
          </p>
        </div>
        @if (error()) {
          <div class="card pad">
            <rp-empty icon="wifioff" title="Couldn't load the plans" [text]="error()" />
          </div>
        } @else if (plans(); as ps) {
          <div class="sp-plans">
            @for (p of ps.items; track p.id; let k = $index) {
              <rp-sp-plan [plan]="p" [rec]="k === 1">
                <button
                  type="button"
                  class="btn btn-block"
                  [class.btn-pri]="k === 1"
                  [class.btn-sec]="k !== 1"
                  (click)="trial(p.id)"
                >
                  <span>Try {{ p.name }}</span>
                </button>
              </rp-sp-plan>
            }
          </div>
        } @else {
          <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
        }
        <div class="row center mt16" style="justify-content: center">
          <button type="button" class="btn btn-ghost" (click)="go('/portal/pricing')">
            <span>Compare every feature</span><rp-icon name="arrowr" [size]="15" />
          </button>
        </div>
      </div>
    </section>

    <section class="sp-sec" id="sp-faq">
      <div class="sp-wrap">
        <div class="sp-sech">
          <span class="eyebrow">Questions</span>
          <h2 class="sp-h2">Before you sign up</h2>
        </div>
        <div class="sp-faq">
          @for (q of faq(); track q.q; let k = $index) {
            <details [open]="k === 0">
              <summary>{{ q.q }}<rp-icon name="down" [size]="16" /></summary>
              <p>
                {{ q.a }}
                @if (q.ref) {
                  <span class="srs" title="SRS reference">{{ q.ref }}</span>
                }
              </p>
            </details>
          }
        </div>
      </div>
    </section>

    <section style="padding: 0 0 64px">
      <div class="sp-wrap">
        <div class="sp-band">
          <div class="grow">
            <h2>Ready when your office is.</h2>
            <p>
              Start the trial today; the checklist keeps your progress, so you can finish set-up
              across a few sittings.
            </p>
          </div>
          <div class="row g8 wrap">
            <button type="button" class="btn btn-accent btn-lg" (click)="go('/portal/signup')">
              <span>Start your free trial</span>
            </button>
            <button type="button" class="btn btn-sec btn-lg" (click)="go('/portal/signin')">
              <span>Sign in</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class PortalHome {
  private readonly api = inject(PortalApi);
  private readonly router = inject(Router);
  protected readonly modules = MODULES;
  protected readonly checklist = CHECKLIST;
  protected readonly facts = FACTS;
  protected readonly orbits = [
    { cls: 'o1', chips: ring(MODULES.slice(0, 5), 18) },
    { cls: 'o2', chips: ring(MODULES.slice(5, 10), 54) },
  ];
  protected readonly plans = signal<PortalPlans | null>(null);
  protected readonly error = signal('');
  protected readonly trialDays = computed(() => this.plans()?.items[0]?.trialDays ?? 30);

  protected readonly faq = computed(() => {
    const ps = this.plans();
    return [
      {
        q: 'How long does onboarding take?',
        a: 'Most of the checklist takes an afternoon: features, user types, the academic year, your fee account, branding and your first users. CampusOne sets up the bank collection account with our sponsor bank in parallel, usually within two working days.',
        ref: 'FR-SAS-10',
      },
      {
        q: 'What happens when the trial ends?',
        a: "Choose a plan and pay the first invoice to continue. If the trial ends unpaid, the institution is suspended: data is kept, but members can't sign in or pay until the invoice is paid.",
        ref: 'FR-SAS-08',
      },
      {
        q: 'Who can sign up an institution?',
        a: 'The administrator signs up with their own CampusOne account — the same one used in the CampusOne app. An account that already belongs to another school can be used too; the console asks which institution to open at sign-in.',
        ref: 'BR-01',
      },
      {
        q: 'What is the platform fee?',
        a: `${feeText(ps?.items[0])}, deducted in each day's merchant settlement. Whether the fee should differ by plan is still open.`,
        ref: 'OQ-06',
      },
      {
        q: 'Can we leave and take our data with us?',
        a: 'Yes. Export your data at any time. Cancellation closes the institution once settlements and wallet balances are cleared; deletion follows the retention period, which is still being agreed.',
        ref: 'OQ-30',
      },
      {
        q: 'Do invoices include GST?',
        a: `Yes — invoices carry 18% GST and are due ${ps?.dueDays ?? 15} days after they're issued. Pay online through the payment gateway or by bank transfer.`,
        ref: '',
      },
    ];
  });

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      this.plans.set(await this.api.plans());
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected info(m: string) {
    return MOD_INFO[m] ?? { icon: 'bulb' as IconName, t: '' };
  }
  protected step(k: (typeof CHECKLIST)[number]['k']) {
    return STEP[k].t;
  }

  /** Which plans include a module ("Every plan", or the plan names without "Campus "). */
  protected inPlans(m: string) {
    const items = this.plans()?.items ?? [];
    if (!items.length) return '';
    const n = items.filter((p) => p.modules.includes(m));
    return n.length === items.length
      ? 'Every plan'
      : n.map((p) => p.name.replace('Campus ', '')).join(' and ');
  }

  protected go(path: string) {
    void this.router.navigateByUrl(path);
  }

  protected trial(planId: string) {
    void this.router.navigate(['/portal/signup'], { queryParams: { plan: planId } });
  }
}
