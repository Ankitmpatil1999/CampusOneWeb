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
import { marksChip, marksOf } from './exam-format';
import type { AcademicReport, Exam, MarksStatus } from './exams.api';

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

const session = (subTasks: string[] = ['academics.view', 'academics.edit']) => ({
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'INSTITUTION_ADMIN', name: 'Institution Administrator', readOnly: false }],
  subTasks: ['home.view', 'task.home', 'task.academics', 'members.view', ...subTasks],
  preferredLang: 'en',
});
const years = {
  items: [
    {
      id: 'y-26',
      label: '2026-27',
      startsOn: '2026-04-01',
      endsOn: '2027-03-31',
      status: 'OPEN',
      current: true,
      version: 1,
    },
  ],
};
const year = {
  id: 'y-26',
  label: '2026-27',
  startsOn: '2026-04-01',
  endsOn: '2027-03-31',
  closed: false,
  current: true,
};
const classes = {
  year: { id: 'y-26', label: '2026-27' },
  items: [
    {
      id: 'c-7',
      name: 'Grade 7',
      order: 9,
      sections: [
        { id: 's-7a', name: 'A', capacity: null, students: 30 },
        { id: 's-7b', name: 'B', capacity: null, students: 30 },
      ],
      students: 60,
      version: 1,
    },
  ],
};
const subject = (id: string, code: string, name: string, colour: string) => ({
  id,
  code,
  name,
  colour,
});
const mat = subject('sub-mat', 'MAT', 'Mathematics', '#0C6F7D');
const sci = subject('sub-sci', 'SCI', 'Science', '#1F7A4D');
const eng = subject('sub-eng', 'ENG', 'English', '#2D5DA8');
const subjects = {
  year,
  items: [mat, sci, eng].map((s) => ({
    ...s,
    classes: 1,
    teachers: 1,
    periodsAWeek: 6,
    version: 1,
  })),
};
const names = {
  year,
  items: [
    { id: 'n-hy', name: 'Half-yearly', examsThisYear: 0, examsAllYears: 0 },
    { id: 'n-ut1', name: 'Unit Test 1', examsThisYear: 2, examsAllYears: 2 },
    { id: 'n-ut2', name: 'Unit Test 2', examsThisYear: 1, examsAllYears: 1 },
  ],
};
const exam = (over: Partial<Exam> & { id: string }): Exam => ({
  name: { id: 'n-ut1', name: 'Unit Test 1' },
  year: { id: 'y-26', label: '2026-27' },
  class: { id: 'c-7', name: 'Grade 7' },
  section: { id: 's-7b', name: 'B', label: 'Grade 7 B' },
  subject: mat,
  date: '2026-08-10',
  startTime: '09:30',
  endTime: '10:30',
  maxMarks: 50,
  passMarks: 18,
  schedule: 'Completed',
  marks: { students: 30, entered: 30, valid: 30, status: 'VALIDATED' },
  published: { at: '2026-08-20T06:30:00.000Z' },
  withdrawn: false,
  version: 4,
  ...over,
});
const e1 = exam({ id: 'e1' });
const e2 = exam({
  id: 'e2',
  subject: sci,
  date: '2026-08-11',
  published: null,
  marks: { students: 30, entered: 30, valid: 0, status: 'AWAITING_VALIDATION' },
});
const e3 = exam({
  id: 'e3',
  name: { id: 'n-ut2', name: 'Unit Test 2' },
  section: { id: 's-7a', name: 'A', label: 'Grade 7 A' },
  subject: eng,
  date: null,
  startTime: null,
  endTime: null,
  maxMarks: 25,
  passMarks: 9,
  schedule: 'Scheduled',
  published: null,
  marks: { students: 30, entered: 0, valid: 0, status: 'NOT_UPLOADED' },
  version: 3,
});
const list = { year, items: [e1, e2, e3] };
const assignments = {
  year,
  classTeachers: [],
  subjectTeachers: [
    {
      id: 'a-1',
      kind: 'SUBJECT_TEACHER',
      teacher: { id: 't-ravi', name: 'RAVI KULKARNI', combined: true },
      class: { id: 'c-7', name: 'Grade 7' },
      section: { id: 's-7b', name: 'B' },
      subject: mat,
      periodsAWeek: 6,
      since: null,
    },
  ],
  coordinators: [],
  combinedTeachers: 1,
};

describe('console exams and marks (ACA-034…041)', () => {
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
    const nav = harness.navigateByUrl('/console/exams');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    await settle();
    serve({
      '/api/v1/console/academic-years': years,
      '/api/v1/console/classes': classes,
    });
    await settle();
    serve({
      '/api/v1/console/exams?yearId=y-26': list,
      '/api/v1/console/exam-names?yearId=y-26': names,
    });
    await settle();
    serve({
      '/api/v1/console/subjects?yearId=y-26': subjects,
      '/api/v1/console/teacher-assignments?yearId=y-26': assignments,
    });
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  const sheet = () => [...document.querySelectorAll('.modal, .drawer')].at(-1) as HTMLElement;
  const rows = (el: HTMLElement, id: string) => [...el.querySelectorAll(`#${id} tbody tr`)];
  const tab = async (el: HTMLElement, label: string) => {
    ([...el.querySelectorAll('.tabs .tab')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith(label))!
      .click();
    await settle();
  };
  const type = async (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle(1);
  };
  const pick = async (root: ParentNode, id: string, label: string) => {
    (root.querySelector(`#${id}-b`) as HTMLButtonElement).click();
    await settle();
    ([...document.querySelectorAll('.dd-menu .dd-opt')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith(label))!
      .click();
    await settle();
  };
  const confirm = async () => {
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    const t = text(dlg);
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    await settle(2);
    return t;
  };

  it('turns report percentages back into marks and reads the marks progress', () => {
    expect(marksOf(98, 50)).toBe('49');
    expect(marksOf(97, 50)).toBe('48.5');
    expect(marksOf(64.4, 50, true)).toBe('32.2');
    expect(marksOf(null, 50)).toBe('—');
    expect(marksChip(e1).l).toBe('Validated');
    expect(marksChip(e2)).toMatchObject({ l: 'Awaiting validation', tone: 'info', n: 30 });
    expect(marksChip(e3).l).toBe('Not due');
    // Every saved mark Valid but a student enrolled later has none: still Validated, 29 of 30.
    expect(
      marksChip(
        exam({
          id: 'x',
          marks: { students: 30, entered: 29, valid: 29, status: 'AWAITING_VALIDATION' },
        }),
      ).l,
    ).toBe('Validated');
  });

  it('lists the year’s exams with their schedule and marks, filtered and searched', async () => {
    const el = await open();
    expect(text(el.querySelector('.c-ph h1'))).toBe('Exams & marks');
    expect(text(el.querySelector('#ex-tab-ex'))).toBe('Exams 3');
    expect(text(el.querySelector('#ex-tab-nm'))).toBe('Exam names 3');
    const r = rows(el, 'ex-table');
    expect(r).toHaveLength(3);
    expect(words(r[0])).toBe(
      'Unit Test 1 2026-27 Grade 7 B Mathematics 10 Aug 2026 9:30 AM – 10:30 AM 50 / 18 Published Validated 30 of 30 students',
    );
    expect(words(r[1])).toContain('Completed Awaiting validation 30 of 30 students');
    expect(words(r[2])).toBe(
      'Unit Test 2 2026-27 Grade 7 A English Date to be set 25 / 9 Scheduled Not due',
    );
    await pick(el, 'f-sub', 'Science');
    expect(rows(el, 'ex-table')).toHaveLength(1);
    expect(text(el.querySelector('.fsum'))).toBe('1 exam');
    await type(el.querySelector('#ex-q') as HTMLInputElement, 'zzz');
    expect(text(el.querySelector('#ex-table .empty'))).toContain('No exams in 2026-27 match');
  });

  it('creates an exam after checking the form (ACA-035)', async () => {
    const el = await open();
    (el.querySelector('#ex-new') as HTMLButtonElement).click();
    await settle();
    const d = sheet();
    expect(text(d.querySelector('.sh-t'))).toBe(
      'Create an exam2026-27 · one exam per name, class-section and subject',
    );
    expect(text(d.querySelector('#xe-n-b'))).toBe('Half-yearly');
    (d.querySelector('#xe-save') as HTMLButtonElement).click();
    await settle();
    const required = translate('VALIDATION.REQUIRED');
    expect(text(d.querySelector('#xe-k-e'))).toBe(required);
    expect(text(d.querySelector('#xe-s-e'))).toBe(required);
    expect(text(d.querySelector('#xe-d-e'))).toBe(required);

    await pick(d, 'xe-k', 'Grade 7 A');
    (await request((u) => u === '/api/v1/console/classes/c-7/subjects')).flush({
      class: { id: 'c-7', name: 'Grade 7' },
      subjects: [{ id: 'sub-eng', code: 'ENG', name: 'English' }],
      version: 2,
    });
    await settle();
    await pick(d, 'xe-s', 'English');
    await type(d.querySelector('#xe-d') as HTMLInputElement, '2026-10-12');
    await type(d.querySelector('#xe-pass') as HTMLInputElement, '120');
    (d.querySelector('#xe-save') as HTMLButtonElement).click();
    await settle();
    expect(text(d.querySelector('#xe-pass-e'))).toBe(translate('ACA.EXAM_MARKS_RANGE'));
    await type(d.querySelector('#xe-pass') as HTMLInputElement, '35');
    (d.querySelector('#xe-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/exams', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      yearId: 'y-26',
      examNameId: 'n-hy',
      sectionIds: ['s-7a'],
      items: [
        {
          subjectId: 'sub-eng',
          date: '2026-10-12',
          startTime: '09:30',
          endTime: '12:30',
          maxMarks: 100,
          passMarks: 35,
        },
      ],
    });
    post.flush({
      created: 1,
      items: [
        exam({
          id: 'e9',
          name: { id: 'n-hy', name: 'Half-yearly' },
          section: { id: 's-7a', name: 'A', label: 'Grade 7 A' },
          subject: eng,
          date: '2026-10-12',
        }),
      ],
    });
    await settle();
    expect(toasts()).toContain('Exam created');
    expect(toasts()).toContain('Half-yearly · Grade 7 A · English · 12 Oct 2026');
    await request((u) => u === '/api/v1/console/exams?yearId=y-26');
  });

  it('changes an exam’s date and marks, and withdraws one without marks (ACA-036)', async () => {
    const el = await open();
    (rows(el, 'ex-table')[2] as HTMLElement).click();
    await settle();
    const d = sheet();
    expect(text(d.querySelector('#ex-kv'))).toContain('Date to be set');
    (d.querySelector('#ex-edit') as HTMLButtonElement).click();
    await settle();
    await type(d.querySelector('#ex-d') as HTMLInputElement, '2026-12-07');
    await type(d.querySelector('#ex-st') as HTMLInputElement, '10:00');
    await type(d.querySelector('#ex-et') as HTMLInputElement, '09:00');
    (d.querySelector('#ex-save') as HTMLButtonElement).click();
    await settle();
    expect(text(d.querySelector('#ex-et-e'))).toBe(translate('ACA.CAL_TIMES'));
    await type(d.querySelector('#ex-et') as HTMLInputElement, '11:00');
    (d.querySelector('#ex-save') as HTMLButtonElement).click();
    const patch = await request((u) => u === '/api/v1/console/exams/e3', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v3"');
    expect(patch.request.body).toEqual({
      date: '2026-12-07',
      startTime: '10:00',
      endTime: '11:00',
      maxMarks: 25,
      passMarks: 9,
    });
    patch.flush(
      exam({ ...e3, date: '2026-12-07', startTime: '10:00', endTime: '11:00', version: 4 }),
    );
    await settle();
    expect(toasts()).toContain('Exam updated');
    (await request((u) => u === '/api/v1/console/exams?yearId=y-26')).flush({
      year,
      items: [e1, e2, { ...e3, date: '2026-12-07', schedule: 'Upcoming', version: 4 }],
    });
    serve({ '/api/v1/console/exam-names?yearId=y-26': names });
    await settle();
    expect(text(sheet().querySelector('#ex-kv'))).toContain('Monday, 7 December 2026');

    (sheet().querySelector('#ex-withdraw') as HTMLButtonElement).click();
    expect(await confirm()).toContain('Withdraw Unit Test 2 English for Grade 7 A?');
    const w = await request((u) => u === '/api/v1/console/exams/e3', 'PATCH');
    expect(w.request.headers.get('If-Match')).toBe('"v4"');
    expect(w.request.body).toEqual({ withdraw: true });
    w.flush({ ...e3, withdrawn: true, version: 5 });
    await settle();
    expect(toasts()).toContain('Exam withdrawn');
    expect(document.querySelector('.drawer #ex-kv')).toBeNull();
  });

  it('shows an exam with marks: marks fixed, validation from the drawer (ACA-040)', async () => {
    const el = await open();
    (rows(el, 'ex-table')[1] as HTMLElement).click();
    await settle();
    const d = sheet();
    expect(words(d.querySelector('#ex-kv'))).toContain('Subject teachers None assigned');
    expect(d.querySelector('#ex-withdraw')).toBeNull();
    (d.querySelector('#ex-validate') as HTMLButtonElement).click();
    expect(await confirm()).toContain('30 marks become Valid');
    const v = await request((u) => u === '/api/v1/console/exams/e2/marks-validation', 'POST');
    expect(v.request.headers.get('Idempotency-Key')).toBeTruthy();
    v.flush({ ...e2, marks: { ...e2.marks, valid: 30, status: 'VALIDATED' } });
    await settle();
    expect(toasts()).toContain('Marks validated');
  });

  it('validates an exam name’s marks for a class-section from Marks status (ACA-039/040)', async () => {
    const el = await open();
    await tab(el, 'Marks status');
    const status: MarksStatus = {
      year,
      items: [
        {
          key: 'n-ut1|s-7b',
          examName: 'Unit Test 1',
          section: 'Grade 7 B',
          firstDate: '2026-08-10',
          exams: 2,
          due: 2,
          uploaded: 2,
          validated: 1,
          awaiting: 1,
          missing: 0,
          examIds: ['e1', 'e2'],
        },
      ],
    };
    (await request((u) => u === '/api/v1/console/marks-status?yearId=y-26&scope=due')).flush(
      status,
    );
    await settle();
    const r = rows(el, 'ms-table');
    expect(words(r[0])).toBe(
      'Unit Test 1 10 Aug 2026 Grade 7 B 2/2 1 1 awaiting validation Validate',
    );
    (r[0]!.querySelector('button') as HTMLButtonElement).click();
    expect(await confirm()).toContain(
      'Validate Unit Test 1 marks for Grade 7 B? 30 marks across 1 subject become Valid',
    );
    (await request((u) => u === '/api/v1/console/exams/e2/marks-validation', 'POST')).flush(e2);
    await settle();
    expect(toasts()).toContain('Marks validated');
    expect(toasts()).toContain('Unit Test 1 · Grade 7 B · 30 marks');
  });

  it('reports one exam name in one class-section from the server’s figures (ACA-041)', async () => {
    const el = await open();
    await tab(el, 'Academic report');
    const report: AcademicReport = {
      year,
      includesPending: false,
      pendingMarks: 30,
      classAverage: 61.6,
      passedEverySubject: 1,
      students: [
        { id: 'st-1', name: 'AARAV HEGDE', percentage: 82, failedSubjects: 0 },
        { id: 'st-2', name: 'DIYA KAMATH', percentage: 41.2, failedSubjects: 1 },
      ],
      subjects: [
        {
          subject: { id: 'sub-mat', name: 'Mathematics', colour: '#0C6F7D' },
          students: 30,
          absent: 0,
          highest: 98,
          lowest: 28,
          average: 64.4,
          passed: 27,
          failed: 3,
          passRate: 90,
          top: { id: 'st-1', name: 'AARAV HEGDE' },
        },
      ],
    };
    const get = await request((u) => u.startsWith('/api/v1/console/academic-reports'));
    expect(get.request.urlWithParams).toBe(
      '/api/v1/console/academic-reports?yearId=y-26&examNameId=n-ut1&sectionId=s-7b',
    );
    get.flush(report);
    await settle();
    (await request((u) => u === '/api/v1/console/enrolments?yearId=y-26')).flush({
      year,
      total: 1,
      items: [
        {
          id: 'en-1',
          student: {
            id: 'st-1',
            name: 'Aarav Hegde',
            admissionNo: 'TVPS/2019/0412',
            status: 'ACTIVE',
          },
          class: { id: 'c-7', name: 'Grade 7' },
          section: { id: 's-7b', name: 'B' },
          enrolledOn: '2026-06-01',
          outcome: null,
          moves: 0,
          correctionPending: null,
        },
      ],
      nextCursor: null,
    });
    await settle();
    const kpis = [...el.querySelectorAll('#rp-kpis .kpi')].map(words);
    expect(kpis).toEqual([
      'Class average 61.6%',
      'Passed every subject 1/2 50% of students',
      'Top of the class Aarav 82.0%',
      'Subjects reported 1/2 30 marks awaiting validation',
    ]);
    expect(words(rows(el, 'rp-table')[0])).toBe('Mathematics 30 49 /50 32.2 14 27 3 90%');
    expect(words(el.querySelector('.list.plain'))).toBe(
      '1 Aarav Hegde TVPS/2019/0412 82.0% 2 Diya Kamath 1 subject below pass marks 41.2%',
    );
    (el.querySelector('#f-rinc') as HTMLInputElement).click();
    await settle();
    expect(
      (await request((u) => u.startsWith('/api/v1/console/academic-reports'))).request
        .urlWithParams,
    ).toBe(
      '/api/v1/console/academic-reports?yearId=y-26&examNameId=n-ut1&sectionId=s-7b&includePending=true',
    );
  });

  it('adds an exam name, refusing a duplicate (ACA-037/038)', async () => {
    const el = await open();
    await tab(el, 'Exam names');
    expect(rows(el, 'exn-table').map(words)).toEqual([
      'Half-yearly 0 0',
      'Unit Test 1 2 2',
      'Unit Test 2 1 1',
    ]);
    (el.querySelector('#exn-new') as HTMLButtonElement).click();
    await settle();
    const m = sheet();
    await type(m.querySelector('#en-n') as HTMLInputElement, 'unit test 1');
    (m.querySelector('#en-save') as HTMLButtonElement).click();
    await settle();
    expect(text(m.querySelector('#en-n-e'))).toBe(
      translate('ACA.EXAM_NAME_TAKEN', { name: 'unit test 1' }),
    );
    await type(m.querySelector('#en-n') as HTMLInputElement, 'Annual');
    (m.querySelector('#en-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/exam-names', 'POST');
    expect(post.request.body).toEqual({ name: 'Annual' });
    post.flush({ id: 'n-an', name: 'Annual', examsThisYear: 0, examsAllYears: 0 });
    await settle();
    expect(toasts()).toContain('Exam name added');
    await request((u) => u === '/api/v1/console/exam-names?yearId=y-26');
  });

  it('is refused without the academics task', async () => {
    const el = await open(session([]));
    expect(text(el.querySelector('.empty'))).toContain("You don't have access to this page");
    expect(el.querySelector('#ex-new')).toBeNull();
  });
});
