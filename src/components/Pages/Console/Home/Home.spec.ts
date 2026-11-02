import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import type { HomeView } from './home.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
function words(el: Element | null | undefined) {
  if (!el) return '';
  const out: string[] = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) out.push(w.currentNode.textContent ?? '');
  return out.join(' ').replace(/\s+/g, ' ').trim();
}
async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 80; i++) {
    const found = ctl.match((r) => match(r.urlWithParams) && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
}
/** Answers every pending request the matcher picks (the collections chart reads ten days). */
async function flushAll(match: (url: string) => boolean, body: (url: string) => object) {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 80; i++) {
    const found = ctl.match((x) => match(x.urlWithParams));
    if (found.length) {
      for (const r of found) r.flush(body(r.request.urlWithParams));
      return found.length;
    }
    await tick();
  }
  throw new Error('no request');
}

const session = (role: { code: string; name: string; readOnly: boolean }, tasks: string[]) => ({
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [role],
  subTasks: ['home.view', 'task.home', ...tasks],
  preferredLang: 'en',
});
const ADMIN = { code: 'INSTITUTION_ADMIN', name: 'Institution Administrator', readOnly: false };
const money = (amount: string) => ({ amount, currency: 'INR' });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

const adminView: HomeView = {
  variant: 'admin',
  date: today,
  year: { id: 'y-1', label: '2026-27' },
  kpis: {
    members: { active: 1381, inactive: 6, suspended: 3 },
    collectionsToday: { count: 46, amount: money('8664.00') },
    attendanceToday: { students: 651, attended: 618, absent: 33, percentage: 94.9 },
    pendingApprovals: 2,
  },
};

describe('console home (RPT-001)', () => {
  let harness: RouterTestingHarness;

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

  async function settle(n = 4) {
    for (let i = 0; i < n; i++) await tick();
    harness.detectChanges();
  }
  async function open(sess: ReturnType<typeof session>, view: HomeView | null) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console');
    (await request((u) => u === '/api/v1/console/session')).flush(sess);
    await nav;
    await settle();
    const home = await request((u) => u === '/api/v1/console/home');
    if (view) home.flush(view);
    else home.flush({ code: 'GEN.INTERNAL', detail: 'x' }, { status: 500, statusText: 'Error' });
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  it("shows the administrator's figures, collections, payment modes, activity, alerts and jobs", async () => {
    const el = await open(
      session(ADMIN, [
        'task.recon',
        'task.approvals',
        'task.readers',
        'task.members',
        'task.reports',
      ]),
      adminView,
    );
    expect(text(el.querySelector('.c-ph h1'))).toMatch(
      /^Good (morning|afternoon|evening), Prakash$/,
    );
    expect(text(el.querySelector('.c-pa'))).toContain('Onboard member');
    const kpis = text(el.querySelector('#home-kpis'));
    expect(kpis).toContain('1,381');
    expect(kpis).toContain('6 inactive · 3 suspended');
    expect(kpis).toContain('₹8,664');
    expect(kpis).toContain('46 payments');
    expect(kpis).toContain('94.9%');
    expect(kpis).toContain('618 of 651 students · 33 absent');

    // Ten one-day runs of the transactions report: successful payments only.
    await flushAll(
      (u) => u.startsWith('/api/v1/console/reports/transactions-by-institution'),
      (u) => ({
        rows: u.includes(`from=${today}`)
          ? [
              { channel: 'STATIC_QR', status: 'SUCCESS', count: 3, amount: money('300.00') },
              { channel: 'NFC', status: 'SUCCESS', count: 1, amount: money('100.00') },
              { channel: 'TUITION', status: 'FAILURE', count: 2, amount: money('9000.00') },
            ]
          : [{ channel: 'STATIC_QR', status: 'SUCCESS', count: 1, amount: money('100.00') }],
      }),
    );
    (await request((u) => u.startsWith('/api/v1/console/approvals'))).flush({
      items: [
        {
          id: 'a-1',
          no: 'APR-0007',
          module: 'GRIEVANCE_UPDATE',
          area: 'Grievances',
          action: 'Priority 1 ticket update',
          summary: 'TKT-000005 — refund ₹20.00',
          status: 'PENDING',
          maker: { name: 'REKHA KAMATH', you: false },
          raisedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        },
      ],
    });
    (await request((u) => u === '/api/v1/console/readers')).flush({
      items: [
        {
          id: 't-1',
          name: 'Science lab',
          location: 'Block C',
          purpose: 'LOCATION',
          status: 'ACTIVE',
          paired: true,
          lastSeenAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
          online: false,
        },
      ],
    });
    (await request((u) => u.startsWith('/api/v1/console/job-runs'))).flush({
      items: [
        {
          runId: 'r-2',
          job: { id: 'trip-generation', name: 'Trip generation' },
          status: 'SUCCESS',
          runStatus: 'SUCCESS',
          note: '12 trips created',
          startedAt: new Date().toISOString(),
        },
        {
          runId: 'r-1',
          job: { id: 'trip-generation', name: 'Trip generation' },
          status: 'SUCCESS',
          runStatus: 'SUCCESS',
          note: 'older run',
          startedAt: new Date().toISOString(),
        },
      ],
    });
    await settle(6);

    const chart = el.querySelector('#home-collections');
    expect(chart?.querySelectorAll('rect.bar-r')).toHaveLength(10);
    expect(text(el)).toContain('10-day total ₹1,300');
    expect(text(el)).toContain('Today so far ₹400');
    expect(text(el.querySelector('.cp-leg'))).toContain('Static QR');
    expect(text(el.querySelector('.cp-leg'))).toContain('NFC');
    expect(text(el.querySelector('.cp-leg'))).not.toContain('Tuition');
    expect(text(el.querySelector('#home-feed'))).toContain(
      'Rekha Kamath raised “Priority 1 ticket update” for approval',
    );
    expect(text(el.querySelector('#home-kpis'))).toContain('1 for grievances');
    const alerts = [...el.querySelectorAll('.cp-alert')].map((a) => text(a));
    expect(alerts.some((a) => a.includes('3 members suspended'))).toBe(true);
    expect(alerts.some((a) => a.includes('Science lab reader is offline'))).toBe(true);
    expect(text(el.querySelector('#home-jobs'))).toContain('12 trips created');
    expect(text(el.querySelector('#home-jobs'))).not.toContain('older run');
    const qa = [...el.querySelectorAll('.cp-qa button')].map((b) => text(b));
    expect(qa).toEqual(['Onboard a member', 'Register a reader', 'All reports']);
  });

  it('shows management its read-only governance view', async () => {
    const el = await open(
      session({ code: 'MANAGEMENT', name: 'Management', readOnly: true }, [
        'task.approvals',
        'task.reports',
      ]),
      {
        variant: 'management',
        date: today,
        year: { id: 'y-1', label: '2026-27' },
        kpis: {
          members: { active: 139, inactive: 0, suspended: 0 },
          collectionsThisMonth: { count: 13, amount: money('246325.00') },
          feeCollectionRate: 52.8,
          attendanceToday: { students: 61, attended: 3, absent: 0, percentage: 4.9 },
        },
      },
    );
    expect(text(el.querySelector('.note'))).toContain('Read-only.');
    expect(text(el.querySelector('#home-kpis'))).toContain('₹2.46 L');
    expect(text(el.querySelector('#home-kpis'))).toContain('52.8%');
    (await request((u) => u.startsWith('/api/v1/console/approvals'))).flush({ items: [] });
    (await request((u) => u === '/api/v1/console/reports/institution-overview')).flush({
      rows: [
        { userType: 'Student', category: 'STUDENT', active: 61 },
        { userType: 'Parent', category: 'PARENT', active: 58 },
        { userType: 'Teacher', category: 'TEACHING', active: 20 },
      ],
    });
    await settle();
    expect(text(el)).toContain('Members by group');
    expect(words(el)).toContain('Students 61');
    expect(words(el)).toContain('Staff & teachers 20');
    expect(text(el)).toContain('Nothing waiting');
    expect(el.querySelector('#home-collections')).toBeNull();
  });

  it("shows the transport administrator today's trips and passengers by route", async () => {
    const el = await open(
      session({ code: 'TRANSPORT_ADMIN', name: 'Transport Administrator', readOnly: false }, [
        'task.transport',
      ]),
      {
        variant: 'transport',
        date: today,
        year: null,
        kpis: {
          tripsToday: { total: 4, completed: 1 },
          passengersAllocated: 23,
          vehicles: { inService: 2, total: 3, crew: 5 },
          cancelledThisWeek: 1,
        },
      },
    );
    expect(text(el.querySelector('.c-pa'))).toContain('Live trips');
    expect(text(el.querySelector('#home-kpis'))).toContain('2/3');
    (await request((u) => u === '/api/v1/console/trips')).flush({
      counts: { scheduled: 2, started: 1, completed: 1, cancelled: 0 },
      items: [
        {
          id: 'tr-1',
          session: 'Morning pickup',
          route: { code: 'R1', name: 'Vinoba Nagar' },
          vehicle: { name: 'Bus 1', registration: 'KA-14-F-2231', capacity: 40 },
          driver: 'Manjunath Gowda',
          plannedStart: '07:00',
          status: 'COMPLETED',
        },
      ],
    });
    (await request((u) => u === '/api/v1/console/routes')).flush({
      items: [{ id: 'r-1', code: 'R1', name: 'Vinoba Nagar', active: true, passengers: 14 }],
    });
    await settle();
    expect(text(el.querySelector('#home-kpis'))).toContain('1 completed · 2 scheduled');
    expect(text(el.querySelector('#home-trips'))).toContain('Morning pickup · 7:00 AM');
    expect(text(el)).toContain('14 passengers');
    expect(text(el)).toContain('R1 runs Bus 1 · KA-14-F-2231');
  });

  it('shows the task cards straight under the greeting: two rows of four at most (client 2026-10-27)', async () => {
    const el = await open(
      session(ADMIN, [
        'task.members',
        'task.merchants',
        'task.fees',
        'task.admissions',
        'task.academics',
        'task.attendance',
        'task.transport',
        'task.comms',
        'task.approvals',
        'task.config',
        'task.reports',
      ]),
      null,
    );
    // No heading or line of their own: the cards follow the page head.
    expect(el.querySelector('rp-page-head')?.nextElementSibling?.localName).toBe(
      'rp-task-launcher',
    );
    expect(text(el)).not.toContain('Your key tasks');
    expect(text(el)).not.toContain('Choose a task');
    expect([...el.querySelectorAll('.tl-card .tl-t')].map((c) => text(c))).toEqual([
      'People',
      'Payments',
      'Fees & finance',
      'Approvals',
      'Academics',
      'Attendance',
      'Admissions',
      'Transport',
    ]);
    expect([...el.querySelectorAll('.tl-more .tl-chip')].map((c) => text(c))).toEqual([
      'Communication',
      'Settings',
      'Reports',
    ]);
  });

  it("says when the home can't be read", async () => {
    const el = await open(session(ADMIN, []), null);
    expect(text(el.querySelector('.empty h4'))).toBe("Couldn't load your home");
    expect(text(el.querySelector('.empty button'))).toBe('Try again');
  });
});
