import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
    const found = ctl.match((r) => match(r.urlWithParams) && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
}

const admin = {
  name: 'ARJUN MEHTA',
  email: 'arjun@campusone.example',
  role: { code: 'PLATFORM_ADMIN', name: 'Platform Administrator' },
  subTasks: ['home.view', 'jobs.view', 'task.home', 'task.tenants', 'task.jobs', 'task.platform'],
  preferredLang: 'en',
};

const money = (amount: string) => ({ amount, currency: 'INR' });

const home = {
  kpis: {
    tenants: 9,
    active: 6,
    onTrial: 1,
    pending: 1,
    openInvoices: 3,
    openAmount: money('231421.60'),
    overdueInvoices: 1,
    pendingApprovals: 2,
  },
  byStatus: [
    { status: 'PENDING_ACTIVATION', count: 1 },
    { status: 'ACTIVE', count: 6 },
    { status: 'SUSPENDED', count: 1 },
    { status: 'CANCELLED', count: 1 },
  ],
  jobs: [
    {
      id: 'merchant-settlement',
      name: 'Merchant settlement run',
      time: '23:30',
      money: true,
      scheduled: true,
      lastRun: {
        status: 'SUCCESS',
        startedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
        endedAt: null,
      },
      health: 'OK',
    },
    {
      id: 'wallet-rollover',
      name: 'Wallet balance roll-over',
      time: '23:45',
      money: true,
      scheduled: true,
      lastRun: { status: 'FAILED', startedAt: '2026-10-02T18:15:00.000Z', endedAt: null },
      health: 'BAD',
    },
    {
      id: 'comm-purge',
      name: 'Communication log purge',
      time: null,
      money: false,
      scheduled: false,
      lastRun: null,
      health: 'NONE',
    },
  ],
  alerts: [
    {
      tone: 'bad',
      icon: 'timer',
      title: 'Wallet balance roll-over failed',
      sub: 'Last run 02 Oct 2026 · 11:45 PM',
      go: 'o.jobs',
    },
    {
      tone: 'warn',
      icon: 'approve',
      title: '2 requests waiting for a decision',
      sub: 'Corrections and institution detail changes',
      go: 'o.approvals',
    },
  ],
};

const inst = (over: object) => ({
  id: 'i-1',
  identifier: 'RNGTUNVID000420621',
  name: 'Tunga Valley Public School',
  shortName: 'TVPS',
  city: 'Shivamogga',
  status: 'ACTIVE',
  statusSince: null,
  plan: { id: 'p-1', code: 'CAMPUS_PLUS', name: 'Campus Plus', cycle: 'ANNUAL' },
  subscriptionStatus: 'ACTIVE',
  trialEndsOn: null,
  members: 120,
  checklist: { done: 9, total: 9 },
  registeredAt: '2026-06-01T05:00:00.000Z',
  ...over,
});

describe('back-office home and search (RPT-007, RPT-008)', () => {
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
    (await request((u) => u === '/api/v1/ops/session')).flush(admin);
    await nav;
    return harness;
  }

  it('shows the platform figures, institutions needing attention, alerts and jobs', async () => {
    const harness = await open('/backoffice');
    (await request((u) => u === '/api/v1/ops/home')).flush(home);
    (await request((u) => u === '/api/v1/ops/institutions')).flush({
      items: [
        inst({}),
        inst({
          id: 'i-2',
          name: 'Bhadra Valley PU College',
          subscriptionStatus: 'TRIAL',
          trialEndsOn: '2026-10-12',
        }),
        inst({
          id: 'i-3',
          name: 'Hampi Heritage School',
          status: 'PENDING_ACTIVATION',
          checklist: { done: 5, total: 9 },
        }),
        inst({
          id: 'i-4',
          name: 'Coastal Pearl School',
          status: 'SUSPENDED',
          statusSince: '2026-09-18T05:00:00.000Z',
        }),
      ],
    });
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;

    const kpis = [...el.querySelectorAll('.kpi')].map((k) => ({
      v: k.querySelector('.k-v')?.textContent?.replace(/\s+/g, ' ').trim(),
      d: k.querySelector('.k-d')?.textContent?.trim(),
    }));
    expect(kpis).toEqual([
      { v: '6 of 9', d: '1 awaiting activation' },
      { v: '—', d: 'Starts with campus payments' },
      { v: '3', d: '₹2,31,421.60' },
      { v: '1 failed', d: 'Wallet balance roll-over' },
    ]);
    expect(el.querySelector('.kpi .k-d.down')).not.toBeNull();

    const attention = [...el.querySelectorAll('.card')].find((c) =>
      c.textContent?.includes('Institutions needing attention'),
    ) as HTMLElement;
    const rows = [...attention.querySelectorAll('.li')].map((li) => [
      li.querySelector('.li-t')?.textContent?.trim(),
      li.querySelector('.li-s')?.textContent?.trim(),
      li.querySelector('.chip')?.textContent?.trim(),
    ]);
    expect(rows).toEqual([
      ['Bhadra Valley PU College', 'Trial ends 12 Oct 2026', 'Trial'],
      ['Hampi Heritage School', 'Onboarding 5 of 9 complete', 'Pending activation'],
      ['Coastal Pearl School', 'Suspended 18 Sep 2026', 'Suspended'],
    ]);

    const legend = [...el.querySelectorAll('.ob-srow')].map((r) => [
      r.querySelector('span')?.textContent?.trim(),
      r.querySelector('b')?.textContent?.trim(),
    ]);
    expect(legend).toEqual([
      ['Active', '5'],
      ['Trial', '1'],
      ['Pending activation', '1'],
      ['Suspended', '1'],
      ['Cancelled', '1'],
    ]);
    expect(el.querySelector('.ring-c b')?.textContent?.trim()).toBe('9');
    expect(el.querySelectorAll('.ring circle').length).toBe(1 + 5);

    const alerts = [...el.querySelectorAll('.ob-alert')] as HTMLElement[];
    expect(alerts.map((a) => [...a.classList].sort().join(' '))).toEqual([
      'bad li ob-alert',
      'li ob-alert warn',
    ]);
    // RPT-007 formats the sub-text; it is shown as sent.
    expect(alerts[0]?.querySelector('.li-s')?.textContent).toBe('Last run 02 Oct 2026 · 11:45 PM');

    const jobs = [...el.querySelectorAll('.ob-jrow')].map((j) => [
      [...(j.querySelector('.ob-sdot')?.classList ?? [])].sort().join(' '),
      j.querySelector('.t-clip')?.textContent?.trim(),
      j.querySelector('.t-xs')?.textContent?.trim(),
      j.querySelector('.chip')?.textContent?.trim() ?? null,
    ]);
    expect(jobs).toEqual([
      ['ob-sdot', 'Merchant settlement run 23:30', '2 hr ago', 'Money'],
      ['bad ob-sdot', 'Wallet balance roll-over 23:45', expect.any(String), 'Money'],
      ['ob-sdot warn', 'Communication log purge —', 'Not scheduled', null],
    ]);

    // An alert opens its page.
    const router = TestBed.inject(Router);
    alerts[1]?.click();
    for (let i = 0; i < 30 && router.url !== '/backoffice/approvals'; i++) await tick();
    expect(router.url).toBe('/backoffice/approvals');
  });

  it('shows the error and retries', async () => {
    const harness = await open('/backoffice');
    (await request((u) => u === '/api/v1/ops/home')).flush(
      { code: 'GEN.INTERNAL', status: 500, detail: 'x' },
      { status: 500, statusText: 'Server Error' },
    );
    (await request((u) => u === '/api/v1/ops/institutions')).flush({ items: [] });
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('.empty h4')?.textContent).toBe("Couldn't load the home page");
    expect(el.querySelector('.empty p')?.textContent).toBe(
      'Something went wrong. Please try again.',
    );
    (el.querySelector('.empty button') as HTMLButtonElement).click();
    await request((u) => u === '/api/v1/ops/home');
  });

  it('searches institutions and invoices from ?q= and opens an invoice in Plans & billing', async () => {
    const harness = await open('/backoffice/search?q=tu');
    (await request((u) => u === '/api/v1/ops/search?q=tu')).flush({
      institutions: [
        {
          id: 'i-1',
          identifier: 'RNGTUNVID000420621',
          name: 'Tunga Valley Public School',
          shortName: 'TVPS',
          city: 'Shivamogga',
          status: 'ACTIVE',
          subscription: 'ACTIVE',
          plan: 'Campus Plus',
        },
        {
          id: 'i-2',
          identifier: 'RNGTUNVID000430621',
          name: 'Tunga Valley College',
          shortName: 'TVC',
          city: 'Shivamogga',
          status: 'ACTIVE',
          subscription: 'TRIAL',
          plan: 'Campus',
        },
      ],
      invoices: [
        {
          id: 'v-1',
          invoiceNo: 'INV-2026-00003',
          institution: 'Tunga Valley Public School',
          status: 'OVERDUE',
          total: money('212400.00'),
          issuedOn: '2026-09-28',
        },
      ],
    });
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('.c-ph p')?.textContent).toBe(
      'Results for “tu” across the areas your role can see',
    );
    expect((el.querySelector('#ob-sq') as HTMLInputElement).value).toBe('tu');
    expect([...el.querySelectorAll('.sec-h h3')].map((h) => h.textContent?.trim())).toEqual([
      'Institutions · 2',
      'Invoices · 1',
    ]);
    const items = [...el.querySelectorAll('.list .li')] as HTMLElement[];
    expect(items[0]?.textContent).toContain('RNGTUNVID000420621 · Shivamogga · Campus Plus');
    // RPT-008 carries the subscription: an active institution on a trial shows Trial.
    const chip = (i: number) => items[i]?.querySelector('.chip');
    expect([chip(0)?.textContent?.trim(), chip(0)?.classList.contains('tone-ok')]).toEqual([
      'Active',
      true,
    ]);
    expect([chip(1)?.textContent?.trim(), chip(1)?.classList.contains('tone-info')]).toEqual([
      'Trial',
      true,
    ]);
    expect(items[2]?.textContent?.replace(/\s+/g, '')).toContain('₹2,12,400.00');
    expect(items[2]?.querySelector('.chip')?.textContent?.trim()).toBe('Overdue');
    items[2]?.click();
    const router = TestBed.inject(Router);
    for (let i = 0; i < 30 && router.url !== '/backoffice/plans?invoice=v-1'; i++) await tick();
    expect(router.url).toBe('/backoffice/plans?invoice=v-1');
  });

  it('asks for two characters, then reports nothing found and errors', async () => {
    const harness = await open('/backoffice/search?q=t');
    await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    expect(el.querySelector('.empty h4')?.textContent).toBe('Type at least two characters');
    const ctl = TestBed.inject(HttpTestingController);
    expect(ctl.match((r) => r.url === '/api/v1/ops/search').length).toBe(0);

    await harness.navigateByUrl('/backoffice/search?q=zzzz');
    (await request((u) => u === '/api/v1/ops/search?q=zzzz')).flush({
      institutions: [],
      invoices: [],
    });
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    expect(el.querySelector('.empty h4')?.textContent).toBe('No results for “zzzz”');
    expect(el.querySelector('.empty p')?.textContent).toContain(
      'Your role (Platform Administrator) searches institutions and invoices.',
    );

    await harness.navigateByUrl('/backoffice/search?q=boom');
    (await request((u) => u === '/api/v1/ops/search?q=boom')).flush(
      { code: 'GEN.INTERNAL', status: 500, detail: 'x' },
      { status: 500, statusText: 'Server Error' },
    );
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    const now = harness.routeNativeElement as HTMLElement;
    expect(now.querySelector('.empty h4')?.textContent).toBe("Couldn't search");
  });
});
