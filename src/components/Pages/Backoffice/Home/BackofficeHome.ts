import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { inrText } from '../../../Shared/Amount';
import { Avatar } from '../../../Shared/Avatar';
import { Card, Empty, Kpi, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { TaskLauncher } from '../../../Shared/TaskLauncher';
import { ago, longDate } from '../../../Utils/dates';
import { formatDate } from '../../../Utils/format';
import { greeting } from '../../../Utils/greeting';
import { ICON_PATHS, type IconName } from '../../../Utils/icons';
import { pathOf, visibleNav } from '../../../Utils/navigation';
import { ApiProblem } from '../../../Utils/problem';
import { translate } from '../../../Utils/translate';
import { InstitutionsApi, type InstitutionRow } from '../Institutions/institutions.api';
import { OpsHomeApi, type OpsHome } from './home.api';

type Shown = 'Active' | 'Trial' | 'Pending activation' | 'Suspended' | 'Cancelled';
const STATUS_ORDER: readonly Shown[] = [
  'Active',
  'Trial',
  'Pending activation',
  'Suspended',
  'Cancelled',
];
/** The prototype's STATUS_COLOR (donut and legend) and status chip tones. */
const COLOR: Record<Shown, string> = {
  Active: 'var(--ok)',
  Trial: 'var(--info)',
  'Pending activation': 'var(--accent)',
  Suspended: 'var(--bad)',
  Cancelled: 'var(--ink-4)',
};
const TONE: Record<Shown, string> = {
  Active: 'ok',
  Trial: 'info',
  'Pending activation': 'warn',
  Suspended: 'bad',
  Cancelled: 'neutral',
};
const LABEL: Record<string, Shown> = {
  ACTIVE: 'Active',
  PENDING_ACTIVATION: 'Pending activation',
  SUSPENDED: 'Suspended',
  CANCELLED: 'Cancelled',
};
const shown = (i: InstitutionRow): Shown =>
  i.status === 'ACTIVE' && i.subscriptionStatus === 'TRIAL'
    ? 'Trial'
    : (LABEL[i.status] ?? 'Active');

const DONUT = 118;
const THICK = 14;
const R = (DONUT - THICK) / 2;
const CIRC = 2 * Math.PI * R;

/**
 * o.home (SRS 25, 26.6; RPT-007; prototype o.home): greeting, the key tasks as cards (prototype v4
 * task launcher), the platform's key figures,
 * institutions needing attention and by status, alerts, scheduled processing and the shortcuts the
 * operator's role opens. Figures come from the server's home summary (never one institution's
 * records); platform volume arrives with campus payments (Phase 3).
 */
@Component({
  selector: 'rp-backoffice-home',
  imports: [Avatar, Card, Empty, Icon, Kpi, PageHead, RouterLink, TaskLauncher],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page">
      <rp-page-head [title]="title()" [sub]="sub()" />
      <!-- The key tasks as cards (prototype v4), then the platform under "Today at a glance". -->
      <rp-task-launcher surface="ops" />

      @if (error()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load the home page" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else {
        <div class="c-grid k4">
          <rp-kpi
            label="Institutions live"
            [value]="home() ? num(home()!.kpis.active) : '—'"
            [small]="home() ? 'of ' + num(home()!.kpis.tenants) : ''"
            icon="building"
            [delta]="home() ? num(home()!.kpis.pending) + ' awaiting activation' : 'Loading…'"
            [link]="can('task.tenants') ? '/backoffice/institutions' : null"
          />
          <rp-kpi
            label="Platform volume today"
            value="—"
            icon="activity"
            delta="Starts with campus payments"
          />
          <rp-kpi
            label="Invoices unpaid"
            [value]="home() ? num(home()!.kpis.openInvoices) : '—'"
            icon="receipt"
            [tone]="home()?.kpis?.overdueInvoices ? 'warn' : null"
            [delta]="home() ? openAmount() : ''"
            [link]="can('task.tenants') ? '/backoffice/plans?tab=invoices' : null"
          />
          <rp-kpi
            label="Scheduled jobs"
            [value]="jobsKpi().value"
            icon="timer"
            [tone]="jobsKpi().tone"
            [delta]="jobsKpi().delta"
            [dir]="jobsKpi().dir"
            [link]="can('task.jobs') ? '/backoffice/jobs' : null"
          />
        </div>

        <div class="c-grid s21">
          <rp-card
            title="Institutions needing attention"
            icon="building"
            [plainIcon]="true"
            [flush]="true"
          >
            @if (can('task.tenants')) {
              <a card-right class="linkbtn" routerLink="/backoffice/institutions"
                >All institutions<rp-icon name="right" [size]="14"
              /></a>
            }
            @if (attention().length) {
              <div class="list">
                @for (i of attention(); track i.id) {
                  <button type="button" class="li" (click)="openInstitution(i.id)">
                    <rp-av [name]="i.name" />
                    <span class="li-main"
                      ><span class="li-t">{{ i.name }}</span
                      ><span class="li-s">{{ attentionSub(i) }}</span></span
                    ><span class="li-r"
                      ><span [class]="'chip dot tone-' + tone(i)">{{ statusOf(i) }}</span></span
                    ><span class="li-chev"><rp-icon name="right" [size]="16" /></span>
                  </button>
                }
              </div>
            } @else {
              <rp-empty
                icon="checkc"
                title="Nothing needs attention"
                [text]="
                  can('task.tenants')
                    ? 'Institutions on trial, suspended, cancelled or awaiting activation are listed here.'
                    : 'Institutions are listed for roles with the Tenants task.'
                "
              />
            }
          </rp-card>
          <rp-card title="Institutions by status" icon="building" [plainIcon]="true">
            <span card-right class="srs" title="SRS reference">FR-INS-05</span>
            @if (home(); as h) {
              @if (h.kpis.tenants) {
                <div class="row g16 wrap" style="align-items: center">
                  <div class="ring" [style.width.px]="size" [style.height.px]="size">
                    <svg [attr.width]="size" [attr.height]="size" aria-hidden="true">
                      <circle
                        [attr.cx]="size / 2"
                        [attr.cy]="size / 2"
                        [attr.r]="r"
                        fill="none"
                        stroke="var(--surface-3)"
                        [attr.stroke-width]="thick"
                      />
                      @for (p of donut(); track p.s; let i = $index) {
                        <circle
                          [attr.cx]="size / 2"
                          [attr.cy]="size / 2"
                          [attr.r]="r"
                          fill="none"
                          [attr.stroke]="p.c"
                          [attr.stroke-width]="thick"
                          [attr.stroke-dasharray]="p.dash"
                          [attr.stroke-dashoffset]="p.offset"
                          [style.animation]="'fade .5s ' + i * 0.12 + 's both'"
                        >
                          <title>{{ p.s }}: {{ p.n }}</title>
                        </circle>
                      }
                    </svg>
                    <div class="ring-c">
                      <div>
                        <b class="t-num" style="font-size: 22px; font-family: var(--f-display)">{{
                          num(h.kpis.tenants)
                        }}</b>
                        <div class="t-xs t-muted">tenants</div>
                      </div>
                    </div>
                  </div>
                  <div class="stack g6 grow">
                    @for (c of counts(); track c.s) {
                      <button
                        type="button"
                        class="ob-srow"
                        [disabled]="!can('task.tenants')"
                        (click)="router.navigate(['/backoffice/institutions'])"
                      >
                        <i [style.background]="c.c"></i><span class="grow">{{ c.s }}</span
                        ><b class="t-num">{{ num(c.n) }}</b>
                      </button>
                    }
                  </div>
                </div>
              } @else {
                <rp-empty
                  icon="pie"
                  title="No institutions yet"
                  text="Register the first institution to see it here."
                />
              }
            } @else {
              <rp-empty icon="hourglass" title="Loading…" />
            }
          </rp-card>
        </div>

        <div class="c-grid s21">
          <div class="card">
            <div class="card-h">
              <span class="li-ic sm"><rp-icon name="bell" [size]="16" /></span>
              <span class="t-h4"
                >Alerts
                @if (home()) {
                  <span class="t-muted t-num" style="font-weight: 500"
                    >· {{ home()!.alerts.length }}</span
                  >
                }
              </span>
            </div>
            <div>
              @if (home()?.alerts?.length) {
                <div class="list">
                  @for (a of home()!.alerts; track $index) {
                    @if (alertLink(a.go); as to) {
                      <button
                        type="button"
                        [class]="'li ob-alert ' + a.tone"
                        (click)="router.navigateByUrl(to)"
                      >
                        <span class="li-ic sm"><rp-icon [name]="icon(a.icon)" [size]="16" /></span>
                        <span class="li-main"
                          ><span class="li-t wrap">{{ a.title }}</span
                          ><span class="li-s wrap">{{ a.sub }}</span></span
                        ><span class="li-chev"><rp-icon name="right" [size]="16" /></span>
                      </button>
                    } @else {
                      <div [class]="'li ob-alert ' + a.tone">
                        <span class="li-ic sm"><rp-icon [name]="icon(a.icon)" [size]="16" /></span>
                        <span class="li-main"
                          ><span class="li-t wrap">{{ a.title }}</span
                          ><span class="li-s wrap">{{ a.sub }}</span></span
                        >
                      </div>
                    }
                  }
                </div>
              } @else if (home()) {
                <rp-empty
                  icon="checkc"
                  title="Nothing needs your attention"
                  text="Alerts for your role will appear here."
                />
              } @else {
                <rp-empty icon="hourglass" title="Loading…" />
              }
            </div>
          </div>
          <rp-card title="Scheduled processing" icon="timer" [plainIcon]="true">
            @if (can('task.jobs')) {
              <a card-right class="linkbtn" routerLink="/backoffice/jobs"
                >Open<rp-icon name="right" [size]="14"
              /></a>
            } @else {
              <span card-right class="srs" title="SRS reference">26.6</span>
            }
            @if (home()?.jobs?.length) {
              <div class="stack g4">
                @for (j of home()!.jobs; track j.id) {
                  <div class="ob-jrow">
                    <span [class]="'ob-sdot ' + jobTone(j)"></span
                    ><span class="grow t-clip"
                      ><b>{{ j.name }}</b
                      >{{ ' ' }}<span class="t-muted">{{ j.time ?? '—' }}</span></span
                    ><span class="t-xs t-muted">{{ jobWhen(j) }}</span>
                    @if (j.money) {
                      <span class="chip tone-accent">Money</span>
                    }
                  </div>
                }
              </div>
            } @else if (home()) {
              <rp-empty
                icon="timer"
                title="No scheduled jobs"
                text="Each scheduled job and its last run appear here."
              />
            } @else {
              <rp-empty icon="hourglass" title="Loading…" />
            }
          </rp-card>
        </div>
      }

      @if (shortcuts().length) {
        <div>
          <div class="sec-h"><h3>Shortcuts for your role</h3></div>
          <div class="ob-short">
            @for (it of shortcuts(); track it.id) {
              <a class="ob-sc" [routerLink]="['/backoffice', path(it.id)]"
                ><rp-icon [name]="it.icon" [size]="18" /><span>{{ it.label }}</span></a
              >
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class BackofficeHome {
  private readonly api = inject(OpsHomeApi);
  private readonly institutionsApi = inject(InstitutionsApi);
  private readonly session = inject(SessionContext).ops;
  protected readonly router = inject(Router);
  protected readonly path = pathOf;
  protected readonly size = DONUT;
  protected readonly thick = THICK;
  protected readonly r = R;

  protected readonly home = signal<OpsHome | null>(null);
  protected readonly institutions = signal<readonly InstitutionRow[]>([]);
  protected readonly error = signal('');

  protected readonly title = computed(() => greeting(this.session()?.name ?? ''));
  protected readonly sub = computed(() => {
    const s = this.session();
    return s
      ? `${s.role.name} · ${longDate()} · everything below is live across every tenant you're entitled to`
      : '';
  });
  protected readonly shortcuts = computed(() =>
    visibleNav('ops', this.session()?.subTasks ?? [])
      .flatMap((g) => g.items)
      .filter((it) => it.id !== 'o.home'),
  );
  protected readonly openAmount = computed(() => {
    const h = this.home();
    return h ? inrText(h.kpis.openAmount) : '';
  });
  /** Trials are active institutions on a trial subscription (the institutions page's rule). */
  protected readonly counts = computed(() => {
    const h = this.home();
    const n = (s: string) => h?.byStatus.find((x) => x.status === s)?.count ?? 0;
    const trial = Math.min(h?.kpis.onTrial ?? 0, n('ACTIVE'));
    const by: Record<Shown, number> = {
      Active: n('ACTIVE') - trial,
      Trial: trial,
      'Pending activation': n('PENDING_ACTIVATION'),
      Suspended: n('SUSPENDED'),
      Cancelled: n('CANCELLED'),
    };
    return STATUS_ORDER.map((s) => ({ s, n: by[s], c: COLOR[s] }));
  });
  /** ui.donut: one arc per status with a 2 px gap. */
  protected readonly donut = computed(() => {
    const parts = this.counts().filter((c) => c.n > 0);
    const total = parts.reduce((t, p) => t + p.n, 0) || 1;
    let acc = 0;
    return parts.map((p) => {
      const len = (CIRC * p.n) / total;
      const out = { ...p, dash: `${Math.max(0, len - 2)} ${CIRC}`, offset: -acc };
      acc += len;
      return out;
    });
  });
  protected readonly attention = computed(() =>
    this.institutions()
      .filter((i) => shown(i) !== 'Active')
      .sort((a, b) => STATUS_ORDER.indexOf(shown(a)) - STATUS_ORDER.indexOf(shown(b))),
  );
  /** The prototype's job KPI: failures first, else all healthy. */
  protected readonly jobsKpi = computed(() => {
    const jobs = this.home()?.jobs ?? [];
    const bad = jobs.filter((j) => j.health === 'BAD');
    const scheduled = jobs.filter((j) => j.scheduled).length;
    if (!this.home()) {
      return { value: '—', tone: null, delta: 'Loading…', dir: null } as const;
    }
    if (bad.length) {
      return {
        value: `${bad.length} failed`,
        tone: 'bad',
        delta: bad.map((j) => j.name).join(', '),
        dir: 'down',
      } as const;
    }
    const ran = jobs.some((j) => j.health !== 'NONE');
    return {
      value: ran ? 'All healthy' : 'No runs yet',
      tone: ran ? 'ok' : null,
      delta: `${scheduled} scheduled · ${jobs.length - scheduled} not scheduled`,
      dir: null,
    } as const;
  });

  constructor() {
    void this.load();
  }

  protected async load() {
    this.error.set('');
    const tenants = this.can('task.tenants');
    try {
      const [home, list] = await Promise.all([
        this.api.home(),
        tenants ? this.institutionsApi.list().catch(() => null) : Promise.resolve(null),
      ]);
      this.home.set(home);
      this.institutions.set(list?.items ?? []);
    } catch (e) {
      this.error.set(e instanceof ApiProblem ? e.detail : translate('GEN.UNAVAILABLE'));
    }
  }

  protected can(subTask: string): boolean {
    return this.session()?.subTasks.includes(subTask) ?? false;
  }

  /** The page an alert opens, when the operator's menu has it. */
  protected alertLink(go: string): string | null {
    const visible = visibleNav('ops', this.session()?.subTasks ?? []).flatMap((g) => g.items);
    if (!visible.some((it) => it.id === go)) return null;
    return go === 'o.plans' ? '/backoffice/plans?tab=invoices' : `/backoffice/${pathOf(go)}`;
  }

  protected openInstitution(id: string) {
    void this.router.navigate(['/backoffice/institutions'], { queryParams: { open: id } });
  }

  protected statusOf(i: InstitutionRow) {
    return shown(i);
  }
  protected tone(i: InstitutionRow) {
    return TONE[shown(i)];
  }
  protected attentionSub(i: InstitutionRow) {
    switch (shown(i)) {
      case 'Pending activation':
        return `Onboarding ${i.checklist.done} of ${i.checklist.total} complete`;
      case 'Trial':
        return i.trialEndsOn ? `Trial ends ${formatDate(i.trialEndsOn)}` : 'On trial';
      case 'Suspended':
        return i.statusSince ? `Suspended ${formatDate(i.statusSince)}` : 'Suspended';
      case 'Cancelled':
        return `${i.statusSince ? `Cancelled ${formatDate(i.statusSince)} · ` : ''}data-retention clock running`;
      default:
        return '';
    }
  }

  protected jobTone(j: OpsHome['jobs'][number]) {
    if (!j.scheduled) return 'warn';
    if (j.health === 'NONE') return 'neutral';
    if (j.health === 'BAD') return j.money ? 'bad' : 'warn';
    return '';
  }
  protected jobWhen(j: OpsHome['jobs'][number]) {
    if (j.health === 'RUNNING') return 'Running now';
    if (j.lastRun) return ago(j.lastRun.startedAt);
    return j.scheduled ? 'No runs' : 'Not scheduled';
  }
  protected icon(name: string): IconName {
    return name in ICON_PATHS ? (name as IconName) : 'alertc';
  }
  protected num(n: number) {
    return n.toLocaleString('en-IN');
  }
}
