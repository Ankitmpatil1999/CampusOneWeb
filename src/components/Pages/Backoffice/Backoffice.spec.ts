import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../Config';
import { appRoutes } from '../../../App.routes';
import { apiInterceptor } from '../../Utils/api';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function request(url: string, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
    const found = ctl.match((r) => r.urlWithParams === url && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} ${url}`);
}

const admin = {
  name: 'ARJUN MEHTA',
  email: 'arjun@campusone.example',
  role: { code: 'PLATFORM_ADMIN', name: 'Platform Administrator' },
  subTasks: ['home.view', 'roles.edit', 'jobs.view', 'task.home', 'task.platform', 'task.jobs'],
  preferredLang: 'en',
};

const tasks = [
  {
    scope: 'OPERATOR',
    code: 'home',
    name: 'Home',
    cr: null,
    subTasks: [{ code: 'home.view', name: 'Overview and search' }],
  },
  {
    scope: 'OPERATOR',
    code: 'jobs',
    name: 'Scheduled processing',
    cr: null,
    subTasks: [
      { code: 'jobs.view', name: 'View runs and run logs' },
      { code: 'jobs.run', name: 'Run a job now' },
    ],
  },
];

const role = (over: object) => ({
  id: 'r-1',
  code: 'RECON_OFFICER',
  name: 'Reconciliation Officer',
  description: 'Statements, mismatches, refunds and chargebacks',
  scope: 'OPERATOR',
  status: 'ACTIVE',
  readOnly: false,
  tasks: ['home', 'jobs'],
  subTasks: ['home.view', 'jobs.view'],
  holders: [{ name: 'Ananya Iyer' }],
  holderCount: 1,
  version: 3,
  ...over,
});

describe('back-office pages', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CAMPUSONE_WEB_CONFIG, useValue: WEB_CONFIG },
        provideRouter(appRoutes),
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
      ],
    });
  });

  async function open(url: string) {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl(url);
    (await request('/api/v1/ops/session')).flush(admin);
    await nav;
    return harness;
  }

  it('shows roles with their tasks and grants a sub-task with a recorded reason', async () => {
    const harness = await open('/backoffice/roles');
    (await request('/api/v1/ops/tasks?scope=OPERATOR')).flush({ items: tasks });
    (await request('/api/v1/ops/roles')).flush({
      items: [
        role({}),
        role({
          id: 'r-2',
          code: 'ACCOUNTANT',
          name: 'Accountant',
          scope: 'INSTITUTION',
          tasks: ['home'],
        }),
      ],
    });
    (await request('/api/v1/ops/accounts')).flush({ items: [] });
    (await request('/api/v1/ops/role-changes')).flush({ items: [] });
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('.c-ph h1')?.textContent).toBe('Roles & tasks');
    expect(
      [...el.querySelectorAll('.tab')].map((t) => t.textContent?.replace(/\s+/g, ' ').trim()),
    ).toEqual(['Operator roles1', 'Institution roles1', 'Operator accounts0', 'Change record0']);
    expect(el.querySelector('.card-b p')?.textContent).toContain('held by Ananya Iyer');
    const run = [...el.querySelectorAll('.ob-sub')].find((s) =>
      s.textContent?.includes('Run a job now'),
    );
    expect(run?.querySelector('.toggle')?.getAttribute('aria-checked')).toBe('false');
    (run?.querySelector('.toggle') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    const dialog = document.querySelector('.modal') as HTMLElement;
    expect(dialog.querySelector('h3')?.textContent?.trim()).toBe(
      'Grant “Run a job now” to Reconciliation Officer?',
    );
    const reason = dialog.querySelector('textarea') as HTMLTextAreaElement;
    reason.value = 'Recon officers re-run the roll-over';
    reason.dispatchEvent(new Event('input'));
    [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Grant')?.click();
    const patch = await request('/api/v1/ops/roles/r-1', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v3"');
    expect(patch.request.body).toEqual({
      action: 'GRANT',
      subTask: 'jobs.run',
      reason: 'Recon officers re-run the roll-over',
    });
  });

  it('lists the scheduled processes with the phase that brings each', async () => {
    const harness = await open('/backoffice/jobs');
    (await request('/api/v1/ops/jobs')).flush({
      items: [
        {
          id: 'wallet-rollover',
          name: 'Wallet balance roll-over',
          module: 'WAL 8.15',
          ref: 'FR-WAL-10',
          time: '23:45',
          scheduleNote: null,
          scheduleLabel: null,
          scheduleDetail: null,
          scheduled: true,
          money: true,
          phase: 3,
          unit: 'wallets',
          does: 'Opening balance ← previous closing.',
          window: 'The calendar day ending at 23:45',
          previous: 'Rolls the missed day first.',
          twice: 'Idempotent per wallet and date.',
          available: false,
          lastRun: null,
        },
      ],
    });
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    const row = el.querySelector('tbody tr') as HTMLElement;
    expect(row.textContent).toContain('Wallet balance roll-over');
    expect(row.textContent).toContain('Arrives in Phase 3');
    expect((row.querySelector('.btn') as HTMLButtonElement).disabled).toBe(true);
  });
});
