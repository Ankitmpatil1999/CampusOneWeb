import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import type { Catalogue } from './reports.api';
import { cellText } from './report-format';

const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const toasts = () => text(document.querySelector('.toasts'));
async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 80; i++) {
    const found = ctl.match((r) => match(r.urlWithParams) && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
}

const session = {
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'INSTITUTION_ADMIN', name: 'Institution Administrator', readOnly: false }],
  subTasks: ['home.view', 'task.home', 'reports.view', 'task.reports'],
  preferredLang: 'en',
};
const year = {
  id: 'y-1',
  label: '2026-27',
  startsOn: '2026-04-01',
  endsOn: '2027-03-31',
  status: 'OPEN',
  current: true,
  version: 1,
};
const col = (key: string, label: string, type = 'text') => ({ key, label, type });
const catalogue: Catalogue = {
  areas: ['People & wallets', 'Payments & merchants', 'Fees'],
  reports: [
    {
      id: 'institution-overview',
      area: 'People & wallets',
      title: 'Institution overview',
      description: 'Members by type and status, wallets opened, active and inactive.',
      task: 'reports',
      screen: 'c.members',
      period: 'now',
      columns: [col('userType', 'User type'), col('active', 'Active', 'number')],
    },
    {
      id: 'transactions-by-institution',
      area: 'Payments & merchants',
      title: 'Transactions by institution',
      description: 'All campus payments by channel, type and status.',
      task: 'recon',
      screen: 'c.recon',
      period: 'range',
      columns: [
        col('channel', 'Channel'),
        col('status', 'Status'),
        col('count', 'Payments', 'number'),
        col('amount', 'Amount', 'paise'),
      ],
    },
    {
      id: 'tuition-collection',
      area: 'Fees',
      title: 'Tuition collection',
      description: 'Collections by class, section and status, with totals.',
      task: 'fees',
      screen: 'c.feerecords',
      period: 'year',
      columns: [col('class', 'Class'), col('paid', 'Paid', 'paise')],
    },
  ],
};

describe('console reports (RPT-002…005)', () => {
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
  async function open() {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/reports');
    (await request((u) => u === '/api/v1/console/session')).flush(session);
    await nav;
    await settle();
    (await request((u) => u === '/api/v1/console/academic-years')).flush({ items: [year] });
    (await request((u) => u === '/api/v1/console/reports')).flush(catalogue);
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  it('lists the reports by area with filters, and says when none match', async () => {
    const el = await open();
    expect([...el.querySelectorAll('.sec-h h3')].map((h) => text(h))).toEqual([
      'People & wallets',
      'Payments & merchants',
      'Fees',
    ]);
    expect([...el.querySelectorAll('.pills .pill')].map((p) => text(p))).toEqual([
      'All3',
      'People & wallets1',
      'Payments & merchants1',
      'Fees1',
    ]);
    expect(text(el.querySelector('.note'))).toContain('Year in context: 2026-27');
    const rep = el.querySelector('[data-report="tuition-collection"]')!;
    expect(text(rep)).toContain('Covers 2026-27');
    expect(rep.querySelector('a')?.getAttribute('href')).toBe('/console/feerecords');
    expect(text(el.querySelector('[data-report="institution-overview"]'))).toContain(
      'As it stands now',
    );

    ([...el.querySelectorAll('.pills .pill')] as HTMLButtonElement[])[3]!.click();
    await settle(1);
    expect(el.querySelectorAll('.cp-rep')).toHaveLength(1);

    const q = el.querySelector('#rep-q') as HTMLInputElement;
    q.value = 'payroll';
    q.dispatchEvent(new Event('input'));
    await settle(1);
    expect(text(el.querySelector('.empty h4'))).toBe('No reports match');
    (el.querySelector('.empty button') as HTMLButtonElement).click();
    await settle(1);
    expect(el.querySelectorAll('.cp-rep')).toHaveLength(3);
  });

  it('exports the year in context, waits for the file and downloads it (RPT-004, RPT-005)', async () => {
    const saved: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(`${this.download} ${this.getAttribute('href')}`);
    });
    try {
      const el = await open();
      const rep = el.querySelector('[data-report="tuition-collection"]')!;
      (rep.querySelector('.cp-rep-a button') as HTMLButtonElement).click();
      const post = await request(
        (u) => u === '/api/v1/console/reports/tuition-collection/exports',
        'POST',
      );
      expect(post.request.body).toEqual({ yearId: 'y-1' });
      expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
      post.flush({ exportId: 'e-1', status: 'REQUESTED' });
      const poll = await request((u) => u === '/api/v1/exports/e-1');
      expect(poll.request.headers.get('X-CampusOne-Surface')).toBe('console');
      poll.flush({
        exportId: 'e-1',
        report: 'console-report',
        status: 'READY',
        rows: 9,
        truncated: false,
        requestedAt: '2026-10-04T10:00:00Z',
        readyAt: '2026-10-04T10:00:01Z',
        expiresAt: '2026-10-11T10:00:01Z',
        file: {
          name: 'tuition-collection_2026-10-04.csv',
          sizeBytes: 340,
          url: '/api/v1/files/f-1/content?exp=1&sig=s',
          expiresAt: '2026-10-04T10:05:00Z',
        },
      });
      await settle(6);
      expect(saved).toEqual([
        'tuition-collection_2026-10-04.csv /api/v1/files/f-1/content?exp=1&sig=s',
      ]);
      expect(toasts()).toContain('CSV export prepared');
      expect(toasts()).toContain('Tuition collection · 2026-27');
      expect(text(rep)).toContain('Exported just now');
    } finally {
      click.mockRestore();
    }
  });

  it("opens a report's rows in a drawer with money and register words", async () => {
    const el = await open();
    (
      el.querySelector('[data-report="transactions-by-institution"] .cp-rep-t') as HTMLButtonElement
    ).click();
    const run = await request((u) =>
      u.startsWith('/api/v1/console/reports/transactions-by-institution?'),
    );
    expect(run.request.urlWithParams).toContain('from=2026-04-01');
    run.flush({
      report: {
        id: 'transactions-by-institution',
        title: 'Transactions by institution',
        area: 'Payments & merchants',
        period: 'range',
      },
      year: { id: 'y-1', label: '2026-27' },
      period: { from: '2026-04-01', to: '2026-10-04' },
      columns: catalogue.reports[1]!.columns,
      rows: [
        {
          channel: 'STATIC_QR',
          status: 'SUCCESS',
          count: 5,
          amount: { amount: '553.50', currency: 'INR' },
        },
      ],
      nextCursor: null,
    });
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('.sh-t p'))).toContain('01 Apr 2026 – 04 Oct 2026');
    expect(text(drawer.querySelector('#rep-table tbody'))).toBe('Static QR Success 5 ₹553.50');
  });

  it('prints cells as their column types say', () => {
    expect(cellText({ amount: '-120.50', currency: 'INR' }, 'paise')).toBe('−₹120.50');
    expect(cellText('PARTIALLY_PAID', 'text')).toBe('Partially paid');
    expect(cellText(12345, 'number')).toBe('12,345');
    expect(cellText(null, 'text')).toBe('—');
    expect(cellText(true, 'text')).toBe('Yes');
  });
});
