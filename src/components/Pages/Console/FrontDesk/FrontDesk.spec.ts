import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { istBusinessDate } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import type { Visitor, VisitorLog } from './frontdesk.api';
import { visitMinutes } from './frontdesk-format';

const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const toasts = () => text(document.querySelector('.toasts'));
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

const today = istBusinessDate(new Date());
const session = (
  subTasks = ['frontdesk.view', 'frontdesk.edit', 'attendance.view'],
  ro = false,
) => ({
  name: 'DEEPA NAYAK',
  email: 'deepa.nayak@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [
    ro
      ? { code: 'MANAGEMENT', name: 'Management', readOnly: true }
      : { code: 'FRONT_DESK', name: 'Front desk', readOnly: false },
  ],
  subTasks: ['home.view', 'task.home', 'task.frontdesk', ...subTasks],
  preferredLang: 'en',
});
const visitor = (over: Partial<Visitor> & { id: string }): Visitor => ({
  name: 'Raghavendra Kamath',
  mobile: '••••••7123',
  purpose: 'Parent meeting',
  toMeet: 'Ravi Kulkarni',
  checkedInAt: `${today}T05:30:00.000Z`,
  checkedOutAt: null,
  inside: true,
  ...over,
});
const log: VisitorLog = {
  date: today,
  counts: { total: 3, inside: 2 },
  items: [
    visitor({ id: 'v-1' }),
    visitor({
      id: 'v-2',
      name: 'Shobha Hegde',
      purpose: 'Admission enquiry',
      toMeet: 'Front office',
    }),
    visitor({
      id: 'v-3',
      name: 'Mohan Rao',
      purpose: 'Vendor delivery',
      toMeet: 'Lakshmi Bhat',
      checkedOutAt: `${today}T06:10:00.000Z`,
      inside: false,
    }),
  ],
};
const report = (type: string, items: { id: string; name: string; type: string }[]) => ({
  from: today,
  to: today,
  type,
  schoolDays: 1,
  items: items.map((m) => ({
    member: { ...m, admissionNo: type === 'STUDENT' ? `TVPS/${m.id}` : null },
    present: 0,
    late: 0,
    halfDay: 0,
    absent: 0,
    notMarked: 1,
    percentage: 0,
  })),
  nextCursor: null,
});

describe('console front desk (ATT-015…018)', () => {
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
  async function open(s = session()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/frontdesk');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    await settle();
    if (s.subTasks.includes('frontdesk.view')) {
      (await request((u) => u === `/api/v1/console/visitors?date=${today}`)).flush(log);
      await settle();
    }
    return harness.routeNativeElement as HTMLElement;
  }
  const tab = async (el: HTMLElement, label: string) => {
    ([...el.querySelectorAll('.tabs .tab')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith(label))!
      .click();
    await settle();
  };

  // Staff attendance at the front desk (client 2026-10-22; ATT-029…031).
  const staffRoster = {
    date: today,
    today: true,
    counts: { total: 2, present: 1, late: 0, halfDay: 0, absent: 0, notMarked: 1, onCampus: 1 },
    items: [
      {
        member: { id: 'm-2', name: 'Lakshmi Bhat', type: 'Office', teaching: false, hasCard: true },
        status: 'PRESENT',
        checkInAt: `${today}T03:30:00.000Z`,
        checkOutAt: null,
        method: 'NFC',
        remark: null,
        onApprovedLeave: false,
      },
      {
        member: {
          id: 'm-1',
          name: 'Ravi Kulkarni',
          type: 'Teacher',
          teaching: true,
          hasCard: false,
        },
        status: null,
        checkInAt: null,
        checkOutAt: null,
        method: null,
        remark: null,
        onApprovedLeave: false,
      },
    ],
  };

  it('records staff attendance: the day’s staff, the card reader, and a check-in by name (ATT-029/031)', async () => {
    const el = await open(
      session(['frontdesk.view', 'frontdesk.edit', 'attendance.view', 'attendance.mark']),
    );
    await tab(el, 'Staff attendance');
    (await request((u) => u === '/api/v1/console/attendance/staff')).flush(staffRoster);
    await settle();
    expect([...el.querySelectorAll('#sa-kpis .kpi')].map(words)).toEqual([
      'Staff 2',
      'On campus now 1',
      'Late today 0',
      'Not in yet 1',
    ]);
    expect(words(el.querySelector('#ta-card'))).toContain('Staff cards');
    const rows = () => [...el.querySelectorAll('#sa-table tbody tr')];
    expect(words(rows()[0])).toBe(
      `LB Lakshmi Bhat Office ${translate('status.attendance.present')} 9:00 AM — Card Check out`,
    );
    expect(words(rows()[1])).toBe('RK Ravi Kulkarni Teacher · no card Not in yet — — — Check in');
    // Teaching only.
    ([...el.querySelectorAll('#sa .pills .pill')] as HTMLButtonElement[])[1]!.click();
    await settle(1);
    expect(rows()).toHaveLength(1);
    (rows()[0]!.querySelector('button') as HTMLButtonElement).click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(dlg)).toContain('Check Ravi Kulkarni in?');
    const area = dlg.querySelector('#cf-reason') as HTMLTextAreaElement;
    area.value = 'Forgot the card';
    area.dispatchEvent(new Event('input'));
    await settle(1);
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const post = await request((u) => u === '/api/v1/console/attendance/staff/checks', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({ memberId: 'm-1', action: 'IN', remark: 'Forgot the card' });
    post.flush({
      result: 'CHECKED_IN',
      status: 'LATE',
      member: { id: 'm-1', name: 'Ravi Kulkarni' },
      at: `${today}T05:00:00.000Z`,
    });
    await settle();
    expect(toasts()).toContain('Ravi Kulkarni checked in');
    (await request((u) => u === '/api/v1/console/attendance/staff')).flush(staffRoster);
  });

  it('shows staff attendance read-only without attendance.mark', async () => {
    const el = await open();
    await tab(el, 'Staff attendance');
    (await request((u) => u === '/api/v1/console/attendance/staff')).flush(staffRoster);
    await settle();
    expect(el.querySelector('#ta-card')).toBeNull();
    const buttons = [...el.querySelectorAll('#sa-table tbody button')] as HTMLButtonElement[];
    expect(buttons.length).toBe(2);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });

  it('counts a visit in whole minutes', () => {
    expect(visitMinutes('2026-10-04T05:30:00Z', '2026-10-04T06:10:00Z')).toBe(40);
    expect(visitMinutes('2026-10-04T05:30:00Z', '2026-10-04T05:30:10Z')).toBe(1);
  });

  it('lists who is on campus, with the day’s figures and a search', async () => {
    const el = await open();
    expect([...el.querySelectorAll('#vis-kpis .kpi')].map(words)).toEqual([
      'On campus now 2',
      'Checked in today 3',
      'Checked out today 1',
      'Average visit 40 min',
    ]);
    const rows = () => [...el.querySelectorAll('#vis-table tbody tr')];
    expect(rows()).toHaveLength(2);
    expect(words(rows()[0])).toBe(
      'RK Raghavendra Kamath ••••••7123 Parent meeting Ravi Kulkarni 11:00 AM Today — On campus Check out',
    );
    ([...el.querySelectorAll('.pills .pill')] as HTMLButtonElement[])[1]!.click();
    await settle(1);
    expect(words(rows()[0])).toContain('Mohan Rao');
    expect(words(rows()[0])).toContain('11:40 AM 40 min Checked out');
    const q = el.querySelector('#vis-q') as HTMLInputElement;
    q.value = 'zzzz';
    q.dispatchEvent(new Event('input'));
    await settle(1);
    expect(text(el.querySelector('#vis-table .empty'))).toContain('No visitors match');
  });

  it('checks a visitor in after checking the form (ATT-016)', async () => {
    const el = await open();
    (el.querySelector('#vis-new') as HTMLButtonElement).click();
    await settle();
    (await request((u) => u.includes('type=TEACHER'))).flush(
      report('TEACHER', [{ id: 't-1', name: 'RAVI KULKARNI', type: 'Teacher' }]),
    );
    (await request((u) => u.includes('type=STAFF'))).flush(report('STAFF', []));
    await settle();
    (document.querySelector('#vi-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#vi-n-e'))).toBe("Enter the visitor's name");
    expect(text(document.querySelector('#vi-m-e'))).toBe('Enter a mobile number');
    expect(text(document.querySelector('#vi-p-e'))).toBe('Choose a purpose');
    expect(text(document.querySelector('#vi-h-e'))).toBe("Choose who they're meeting");
    const set = (id: string, v: string) => {
      const i = document.querySelector(id) as HTMLInputElement;
      i.value = v;
      i.dispatchEvent(new Event('input'));
    };
    set('#vi-n', 'Anitha Prabhu');
    set('#vi-m', '98865 43210');
    (document.querySelector('#vi-p-b') as HTMLButtonElement).click();
    await settle(1);
    ([...document.querySelectorAll('.dd-opt')] as HTMLButtonElement[])[0]!.click();
    await settle(1);
    (document.querySelector('#vi-h-b') as HTMLButtonElement).click();
    await settle(1);
    ([...document.querySelectorAll('.dd-opt')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith('Ravi Kulkarni'))!
      .click();
    await settle(1);
    (document.querySelector('#vi-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/visitors', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      name: 'Anitha Prabhu',
      mobile: '9886543210',
      purpose: 'Parent meeting',
      toMeet: 'Ravi Kulkarni',
    });
    post.flush(visitor({ id: 'v-4', name: 'Anitha Prabhu' }));
    await settle();
    expect(toasts()).toContain('Visitor checked in');
  });

  it('checks a visitor out after a confirmation (ATT-017)', async () => {
    const el = await open();
    (el.querySelector('#vis-table tbody tr .btn-soft') as HTMLButtonElement).click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(dlg)).toContain('Check out Raghavendra Kamath?');
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const post = await request((u) => u === '/api/v1/console/visitors/v-1/checkout', 'POST');
    post.flush(visitor({ id: 'v-1', checkedOutAt: `${today}T05:45:00.000Z`, inside: false }));
    await settle();
    expect(toasts()).toContain('Visitor checked out');
    expect(toasts()).toContain('Raghavendra Kamath · 15 min');
  });

  it('records a member at a place, and says when the cooling-off applies (ATT-018)', async () => {
    const el = await open();
    await tab(el, 'Location attendance');
    (await request((u) => u === '/api/v1/console/attendance-types')).flush({
      items: [{ id: 't-lib', name: 'Library', cooldownSeconds: 600, checkInsToday: 4, readers: 1 }],
    });
    (await request((u) => u.includes('type=STUDENT'))).flush(
      report('STUDENT', [{ id: 's-1', name: 'KAVYA RAO', type: 'Student' }]),
    );
    (await request((u) => u.includes('type=TEACHER'))).flush(report('TEACHER', []));
    (await request((u) => u.includes('type=STAFF'))).flush(report('STAFF', []));
    await settle();
    expect([...el.querySelectorAll('#loc-kpis .kpi')].map(words)).toEqual([
      'Library 4 1 reader · cooling-off 10 min',
      'Visits today 4',
    ]);
    (el.querySelector('#lc-go') as HTMLButtonElement).click();
    await settle(1);
    expect(text(el.querySelector('#lc-m-e'))).toBe('Choose a member');
    (el.querySelector('#lc-m-b') as HTMLButtonElement).click();
    await settle(1);
    ([...document.querySelectorAll('.dd-opt')] as HTMLButtonElement[])[0]!.click();
    await settle(1);
    (el.querySelector('#lc-go') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/location-attendance', 'POST');
    expect(post.request.body).toEqual({ attendanceTypeId: 't-lib', memberId: 's-1' });
    post.flush(
      { code: 'ATT.LOCATION_WAIT', params: { seconds: 420 } },
      { status: 429, statusText: 'Too Many Requests' },
    );
    await settle();
    expect(words(el.querySelector('.cc-tapres.bad'))).toBe(
      `Already recorded — cooling-off ${translate('ATT.LOCATION_WAIT', { seconds: 420 })} The cooling-off at Library is 10 min.`,
    );
  });

  it('is read-only for Management', async () => {
    const el = await open(session(['frontdesk.view'], true));
    expect(text(el.querySelector('.note.tone-info'))).toContain('Read-only.');
    expect((el.querySelector('#vis-new') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('#vis-table tbody tr .btn-soft')).toBeNull();
  });

  it('is refused without the front-desk task', async () => {
    const el = await open(session([]));
    expect(text(el.querySelector('.empty'))).toContain("You don't have access to this page");
  });
});
