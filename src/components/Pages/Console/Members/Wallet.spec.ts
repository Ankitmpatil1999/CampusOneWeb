import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { amountParts, inrText } from '../../../Shared/Amount';
import { walletNo } from './MemberWallet';

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

const money = (amount: string) => ({ amount, currency: 'INR' });

const session = (subTasks: string[]) => ({
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'INSTITUTION_ADMIN', name: 'Institution Administrator', readOnly: false }],
  subTasks: ['home.view', 'members.view', 'task.home', 'task.members', ...subTasks],
  preferredLang: 'en',
});

const list = {
  year: { id: 'y-1', label: '2026-27' },
  columns: [],
  filters: [],
  counts: {
    tabs: { STUDENTS: 1, PARENTS: 0, STAFF: 0, MERCHANTS: 0, ALL: 1 },
    statuses: { ACTIVE: 1, INACTIVE: 0, SUSPENDED: 0 },
  },
  items: [
    {
      id: 'm-1',
      memberNo: 'TVPS-01681',
      name: 'Aarav Bhat',
      kind: 'STUDENTS',
      userType: { id: 'ut-s', name: 'Student', category: 'STUDENT' },
      department: null,
      admissionNo: 'TVPS/2023/0375',
      employeeNo: null,
      grade: { class: 'Grade 5', section: 'A' },
      mobile: null,
      linked: true,
      status: 'ACTIVE',
      wallet: { status: 'ACTIVE', balance: money('2268.40') },
      pending: { suspension: false, delink: false },
      customFields: {},
    },
  ],
  nextCursor: null,
};

const detail = {
  id: 'm-1',
  memberNo: 'TVPS-01681',
  name: 'Aarav Bhat',
  firstName: 'Aarav',
  lastName: 'Bhat',
  kind: 'STUDENTS',
  userType: { id: 'ut-s', name: 'Student', category: 'STUDENT' },
  department: null,
  gender: 'MALE',
  dateOfBirth: '2016-03-21',
  admissionNo: 'TVPS/2023/0375',
  employeeNo: null,
  joinedOn: '2023-06-01',
  grade: { class: 'Grade 5', classId: 'c-5', section: 'A', sectionId: 's-5a', year: '2026-27' },
  contact: { mobile: null, email: null },
  account: { linked: true, mobileMasked: '••••••0981' },
  guardians: [],
  wards: [],
  roles: [],
  status: 'ACTIVE',
  statusReason: null,
  statusChangedAt: null,
  transactionPermission: { enabled: true, reason: null, changedAt: null },
  wallet: { status: 'ACTIVE', balance: money('2268.40') },
  pending: { suspension: false, delink: false },
  customFields: [],
  onboardedAt: '2023-06-01T05:00:00.000Z',
  lastChangedAt: null,
  version: 3,
};

const wallets = {
  wallets: [
    {
      id: 'w-1',
      kind: 'CAMPUS',
      walletNo: '410200981',
      status: 'ACTIVE',
      balance: money('2268.40'),
      held: money('500.00'),
      virtualAccount: 'RPTV410200981',
      spentToday: money('45.00'),
      spentThisMonth: money('165.50'),
    },
    {
      id: 'w-2',
      kind: 'ALLOWANCE',
      walletNo: '810245000000981',
      status: 'ACTIVE',
      balance: money('0.00'),
      held: money('0.00'),
      virtualAccount: null,
      spentToday: money('0.00'),
      spentThisMonth: money('0.00'),
    },
  ],
};

const row = (i: number, direction: 'DEBIT' | 'CREDIT', amount: string, balance: string) => ({
  id: String(100 - i),
  reference: `PAY2610030${i}`,
  type: direction === 'DEBIT' ? 'MERCHANT_PAYMENT' : 'BANK_CREDIT',
  title: direction === 'DEBIT' ? 'Canteen payment' : 'Money added',
  channel: 'QR',
  channelLabel: direction === 'DEBIT' ? 'QR code' : 'Virtual account',
  direction,
  amount: money(amount),
  balanceAfter: money(balance),
  counterparty: direction === 'DEBIT' ? 'Annapoorna Canteen' : 'Mahesh Bhat',
  narration: null,
  at: '2026-10-03T06:10:00.000Z',
});

describe('console member drawer — wallets, statement and payments (WAL-008/009, IDN-056)', () => {
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

  async function openDrawer(
    subTasks: string[],
    over: object = {},
  ): Promise<{ harness: RouterTestingHarness; drawer: HTMLElement }> {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/members');
    (await request((u) => u === '/api/v1/console/session')).flush(session(subTasks));
    await nav;
    (await request((u) => u.startsWith('/api/v1/console/members?'))).flush(list);
    (await request((u) => u === '/api/v1/console/classes')).flush({ year: null, items: [] });
    (await request((u) => u === '/api/v1/console/user-types')).flush({ items: [] });
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    const el = harness.routeNativeElement as HTMLElement;
    (el.querySelector('tbody tr') as HTMLElement).click();
    (await request((u) => u === '/api/v1/console/members/m-1')).flush({ ...detail, ...over });
    (await request((u) => u === '/api/v1/console/members/m-1/wallets')).flush(wallets);
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    return { harness, drawer: document.querySelector('.drawer') as HTMLElement };
  }

  async function statusTab(harness: RouterTestingHarness, drawer: HTMLElement) {
    [...drawer.querySelectorAll('.tabs .tab')]
      .find((t) => t.textContent?.includes('Status & wallet'))
      ?.dispatchEvent(new Event('click'));
    harness.detectChanges();
  }

  it('formats API money the Indian way without floats', () => {
    expect(amountParts({ amount: '124560.5' })).toEqual({
      neg: false,
      whole: '1,24,560',
      dec: '.50',
    });
    expect(amountParts({ amount: '-45.00' })).toEqual({ neg: true, whole: '45', dec: '.00' });
    expect(inrText({ amount: '2268.40' })).toBe('₹2,268.40');
    expect(walletNo('410200981')).toBe('4102 00981');
    expect(walletNo('810245000000981')).toBe('8102 4500 0000 981');
  });

  it('shows the campus balance, the wallets and the statement with a cursor "Load more"', async () => {
    const { harness, drawer } = await openDrawer(['members.status']);
    expect(drawer.querySelector('.cp-msum-k')?.textContent?.replace(/\s+/g, '')).toBe(
      'Campuswallet₹2,268.40',
    );
    await statusTab(harness, drawer);
    const first = await request((u) => u.startsWith('/api/v1/console/members/m-1/statement'));
    expect(first.request.params.get('limit')).toBe('20');
    expect(first.request.params.has('cursor')).toBe(false);
    first.flush({
      items: [row(0, 'DEBIT', '45.00', '2268.40'), row(1, 'CREDIT', '1500.00', '2313.40')],
      openingBalance: money('813.40'),
      closingBalance: money('2268.40'),
      nextCursor: 'c-1',
    });
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();

    const kv = [...drawer.querySelectorAll('.kv')].find((k) =>
      k.textContent?.includes('Campus wallet'),
    ) as HTMLElement;
    const pairs = [...kv.querySelectorAll('dt')].map((dt) => [
      dt.textContent?.trim(),
      dt.nextElementSibling?.textContent?.replace(/\s+/g, ' ').trim(),
    ]);
    expect(pairs).toEqual([
      ['Campus wallet', '4102 00981 · Active'],
      ['Balance', '₹2,268.40'],
      ['Allowance wallet', '8102 4500 0000 981 · Active'],
      ['Allowance balance', '₹0.00'],
      ['Virtual account for top-ups', 'RPTV410200981'],
    ]);
    expect(drawer.textContent).toContain('₹500.00 held');

    const rows = () => [...drawer.querySelectorAll('.tbl.dense tbody tr')] as HTMLElement[];
    expect(rows().length).toBe(2);
    expect(rows()[0]?.textContent).toContain('Canteen payment');
    expect(rows()[0]?.textContent).toContain('To Annapoorna Canteen · QR code · PAY26100300');
    expect(rows()[0]?.querySelector('td.r')?.textContent?.replace(/\s+/g, '')).toBe('−₹45.00');
    expect(rows()[1]?.querySelector('td.r .amt')?.classList).toContain('cr');
    expect(rows()[0]?.textContent).toContain('03 Oct 2026');
    expect(rows()[0]?.textContent).toContain('11:40 AM');

    (drawer.querySelector('#cp-st-more') as HTMLButtonElement).click();
    const more = await request((u) => u.startsWith('/api/v1/console/members/m-1/statement'));
    expect(more.request.params.get('cursor')).toBe('c-1');
    more.flush({
      items: [row(2, 'CREDIT', '813.40', '813.40')],
      openingBalance: money('0.00'),
      closingBalance: money('813.40'),
      nextCursor: null,
    });
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    expect(rows().length).toBe(3);
    expect(drawer.querySelector('#cp-st-more')).toBeNull();

    // Dates narrow the statement and start again from the newest movement.
    const from = drawer.querySelector('#cp-st-from') as HTMLInputElement;
    from.value = '2026-10-01';
    from.dispatchEvent(new Event('change'));
    harness.detectChanges();
    const dated = await request((u) => u.startsWith('/api/v1/console/members/m-1/statement'));
    expect(dated.request.params.get('from')).toBe('2026-10-01');
    expect(dated.request.params.has('cursor')).toBe(false);
  });

  it('turns payments off with a reason and If-Match, then on again with the new version', async () => {
    const { harness, drawer } = await openDrawer(['members.status']);
    await statusTab(harness, drawer);
    const toggle = () => drawer.querySelector('#cp-m-txn') as HTMLButtonElement;
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(toggle().disabled).toBe(false);

    toggle().click();
    await tick();
    harness.detectChanges();
    let dialog = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(dialog.querySelector('h3')?.textContent?.trim()).toBe(
      'Turn off payments for Aarav Bhat?',
    );
    const reason = dialog.querySelector('textarea') as HTMLTextAreaElement;
    expect(reason.maxLength).toBe(300);
    reason.value = 'Parent asked to pause spending';
    reason.dispatchEvent(new Event('input'));
    [...dialog.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Turn off payments')
      ?.click();
    const put = await request(
      (u) => u === '/api/v1/console/members/m-1/transaction-permission',
      'PUT',
    );
    expect(put.request.headers.get('If-Match')).toBe('"v3"');
    expect(put.request.body).toEqual({ enabled: false, reason: 'Parent asked to pause spending' });
    put.flush({
      enabled: false,
      reason: 'Parent asked to pause spending',
      changedAt: '2026-10-03T07:00:00.000Z',
      version: 4,
    });
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(drawer.querySelector('.cp-msum')?.textContent).toContain('Payments off');
    expect(drawer.querySelector('#cp-m-txn-last')?.textContent).toContain(
      'Turned off 03 Oct 2026 · 12:30 PM · Parent asked to pause spending',
    );
    expect(document.querySelector('.toasts')?.textContent).toContain('Payments turned off');

    toggle().click();
    await tick();
    harness.detectChanges();
    dialog = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    const again = dialog.querySelector('textarea') as HTMLTextAreaElement;
    again.value = 'Spending allowed again';
    again.dispatchEvent(new Event('input'));
    [...dialog.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Turn on payments')
      ?.click();
    const on = await request(
      (u) => u === '/api/v1/console/members/m-1/transaction-permission',
      'PUT',
    );
    expect(on.request.headers.get('If-Match')).toBe('"v4"');
    expect(on.request.body).toEqual({ enabled: true, reason: 'Spending allowed again' });
  });

  it('reads the permission from the member detail and shows a refused change in register wording', async () => {
    const { harness, drawer } = await openDrawer(['members.status'], {
      transactionPermission: {
        enabled: false,
        reason: 'Fee dispute',
        changedAt: '2026-10-02T05:00:00.000Z',
      },
    });
    // IDN-045 carries the permission: the history is not read for it.
    const ctl = TestBed.inject(HttpTestingController);
    expect(ctl.match((r) => r.url.endsWith('/history')).length).toBe(0);
    expect(drawer.querySelector('.cp-msum')?.textContent).toContain('Payments off');
    await statusTab(harness, drawer);
    expect(drawer.querySelector('#cp-m-txn-last')?.textContent).toContain(
      'Turned off 02 Oct 2026 · 10:30 AM · Fee dispute',
    );
    const toggle = drawer.querySelector('#cp-m-txn') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    toggle.click();
    await tick();
    harness.detectChanges();
    const dialog = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    const reason = dialog.querySelector('textarea') as HTMLTextAreaElement;
    reason.value = 'Dispute settled';
    reason.dispatchEvent(new Event('input'));
    [...dialog.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Turn on payments')
      ?.click();
    const put = await request(
      (u) => u === '/api/v1/console/members/m-1/transaction-permission',
      'PUT',
    );
    put.flush(
      { code: 'GEN.CONFLICT_VERSION', status: 412, detail: 'x', correlationId: 'c-9' },
      { status: 412, statusText: 'Precondition Failed' },
    );
    for (let i = 0; i < 3; i++) await tick();
    harness.detectChanges();
    expect(document.querySelector('.toasts')?.textContent).toContain('Not changed');
    expect(document.querySelector('.toasts')?.textContent).toContain(
      'Someone else changed this record. Reload it and make your change again.',
    );
    // The drawer reloads the member to get the newer version.
    await request((u) => u === '/api/v1/console/members/m-1');
  });

  const held = (
    id: string,
    memberId: string,
    status: 'HELD' | 'PROCESSED' | 'RETURNED',
    amount: string,
    resolvedAt: string | null = null,
  ) => ({
    id,
    amount: money(amount),
    member: { id: memberId, name: memberId === 'm-1' ? 'Aarav Bhat' : 'Diya Rao' },
    wallet: { number: '•••• 0981', status: 'SUSPENDED' },
    vaNumber: 'RPTV410200981',
    utr: `UTR882140776${id.slice(-1)}`,
    mode: 'IMPS',
    sender: 'MAHESH BHAT',
    creditedAt: '2026-10-02T03:35:00.000Z',
    status,
    reason: status === 'RETURNED' ? 'Sent by mistake' : null,
    resolvedAt,
  });

  it("lists a suspended member's held bank credits for a role that sees transactions (WAL-010)", async () => {
    const { harness, drawer } = await openDrawer(['members.status', 'recon.view'], {
      status: 'SUSPENDED',
      statusReason: 'Fee dispute',
      statusChangedAt: '2026-10-01T04:30:00.000Z',
    });
    await statusTab(harness, drawer);
    // WAL-010 has no member filter: its pages are read and this member's credits kept.
    const first = await request((u) => u === '/api/v1/console/held-credits');
    first.flush({
      items: [held('h-1', 'm-1', 'HELD', '500.00'), held('h-2', 'm-2', 'HELD', '900.00')],
      nextCursor: 'hc-2',
    });
    const second = await request((u) => u === '/api/v1/console/held-credits?cursor=hc-2');
    second.flush({
      items: [
        held('h-3', 'm-1', 'PROCESSED', '250.00', '2026-09-15T12:50:00.000Z'),
        held('h-4', 'm-1', 'RETURNED', '100.00', '2026-09-10T12:50:00.000Z'),
      ],
      nextCursor: null,
    });
    for (let i = 0; i < 4; i++) await tick();
    harness.detectChanges();
    expect(drawer.querySelector('#cp-held-note')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '₹500.00 held from 1 bank credit while suspended. It posts to the wallet when the suspension is lifted (OI-WAL-24).',
    );
    const rows = [...drawer.querySelectorAll('#cp-held tbody tr')] as HTMLElement[];
    expect(rows.length).toBe(3);
    expect(rows[0]?.textContent).toContain('02 Oct 2026');
    expect(rows[0]?.textContent).toContain('Mahesh Bhat');
    expect(rows[0]?.textContent).toContain('IMPS · UTR UTR8821407761');
    expect(rows[0]?.querySelector('td.r')?.textContent?.replace(/\s+/g, '')).toBe('₹500.00');
    expect(rows[0]?.querySelector('.chip')?.textContent).toBe('Held');
    expect(rows[1]?.querySelector('.chip')?.textContent).toBe('Posted to the wallet');
    expect(rows[1]?.textContent).toContain('15 Sep 2026');
    expect(rows[2]?.querySelector('.chip')?.textContent).toBe('Returned to the sender');
    expect(rows[2]?.textContent).toContain('Sent by mistake');
    expect(drawer.textContent).not.toContain('Diya Rao');
  });

  it('reads no held credits without “See transactions” and keeps the WAL-008 note', async () => {
    const { harness, drawer } = await openDrawer(['members.status'], { status: 'SUSPENDED' });
    await statusTab(harness, drawer);
    for (let i = 0; i < 4; i++) await tick();
    harness.detectChanges();
    const ctl = TestBed.inject(HttpTestingController);
    expect(ctl.match((r) => r.url.includes('held-credits')).length).toBe(0);
    expect(drawer.querySelector('#cp-held')).toBeNull();
    expect(drawer.querySelector('#cp-held-note')?.textContent).toContain(
      '₹500.00 held from bank credits while suspended.',
    );
  });

  it('keeps the switch locked without the “Activate, suspend, deactivate” sub-task', async () => {
    const { harness, drawer } = await openDrawer([]);
    await statusTab(harness, drawer);
    const toggle = drawer.querySelector('#cp-m-txn') as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    expect(toggle.parentElement?.getAttribute('title')).toBe(
      "Your role doesn't include this task.",
    );
  });
});
