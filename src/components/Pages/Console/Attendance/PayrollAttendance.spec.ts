import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { visibleNav } from '../../../Utils/navigation';
import { today } from '../Structure/academic-format';
import type { PayrollMonth, PayrollRow } from './attendance.api';
import { monthLabel } from './PayrollAttendance';

const tick = () => new Promise((r) => setTimeout(r, 0));
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

const ACCOUNTS = ['home.view', 'task.home', 'task.attendance', 'attendance.view'];
const session = {
  name: 'LATHA K',
  email: 'latha.k@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'ACCOUNTANT', name: 'Accountant', readOnly: false }],
  subTasks: ACCOUNTS,
  preferredLang: 'en',
};
const thisMonth = today().slice(0, 7);
const lastMonth = (() => {
  const d = new Date(`${thisMonth}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
})();

const row = (id: string, name: string, over: Partial<PayrollRow> = {}): PayrollRow => ({
  member: {
    id,
    name,
    employeeNo: `EMP-${id}`,
    type: 'Teacher',
    teaching: true,
    department: null,
    joinedOn: '2024-06-01',
    leftOn: null,
  },
  workingDays: 26,
  present: 26,
  late: 0,
  halfDay: 0,
  paidLeave: 0,
  absent: 0,
  notMarked: 0,
  leave: { casual: 0, medical: 0, earned: 0 },
  notEmployed: 0,
  lopDays: 0,
  payableDays: 30,
  exceptions: [],
  ...over,
});
const month = (over: Partial<PayrollMonth> = {}): PayrollMonth => ({
  month: lastMonth,
  from: `${lastMonth}-01`,
  to: `${lastMonth}-30`,
  through: `${lastMonth}-30`,
  complete: true,
  days: 30,
  workingDays: 26,
  sundays: 4,
  holidays: [],
  counts: { staff: 3, withLop: 1, notMarked: 2 },
  items: [
    row('1', 'KAVYA RAO', {
      present: 22,
      late: 1,
      halfDay: 1,
      absent: 1,
      paidLeave: 1,
      leave: { casual: 1, medical: 0, earned: 0 },
      lopDays: 1.5,
      payableDays: 28.5,
      exceptions: [
        { date: `${lastMonth}-02`, kind: 'ABSENT', leaveType: null },
        { date: `${lastMonth}-03`, kind: 'LEAVE', leaveType: 'CASUAL' },
        { date: `${lastMonth}-04`, kind: 'HALF_DAY', leaveType: null },
        { date: `${lastMonth}-05`, kind: 'LATE', leaveType: null },
      ],
    }),
    row('2', 'ARJUN BHAT', {
      member: {
        ...row('2', 'ARJUN BHAT').member,
        type: 'Driver',
        teaching: false,
        department: 'Transport',
      },
      present: 24,
      notMarked: 2,
      exceptions: [
        { date: `${lastMonth}-08`, kind: 'NOT_MARKED', leaveType: null },
        { date: `${lastMonth}-09`, kind: 'NOT_MARKED', leaveType: null },
      ],
    }),
    row('3', 'MEERA HEGDE'),
  ],
  ...over,
});

describe('payroll attendance (client 2026-10-22; ATT-032)', () => {
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
  /** The page on this month (still running), then last month picked. */
  async function open() {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/payroll-attendance');
    (await request((u) => u === '/api/v1/console/session')).flush(session);
    await nav;
    await settle();
    (await request((u) => u === `/api/v1/console/attendance/payroll?month=${thisMonth}`)).flush(
      month({ month: thisMonth, complete: false, through: today() }),
    );
    await settle();
    const el = harness.routeNativeElement as HTMLElement;
    expect(words(el.querySelector('#pay-running'))).toContain(
      `${monthLabel(thisMonth)} isn't over yet.`,
    );
    (el.querySelector('#pay-month-b') as HTMLButtonElement).click();
    await settle(1);
    ([...document.querySelectorAll('.dd-menu .dd-opt')] as HTMLButtonElement[])
      .find((b) => words(b).startsWith(monthLabel(lastMonth)))!
      .click();
    (await request((u) => u === `/api/v1/console/attendance/payroll?month=${lastMonth}`)).flush(
      month(),
    );
    await settle();
    return el;
  }
  const pill = async (el: HTMLElement, label: string) => {
    ([...el.querySelectorAll('#pay-filters .pill')] as HTMLButtonElement[])
      .find((b) => words(b) === label)!
      .click();
    await settle(1);
  };
  const names = (el: HTMLElement) =>
    [...el.querySelectorAll('#pay-table tbody tr .cell-t')].map((c) => words(c));

  it('is in the menu of a role that reads attendance, as Accounts does', () => {
    const items = visibleNav('console', ACCOUNTS).flatMap((g) => g.items.map((i) => i.id));
    expect(items).toContain('c.payroll-attendance');
    expect(
      visibleNav('console', ['task.home']).flatMap((g) => g.items.map((i) => i.id)),
    ).not.toContain('c.payroll-attendance');
  });

  it("shows each staff member's month: loss of pay, payable days and the days to check", async () => {
    const el = await open();
    expect(el.querySelector('#pay-running')).toBeNull();
    const kpis = words(el.querySelector('#pay-kpis'));
    expect(kpis).toContain('Staff 3');
    expect(kpis).toContain('With loss of pay 1 1.5 LOP days in all');
    expect(kpis).toContain('Days not marked 2 Check these before payroll');
    // Avatar, name, employee no. and type, then the figures in column order.
    expect(words(el.querySelector('[data-member="1"]'))).toBe(
      'KR Kavya Rao EMP-1 · Teacher 26 22 1 1 1 1 0 1.5 28.5 of 30',
    );
    expect(words(el.querySelector('[data-member="2"]'))).toContain('EMP-2 · Driver · Transport');

    // The days behind Kavya's figures.
    (el.querySelector('[data-member="1"]') as HTMLElement).click();
    await settle();
    const drawer = words(document.querySelector('#pay-drawer'));
    expect(drawer).toContain('28.5 of 30 days payable 1.5 LOP');
    expect(drawer).toContain('Paid leave: 1 day casual.');
    expect(drawer).toContain('Absent · 1 day LOP');
    expect(drawer).toContain('Casual leave · paid');
    expect(drawer).toContain('Half day · ½ day LOP');
    expect(drawer).toContain('Late · not deducted');
  });

  it('filters by teaching and non-teaching staff, and finds by name or employee number', async () => {
    const el = await open();
    await pill(el, 'Non-teaching');
    expect(names(el)).toEqual(['Arjun Bhat']);
    expect(words(el.querySelector('#pay-kpis'))).toContain('Days not marked 2');
    await pill(el, 'Teaching');
    expect(names(el)).toEqual(['Kavya Rao', 'Meera Hegde']);
    await pill(el, 'All staff');
    const q = el.querySelector('#pay-q') as HTMLInputElement;
    q.value = 'emp-3';
    q.dispatchEvent(new Event('input'));
    await settle(1);
    expect(names(el)).toEqual(['Meera Hegde']);
  });

  it('exports the payroll sheet as CSV', async () => {
    const el = await open();
    const u = URL as unknown as {
      createObjectURL?: (b: Blob) => string;
      revokeObjectURL?: (s: string) => void;
    };
    const before = { create: u.createObjectURL, revoke: u.revokeObjectURL };
    let blob: Blob | null = null;
    u.createObjectURL = (b) => {
      blob = b;
      return 'blob:payroll';
    };
    u.revokeObjectURL = () => undefined;
    const save = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      (el.querySelector('#pay-export') as HTMLButtonElement).click();
      expect((save.mock.contexts[0] as HTMLAnchorElement).download).toBe(
        `campusone-payroll-attendance-${lastMonth}.csv`,
      );
      const bytes = await new Promise<Uint8Array>((ok) => {
        const r = new FileReader();
        r.onload = () => ok(new Uint8Array(r.result as ArrayBuffer));
        r.readAsArrayBuffer(blob!);
      });
      // The file opens with a byte-order mark, for spreadsheets.
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const lines = new TextDecoder().decode(bytes.slice(3)).split('\r\n');
      expect(lines[0]).toBe(
        'Employee no.,Name,Type,Department,Joined on,Left on,Days in month,Working days,Present,Late,Half day,Paid leave,Casual leave,Medical leave,Earned leave,Absent,Not marked,LOP days,Payable days',
      );
      expect(lines[1]).toBe(
        'EMP-1,Kavya Rao,Teacher,,2024-06-01,,30,26,22,1,1,1,1,0,0,1,0,1.5,28.5',
      );
      expect(lines).toHaveLength(4);
    } finally {
      save.mockRestore();
      u.createObjectURL = before.create;
      u.revokeObjectURL = before.revoke;
    }
  });
});
