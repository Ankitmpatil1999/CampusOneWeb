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
import { translate } from '../../../Utils/translate';
import { LEDGER_NAME } from './voucher-format';

const tick = () => new Promise((r) => setTimeout(r, 0));

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

const session = (over: object = {}) => ({
  name: 'DEEPA NAYAK',
  email: 'accounts@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'ACCOUNTANT', name: 'Accountant', readOnly: false }],
  subTasks: ['home.view', 'task.home', 'task.vouchers', 'vouchers.view', 'vouchers.edit'],
  preferredLang: 'en',
  ...over,
});

const voucher = (over: object = {}) => ({
  id: 'v-1',
  reference: 'RPEEE8XBIJECPIICVRYU2HJW56N62771114',
  event: 'EVENT',
  eventLabel: 'Event payments',
  date: '2026-10-04',
  amount: money('350.00'),
  company: 'Tunga Valley Educational Trust',
  debitLedger: 'Member wallet liability',
  creditLedger: 'Event receipts',
  narration: 'Event payments · RPEEE8XBIJECPIICVRYU2HJW56N62771114 · Event payment',
  status: 'TRANSFERRED',
  statusLabel: 'Transferred',
  attempts: 1,
  lastError: null,
  nextAttemptAt: null,
  externalRef: 'TEST-D5472A459F',
  transferredAt: '2026-10-04T05:44:00.000Z',
  createdAt: '2026-10-04T05:44:00.000Z',
  version: 2,
  ...over,
});
const failed = voucher({
  id: 'v-2',
  reference: 'RPEE8B1TAD33OPJP09MQZY8MWSN62771114',
  amount: money('500.00'),
  creditLedger: 'TEST-FAIL Event receipts',
  status: 'FAILED',
  statusLabel: 'Failed',
  lastError: 'Ledger not found in the company (test package)',
  nextAttemptAt: '2026-10-04T06:14:00.000Z',
  externalRef: null,
  transferredAt: null,
});
const tuition = voucher({
  id: 'v-3',
  reference: 'RPTFC8XAR3V4QWEB9Z5WQAR4MTD61911100',
  event: 'TUITION',
  eventLabel: 'Fee collections',
  amount: money('4950.00'),
  debitLedger: 'Member wallet liability',
  creditLedger: 'Tuition fee income',
  status: 'PENDING',
  statusLabel: 'Pending Transfer',
  attempts: 0,
  externalRef: null,
  transferredAt: null,
});
const LIST = {
  mode: 'test',
  counts: { pending: 1, transferred: 1, failed: 1 },
  items: [voucher(), failed, tuition],
  nextCursor: null,
};
const MAPS = {
  mode: 'test',
  company: 'Tunga Valley Educational Trust',
  enabled: true,
  enabledAt: '2026-10-04T05:40:00.000Z',
  events: [
    {
      event: 'TUITION',
      label: 'Fee collections',
      debitLedger: 'Member wallet liability',
      creditLedger: 'Tuition fee income',
    },
    {
      event: 'EVENT',
      label: 'Event payments',
      debitLedger: 'Member wallet liability',
      creditLedger: 'Event receipts',
    },
    {
      event: 'ALLOWANCE_CREDIT',
      label: 'Allowance funding',
      debitLedger: null,
      creditLedger: null,
    },
    { event: 'REFUND', label: 'Refunds', debitLedger: null, creditLedger: null },
  ],
  version: 2,
};

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();
const toasts = () => document.querySelector('.toasts')?.textContent?.replace(/\s+/g, ' ') ?? '';
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find((b) => text(b) === label) as HTMLButtonElement;
const type = (el: HTMLInputElement, v: string) => {
  el.value = v;
  el.dispatchEvent(new Event('input'));
};

describe('console accounting vouchers (FEE-034…037)', () => {
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

  async function open(s: object = session(), list: object = LIST, maps: object = MAPS) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/vouchers');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    await settle(2);
    if ((s as { subTasks: string[] }).subTasks.includes('vouchers.view')) {
      (await request((u) => u === '/api/v1/console/accounting/vouchers')).flush(list);
      (await request((u) => u === '/api/v1/console/accounting/mappings')).flush(maps);
      await settle();
    }
    return harness.routeNativeElement as HTMLElement;
  }

  it('takes ledger names as the server does', () => {
    expect(LEDGER_NAME.test('Member wallet liability')).toBe(true);
    expect(LEDGER_NAME.test('TEST-FAIL Event receipts')).toBe(true);
    expect(LEDGER_NAME.test('x')).toBe(false);
    expect(LEDGER_NAME.test('<b>ledger</b>')).toBe(false);
  });

  it('lists the vouchers with the counts, the test-package note and the status filter', async () => {
    const el = await open();
    expect(text(el.querySelector('#vch-test'))).toContain('Test package.');
    const kpis = [...el.querySelectorAll('#vch-kpis .kpi')].map((k) => [
      text(k.querySelector('.k-l')),
      text(k.querySelector('.k-v')),
    ]);
    expect(kpis).toEqual([
      ['Transferred', '1'],
      ['Failed', '1'],
      ['Pending Transfer', '1'],
      ['Accounting package', 'Test package'],
    ]);
    expect(text(el.querySelector('#vch-retry-all'))).toBe('Retry 1 failed');
    expect(text(el.querySelector('#vch-tab-v'))).toBe('Vouchers3');
    expect(text(el.querySelector('#vch-tab-map'))).toBe('Event mapping2');
    const rows = [...el.querySelectorAll('#vch-table tbody tr')];
    expect(rows.length).toBe(3);
    expect(text(rows[0]!.querySelector('td:nth-child(6)'))).toBe('TransferredTEST-D5472A459F');
    expect(text(rows[1]!.querySelector('td:nth-child(6)'))).toBe(
      'Failed Ledger not found in the company (test package)',
    );
    expect(text(rows[1]!.querySelector('td:nth-child(5)'))).toBe('₹500.00');
    expect(button(rows[1]!, 'Retry')).toBeTruthy();
    expect(text(rows[2]!.querySelector('td .cell-s'))).toBe('Not sent yet');
    expect(text(rows[2]!.querySelector('.chip'))).toBe('Pending Transfer');

    // The search filters what is loaded.
    type(el.querySelector('#vc-q') as HTMLInputElement, 'tuition fee');
    harness.detectChanges();
    expect(el.querySelectorAll('#vch-table tbody tr').length).toBe(1);
    type(el.querySelector('#vc-q') as HTMLInputElement, '');
    harness.detectChanges();

    button(el, 'Failed').click();
    harness.detectChanges();
    (await request((u) => u === '/api/v1/console/accounting/vouchers?status=FAILED')).flush({
      ...LIST,
      items: [failed],
    });
    await settle();
    expect(el.querySelectorAll('#vch-table tbody tr').length).toBe(1);
  });

  it('opens a failed voucher and retries it: the package’s refusal in the register words', async () => {
    const el = await open();
    (el.querySelectorAll('#vch-table tbody tr')[1] as HTMLElement).click();
    await settle(1);
    const d = document.querySelector('.drawer.cm-m') as HTMLElement;
    expect(text(d.querySelector('.sh-t h3'))).toBe('Voucher RPEE8B1TAD33OPJP09MQZY8MWSN62771114');
    expect(text(d.querySelector('#vch-error'))).toContain(
      'Ledger not found in the company (test package)',
    );
    expect(text(d.querySelector('#vch-error'))).toContain('Tried again automatically 04 Oct 2026');
    expect([...d.querySelectorAll('#vch-kv dt')].map((x) => text(x))).toEqual([
      'Amount',
      'Date',
      'Debit',
      'Credit',
      'Company',
      'Posting reference',
      'External reference',
    ]);
    const sent = JSON.parse(d.querySelectorAll('pre.cm-code')[0]!.textContent!);
    expect(sent.ledgers).toEqual([
      { name: 'Member wallet liability', dr: '500.00' },
      { name: 'TEST-FAIL Event receipts', cr: '500.00' },
    ]);
    expect(JSON.parse(d.querySelectorAll('pre.cm-code')[1]!.textContent!)).toEqual({
      status: 'ERROR',
      message: 'Ledger not found in the company (test package)',
    });

    (d.closest('.ov')!.querySelector('#vch-retry') as HTMLButtonElement).click();
    await settle(1);
    const dialog = document.querySelector('.modal.narrow') as HTMLElement;
    expect(text(dialog.querySelector('h3'))).toBe('Retry RPEE8B1TAD33OPJP09MQZY8MWSN62771114?');
    button(dialog, 'Retry posting').click();
    const post = await request(
      (u) => u === '/api/v1/console/accounting/vouchers/v-2/retries',
      'POST',
    );
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    post.flush({ ...failed, attempts: 2 }, { status: 202, statusText: 'Accepted' });
    await settle();
    expect(toasts()).toContain(
      translate('ACC.PACKAGE_REFUSED', {
        reason: 'Ledger not found in the company (test package)',
      }),
    );
    expect(text(document.querySelector('.drawer .row.g8'))).toBe('Failed2 attempts');
    (await request((u) => u === '/api/v1/console/accounting/vouchers')).flush(LIST);
  });

  it('retries every failed voucher one after the other', async () => {
    const el = await open();
    (el.querySelector('#vch-retry-all') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/console/accounting/vouchers?status=FAILED')).flush({
      ...LIST,
      items: [failed, { ...failed, id: 'v-4', reference: 'RPEX' }],
    });
    await settle(1);
    const dialog = document.querySelector('.modal.narrow') as HTMLElement;
    expect(text(dialog.querySelector('h3'))).toBe('Retry 2 failed vouchers?');
    button(dialog, 'Retry posting').click();
    (await request((u) => u.endsWith('/vouchers/v-2/retries'), 'POST')).flush(
      { ...failed, status: 'TRANSFERRED', externalRef: 'TEST-1' },
      { status: 202, statusText: 'Accepted' },
    );
    (await request((u) => u.endsWith('/vouchers/v-4/retries'), 'POST')).flush(
      { ...failed, id: 'v-4' },
      { status: 202, statusText: 'Accepted' },
    );
    await settle();
    expect(toasts()).toContain('1 voucher transferred');
    expect(toasts()).toContain('1 voucher still failed');
    (await request((u) => u === '/api/v1/console/accounting/vouchers')).flush(LIST);
  });

  it('edits a posting’s ledgers with If-Match, keeping the other mappings', async () => {
    const el = await open();
    (el.querySelector('#vch-tab-map') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(text(el.querySelector('#vch-company'))).toContain(
      'Company Tunga Valley Educational Trust · transfers on since 04 Oct 2026',
    );
    const rows = [...el.querySelectorAll('#vch-map tbody tr')];
    expect([...rows[2]!.querySelectorAll('td')].map((td) => text(td)).slice(0, 4)).toEqual([
      'Allowance funding',
      'Allowance',
      'Not sent',
      'Not sent',
    ]);
    (rows[2] as HTMLElement).click();
    await settle(1);
    const m = document.querySelector('.modal.cm-m') as HTMLElement;
    expect(text(m.querySelector('.sh-t h3'))).toBe('Mapping · Allowance funding');
    expect(m.querySelector('#mp-co')).toBeNull();
    type(m.querySelector('#mp-dr') as HTMLInputElement, 'Allowance liability');
    type(m.querySelector('#mp-cr') as HTMLInputElement, 'allowance liability');
    (m.closest('.ov')!.querySelector('#mp-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(m.querySelector('#mp-cr-e'))).toBe(translate('ACC.LEDGER'));
    type(m.querySelector('#mp-dr') as HTMLInputElement, 'Student allowance expense');
    type(m.querySelector('#mp-cr') as HTMLInputElement, 'Allowance liability');
    (m.closest('.ov')!.querySelector('#mp-save') as HTMLButtonElement).click();
    await settle(1);
    button(document.querySelector('.modal.narrow')!, 'Save mapping').click();
    const put = await request((u) => u === '/api/v1/console/accounting/mappings', 'PUT');
    expect(put.request.headers.get('If-Match')).toBe('"v2"');
    expect(put.request.body).toEqual({
      companyName: 'Tunga Valley Educational Trust',
      enabled: true,
      mappings: [
        {
          event: 'TUITION',
          debitLedger: 'Member wallet liability',
          creditLedger: 'Tuition fee income',
        },
        { event: 'EVENT', debitLedger: 'Member wallet liability', creditLedger: 'Event receipts' },
        {
          event: 'ALLOWANCE_CREDIT',
          debitLedger: 'Student allowance expense',
          creditLedger: 'Allowance liability',
        },
      ],
    });
    put.flush({ ...MAPS, version: 3 });
    await settle();
    expect(toasts()).toContain('Mapping saved');
    expect(document.querySelector('.modal.cm-m')).toBeNull();
  });

  it('refuses transfers with nothing mapped, in the register words', async () => {
    const el = await open(
      session(),
      { ...LIST, counts: { pending: 0, transferred: 0, failed: 0 }, items: [] },
      {
        ...MAPS,
        company: null,
        enabled: false,
        enabledAt: null,
        events: MAPS.events.map((e) => ({ ...e, debitLedger: null, creditLedger: null })),
        version: 0,
      },
    );
    expect(text(el.querySelector('#vch-table tbody .empty h4'))).toBe('No vouchers yet');
    expect((el.querySelector('.c-ph .cp-why button') as HTMLButtonElement).disabled).toBe(true);
    (el.querySelector('#vch-tab-map') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(text(el.querySelector('#vch-company'))).toContain('No accounting company yet.');
    (el.querySelector('#vch-co') as HTMLButtonElement).click();
    await settle(1);
    const m = document.querySelector('.modal.cm-m') as HTMLElement;
    type(m.querySelector('#mp-co') as HTMLInputElement, 'Tunga Valley Educational Trust');
    (m.querySelector('#mp-on') as HTMLButtonElement).click();
    harness.detectChanges();
    (m.closest('.ov')!.querySelector('#mp-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(m.querySelector('.note.tone-bad'))).toBe(translate('ACC.MAPPING_NEEDED'));
    TestBed.inject(HttpTestingController).expectNone((r) => r.method === 'PUT');
  });

  it('says when the package is off, and is read-only for Management', async () => {
    const el = await open(
      session({
        roles: [{ code: 'MANAGEMENT', name: 'Management', readOnly: true }],
        subTasks: ['home.view', 'task.vouchers', 'vouchers.view'],
      }),
      { ...LIST, mode: 'off' },
      { ...MAPS, mode: 'off' },
    );
    expect(text(el.querySelector('#vch-off'))).toBe(translate('ACC.PACKAGE_OFF'));
    expect(text(el.querySelector('.note.tone-info'))).toContain('Read-only.');
    expect(el.querySelector('#vch-retry-all')).toBeNull();
    const row = el.querySelectorAll('#vch-table tbody tr')[1]!;
    expect((row.querySelector('.cp-why button') as HTMLButtonElement).disabled).toBe(true);
  });

  it("tells a role without the task that the page isn't theirs", async () => {
    const el = await open(session({ subTasks: ['home.view', 'task.home'] }));
    expect(text(el.querySelector('.empty h4'))).toBe("This page isn't part of your role");
    TestBed.inject(HttpTestingController).expectNone((r) => r.url.includes('/accounting/'));
  });
});
