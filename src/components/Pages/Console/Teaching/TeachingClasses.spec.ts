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
import type { MyPeriod, Register, StudentLeave, Today } from './classes.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
/** The visible words, with a space between elements (as a screen reader reads them). */
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
  name: 'MEENA RAO',
  email: 'meena@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'TEACHER', name: 'Teacher', readOnly: false }],
  subTasks: ['task.teaching', 'teaching.view', 'teaching.attendance', 'teaching.leave'],
  preferredLang: 'en',
};
const section = { id: 's-1', label: 'Grade 6 A' };
const slot = (day: number, periodId: string, start: string, end: string, subject: string) => ({
  day,
  period: { id: periodId, name: `Period ${periodId}`, startsAt: start, endsAt: end },
  subject: { id: `sub-${subject}`, name: subject, colour: '#2F6BFF' },
  teacher: { id: 't-1', name: 'Meena Rao' },
  section,
});
const today: Today = {
  year: { id: 'y-1', label: '2026-27' },
  date: '2026-10-05',
  teacher: { name: 'MEENA RAO' },
  assigned: true,
  classTeacherOf: [{ id: 's-1', label: 'Grade 6 A', students: 3, registerMarked: 1 }],
  subjectSections: [
    { id: 's-1', label: 'Grade 6 A', subjects: [{ id: 'sub-2', name: 'English', colour: '' }] },
    { id: 's-2', label: 'Grade 7 B', subjects: [{ id: 'sub-1', name: 'Mathematics', colour: '' }] },
  ],
  periods: [
    { ...slot(1, 'p1', '08:45', '09:25', 'Mathematics'), state: 'DONE' },
    { ...slot(1, 'p2', '09:25', '10:05', 'Science'), state: 'NOW' },
  ],
  homeworkToReview: 4,
};
const student = (id: string, name: string, no: string) => ({ id, name, admissionNo: no });
const register = (over: Partial<Register> = {}): Register => ({
  date: '2026-10-05',
  section,
  sections: [section, { id: 's-9', label: 'Grade 6 B' }],
  holiday: null,
  sunday: false,
  counts: { students: 3, present: 1, late: 0, halfDay: 0, absent: 0, notMarked: 2, onLeave: 1 },
  items: [
    {
      student: student('st-1', 'Asha Rao', 'ADM/1'),
      status: 'PRESENT',
      method: 'READER',
      remark: null,
      onApprovedLeave: false,
    },
    {
      student: student('st-2', 'Bala Rao', 'ADM/2'),
      status: null,
      method: null,
      remark: null,
      onApprovedLeave: true,
    },
    {
      student: student('st-3', 'Chetan K', 'ADM/3'),
      status: null,
      method: null,
      remark: null,
      onApprovedLeave: false,
    },
  ],
  ...over,
});
const myPeriod = (slotId: string, state: MyPeriod['state'], start: string): MyPeriod => ({
  slotId,
  period: { name: `Period ${slotId}`, startsAt: start, endsAt: '23:59' },
  subject: { name: 'Science', colour: '' },
  section,
  students: 3,
  captured: 0,
  state,
});
const leave = (over: Partial<StudentLeave> = {}): StudentLeave => ({
  id: 'l-1',
  reference: 'SL-000001',
  student: student('st-2', 'Bala Rao', 'ADM/2'),
  section,
  from: '2026-10-07',
  to: '2026-10-08',
  schoolDays: 2,
  reason: 'Family function in Mysuru',
  document: null,
  appliedBy: 'Ravi Rao',
  appliedAt: '2026-10-04T10:00:00.000Z',
  status: 'PENDING',
  decidedBy: null,
  remarks: null,
  ...over,
});

describe('teacher classes on the web (ACA-044…047, ATT-019…022, ACA-055/056)', () => {
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
  async function accept(reason?: string) {
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    if (reason !== undefined) {
      const box = dlg.querySelector('#cf-reason') as HTMLTextAreaElement;
      box.value = reason;
      box.dispatchEvent(new Event('input'));
      await settle(1);
    }
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    return dlg;
  }

  it('shows the day: periods with the current one, my classes and a roster drawer', async () => {
    const el = await open('/console/teaching');
    const req = await request((u) => u === '/api/v1/teacher/today');
    expect(req.request.headers.get('X-CampusOne-Surface')).toBe('console');
    req.flush(today);
    await settle();
    // The teacher's dashboard (client 2026-10-27): the greeting, then the task cards.
    expect(text(el.querySelector('h1'))).toMatch(/^Good (morning|afternoon|evening), Meena$/);
    expect([...el.querySelectorAll('.tl-card .tl-t')].map((c) => text(c))).toEqual([
      'Teaching',
      'Personal',
    ]);
    expect(text(el.querySelector('#tt-periods'))).toContain('Science · Grade 6 A Now');
    expect(text(el.querySelector('#tt-classes'))).toContain('Register: 1 of 3 marked');
    // A class the teacher also teaches a subject in is one card, with that subject on it.
    expect(text(el.querySelector('#tt-classes'))).toContain('Grade 6 A Class teacher English');
    expect(text(el.querySelector('#tt-classes')).match(/Grade 6 A/g)).toHaveLength(1);
    expect(text(el.querySelector('#tt-review'))).toContain('Homework submissions to review: 4');
    (el.querySelector('#tt-classes button') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/teacher/classes/s-1/students')).flush({
      section: { ...section, classTeacher: true },
      items: [
        {
          id: 'st-1',
          name: 'Asha Rao',
          admissionNo: 'ADM/1',
          gender: 'F',
          attendanceToday: 'HALF_DAY',
        },
      ],
    });
    await settle();
    expect(text(document.querySelector('#tt-roster'))).toContain('ADM/1 Asha Rao Half day');
  });

  const week = {
    year: { id: 'y-1', label: '2026-27' },
    days: [1, 2, 3, 4, 5, 6].map((day) => ({ day, label: '' })),
    periods: [
      { id: 'p1', name: 'Period 1', startsAt: '08:45', endsAt: '09:25', isBreak: false },
      { id: 'br', name: 'Lunch', startsAt: '12:00', endsAt: '12:40', isBreak: true },
    ],
    today: 2,
  };
  const classItem = (id: string, label: string, classTeacher: boolean) => ({
    id,
    label,
    students: 3,
    classTeacher,
    subjects: [],
  });

  it('lays out the week by period and day', async () => {
    const el = await open('/console/teaching-timetable');
    (await request((u) => u === '/api/v1/teacher/classes')).flush({
      items: [classItem('s-1', 'Grade 6 A', false)],
    });
    (await request((u) => u === '/api/v1/teacher/timetable')).flush({
      ...week,
      mine: [slot(2, 'p1', '08:45', '09:25', 'Mathematics')],
      section: null,
    });
    await settle();
    expect(text(el.querySelector('#ttb-grid thead'))).toContain('Tuesday Today');
    expect(text(el.querySelector('[data-slot="2:p1"]'))).toBe('Mathematics Grade 6 A');
    expect(text(el.querySelector('#ttb-grid tbody'))).toContain('Lunch 12:00–12:40 pm Break');
    // Not a class teacher: only their own week, no switch.
    expect(el.querySelector('#ttb-tab-class')).toBeNull();
  });

  it('shows a class teacher their class’s week beside their own', async () => {
    const el = await open('/console/teaching-timetable');
    (await request((u) => u === '/api/v1/teacher/classes')).flush({
      items: [classItem('s-2', 'Grade 7 B', false), classItem('s-1', 'Grade 6 A', true)],
    });
    const grade7 = {
      ...slot(3, 'p1', '08:45', '09:25', 'Mathematics'),
      section: { id: 's-2', label: 'Grade 7 B' },
    };
    const science = slot(2, 'p1', '08:45', '09:25', 'Science');
    const english = {
      ...slot(1, 'p1', '08:45', '09:25', 'English'),
      teacher: { id: 't-2', name: 'Ravi Kumar' },
    };
    (await request((u) => u === '/api/v1/teacher/timetable?classSectionId=s-1')).flush({
      ...week,
      mine: [science, grade7],
      section: { ...section, slots: [english, science] },
    });
    await settle();
    // My week first, as before.
    expect(el.querySelector('#ttb-tab-mine')!.getAttribute('aria-selected')).toBe('true');
    expect(text(el)).toContain('Your week · academic year 2026-27');
    expect(text(el.querySelector('[data-slot="3:p1"]'))).toBe('Mathematics Grade 7 B');
    expect(el.querySelector('[data-slot="1:p1"]')).toBeNull();
    // The class's week: every subject with its teacher, mine marked; other classes' periods gone.
    const tab = el.querySelector('#ttb-tab-class') as HTMLButtonElement;
    expect(text(tab)).toBe('Grade 6 A timetable');
    tab.click();
    await settle(1);
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(text(el)).toContain('Your class Grade 6 A · academic year 2026-27');
    expect(text(el.querySelector('[data-slot="1:p1"]'))).toBe('English Ravi Kumar');
    expect(text(el.querySelector('[data-slot="2:p1"]'))).toBe('Science Meena Rao (you)');
    expect(el.querySelector('[data-slot="3:p1"]')).toBeNull();
  });

  it('keeps the class switch for a class teacher with no periods yet', async () => {
    const el = await open('/console/teaching-timetable');
    (await request((u) => u === '/api/v1/teacher/classes')).flush({
      items: [classItem('s-1', 'Grade 6 A', true)],
    });
    (await request((u) => u === '/api/v1/teacher/timetable?classSectionId=s-1')).flush({
      ...week,
      mine: [],
      section: { ...section, slots: [] },
    });
    await settle();
    expect(text(el)).toContain('No timetable yet');
    (el.querySelector('#ttb-tab-class') as HTMLButtonElement).click();
    await settle(1);
    expect(text(el)).toContain('No timetable for Grade 6 A yet');
  });

  it('takes the register: changed rows only, all present, and a confirmed save', async () => {
    const el = await open('/console/teaching-attendance');
    (await request((u) => u.startsWith('/api/v1/teacher/attendance/register?date='))).flush(
      register(),
    );
    await settle();
    expect(text(el.querySelector('#ta-grid tbody'))).toContain('Bala Rao On approved leave');
    expect(text(el.querySelector('#ta-grid tbody'))).toContain('Asha Rao Reader');
    expect(text(el.querySelector('#ta-kpis'))).toContain('1 of 3 marked');
    expect((el.querySelector('#ta-save') as HTMLButtonElement).disabled).toBe(true);
    // Bala is absent with a remark; the rest present.
    const absent = [...el.querySelectorAll('#ta-s-1 button')].at(-1) as HTMLButtonElement;
    absent.click();
    const remark = el.querySelector('#ta-r-1') as HTMLInputElement;
    remark.value = 'Leave approved';
    remark.dispatchEvent(new Event('input'));
    await settle(1);
    (el.querySelector('#ta-all') as HTMLButtonElement).click();
    await settle(1);
    expect(text(el.querySelector('#ta-unsaved'))).toBe('Changes not saved yet');
    expect(text(el.querySelector('#ta-kpis'))).toContain('3 of 3 marked');
    (el.querySelector('#ta-save') as HTMLButtonElement).click();
    const dlg = await accept();
    expect(text(dlg)).toContain('2 present · 0 late · 0 half day · 1 absent');
    const put = await request((u) => u === '/api/v1/teacher/attendance/register', 'PUT');
    expect(put.request.headers.get('X-CampusOne-Surface')).toBe('console');
    expect(put.request.body).toEqual({
      classSectionId: 's-1',
      date: '2026-10-05',
      entries: [
        { studentId: 'st-2', status: 'ABSENT', remark: 'Leave approved' },
        { studentId: 'st-3', status: 'PRESENT', remark: null },
      ],
    });
    put.flush({ date: '2026-10-05', marked: 2 });
    (await request((u) => u.startsWith('/api/v1/teacher/attendance/register?'))).flush(register());
    await settle();
    expect(toasts()).toContain('Register saved');
  });

  it('sends a subject teacher to their periods, opened once a period starts', async () => {
    const el = await open('/console/teaching-attendance');
    (await request((u) => u.startsWith('/api/v1/teacher/attendance/register?'))).flush(
      {
        status: 403,
        code: 'ACA.CLASS_TEACHER_ONLY',
        detail: 'Only the class teacher can do this.',
      },
      { status: 403, statusText: 'Forbidden' },
    );
    (await request((u) => u.startsWith('/api/v1/teacher/attendance/periods?date='))).flush({
      date: '2026-10-05',
      items: [myPeriod('s-1.p2', 'NOW', '09:25'), myPeriod('s-1.p5', 'LATER', '13:30')],
    });
    await settle();
    expect(el.querySelector('#ta-tab-reg')).toBeNull();
    expect(el.querySelector('#ta-not-ct')).not.toBeNull();
    const later = el.querySelector('#ta-take-1') as HTMLButtonElement;
    expect(later.disabled).toBe(true);
    expect(text(later)).toBe('Opens at 1:30 PM');
    (el.querySelector('#ta-take-0') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/teacher/classes/s-1/students')).flush({
      section: { ...section, classTeacher: false },
      items: [
        { id: 'st-1', name: 'Asha Rao', admissionNo: 'ADM/1', gender: 'F', attendanceToday: null },
        { id: 'st-2', name: 'Bala Rao', admissionNo: 'ADM/2', gender: 'M', attendanceToday: null },
      ],
    });
    await settle();
    ([...el.querySelectorAll('#ta-p-1 button')][1] as HTMLButtonElement).click();
    await settle(1);
    (el.querySelector('#ta-psave') as HTMLButtonElement).click();
    const put = await request((u) => u === '/api/v1/teacher/attendance/periods/s-1.p2', 'PUT');
    expect(put.request.body).toEqual({
      date: put.request.body.date,
      entries: [
        { studentId: 'st-1', status: 'PRESENT' },
        { studentId: 'st-2', status: 'LATE' },
      ],
    });
    put.flush({ saved: 2 });
    (await request((u) => u.startsWith('/api/v1/teacher/attendance/periods?'))).flush({
      date: '2026-10-05',
      items: [],
    });
    await settle();
    expect(toasts()).toContain('Period attendance saved');
  });

  it('decides student leave: a reason to reject, the family told', async () => {
    const el = await open('/console/teaching-leave');
    const counts = { pending: 1, approved: 0, rejected: 0, all: 1 };
    (await request((u) => u === '/api/v1/teacher/student-leaves?status=PENDING')).flush({
      classTeacher: true,
      counts,
      items: [leave()],
    });
    await settle();
    expect(text(el.querySelector('#tl-tab-PENDING'))).toBe('Pending 1');
    expect(text(el.querySelector('#tl-0'))).toContain('Family function in Mysuru');
    (el.querySelector('#tl-reject-0') as HTMLButtonElement).click();
    await accept('Exams that week');
    const post = await request((u) => u === '/api/v1/teacher/student-leaves/l-1/decision', 'POST');
    expect(post.request.headers.has('Idempotency-Key')).toBe(true);
    expect(post.request.body).toEqual({ decision: 'REJECTED', remarks: 'Exams that week' });
    post.flush(leave({ status: 'REJECTED', remarks: 'Exams that week' }));
    (await request((u) => u === '/api/v1/teacher/student-leaves?status=PENDING')).flush({
      classTeacher: true,
      counts: { ...counts, pending: 0, rejected: 1 },
      items: [],
    });
    await settle();
    expect(toasts()).toContain('Leave rejected');
    expect(text(el.querySelector('#tl-tab-REJECTED'))).toBe('Rejected 1');
  });
});
