import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionContext } from '../../../../Context/SessionContext';
import { Empty, PageHead } from '../../../Shared/Blocks';
import { Icon } from '../../../Shared/Icon';
import { TaskLauncher } from '../../../Shared/TaskLauncher';
import { longDate } from '../../../Utils/dates';
import { greeting } from '../../../Utils/greeting';
import type { IconName } from '../../../Utils/icons';
import { ownHome } from '../../../Utils/navigation';
import { problemText } from '../Structure/academic-format';
import { HomeAdmin, HomeManagement } from './HomeAdmin';
import { HomeApi, type HomeVariant, type HomeView } from './home.api';
import {
  HomeAccountant,
  HomeCoordinator,
  HomeCounsellor,
  HomeFrontDesk,
  HomeGrievance,
  HomeTransport,
} from './HomeRoles';

interface HeadAction {
  readonly l: string;
  readonly icon: IconName;
  readonly path: string;
  readonly task: string;
  readonly kind: 'pri' | 'sec';
}

/** The page-head buttons of each variant (prototype c.home actions). */
const ACTIONS: Readonly<Record<HomeVariant, readonly HeadAction[]>> = {
  admin: [
    { l: 'Reports', icon: 'report', path: '/console/reports', task: 'task.reports', kind: 'sec' },
    {
      l: 'Onboard member',
      icon: 'userplus',
      path: '/console/onboard',
      task: 'task.members',
      kind: 'pri',
    },
  ],
  management: [
    { l: 'Reports', icon: 'report', path: '/console/reports', task: 'task.reports', kind: 'sec' },
  ],
  accountant: [
    {
      l: 'Fee records',
      icon: 'receipt',
      path: '/console/feerecords',
      task: 'task.fees',
      kind: 'pri',
    },
  ],
  counsellor: [
    {
      l: 'Applications',
      icon: 'filetext',
      path: '/console/applications',
      task: 'task.admissions',
      kind: 'pri',
    },
  ],
  coordinator: [
    { l: 'Teacher leave', icon: 'plane', path: '/console/leave', task: 'task.leave', kind: 'pri' },
  ],
  transport: [
    {
      l: 'Live trips',
      icon: 'bus',
      path: '/console/transport',
      task: 'task.transport',
      kind: 'pri',
    },
  ],
  grievance: [
    {
      l: 'Grievances',
      icon: 'help',
      path: '/console/grievances',
      task: 'task.grievances',
      kind: 'pri',
    },
  ],
  frontdesk: [
    {
      l: 'Front desk',
      icon: 'door',
      path: '/console/frontdesk',
      task: 'task.frontdesk',
      kind: 'pri',
    },
  ],
};

/**
 * c.home — the role-aware home (SRS 24.4, FR-RPT-02; RPT-001; prototype c.home and HOME.*): the
 * greeting, the key tasks as cards (prototype v4 task launcher), then the variant of the signed-in role — administrator, management, accountant,
 * counsellor, academic coordinator, transport administrator, grievance officer or front desk —
 * with its four key figures and its cards. Figures come from the home API; the cards read the
 * module lists the role may open.
 */
@Component({
  selector: 'rp-console-home',
  imports: [
    Empty,
    HomeAccountant,
    HomeAdmin,
    HomeCoordinator,
    HomeCounsellor,
    HomeFrontDesk,
    HomeGrievance,
    HomeManagement,
    HomeTransport,
    Icon,
    PageHead,
    RouterLink,
    TaskLauncher,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="c-page" [attr.data-home]="view()?.variant">
      <rp-page-head [title]="title()" [sub]="sub()">
        @for (a of actions(); track a.path) {
          <a [class]="'btn btn-' + a.kind" [routerLink]="a.path"
            ><rp-icon [name]="a.icon" [size]="17" /><span>{{ a.l }}</span></a
          >
        }
      </rp-page-head>

      <!-- The key tasks as cards (prototype v4), then the role's figures under "Today at a glance". -->
      <rp-task-launcher surface="console" />

      @if (loading() && !view()) {
        <div class="stack g16" aria-busy="true" aria-label="Loading">
          <div class="c-grid k4">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="sk" style="height: 104px; border-radius: 16px"></div>
            }
          </div>
          <div class="c-grid s21">
            <div class="sk" style="height: 330px; border-radius: 16px"></div>
            <div class="sk" style="height: 330px; border-radius: 16px"></div>
          </div>
        </div>
      } @else if (error() && !view()) {
        <div class="card pad">
          <rp-empty icon="alertc" title="Couldn't load your home" [text]="error()">
            <button type="button" class="btn btn-sec btn-sm" (click)="load()">
              <span>Try again</span>
            </button>
          </rp-empty>
        </div>
      } @else if (view(); as v) {
        @switch (v.variant) {
          @case ('management') {
            <rp-home-management [view]="v" />
          }
          @case ('accountant') {
            <rp-home-accountant [view]="v" />
          }
          @case ('counsellor') {
            <rp-home-counsellor [view]="v" />
          }
          @case ('coordinator') {
            <rp-home-coordinator [view]="v" />
          }
          @case ('transport') {
            <rp-home-transport [view]="v" />
          }
          @case ('grievance') {
            <rp-home-grievance [view]="v" />
          }
          @case ('frontdesk') {
            <rp-home-frontdesk [view]="v" />
          }
          @default {
            <rp-home-admin [view]="v" />
          }
        }
      }
    </div>
  `,
})
export class ConsoleHome implements OnInit {
  private readonly api = inject(HomeApi);
  private readonly session = inject(SessionContext).console;
  private readonly router = inject(Router);

  protected readonly view = signal<HomeView | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly title = computed(() => greeting(this.session()?.name ?? ''));
  protected readonly sub = computed(() => {
    const s = this.session();
    if (!s) return '';
    return `${s.institution.name} · ${longDate()} · ${s.roles.map((r) => r.name).join(', ')}`;
  });
  protected readonly actions = computed(() => {
    const tasks = this.session()?.subTasks ?? [];
    const v = this.view()?.variant;
    return (v ? (ACTIONS[v] ?? []) : []).filter((a) => tasks.includes(a.task));
  });

  ngOnInit() {
    // A teacher with only the Teaching role lands on their own pages (Phase 10); the principal on
    // the school overview, a merchant on the counter (client 2026-10-13).
    const own = ownHome(this.session()?.subTasks ?? []);
    if (own) {
      void this.router.navigate(['/console', own], { replaceUrl: true });
      return;
    }
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.view.set(await this.api.home());
      this.error.set('');
    } catch (e) {
      this.error.set(problemText(e));
    } finally {
      this.loading.set(false);
    }
  }
}
