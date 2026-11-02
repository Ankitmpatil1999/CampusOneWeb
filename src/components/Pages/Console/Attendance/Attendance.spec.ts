import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { translate } from '../../../Utils/translate';
import type { AttendanceOverview, AttendanceReport, MemberAttendance } from './attendance.api';
import { attTone, cooling, dayStatus, pct } from './attendance-format';

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

const session = (
  subTasks = ['attendance.view', 'attendance.mark', 'attendance.config'],
  ro = false,
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
    ro
      ? { code: 'MANAGEMENT', name: 'Management', readOnly: true }
      : { code: 'INSTITUTION_ADMIN', name: 'Institution Administrator', readOnly: false },
  ],
  subTasks: ['home.view', 'task.home', 'task.attendance', ...subTasks],
  preferredLang: 'en',
});
const year = {
  id: 'y-26',
  label: '2026-27',
  startsOn: '2026-04-01',
  endsOn: '2027-03-31',
  status: 'OPEN',
  current: true,
  version: 1,
};
const counts = (total: number, present: number, late = 0, halfDay = 0, absent = 0) => ({
  total,
  present,
  late,
  halfDay,
  absent,
  notMarked: total - present - late - halfDay - absent,
});
const overview = (over: Partial<AttendanceOverview> = {}): AttendanceOverview => ({
  date: '2026-10-03',
  year: { id: 'y-26', label: '2026-27' },
  holiday: null,
  sunday: false,
  students: counts(17, 13, 2, 0, 1),
  staff: { teachers: counts(4, 3, 1), others: counts(2, 2) },
  sections: [
    {
      section: { id: 's-7a', label: 'Grade 7 A' },
      students: 6,
      present: 5,
      late: 1,
      halfDay: 0,
      absent: 0,
      notMarked: 0,
      percentage: 100,
    },
    {
      section: { id: 's-7b', label: 'Grade 7 B' },
      students: 11,
      present: 8,
      late: 1,
      halfDay: 0,
      absent: 1,
      notMarked: 1,
      percentage: 81.8,
    },
  ],
  ...over,
});
const member = (id: string, name: string, s: Partial<MemberAttendance> = {}): MemberAttendance => ({
  member: { id, name, admissionNo: `TVPS/2026/${id}`, type: 'Student' },
  present: 0,
  late: 0,
  halfDay: 0,
  absent: 0,
  notMarked: 0,
  percentage: null,
  ...s,
});
const roster: AttendanceReport = {
  from: '2026-10-03',
  to: '2026-10-03',
  type: 'STUDENT',
  schoolDays: 1,
  items: [
    member('0410', 'KAVYA RAO', { present: 1, percentage: 100 }),
    member('0411', 'ARJUN BHAT', { absent: 1, percentage: 0 }),
    member('0412', 'MEERA HEGDE', { notMarked: 1, percentage: 0 }),
  ],
  nextCursor: null,
};
const classes = {
  year: { id: 'y-26', label: '2026-27' },
  items: [
    {
      id: 'c-7',
      name: 'Grade 7',
      order: 9,
      students: 17,
      version: 1,
      sections: [
        { id: 's-7a', name: 'A', capacity: 40, students: 6 },
        { id: 's-7b', name: 'B', capacity: 40, students: 11 },
      ],
    },
  ],
};

describe('console attendance (ATT-008…014)', () => {
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

  async function open(s = session(), day = overview()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/attendance');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    await settle();
    if (!s.subTasks.includes('attendance.view')) return harness.routeNativeElement as HTMLElement;
    (await request((u) => u === '/api/v1/console/academic-years')).flush({ items: [year] });
    (await request((u) => u === '/api/v1/console/classes')).flush(classes);
    await settle();
    const ov = await request((u) => u.startsWith('/api/v1/console/attendance/overview?'));
    expect(ov.request.params.get('yearId')).toBe('y-26');
    ov.flush(day);
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }
  const tab = async (el: HTMLElement, label: string) => {
    ([...el.querySelectorAll('.tabs .tab')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith(label))!
      .click();
    await settle();
  };

  it('reads a one-day report row and the attendance tones', () => {
    expect(dayStatus({ present: 0, late: 1, halfDay: 0, absent: 0 })).toBe('LATE');
    expect(dayStatus({ present: 0, late: 0, halfDay: 0, absent: 0 })).toBeNull();
    expect([attTone(95), attTone(80), attTone(60)]).toEqual(['ok', 'warn', 'bad']);
    expect(pct(13, 17)).toBe(76);
    expect([cooling(600), cooling(45)]).toEqual(['10 min', '45 s']);
  });

  it('shows the day by class-section with its figures', async () => {
    const el = await open();
    expect([...el.querySelectorAll('#att-kpis .kpi')].map(words)).toEqual([
      expect.stringMatching(/^Present( today)? 88% 15 of 17 students$/),
      'Late 2 Checked in after the cut-off',
      // Each count of the day (client 2026-10-25).
      'Half day 0 Counted as present',
      'Absent 1 Includes leave',
      expect.stringMatching(/^(Unmarked|Not marked yet) 1/),
    ]);
    const rows = [...el.querySelectorAll('#att-table tbody tr')].map(words);
    expect(rows[0]).toBe('Grade 7 A No class teacher 6 5 1 0 0 100%');
    expect(rows[1]).toBe('Grade 7 B No class teacher 11 8 1 1 1 82%');
  });

  // A Sunday with nobody recorded; its teachers' records in the next test.
  const sunday = (teachers = counts(4, 0)) =>
    overview({
      date: '2026-10-25',
      sunday: true,
      students: counts(17, 0),
      staff: { teachers, others: counts(2, 0) },
      sections: overview().sections.map((s) => ({
        ...s,
        present: 0,
        late: 0,
        halfDay: 0,
        absent: 0,
        notMarked: s.students,
        percentage: null,
      })),
    });

  it('says when there is no school on the date', async () => {
    const el = await open(session(), sunday());
    expect(text(el.querySelector('.empty'))).toContain('No school on this date');
    expect(el.querySelector('#att-table')).toBeNull();
  });

  it("shows a Sunday's staff check-ins (client 2026-10-25)", async () => {
    const day = sunday(counts(4, 0, 1));
    const el = await open(session(), day);
    expect(text(el.querySelector('.empty'))).toContain('No school on this date');
    ([...el.querySelectorAll('.pills .pill')] as HTMLButtonElement[])
      .find((b) => text(b) === 'Teaching staff')!
      .click();
    await settle(1);
    (await request((u) => u.startsWith('/api/v1/console/attendance/overview?'))).flush(day);
    (await request((u) => u.startsWith('/api/v1/console/attendance/reports?'))).flush({
      ...roster,
      from: '2026-10-25',
      to: '2026-10-25',
      type: 'TEACHER',
      schoolDays: 0,
      items: [member('t-1', 'SAGAR KESHARI SUMANTARAY', { late: 1 })],
    });
    (await request((u) => u.startsWith('/api/v1/console/attendance/staff?'))).flush({
      date: '2026-10-25',
      today: true,
      counts: { ...counts(4, 0, 1), onCampus: 1 },
      items: [],
    });
    await settle();
    expect(el.querySelector('.empty')).toBeNull();
    const kpis = [...el.querySelectorAll('#att-kpis .kpi')].map(words);
    expect(kpis[0]).toMatch(/^Present 1 of 4 teaching staff · 0 on time$/);
    expect(kpis[1]).toBe('Late 1 After the late cut-off');
    expect(words(el.querySelector('#att-staff tbody tr'))).toContain('Late');
  });

  it('marks a class-section after a confirmation, keeping the audit trail (ATT-010)', async () => {
    const el = await open();
    await tab(el, 'Manual marking');
    (await request((u) => u.startsWith('/api/v1/console/attendance/overview?'))).flush(overview());
    const r = await request((u) => u.startsWith('/api/v1/console/attendance/reports?'));
    expect(r.request.params.get('classSection')).toBe('s-7a');
    expect(r.request.params.get('type')).toBe('STUDENT');
    r.flush(roster);
    await settle();
    const rows = [...el.querySelectorAll('#mk-table tbody tr')];
    expect(rows.map((x) => words(x.querySelector('td:nth-child(3)')))).toEqual([
      'Absent',
      'Present',
      'Not marked',
    ]);
    // Arjun (absent) → present; Meera (not marked) → absent.
    (rows[0]!.querySelectorAll('.cc-mk')[0] as HTMLButtonElement).click();
    (rows[2]!.querySelectorAll('.cc-mk')[1] as HTMLButtonElement).click();
    await settle(1);
    expect(text(el.querySelector('.fsum'))).toContain('2 changes not saved');
    expect(words(rows[0])).toContain('Absent → Present');
    (el.querySelector('#mk-save') as HTMLButtonElement).click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(dlg)).toContain('Save 2 changes for Grade 7 A?');
    expect(text(dlg)).toContain('1 existing record is overridden');
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const put = await request((u) => u === '/api/v1/console/attendance/daily', 'PUT');
    expect(put.request.body).toEqual({
      date: expect.any(String),
      entries: [
        { memberId: '0411', status: 'PRESENT' },
        { memberId: '0412', status: 'ABSENT' },
      ],
    });
    put.flush({ date: '2026-10-03', saved: 1, overridden: 1 });
    await settle();
    expect(toasts()).toContain('Attendance saved for Grade 7 A');
  });

  it('marks teaching staff with every status (client 2026-10-22, ATT-010)', async () => {
    const el = await open();
    await tab(el, 'Manual marking');
    (await request((u) => u.startsWith('/api/v1/console/attendance/overview?'))).flush(overview());
    (await request((u) => u.startsWith('/api/v1/console/attendance/reports?'))).flush(roster);
    await settle();
    // Pick "Teaching staff" above the class-sections.
    (el.querySelector('#mk-filters .dd-btn') as HTMLButtonElement).click();
    await settle(1);
    const opt = ([...el.querySelectorAll('#mk-filters .dd-opt')] as HTMLElement[]).find((o) =>
      text(o).startsWith('Teaching staff'),
    )!;
    opt.click();
    await settle(2);
    (await request((u) => u.startsWith('/api/v1/console/attendance/overview?'))).flush(overview());
    const r = await request((u) => u.startsWith('/api/v1/console/attendance/reports?'));
    expect(r.request.params.get('type')).toBe('TEACHER');
    expect(r.request.params.get('classSection')).toBeNull();
    r.flush({
      ...roster,
      type: 'TEACHER',
      items: [
        {
          member: { id: 't-1', name: 'RAVI KULKARNI', admissionNo: null, type: 'Teacher' },
          present: 0,
          late: 1,
          halfDay: 0,
          absent: 0,
          notMarked: 0,
          percentage: 100,
        },
      ],
    });
    await settle();
    expect(words(el.querySelector('#mk-table thead'))).toContain('Staff member');
    const row = el.querySelector('#mk-table tbody tr')!;
    expect(words(row)).toContain('Teacher');
    // Four statuses for staff; Late is the recorded one.
    const marks = [...row.querySelectorAll('.cc-mk')] as HTMLButtonElement[];
    expect(marks.map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ]);
    marks[2]!.click();
    await settle(1);
    (el.querySelector('#mk-save') as HTMLButtonElement).click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(dlg)).toContain('Save 1 change for Teaching staff?');
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const put = await request((u) => u === '/api/v1/console/attendance/daily', 'PUT');
    expect(put.request.body).toEqual({
      date: expect.any(String),
      entries: [{ memberId: 't-1', status: 'HALF_DAY' }],
    });
    put.flush({ date: '2026-10-03', saved: 0, overridden: 1 });
    await settle();
    expect(toasts()).toContain('Attendance saved for Teaching staff');
  });

  it('checks the auto-absent cut-off and saves it with If-Match (ATT-012)', async () => {
    const el = await open();
    await tab(el, 'Auto-absent');
    (await request((u) => u === '/api/v1/console/attendance/auto-absent')).flush({
      enabled: false,
      cutoff: '11:00',
      appliesTo: ['STUDENTS'],
      version: 0,
      runs: [
        { date: '2026-10-03', marked: 3, skippedHoliday: false, ranAt: '2026-10-03T05:01:00Z' },
      ],
    });
    (await request((u) => u.startsWith('/api/v1/console/attendance/overview?'))).flush(overview());
    (await request((u) => u === '/api/v1/console/attendance/staff-timings')).flush({
      items: [],
      roles: [],
    });
    await settle();
    expect(text(el.querySelector('#aa-state'))).toBe(
      'Auto-absent is off — turn it on in Settings.',
    );
    expect(words(el.querySelector('#aa-runs tbody'))).toBe(
      '03 Oct 2026, 10:31 AM System Cut-off 03 Oct 2026 3',
    );
    expect(text(el.querySelector('#st-table tbody'))).toContain('No staff timings yet');
    const cut = el.querySelector('#aa-cut') as HTMLInputElement;
    cut.value = '19:00';
    cut.dispatchEvent(new Event('input'));
    (el.querySelector('#aa-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(el.querySelector('#aa-cut-e'))).toBe(translate('ATT.CUTOFF'));
    cut.value = '10:30';
    cut.dispatchEvent(new Event('input'));
    (el.querySelector('#aa-on') as HTMLInputElement).click();
    (el.querySelector('#aa-save') as HTMLButtonElement).click();
    const put = await request((u) => u === '/api/v1/console/attendance/auto-absent', 'PUT');
    expect(put.request.headers.get('If-Match')).toBe('"v0"');
    expect(put.request.body).toEqual({ enabled: true, cutoff: '10:30', appliesTo: ['STUDENTS'] });
  });

  it('keeps staff timings by role on the Auto-absent page (client 2026-10-23, ATT-033…036)', async () => {
    const teaching = {
      id: 'st-1',
      name: 'Teaching staff',
      roles: [{ id: 'r-t', name: 'Teacher' }],
      loginTime: '08:30',
      logoutTime: '16:30',
      lateLoginTime: '08:45',
      earlyLogoutTime: '16:00',
      halfDayTime: '11:00',
      absentTime: '13:00',
      staff: 12,
      version: 1,
    };
    const roles = [
      { id: 'r-a', name: 'Accountant', timingId: null },
      { id: 'r-f', name: 'Front desk', timingId: null },
      { id: 'r-t', name: 'Teacher', timingId: 'st-1' },
    ];
    const el = await open();
    await tab(el, 'Auto-absent');
    (await request((u) => u === '/api/v1/console/attendance/auto-absent')).flush({
      enabled: true,
      cutoff: '11:00',
      appliesTo: ['STUDENTS'],
      version: 1,
      runs: [
        {
          date: '2026-10-03',
          marked: 2,
          skippedHoliday: false,
          ranAt: '2026-10-03T07:35:00Z',
          timing: 'Teaching staff',
        },
      ],
    });
    (await request((u) => u.startsWith('/api/v1/console/attendance/overview?'))).flush(overview());
    (await request((u) => u === '/api/v1/console/attendance/staff-timings')).flush({
      items: [teaching],
      roles,
    });
    await settle();
    expect(words(el.querySelector('#st-table tbody'))).toBe(
      'Teaching staff Teacher 8:30 AM – 4:30 PM 8:45 AM 11:00 AM 1:00 PM 4:00 PM 12 Edit Delete',
    );
    expect(words(el.querySelector('#aa-runs tbody'))).toBe(
      '03 Oct 2026, 1:05 PM System Teaching staff 03 Oct 2026 2',
    );

    // A new timing: the Teacher role is already in one; the times in the day's order.
    (el.querySelector('#st-new') as HTMLButtonElement).click();
    await settle();
    const teacherBox = document.querySelector('#st-roles [data-role="r-t"]') as HTMLInputElement;
    expect(teacherBox.disabled).toBe(true);
    expect(text(teacherBox.parentElement)).toBe('Teacher · In Teaching staff');
    const type = (id: string, v: string) => {
      const i = document.querySelector(id) as HTMLInputElement;
      i.value = v;
      i.dispatchEvent(new Event('input'));
    };
    type('#st-name', 'Office');
    type('#st-late', '08:50');
    (document.querySelector('#st-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#st-roles-e'))).toBe(translate('ATT.TIMING_ROLES'));
    expect(text(document.querySelector('#st-late-e'))).toBe(
      translate('ATT.TIMING_AFTER', { after: 'login time' }),
    );
    (document.querySelector('#st-roles [data-role="r-f"]') as HTMLInputElement).click();
    type('#st-late', '09:10');
    (document.querySelector('#st-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/attendance/staff-timings', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      name: 'Office',
      roleIds: ['r-f'],
      loginTime: '09:00',
      logoutTime: '17:00',
      lateLoginTime: '09:10',
      earlyLogoutTime: '16:45',
      halfDayTime: '11:00',
      absentTime: '13:00',
    });
    const office = {
      ...teaching,
      ...post.request.body,
      id: 'st-2',
      roles: [{ id: 'r-f', name: 'Front desk' }],
      staff: 0,
    };
    post.flush(office);
    (await request((u) => u === '/api/v1/console/attendance/staff-timings')).flush({
      items: [teaching, office],
      roles: roles.map((r) => (r.id === 'r-f' ? { ...r, timingId: 'st-2' } : r)),
    });
    await settle();
    expect(toasts()).toContain('Staff timing added');

    // Changed with If-Match.
    (el.querySelector('[data-edit="st-1"]') as HTMLButtonElement).click();
    await settle();
    expect((document.querySelector('#st-name') as HTMLInputElement).value).toBe('Teaching staff');
    type('#st-absent', '12:30');
    (document.querySelector('#st-save') as HTMLButtonElement).click();
    const put = await request((u) => u === '/api/v1/console/attendance/staff-timings/st-1', 'PUT');
    expect(put.request.headers.get('If-Match')).toBe('"v1"');
    expect(put.request.body).toMatchObject({ roleIds: ['r-t'], absentTime: '12:30' });
    put.flush({ ...teaching, absentTime: '12:30', version: 2 });
    (await request((u) => u === '/api/v1/console/attendance/staff-timings')).flush({
      items: [{ ...teaching, absentTime: '12:30', version: 2 }, office],
      roles,
    });
    await settle();

    // Deleted after a confirmation.
    (el.querySelector('[data-remove="st-2"]') as HTMLButtonElement).click();
    await settle();
    expect(text(document.querySelector('.sh-f'))).toContain('Delete timing');
    (document.querySelector('.sh-f .btn-danger') as HTMLButtonElement).click();
    const del = await request(
      (u) => u === '/api/v1/console/attendance/staff-timings/st-2',
      'DELETE',
    );
    del.flush(null, { status: 204, statusText: 'No Content' });
    (await request((u) => u === '/api/v1/console/attendance/staff-timings')).flush({
      items: [teaching],
      roles,
    });
    await settle();
    expect(toasts()).toContain('Staff timing deleted');
  });

  it('adds an attendance type with its cooling-off (ATT-014)', async () => {
    const el = await open();
    await tab(el, 'Attendance types');
    (await request((u) => u === '/api/v1/console/attendance-types')).flush({
      items: [{ id: 't-1', name: 'Library', cooldownSeconds: 600, checkInsToday: 4, readers: 1 }],
    });
    await settle();
    expect(words(el.querySelector('#at-table tbody'))).toBe('Library 10 min 1 4');
    (el.querySelector('#at-new') as HTMLButtonElement).click();
    await settle();
    const name = document.querySelector('#at-n') as HTMLInputElement;
    name.value = 'library';
    name.dispatchEvent(new Event('input'));
    (document.querySelector('#at-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#at-n-e'))).toBe(
      translate('ATT.TYPE_TAKEN', { name: 'library' }),
    );
    name.value = 'Sick room';
    name.dispatchEvent(new Event('input'));
    const mins = document.querySelector('#at-c') as HTMLInputElement;
    mins.value = '5';
    mins.dispatchEvent(new Event('input'));
    (document.querySelector('#at-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/attendance-types', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({ name: 'Sick room', cooldownSeconds: 300 });
  });

  it('is read-only for Management', async () => {
    const el = await open(session(['attendance.view'], true));
    expect(text(el.querySelector('.note.tone-info'))).toContain('Read-only.');
    await tab(el, 'Attendance types');
    (await request((u) => u === '/api/v1/console/attendance-types')).flush({ items: [] });
    await settle();
    expect((el.querySelector('#at-new') as HTMLButtonElement).disabled).toBe(true);
  });

  it('is refused without the attendance task', async () => {
    const denied = await open(session([]));
    expect(text(denied.querySelector('.empty'))).toContain("You don't have access to this page");
  });
});
