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

const officer = (subTasks: string[] = ['support.lookup', 'support.calls']) => ({
  name: "JOSEPH D'SOUZA",
  email: 'joseph@campusone.example',
  role: { code: 'SUPPORT_OFFICER', name: 'Support Officer' },
  subTasks: ['home.view', 'task.home', 'task.support', ...subTasks],
  preferredLang: 'en',
});

const ticket = (over: object = {}) => ({
  id: 't-5',
  ticketNo: 'TKT-000005',
  kind: 'TRANSACTION',
  category: 'WRONG_AMOUNT',
  categoryLabel: 'Wrong amount',
  issue: 'Charged ₹45 for a ₹25 snack at the canteen this morning.',
  channel: 'APP',
  status: 'OPEN',
  statusLabel: 'Open',
  priority: 2,
  awaitingApproval: 'apr-9',
  reasonCode: null,
  resolution: null,
  member: { id: 'm-1', name: 'Aarav Hegde', mobile: '•••••• 0000' },
  transaction: {
    reference: 'RPEP2WPRT21R14RGVBXKJ2LECL562770950',
    type: 'PAYMENT',
    amount: money('45.00'),
    at: '2026-10-04T04:20:00.000Z',
  },
  fraud: null,
  hasAttachment: false,
  createdAt: '2026-10-04T05:37:00.000Z',
  updatedAt: '2026-10-04T05:37:00.000Z',
  closedAt: null,
  ageDays: 0,
  old: false,
  version: 3,
  institution: { id: 'i-1', name: 'Tunga Valley Public School' },
  ...over,
});
const OTHER = ticket({
  id: 't-3',
  ticketNo: 'FBK-000003',
  kind: 'FEEDBACK',
  category: 'GRIEVANCE',
  categoryLabel: 'Grievance',
  transaction: null,
  awaitingApproval: null,
});
const TXNS = {
  institution: { id: 'i-1', name: 'Tunga Valley Public School' },
  member: { id: 'm-1', name: 'Aarav Hegde' },
  total: 13,
  items: [
    {
      reference: 'RPEEDRUYQN850HQ8F1BB79I841F62771114',
      type: 'EVENT',
      direction: 'DEBIT',
      amount: money('350.00'),
      remarks: 'Event payment',
      at: '2026-10-04T05:44:00.000Z',
    },
    {
      reference: 'RPADFW71CCGE8ALJFX1PC5COM5R61821000',
      type: 'ADJUSTMENT',
      direction: 'CREDIT',
      amount: money('8000.00'),
      remarks: null,
      at: '2026-07-01T04:30:00.000Z',
    },
  ],
};

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();
const toasts = () => document.querySelector('.toasts')?.textContent?.replace(/\s+/g, ' ') ?? '';
const type = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  el.value = v;
  el.dispatchEvent(new Event('input'));
};

describe('back office — support desk (GRV-011…013)', () => {
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

  async function open(s: object = officer()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/backoffice/support');
    (await request((u) => u === '/api/v1/ops/session')).flush(s);
    await nav;
    await settle(2);
    return harness.routeNativeElement as HTMLElement;
  }

  async function find(el: HTMLElement, q: string, why: string) {
    type(el.querySelector('#ob-spq') as HTMLInputElement, q);
    type(el.querySelector('#ob-sp-why') as HTMLInputElement, why);
    (el.querySelector('#ob-sp-go') as HTMLButtonElement).click();
    await settle(1);
  }

  it('asks for a ticket number or mobile and a reason before looking anything up', async () => {
    const el = await open();
    expect(text(el.querySelector('#ob-sp-start h4'))).toBe('Find a ticket');
    expect(text(el.querySelector('.fsum'))).toBe('Look-ups are recorded with your reason');
    await find(el, '12345', 'x');
    expect(text(el.querySelector('#ob-spq-e'))).toBe(translate('GRV.LOOKUP_CRITERIA'));
    expect(text(el.querySelector('#ob-sp-why-e'))).toBe(translate('GRV.LOOKUP_REASON'));
    TestBed.inject(HttpTestingController).expectNone((r) => r.url.includes('/ops/support/'));
  });

  it('finds tickets by mobile with the reason, opens one with the member’s last transactions, and logs a call', async () => {
    const el = await open();
    await find(el, '+91 98861 10000', 'Parent called about a canteen charge');
    (
      await request(
        (u) =>
          u ===
          '/api/v1/ops/support/tickets?mobile=9886110000&reason=Parent%20called%20about%20a%20canteen%20charge',
      )
    ).flush({ items: [ticket(), OTHER] });
    await settle();
    expect(text(el.querySelector('.sec-h h3'))).toBe('Tickets for “+91 98861 10000” · 2');
    const rows = [...el.querySelectorAll('#ob-sp-table tbody tr')];
    expect([...rows[0]!.querySelectorAll('td')].map((td) => text(td))).toEqual([
      'TKT-00000504 Oct 2026, 11:07 AM',
      'Wrong amount',
      'Aarav HegdeTunga Valley Public School',
      'RPEP2WPRT21R14RGVBXKJ2LECL562770950₹45.00 · Payment',
      'Priority 2',
      'Open',
    ]);
    (rows[0] as HTMLElement).click();
    await settle(1);
    (
      await request(
        (u) =>
          u ===
          '/api/v1/ops/support/members/i-1/m-1/transactions?reason=Parent%20called%20about%20a%20canteen%20charge',
      )
    ).flush(TXNS);
    await settle();
    const desk = el.querySelector('#ob-sp-desk') as HTMLElement;
    expect(text(desk.querySelector('.card-h .t-h4'))).toBe('TKT-000005 · Wrong amount');
    expect(text(desk.querySelector('.row.wrap'))).toContain('Awaiting approval');
    expect([...desk.querySelectorAll('#ob-sp-kv dt')].map((x) => text(x))).toEqual([
      'Transaction',
      'Amount',
      'Transaction type',
      'Transaction time',
      'Institution',
    ]);
    expect(text(desk.querySelector('#ob-sp-member .row.between'))).toBe(
      'Last five transactionsTotal: 13 transactions',
    );
    expect(
      [...desk.querySelectorAll('#ob-sp-txns .li')].map((li) => [
        text(li.querySelector('.li-t')),
        text(li.querySelector('.li-r b')),
      ]),
    ).toEqual([
      ['Event payment', '−350.00'],
      ['Adjustment', '+8,000.00'],
    ]);
    expect(text(desk.querySelector('#ob-sp-calls .empty h4'))).toBe('No calls logged here yet');

    (desk.querySelector('#ob-sp-call') as HTMLButtonElement).click();
    await settle(1);
    const m = document.querySelector('.modal') as HTMLElement;
    expect(text(m.querySelector('.sh-t h3'))).toBe('Log a call · TKT-000005');
    expect((m.querySelector('#ob-cl-who') as HTMLInputElement).value).toBe('Aarav Hegde');
    type(m.querySelector('#ob-cl-dur') as HTMLInputElement, '0');
    (m.closest('.ov')!.querySelector('#ob-cl-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(m.querySelector('#ob-cl-dur-e'))).toBe(translate('GRV.CALL_MINUTES'));
    expect(text(m.querySelector('#ob-cl-sum-e'))).toBe(translate('GRV.CALL_NOTES'));
    type(m.querySelector('#ob-cl-dur') as HTMLInputElement, '5');
    type(m.querySelector('#ob-cl-sum') as HTMLTextAreaElement, 'Asked the school to approve it.');
    harness.detectChanges();
    expect(text(m.querySelector('.count'))).toBe('31/400');
    (m.querySelectorAll('.seg button')[1] as HTMLButtonElement).click();
    (m.closest('.ov')!.querySelector('#ob-cl-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/ops/support/call-logs', 'POST');
    expect(post.request.body).toEqual({
      institutionId: 'i-1',
      ticketId: 't-5',
      direction: 'OUTBOUND',
      caller: 'Aarav Hegde',
      minutes: 5,
      summary: 'Asked the school to approve it.',
    });
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    post.flush({
      id: 'c-9',
      direction: 'OUTBOUND',
      caller: 'Aarav Hegde',
      minutes: 5,
      summary: 'Asked the school to approve it.',
      source: 'SUPPORT',
      ticket: { id: 't-5', ticketNo: 'TKT-000005' },
      loggedBy: "Joseph D'souza",
      at: '2026-10-04T06:00:00.000Z',
    });
    await settle();
    expect(toasts()).toContain('Call logged against TKT-000005');
    expect(text(desk.querySelector('#ob-sp-calls .t-h4'))).toBe('Call log · 1');
    expect(text(desk.querySelector('#ob-sp-calls .li-t'))).toBe('Outbound · Aarav Hegde · 5 min');

    // Back to the results.
    [...el.querySelectorAll('button')].find((b) => text(b) === 'All results')!.click();
    harness.detectChanges();
    expect(el.querySelectorAll('#ob-sp-table tbody tr').length).toBe(2);
  });

  it('opens a single match at once, and says when nothing is found', async () => {
    const el = await open(officer(['support.lookup']));
    await find(el, 'tkt-000005', 'Caller quoted the ticket');
    (
      await request(
        (u) =>
          u ===
          '/api/v1/ops/support/tickets?ticketNo=TKT-000005&reason=Caller%20quoted%20the%20ticket',
      )
    ).flush({ items: [ticket()] });
    await settle(1);
    (await request((u) => u.startsWith('/api/v1/ops/support/members/i-1/m-1/transactions'))).flush(
      TXNS,
    );
    await settle();
    expect(el.querySelector('#ob-sp-desk')).toBeTruthy();
    // Without support.calls the call button is disabled.
    expect((el.querySelector('#ob-sp-calls .cp-why button') as HTMLButtonElement).disabled).toBe(
      true,
    );

    await find(el, 'TKT-999999', 'Caller quoted the ticket');
    (await request((u) => u.includes('ticketNo=TKT-999999'))).flush({ items: [] });
    await settle();
    expect(text(el.querySelector('#ob-sp-none h4'))).toBe('Nothing found for “TKT-999999”');
  });

  it('shows the register text when the server refuses the reason', async () => {
    const el = await open();
    await find(el, 'TKT-000005', 'abc');
    (await request((u) => u.includes('/ops/support/tickets'))).flush(
      {
        type: 'about:blank',
        status: 422,
        code: 'VALIDATION.FAILED',
        detail: 'x',
        errors: [{ field: 'reason', code: 'GRV.LOOKUP_REASON' }],
      },
      { status: 422, statusText: 'Unprocessable' },
    );
    await settle();
    expect(text(el.querySelector('#ob-sp-why-e'))).toBe(translate('GRV.LOOKUP_REASON'));
  });

  it("tells a role without the task that the page isn't theirs", async () => {
    const el = await open({ ...officer([]), subTasks: ['home.view', 'task.home'] });
    expect(text(el.querySelector('.empty h4'))).toBe("This page isn't part of your role");
  });
});
