import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Card, Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate, istBusinessDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import {
  PortalApi,
  type Invoice,
  type PortalPlan as PlanTerms,
  type PortalSubscription,
} from '../portal.api';
import { PortalStore, payable } from '../portal.store';
import { PaySheet } from '../Shared/PortalPay';
import { Usage } from '../Shared/PortalUsage';
import {
  PageHead,
  PlanCard,
  annual,
  daysBetween,
  feeText,
  gstOn,
  inr,
  paiseOf,
  planLine,
} from '../Shared/PortalUi';

/**
 * s.plan — Plan & usage (FR-SAS-05…07; SAS-011…013; prototype s.plan): every plan with the current
 * one marked, upgrade now (prorated invoice) or move down at renewal, undo a scheduled change, usage
 * against the allowances and the platform fee. Before go-live and during the trial the plan is
 * simply switched.
 */
@Component({
  selector: 'rp-portal-plan',
  imports: [Card, Empty, Icon, PageHead, PaySheet, PlanCard, Usage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-sp-head
      title="Plan & usage"
      sub="Upgrades take effect now and are billed for the rest of the cycle; downgrades take effect at renewal."
    />
    @if (error()) {
      <div class="card pad">
        <rp-empty icon="wifioff" title="Couldn't load your plan" [text]="error()" />
      </div>
    } @else if (data(); as s) {
      @if (s.scheduledChange; as sc) {
        <div class="note tone-info">
          <rp-icon name="calendar" [size]="17" />
          <div class="grow">
            Moving to <b>{{ sc.plan }}</b> at renewal on {{ date(sc.on) }}.
          </div>
          <button type="button" class="btn btn-sec btn-sm" (click)="keep(sc.plan)">
            <span>Keep current plan</span>
          </button>
        </div>
      }
      @if (paused()) {
        <div class="note tone-warn">
          <rp-icon name="alert" [size]="17" />
          <div class="grow">
            Plan changes are paused while {{ s.institution.name }} is {{ shown().toLowerCase() }}.
          </div>
        </div>
      }
      <div class="sp-plans">
        @for (x of s.plans; track x.id) {
          <rp-sp-plan [plan]="x" [rec]="x.id === s.plan?.id" recLabel="Current plan" [full]="true">
            @if (x.id === s.plan?.id) {
              <button type="button" class="btn btn-soft btn-block" disabled>
                <rp-icon name="check" [size]="17" /><span>Your current plan</span>
              </button>
            } @else if (paused()) {
              <button type="button" class="btn btn-sec btn-block" disabled>
                <span>Unavailable while {{ shown().toLowerCase() }}</span>
              </button>
            } @else if (s.scheduledChange?.plan === x.name) {
              <button type="button" class="btn btn-sec btn-block" disabled>
                <rp-icon name="calendar" [size]="17" /><span>Scheduled for renewal</span>
              </button>
            } @else {
              <button
                type="button"
                class="btn btn-block"
                [class.btn-pri]="up(x)"
                [class.btn-sec]="!up(x)"
                [class.is-busy]="busy() === x.id"
                (click)="change(x)"
              >
                @if (up(x)) {
                  <rp-icon name="trendup" [size]="17" />
                }
                <span>{{ label(x) }}</span>
              </button>
            }
          </rp-sp-plan>
        }
      </div>
      <div class="c-grid k2" style="align-items: start">
        <rp-card title="Usage this cycle" icon="gauge" [plainIcon]="true">
          <rp-sp-usage [summary]="s" />
        </rp-card>
        <rp-card title="Platform fee" icon="percent" [plainIcon]="true">
          <div class="stack g10 t-sm">
            <p>
              {{ fee() }}. It's deducted from each merchant's settlement, so it never appears on
              your invoice <span class="srs" title="SRS reference">FR-SAS-09</span>.
            </p>
            <dl class="kv">
              <dt>Settled in {{ month }}</dt>
              <dd><span class="t-faint">No settlements yet</span></dd>
              <dt>Fees deducted</dt>
              <dd><span class="t-faint">No settlements yet</span></dd>
            </dl>
            <p class="t-xs t-muted">
              Whether the fee should differ by plan, and which transaction types it covers, is still
              open <span class="srs" title="SRS reference">OQ-06</span>
              <span class="srs" title="SRS reference">OI-SAS-02</span>.
            </p>
          </div>
        </rp-card>
      </div>
    } @else {
      <div class="sp-plans">
        @for (i of [1, 2, 3]; track i) {
          <div class="sk" style="height: 420px; border-radius: 22px"></div>
        }
      </div>
    }
    @if (payFor(); as v) {
      <rp-sp-pay
        [invoice]="v"
        [payee]="data()?.payee ?? null"
        (closed)="payFor.set(null)"
        (paid)="paid()"
      />
    }
  `,
})
export class PortalPlan {
  private readonly api = inject(PortalApi);
  private readonly overlays = inject(Overlays);
  private readonly store = inject(PortalStore);
  private readonly today = istBusinessDate();
  protected readonly month = new Intl.DateTimeFormat('en-IN', { month: 'long' }).format(new Date());
  protected readonly data = signal<PortalSubscription | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal<string | null>(null);
  protected readonly payFor = signal<Invoice | null>(null);

  protected readonly shown = computed(() => this.store.shown() ?? 'Active');
  protected readonly paused = computed(() => {
    const st = this.data()?.subscription?.status;
    return this.shown() === 'Suspended' || this.shown() === 'Cancelled' || st === 'SUSPENDED';
  });
  /** The subscription period runs (not the trial): an upgrade is billed, a move down waits. */
  protected readonly live = computed(() =>
    ['ACTIVE', 'GRACE'].includes(this.data()?.subscription?.status ?? ''),
  );
  protected readonly fee = computed(() => feeText(this.data()?.plan));

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      this.data.set(await this.api.subscription());
      this.error.set('');
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected date(v: string) {
    return formatDate(v);
  }
  protected up(x: PlanTerms) {
    const cur = this.data()?.plan;
    return cur ? annual(x) > annual(cur) : false;
  }
  protected label(x: PlanTerms) {
    if (!this.live()) return `Switch to ${x.name}`;
    return this.up(x) ? `Upgrade to ${x.name}` : 'Downgrade at renewal';
  }

  /** Modules of the current plan that the other plan lacks (their features switch off). */
  private lost(to: PlanTerms) {
    const from = this.data()?.plan?.modules ?? [];
    const gone = from.filter((m) => !to.modules.includes(m));
    return gone.length
      ? ` These modules aren't in ${to.name} and their features will be switched off: ${gone.join(', ')}.`
      : '';
  }

  /** sp.plan.change */
  protected async change(to: PlanTerms) {
    const s = this.data();
    if (!s || this.busy()) return;
    const from = s.plan;
    const lost = this.lost(to);
    const sub = s.subscription;
    let timing: 'NOW' | 'RENEWAL' = 'NOW';
    let ok: false | object;
    if (!this.live()) {
      ok = await this.overlays.confirm({
        title: `Switch to ${to.name}?`,
        text: `${
          this.shown() === 'Trial'
            ? `Your trial continues on the new plan until ${sub?.trialEndsOn ? formatDate(sub.trialEndsOn) : 'it ends'}.`
            : "You'll go live on the new plan."
        }${lost}`,
        ok: 'Switch plan',
        tone: lost ? 'warn' : 'brand',
      });
    } else if (!this.up(to)) {
      timing = 'RENEWAL';
      ok = await this.overlays.confirm({
        title: `Move to ${to.name} at renewal?`,
        text: `You stay on ${from?.name ?? 'your plan'} until ${sub?.renewsOn ? formatDate(sub.renewsOn) : 'renewal'}, then move to ${to.name} at ${planLine(to)}.${lost}`,
        ok: 'Schedule downgrade',
        tone: 'warn',
      });
    } else {
      const left = sub?.renewsOn ? Math.max(0, daysBetween(this.today, sub.renewsOn)) : 0;
      const amount = from ? Math.round(((annual(to) - annual(from)) * left) / 365) : 0;
      const total = amount + gstOn(amount, s.billing.gstPercent);
      ok = await this.overlays.confirm({
        title: `Upgrade to ${to.name}?`,
        text: `The upgrade applies now. You'll be billed about ${inr(total)} including GST for the ${left} days until renewal on ${sub?.renewsOn ? formatDate(sub.renewsOn) : '—'} — the difference between the two plans, prorated.`,
        ok: 'Upgrade now',
        icon: 'trendup',
      });
    }
    if (!ok) return;
    this.busy.set(to.id);
    try {
      const before = new Set(s.invoices.map((v) => v.id));
      const next = await this.api.changePlan(to.id, timing);
      this.data.set(next);
      void this.store.refresh();
      if (!this.live() || timing === 'NOW') {
        const v = next.invoices.find((x) => !before.has(x.id) && payable(x));
        if (this.live() && v) {
          this.overlays.toast(`Upgraded to ${to.name}`, {
            sub: `Invoice ${v.invoiceNo} for ${inr(paiseOf(v.total))} · due ${formatDate(v.dueOn)}`,
          });
          setTimeout(() => this.payFor.set(v), 350);
        } else if (this.live()) {
          this.overlays.toast(`Upgraded to ${to.name}`, {
            sub: 'No charge for the rest of the cycle',
          });
        } else {
          this.overlays.toast(`Switched to ${to.name}`, { sub: planLine(to) });
        }
      } else {
        this.overlays.toast('Downgrade scheduled', {
          sub: `${to.name} from ${next.scheduledChange ? formatDate(next.scheduledChange.on) : 'renewal'}`,
        });
      }
    } catch (e) {
      this.overlays.toast('Plan not changed', {
        sub:
          e instanceof ApiProblem
            ? (e.errors[0]?.message ?? e.detail)
            : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    } finally {
      this.busy.set(null);
    }
  }

  /** sp.plan.undo */
  protected async keep(planName: string) {
    const ok = await this.overlays.confirm({
      title: 'Keep your current plan?',
      text: `The move to ${planName} at renewal is cancelled.`,
      ok: 'Keep current plan',
    });
    if (!ok) return;
    try {
      await this.api.undoScheduledChange();
      await this.load();
      void this.store.refresh();
      this.overlays.toast(`You'll stay on ${this.data()?.plan?.name ?? 'your plan'}`);
    } catch (e) {
      this.overlays.toast('Not changed', {
        sub: e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'),
        tone: 'bad',
      });
    }
  }

  protected paid() {
    this.payFor.set(null);
    void this.load();
    void this.store.refresh();
  }
}
