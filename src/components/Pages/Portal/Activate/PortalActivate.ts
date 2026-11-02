import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { PortalContext } from '../../../../Context/PortalContext';
import { Icon } from '../../../Shared/Icon';
import { Overlays } from '../../../Shared/Overlays';
import { formatDate, istBusinessDate } from '../../../Utils/format';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import {
  PortalApi,
  type Invoice,
  type Onboarding,
  type PortalPlan,
  type StepKey,
} from '../portal.api';
import { PortalStore, payable } from '../portal.store';
import { PaySheet } from '../Shared/PortalPay';
import {
  CHECKLIST,
  PageHead,
  PlanCard,
  ProcessOverlay,
  type ProcessState,
  Ring,
  STEP,
  addDays,
  cycleDays,
  cycleWord,
  daysBetween,
  feeText,
  gstOn,
  inr,
  paiseOf,
  planLine,
  runProcess,
} from '../Shared/PortalUi';

/**
 * s.activate — go live (FR-SAS-06/07, FR-INS-05, UC 4.10; SAS-010…012; prototype s.activate): a free
 * trial or Active with the first invoice once the required steps are done; during the trial, the
 * plan to continue on and its first invoice; then "You're live". The first invoice is paid by bank
 * transfer until the payment gateway arrives (Q17).
 */
@Component({
  selector: 'rp-portal-activate',
  imports: [Icon, NgTemplateOutlet, PageHead, PaySheet, PlanCard, ProcessOverlay, Ring],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <rp-sp-head [title]="title()" [sub]="sub()" />
    @if (store.account(); as a) {
      @let p = a.billing.plan;
      @if (shown() === 'Suspended') {
        <div class="note tone-bad">
          <rp-icon name="alertc" [size]="17" />
          <div class="grow">
            {{ a.institution.name }} is suspended. Pay the overdue invoice to restore it.
          </div>
          <button type="button" class="btn btn-pri btn-sm" (click)="go('/portal/billing')">
            <span>Go to billing</span>
          </button>
        </div>
      } @else if (shown() === 'Cancelled') {
        <div class="note tone-neutral">
          <rp-icon name="info" [size]="17" />
          <div class="grow">{{ a.institution.name }} was cancelled.</div>
        </div>
      } @else if (shown() === 'Active') {
        <ng-container *ngTemplateOutlet="pendNote" />
        <ng-container *ngTemplateOutlet="hero; context: { $implicit: 'paid' }" />
      } @else if (just() === 'trial' && shown() === 'Trial') {
        <ng-container *ngTemplateOutlet="hero; context: { $implicit: 'trial' }" />
      } @else if (shown() === 'Pending activation') {
        <ng-container *ngTemplateOutlet="pendNote" />
        @if (onboarding(); as o) {
          @if (missing().length) {
            <div class="sp-state st-warn">
              <span
                class="li-ic"
                style="
                  width: 52px;
                  height: 52px;
                  border-radius: 50%;
                  background: var(--warn-soft);
                  color: var(--warn);
                "
                ><rp-icon name="clipcheck" [size]="24"
              /></span>
              <div>
                <h2>A few steps before you go live</h2>
                <p>
                  Members can sign in and pay only once the required onboarding steps are complete
                  <span class="srs" title="SRS reference">FR-INS-05</span>.
                </p>
              </div>
              <div class="acts">
                <button type="button" class="btn btn-pri" (click)="go('/portal/onboard')">
                  <span>Continue onboarding</span>
                </button>
              </div>
            </div>
            <div class="stack g8">
              @for (k of missing(); track k) {
                <div class="sp-ck" [class.wait]="k === 'bank'">
                  <span class="c"
                    ><rp-icon [name]="k === 'bank' ? 'hourglass' : step(k).icon" [size]="15"
                  /></span>
                  <div>
                    <b>{{ step(k).t }}</b>
                    <div class="d">
                      {{
                        k === 'bank'
                          ? 'CampusOne is setting this up with the sponsor bank.'
                          : step(k).d
                      }}
                    </div>
                  </div>
                  <div class="r">
                    @if (k === 'bank') {
                      <span class="chip dot tone-warn">Waiting on CampusOne</span>
                    } @else {
                      <button type="button" class="btn btn-sec btn-sm" (click)="openStep(k)">
                        <span>Open</span>
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          } @else if (p) {
            <div class="sp-golive">
              <div class="sp-opt" [class.rec]="o.startPreference !== 'PAY'">
                <span class="li-ic"><rp-icon name="hourglass" [size]="20" /></span>
                <h3>Start a {{ p.trialDays }}-day free trial</h3>
                <p>
                  Every feature of {{ p.name }} from today until
                  <b>{{ date(addDays(today, p.trialDays)) }}</b
                  >. Nothing to pay now; choose how to continue before it ends.
                </p>
                <dl class="kv">
                  <dt>Plan</dt>
                  <dd>{{ p.name }}</dd>
                  <dt>Due today</dt>
                  <dd><b>₹0.00</b></dd>
                </dl>
                <button
                  type="button"
                  class="btn btn-block btn-lg"
                  [class.btn-accent]="o.startPreference !== 'PAY'"
                  [class.btn-sec]="o.startPreference === 'PAY'"
                  [class.is-busy]="busy() === 'TRIAL'"
                  (click)="startTrial()"
                >
                  <rp-icon name="hourglass" [size]="17" /><span>Start my free trial</span>
                </button>
              </div>
              <div class="sp-opt" [class.rec]="o.startPreference === 'PAY'">
                <span class="li-ic"><rp-icon name="card" [size]="20" /></span>
                <h3>Pay and go live</h3>
                <p>
                  Your first {{ cycle(p) }} cycle of {{ p.name }} starts today and renews on
                  <b>{{ date(addDays(today, days(p))) }}</b
                  >.
                </p>
                <dl class="kv">
                  <dt>Plan</dt>
                  <dd>{{ line(p) }}</dd>
                  <dt>GST {{ gstPct() }}%</dt>
                  <dd>{{ inr(tax(p)) }}</dd>
                  <dt>Total</dt>
                  <dd>
                    <b>{{ inr(total(p)) }}</b>
                  </dd>
                </dl>
                <button
                  type="button"
                  class="btn btn-block btn-lg"
                  [class.btn-accent]="o.startPreference === 'PAY'"
                  [class.btn-sec]="o.startPreference !== 'PAY'"
                  [class.is-busy]="busy() === 'PAY'"
                  (click)="payAndGoLive()"
                >
                  <rp-icon name="lock" [size]="17" /><span>Pay {{ inr(total(p)) }}</span>
                </button>
              </div>
            </div>
            <p class="t-xs t-muted">
              Want a different plan?
              <button type="button" class="linkbtn" (click)="go('/portal/plan')">
                Compare plans</button
              >. Platform fee on merchant payments: {{ fee(p) }}.
            </p>
          }
        } @else {
          <div class="sk" style="height: 260px; border-radius: 22px"></div>
        }
      } @else {
        <!-- Trial: choose the plan to continue on and pay its first invoice. -->
        <ng-container *ngTemplateOutlet="pendNote" />
        <div class="sp-state st-info">
          <rp-sp-ring [pct]="trialPct()" [size]="90" [stroke]="7">
            <div style="text-align: center">
              <b class="t-num" style="font-size: 20px; display: block">{{ trialLeft() }}</b
              ><small class="t-xs t-muted">days</small>
            </div>
          </rp-sp-ring>
          <div>
            <h2>Your trial ends {{ date(a.billing.subscription?.trialEndsOn) }}</h2>
            <p>
              Pick the plan to continue on and pay the first invoice. If the trial ends unpaid,
              {{ a.institution.name }} is suspended — nothing is deleted, but members can't sign in
              or pay until you do <span class="srs" title="SRS reference">FR-SAS-08</span>.
            </p>
          </div>
          <div></div>
        </div>
        <div class="sp-plans">
          @for (x of a.billing.plans; track x.id) {
            <rp-sp-plan
              [plan]="x"
              [rec]="x.id === selected()"
              [recLabel]="x.id === p?.id ? 'Your trial plan' : 'Selected'"
            >
              <button
                type="button"
                class="btn btn-block"
                [class.btn-pri]="x.id === selected()"
                [class.btn-sec]="x.id !== selected()"
                (click)="pick.set(x.id)"
              >
                @if (x.id === selected()) {
                  <rp-icon name="check" [size]="17" /><span>Selected</span>
                } @else {
                  <span>Choose {{ x.name }}</span>
                }
              </button>
            </rp-sp-plan>
          }
        </div>
        @if (selectedPlan(); as sp) {
          <div class="card pad-l row between wrap g16">
            <div>
              <b class="t-h4">{{ sp.name }} · first {{ cycle(sp) }} cycle</b>
              <p class="t-sm t-muted mt4">
                {{ inr(price(sp)) }} + GST {{ inr(tax(sp)) }} · renews
                {{ date(addDays(today, days(sp))) }}
                @if (sp.id !== p?.id) {
                  · switches your plan from {{ p?.name }}
                }
              </p>
            </div>
            <button
              type="button"
              class="btn btn-accent btn-lg"
              [class.is-busy]="busy() === 'PAY'"
              (click)="convert()"
            >
              <rp-icon name="lock" [size]="17" /><span>Pay {{ inr(total(sp)) }}</span>
            </button>
          </div>
        }
      }

      <ng-template #pendNote>
        @if (pending(); as v) {
          <div class="note" [class]="'note ' + (v.transfer ? 'tone-info' : 'tone-warn')">
            <rp-icon [name]="v.transfer ? 'info' : 'alert'" [size]="17" />
            <div class="grow">
              Invoice <b>{{ v.invoiceNo }}</b> for {{ inr(paise(v.total)) }} is waiting for
              payment{{
                v.transfer
                  ? ' — you reported a bank transfer on ' +
                    date(v.transfer.paidOn) +
                    '; CampusOne marks it paid when it arrives'
                  : ''
              }}.
            </div>
            <button type="button" class="btn btn-accent btn-sm" (click)="payFor.set(v)">
              <span>Pay now</span>
            </button>
          </div>
        }
      </ng-template>

      <ng-template #hero let-kind>
        <div class="card pad-l">
          <div class="sp-live">
            <div class="big">
              <svg viewBox="0 0 132 132" aria-hidden="true">
                <circle class="tr" cx="66" cy="66" r="60" />
                <circle class="vl" cx="66" cy="66" r="60" />
              </svg>
              <span class="ck"><rp-icon name="check" [size]="34" [stroke]="3" /></span>
            </div>
            <h1>{{ a.institution.name }} is live</h1>
            <p>
              @if (kind === 'trial') {
                Your {{ p?.trialDays ?? 30 }}-day trial of {{ p?.name }} runs until
                <b>{{ date(a.billing.subscription?.trialEndsOn) }}</b
                >. Members can sign in, top up and pay from today.
              } @else {
                You're on {{ p?.name }} until <b>{{ date(a.billing.subscription?.renewsOn) }}</b
                >. Members can sign in, top up and pay from today.
              }
              We've e-mailed your contacts.
            </p>
            <div class="sp-next">
              <div class="card pad stack g8">
                <span class="li-ic sm"><rp-icon name="monitor" [size]="16" /></span>
                <b class="t-h4">Open the institution console</b>
                <p class="t-sm t-muted" style="line-height: 1.5">
                  Your administrator signs in to the console with the same CampusOne account to run
                  day-to-day operations.
                </p>
                <a class="btn btn-sec btn-sm" href="/console" target="_blank" rel="noopener"
                  ><span>Open</span></a
                >
              </div>
              <div class="card pad stack g8">
                <span class="li-ic sm"><rp-icon name="mobile" [size]="16" /></span>
                <b class="t-h4">Invite members to the app</b>
                <p class="t-sm t-muted" style="line-height: 1.5">
                  Imported members get an SMS to download CampusOne and sign in with their mobile
                  number.
                </p>
                <a class="btn btn-sec btn-sm" href="/console/onboard" target="_blank" rel="noopener"
                  ><span>Open</span></a
                >
              </div>
              <div class="card pad stack g8">
                <span class="li-ic sm"><rp-icon name="dash" [size]="16" /></span>
                <b class="t-h4">See your subscription</b>
                <p class="t-sm t-muted" style="line-height: 1.5">
                  Plan, usage, invoices and notices — all in this portal.
                </p>
                <button type="button" class="btn btn-sec btn-sm" (click)="go('/portal/account')">
                  <span>Go to overview</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </ng-template>
    } @else if (store.error()) {
      <div class="note tone-bad">
        <rp-icon name="alertc" [size]="17" />
        <div class="grow">{{ store.error() }}</div>
      </div>
    } @else {
      <div class="sk" style="height: 260px; border-radius: 22px"></div>
    }

    <rp-sp-process [state]="process()" />
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
export class PortalActivate {
  private readonly api = inject(PortalApi);
  private readonly ctx = inject(PortalContext);
  private readonly router = inject(Router);
  private readonly overlays = inject(Overlays);
  protected readonly store = inject(PortalStore);

  protected readonly just = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((q) => q.get('just'))),
    { initialValue: null },
  );
  protected readonly today = istBusinessDate();
  protected readonly addDays = addDays;
  protected readonly onboarding = signal<Onboarding | null>(null);
  protected readonly busy = signal<'TRIAL' | 'PAY' | null>(null);
  protected readonly process = signal<ProcessState | null>(null);
  protected readonly payFor = signal<Invoice | null>(null);
  protected readonly pick = signal<string | null>(null);

  protected readonly shown = computed(() => this.store.shown());
  protected readonly gstPct = computed(() =>
    String(Number(this.store.account()?.billing.billing.gstPercent ?? 18)),
  );
  protected readonly missing = computed<StepKey[]>(() => {
    const o = this.onboarding();
    if (!o) return [];
    return CHECKLIST.filter((c) => c.req && !o.steps.find((s) => s.key === c.k)?.done).map(
      (c) => c.k,
    );
  });
  /** The first-cycle invoice still waiting for payment (prototype `pend`). */
  protected readonly pending = computed(
    () =>
      (this.store.account()?.billing.invoices ?? []).find(
        (v) => v.trigger === 'PLAN_ACTIVATION' && payable(v) && paiseOf(v.total) > 0,
      ) ?? null,
  );
  protected readonly selected = computed(
    () => this.pick() ?? this.store.account()?.billing.plan?.id ?? null,
  );
  protected readonly selectedPlan = computed(
    () => this.store.account()?.billing.plans.find((p) => p.id === this.selected()) ?? null,
  );
  protected readonly trialLeft = computed(() => {
    const t = this.store.account()?.billing.subscription?.trialEndsOn;
    return t ? Math.max(0, daysBetween(this.today, t)) : 0;
  });
  protected readonly trialPct = computed(() => {
    const days = this.store.account()?.billing.plan?.trialDays || 30;
    return Math.max(0, Math.min(100, (100 * this.trialLeft()) / days));
  });

  protected readonly title = computed(() => {
    const s = this.shown();
    if (this.just() && (s === 'Trial' || s === 'Active')) return "You're live";
    if (s === 'Trial') return 'Choose a plan';
    if (s === 'Pending activation' || !s) return 'Go live';
    return "You're live";
  });
  protected readonly sub = computed(() => {
    const s = this.shown();
    if (this.just()) return '';
    if (s === 'Trial') {
      return `Your trial ends ${this.date(this.store.account()?.billing.subscription?.trialEndsOn)}. Pay the first invoice to keep everything running.`;
    }
    if (s === 'Pending activation') {
      return "Start a free trial or pay the first invoice. Members can sign in the moment you're live.";
    }
    return '';
  });

  constructor() {
    void this.store.refresh();
    void this.loadChecklist();
  }

  private async loadChecklist() {
    try {
      this.onboarding.set(await this.api.onboarding());
    } catch {
      /* the account frame shows the error state */
    }
  }

  protected step(k: StepKey) {
    return STEP[k];
  }
  protected date(v: string | null | undefined) {
    return v ? formatDate(v) : '—';
  }
  protected inr(paise: number) {
    return inr(paise);
  }
  protected paise(m: Invoice['total']) {
    return paiseOf(m);
  }
  protected price(p: PortalPlan) {
    return paiseOf(p.price);
  }
  protected tax(p: PortalPlan) {
    return gstOn(paiseOf(p.price), this.store.account()?.billing.billing.gstPercent ?? 18);
  }
  protected total(p: PortalPlan) {
    return paiseOf(p.price) + this.tax(p);
  }
  protected line(p: PortalPlan) {
    return planLine(p);
  }
  protected fee(p: PortalPlan) {
    return feeText(p);
  }
  protected cycle(p: PortalPlan) {
    return cycleWord(p);
  }
  protected days(p: PortalPlan) {
    return cycleDays(p);
  }
  protected go(path: string) {
    void this.router.navigateByUrl(path);
  }
  protected openStep(k: StepKey) {
    void this.router.navigate(['/portal/step', k]);
  }

  private goingLive(name: string, short: string) {
    return {
      title: 'Going live',
      sub: name,
      icon: 'power' as const,
      steps: [
        'Required onboarding steps complete',
        'Plan entitlements applied to features',
        'Member sign-in and payments enabled',
        `Tonight's scheduled processing includes ${short}`,
        'Contacts notified by e-mail',
      ],
    };
  }

  private failText(e: unknown) {
    return e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE');
  }

  private async afterLive() {
    await Promise.all([this.ctx.load(), this.store.refresh()]);
    void this.loadChecklist();
  }

  /** sp.go.trial */
  protected async startTrial() {
    const a = this.store.account();
    const p = a?.billing.plan;
    if (!a || !p || this.busy()) return;
    const end = addDays(this.today, p.trialDays);
    const ok = await this.overlays.confirm({
      title: `Start your trial of ${p.name}?`,
      text: `${a.institution.name} goes live now. The trial ends on ${formatDate(end)}; we'll remind your contacts a week before.`,
      ok: 'Start trial',
      icon: 'hourglass',
    });
    if (!ok) return;
    this.busy.set('TRIAL');
    try {
      await runProcess(
        this.process,
        this.goingLive(a.institution.name, this.ctx.session()?.institution.shortName ?? ''),
        () => this.api.goLive('TRIAL'),
        (e) => this.failText(e),
      );
      await this.afterLive();
      await this.router.navigate(['/portal/activate'], { queryParams: { just: 'trial' } });
      const ends = this.store.account()?.billing.subscription?.trialEndsOn ?? end;
      this.overlays.toast(`${a.institution.name} is live`, {
        sub: `Trial ends ${formatDate(ends)}`,
      });
    } catch (e) {
      this.refused(e);
    } finally {
      this.busy.set(null);
    }
  }

  /**
   * sp.go.pay before go-live: the institution goes live with the first invoice (SAS-010 mode PAY),
   * which is then paid — by bank transfer until the gateway arrives.
   */
  protected async payAndGoLive() {
    const a = this.store.account();
    const p = a?.billing.plan;
    if (!a || !p || this.busy()) return;
    const ok = await this.overlays.confirm({
      title: `Go live on ${p.name}?`,
      text: `${a.institution.name} goes live now and the first ${cycleWord(p)} cycle is billed: ${inr(this.total(p))} including GST, due in ${a.billing.billing.dueDays} days.`,
      ok: 'Go live',
      icon: 'power',
    });
    if (!ok) return;
    this.busy.set('PAY');
    try {
      const out = await runProcess(
        this.process,
        this.goingLive(a.institution.name, this.ctx.session()?.institution.shortName ?? ''),
        () => this.api.goLive('PAY'),
        (e) => this.failText(e),
      );
      await this.afterLive();
      await this.router.navigate(['/portal/activate'], { queryParams: { just: 'paid' } });
      await this.openInvoice(out.invoice?.id);
      if (out.invoice) {
        this.overlays.toast(`${a.institution.name} is live`, {
          sub: `Invoice ${out.invoice.invoiceNo} for ${inr(paiseOf(out.invoice.total))} · due ${formatDate(out.invoice.dueOn)}`,
        });
      }
    } catch (e) {
      this.refused(e);
    } finally {
      this.busy.set(null);
    }
  }

  /** sp.go.pay during the trial: the chosen plan, then the first invoice (the trial converts). */
  protected async convert() {
    const a = this.store.account();
    const sp = this.selectedPlan();
    if (!a || !sp || this.busy()) return;
    const switching = sp.id !== a.billing.plan?.id;
    const ok = await this.overlays.confirm({
      title: `Continue on ${sp.name}?`,
      text: `Your trial converts now${switching ? ` and your plan switches to ${sp.name}` : ''}: the first ${cycleWord(sp)} cycle starts today and an invoice of ${inr(this.total(sp))} including GST is issued.`,
      ok: `Pay ${inr(this.total(sp))}`,
      icon: 'card',
    });
    if (!ok) return;
    this.busy.set('PAY');
    try {
      if (switching) await this.api.changePlan(sp.id, 'NOW');
      const out = await this.api.goLive('PAY');
      await this.afterLive();
      await this.openInvoice(out.invoice?.id);
    } catch (e) {
      this.refused(e);
    } finally {
      this.busy.set(null);
    }
  }

  private async openInvoice(id: string | undefined) {
    if (!id) return;
    const v =
      this.store.account()?.billing.invoices.find((x) => x.id === id) ??
      (await this.api.invoice(id).catch(() => null));
    if (v) this.payFor.set(v);
  }

  private refused(e: unknown) {
    this.overlays.toast('Not live yet', { sub: this.failText(e), tone: 'bad' });
    void this.store.refresh();
    void this.loadChecklist();
  }

  protected paid() {
    this.payFor.set(null);
    void this.store.refresh();
  }
}
