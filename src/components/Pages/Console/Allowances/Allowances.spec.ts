import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { financialYearEnd, firstOfNextMonth, limitsText, moneyInput } from './allowance-format';

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

const session = (over: object = {}) => ({
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'INSTITUTION_ADMIN', name: 'Institution Administrator', readOnly: false }],
  subTasks: ['home.view', 'task.home', 'task.allowances', 'allowances.view', 'allowances.issue'],
  preferredLang: 'en',
  ...over,
});

const grant = (over: object = {}) => ({
  id: 'g-1',
  student: { id: 's-1', name: 'Aarav Hegde', grade: 'Grade 6 B', admissionNo: 'TVPS/2019/0412' },
  name: 'Monthly pocket money',
  amount: money('500.00'),
  startDate: '2026-10-01',
  expiryDate: '2026-10-31',
  dailyLimits: { count: 3, amount: money('200.00') },
  status: 'ACTIVE',
  state: 'ACTIVE',
  walletNo: '565656000000123',
  walletStatus: 'ACTIVE',
  balance: money('380.00'),
  spent: money('120.00'),
  today: { spent: money('40.00'), count: 1 },
  issuedBy: { name: 'Prakash Shetty' },
  issuedAt: '2026-09-20T05:00:00.000Z',
  expired: null,
  creditedAt: '2026-09-30T18:35:00.000Z',
  endedAt: null,
  cancelReason: null,
  version: 2,
  ...over,
});

const list = {
  items: [
    grant(),
    grant({
      id: 'g-2',
      student: { id: 's-2', name: 'Anika Hegde', grade: 'Grade 3 A' },
      startDate: '2026-11-01',
      expiryDate: '2026-11-30',
      dailyLimits: null,
      state: 'SCHEDULED',
      balance: null,
      spent: money('0.00'),
      creditedAt: null,
      version: 1,
    }),
  ],
  kpis: { active: 1, scheduled: 1, issuedThisYear: money('1000.00'), balanceHeld: money('380.00') },
  defaults: { dailyCount: 3, dailyAmount: money('200.00') },
};

const classes = {
  year: { id: 'y-1', label: '2026–27' },
  items: [
    {
      id: 'c-6',
      name: 'Grade 6',
      order: 9,
      sections: [{ id: 'sec-6a', name: 'A', capacity: null, students: 1 }],
      students: 1,
      version: 1,
    },
  ],
};

const student = (id: string, name: string) => ({
  id,
  memberNo: 'TVPS-00001',
  name,
  kind: 'STUDENT',
  userType: { id: 'ut-s', name: 'Student', category: 'STUDENT' },
  department: null,
  admissionNo: `ADM/${id}`,
  employeeNo: null,
  grade: { class: 'Grade 6', section: 'A' },
  mobile: null,
});

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find((b) => text(b) === label) as HTMLButtonElement;
const toasts = () => text(document.querySelector('.toasts'));

describe('console allowances (ALW-002…005)', () => {
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

  async function open(s: object = session()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/allowances');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    (await request((u) => u === '/api/v1/console/allowances')).flush(list);
    (await request((u) => u === '/api/v1/console/classes')).flush(classes);
    await settle(5);
    return harness.routeNativeElement as HTMLElement;
  }

  it('formats limits, amounts and the default dates', () => {
    expect(limitsText({ count: 3, amount: money('200.00') as never })).toBe(
      '3 payments · ₹200.00 a day',
    );
    expect(limitsText(null)).toBe('');
    expect(moneyInput('500')).toBe('500.00');
    expect(moneyInput('12.5')).toBe('12.50');
    expect(moneyInput('1.234')).toBeNull();
    expect(firstOfNextMonth(new Date('2026-12-15T06:00:00Z'))).toBe('2027-01-01');
    expect(financialYearEnd('2026-11-01')).toBe('2027-03-31');
    expect(financialYearEnd('2027-02-01')).toBe('2027-03-31');
  });

  it('lists the grants with their figures and filters by state', async () => {
    const el = await open();
    expect(text(el.querySelector('h1, .c-page h2, .ph-t'))).toContain('Allowances');
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(text(rows[0])).toContain('Aarav Hegde');
    expect(text(rows[0])).toContain('3 payments · ₹200.00 a day');
    expect(text(rows[0])).toContain('Active');
    expect(text(rows[1])).toContain('Not credited');
    expect(text(rows[1])).toContain('Scheduled');
    expect(text(el)).toContain('₹1,000');

    button(el, 'Scheduled').click();
    await settle();
    const r = await request((u) => u === '/api/v1/console/allowances?state=SCHEDULED');
    r.flush({ ...list, items: [list.items[1]] });
    await settle();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('changes the daily limits and cancels a grant not yet credited (ALW-004)', async () => {
    const el = await open();
    (el.querySelectorAll('tbody tr')[0] as HTMLElement).click();
    await settle();
    let drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer)).toContain('565656 000000123');
    expect(text(drawer)).toContain('TVPS/2019/0412 · Grade 6 B');
    expect(text(drawer)).toContain('₹40.00 · 1×');
    expect(text(drawer)).toContain('Prakash Shetty · 20 Sep 2026');
    expect(button(drawer, 'Cancel allowance')).toBeUndefined();
    button(drawer, 'Change daily limits').click();
    await settle();
    const count = drawer.querySelector('#ad-count') as HTMLInputElement;
    count.value = '2';
    count.dispatchEvent(new Event('input'));
    await settle();
    button(drawer, 'Save limits').click();
    const patch = await request((u) => u === '/api/v1/console/allowances/g-1', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v2"');
    expect(patch.request.body).toEqual({ dailyLimits: { count: 2, amount: money('200.00') } });
    patch.flush(grant({ dailyLimits: { count: 2, amount: money('200.00') }, version: 3 }));
    await settle();
    expect(toasts()).toContain('Daily limits saved');
    (await request((u) => u === '/api/v1/console/allowances')).flush(list);
    button(document, 'Close')?.click();
    document.querySelector<HTMLButtonElement>('.drawer .x-btn')?.click();
    await settle();

    (el.querySelectorAll('tbody tr')[1] as HTMLElement).click();
    await settle();
    drawer = document.querySelector('.drawer') as HTMLElement;
    button(drawer, 'Cancel allowance').click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    const t = dlg.querySelector('textarea') as HTMLTextAreaElement;
    t.value = 'Left the school';
    t.dispatchEvent(new Event('input'));
    await settle(1);
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const cancel = await request((u) => u === '/api/v1/console/allowances/g-2', 'PATCH');
    expect(cancel.request.body).toEqual({ status: 'INACTIVE', reason: 'Left the school' });
    cancel.flush(
      grant({ id: 'g-2', state: 'CANCELLED', status: 'INACTIVE', cancelReason: 'Left the school' }),
    );
    await settle();
    expect(toasts()).toContain('Allowance cancelled');
  });

  it('issues allowances through the wizard: students, amount and dates, preview (ALW-003)', async () => {
    const el = await open();
    button(el, 'Issue allowance').click();
    const studs = await request((u) => u.startsWith('/api/v1/console/members?'));
    expect(studs.request.urlWithParams).toContain('kind=STUDENTS');
    studs.flush({
      year: null,
      columns: [],
      filters: [],
      counts: { tabs: {}, statuses: {} },
      items: [student('s-1', 'Aarav Hegde'), student('s-9', 'Kiran Rao')],
      nextCursor: null,
    });
    await settle();
    const modal = document.querySelector('.modal') as HTMLElement;
    expect(text(modal)).toContain('Holds an allowance');

    // A holder can't be issued another (BR-40): the wizard asks to remove them.
    const boxes = modal.querySelectorAll<HTMLInputElement>('.cm-pk-row input');
    boxes[0]!.click();
    boxes[1]!.click();
    await settle();
    button(modal, 'Continue').click();
    await settle();
    expect(text(modal)).toContain('already holds an allowance');
    button(modal, 'Remove them').click();
    await settle();
    button(modal, 'Continue').click();
    await settle();

    // Step 2: the fields are checked as the server would.
    const set = (id: string, v: string) => {
      const i = modal.querySelector(`#${id}`) as HTMLInputElement;
      i.value = v;
      i.dispatchEvent(new Event('input'));
    };
    button(modal, 'Continue').click();
    await settle();
    expect(text(modal)).toContain('Enter a name for the allowance');
    set('af-name', 'Term 2 pocket money');
    set('af-amount', '500');
    set('af-start', `${firstOfNextMonth().slice(0, 8)}15`);
    await settle();
    button(modal, 'Continue').click();
    await settle();
    expect(text(modal)).toContain('first day of the month');
    set('af-start', firstOfNextMonth());
    await settle();
    button(modal, 'Continue').click();
    await settle();
    expect(text(modal)).toContain('Total to be credited');
    expect(text(modal)).toContain('Kiran Rao');

    button(modal, 'Schedule for 1 student').click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const post = await request((u) => u === '/api/v1/console/allowances', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      studentIds: ['s-9'],
      name: 'Term 2 pocket money',
      amount: money('500.00'),
      startDate: firstOfNextMonth(),
      expiryDate: financialYearEnd(firstOfNextMonth()),
      dailyLimits: null,
    });
    post.flush({
      created: [{ studentId: 's-9', grantId: 'g-9', name: 'Kiran Rao' }],
      duplicates: [],
      refused: [],
    });
    await settle();
    expect(toasts()).toContain('1 allowance scheduled');
    expect(
      (await request((u) => u === '/api/v1/console/allowances?state=SCHEDULED')).request.method,
    ).toBe('GET');
  });

  it('shows the reports tab (ALW-005)', async () => {
    const el = await open();
    button(el, 'Reports').click();
    await settle();
    (await request((u) => u === '/api/v1/console/allowances/reports')).flush({
      from: '2026-09-20',
      to: '2026-10-03',
      kpis: {
        issued: money('1000.00'),
        spent: money('250.00'),
        expired: money('0.00'),
        scheduled: money('500.00'),
      },
      byDay: [{ date: '2026-10-03', spent: money('250.00') }],
      byMerchant: [{ merchant: 'Campus Canteen', spent: money('250.00') }],
      byClass: [{ class: 'Grade 6', issued: money('500.00'), spent: money('120.00') }],
      perStudent: [
        {
          student: { id: 's-1', name: 'Aarav Hegde', grade: 'Grade 6 B' },
          issued: money('500.00'),
          spent: money('120.00'),
          balance: money('380.00'),
          expired: money('0.00'),
        },
      ],
    });
    await settle();
    expect(text(el)).toContain('25.0% of issued');
    expect(text(el)).toContain('Campus Canteen');
    expect(text(el.querySelector('tbody'))).toContain('₹380.00');
  });
});
