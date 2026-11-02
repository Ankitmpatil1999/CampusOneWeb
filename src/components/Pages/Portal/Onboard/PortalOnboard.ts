import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PortalContext } from '../../../../Context/PortalContext';
import { Card, Empty } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { ago } from '../../../Utils/dates';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { PortalApi, type Onboarding, type StepKey } from '../portal.api';
import { PortalStore } from '../portal.store';
import {
  CHECKLIST,
  Ring,
  STEP,
  byWho,
  eventOf,
  nextStep,
  planLine,
  shownStatus,
  toneOf,
} from '../Shared/PortalUi';

type Row = (typeof CHECKLIST)[number] & { index: number };

/**
 * s.onboard — the onboarding checklist (FR-SAS-10, FR-INS-01…06, UC 4.10; SAS-008; prototype
 * s.onboard): progress, who does each step, what was done, the next step to take and "Go live"
 * once every required step is complete.
 */
@Component({
  selector: 'rp-portal-onboard',
  imports: [Card, Empty, Icon, NgTemplateOutlet, Ring],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    @if (welcome() && session(); as s) {
      <div class="note tone-brand">
        <rp-icon name="sparkles" [size]="17" />
        <div class="grow">
          <b>Welcome, {{ firstName() }}.</b> {{ s.institution.name }} is registered as
          <span class="t-mono">{{ s.institution.identifier }}</span
          >. Work through the steps below — your progress is saved as you go, and CampusOne's
          onboarding team sees it too.
        </div>
      </div>
    }
    @if (error()) {
      <div class="card pad">
        <rp-empty icon="wifioff" title="Couldn't load the checklist" [text]="error()" />
      </div>
    } @else if (data(); as o) {
      <div class="sp-obh">
        <rp-sp-ring [pct]="(100 * o.done) / (o.total || 1)" [size]="96" [stroke]="8">
          <div style="text-align: center">
            <b class="t-num" style="font-size: 22px; display: block; font-family: var(--f-display)"
              >{{ o.done }}/{{ o.total }}</b
            ><small class="t-xs t-muted">steps</small>
          </div>
        </rp-sp-ring>
        <div class="grow">
          <h2>Set up {{ session()?.institution?.name }}</h2>
          <p>{{ lead() }}</p>
          <div class="row g8 wrap mt8">
            <span [class]="'chip dot tone-' + tone(shown())">{{ shown() }}</span>
            @if (o.plan; as p) {
              <span class="tag"><rp-icon name="layers" [size]="12" />{{ p.name }}</span>
            }
            <span class="srs" title="SRS reference">FR-SAS-10</span>
          </div>
        </div>
        <div class="stack g8">
          @if (o.status === 'PENDING_ACTIVATION') {
            <button
              type="button"
              class="btn btn-lg"
              [class.btn-accent]="o.canGoLive"
              [class.btn-sec]="!o.canGoLive"
              [disabled]="!o.canGoLive"
              [attr.title]="o.canGoLive ? null : 'Finish the required steps first'"
              (click)="go('/portal/activate')"
            >
              <rp-icon name="power" [size]="17" /><span>Go live</span>
            </button>
            @if (next(); as nx) {
              <button type="button" class="btn btn-ghost" (click)="open(nx)">
                <span>Continue set-up</span><rp-icon name="arrowr" [size]="15" />
              </button>
            }
          } @else {
            <button type="button" class="btn btn-sec" (click)="go('/portal/account')">
              <span>Go to overview</span>
            </button>
          }
        </div>
      </div>
      <div class="sp-ob">
        <div class="stack g10">
          <div class="sp-grp">Required to go live</div>
          @for (c of required; track c.k) {
            <ng-container *ngTemplateOutlet="row; context: { $implicit: c, o: o }" />
          }
          <div class="sp-grp" style="margin-top: 8px">Optional — make it yours</div>
          @for (c of optional; track c.k) {
            <ng-container *ngTemplateOutlet="row; context: { $implicit: c, o: o }" />
          }
        </div>
        <div class="stack g14">
          <rp-card title="Who's doing what" icon="users" [plainIcon]="true">
            <div class="stack g10 t-sm">
              <div class="row between">
                <span class="row g8"><span class="sp-who">You</span> {{ ours().length }} steps</span
                ><b class="t-num">{{ oursDone() }} done</b>
              </div>
              <div class="row between">
                <span class="row g8"
                  ><span class="sp-who rp">CampusOne</span> Bank collection account</span
                >
                @if (bankDone()) {
                  <span class="chip dot tone-ok">Done</span>
                } @else {
                  <span class="chip dot tone-warn">In progress</span>
                }
              </div>
              <p class="t-xs t-muted" style="line-height: 1.5">
                CampusOne's back office shows this same checklist for
                {{ session()?.institution?.shortName }}, so nobody has to chase anyone
                <span class="srs" title="SRS reference">FR-SAS-10</span>.
              </p>
            </div>
          </rp-card>
          <rp-card title="How you'll start" icon="layers" [plainIcon]="true">
            <div class="stack g8 t-sm">
              <dl class="kv">
                <dt>Plan</dt>
                <dd>{{ plan()?.name ?? o.plan?.name ?? '—' }}</dd>
                <dt>Price</dt>
                <dd>{{ plan() ? line() : '—' }}</dd>
                <dt>Start</dt>
                <dd>{{ startText() }}</dd>
              </dl>
              <div class="row g8">
                <button type="button" class="btn btn-ghost btn-sm" (click)="open('plan')">
                  <span>Change</span>
                </button>
              </div>
            </div>
          </rp-card>
          <rp-card title="Recent activity" icon="history" [plainIcon]="true">
            @if (recent().length) {
              <div class="tl">
                @for (h of recent(); track $index) {
                  <div class="tl-i done">
                    <span class="tl-dot"
                      ><rp-icon [name]="h.icon" [size]="13" [stroke]="2.6"
                    /></span>
                    <div class="tl-c">
                      <div class="tl-t">{{ h.title }}</div>
                      <div class="tl-s">{{ h.sub }}</div>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <rp-empty icon="history" title="Nothing yet" />
            }
          </rp-card>
        </div>
      </div>
    } @else {
      <div class="stack g16">
        <div class="sk" style="height: 140px; border-radius: 22px"></div>
        <div class="stack g8">
          @for (i of [1, 2, 3, 4, 5]; track i) {
            <div class="sk" style="height: 72px; border-radius: 16px"></div>
          }
        </div>
      </div>
    }

    <ng-template #row let-c let-o="o">
      @let st = stepOf(o, c.k);
      @let wait = c.k === 'bank' && !st?.done;
      <div
        class="sp-ck"
        [class.done]="st?.done"
        [class.wait]="wait"
        [class.next]="!st?.done && !wait && c.k === next()"
      >
        <span class="c">
          @if (st?.done) {
            <rp-icon name="check" [size]="16" [stroke]="3" />
          } @else if (wait) {
            <rp-icon name="hourglass" [size]="15" />
          } @else {
            {{ c.index + 1 }}
          }
        </span>
        <div style="min-width: 0">
          <b>{{ title(c.k) }}</b>
          <div class="d">
            @if (st?.done && st?.summary) {
              <span style="color: var(--ink-2)">{{ st?.summary }}</span>
            } @else {
              {{ desc(c.k) }}
            }
          </div>
          <div class="m">
            <span class="sp-who" [class.rp]="c.k === 'bank'">{{
              c.k === 'bank' ? 'CampusOne' : 'You'
            }}</span>
            @if (!c.req) {
              <span class="t-xs t-faint">Optional</span>
            }
            <span class="srs" title="SRS reference">{{ c.ref }}</span>
          </div>
        </div>
        <div class="r">
          @if (st?.done) {
            <button type="button" class="btn btn-ghost btn-sm" (click)="open(c.k)">
              <span>{{ c.k === 'bank' ? 'View' : 'Review' }}</span>
            </button>
          } @else if (wait) {
            <span class="chip dot tone-warn">Waiting on CampusOne</span>
            <a
              class="btn btn-ghost btn-sm btn-icon"
              title="Ask CampusOne for an update"
              aria-label="Ask CampusOne for an update"
              [href]="nudge()"
              ><rp-icon name="mail" [size]="15"
            /></a>
          } @else if (c.k === next()) {
            <button type="button" class="btn btn-pri btn-sm" (click)="open(c.k)">
              <span>Start</span><rp-icon name="arrowr" [size]="15" />
            </button>
          } @else {
            <button type="button" class="btn btn-sec btn-sm" (click)="open(c.k)">
              <span>Open</span>
            </button>
          }
        </div>
      </div>
    </ng-template>
  `,
})
export class PortalOnboard {
  private readonly api = inject(PortalApi);
  private readonly router = inject(Router);
  private readonly store = inject(PortalStore);
  protected readonly session = inject(PortalContext).session;
  protected readonly welcome = signal(inject(ActivatedRoute).snapshot.queryParamMap.has('welcome'));
  protected readonly data = signal<Onboarding | null>(null);
  protected readonly error = signal('');
  private readonly rows: readonly Row[] = CHECKLIST.map((c, index) => ({ ...c, index }));
  protected readonly required = this.rows.filter((c) => c.req);
  protected readonly optional = this.rows.filter((c) => !c.req);

  protected readonly firstName = computed(
    () => (this.session()?.name ?? '').split(/\s+/)[0]?.replace(/^./, (x) => x.toUpperCase()) ?? '',
  );
  protected readonly plan = computed(() => this.store.account()?.billing.plan ?? null);
  protected readonly shown = computed(
    () =>
      this.store.shown() ??
      shownStatus(this.data()?.status ?? this.session()?.institution.status ?? 'ACTIVE', null),
  );
  protected readonly next = computed(() => {
    const o = this.data();
    return o ? nextStep(o) : null;
  });
  protected readonly ours = computed(() => CHECKLIST.filter((c) => c.k !== 'bank'));
  protected readonly oursDone = computed(
    () => this.ours().filter((c) => this.stepOf(this.data(), c.k)?.done).length,
  );
  protected readonly bankDone = computed(() => !!this.stepOf(this.data(), 'bank')?.done);

  /** The line under the heading (prototype `lead`). */
  protected readonly lead = computed(() => {
    const o = this.data();
    const name = this.session()?.institution.name ?? '';
    if (!o) return '';
    const missing = CHECKLIST.filter((c) => c.req && !this.stepOf(o, c.k)?.done);
    if (o.status !== 'PENDING_ACTIVATION') {
      const s = this.shown();
      return `${name} is ${s === 'Trial' ? 'on its trial' : s.toLowerCase()}. Optional steps can be finished any time.`;
    }
    if (!missing.length) {
      return 'Every required step is done. Go live with a trial or by paying the first invoice.';
    }
    if (missing.length === 1 && missing[0]!.k === 'bank') {
      return "Everything on your side is done. CampusOne is setting up your bank collection account — you'll get an e-mail as soon as it's ready.";
    }
    return `${missing.length} required step${missing.length === 1 ? '' : 's'} left before you can go live. CampusOne can see this checklist and is working on the bank set-up alongside you.`;
  });

  protected readonly startText = computed(() => {
    const o = this.data();
    if (!o) return '';
    if (o.status !== 'PENDING_ACTIVATION') return this.shown();
    return o.startPreference === 'PAY'
      ? 'Pay the first invoice'
      : `${this.plan()?.trialDays ?? 30}-day free trial`;
  });

  protected readonly recent = computed(() =>
    (this.store.account()?.notices ?? []).slice(0, 5).map((h) => ({
      title: eventOf(h.action).title,
      sub: `${ago(h.at)} · ${byWho(h.by)}`,
      icon: /SUSPEND|CANCEL/.test(h.action) ? ('x' as const) : ('check' as const),
    })),
  );

  constructor() {
    void this.load();
    void this.store.refresh();
  }

  private async load() {
    try {
      this.data.set(await this.api.onboarding());
      this.error.set('');
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected stepOf(o: Onboarding | null, k: StepKey) {
    return o?.steps.find((s) => s.key === k) ?? null;
  }
  protected title(k: StepKey) {
    return STEP[k].t;
  }
  protected desc(k: StepKey) {
    return STEP[k].d;
  }
  protected tone(s: string) {
    return toneOf(s);
  }
  protected line() {
    const p = this.plan();
    return p ? planLine(p) : '';
  }
  protected go(path: string) {
    void this.router.navigateByUrl(path);
  }
  protected open(k: StepKey) {
    void this.router.navigate(['/portal/step', k]);
  }
  /** sp.ob.nudge: a note to the onboarding team. */
  protected nudge() {
    const id = this.session()?.institution.identifier ?? '';
    return `mailto:onboarding@campusone.example?subject=${encodeURIComponent(`Bank set-up update · ${id}`)}`;
  }
}
