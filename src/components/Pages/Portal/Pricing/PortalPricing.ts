import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import type { IconName } from '../../../Utils/icons';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { PortalApi, type PortalPlan, type PortalPlans } from '../portal.api';
import { MOD_INFO, MODULES, PlanCard, inr, inr0, paiseOf, planLine } from '../Shared/PortalUi';

/**
 * s.pricing — plans and pricing (FR-SAS-05…08; SAS-001; prototype s.pricing): the plan cards with
 * every module, the comparison table, when CampusOne invoices and what happens to an unpaid invoice.
 */
@Component({
  selector: 'rp-portal-pricing',
  imports: [Empty, Icon, PlanCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block' },
  template: `
    <section class="sp-hero" style="padding: 52px 0 40px">
      <div class="sp-wrap" style="grid-template-columns: minmax(0, 1fr)">
        <div class="sp-sech" style="margin-bottom: 0">
          <span class="sp-eyebrow"><rp-icon name="layers" [size]="14" /> Plans and pricing</span>
          <h1 style="margin: 12px 0 6px; font-size: clamp(30px, 3.6vw, 46px)">
            One plan per campus. <em>No surprises.</em>
          </h1>
          <p class="sp-lede">
            Prices exclude 18% GST. Every plan includes the member app, the institution console,
            daily merchant settlement and a {{ trialDays() }}-day trial with every feature of the
            plan you choose.
          </p>
        </div>
      </div>
    </section>
    <section class="sp-sec" style="padding-top: 20px">
      <div class="sp-wrap stack g24">
        @if (error()) {
          <div class="card pad">
            <rp-empty icon="wifioff" title="Couldn't load the plans" [text]="error()" />
          </div>
        } @else if (plans(); as ps) {
          <div class="sp-plans">
            @for (p of ps.items; track p.id; let k = $index) {
              <rp-sp-plan [plan]="p" [rec]="k === 1" [full]="true">
                <button
                  type="button"
                  class="btn btn-block"
                  [class.btn-pri]="k === 1"
                  [class.btn-sec]="k !== 1"
                  (click)="trial(p.id)"
                >
                  <span>Start a trial on {{ p.name }}</span>
                </button>
              </rp-sp-plan>
            }
          </div>
          <div>
            <h2 class="sp-h2" style="font-size: 22px; margin-bottom: 12px">Compare plans</h2>
            <div class="tbl-wrap">
              <table class="sp-cmp">
                <thead>
                  <tr>
                    <th>Feature</th>
                    @for (p of ps.items; track p.id) {
                      <th>
                        {{ p.name }}
                        <div
                          class="t-xs t-muted"
                          style="font-family: var(--f-body); font-weight: 500"
                        >
                          {{ line(p) }}
                        </div>
                      </th>
                    }
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="g" [attr.colspan]="ps.items.length + 1">Modules</td>
                  </tr>
                  @for (m of modules; track m) {
                    <tr>
                      <td>
                        <span class="row g8"><rp-icon [name]="icon(m)" [size]="15" />{{ m }}</span>
                      </td>
                      @for (p of ps.items; track p.id) {
                        <td>
                          @if (p.modules.includes(m)) {
                            <span class="yes" style="color: var(--ok)"
                              ><rp-icon name="check" [size]="16" [stroke]="2.6"
                            /></span>
                          } @else {
                            <span style="color: var(--ink-4)"
                              ><rp-icon name="minus" [size]="16"
                            /></span>
                          }
                        </td>
                      }
                    </tr>
                  }
                  <tr>
                    <td class="g" [attr.colspan]="ps.items.length + 1">Usage allowances</td>
                  </tr>
                  <tr>
                    <td>Active members</td>
                    @for (p of ps.items; track p.id) {
                      <td>
                        <b class="t-num">{{ num(p.allowances.members) }}</b>
                      </td>
                    }
                  </tr>
                  <tr>
                    <td>SMS a month</td>
                    @for (p of ps.items; track p.id) {
                      <td>{{ num(p.allowances.sms) }}</td>
                    }
                  </tr>
                  <tr>
                    <td>WhatsApp a month</td>
                    @for (p of ps.items; track p.id) {
                      <td>
                        @if (p.allowances.whatsapp) {
                          {{ num(p.allowances.whatsapp) }}
                        } @else {
                          <span style="color: var(--ink-4)"
                            ><rp-icon name="minus" [size]="16"
                          /></span>
                        }
                      </td>
                    }
                  </tr>
                  <tr>
                    <td>Storage</td>
                    @for (p of ps.items; track p.id) {
                      <td>{{ p.allowances.storageGb }} GB</td>
                    }
                  </tr>
                  <tr>
                    <td class="g" [attr.colspan]="ps.items.length + 1">Billing</td>
                  </tr>
                  <tr>
                    <td>Billing cycle</td>
                    @for (p of ps.items; track p.id) {
                      <td>{{ p.cycle === 'MONTHLY' ? 'Monthly' : 'Annual' }}</td>
                    }
                  </tr>
                  <tr>
                    <td>Platform fee on merchant payments</td>
                    @for (p of ps.items; track p.id) {
                      <td>
                        <span class="t-sm">{{ fee(p) }}</span>
                      </td>
                    }
                  </tr>
                  <tr>
                    <td>Free trial</td>
                    @for (p of ps.items; track p.id) {
                      <td>{{ p.trialDays }} days</td>
                    }
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="t-xs t-muted mt8">
              Usage above an allowance is billed at the end of the cycle. How active members and
              storage are counted is still being defined
              <span class="srs" title="SRS reference">OI-SAS-03</span>.
            </p>
          </div>
          <div class="c-grid k2">
            <div class="card pad-l stack g12">
              <h3 class="t-h3">
                <rp-icon name="receipt" [size]="17" /> When we invoice
                <span class="srs" title="SRS reference">FR-SAS-07</span>
              </h3>
              <div class="tl">
                @for (r of invoicing; track r.t) {
                  <div class="tl-i done">
                    <span class="tl-dot"
                      ><rp-icon [name]="r.icon" [size]="13" [stroke]="2.6"
                    /></span>
                    <div class="tl-c">
                      <div class="tl-t">{{ r.t }}</div>
                      <div class="tl-s">{{ r.s }}</div>
                    </div>
                  </div>
                }
              </div>
            </div>
            <div class="card pad-l stack g12">
              <h3 class="t-h3">
                <rp-icon name="hourglass" [size]="17" /> If an invoice isn't paid
                <span class="srs" title="SRS reference">FR-SAS-08</span>
              </h3>
              <div class="tl">
                @for (r of unpaid(); track r.t) {
                  <div class="tl-i" [class]="'tl-i ' + r.state">
                    <span class="tl-dot"
                      ><rp-icon [name]="r.icon" [size]="13" [stroke]="2.6"
                    /></span>
                    <div class="tl-c">
                      <div class="tl-t">{{ r.t }}</div>
                      <div class="tl-s">{{ r.s }}</div>
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
        } @else {
          <div class="card pad"><rp-empty icon="hourglass" title="Loading…" /></div>
        }
        <div class="sp-band">
          <div class="grow">
            <h2>Not sure which plan fits?</h2>
            <p>
              Tell us roughly how many students you have during sign-up and we'll suggest one. You
              can change plan at any time.
            </p>
          </div>
          <button type="button" class="btn btn-accent btn-lg" (click)="go('/portal/signup')">
            <span>Start your free trial</span>
          </button>
        </div>
      </div>
    </section>
  `,
})
export class PortalPricing {
  private readonly api = inject(PortalApi);
  private readonly router = inject(Router);
  protected readonly modules = MODULES;
  protected readonly plans = signal<PortalPlans | null>(null);
  protected readonly error = signal('');
  protected readonly trialDays = computed(() => this.plans()?.items[0]?.trialDays ?? 30);
  protected readonly invoicing: readonly { t: string; s: string; icon: IconName }[] = [
    {
      t: 'Going live',
      s: 'The first cycle is billed when you activate or your trial converts.',
      icon: 'power',
    },
    { t: 'Renewal', s: 'The next cycle is billed before the renewal date.', icon: 'calendar' },
    {
      t: 'Upgrading',
      s: 'The difference is billed straight away, prorated to the renewal date. Downgrades apply at renewal.',
      icon: 'trendup',
    },
    { t: 'Usage above allowance', s: 'Billed at the end of the cycle.', icon: 'chart' },
  ];
  protected readonly unpaid = computed(() => {
    const ps = this.plans();
    return [
      {
        t: 'Due',
        s: `Pay online or by bank transfer within ${ps?.dueDays ?? 15} days of the invoice.`,
        state: 'done',
        icon: 'check' as IconName,
      },
      {
        t: `Grace · ${ps?.graceDays ?? 14} days`,
        s: 'Everything keeps working; your contacts get reminders.',
        state: 'now',
        icon: 'alert' as IconName,
      },
      {
        t: 'Suspended',
        s: "Members can't sign in, pay or be paid and scheduled jobs pause. Nothing is deleted.",
        state: 'bad',
        icon: 'pause' as IconName,
      },
      {
        t: 'Restored',
        s: 'Paying the invoice restores the institution straight away.',
        state: 'done',
        icon: 'play' as IconName,
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

  protected icon(m: string): IconName {
    return MOD_INFO[m]?.icon ?? 'bulb';
  }
  protected num(v: number) {
    return v.toLocaleString('en-IN');
  }
  protected line(p: PortalPlan) {
    return planLine(p);
  }
  protected fee(p: PortalPlan) {
    const f = p.platformFee;
    return f
      ? `${inr(paiseOf(f.flat))} up to ${inr0(paiseOf(f.upTo))}, ${Number(f.percent)}% above`
      : '—';
  }
  protected go(path: string) {
    void this.router.navigateByUrl(path);
  }
  protected trial(planId: string) {
    void this.router.navigate(['/portal/signup'], { queryParams: { plan: planId } });
  }
}
