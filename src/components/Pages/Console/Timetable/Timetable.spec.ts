import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import type { ClashList, Timetable } from './timetable.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const toasts = () => text(document.querySelector('.toasts'));

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

/** jsdom has no object URLs: a download the page saves is the anchor it clicks. */
async function saving(run: (saved: () => HTMLAnchorElement[]) => Promise<void>) {
  const u = URL as unknown as {
    createObjectURL?: (b: Blob) => string;
    revokeObjectURL?: (s: string) => void;
  };
  const before = { create: u.createObjectURL, revoke: u.revokeObjectURL };
  u.createObjectURL = () => 'blob:sheet';
  u.revokeObjectURL = () => undefined;
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  try {
    await run(() => click.mock.contexts as HTMLAnchorElement[]);
  } finally {
    click.mockRestore();
    u.createObjectURL = before.create;
    u.revokeObjectURL = before.revoke;
  }
}

/** A row of the timetable sheet's report (client 2026-10-21). */
const sheetRow = (over: object) => ({
  row: 1,
  className: 'Grade 7',
  section: 'B',
  day: 'Monday',
  period: 'Period 1',
  subject: 'MAT',
  teacher: 'TVPS-T-0101',
  teacherName: 'RAVI KULKARNI',
  accepted: true,
  outcome: 'LESSON',
  code: null,
  params: {},
  ...over,
});

const session = {
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
    'task.academics',
    'academics.view',
    'academics.edit',
    'members.view',
  ],
  preferredLang: 'en',
};
const years = {
  items: [
    {
      id: 'y-26',
      label: '2026-27',
      startsOn: '2026-06-01',
      endsOn: '2027-03-31',
      status: 'OPEN',
      current: true,
      version: 1,
    },
    {
      id: 'y-25',
      label: '2025-26',
      startsOn: '2025-06-01',
      endsOn: '2026-03-31',
      status: 'CLOSED',
      current: false,
      version: 2,
    },
  ],
};
const classes = {
  year: { id: 'y-26', label: '2026-27' },
  items: [
    {
      id: 'c-7',
      name: 'Grade 7',
      order: 7,
      sections: [
        { id: 's-7a', name: 'A', capacity: null, students: 31 },
        { id: 's-7b', name: 'B', capacity: null, students: 29 },
      ],
      students: 60,
      version: 1,
    },
  ],
};
const bell = [
  { id: 'p-1', name: 'Period 1', startsAt: '08:45', endsAt: '09:25', isBreak: false },
  { id: 'p-b', name: 'Short break', startsAt: '09:25', endsAt: '09:40', isBreak: true },
  { id: 'p-2', name: 'Period 2', startsAt: '09:40', endsAt: '10:20', isBreak: false },
];
const periods = {
  items: bell.map((p) => ({ ...p, minutes: 40, timetableSlots: 0 })),
  summary: { teachingPeriods: 2, teachingMinutes: 80, breakMinutes: 15 },
  version: 5,
};
/** ACA-078: the active teachers, read with the academics grant (client 2026-10-13). */
const teacher = (id: string, name: string, emp: string) => ({
  id,
  name,
  employeeNo: emp,
  userType: 'Teacher',
});
const staff = {
  items: [
    teacher('t-ravi', 'RAVI KULKARNI', 'TVPS-T-0101'),
    teacher('t-sita', 'SITA RAO', 'TVPS-T-0102'),
  ],
};
const mat = { id: 'sub-mat', name: 'Mathematics', colour: '#1F7A4D' };
const sci = { id: 'sub-sci', name: 'Science', colour: '#2D5DA8' };
const ravi = { id: 't-ravi', name: 'RAVI KULKARNI' };
const sita = { id: 't-sita', name: 'SITA RAO' };
const year = {
  id: 'y-26',
  label: '2026-27',
  startsOn: '2026-06-01',
  endsOn: '2027-03-31',
  closed: false,
  current: true,
};
const timetable = (over: Partial<Timetable> = {}): Timetable => ({
  year,
  section: { id: 's-7b', label: 'Grade 7 B' },
  days: [1, 2, 3, 4, 5, 6].map((day) => ({ day, label: '' })),
  periods: bell,
  slots: [
    { day: 1, periodId: 'p-1', subject: mat, teacher: ravi },
    { day: 2, periodId: 'p-1', subject: sci, teacher: sita },
  ],
  subjects: [
    { ...mat, code: 'MAT', teachers: [ravi] },
    { ...sci, code: 'SCI', teachers: [sita] },
    { id: 'sub-eng', code: 'ENG', name: 'English', colour: '#B4582B', teachers: [] },
  ],
  version: 11,
  ...over,
});
const clashes: ClashList = {
  year,
  clashes: [
    {
      teacher: ravi,
      day: 1,
      period: { id: 'p-1', name: 'Period 1' },
      sections: [
        { id: 's-7b', label: 'Grade 7 B', subject: 'Mathematics' },
        { id: 's-7a', label: 'Grade 7 A', subject: 'Mathematics' },
      ],
    },
  ],
  teacherWeek: null,
};
const week: ClashList = {
  ...clashes,
  teacherWeek: [
    { day: 1, periodId: 'p-1', section: { id: 's-7b', label: 'Grade 7 B' }, subject: mat },
    { day: 1, periodId: 'p-1', section: { id: 's-7a', label: 'Grade 7 A' }, subject: mat },
    { day: 3, periodId: 'p-2', section: { id: 's-7a', label: 'Grade 7 A' }, subject: mat },
  ],
};
const assignments = {
  year,
  classTeachers: [
    {
      section: { id: 's-7b', name: 'B' },
      class: { id: 'c-7', name: 'Grade 7' },
      assignment: {
        id: 'a-ct',
        kind: 'CLASS_TEACHER',
        teacher: { ...ravi, combined: true },
        class: { id: 'c-7', name: 'Grade 7' },
        section: { id: 's-7b', name: 'B' },
        subject: null,
        periodsAWeek: 0,
        since: null,
      },
    },
  ],
  subjectTeachers: [],
  coordinators: [],
  combinedTeachers: 1,
};

describe('console timetable (ACA-024…026)', () => {
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

  async function open(tt: Timetable = timetable(), people = staff) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/timetable?section=s-7b');
    (await request((u) => u === '/api/v1/console/session')).flush(session);
    await nav;
    await settle();
    serve({
      '/api/v1/console/academic-years': years,
      '/api/v1/console/classes': classes,
      '/api/v1/console/periods': periods,
      '/api/v1/console/teachers': people,
    });
    await settle();
    serve({
      '/api/v1/console/timetables/s-7b?yearId=y-26': tt,
      '/api/v1/console/timetables/clashes?yearId=y-26': clashes,
      '/api/v1/console/teacher-assignments?yearId=y-26': assignments,
      '/api/v1/console/timetables/clashes?yearId=y-26&teacherId=t-ravi': week,
    });
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  const modal = () => [...document.querySelectorAll('.modal, .drawer')].at(-1) as HTMLElement;
  const cell = (el: HTMLElement, row: number, day: number) =>
    [...el.querySelectorAll('#tt-class tbody tr')][row]!.querySelectorAll('td')[day] as HTMLElement;
  const pick = async (id: string, label: string) => {
    (modal().querySelector(`#${id}-b`) as HTMLButtonElement).click();
    await settle();
    ([...document.querySelectorAll('.dd-menu .dd-opt')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith(label))!
      .click();
    await settle();
  };
  const confirm = async () => {
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    await settle(2);
  };

  it('draws the section’s week with breaks, clashes and the subjects a week', async () => {
    const el = await open();
    expect([...el.querySelectorAll('#tt-class thead th')].map(text)).toEqual([
      'Period',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ]);
    const rows = [...el.querySelectorAll('#tt-class tbody tr')];
    expect(text(rows[0]!.querySelector('td'))).toBe('Period 18:45–9:25 am');
    expect(rows[1]!.classList.contains('brk')).toBe(true);
    expect(text(rows[1])).toBe('BreakShort break · 9:25–9:40 am');
    const mon = cell(el, 0, 1).querySelector('.slot') as HTMLButtonElement;
    expect(text(mon)).toBe('MathematicsRavi Kulkarni · clash');
    expect(mon.classList.contains('clash')).toBe(true);
    expect(text(cell(el, 0, 2))).toBe('ScienceSita Rao');
    expect(el.querySelectorAll('#tt-class .slot.empty')).toHaveLength(10);
    expect(text(el.querySelector('.cc-subleg'))).toBe('Mathematics 1Science 1');
    expect([...el.querySelectorAll('.kv dd')].map(text)).toEqual(['Ravi Kulkarni', '2', '2026-27']);

    (el.querySelector('#tt-clashes') as HTMLButtonElement).click();
    await settle();
    expect(text(el.querySelector('#tt-clashes'))).toBe('1 clash to resolve');
    const d = modal();
    expect(text(d)).toContain('Ravi KulkarniMonday · Period 1');
    expect(text(d)).toContain('Grade 7 A · Mathematics');
  });

  it('sets a period’s subject and teacher; a clash is shown under the teacher', async () => {
    const el = await open();
    (cell(el, 2, 1).querySelector('.slot.empty') as HTMLButtonElement).click();
    await settle();
    expect(text(modal().querySelector('.sh-t'))).toBe(
      'Grade 7 B · MondayPeriod 2 · 9:40 AM – 10:20 AM',
    );
    await pick('tt-s', 'Science');
    expect(text(modal().querySelector('#tt-t-b'))).toBe('Sita Rao');
    (modal().querySelector('#tt-save') as HTMLButtonElement).click();
    const put = await request((u) => u === '/api/v1/console/timetables/s-7b', 'PUT');
    expect(put.request.headers.get('If-Match')).toBe('"v11"');
    expect(put.request.body).toEqual({
      yearId: 'y-26',
      slots: [
        { day: 1, periodId: 'p-1', subjectId: 'sub-mat', teacherId: 't-ravi' },
        { day: 2, periodId: 'p-1', subjectId: 'sub-sci', teacherId: 't-sita' },
        { day: 1, periodId: 'p-2', subjectId: 'sub-sci', teacherId: 't-sita' },
      ],
    });
    put.flush(
      { code: 'ACA.TEACHER_CLASH', params: { name: 'Sita Rao', section: 'Grade 7 A' } },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expect(text(modal().querySelector('#tt-t-e'))).toBe(
      'Already teaching another class in this period',
    );
    expect(text(modal().querySelector('#tt-clash'))).toBe(
      'Clash — not saved. Sita Rao already teaches Grade 7 A in this period.',
    );

    (modal().querySelector('#tt-save') as HTMLButtonElement).click();
    const again = await request((u) => u === '/api/v1/console/timetables/s-7b', 'PUT');
    again.flush(
      timetable({
        slots: [...timetable().slots, { day: 1, periodId: 'p-2', subject: sci, teacher: sita }],
        version: 12,
      }),
    );
    (await request((u) => u === '/api/v1/console/timetables/clashes?yearId=y-26')).flush(clashes);
    await settle();
    expect(toasts()).toContain('Lesson added');
    expect(toasts()).toContain('Grade 7 B · Monday Period 2 · Science with Sita Rao');
    expect(text(cell(el, 2, 1))).toBe('ScienceSita Rao');
  });

  it('offers to assign a teacher when the subject has none', async () => {
    const el = await open();
    (cell(el, 2, 3).querySelector('.slot.empty') as HTMLButtonElement).click();
    await settle();
    const go = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await pick('tt-s', 'English');
    expect(text(modal())).toContain('No teacher is assigned to English for Grade 7 B.');
    ([...modal().querySelectorAll('button')] as HTMLButtonElement[])
      .find((b) => text(b) === 'Assign a teacher')!
      .click();
    await settle();
    expect(go).toHaveBeenCalledWith(['/console/teachers'], { queryParams: { tab: 'st' } });
  });

  it('clears a period after a confirmation', async () => {
    const el = await open();
    (cell(el, 0, 2).querySelector('.slot') as HTMLButtonElement).click();
    await settle();
    expect(text(modal())).toContain('Now: Science with Sita Rao');
    (modal().querySelector('#tt-clear') as HTMLButtonElement).click();
    await confirm();
    const put = await request((u) => u === '/api/v1/console/timetables/s-7b', 'PUT');
    expect((put.request.body as { slots: unknown[] }).slots).toEqual([
      { day: 1, periodId: 'p-1', subjectId: 'sub-mat', teacherId: 't-ravi' },
    ]);
  });

  it('shows a teacher’s week with free periods and clashes', async () => {
    const el = await open();
    ([...el.querySelectorAll('.seg button')] as HTMLButtonElement[])[1]!.click();
    await settle();
    const kpis = [...el.querySelectorAll('.kpi')].map((k) => text(k.querySelector('.k-v')));
    expect(kpis).toEqual(['3', '2', '10', '1']);
    expect(text(el.querySelector('.note.tone-brand'))).toContain(
      'Ravi Kulkarni is a class teacher and a subject teacher — one combined portal.',
    );
    const mon = [...el.querySelectorAll('#tt-teacher tbody tr')][0]!.querySelectorAll('td')[1]!;
    expect(mon.querySelectorAll('.slot.clash')).toHaveLength(2);
    expect(el.querySelectorAll('#tt-teacher .slot.free')).toHaveLength(10);
    (mon.querySelector('.slot') as HTMLButtonElement).click();
    await settle();
    expect(el.querySelector('#tt-class')).not.toBeNull();
  });

  it('the teacher view opens on the class teacher of the class-section in view', async () => {
    const el = await open(timetable(), { ...staff, items: [...staff.items].reverse() });
    serve({
      '/api/v1/console/timetables/clashes?yearId=y-26&teacherId=t-sita': {
        ...clashes,
        teacherWeek: [],
      },
    });
    ([...el.querySelectorAll('.seg button')] as HTMLButtonElement[])[1]!.click();
    await settle();
    serve({ '/api/v1/console/timetables/clashes?yearId=y-26&teacherId=t-ravi': week });
    await settle();
    expect(text(el.querySelector('#f-tch-b'))).toBe('Ravi Kulkarni');
    expect(text(el.querySelector('.kpi .k-v'))).toBe('3');
  });

  it('uploads timetables: whole weeks per class-section, then reads the week and clashes again', async () => {
    const el = await open();
    (el.querySelector('#tt-upload') as HTMLButtonElement).click();
    await settle();
    const m = modal();
    expect(text(m.querySelector('.sh-t'))).toContain('Upload timetables');
    expect(text(m)).toContain('a class-section with any problem is skipped whole');
    await saving(async (saved) => {
      (m.querySelector('#bu-template') as HTMLButtonElement).click();
      const t = await request(
        (u) => u === '/api/v1/console/timetables/uploads/template?yearId=y-26',
      );
      expect(t.request.responseType).toBe('blob');
      t.flush(new Blob(['class,section,day,period,subject,teacher,teacher_name\r\n']));
      for (let i = 0; i < 20 && !saved().length; i++) await tick();
      expect(saved()[0]?.download).toBe('campusone-timetable-2026-27.csv');
    });

    const input = m.querySelector('#bu-file') as HTMLInputElement;
    const file = new File(
      [
        'class,section,day,period,subject,teacher,teacher_name\nGrade 7,B,Monday,Period 1,MAT,TVPS-T-0101,\n',
      ],
      'weeks.csv',
      { type: 'text/csv' },
    );
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await settle();
    (m.querySelector('#bu-check') as HTMLButtonElement).click();
    const check = await request((u) => u === '/api/v1/console/timetables/uploads', 'POST');
    expect(check.request.headers.get('Idempotency-Key')).toBeTruthy();
    const form = check.request.body as FormData;
    expect([form.get('yearId'), form.get('commit'), form.get('kind')]).toEqual([
      'y-26',
      'false',
      null,
    ]);
    const report = {
      committed: false,
      year,
      accepted: 2,
      rejected: 2,
      sections: 1,
      skippedSections: 1,
      lessons: 1,
      rows: [
        sheetRow({}),
        sheetRow({
          row: 2,
          period: 'Period 2',
          subject: '',
          teacher: '',
          teacherName: null,
          outcome: 'FREE',
        }),
        sheetRow({
          row: 3,
          section: 'A',
          subject: 'SCI',
          teacher: 'TVPS-T-0102',
          teacherName: 'SITA RAO',
          accepted: false,
          outcome: null,
          code: 'ACA.TEACHER_CLASH',
          params: { name: 'Sita Rao', section: 'Grade 8 A' },
        }),
        sheetRow({
          row: 4,
          section: 'A',
          day: 'Tuesday',
          accepted: false,
          outcome: null,
          code: 'UPL.SECTION_SKIPPED',
          params: { section: 'Grade 7 A' },
        }),
      ],
    };
    check.flush(report);
    await settle();
    expect([...m.querySelectorAll('#bu-rows th')].map(text)).toEqual([
      'Row',
      'Class',
      'Section',
      'Day',
      'Period',
      'Lesson',
      'Result',
    ]);
    const rows = text(m.querySelector('#bu-rows'));
    expect(rows).toContain('1Grade 7BMondayPeriod 1MAT · Ravi KulkarniAccepted');
    expect(rows).toContain('2Grade 7BMondayPeriod 2—AcceptedFree period');
    expect(rows).toContain('Sita Rao already teaches Grade 8 A in this period.');
    expect(rows).toContain(
      'Not imported: another row of Grade 7 A has a problem, and a section’s week is imported whole.',
    );
    expect(text(m.querySelector('#bu-summary'))).toBe(
      '1 class-section · 1 lesson · 1 class-section skipped',
    );
    (m.querySelector('#bu-import') as HTMLButtonElement).click();
    const commit = await request((u) => u === '/api/v1/console/timetables/uploads', 'POST');
    expect((commit.request.body as FormData).get('commit')).toBe('true');
    commit.flush({ ...report, committed: true });
    await settle();
    serve({
      '/api/v1/console/timetables/s-7b?yearId=y-26': timetable(),
      '/api/v1/console/timetables/clashes?yearId=y-26': clashes,
      '/api/v1/console/timetables/clashes?yearId=y-26&teacherId=t-ravi': week,
    });
    await settle();
    expect(toasts()).toContain('2 rows imported');
    expect(document.querySelector('#bu-body')).toBeNull();
    expect(text(cell(el, 0, 2))).toBe('ScienceSita Rao');
    const ctl = TestBed.inject(HttpTestingController);
    expect(ctl.match((r) => r.url.includes('/timetables/'))).toHaveLength(0);
  });

  it('a closed year shows its week read-only', async () => {
    const el = await open();
    (el.querySelector('#tt-year-b') as HTMLButtonElement).click();
    await settle();
    ([...document.querySelectorAll('.dd-opt')] as HTMLButtonElement[])
      .find((b) => text(b).includes('2025-26'))!
      .click();
    await settle();
    serve({
      '/api/v1/console/timetables/s-7b?yearId=y-25': timetable({
        year: { ...year, id: 'y-25', label: '2025-26', closed: true, current: false },
      }),
      '/api/v1/console/timetables/clashes?yearId=y-25': { ...clashes, clashes: [] },
      '/api/v1/console/teacher-assignments?yearId=y-25': assignments,
      '/api/v1/console/timetables/clashes?yearId=y-25&teacherId=t-ravi': {
        ...week,
        teacherWeek: [],
      },
    });
    await settle();
    expect(text(document.querySelector('.c-yr-banner'))).toContain('2025-26, which is closed');
    expect((cell(el, 0, 1).querySelector('.slot') as HTMLButtonElement).disabled).toBe(true);
    expect((el.querySelector('#tt-upload') as HTMLButtonElement).disabled).toBe(true);
    expect(text(cell(el, 0, 3))).toBe('—');
    expect(text(el)).toContain('No teacher clashes');
  });
});
