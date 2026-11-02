import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { istBusinessDate } from '../../../Utils/format';
import { addDays } from '../Coupons/coupon-format';
import { isLive, longDay, passState } from './pass-format';

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
  subTasks: ['home.view', 'task.home', 'task.passes', 'passes.view', 'passes.edit'],
  preferredLang: 'en',
  ...over,
});

const pass = (over: object = {}) => ({
  id: 'p0a1b2c3-0000-4000-8000-000000000001',
  type: { code: 'FEST-ENTRY', label: 'Fest entry' },
  purpose: 'Inter-school fest — performer',
  description: 'Auditorium and the green room',
  holder: { id: 's-1', name: 'Aarav Hegde', admissionNo: 'TVPS/2019/0412' },
  validOn: TODAY,
  maxScans: 3,
  usedScans: 1,
  transferAllowed: false,
  comments: 'Bring the school ID card',
  status: 'ACTIVE',
  visibility: 'VALID_TODAY',
  authorisedUntil: null,
  cancelReason: null,
  createdAt: '2026-09-25T04:30:00.000Z',
  version: 2,
  ...over,
});
const list = {
  items: [
    pass(),
    pass({
      id: 'p0a1b2c3-0000-4000-8000-000000000002',
      type: { code: 'COLLEGE-ENTRY', label: 'College entry' },
      purpose: 'Guest lecture',
      holder: { id: 'v-1', name: 'Ravi Kulkarni', admissionNo: null },
      validOn: TOMORROW,
      usedScans: 0,
      transferAllowed: true,
      visibility: 'VALID_IN_FUTURE',
    }),
    pass({
      id: 'p0a1b2c3-0000-4000-8000-000000000003',
      purpose: 'Sports day',
      validOn: addDays(TODAY, -3),
      usedScans: 2,
      maxScans: 2,
      status: 'USED',
      visibility: 'USED',
    }),
    pass({
      id: 'p0a1b2c3-0000-4000-8000-000000000004',
      purpose: 'Rehearsal',
      validOn: TODAY,
      usedScans: 0,
      status: 'AUTHORIZED',
      authorisedUntil: new Date(Date.now() + 3 * 60_000).toISOString(),
    }),
  ],
  counts: { total: 4, active: 3, used: 1, expired: 0, cancelled: 0 },
  types: [
    { code: 'FEST-ENTRY', label: 'Fest entry' },
    { code: 'COLLEGE-ENTRY', label: 'College entry' },
  ],
};
const member = (id: string, name: string, category: string, typeName: string) => ({
  id,
  memberNo: 'TVPS-00001',
  name,
  kind: category === 'STUDENT' ? 'STUDENTS' : 'STAFF',
  userType: { id: `ut-${category}`, name: typeName, category },
  department: null,
  admissionNo: category === 'STUDENT' ? `ADM/${id}` : null,
  employeeNo: null,
  grade: category === 'STUDENT' ? { class: 'Grade 7', section: 'B' } : null,
  mobile: null,
});
const page = (items: object[]) => ({
  year: null,
  columns: [],
  filters: [],
  counts: { tabs: {}, statuses: {} },
  items,
  nextCursor: null,
});

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find((b) => text(b) === label) as HTMLButtonElement;
const toasts = () => text(document.querySelector('.toasts'));
const set = (root: ParentNode, sel: string, v: string) => {
  const i = root.querySelector(sel) as HTMLInputElement;
  i.value = v;
  i.dispatchEvent(new Event('input'));
};

describe('console entry passes (PAY-026…028)', () => {
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
    const nav = harness.navigateByUrl('/console/passes');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    (await request((u) => u === '/api/v1/console/passes')).flush(list);
    await settle(5);
    return harness.routeNativeElement as HTMLElement;
  }

  it('tells where a pass stands today', () => {
    const now = Date.parse('2026-10-04T06:00:00Z');
    const p = { visibility: 'VALID_TODAY' as const, status: 'AUTHORIZED' as const };
    expect(passState({ ...p, authorisedUntil: '2026-10-04T06:03:00Z' }, now)).toBe('Authorised');
    expect(passState({ ...p, authorisedUntil: '2026-10-04T05:58:00Z' }, now)).toBe('Valid today');
    expect(
      passState({ visibility: 'VALID_IN_FUTURE', status: 'ACTIVE', authorisedUntil: null }, now),
    ).toBe('Valid in future');
    expect(passState({ visibility: 'CANCELLED', status: 'CANCELLED', authorisedUntil: null })).toBe(
      'Cancelled',
    );
    expect(isLive({ status: 'AUTHORIZED' })).toBe(true);
    expect(isLive({ status: 'USED' })).toBe(false);
    expect(longDay('2026-10-03')).toBe('Saturday, 3 October 2026');
  });

  it("lists the passes with today's figures and filters them", async () => {
    const el = await open();
    expect(text(el.querySelector('h1'))).toContain('Entry passes');
    const kpis = el.querySelectorAll('.kpi .k-v');
    expect(text(kpis[0])).toBe('2'); // valid today (one of them authorised)
    expect(text(kpis[1])).toBe('1'); // authorised now
    expect(text(kpis[2])).toBe('1'); // today's scans
    expect(text(kpis[3])).toBe('1'); // upcoming
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(4);
    expect(text(el.querySelector('tbody'))).toContain('Authorised');
    expect(text(el.querySelector('tbody'))).toContain('Valid in future');
    expect(text(el.querySelector('tbody'))).toContain('1 / 3');

    button(el, 'Valid today').click();
    await settle();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    button(el, 'All').click();
    set(el, '#ps-q', 'lecture');
    await settle();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(text(el.querySelector('tbody tr'))).toContain('Ravi Kulkarni');
    expect(text(el.querySelector('tbody tr'))).toContain('Allowed');
  });

  it('opens a pass and cancels it with a reason (PAY-028)', async () => {
    const el = await open();
    const row = [...el.querySelectorAll('tbody tr')].find((r) =>
      text(r).includes('Inter-school fest'),
    ) as HTMLElement;
    row.click();
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer)).toContain('Aarav Hegde · TVPS/2019/0412');
    expect(text(drawer)).toContain('1 of 3');
    expect(text(drawer)).toContain('Bring the school ID card');
    expect(text(drawer)).toContain('Shown only on the registered device');
    button(drawer, 'Cancel pass').click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    const t = dlg.querySelector('textarea') as HTMLTextAreaElement;
    t.value = 'Event moved';
    t.dispatchEvent(new Event('input'));
    await settle(1);
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const post = await request(
      (u) => u === '/api/v1/console/passes/p0a1b2c3-0000-4000-8000-000000000001/cancellation',
      'POST',
    );
    expect(post.request.body).toEqual({ reason: 'Event moved' });
    post.flush(
      pass({
        status: 'CANCELLED',
        visibility: 'CANCELLED',
        cancelReason: 'Event moved',
        version: 3,
      }),
    );
    await settle();
    expect(toasts()).toContain('Pass cancelled');
    expect(text(document.querySelector('.drawer'))).toContain('Cancelled because');
    expect(button(document.querySelector('.drawer') as HTMLElement, 'Cancel pass')).toBeUndefined();
    (await request((u) => u === '/api/v1/console/passes')).flush(list);
  });

  it('creates a pass for a student or visitor, and shows a refusal by the holder (PAY-027)', async () => {
    const el = await open();
    button(el, 'Create entry pass').click();
    await settle(3);
    const modal = document.querySelector('.modal') as HTMLElement;
    button(modal, 'Create pass').click();
    await settle();
    expect(text(modal)).toContain('Choose the holder');
    expect(text(modal)).toContain('Enter the purpose');
    expect(text(modal)).toContain('Enter a description');

    (modal.querySelector('#pn-holder-b') as HTMLButtonElement).click();
    await settle();
    (await request((u) => u.startsWith('/api/v1/console/members?kind=STUDENTS'))).flush(
      page([member('s-1', 'Aarav Hegde', 'STUDENT', 'Student')]),
    );
    (await request((u) => u.startsWith('/api/v1/console/members?kind=STAFF'))).flush(
      page([
        member('v-1', 'Ravi Kulkarni', 'OTHER', 'Visitor'),
        member('t-1', 'Asha Rao', 'TEACHER', 'Teacher'),
      ]),
    );
    await settle();
    const opts = document.querySelectorAll('.dd-menu .dd-opt');
    // Teachers aren't offered: passes go to students and visitors.
    expect(opts).toHaveLength(2);
    expect(text(opts[1])).toContain('Visitor');
    (opts[1] as HTMLButtonElement).click();
    await settle();
    set(modal, '#pn-purpose', 'Guest lecture — visiting scientist');
    set(modal, '#pn-desc', 'Seminar hall, main block');
    set(modal, '#pn-max', '2');
    (modal.querySelector('#pn-tr') as HTMLButtonElement).click();
    await settle();
    button(modal, 'Create pass').click();
    await settle(2);
    (
      [
        ...document.querySelectorAll('.modal[role="alertdialog"] .sh-f button'),
      ] as HTMLButtonElement[]
    )
      .at(-1)!
      .click();
    const post = await request((u) => u === '/api/v1/console/passes', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      type: 'FEST-ENTRY',
      purpose: 'Guest lecture — visiting scientist',
      description: 'Seminar hall, main block',
      holderIds: ['v-1'],
      validOn: TOMORROW,
      maxScans: 2,
      transferAllowed: true,
      comments: null,
    });
    post.flush(
      { issued: [], refused: [{ holderId: 'v-1', code: 'PAY.PASS_NO_DEVICE' }] },
      { status: 201, statusText: 'Created' },
    );
    await settle();
    expect(text(modal.querySelector('#pn-holder-e'))).toContain('registered');

    button(modal, 'Create pass').click();
    await settle(2);
    (
      [
        ...document.querySelectorAll('.modal[role="alertdialog"] .sh-f button'),
      ] as HTMLButtonElement[]
    )
      .at(-1)!
      .click();
    const again = await request((u) => u === '/api/v1/console/passes', 'POST');
    expect(again.request.headers.get('Idempotency-Key')).not.toBe(
      post.request.headers.get('Idempotency-Key'),
    );
    again.flush(
      {
        issued: [{ holderId: 'v-1', passId: 'p0a1b2c3-0000-4000-8000-000000000009' }],
        refused: [],
      },
      { status: 201, statusText: 'Created' },
    );
    await settle();
    expect(toasts()).toContain('Entry pass created');
    (await request((u) => u === '/api/v1/console/passes')).flush(list);
  });

  it('is read-only for Management', async () => {
    const el = await open(
      session({
        roles: [{ code: 'MANAGEMENT', name: 'Management', readOnly: true }],
        subTasks: ['home.view', 'task.home', 'task.passes', 'passes.view'],
      }),
    );
    expect(el.querySelector('#ps-new')).toBeNull();
    expect(button(el, 'Create entry pass').disabled).toBe(true);
    (el.querySelectorAll('tbody tr')[0] as HTMLElement).click();
    await settle();
    expect(button(document.querySelector('.drawer') as HTMLElement, 'Cancel pass')).toBeUndefined();
  });
});
