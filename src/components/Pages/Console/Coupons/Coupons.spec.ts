import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { istBusinessDate } from '../../../Utils/format';
import { presetRange } from './ConsoleCoupons';
import { periodRange } from './CouponReports';
import {
  acceptsLabel,
  addDays,
  byMonth,
  daysOf,
  dowMon,
  monthEnd,
  rate,
  windowLabel,
} from './coupon-format';

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
const TODAY = istBusinessDate(new Date());
const TOMORROW = addDays(TODAY, 1);

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
  subTasks: [
    'home.view',
    'task.home',
    'task.coupons',
    'coupons.view',
    'coupons.edit',
    'coupons.issue',
  ],
  preferredLang: 'en',
  ...over,
});

const slots = [
  { id: 'sl-b', name: 'Breakfast', start: '07:00', end: '11:00', types: 1 },
  { id: 'sl-d', name: 'Dinner', start: '19:00', end: '22:00', types: 1 },
];
const type = (over: object = {}) => ({
  id: 't-b',
  name: 'Breakfast',
  kind: 'MEAL',
  description: null,
  slot: { id: 'sl-b', name: 'Breakfast' },
  window: { start: '07:00', end: '11:00' },
  value: money('0.00'),
  holdMax: 31,
  redeemMax: 1,
  period: 'DAY',
  acceptsAll: false,
  merchants: [{ id: 'm-1', name: 'Hostel Mess' }],
  issueFrom: null,
  issueTo: null,
  status: 'ACTIVE',
  version: 1,
  ...over,
});
const types = [
  type(),
  type({
    id: 't-d',
    name: 'Dinner',
    slot: { id: 'sl-d', name: 'Dinner' },
    window: { start: '19:00', end: '22:00' },
    acceptsAll: true,
    merchants: [],
  }),
  type({
    id: 't-f',
    name: 'Fest food stall',
    kind: 'EVENT',
    slot: null,
    window: { start: '09:00', end: '20:00' },
    value: money('100.00'),
    holdMax: 2,
    status: 'INACTIVE',
  }),
];
const coupon = (over: object = {}) => ({
  id: 'c0a1b2c3-0000-4000-8000-000000000001',
  student: { id: 's-1', name: 'Aarav Hegde' },
  type: { id: 't-b', name: 'Breakfast', kind: 'MEAL' },
  validOn: TODAY,
  window: { start: '07:00', end: '11:00' },
  status: 'USED',
  state: 'USED',
  usedAt: `${TODAY}T03:10:00.000Z`,
  merchant: 'Hostel Mess',
  endedAt: null,
  cancelReason: null,
  ...over,
});
const coupons = {
  items: [
    coupon(),
    coupon({
      id: 'c0a1b2c3-0000-4000-8000-000000000002',
      student: { id: 's-2', name: 'Kiran Rao' },
      type: { id: 't-d', name: 'Dinner', kind: 'MEAL' },
      window: { start: '19:00', end: '22:00' },
      validOn: TOMORROW,
      status: 'ACTIVE',
      state: 'ACTIVE',
      usedAt: null,
      merchant: null,
    }),
  ],
  nextCursor: null,
};
const report = (from: string, to: string) => ({
  from,
  to,
  kpis: { issued: 858, used: 712, expired: 106, active: 40, cancelled: 4 },
  byDay: [{ date: TODAY, issued: 40, used: 18, expired: 0, active: 22 }],
  byType: [{ type: 'Breakfast', issued: 480, used: 233, expired: 28, active: 219 }],
  byMerchant: [{ merchant: 'Hostel Mess', used: 233 }],
  perStudent: [
    { student: { id: 's-1', name: 'Aarav Hegde' }, issued: 31, used: 20, expired: 2, active: 9 },
  ],
});
const issuances = {
  items: [
    {
      id: 'a1b2c3d4-0000-4000-8000-000000000009',
      from: '2026-09-30',
      to: '2026-09-30',
      excludedDates: [],
      types: [{ id: 't-b', name: 'Breakfast' }],
      students: 4,
      created: 5,
      skipped: 0,
      refused: 0,
      issuedAt: '2026-09-28T09:35:00.000Z',
    },
  ],
};
const classes = {
  year: { id: 'y-1', label: '2026–27' },
  items: [
    {
      id: 'c-6',
      name: 'Grade 6',
      order: 9,
      sections: [{ id: 'sec-6a', name: 'A', capacity: null, students: 2 }],
      students: 2,
      version: 1,
    },
  ],
};
const student = (id: string, name: string) => ({
  id,
  memberNo: 'TVPS-00001',
  name,
  kind: 'STUDENTS',
  userType: { id: 'ut-s', name: 'Student', category: 'STUDENT' },
  department: null,
  admissionNo: `ADM/${id}`,
  employeeNo: null,
  grade: { class: 'Grade 6', section: 'A' },
  mobile: null,
});
const students = {
  year: null,
  columns: [],
  filters: [],
  counts: { tabs: {}, statuses: {} },
  items: [student('s-1', 'Aarav Hegde'), student('s-2', 'Kiran Rao')],
  nextCursor: null,
};

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find((b) => text(b) === label) as HTMLButtonElement;
const toasts = () => text(document.querySelector('.toasts'));
const confirmOk = () =>
  ([...document.querySelectorAll('.modal[role="alertdialog"] .sh-f button')] as HTMLButtonElement[])
    .at(-1)!
    .click();
const set = (root: ParentNode, sel: string, v: string) => {
  const i = root.querySelector(sel) as HTMLInputElement;
  i.value = v;
  i.dispatchEvent(new Event('input'));
};

describe('console coupons (CPN-003…012)', () => {
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
    const nav = harness.navigateByUrl('/console/coupons');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    (await request((u) => u.startsWith('/api/v1/console/coupons?from='))).flush(coupons);
    (await request((u) => u.startsWith('/api/v1/console/coupons/reports?from='))).flush(
      report(`${TODAY.slice(0, 8)}01`, monthEnd(TODAY)),
    );
    (await request((u) => u === '/api/v1/console/coupon-types')).flush({ items: types });
    (await request((u) => u === '/api/v1/console/coupon-slots')).flush({ items: slots });
    (await request((u) => u === '/api/v1/console/coupon-issuances')).flush(issuances);
    (await request((u) => u === '/api/v1/console/classes')).flush(classes);
    await settle(5);
    return harness.routeNativeElement as HTMLElement;
  }

  it('formats windows, periods and date ranges', () => {
    expect(windowLabel(types[0] as never)).toBe('Breakfast · 07:00–11:00');
    expect(windowLabel(types[2] as never)).toBe('Own window · 09:00–20:00');
    expect(acceptsLabel(types[1] as never)).toBe('Every regular merchant');
    expect(acceptsLabel(types[0] as never)).toBe('Hostel Mess');
    expect(rate(712, 106)).toBe(87);
    expect(rate(0, 0)).toBe(0);
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
    expect(daysOf('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(daysOf('2026-11-02', '2026-10-30')).toEqual([]);
    expect(byMonth(daysOf('2026-10-30', '2026-11-02')).map((m) => m.key)).toEqual([
      '2026-10',
      '2026-11',
    ]);
    expect(dowMon('2026-10-05')).toBe(0); // a Monday
    expect(presetRange('week', '2026-10-04')).toEqual({ from: '2026-09-28', to: '2026-10-11' });
    expect(presetRange('all', '2026-10-04')).toEqual({});
    expect(periodRange('month', '2026-10-04')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange('30', '2026-10-04')).toEqual({ from: '2026-09-05', to: '2026-10-04' });
  });

  it("lists the issued coupons with today's and the month's figures, and filters", async () => {
    const el = await open();
    expect(text(el.querySelector('h1'))).toContain('Coupons');
    const kpis = text(el.querySelector('.c-grid.k4'));
    expect(kpis).toContain('22');
    expect(kpis).toContain('18');
    expect(kpis).toContain('858');
    expect(kpis).toContain('106');
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    // Newest date first.
    expect(text(rows[0])).toContain('Kiran Rao');
    expect(text(rows[0])).toContain('Dinner · 19:00–22:00');
    expect(text(rows[1])).toContain('Used');
    expect(text(rows[1])).toContain('Hostel Mess');

    button(el, 'Used').click();
    await settle();
    const r = await request(
      (u) => u.startsWith('/api/v1/console/coupons?') && u.includes('state=USED'),
    );
    r.flush({ items: [coupons.items[0]], nextCursor: null });
    await settle();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);

    set(el, '#cpn-q', 'nobody');
    await settle();
    expect(text(el.querySelector('tbody'))).toContain('No coupons in this view');
  });

  it('issues coupons: students, types, dates with an excluded day, confirmation (CPN-008)', async () => {
    const el = await open();
    (el.querySelector('#cpn-tab-issue') as HTMLButtonElement).click();
    await settle();
    (await request((u) => u.startsWith('/api/v1/console/members?'))).flush(students);
    await settle();

    // Nothing chosen: refused before the server.
    (el.querySelector('#ci-go') as HTMLButtonElement).click();
    await settle();
    expect(toasts()).toContain('Choose at least one student.');

    const boxes = el.querySelectorAll<HTMLInputElement>('.cm-pk-row input');
    boxes[0]!.click();
    boxes[1]!.click();
    const typeBoxes = el.querySelectorAll<HTMLInputElement>('.cm-type input');
    expect(typeBoxes[2]!.disabled).toBe(true); // inactive type
    typeBoxes[1]!.click();
    await settle();
    const days = daysOf(TOMORROW, monthEnd(TOMORROW));
    expect(text(el.querySelector('.cm-side'))).toContain(`${days.length * 2}`);
    // Exclude the first day of the range.
    (el.querySelector('.cm-day') as HTMLButtonElement).click();
    await settle();
    expect(text(el.querySelector('.cm-issue'))).toContain('Excluded dates: 1');

    (el.querySelector('#ci-go') as HTMLButtonElement).click();
    await settle(2);
    confirmOk();
    const post = await request((u) => u === '/api/v1/console/coupon-issuances', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      typeIds: ['t-d'],
      from: TOMORROW,
      to: monthEnd(TOMORROW),
      excludedDates: [TOMORROW],
      studentIds: ['s-1', 's-2'],
    });
    post.flush({
      issuanceId: 'b1b2c3d4-0000-4000-8000-000000000010',
      created: 30,
      skipped: 2,
      perStudent: [
        { studentId: 's-1', name: 'Aarav Hegde', created: 30, skipped: 2, refused: null },
        { studentId: 's-2', name: 'Kiran Rao', created: 0, skipped: 0, refused: 'CPN.HOLD_MAX' },
      ],
    });
    await settle();
    expect(toasts()).toContain('30 coupons issued');
    expect(toasts()).toContain('1 student not issued');
    // The log opens with the new issuance and its per-student counts.
    (await request((u) => u === '/api/v1/console/coupon-issuances')).flush({
      items: [
        {
          ...issuances.items[0],
          id: 'b1b2c3d4-0000-4000-8000-000000000010',
          students: 2,
          created: 30,
          skipped: 2,
          refused: 1,
        },
      ],
    });
    await settle();
    expect(el.querySelector('#cpn-tab-log')?.classList.contains('on')).toBe(true);
    (el.querySelectorAll('tbody tr')[0] as HTMLElement).click();
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer)).toContain('Per student');
    expect(text(drawer)).toContain('Kiran Rao');
    expect(text(drawer)).toContain('Over a holding maximum');
  });

  it('shows the students over the cap when the server refuses the whole issuance', async () => {
    const el = await open();
    (el.querySelector('#cpn-tab-issue') as HTMLButtonElement).click();
    await settle();
    (await request((u) => u.startsWith('/api/v1/console/members?'))).flush(students);
    await settle();
    el.querySelectorAll<HTMLInputElement>('.cm-pk-row input')[0]!.click();
    el.querySelectorAll<HTMLInputElement>('.cm-type input')[0]!.click();
    await settle();
    (el.querySelector('#ci-go') as HTMLButtonElement).click();
    await settle(2);
    confirmOk();
    const post = await request((u) => u === '/api/v1/console/coupon-issuances', 'POST');
    post.flush(
      {
        code: 'CPN.ISSUE_LIMIT',
        params: { max: 124 },
        errors: [{ field: 'studentIds.s-1', code: 'CPN.ISSUE_LIMIT' }],
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await settle();
    const side = text(el.querySelector('.cm-side'));
    expect(side).toContain('Over the limit of 124 new coupons per student.');
    expect(side).toContain('Aarav Hegde');
    expect(side).toContain('Cap 124 per student');
  });

  it('edits a type and refuses a value while value-bearing types are off (CPN-004/005)', async () => {
    const el = await open();
    (el.querySelector('#cpn-tab-types') as HTMLButtonElement).click();
    await settle();
    const rows = el.querySelectorAll('tbody tr');
    expect(text(rows[0])).toContain('Breakfast · 07:00–11:00');
    expect(text(rows[1])).toContain('Every regular merchant');
    expect(text(rows[2])).toContain('Reimbursement not settled');

    (rows[0] as HTMLElement).click();
    await settle(3);
    let modal = document.querySelector('.modal') as HTMLElement;
    expect((modal.querySelector('#ct-name') as HTMLInputElement).value).toBe('Breakfast');
    set(modal, '#ct-hold', '20');
    await settle();
    button(modal, 'Save type').click();
    await settle(2);
    confirmOk();
    const patch = await request((u) => u === '/api/v1/console/coupon-types/t-b', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v1"');
    expect(patch.request.body).toMatchObject({
      name: 'Breakfast',
      kind: 'MEAL',
      slotId: 'sl-b',
      window: null,
      holdMax: 20,
      redeemMax: 1,
      value: money('0.00'),
      active: true,
    });
    // Without the merchant list the type keeps its merchants.
    expect('merchantIds' in (patch.request.body as object)).toBe(false);
    patch.flush(type({ holdMax: 20, version: 2 }));
    await settle();
    expect(toasts()).toContain('Coupon type saved');
    (await request((u) => u === '/api/v1/console/coupon-types')).flush({ items: types });
    (await request((u) => u === '/api/v1/console/coupon-slots')).flush({ items: slots });
    await settle();

    button(el, 'New coupon type').click();
    await settle(3);
    modal = document.querySelector('.modal') as HTMLElement;
    set(modal, '#ct-name', 'Breakfast');
    await settle();
    button(modal, 'Create type').click();
    await settle();
    expect(text(modal)).toContain('A coupon type with this name already exists.');
    set(modal, '#ct-name', 'Fest snack');
    set(modal, '#ct-value', '50');
    await settle();
    button(modal, 'Create type').click();
    await settle();
    expect(text(modal)).toContain('choose “Own window”');
    (modal.querySelectorAll('.choice')[1] as HTMLElement).click();
    await settle();
    button(modal, 'Create type').click();
    await settle(2);
    confirmOk();
    const post = await request((u) => u === '/api/v1/console/coupon-types', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toMatchObject({
      name: 'Fest snack',
      slotId: null,
      window: { start: '09:00', end: '17:00' },
      value: money('50.00'),
    });
    post.flush({ code: 'CPN.VALUE_TYPES_OFF' }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(text(modal)).toContain('Coupons that carry a money value aren’t available yet.');
  });

  it('changes a slot and sends the whole slot list (CPN-007)', async () => {
    const el = await open();
    (el.querySelector('#cpn-tab-types') as HTMLButtonElement).click();
    await settle();
    (el.querySelector('button[aria-label="Edit the Dinner slot"]') as HTMLButtonElement).click();
    await settle();
    const modal = document.querySelector('.modal') as HTMLElement;
    set(modal, '#sl-to', '18:00');
    await settle();
    button(modal, 'Save slot').click();
    await settle();
    expect(text(modal)).toContain('The end time must be after the start time.');
    set(modal, '#sl-to', '21:30');
    await settle();
    button(modal, 'Save slot').click();
    await settle(2);
    confirmOk();
    const put = await request((u) => u === '/api/v1/console/coupon-slots', 'PUT');
    expect(put.request.body).toEqual({
      slots: [
        { id: 'sl-b', name: 'Breakfast', start: '07:00', end: '11:00' },
        { id: 'sl-d', name: 'Dinner', start: '19:00', end: '21:30' },
      ],
    });
    put.flush({ items: [slots[0], { ...slots[1], end: '21:30' }] });
    await settle();
    expect(toasts()).toContain('Slot updated');
  });

  it('shows the reports and the issuance log (CPN-009, CPN-011)', async () => {
    const el = await open();
    (el.querySelector('#cpn-tab-rep') as HTMLButtonElement).click();
    await settle();
    (await request((u) => u.startsWith('/api/v1/console/coupons/reports?from='))).flush(
      report(`${TODAY.slice(0, 8)}01`, monthEnd(TODAY)),
    );
    (await request((u) => u === '/api/v1/console/coupons/reports')).flush(
      report(addDays(TODAY, -13), TODAY),
    );
    await settle();
    expect(text(el)).toContain('87.0%');
    expect(text(el)).toContain('89%');
    expect(text(el)).toContain('Hostel Mess');

    (el.querySelector('#cpn-tab-log') as HTMLButtonElement).click();
    await settle();
    const row = el.querySelector('tbody tr') as HTMLElement;
    expect(text(row)).toContain('Breakfast');
    expect(text(row)).toContain('30 Sep 2026');
    row.click();
    await settle();
    expect(text(document.querySelector('.drawer'))).toContain(
      "Per-student counts aren't available",
    );
  });

  it("cancels students' future coupons with a reason (CPN-012)", async () => {
    const el = await open();
    (el.querySelector('#cpn-cancel') as HTMLButtonElement).click();
    await settle();
    (await request((u) => u.startsWith('/api/v1/console/members?'))).flush(students);
    await settle();
    const modal = document.querySelector('.modal') as HTMLElement;
    modal.querySelectorAll<HTMLInputElement>('.cm-pk-row input')[1]!.click();
    modal.querySelectorAll<HTMLInputElement>('.cm-clschip input')[0]!.click();
    await settle();
    button(modal, 'Cancel coupons').click();
    await settle();
    expect(text(modal)).toContain('Enter a reason to continue');
    set(modal, '#cc-reason', 'Left the hostel');
    await settle();
    button(modal, 'Cancel coupons').click();
    await settle(2);
    confirmOk();
    const post = await request((u) => u === '/api/v1/console/coupons/cancellations', 'POST');
    expect(post.request.body).toEqual({
      studentIds: ['s-2'],
      from: TOMORROW,
      to: monthEnd(TOMORROW),
      typeIds: ['t-b'],
      reason: 'Left the hostel',
    });
    post.flush({ cancelled: 12 });
    await settle();
    expect(toasts()).toContain('12 coupons cancelled');
  });

  it('is read-only for Management', async () => {
    const el = await open(
      session({
        roles: [{ code: 'MANAGEMENT', name: 'Management', readOnly: true }],
        subTasks: ['home.view', 'task.home', 'task.coupons', 'coupons.view'],
      }),
    );
    expect(el.querySelector('#cpn-new')).toBeNull();
    expect(button(el, 'Issue coupons').disabled).toBe(true);
    expect(el.querySelector('#cpn-cancel')).toBeNull();
    expect(text(el.querySelector('.note'))).toContain('Read-only.');
    (el.querySelector('#cpn-tab-types') as HTMLButtonElement).click();
    await settle();
    expect((el.querySelector('#ct-new') as HTMLButtonElement).disabled).toBe(true);
  });
});
