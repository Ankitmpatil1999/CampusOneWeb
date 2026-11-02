import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import type { Announcement, AnnouncementList } from '../Announcements/announcements.api';
import type {
  Overview,
  StaffLeave,
  StaffLeaves,
  StudentDetail,
  TeacherDetail,
} from './principal.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
/** The visible words, with a space between elements. */
function text(el: Node | null | undefined): string {
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) parts.push(n.textContent ?? '');
    else n.childNodes.forEach(walk);
    if (n.nodeType === Node.ELEMENT_NODE) parts.push(' ');
  };
  if (el) walk(el);
  return parts.join('').replace(/\s+/g, ' ').trim();
}
const toasts = () => text(document.querySelector('.toasts'));

async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 80; i++) {
    const found = ctl.match((r) => match(r.urlWithParams) && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
}
function serve(routes: Readonly<Record<string, unknown>>) {
  const ctl = TestBed.inject(HttpTestingController);
  const hit = (r: { method: string; url: string }) => r.method === 'GET' && r.url in routes;
  for (const r of ctl.match(hit) as TestRequest[]) r.flush(routes[r.request.url] as object);
}

const session = {
  name: 'KAVITHA SHENOY',
  email: 'kavitha@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'PRINCIPAL', name: 'Principal', readOnly: false }],
  subTasks: ['task.principal', 'principal.view', 'principal.leave', 'principal.announce'],
  preferredLang: 'en',
};

const day = (total: number, attended: number, absent: number) => ({
  total,
  attended,
  absent,
  notMarked: total - attended - absent,
  percentage: total ? Math.round((attended * 1000) / total) / 10 : null,
});
const overview: Overview = {
  year: { id: 'y-1', label: '2026-27' },
  date: '2026-10-13',
  principal: { name: 'Kavitha Shenoy' },
  people: { students: 640, teachers: 32, staff: 14 },
  attendanceToday: {
    students: day(640, 600, 20),
    // Each count of the day (client 2026-10-25).
    teachers: { ...day(32, 30, 1), present: 27, late: 2, halfDay: 1 },
    staff: day(14, 0, 0),
  },
  staffOnLeaveToday: 2,
  approvals: { teacherLeaveAwaitingYou: 3, teacherLeaveWithCoordinator: 1, studentLeavePending: 5 },
  academics: { sections: 18, topPerformers: 4, needsSupport: 2, upcomingExams: 6 },
};

const leave = (over: Partial<StaffLeave> = {}): StaffLeave => ({
  id: 'l-1',
  reference: 'TL-000012',
  type: 'CASUAL',
  typeLabel: 'Casual leave',
  from: '2026-10-20',
  to: '2026-10-21',
  days: 2,
  reason: 'Family function in Mysuru',
  appliedAt: '2026-10-10T05:00:00.000Z',
  needsCoordinator: true,
  coordinator: {
    status: 'APPROVED',
    by: 'ANIL KUMAR',
    at: '2026-10-11T05:00:00.000Z',
    remarks: null,
  },
  final: null,
  state: 'WITH_PRINCIPAL',
  version: 2,
  staff: { id: 's-1', name: 'MEENA RAO', type: 'Teacher' },
  balance: { total: 12, left: 9 },
  alsoAway: ['RAVI NAIK'],
  ...over,
});
const leaves = (items: StaffLeave[]): StaffLeaves => ({
  year: { id: 'y-1', label: '2026-27' },
  counts: { awaiting: items.length, coordinator: 1, decided: 4 },
  items,
});

const ann: Announcement = {
  id: 'an-1',
  code: 'ANN-2026-0008',
  title: 'Half-yearly examination timetable',
  text: 'The half-yearly examinations begin on Monday 12 October.',
  category: { code: 'ACA', label: 'Academics', colour: '#5E4BB0' },
  important: true,
  ackRequired: true,
  channels: ['IN_APP'],
  targets: { groups: ['STUDENTS', 'PARENTS'] },
  source: 'CONSOLE',
  classSection: null,
  author: 'SUNITA RAO',
  sendAt: new Date().toISOString(),
  scheduled: false,
  dispatch: {
    status: 'COMPLETED',
    recipients: 3,
    success: 3,
    skipped: 0,
    failed: 0,
    at: new Date().toISOString(),
    reason: null,
  },
  acknowledgements: { acknowledged: 1, of: 2 },
  withdrawn: null,
  createdAt: new Date().toISOString(),
  version: 2,
};
const list: AnnouncementList = {
  categories: [ann.category],
  channels: ['IN_APP', 'SMS'],
  items: [ann],
  nextCursor: null,
};

const money = (amount: string) => ({ amount, currency: 'INR' });
/** ACA-082: a student in full (client 2026-10-14). */
const studentDetail: StudentDetail = {
  year: { id: 'y-1', label: '2026-27' },
  student: {
    id: 'st-1',
    memberNo: 'TVPS-00012',
    name: 'DIYA RAO',
    gender: 'FEMALE',
    dateOfBirth: '2015-06-01',
    admissionNo: 'ADM/2026/014',
    joinedOn: '2026-06-01',
    department: null,
    status: 'ACTIVE',
    statusReason: null,
    class: 'Grade 6',
    section: 'A',
    enrolledOn: '2026-06-01',
    classTeacher: 'MEENA RAO',
    mobile: null,
    email: null,
    campusOneAccount: false,
    bloodGroup: 'B+',
    category: 'GENERAL',
    medium: 'English',
    allergies: null,
    health: null,
    aadhaar: 'XXXX XXXX 2346',
    pan: null,
    customFields: [{ label: 'House', value: 'Blue' }],
  },
  family: {
    guardians: [
      {
        name: 'SURESH RAO',
        relation: 'FATHER',
        mobile: '9845012345',
        email: 'suresh@example.in',
        primary: true,
        status: 'ACTIVE',
      },
    ],
    father: { name: 'Suresh Rao', mobile: '9845012345', email: null, occupation: 'Engineer' },
    mother: { name: 'Latha Rao', mobile: '9845012346', email: null, occupation: null },
    guardian: null,
    children: 'MORE',
  },
  addresses: {
    residential: {
      line1: 'No. 12, 4th Cross',
      line2: 'Vinoba Nagar',
      city: 'Shivamogga',
      state: 'Karnataka',
      pin: '577205',
    },
    correspondence: null,
    sameAsResidential: true,
  },
  previousSchool: { school: 'Little Flower', lastClass: 'Grade 5', result: 'Pass', board: 'STATE' },
  admission: {
    applicationNo: 'SV/2026/000004',
    admittedOn: '2026-05-20',
    midTerm: false,
    joiningDate: '2026-06-01',
    fees: [
      {
        feeType: 'APPLICATION',
        amount: money('500.00'),
        status: 'CONFIRMED',
        receiptNo: 'SV/R/2026/000001',
        paidAt: null,
      },
    ],
  },
  transport: {
    choice: { opted: true, stop: 'Gopala Circle' },
    allocation: {
      route: { code: 'R-07', name: 'Gopala – School', type: 'BOTH' },
      stop: { name: 'Gopala Circle', landmark: 'Near the bus shelter' },
      pickUp: '07:40',
      drop: '16:10',
      from: '2026-06-01',
      to: '2027-03-31',
    },
    trips: [
      {
        session: 'Morning',
        direction: 'TO_SCHOOL',
        startTime: '07:15',
        vehicle: { name: 'Bus 4', registration: 'KA-14-B-2201' },
        driver: { name: 'RAMESH', mobile: '9845099999' },
        attendant: null,
      },
    ],
  },
  hostel: { opted: false, localGuardian: null },
  fees: {
    structure: 'Grade 6 fees 2026-27',
    summary: {
      annual: money('250.00'),
      paid: money('100.00'),
      outstanding: money('150.00'),
      paidPercent: 40,
      overdue: 1,
    },
    next: null,
    heads: [{ name: 'Tuition', amount: money('250.00') }],
    records: [
      {
        label: 'Term 1',
        dueDate: '2026-06-10',
        amount: money('100.00'),
        fine: money('0.00'),
        paid: money('100.00'),
        amountDue: money('0.00'),
        status: 'PAID',
        financed: false,
        paidAt: null,
        receipt: 'RCPT-0001',
      },
      {
        label: 'Term 2',
        dueDate: '2026-09-10',
        amount: money('150.00'),
        fine: money('0.00'),
        paid: money('0.00'),
        amountDue: money('150.00'),
        status: 'OVERDUE',
        financed: false,
        paidAt: null,
        receipt: null,
      },
    ],
    consent: null,
    financing: null,
  },
  wallet: { number: 'W-1001', status: 'ACTIVE', balance: money('320.00') },
  attendance: { days: 40, present: 34, late: 2, halfDay: 0, absent: 4, percentage: 90 },
  leave: { pending: 0, approved: 1, days: 2 },
};

/** ACA-081: a teacher in full (client 2026-10-14), nothing on record unless given. */
const teacherDetail = (over: Partial<TeacherDetail> = {}): TeacherDetail => ({
  year: { id: 'y-1', label: '2026-27' },
  id: 't-1',
  memberNo: 'TVPS-00101',
  name: 'TEACHER A',
  employeeNo: 'TVPS-T-0101',
  userType: 'Teacher',
  department: null,
  gender: 'FEMALE',
  dateOfBirth: '1988-04-12',
  joinedOn: '2019-06-01',
  status: 'ACTIVE',
  statusReason: null,
  email: null,
  mobile: null,
  campusOneAccount: true,
  consoleRoles: [],
  customFields: [],
  counts: { classes: 0, sections: 0, subjects: 0 },
  assignments: [],
  classTeacherOf: [],
  coordinatorOf: [],
  timetable: { periodsAWeek: 0, lessons: [] },
  today: { date: '2026-10-14', status: null, checkInAt: null, checkOutAt: null, onLeave: false },
  attendance: { days: 0, present: 0, late: 0, halfDay: 0, absent: 0, percentage: null },
  leave: { balances: [], recent: [] },
  homework: { set: 0, open: 0, toReview: 0 },
  exams: { total: 0, marksEntered: 0, published: 0, marksDue: 0, upcoming: [] },
  transport: null,
  wallet: null,
  ...over,
});

describe('the principal on the web (client 2026-10-13)', () => {
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
  async function open(path: string) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl(path);
    (await request((u) => u === '/api/v1/console/session')).flush(session);
    await nav;
    await settle();
    serve({ '/api/v1/languages': { items: [] } });
    return harness.routeNativeElement as HTMLElement;
  }
  const confirm = async (reason?: string) => {
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    if (reason !== undefined) {
      const area = dlg.querySelector('#cf-reason') as HTMLTextAreaElement;
      area.value = reason;
      area.dispatchEvent(new Event('input'));
    }
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    await settle(2);
  };

  it('lands the principal on the school overview with the Principal and Personal menus (ACA-060)', async () => {
    await open('/console');
    const side = document.querySelector('.c-nav');
    expect([...(side?.querySelectorAll('.nv-par') ?? [])].map((g) => text(g))).toEqual([
      'Principal',
      'Personal',
    ]);
    expect([...(side?.querySelectorAll('.nv-item') ?? [])].map((a) => text(a))).toEqual([
      'Overview',
      'Teacher leave',
      'Attendance',
      'Academics',
      'People',
      'Student overview',
      'Teacher overview',
      'Announcements',
      'Messages',
      'Notices',
      'My leave',
      'My attendance',
      'Calendar',
    ]);
    const router = TestBed.inject(Router);
    for (let i = 0; i < 40 && router.url !== '/console/principal'; i++) await tick();
    expect(router.url).toBe('/console/principal');
    const get = await request((u) => u === '/api/v1/principal/overview');
    // The app's own route, reached with the console session.
    expect(get.request.headers.get('X-CampusOne-Surface')).toBe('console');
    get.flush(overview);
    await settle();
    const el = harness.routeNativeElement as HTMLElement;
    // The principal's dashboard (client 2026-10-27): the greeting, then the task cards.
    expect(text(el.querySelector('.c-ph h1'))).toMatch(
      /^Good (morning|afternoon|evening), Kavitha$/,
    );
    expect([...el.querySelectorAll('.tl-card .tl-t')].map((c) => text(c))).toEqual([
      'Principal',
      'Personal',
    ]);
    const kpis = text(el.querySelector('#po-kpis'));
    expect(kpis).toContain('Students 640 93.8% present today');
    expect(kpis).toContain('Leave awaiting you 3 2 on leave today');
    // No one marked yet: not 0%.
    expect(kpis).toContain('Staff 14 Not marked yet');
    expect(text(el.querySelector('#po-attendance'))).toContain(
      'Staff — 0 present · 0 absent · 14 not marked · 14 in all',
    );
    expect(text(el.querySelector('#po-attendance'))).toContain(
      '27 on time · 2 late · 1 half day · 1 absent · 1 not marked · 32 in all',
    );
    expect(text(el.querySelector('#po-approvals'))).toContain(
      'Student leave with class teachers 5',
    );
    expect(text(el.querySelector('#po-academics'))).toContain('Need support 2');
  });

  it('says why the session ended when the account signed in on another device (client 2026-10-13)', async () => {
    document.cookie = 'rp_console_csrf=tok; path=/';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ code: 'AUTH.SIGNED_IN_ELSEWHERE' }, { status: 401 })),
    );
    try {
      await open('/console/principal-academics');
      (await request((u) => u === '/api/v1/principal/academics')).flush(
        { code: 'AUTH.UNAUTHENTICATED' },
        { status: 401, statusText: 'Unauthorized' },
      );
      const router = TestBed.inject(Router);
      for (let i = 0; i < 60 && router.url !== '/console/signin'; i++) await tick();
      expect(router.url).toBe('/console/signin');
      await settle();
      expect(text(harness.routeNativeElement)).toContain(
        'You were signed out because this account signed in on another device or browser.',
      );
    } finally {
      vi.unstubAllGlobals();
      document.cookie = 'rp_console_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    }
  });

  it('approves and rejects teacher leave, a reason required to reject (ACA-061, ACA-062)', async () => {
    const el = await open('/console/principal-leave');
    (await request((u) => u === '/api/v1/principal/teacher-leaves?status=AWAITING')).flush(
      leaves([
        leave(),
        leave({ id: 'l-2', staff: { id: 's-2', name: 'RAVI NAIK', type: 'Teacher' } }),
      ]),
    );
    await settle();
    expect(text(el.querySelector('#pl-tab-awaiting'))).toBe('Awaiting you 2');
    const card = text(el.querySelector('#pl-0'));
    expect(card).toContain('Meena Rao · Teacher');
    expect(card).toContain('20 Oct 2026 to 21 Oct 2026 · 2 days');
    expect(card).toContain('9 of 12 casual leave days left');
    expect(card).toContain('by Anil Kumar');
    expect(card).toContain('Also away on some of these days: Ravi Naik');

    (el.querySelector('#pl-approve-0') as HTMLButtonElement).click();
    await confirm();
    const ok = await request((u) => u === '/api/v1/principal/teacher-leaves/l-1/decision', 'POST');
    expect(ok.request.headers.get('X-CampusOne-Surface')).toBe('console');
    expect(ok.request.body).toEqual({ decision: 'APPROVED', remarks: null });
    ok.flush({});
    (await request((u) => u === '/api/v1/principal/teacher-leaves?status=AWAITING')).flush(
      leaves([leave({ id: 'l-2', staff: { id: 's-2', name: 'RAVI NAIK', type: 'Teacher' } })]),
    );
    await settle();
    expect(toasts()).toContain('Leave approved');

    (el.querySelector('#pl-reject-0') as HTMLButtonElement).click();
    await confirm('');
    // No reason: the dialog stays open and asks for one.
    expect(text(document.querySelector('.modal[role="alertdialog"]'))).toContain(
      'Enter a reason to continue',
    );
    await confirm('Exams that week');
    const no = await request((u) => u === '/api/v1/principal/teacher-leaves/l-2/decision', 'POST');
    expect(no.request.body).toEqual({ decision: 'REJECTED', remarks: 'Exams that week' });
    no.flush({});
    (await request((u) => u === '/api/v1/principal/teacher-leaves?status=AWAITING')).flush(
      leaves([]),
    );
    await settle();
    expect(toasts()).toContain('Leave rejected');
    expect(text(el.querySelector('.empty h4'))).toBe('Nothing waits for your decision');

    (el.querySelector('#pl-tab-decided') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/principal/teacher-leaves?status=DECIDED')).flush(
      leaves([
        leave({
          state: 'APPROVED',
          final: {
            status: 'APPROVED',
            by: 'KAVITHA SHENOY',
            at: '2026-10-13T05:00:00.000Z',
            remarks: null,
          },
        }),
      ]),
    );
    await settle();
    expect(text(el.querySelector('#pl-0'))).toContain('Approved by Kavitha Shenoy');
    expect(el.querySelector('#pl-approve-0')).toBeNull();
  });

  it('shows the day’s attendance by class, then teachers by name (ATT-026)', async () => {
    const el = await open('/console/principal-attendance');
    (
      await request(
        (u) => u.startsWith('/api/v1/principal/attendance?') && u.includes('type=STUDENTS'),
      )
    ).flush({
      date: '2026-10-13',
      type: 'STUDENTS',
      items: [
        {
          section: { id: 'sec-1', label: 'Grade 7 B' },
          students: 40,
          attended: 36,
          present: 32,
          late: 3,
          halfDay: 1,
          absent: 2,
          percentage: 90,
        },
      ],
    });
    await settle();
    // Each count of the day (client 2026-10-25): present, late, half day, absent, not marked.
    expect(text(el.querySelector('#pa-sections tbody tr'))).toBe('Grade 7 B 40 36 3 1 2 2 90%');
    const kpis = text(el.querySelector('#pa-kpis'));
    expect(kpis).toContain('Present 36 of 40 · 32 on time');
    expect(kpis).toContain('Late 3');
    expect(kpis).toContain('Half day 1');
    expect(kpis).toContain('Absent 2');
    expect(kpis).toContain('Attendance 90% 2 not marked');

    (el.querySelector('#pa-tab-teachers') as HTMLButtonElement).click();
    (await request((u) => u.includes('type=TEACHERS'))).flush({
      date: '2026-10-13',
      type: 'TEACHERS',
      items: [
        {
          member: { id: 't-1', name: 'MEENA RAO', type: 'Teacher' },
          status: 'LATE',
          checkInAt: null,
          checkOutAt: null,
          onApprovedLeave: false,
        },
        {
          member: { id: 't-2', name: 'RAVI NAIK', type: 'Teacher' },
          status: null,
          checkInAt: null,
          checkOutAt: null,
          onApprovedLeave: true,
        },
      ],
    });
    await settle();
    const rows = [...el.querySelectorAll('#pa-staff tbody tr')].map((r) => text(r));
    expect(rows).toEqual(['Meena Rao Teacher Late — —', 'Ravi Naik Teacher On leave — —']);
    // The teachers' counts from each one's status: one late (present), one not marked.
    expect(text(el.querySelector('#pa-kpis'))).toContain('Present 1 of 2 · 0 on time');
    expect(text(el.querySelector('#pa-kpis'))).toContain('Late 1');
  });

  /** Picks an option of an rp-dd on the page. */
  const choose = async (el: HTMLElement, id: string, label: string) => {
    (el.querySelector(`#${id}-b`) as HTMLButtonElement).click();
    await settle();
    ([...document.querySelectorAll('.dd-menu .dd-opt')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith(label))!
      .click();
    await settle();
  };
  const typeIn = async (el: HTMLElement, sel: string, v: string) => {
    const box = el.querySelector(sel) as HTMLInputElement;
    box.value = v;
    box.dispatchEvent(new Event('input'));
    await settle();
  };

  // SRS 20.32 (client 2026-10-14).
  it('shows the Student Overview: search, the class filter and a student’s panel', async () => {
    const el = await open('/console/principal-students');
    (await request((u) => u === '/api/v1/principal/student-overview')).flush({
      year: { id: 'y-1', label: '2026-27' },
      items: [
        {
          id: 'st-1',
          memberNo: 'TVPS-00012',
          name: 'DIYA RAO',
          class: 'Grade 6',
          section: 'A',
          admissionNo: 'ADM/2026/014',
          department: null,
          status: 'ACTIVE',
          contact: {
            name: 'SURESH RAO',
            relation: 'FATHER',
            mobile: '9845012345',
            email: 'suresh@example.in',
          },
        },
        {
          id: 'st-2',
          memberNo: 'TVPS-00013',
          name: 'KIRAN BHAT',
          class: 'Grade 7',
          section: 'B',
          admissionNo: null,
          department: 'Primary',
          status: 'INACTIVE',
          contact: null,
        },
      ],
    });
    await settle();
    expect(text(el)).toContain('Student Overview');
    const rows = () => [...el.querySelectorAll('#so-table tbody tr')].map((r) => text(r));
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toContain('Diya Rao TVPS-00012 Grade 6-A ADM/2026/014 Suresh Rao (Father)');
    expect(rows()[0]).toContain('suresh@example.in Active View');
    expect(rows()[1]).toBe('Kiran Bhat TVPS-00013 Grade 7-B — — Inactive View');
    // Search by the parent's name, then by the ID.
    await typeIn(el, '#so-q', 'suresh');
    expect(rows()).toHaveLength(1);
    await typeIn(el, '#so-q', 'tvps-00013');
    expect(rows()[0]).toContain('Kiran Bhat');
    await typeIn(el, '#so-q', '');
    // The class filter: the class labels in the result.
    await choose(el, 'so-class', 'Grade 6-A');
    expect(rows()).toHaveLength(1);
    await typeIn(el, '#so-q', 'kiran');
    expect(text(el)).toContain('No students found');
    await typeIn(el, '#so-q', '');
    await choose(el, 'so-class', 'All Classes');
    // The student in full (client 2026-10-14): personal, family, transport, fees and more.
    (el.querySelector('[data-student="st-1"]') as HTMLButtonElement).click();
    await settle();
    expect(text(document.querySelector('#sp-loading'))).toContain('Loading student details');
    (await request((u) => u === '/api/v1/principal/student-overview/st-1')).flush(studentDetail);
    await settle();
    const panel = () => text(document.querySelector('#so-panel'));
    expect(panel()).toContain('Grade / Section Grade 6-A');
    expect(panel()).toContain('Class teacher Meena Rao');
    expect(panel()).toContain('Department Academics');
    expect(panel()).toContain('Date of birth 01 Jun 2015');
    expect(panel()).toContain('Blood group B+');
    expect(panel()).toContain('Aadhaar number XXXX XXXX 2346');
    expect(panel()).toContain('House Blue');
    const tab = async (id: string) => {
      (document.querySelector(`#sp-tab-${id}`) as HTMLButtonElement).click();
      await settle();
    };
    await tab('family');
    expect(text(document.querySelector('#sp-guardians tbody tr'))).toContain(
      'Suresh Rao Primary contact Father',
    );
    expect(text(document.querySelector('#sp-addresses'))).toContain(
      'Residential No. 12, 4th Cross, Vinoba Nagar, Shivamogga, Karnataka, 577205',
    );
    await tab('transport');
    expect(text(document.querySelector('#sp-allocation'))).toContain(
      'Route R-07 · Gopala – School',
    );
    expect(text(document.querySelector('#sp-allocation'))).toContain('Pick-up time 07:40');
    expect(text(document.querySelector('#sp-trips tbody tr'))).toContain('KA-14-B-2201');
    expect(text(document.querySelector('#sp-hostel'))).toContain('Hostel No');
    await tab('fees');
    expect(text(document.querySelector('#sp-fee-kpis'))).toContain('Outstanding ₹150.00');
    expect(text(document.querySelector('#sp-fee-status'))).toContain('1 instalment overdue');
    expect([...document.querySelectorAll('#sp-fee-records tbody tr')].map((r) => text(r))).toEqual([
      'Term 1 10 Jun 2026 ₹100.00 ₹100.00 ₹0.00 Paid RCPT-0001',
      'Term 2 10 Sep 2026 ₹150.00 ₹0.00 ₹150.00 Overdue —',
    ]);
    await tab('more');
    expect(text(document.querySelector('#sp-attendance'))).toContain('Attendance 90% of 40 days');
    expect(text(document.querySelector('#sp-admission'))).toContain('Application SV/2026/000004');
    // Nothing to change from here (RNG-ACA-394).
    expect(document.querySelectorAll('.drawer input, .drawer .btn-pri')).toHaveLength(0);
  });

  // SRS 20.33 (client 2026-10-14).
  it('shows the Faculty & Teacher Directory, paged and filtered, and a teacher’s detail', async () => {
    const el = await open('/console/principal-teachers');
    const items = Array.from({ length: 12 }, (_, i) => ({
      id: `t-${i + 1}`,
      name: `TEACHER ${String.fromCharCode(65 + i)}`,
      primaryClass: { class: i < 6 ? 'Grade 6' : 'Grade 7', section: 'A' },
      roles: i === 0 ? ['CLASS_TEACHER', 'SUBJECT_TEACHER'] : ['SUBJECT_TEACHER'],
      assignments: i === 0 ? 3 : 1,
      classIds: [i < 6 ? 'c-6' : 'c-7'],
    }));
    (await request((u) => u === '/api/v1/principal/teacher-overview')).flush({
      year: { id: 'y-1', label: '2026-27' },
      classes: [
        { id: 'c-6', name: 'Grade 6' },
        { id: 'c-7', name: 'Grade 7' },
      ],
      items,
    });
    await settle();
    expect(text(el)).toContain('Faculty & Teacher Directory');
    const rows = () => [...el.querySelectorAll('#to-table tbody tr')].map((r) => text(r));
    // Ten a page by default.
    expect(rows()).toHaveLength(10);
    expect(rows()[0]).toBe(
      'Teacher A Class Grade 6 - Sec A Class Teacher · Subject Teacher 3 View',
    );
    expect(text(el.querySelector('.pager'))).toContain('Showing 1–10 of 12');
    await choose(el, 'to-size', '50 items');
    expect(rows()).toHaveLength(12);
    await choose(el, 'to-class', 'Grade 7');
    expect(rows()).toHaveLength(6);
    await typeIn(el, '#to-q', 'teacher l');
    expect(rows()).toEqual(['Teacher L Class Grade 7 - Sec A Subject Teacher 1 View']);
    await typeIn(el, '#to-q', 'teacher a');
    expect(text(el)).toContain('No teachers found matching your filter criteria');
    await typeIn(el, '#to-q', '');
    await choose(el, 'to-class', 'All Classes');

    // The detail replaces the list.
    (el.querySelector('[data-teacher="t-1"]') as HTMLButtonElement).click();
    await settle();
    expect(text(el)).toContain('Loading teacher details...');
    (await request((u) => u === '/api/v1/principal/teacher-overview/t-1')).flush(
      teacherDetail({
        email: 'teacher.a@tvps.example.in',
        mobile: '9845011111',
        counts: { classes: 1, sections: 2, subjects: 1 },
        assignments: [
          { kind: 'CLASS_TEACHER', class: 'Grade 6', section: 'A', subject: null, periodsAWeek: 0 },
          {
            kind: 'SUBJECT_TEACHER',
            class: 'Grade 6',
            section: 'B',
            subject: 'Mathematics',
            periodsAWeek: 6,
          },
        ],
        classTeacherOf: [{ class: 'Grade 6', section: 'A', students: 38 }],
        consoleRoles: ['Academic Coordinator'],
        timetable: {
          periodsAWeek: 1,
          lessons: [
            {
              day: 1,
              period: 'Period 1',
              startsAt: '09:00',
              endsAt: '09:40',
              class: 'Grade 6',
              section: 'B',
              subject: 'Mathematics',
            },
          ],
        },
        leave: {
          balances: [
            { type: 'CASUAL', label: 'Casual leave', total: 12, used: 2, pending: 1, left: 10 },
          ],
          recent: [
            {
              type: 'CASUAL',
              from: '2026-10-20',
              to: '2026-10-21',
              days: 2,
              state: 'WITH_PRINCIPAL',
              appliedAt: null,
            },
          ],
        },
        homework: { set: 14, open: 3, toReview: 5 },
        exams: {
          total: 4,
          marksEntered: 2,
          published: 1,
          marksDue: 1,
          upcoming: [
            {
              exam: 'Half-yearly',
              class: 'Grade 6',
              section: 'B',
              subject: 'Mathematics',
              date: '2026-11-02',
            },
          ],
        },
        transport: {
          route: { code: 'R-07', name: 'Gopala – School' },
          stop: 'Gopala Circle',
          pickUp: '07:40',
          drop: null,
        },
      }),
    );
    await settle();
    expect(el.querySelector('#to-table')).toBeNull();
    expect(text(el.querySelector('#to-counts'))).toContain('Classes 1');
    expect(text(el.querySelector('#to-counts'))).toContain('Sections 2');
    expect(text(el.querySelector('#to-counts'))).toContain('Periods a week 1');
    expect(text(el.querySelector('#to-contact'))).toContain('Email teacher.a@tvps.example.in');
    expect(text(el.querySelector('#to-contact'))).toContain('Mobile Number');
    expect(text(el.querySelector('#to-led'))).toBe('Grade 6 A · 38 students');
    expect([...el.querySelectorAll('#to-assignments tbody tr')].map((r) => text(r))).toEqual([
      'Class Teacher Grade 6 A — —',
      'Subject Teacher Grade 6 B Mathematics 6',
    ]);
    // More about the teacher (client 2026-10-14).
    const detailTab = async (id: string) => {
      (el.querySelector(`#td-tab-${id}`) as HTMLButtonElement).click();
      await settle();
    };
    await detailTab('personal');
    expect(text(el.querySelector('#to-personal'))).toContain('Employee No TVPS-T-0101');
    expect(text(el.querySelector('#to-personal'))).toContain('Console roles Academic Coordinator');
    await detailTab('timetable');
    expect(text(el.querySelector('#to-timetable tbody tr'))).toBe(
      'Monday Period 1 09:00–09:40 Grade 6 B Mathematics',
    );
    await detailTab('attendance');
    expect(text(el.querySelector('#to-balances tbody tr'))).toBe('Casual leave 12 2 1 10');
    expect(text(el.querySelector('#to-leaves tbody tr'))).toContain('Waiting for you');
    await detailTab('work');
    expect(text(el.querySelector('#to-work'))).toContain('Submissions to review 5');
    expect(text(el.querySelector('#to-work'))).toContain(
      'Marks still due 1 exams held without marks',
    );
    expect(text(el.querySelector('#to-upcoming tbody tr'))).toContain('Half-yearly Grade 6 B');
    await detailTab('other');
    expect(text(el.querySelector('#to-transport'))).toContain(
      'R-07 · Gopala – School — Gopala Circle, pick-up 07:40',
    );
    (el.querySelector('#to-back') as HTMLButtonElement).click();
    await settle();
    // Back to the list as it was left (50 a page).
    expect(rows()).toHaveLength(12);

    // A teacher without assignments: said so, not an error.
    (el.querySelector('[data-teacher="t-2"]') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/principal/teacher-overview/t-2')).flush(
      teacherDetail({ id: 't-2', name: 'TEACHER B', employeeNo: null }),
    );
    await settle();
    // Back on the first tab.
    expect(text(el.querySelector('#to-none'))).toBe(
      'No academic assignments found for this teacher.',
    );
  });

  it('lists the school’s announcements and reminds through the principal’s routes (COM-026, COM-030, COM-031)', async () => {
    const el = await open('/console/principal-announce');
    (await request((u) => u === '/api/v1/principal/announcements')).flush(list);
    await settle();
    expect(text(el.querySelector('#pn-table tbody tr'))).toContain(
      'Half-yearly examination timetable',
    );
    expect(text(el.querySelector('#pn-table tbody tr'))).toContain('1 of 2');
    expect(el.querySelector('#pn-new')).not.toBeNull();

    (el.querySelector('#pn-table tbody tr') as HTMLElement).click();
    (
      await request((u) => u.startsWith('/api/v1/principal/announcements/an-1/acknowledgements'))
    ).flush({
      items: [
        {
          member: {
            id: 'm-1',
            name: 'Kavya Pai',
            admissionNo: 'A1',
            class: 'Grade 7',
            section: 'B',
            type: 'Student',
          },
          acknowledgedAt: new Date().toISOString(),
          channel: 'IN_APP',
        },
        {
          member: {
            id: 'm-2',
            name: 'Ananya Rao',
            admissionNo: 'A2',
            class: 'Grade 7',
            section: 'B',
            type: 'Student',
          },
          acknowledgedAt: null,
          channel: null,
        },
      ],
      nextCursor: null,
    });
    await settle();
    // No console detail is asked for, and the principal can't withdraw.
    const ctl = TestBed.inject(HttpTestingController);
    expect(ctl.match((r) => r.url.startsWith('/api/v1/console/announcements')).length).toBe(0);
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(drawer.querySelector('#an-withdraw')).toBeNull();
    (drawer.querySelector('#an-remind') as HTMLButtonElement).click();
    await confirm();
    const remind = await request(
      (u) => u === '/api/v1/principal/announcements/an-1/reminders',
      'POST',
    );
    expect(remind.request.body).toEqual({ channels: ['IN_APP'] });
    remind.flush({ reminded: 1 }, { status: 202, statusText: 'Accepted' });
    await settle();
    expect(toasts()).toContain('Reminder sent');
  });
});
