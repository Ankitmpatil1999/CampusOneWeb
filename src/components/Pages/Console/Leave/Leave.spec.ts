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
import type { LeaveDetail, LeaveList, StaffLeave } from './leave.api';
import { tabOf, timeline } from './leave-format';

const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const toasts = () => text(document.querySelector('.toasts'));
/** The text of every text node, spaced (cells, chips and sub-lines read apart). */
function words(el: Element | null | undefined) {
  if (!el) return '';
  const out: string[] = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) out.push(w.currentNode.textContent ?? '');
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
    const found = ctl.match((r) => match(r.urlWithParams) && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
}

function serve(routes: Readonly<Record<string, unknown>>) {
  const ctl = TestBed.inject(HttpTestingController);
  const hit = (r: { method: string; urlWithParams: string }) =>
    r.method === 'GET' && r.urlWithParams in routes;
  for (const r of ctl.match(hit) as TestRequest[])
    r.flush(routes[r.request.urlWithParams] as object);
}

const session = (
  subTasks: string[] = ['leave.view', 'leave.decide', 'academics.view', 'members.view'],
  readOnly = false,
) => ({
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [
    readOnly
      ? { code: 'MANAGEMENT', name: 'Management', readOnly: true }
      : { code: 'INSTITUTION_ADMIN', name: 'Institution Administrator', readOnly: false },
  ],
  subTasks: ['home.view', 'task.home', 'task.leave', ...subTasks],
  preferredLang: 'en',
});
const year = {
  id: 'y-26',
  label: '2026-27',
  startsOn: '2026-04-01',
  endsOn: '2027-03-31',
  closed: false,
  current: true,
};
const leave = (over: Partial<StaffLeave> & { id: string }): StaffLeave => ({
  reference: 'TL-000002',
  staff: { id: 't-lak', name: 'LAKSHMI BHAT', type: 'Teacher' },
  type: 'MEDICAL',
  typeLabel: 'Medical leave',
  from: '2026-10-05',
  to: '2026-10-07',
  dates: '05 Oct 2026 – 07 Oct 2026',
  days: 3,
  reason: 'Minor surgery — doctor advised three days of rest',
  appliedAt: '2026-10-04T07:01:00.000Z',
  needsCoordinator: true,
  coordinator: null,
  final: null,
  state: 'PENDING',
  version: 1,
  ...over,
});
const l1 = leave({ id: 'l-1' });
const l2 = leave({
  id: 'l-2',
  reference: 'TL-000001',
  staff: { id: 't-ravi', name: 'RAVI KULKARNI', type: 'Teacher' },
  type: 'CASUAL',
  typeLabel: 'Casual leave',
  from: '2026-10-12',
  to: '2026-10-13',
  days: 2,
  reason: 'Cousin’s wedding in Hubballi',
  coordinator: {
    status: 'APPROVED',
    by: 'PRAKASH SHETTY',
    at: '2026-10-04T08:00:00.000Z',
    remarks: 'Substitution arranged',
  },
  state: 'WITH_PRINCIPAL',
  version: 2,
});
const l3 = leave({
  id: 'l-3',
  reference: 'TL-000006',
  staff: { id: 't-har', name: 'HARISH ACHARYA', type: 'Teacher' },
  type: 'CASUAL',
  typeLabel: 'Casual leave',
  from: '2026-10-15',
  to: '2026-10-15',
  days: 1,
  reason: 'House-warming function',
  coordinator: {
    status: 'REJECTED',
    by: 'PRAKASH SHETTY',
    at: '2026-10-04T08:10:00.000Z',
    remarks: 'Half-yearly paper that day',
  },
  state: 'REJECTED_BY_COORDINATOR',
  version: 2,
});
const l4 = leave({
  id: 'l-4',
  reference: 'TL-000005',
  staff: { id: 't-shr', name: 'SHREYA NAYAK', type: 'Teacher' },
  type: 'EARNED',
  typeLabel: 'Earned leave',
  from: '2026-10-06',
  to: '2026-10-06',
  days: 1,
  reason: 'Family travel',
  coordinator: { status: 'APPROVED', by: 'PRAKASH SHETTY', at: null, remarks: null },
  final: { status: 'APPROVED', by: 'SUNITA RAO', at: '2026-10-04T09:00:00.000Z', remarks: null },
  state: 'APPROVED',
  version: 3,
});
const l5 = leave({
  id: 'l-5',
  reference: 'TL-000007',
  staff: { id: 't-rek', name: 'REKHA JOSHI', type: 'Teacher' },
  final: { status: 'CANCELLED', by: null, at: '2026-10-04T07:30:00.000Z', remarks: null },
  state: 'CANCELLED',
  version: 2,
});
const list: LeaveList = {
  year,
  scoped: false,
  counts: { pending: 1, withPrincipal: 1, awayThisWeek: 1, daysRequested: 9 },
  items: [l1, l2, l3, l4, l5],
};
const member = (id: string, name: string, emp: string | null, dept: string) => ({
  id,
  memberNo: id,
  name,
  kind: 'STAFF',
  userType: { id: 'ut-t', name: 'Teacher', category: 'TEACHER' },
  department: { id: `d-${dept}`, name: dept },
  admissionNo: null,
  employeeNo: emp,
  grade: null,
  mobile: null,
  linked: true,
  status: 'ACTIVE',
  wallet: null,
  pending: { suspension: false, delink: false },
  customFields: {},
});
const staff = {
  year: null,
  columns: [],
  filters: [],
  counts: { tabs: {}, statuses: {} },
  items: [
    member('t-lak', 'LAKSHMI BHAT', 'TVPS-T-0120', 'Middle school'),
    member('t-ravi', 'RAVI KULKARNI', null, 'Middle school'),
  ],
  nextCursor: null,
};
const sci = { id: 'sub-sci', code: 'SCI', name: 'Science' };
const assignments = {
  year,
  classTeachers: [],
  subjectTeachers: [
    {
      id: 'a-1',
      kind: 'SUBJECT_TEACHER',
      teacher: { id: 't-lak', name: 'LAKSHMI BHAT', combined: true },
      class: { id: 'c-7', name: 'Grade 7' },
      section: { id: 's-7a', name: 'A' },
      subject: sci,
      periodsAWeek: 6,
      since: null,
    },
  ],
  coordinators: [],
  combinedTeachers: 1,
};
const detail = (over: Partial<LeaveDetail> = {}): LeaveDetail => ({
  ...l1,
  balance: { type: 'MEDICAL', label: 'Medical leave', total: 10, used: 0, pending: 3, left: 10 },
  periodsAffected: 3,
  ...over,
});
const colour = '#1F7A4D';
const week = {
  year,
  clashes: [],
  teacherWeek: [
    {
      day: 1,
      periodId: 'p-2',
      section: { id: 's-7b', label: 'Grade 7 B' },
      subject: { name: 'Science', colour },
    },
    {
      day: 1,
      periodId: 'p-1',
      section: { id: 's-7a', label: 'Grade 7 A' },
      subject: { name: 'Science', colour },
    },
    {
      day: 3,
      periodId: 'p-1',
      section: { id: 's-7a', label: 'Grade 7 A' },
      subject: { name: 'Science', colour },
    },
  ],
};
const periods = {
  items: [
    {
      id: 'p-1',
      name: 'Period 1',
      startsAt: '08:45',
      endsAt: '09:25',
      isBreak: false,
      minutes: 40,
      timetableSlots: 2,
    },
    {
      id: 'p-2',
      name: 'Period 2',
      startsAt: '09:25',
      endsAt: '10:05',
      isBreak: false,
      minutes: 40,
      timetableSlots: 1,
    },
  ],
  summary: { teachingPeriods: 2, teachingMinutes: 80, breakMinutes: 0 },
  version: 3,
};

describe('console teacher leave (ACA-042, ACA-043, ACA-076)', () => {
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
    const nav = harness.navigateByUrl('/console/leave');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    await settle();
    serve({
      '/api/v1/console/teacher-leaves?status=all': list,
      '/api/v1/console/members?kind=STAFF&limit=200': staff,
    });
    await settle();
    serve({ '/api/v1/console/teacher-assignments': assignments });
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  const drawer = () => document.querySelector('.drawer') as HTMLElement;
  const rows = (el: HTMLElement) => [...el.querySelectorAll('#lv-table tbody tr')];
  const tab = async (el: HTMLElement, label: string) => {
    ([...el.querySelectorAll('.tabs .tab')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith(label))!
      .click();
    await settle();
  };
  const openLeave = async (el: HTMLElement, row = 0) => {
    (rows(el)[row] as HTMLElement).click();
    await settle();
    serve({
      '/api/v1/console/teacher-leaves/l-1': detail(),
      '/api/v1/console/timetables/clashes?teacherId=t-lak': week,
      '/api/v1/console/periods': periods,
    });
    await settle();
    return drawer();
  };

  it('reads each request’s tab and progress', () => {
    expect([l1, l2, l3, l4, l5].map((l) => tabOf(l.state))).toEqual([
      'PENDING',
      'REVIEWED',
      'REJECTED',
      'APPROVED',
      'CANCELLED',
    ]);
    expect(timeline(l2).map((t) => `${t.title}|${t.state}`)).toEqual([
      'Applied|done',
      'Coordinator: Recommended|done',
      "Principal's decision|now",
    ]);
    expect(timeline(l3).map((t) => t.title)).toEqual([
      'Applied',
      'Rejected by the coordinator',
      "Principal's decision",
    ]);
    expect(timeline(l5)[2]?.title).toBe('Cancelled');
  });

  it('shows what waits for the coordinator, by status, with a search', async () => {
    const el = await open();
    expect([...el.querySelectorAll('#lv-kpis .kpi')].map(words)).toEqual([
      expect.stringMatching(/^Waiting for you 1 Oldest /),
      'With the principal 1',
      'Teachers away this week 1',
      'Days requested this year 9 2026-27',
    ]);
    expect([...el.querySelectorAll('.tabs .tab')].map(words)).toEqual([
      'Pending 1',
      'Coordinator reviewed 1',
      'Approved 1',
      'Rejected 1',
      'Cancelled 1',
      'All 5',
    ]);
    expect(rows(el)).toHaveLength(1);
    expect(words(rows(el)[0])).toMatch(
      /^TL-000002 LB Lakshmi Bhat TVPS-T-0120 · Science Medical leave 5 Oct – 07 Oct 2026 3 days Minor surgery — doctor advised three days of rest .+ Pending$/,
    );
    await tab(el, 'All');
    expect(rows(el)).toHaveLength(5);
    expect(words(el.querySelector('#lv-table'))).toContain(
      'Coordinator reviewed Coordinator: Recommended',
    );
    expect(words(el.querySelector('#lv-table'))).toContain('Rejected Rejected by the coordinator');
    const q = el.querySelector('#lv-q') as HTMLInputElement;
    q.value = 'wedding';
    q.dispatchEvent(new Event('input'));
    await settle(1);
    expect(rows(el)).toHaveLength(1);
    expect(text(el.querySelector('.fsum'))).toBe('1 request');
    await tab(el, 'Pending');
    expect(text(el.querySelector('#lv-table .empty'))).toContain('No requests here');
  });

  it('opens a request with its balance, the classes affected and who else is away', async () => {
    const el = await open();
    const d = await openLeave(el);
    expect(text(d.querySelector('.sh-t'))).toBe(
      'TL-000002 · Lakshmi BhatMedical leave · 5 Oct – 07 Oct 2026',
    );
    expect(words(d.querySelector('.row.g12'))).toBe(
      'LB Lakshmi Bhat Middle school · TVPS-T-0120 · Science Pending',
    );
    expect(words(d.querySelector('#lv-bal'))).toBe(
      'Medical leave 10 of 10 days left After this request 7 days',
    );
    expect(words(d.querySelector('#lv-affected'))).toBe(
      'Monday, 5 October 2026 · 2 periods P1 Grade 7 A · P2 Grade 7 B Wednesday, 7 October 2026 · 1 period P1 Grade 7 A 3 periods need a substitute.',
    );
    expect(text(d.querySelector('.note.tone-info'))).toBe(
      'Also away on these dates: Shreya Nayak (approved).',
    );
    expect(words(d.querySelector('#lv-progress'))).toContain('Coordinator review Waiting for you');
  });

  it('rejects only with feedback and recommends after a confirmation (ACA-043)', async () => {
    const el = await open();
    const d = await openLeave(el);
    (d.querySelector('#lv-reject') as HTMLButtonElement).click();
    await settle();
    expect(text(d.querySelector('#lv-fb-e'))).toBe(
      translate('ACA.DECISION_REMARKS', { min: 5, max: 400 }),
    );
    expect(document.querySelector('.modal[role="alertdialog"]')).toBeNull();
    const fb = d.querySelector('#lv-fb') as HTMLTextAreaElement;
    fb.value = 'Substitution arranged with Ashok Murthy';
    fb.dispatchEvent(new Event('input'));
    await settle(1);
    (d.querySelector('#lv-recommend') as HTMLButtonElement).click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(dlg)).toContain(
      "Recommend this leave? Lakshmi Bhat's medical leave goes to the principal marked recommended.",
    );
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const post = await request(
      (u) => u === '/api/v1/console/teacher-leaves/l-1/coordinator-decision',
      'POST',
    );
    expect(post.request.headers.get('If-Match')).toBe('"v1"');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      decision: 'APPROVED',
      remarks: 'Substitution arranged with Ashok Murthy',
    });
    post.flush(
      detail({
        state: 'WITH_PRINCIPAL',
        coordinator: {
          status: 'APPROVED',
          by: 'PRAKASH SHETTY',
          at: '2026-10-04T10:00:00.000Z',
          remarks: 'Substitution arranged with Ashok Murthy',
        },
        version: 2,
      }),
    );
    await settle();
    expect(toasts()).toContain('Leave recommended');
    expect(toasts()).toContain('TL-000002 · sent to the principal');
    expect(text(drawer().querySelector('.row.g12 .chip'))).toBe('Coordinator reviewed');
    expect(drawer().querySelector('#lv-recommend')).toBeNull();
    await request((u) => u === '/api/v1/console/teacher-leaves?status=all');
  });

  it('shows a request that changed meanwhile as it is now (412)', async () => {
    const el = await open();
    const d = await openLeave(el);
    const fb = d.querySelector('#lv-fb') as HTMLTextAreaElement;
    fb.value = 'Exam duty that week';
    fb.dispatchEvent(new Event('input'));
    await settle(1);
    (d.querySelector('#lv-reject') as HTMLButtonElement).click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(dlg)).toContain('Reject this leave?');
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const post = await request(
      (u) => u === '/api/v1/console/teacher-leaves/l-1/coordinator-decision',
      'POST',
    );
    expect(post.request.body).toEqual({ decision: 'REJECTED', remarks: 'Exam duty that week' });
    post.flush(
      { code: 'GEN.CONFLICT_VERSION' },
      { status: 412, statusText: 'Precondition Failed' },
    );
    await settle();
    expect(text(d.querySelector('.note.tone-bad'))).toBe(translate('GEN.CONFLICT_VERSION'));
    await request((u) => u === '/api/v1/console/teacher-leaves/l-1');
  });

  it('is read-only for Management', async () => {
    const el = await open(session(['leave.view'], true));
    expect(text(el.querySelector('.note.tone-info'))).toContain('Read-only.');
    const d = await openLeave(el);
    expect((d.querySelector('#lv-recommend') as HTMLButtonElement).disabled).toBe(true);
    expect(d.querySelector('#lv-fb')).toBeNull();
  });

  it('is refused without the leave task', async () => {
    const el = await open(session([]));
    expect(text(el.querySelector('.empty'))).toContain("You don't have access to this page");
    expect(el.querySelector('#lv-table')).toBeNull();
  });
});
