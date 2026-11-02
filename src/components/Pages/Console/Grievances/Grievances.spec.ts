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
import { TICKET_MOVES, rupeesToPaise, txnType } from './grievance-format';

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
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const session = (over: object = {}) => ({
  name: 'NISHA PAI',
  email: 'grievances@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'GRIEVANCE_OFFICER', name: 'Grievance Officer', readOnly: false }],
  subTasks: [
    'home.view',
    'task.home',
    'task.grievances',
    'grievances.view',
    'grievances.edit',
    'task.approvals',
    'approvals.view',
  ],
  preferredLang: 'en',
  ...over,
});

const REASONS = {
  ESCALATED_VENDOR: { PAYMENT_PARTNER: 'Escalated to the payment partner', OTHER: 'Other' },
  ESCALATED_INTERNAL: { RECON_TEAM: 'Escalated to reconciliation', OTHER: 'Other' },
  RESOLVED: {
    REFUNDED: 'Refunded — issue resolved',
    CLARIFIED: 'Clarified to the member',
    OTHER: 'Other',
  },
  CLOSED: { CLARIFIED: 'Clarified to the member — issue closed', OTHER: 'Other' },
};

const ticket = (over: object = {}) => ({
  id: 't-1',
  ticketNo: 'TKT-000005',
  kind: 'TRANSACTION',
  category: 'WRONG_AMOUNT',
  categoryLabel: 'Wrong amount',
  issue: 'Charged ₹45 for a ₹25 snack at the canteen this morning.',
  channel: 'APP',
  status: 'OPEN',
  statusLabel: 'Open',
  priority: 2,
  awaitingApproval: null,
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
  createdAt: ago(1),
  updatedAt: ago(1),
  closedAt: null,
  ageDays: 1,
  old: false,
  version: 3,
  ...over,
});

const tile = (count: number, share = 0) => ({ count, share });
const list = (items: object[] = [], over: object = {}) => ({
  tiles: {
    total: 4,
    open: tile(2, 50),
    escalated: tile(1, 25),
    awaitingApproval: tile(1, 25),
    resolved: tile(0),
    closed: tile(1, 25),
    priority1Open: tile(1, 25),
    olderThanAgeing: tile(1, 25),
    ageingDays: 7,
  },
  reasons: REASONS,
  items,
  nextCursor: null,
  ...over,
});

const ITEMS = [
  ticket(),
  ticket({
    id: 't-2',
    ticketNo: 'TKT-000001',
    status: 'ESCALATED_INTERNAL',
    statusLabel: 'Escalated Internally',
    priority: 1,
    awaitingApproval: 'apr-1',
    member: { id: 'm-2', name: 'Mahesh Hegde', mobile: null },
    createdAt: ago(9),
    ageDays: 9,
    old: true,
  }),
  ticket({
    id: 't-3',
    ticketNo: 'FBK-000003',
    kind: 'FEEDBACK',
    category: 'SUGGESTION',
    categoryLabel: 'Suggestion',
    issue: 'Please add a fruit counter to the canteen.',
    transaction: null,
    priority: 3,
    createdAt: ago(2),
  }),
  ticket({
    id: 't-4',
    ticketNo: 'TKT-000006',
    status: 'CLOSED',
    statusLabel: 'Closed',
    reasonCode: 'CLARIFIED',
    resolution: 'Two separate orders.',
    createdAt: ago(3),
  }),
];

const detail = (over: object = {}) => ({
  ...ticket(),
  member: {
    id: 'm-1',
    name: 'Aarav Hegde',
    mobile: '•••••• 0000',
    transactions: {
      total: 11,
      items: [
        {
          reference: 'RPEP2WPRT21R14RGVBXKJ2LECL562770950',
          type: 'PAYMENT',
          direction: 'DEBIT',
          amount: money('45.00'),
          remarks: 'Masala dosa',
          at: '2026-10-04T04:20:00.000Z',
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
    },
  },
  refundable: true,
  reasons: REASONS,
  history: [
    {
      status: 'OPEN',
      statusLabel: 'Open',
      priority: 2,
      reasonCode: null,
      resolution: null,
      comment: null,
      by: 'You',
      byType: 'MEMBER',
      approved: false,
      at: '2026-10-04T05:37:00.000Z',
    },
  ],
  calls: [
    {
      id: 'c-1',
      direction: 'INBOUND',
      caller: 'Mahesh Hegde (parent)',
      minutes: 4,
      summary: 'Asked whether ₹45 was debited.',
      source: 'CONSOLE',
      ticket: { id: 't-1', ticketNo: 'TKT-000005' },
      loggedBy: 'Nisha Pai',
      at: '2026-10-04T05:40:00.000Z',
    },
  ],
  ...over,
});

const CALLS = {
  items: [
    detail().calls[0],
    {
      id: 'c-2',
      direction: 'OUTBOUND',
      caller: 'Unknown number',
      minutes: 2,
      summary: 'Caller asked for a balance — refused.',
      source: 'SUPPORT',
      ticket: null,
      loggedBy: "Joseph D'souza",
      at: '2026-10-03T05:40:00.000Z',
    },
  ],
  nextCursor: null,
};

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();
const toasts = () => document.querySelector('.toasts')?.textContent?.replace(/\s+/g, ' ') ?? '';
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find((b) => text(b) === label) as HTMLButtonElement;
const type = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  el.value = v;
  el.dispatchEvent(new Event('input'));
};
const choose = (el: HTMLSelectElement, v: string) => {
  el.value = v;
  el.dispatchEvent(new Event('change'));
};

describe('console grievances (GRV-006…010)', () => {
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

  async function open(s: object = session(), items: object[] = ITEMS) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/grievances');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    await settle(2);
    const el = harness.routeNativeElement as HTMLElement;
    if ((s as { subTasks: string[] }).subTasks.includes('grievances.view')) {
      (await request((u) => u === '/api/v1/console/tickets')).flush(list(items));
      (await request((u) => u === '/api/v1/console/call-logs')).flush(CALLS);
      await settle();
    }
    return el;
  }

  async function drawer(el: HTMLElement, no: string, d: object) {
    (el.querySelector(`#grv-table tbody tr[aria-label="Ticket ${no}"]`) as HTMLElement).click();
    await settle(1);
    (await request((u) => /^\/api\/v1\/console\/tickets\/t-\d$/.test(u))).flush(d);
    await settle();
    return document.querySelector('.drawer.cm-m') as HTMLElement;
  }

  it('formats the register moves, types and typed rupees', () => {
    expect(TICKET_MOVES.OPEN).toEqual([
      'ESCALATED_VENDOR',
      'ESCALATED_INTERNAL',
      'RESOLVED',
      'CLOSED',
    ]);
    expect(TICKET_MOVES.CLOSED).toEqual([]);
    expect(txnType('ALLOWANCE_PAYMENT')).toBe('Allowance payment');
    expect(txnType('SOMETHING_NEW')).toBe('Something new');
    expect(rupeesToPaise('1,250.5')).toBe(125050);
    expect(rupeesToPaise('12.345')).toBeNull();
  });

  it('shows the queue with its key figures, pills and tickets, and filters on the server', async () => {
    const el = await open();
    const kpis = [...el.querySelectorAll('#grv-kpis .kpi')].map((k) => [
      text(k.querySelector('.k-l')),
      text(k.querySelector('.k-v')),
      text(k.querySelector('.k-d')) ?? null,
    ]);
    expect(kpis).toEqual([
      ['Open', '2', '1 ticket older than 7 days'],
      ['Escalated', '1', null],
      ['Awaiting approval', '1', null],
      ['Priority 1 not closed', '1', '1 resolved or closed'],
    ]);
    expect(text(el.querySelector('#grv-tab-t'))).toBe('Tickets4');
    expect(text(el.querySelector('#grv-tab-c'))).toBe('Call log2');
    expect([...el.querySelectorAll('.pills .pill')].map((p) => text(p))).toEqual([
      'All4',
      'Open2',
      'Escalated1',
      'Awaiting approval1',
      'Resolved0',
      'Closed1',
    ]);
    const rows = [...el.querySelectorAll('#grv-table tbody tr')];
    expect(rows.length).toBe(4);
    const first = rows[0]!;
    expect(text(first.querySelector('td .t-mono'))).toBe('TKT-000005');
    expect(text(first.querySelector('td .cell-s'))).toBe('App · yesterday');
    expect(text(first.querySelectorAll('td')[2])).toBe(
      'RPEP2WPRT21R14RGVBXKJ2LECL562770950 ₹45.00 · Payment',
    );
    expect(first.querySelector('.chip.tone-warn')?.textContent?.trim()).toBe('Priority 2');
    const escalated = rows.find((r) => text(r.querySelector('.t-mono')) === 'TKT-000001')!;
    expect(text(escalated.querySelectorAll('td')[5])).toBe('Escalated InternallyAwaiting approval');
    expect(escalated.querySelector('.chip.tone-bad')?.textContent?.trim()).toBe('Priority 1');
    expect(text(escalated.querySelectorAll('td')[6])).toContain('9 days old');
    const feedback = rows.find((r) => text(r.querySelector('.t-mono')) === 'FBK-000003')!;
    expect(text(feedback.querySelectorAll('td')[2])).toBe('—Feedback');
    expect(text(el.querySelector('.fsum'))).toBe('4 tickets');

    button(el, 'Escalated1').click();
    harness.detectChanges();
    (await request((u) => u === '/api/v1/console/tickets?status=ESCALATED')).flush(
      list([ITEMS[1]!]),
    );
    await settle();
    expect(el.querySelectorAll('#grv-table tbody tr').length).toBe(1);

    type(el.querySelector('#gr-q') as HTMLInputElement, 'zzz');
    await new Promise((r) => setTimeout(r, 300));
    (await request((u) => u === '/api/v1/console/tickets?status=ESCALATED&q=zzz')).flush(list());
    await settle();
    expect(text(el.querySelector('#grv-table tbody .empty h4'))).toBe('No tickets match');
  });

  it('opens a ticket: snapshot, the member’s last transactions, history and calls', async () => {
    const el = await open();
    const d = await drawer(el, 'TKT-000005', detail());
    expect(text(d.querySelector('.sh-t h3'))).toBe('Ticket TKT-000005');
    expect(text(d.querySelector('.sh-t p'))).toBe('Aarav Hegde · ₹45.00');
    expect(text(d.querySelector('.card.flat'))).toContain('Issue · Wrong amount');
    const kv = [...d.querySelectorAll('#grv-txn dt')].map((x) => text(x));
    expect(kv).toEqual(['Reference', 'Date', 'Amount', 'Type', 'Remarks']);
    expect(text(d.querySelector('#grv-txn'))).toContain('Masala dosa');
    const last = [...d.querySelectorAll('#grv-last5 .li-t')].map((x) => text(x));
    expect(last).toEqual(['Masala dosa · ₹45.00', 'Adjustment · +₹8,000.00']);
    expect(text(d.querySelector('.sec-h .t-xs'))).toBe('11 transactions in total');
    // The member's own step is named, not "You" (the server's member view).
    expect(text(d.querySelector('#grv-history .tl-t'))).toBe('Ticket raised from the app');
    expect(text(d.querySelector('#grv-history .tl-s'))).toContain(
      'Aarav Hegde · Open · Priority 2',
    );
    expect(text(d.querySelector('#grv-calls .tl-t'))).toBe(
      'Incoming call · Mahesh Hegde (parent) · 4 min',
    );
    // Only the RC-20 moves from Open are offered.
    expect(
      [...(d.querySelector('#gu-status') as HTMLSelectElement).options].map((o) => o.value),
    ).toEqual(['OPEN', 'ESCALATED_VENDOR', 'ESCALATED_INTERNAL', 'RESOLVED', 'CLOSED']);
  });

  it('checks the form with the register texts, then sends a Priority 1 refund for approval', async () => {
    const el = await open();
    const d = await drawer(el, 'TKT-000005', detail());
    (d.closest('.ov')!.querySelector('#gu-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(d.querySelector('#gu-com-e'))).toBe(translate('GRV.COMMENT'));
    expect(text(d.querySelector('#gu-status-e'))).toBe('');

    type(d.querySelector('#gu-com') as HTMLTextAreaElement, 'Checked the canteen price list.');
    (d.closest('.ov')!.querySelector('#gu-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(d.querySelector('#gu-status-e'))).toBe(translate('GRV.NOTHING_CHANGED'));

    choose(d.querySelector('#gu-status') as HTMLSelectElement, 'RESOLVED');
    harness.detectChanges();
    (d.closest('.ov')!.querySelector('#gu-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(d.querySelector('#gu-reason-e'))).toBe(translate('GRV.REASON_REQUIRED'));

    choose(d.querySelector('#gu-reason') as HTMLSelectElement, 'REFUNDED');
    const refund = d.querySelector('#gu-refund') as HTMLInputElement;
    refund.checked = true;
    refund.dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect((d.querySelector('#gu-pri') as HTMLSelectElement).value).toBe('1');
    type(d.querySelector('#gu-ramt') as HTMLInputElement, '50.00');
    (d.closest('.ov')!.querySelector('#gu-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(d.querySelector('#gu-ramt-e'))).toBe(translate('VALIDATION.AMOUNT'));
    type(d.querySelector('#gu-ramt') as HTMLInputElement, '20');
    (d.closest('.ov')!.querySelector('#gu-save') as HTMLButtonElement).click();
    await settle(1);

    const dialog = document.querySelector('.modal.narrow') as HTMLElement;
    expect(text(dialog.querySelector('h3'))).toBe('Send this Priority 1 update for approval?');
    expect(text(dialog.querySelector('p'))).toContain(
      'Proposed: Resolved · Priority 1; refund ₹20.00',
    );
    button(dialog, 'Send for approval').click();
    const patch = await request((u) => u === '/api/v1/console/tickets/t-1', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v3"');
    expect(patch.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(patch.request.body).toEqual({
      status: 'RESOLVED',
      priority: 1,
      reasonCode: 'REFUNDED',
      resolution: null,
      comment: 'Checked the canteen price list.',
      refund: { amount: money('20.00') },
    });
    patch.flush(
      {
        approvalId: 'apr-9',
        appliedDirectly: false,
        code: 'GRV.SENT_FOR_APPROVAL',
        ticket: detail({ awaitingApproval: 'apr-9', version: 3 }),
      },
      { status: 202, statusText: 'Accepted' },
    );
    await settle(1);
    (await request((u) => u === '/api/v1/console/approvals/apr-9')).flush({
      id: 'apr-9',
      no: 'APR-0007',
      maker: { id: 'x', name: 'Nisha Pai', you: true, type: 'staff' },
      raisedAt: new Date().toISOString(),
    });
    await settle();
    expect(toasts()).toContain(translate('GRV.SENT_FOR_APPROVAL'));
    const now = document.querySelector('.drawer') as HTMLElement;
    expect(text(now.querySelector('#grv-awaiting'))).toContain(
      'An update is awaiting checker approval (APR-0007, raised by you just now)',
    );
    expect(now.querySelector('#gu-form')).toBeNull();
    expect(now.closest('.ov')!.querySelector('#gu-save')).toBeNull();
    expect(button(now, 'Open approvals')).toBeTruthy();
  });

  it('saves a plain update, and shows a field the server refuses under it', async () => {
    const el = await open();
    const d = await drawer(el, 'TKT-000005', detail());
    choose(d.querySelector('#gu-status') as HTMLSelectElement, 'ESCALATED_VENDOR');
    harness.detectChanges();
    choose(d.querySelector('#gu-reason') as HTMLSelectElement, 'PAYMENT_PARTNER');
    type(d.querySelector('#gu-com') as HTMLTextAreaElement, 'Asked the payment partner.');
    (d.closest('.ov')!.querySelector('#gu-save') as HTMLButtonElement).click();
    await settle(1);
    let dialog = document.querySelector('.modal.narrow') as HTMLElement;
    expect(text(dialog.querySelector('h3'))).toBe('Update TKT-000005?');
    expect(text(dialog.querySelector('p'))).toBe(
      'Open → Escalated to Vendor. The member is notified.',
    );
    button(dialog, 'Save update').click();
    let patch = await request((u) => u === '/api/v1/console/tickets/t-1', 'PATCH');
    const key = patch.request.headers.get('Idempotency-Key');
    patch.flush(
      {
        type: 'about:blank',
        status: 422,
        code: 'VALIDATION.FAILED',
        detail: 'x',
        errors: [{ field: 'comment', code: 'GRV.COMMENT' }],
      },
      { status: 422, statusText: 'Unprocessable' },
    );
    await settle();
    expect(text(d.querySelector('#gu-com-e'))).toBe(translate('GRV.COMMENT'));

    (d.closest('.ov')!.querySelector('#gu-save') as HTMLButtonElement).click();
    await settle(1);
    dialog = document.querySelector('.modal.narrow') as HTMLElement;
    button(dialog, 'Save update').click();
    patch = await request((u) => u === '/api/v1/console/tickets/t-1', 'PATCH');
    // A refused request is not repeated with its key: the next try is a new request.
    expect(patch.request.headers.get('Idempotency-Key')).not.toBe(key);
    patch.flush({
      approvalId: null,
      appliedDirectly: true,
      code: 'GRV.UPDATED',
      ticket: detail({
        status: 'ESCALATED_VENDOR',
        statusLabel: 'Escalated to Vendor',
        reasonCode: 'PAYMENT_PARTNER',
        version: 4,
      }),
    });
    await settle();
    expect(toasts()).toContain('Ticket Status Changed Successfully !!!');
    expect(toasts()).toContain('TKT-000005 · Escalated to Vendor · Priority 2');
    // The queue reloads with the new figures.
    (await request((u) => u === '/api/v1/console/tickets')).flush(list(ITEMS));
  });

  it('shows a closed ticket read-only', async () => {
    const el = await open();
    const d = await drawer(
      el,
      'TKT-000006',
      detail({
        id: 't-4',
        ticketNo: 'TKT-000006',
        status: 'CLOSED',
        statusLabel: 'Closed',
        reasonCode: 'CLARIFIED',
        resolution: 'Two separate orders.',
        history: [
          {
            status: 'CLOSED',
            statusLabel: 'Closed',
            priority: 2,
            reasonCode: 'CLARIFIED',
            resolution: 'Two separate orders.',
            comment: 'Closing after the call.',
            by: 'Prakash Shetty',
            byType: 'STAFF',
            approved: false,
            at: '2026-10-04T05:40:00.000Z',
          },
        ],
      }),
    );
    expect(text(d.querySelector('.note.tone-neutral'))).toBe(translate('GRV.CLOSED_READ_ONLY'));
    expect(d.querySelector('#gu-form')).toBeNull();
    expect(text(d.querySelector('#grv-history .tl-t'))).toBe(
      'Closing after the call. Resolution: Two separate orders.',
    );
    expect(text(d.querySelector('#grv-history .tl-s'))).toContain(
      'Prakash Shetty · Closed · Priority 2 · Clarified to the member — issue closed',
    );
  });

  it('logs a call with the register texts, and lists the call log', async () => {
    const el = await open();
    (el.querySelector('#grv-call') as HTMLButtonElement).click();
    await settle(1);
    const m = document.querySelector('.modal.cm-m') as HTMLElement;
    expect(
      [...(m.querySelector('#cl-t') as HTMLSelectElement).options].map((o) => text(o)),
    ).toEqual([
      'No ticket (general enquiry)',
      'TKT-000005 · Aarav Hegde',
      'TKT-000001 · Mahesh Hegde',
      'FBK-000003 · Aarav Hegde',
    ]);
    type(m.querySelector('#cl-min') as HTMLInputElement, '200');
    (m.closest('.ov')!.querySelector('#cl-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(m.querySelector('#cl-caller-e'))).toBe(translate('GRV.CALL_CALLER'));
    expect(text(m.querySelector('#cl-min-e'))).toBe(translate('GRV.CALL_MINUTES'));
    expect(text(m.querySelector('#cl-notes-e'))).toBe(translate('GRV.CALL_NOTES'));
    type(m.querySelector('#cl-caller') as HTMLInputElement, 'Unknown number');
    type(m.querySelector('#cl-min') as HTMLInputElement, '2');
    type(m.querySelector('#cl-notes') as HTMLTextAreaElement, 'Asked for a balance — refused.');
    choose(m.querySelector('#cl-dir') as HTMLSelectElement, 'OUTBOUND');
    (m.closest('.ov')!.querySelector('#cl-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/call-logs', 'POST');
    expect(post.request.body).toEqual({
      ticketId: null,
      direction: 'OUTBOUND',
      caller: 'Unknown number',
      minutes: 2,
      summary: 'Asked for a balance — refused.',
    });
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    post.flush({ ...CALLS.items[1], id: 'c-3', source: 'CONSOLE', loggedBy: 'Nisha Pai' });
    await settle();
    expect(toasts()).toContain('Call logged');
    expect(document.querySelector('.modal.cm-m')).toBeNull();
    (await request((u) => u === '/api/v1/console/call-logs')).flush(CALLS);
    await settle();

    (el.querySelector('#grv-tab-c') as HTMLButtonElement).click();
    harness.detectChanges();
    const rows = [...el.querySelectorAll('#grv-calls-table tbody tr')].map((r) =>
      [...r.querySelectorAll('td')].map((td) => text(td)),
    );
    expect(rows[0]).toEqual([
      expect.stringMatching(/^04 Oct 2026/),
      'Mahesh Hegde (parent)Incoming · 4 min',
      'TKT-000005',
      'Asked whether ₹45 was debited.',
      'Nisha Pai',
    ]);
    expect(rows[1]!.slice(1, 3)).toEqual(['Unknown numberOutgoing · 2 min', 'No ticket']);
    expect(rows[1]![4]).toBe("Joseph D'souza (CampusOne support)");
  });

  it('is read-only for Management', async () => {
    const el = await open(
      session({
        roles: [{ code: 'MANAGEMENT', name: 'Management', readOnly: true }],
        subTasks: ['home.view', 'task.grievances', 'grievances.view'],
      }),
    );
    expect(text(el.querySelector('.note.tone-info'))).toContain('Read-only.');
    expect((el.querySelector('.c-ph .cp-why button') as HTMLButtonElement).disabled).toBe(true);
    const d = await drawer(el, 'TKT-000005', detail());
    expect(d.querySelector('#gu-form')).toBeNull();
    expect(text(d.querySelector('.note.tone-info'))).toContain('Management has read-only access');
  });

  it("tells a role without the task that the page isn't theirs", async () => {
    const none = await open(session({ subTasks: ['home.view', 'task.home'] }));
    expect(text(none.querySelector('.empty h4'))).toBe("This page isn't part of your role");
    TestBed.inject(HttpTestingController).expectNone((r) => r.url.includes('/tickets'));
  });
});
