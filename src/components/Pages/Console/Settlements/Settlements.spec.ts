import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { dlong, dshort, periodRange, plusDays, todayIst } from './settlement-format';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Waits for `n` requests matching `match` (every one is returned, so none is lost). */
async function requests(match: (url: string) => boolean, n = 1, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  const got: TestRequest[] = [];
  for (let i = 0; i < 80 && got.length < n; i++) {
    got.push(...ctl.match((r) => match(r.urlWithParams) && r.method === method));
    if (got.length < n) await tick();
  }
  if (got.length < n) throw new Error(`expected ${n} ${method} request(s), got ${got.length}`);
  return got;
}
const request = async (match: (url: string) => boolean, method = 'GET') =>
  (await requests(match, 1, method))[0]!;

const money = (amount: string) => ({ amount, currency: 'INR' });
const today = todayIst();

const session = (over: object = {}) => ({
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'ACCOUNTANT', name: 'Accountant', readOnly: false }],
  subTasks: ['home.view', 'task.home', 'task.settlements', 'settlements.view'],
  preferredLang: 'en',
  ...over,
});

const settlement = (over: object = {}) => ({
  id: 's-1',
  settlementNo: 'STL-20261004-RPETUNSHI000011026-1',
  institution: { id: 'i-1', name: 'Tunga Valley Public School', identifier: 'RPETUNSHI000011026' },
  date: today,
  windowTo: `${today}T18:00:00.000Z`,
  status: 'PENDING',
  lines: 3,
  merchants: 1,
  gross: money('450.01'),
  fee: money('2.75'),
  adjustments: money('0.00'),
  net: money('447.26'),
  recollected: 0,
  stage1: null,
  final: null,
  rejection: null,
  payout: null,
  createdAt: `${today}T18:00:02.000Z`,
  version: 1,
  ...over,
});

const approved = settlement({
  id: 's-3',
  settlementNo: 'STL-3',
  date: plusDays(today, -2),
  windowTo: `${plusDays(today, -2)}T18:00:00.000Z`,
  status: 'APPROVED',
  lines: 5,
  merchants: 2,
  gross: money('1256.25'),
  fee: money('6.25'),
  adjustments: money('0.00'),
  net: money('1250.00'),
  stage1: { by: 'Priya Sharma', at: '2026-10-03T05:00:00.000Z', remarks: 'Statements checked' },
  final: { by: 'Rahul Verma', at: '2026-10-03T05:30:00.000Z', remarks: 'Bank file ready' },
  payout: {
    utr: 'HDFCN52026100300417',
    amount: money('1250.00'),
    at: '2026-10-03T06:00:00.000Z',
    by: 'Rahul Verma',
  },
});

const list = {
  items: [
    settlement(),
    settlement({
      id: 's-2',
      settlementNo: 'STL-2',
      date: plusDays(today, -1),
      status: 'APPROVAL_STAGE_1',
      lines: 1,
      gross: money('101.00'),
      fee: money('1.00'),
      net: money('100.00'),
      adjustments: money('0.00'),
    }),
    approved,
    settlement({
      id: 's-4',
      settlementNo: 'STL-4',
      date: plusDays(today, -3),
      status: 'FAILED',
      lines: 1,
      gross: money('50.50'),
      fee: money('0.50'),
      net: money('50.00'),
      rejection: { by: 'Rahul Verma', at: '2026-10-01T05:00:00.000Z', remarks: 'Short by ₹2,140' },
    }),
    settlement({
      id: 's-5',
      settlementNo: 'STL-5',
      date: plusDays(today, -40),
      status: 'APPROVED',
      lines: 2,
      gross: money('1000.00'),
      fee: money('5.00'),
      adjustments: money('20.00'),
      net: money('975.00'),
      payout: {
        utr: 'OLDUTR0000000000001',
        amount: money('975.00'),
        at: '2026-08-26T06:00:00.000Z',
        by: 'Rahul Verma',
      },
    }),
  ],
  nextCursor: null,
};

const detail = {
  ...approved,
  payableNow: money('0.00'),
  merchantsList: [
    {
      id: 'm-1',
      uniqueId: 'MERCAMTUN000830626',
      name: 'Campus Canteen',
      lines: 3,
      gross: money('256.25'),
      fee: money('2.25'),
      adjustments: money('0.00'),
      net: money('254.00'),
      suspended: false,
      carried: false,
      paid: true,
    },
    {
      id: 'm-2',
      uniqueId: 'MERTVPTUN000870626',
      name: 'TVPS Fee Account',
      lines: 2,
      gross: money('1000.00'),
      fee: money('4.00'),
      adjustments: money('0.00'),
      net: money('996.00'),
      suspended: false,
      carried: false,
      paid: true,
    },
  ],
  linesList: [
    {
      id: 'l-1',
      reference: 'RPTF1',
      merchantId: 'm-2',
      type: 'TUITION',
      adjustment: false,
      amount: money('600.00'),
      fee: money('3.00'),
      net: money('597.00'),
      remarks: null,
      at: null,
      recollected: false,
      carried: false,
      payoutReference: 'HDFCN52026100300417',
    },
    {
      id: 'l-2',
      reference: 'RPTF2',
      merchantId: 'm-2',
      type: 'TUITION',
      adjustment: false,
      amount: money('400.00'),
      fee: money('1.00'),
      net: money('399.00'),
      remarks: null,
      at: null,
      recollected: false,
      carried: false,
      payoutReference: 'HDFCN52026100300417',
    },
    {
      id: 'l-3',
      reference: 'RPEP1',
      merchantId: 'm-1',
      type: 'PAYMENT',
      adjustment: false,
      amount: money('256.25'),
      fee: money('2.25'),
      net: money('254.00'),
      remarks: null,
      at: null,
      recollected: false,
      carried: false,
      payoutReference: 'HDFCN52026100300417',
    },
  ],
  statements: [
    { fileNo: 1, kind: 'transactions', name: 'settlement_transactions_org_X_20261002.csv' },
    { fileNo: 2, kind: 'merchant_summary', name: 'settlement_merchant_summary_org_X_20261002.csv' },
    { fileNo: 3, kind: 'summary_report', name: 'settlement_summary_report_org_X_20261002.csv' },
    {
      fileNo: 4,
      kind: 'settlement_report',
      name: 'settlement_settlement_report_org_X_20261002.csv',
    },
  ],
};

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();
const toasts = () => document.querySelector('.toasts')?.textContent?.replace(/\s+/g, ' ') ?? '';
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find((b) => text(b) === label) as HTMLButtonElement;

describe('console settlements (STL-010, STL-011, STL-014)', () => {
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

  async function open(s: object = session(), url = '/console/settlements') {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl(url);
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    await settle(2);
    return harness.routeNativeElement as HTMLElement;
  }

  it('formats dates and periods the prototype way', () => {
    expect(dlong('2026-09-29')).toBe('Tuesday, 29 September 2026');
    expect(dshort('2026-10-03T06:00:00.000Z')).toBe('03 Oct');
    expect(plusDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(periodRange('7', '2026-10-04')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(periodRange('month', '2026-10-04')).toEqual({ from: '2026-10-01', to: '2026-10-04' });
    expect(periodRange('yday', '2026-10-01')).toEqual({ from: '2026-09-30', to: '2026-09-30' });
  });

  it('lists the settlements with the key figures, the totals and server-side filters', async () => {
    const el = await open();
    // The table and the key figures each ask for the newest settlements.
    for (const r of await requests((u) => u === '/api/v1/console/settlements', 2)) r.flush(list);
    await settle();

    const kpis = [...el.querySelectorAll('#stl-kpis .kpi')].map((k) => [
      text(k.querySelector('.k-l')),
      text(k.querySelector('.k-v')),
      text(k.querySelector('.k-d')) ?? null,
    ]);
    expect(kpis).toEqual([
      ['Awaiting approval', '2', '₹547.26 net'],
      ['Net approved · 30 days', '₹1,250', null],
      ['Platform fees · 30 days', '₹10', 'On successful payments only'],
      ['Last payout', '₹1,250', '03 Oct · HDFCN52026100300417'],
    ]);
    expect(text(el.querySelector('.note.tone-info'))).toContain('Settlements run at 23:30');

    const rows = [...el.querySelectorAll('#stl-table tbody tr')] as HTMLElement[];
    expect(rows.length).toBe(5);
    expect([...rows[0]!.querySelectorAll('td')].map((td) => text(td))).toEqual([
      expect.stringContaining('STL-20261004-RPETUNSHI000011026-1'),
      '3',
      '₹450.01',
      '₹2.75',
      '₹447.26',
      'Pending',
      '—',
    ]);
    expect(rows[0]!.querySelector('.chip.tone-warn')).toBeTruthy();
    expect(text(rows[1]!.querySelector('.chip'))).toBe('Stage-1 approved');
    expect(text(rows[2]!.querySelector('td:last-child'))).toBe('HDFCN52026100300417');
    expect(text(rows[3]!.querySelector('.chip.tone-bad'))).toBe('Failed');
    expect(text(rows[4]!.querySelector('td:nth-child(5) .cell-s'))).toBe('after ₹20.00 refunds');
    const foot = [...el.querySelectorAll('#stl-table tfoot td')].map((td) => text(td));
    expect(foot.slice(0, 5)).toEqual(['Total', '12', '₹2,857.76', '₹15.50', '₹2,822.26']);
    expect(text(el.querySelector('.fsum'))).toBe('5 settlements');

    // Sorting by net puts the largest first on the second click.
    const th = el.querySelectorAll('#stl-table thead th')[4]!;
    (th.querySelector('button') as HTMLButtonElement).click();
    (th.querySelector('button') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(text(el.querySelector('#stl-table tbody tr td .t-mono'))).toBe('STL-3');
    expect(th.getAttribute('aria-sort')).toBe('descending');

    // Status and period pills go to the server.
    button(el, 'Approved').click();
    harness.detectChanges();
    (await request((u) => u === '/api/v1/console/settlements?status=APPROVED')).flush({
      items: [approved],
      nextCursor: null,
    });
    await settle();
    expect(el.querySelectorAll('#stl-table tbody tr').length).toBe(1);
    button(el, '7 days').click();
    harness.detectChanges();
    (
      await request(
        (u) => u === `/api/v1/console/settlements?status=APPROVED&from=${plusDays(today, -6)}`,
      )
    ).flush({ items: [], nextCursor: null });
    await settle();
    expect(text(el.querySelector('#stl-table tbody .empty h4'))).toBe(
      'No settlements in this view',
    );
  });

  it('opens a settlement: merchants, tuition, the approval timeline and a statement download', async () => {
    const saved: string[] = [];
    const url = URL as unknown as {
      createObjectURL?: (b: Blob) => string;
      revokeObjectURL?: (u: string) => void;
    };
    const before = { create: url.createObjectURL, revoke: url.revokeObjectURL };
    url.createObjectURL = () => 'blob:csv';
    url.revokeObjectURL = () => undefined;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    try {
      const el = await open();
      for (const r of await requests((u) => u === '/api/v1/console/settlements', 2)) r.flush(list);
      await settle();
      (el.querySelectorAll('#stl-table tbody tr')[2] as HTMLElement).click();
      await settle(1);
      (await request((u) => u === '/api/v1/console/settlements/s-3')).flush(detail);
      await settle();
      const drawer = document.querySelector('.drawer.cm-m') as HTMLElement;
      expect(text(drawer.querySelector('.sh-t h3'))).toBe('Settlement STL-3');
      expect(text(drawer.querySelector('.sh-t p'))).toBe(
        `${dlong(plusDays(today, -2))} · Tunga Valley Public School`,
      );
      expect(
        [...drawer.querySelectorAll('.cm-tile')].map((t) => [
          text(t.querySelector('span')),
          text(t.querySelector('b')),
        ]),
      ).toEqual([
        ['Transactions', '5'],
        ['Gross', '₹1,256.25'],
        ['Platform fee', '₹6.25'],
        ['Net to merchants', '₹1,250.00'],
      ]);
      const merchants = [...drawer.querySelectorAll('#stl-merchants tbody tr')];
      expect(merchants.length).toBe(2);
      expect(text(merchants[0]!.querySelector('td b'))).toBe('Campus Canteen');
      expect(text(merchants[0]!.querySelector('td .cell-s'))).toBe('MERCAMTUN000830626');
      expect(text(drawer)).toContain(
        '2 tuition collections (₹1,000.00) in this settlement are marked Settled',
      );
      expect(
        [...drawer.querySelectorAll('#stl-approval .tl-i')].map((t) => [
          text(t.querySelector('.tl-t')),
          text(t.querySelector('.tl-s')),
        ]),
      ).toEqual([
        ['Settlement run', expect.stringMatching(/, 11:30 PM · 5 transactions$/)],
        ['Stage-1 approved by Priya Sharma', '03 Oct 2026, 10:30 AM · “Statements checked”'],
        [
          'Final approval by Rahul Verma',
          '03 Oct 2026, 11:00 AM · “Bank file ready” · primary contact e-mailed',
        ],
        ['Paid out · UTR HDFCN52026100300417', '03 Oct 2026, 11:30 AM · ₹1,250.00'],
      ]);
      expect(drawer.querySelectorAll('#stl-approval .tl-i.done').length).toBe(4);

      expect(drawer.querySelectorAll('.cm-dl').length).toBe(4);
      (drawer.querySelector('#stl-dl-2') as HTMLButtonElement).click();
      (await request((u) => u === '/api/v1/console/settlements/s-3/statements/2')).flush({
        name: 'settlement_merchant_summary_org_X_20261002.csv',
        url: '/api/v1/files/f-2/content?exp=1&sig=abc',
        expiresAt: '2026-10-04T10:00:00.000Z',
      });
      const file = await request((u) => u === '/api/v1/files/f-2/content?exp=1&sig=abc');
      expect(file.request.responseType).toBe('blob');
      file.flush(new Blob(['MerchantID'], { type: 'text/csv' }));
      await settle();
      expect(saved).toEqual(['settlement_merchant_summary_org_X_20261002.csv']);
      expect(toasts()).toContain('Statement downloaded');
    } finally {
      click.mockRestore();
      url.createObjectURL = before.create;
      url.revokeObjectURL = before.revoke;
    }
  });

  it('shows a pending and a rejected settlement in the timeline, and the register text on a 404', async () => {
    const el = await open();
    for (const r of await requests((u) => u === '/api/v1/console/settlements', 2)) r.flush(list);
    await settle();
    (el.querySelectorAll('#stl-table tbody tr')[0] as HTMLElement).click();
    await settle(1);
    (await request((u) => u === '/api/v1/console/settlements/s-1')).flush({
      ...list.items[0],
      payableNow: money('0.00'),
      merchantsList: [],
      linesList: [],
      statements: [],
    });
    await settle();
    let drawer = document.querySelector('.drawer') as HTMLElement;
    expect(
      [...drawer.querySelectorAll('#stl-approval .tl-i')].map(
        (t) => ['done', 'now', 'bad'].find((c) => t.classList.contains(c)) ?? '',
      ),
    ).toEqual(['done', 'now', '']);
    expect(text(drawer.querySelector('#stl-approval .tl-i.now'))).toContain(
      'Waiting for the CampusOne settlement maker',
    );
    (drawer.querySelector('.x-btn') as HTMLButtonElement).click();
    await settle(1);

    (el.querySelectorAll('#stl-table tbody tr')[3] as HTMLElement).click();
    await settle(1);
    (await request((u) => u === '/api/v1/console/settlements/s-4')).flush({
      ...list.items[3],
      payableNow: money('0.00'),
      merchantsList: [],
      linesList: [],
      statements: [],
    });
    await settle();
    drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('.chip.lg'))).toBe('Failed');
    expect(text(drawer.querySelector('#stl-approval .tl-i.bad'))).toContain(
      'Rejected by Rahul Verma',
    );
    (drawer.querySelector('.x-btn') as HTMLButtonElement).click();
    await settle(1);

    (el.querySelectorAll('#stl-table tbody tr')[1] as HTMLElement).click();
    await settle(1);
    (await request((u) => u === '/api/v1/console/settlements/s-2')).flush(
      { type: 'about:blank', title: 'Not found', status: 404, code: 'STL.NOT_FOUND', detail: 'x' },
      { status: 404, statusText: 'Not Found' },
    );
    await settle();
    drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('.note.tone-bad'))).toContain('Settlement not found');
  });

  it("tells a role without the task that the page isn't theirs", async () => {
    const el = await open(session({ subTasks: ['home.view', 'task.home'] }));
    expect(text(el.querySelector('.empty h4'))).toBe("This page isn't part of your role");
    TestBed.inject(HttpTestingController).expectNone((r) => r.url.includes('/settlements'));
  });
});
