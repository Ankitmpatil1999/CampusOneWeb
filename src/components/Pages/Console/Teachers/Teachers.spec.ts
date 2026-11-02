import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { filter, firstValueFrom } from 'rxjs';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import type { Assignment, AssignmentList } from './teachers.api';

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

/** A row of the teacher sheet's report (client 2026-10-21). */
const sheetRow = (over: object) => ({
  row: 1,
  className: 'Grade 7',
  sections: 'A',
  subject: null,
  teacher: 'TVPS-T-0102',
  teacherName: 'SITA RAO',
  accepted: true,
  outcome: 'NEW',
  code: null,
  params: {},
  ...over,
});

const session = (over: object = {}) => ({
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  // The Academic Coordinator: academics, without the member directory (client 2026-10-13).
  roles: [{ code: 'ACADEMIC_COORDINATOR', name: 'Academic Coordinator', readOnly: false }],
  subTasks: ['home.view', 'task.home', 'task.academics', 'academics.view', 'academics.edit'],
  preferredLang: 'en',
  ...over,
});
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
    {
      id: 'c-8',
      name: 'Grade 8',
      order: 8,
      sections: [{ id: 's-8a', name: 'A', capacity: null, students: 30 }],
      students: 30,
      version: 1,
    },
  ],
};
const subjects = {
  year: { id: 'y-26', label: '2026-27' },
  items: [
    {
      id: 'sub-mat',
      code: 'MAT',
      name: 'Mathematics',
      colour: '#1F7A4D',
      classes: 2,
      teachers: 1,
      periodsAWeek: 6,
      version: 1,
    },
    {
      id: 'sub-sci',
      code: 'SCI',
      name: 'Science',
      colour: '#2D5DA8',
      classes: 2,
      teachers: 0,
      periodsAWeek: 0,
      version: 1,
    },
  ],
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
const ravi = { id: 't-ravi', name: 'RAVI KULKARNI', combined: true };
const sita = { id: 't-sita', name: 'SITA RAO', combined: false };
const a = (over: Partial<Assignment>): Assignment => ({
  id: 'a-x',
  kind: 'SUBJECT_TEACHER',
  teacher: ravi,
  class: { id: 'c-7', name: 'Grade 7' },
  section: { id: 's-7b', name: 'B' },
  subject: { id: 'sub-mat', code: 'MAT', name: 'Mathematics' },
  periodsAWeek: 6,
  since: null,
  ...over,
});
const ctRavi = a({ id: 'a-ct', kind: 'CLASS_TEACHER', subject: null, periodsAWeek: 0 });
const stRavi = a({ id: 'a-st' });
const stSita = a({
  id: 'a-st2',
  teacher: sita,
  section: { id: 's-8a', name: 'A' },
  class: { id: 'c-8', name: 'Grade 8' },
  subject: { id: 'sub-sci', code: 'SCI', name: 'Science' },
  periodsAWeek: 0,
});
const coSita = a({
  id: 'a-co',
  kind: 'COORDINATOR',
  teacher: sita,
  section: null,
  subject: null,
  periodsAWeek: 0,
});
const list = (over: Partial<AssignmentList> = {}): AssignmentList => ({
  year: {
    id: 'y-26',
    label: '2026-27',
    startsOn: '2026-06-01',
    endsOn: '2027-03-31',
    closed: false,
    current: true,
  },
  classTeachers: [
    { section: { id: 's-7a', name: 'A' }, class: { id: 'c-7', name: 'Grade 7' }, assignment: null },
    {
      section: { id: 's-7b', name: 'B' },
      class: { id: 'c-7', name: 'Grade 7' },
      assignment: ctRavi,
    },
    { section: { id: 's-8a', name: 'A' }, class: { id: 'c-8', name: 'Grade 8' }, assignment: null },
  ],
  subjectTeachers: [stRavi, stSita],
  coordinators: [coSita],
  combinedTeachers: 1,
  ...over,
});

describe('console teacher assignments (ACA-021…023)', () => {
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

  async function open(l: AssignmentList = list(), url = '/console/teachers') {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl(url);
    (await request((u) => u === '/api/v1/console/session')).flush(session());
    await nav;
    await settle();
    serve({
      '/api/v1/console/academic-years': years,
      '/api/v1/console/classes': classes,
      '/api/v1/console/subjects': subjects,
      '/api/v1/console/teachers': staff,
    });
    (await request((u) => u === '/api/v1/console/teacher-assignments?yearId=y-26')).flush(l);
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  const modal = () => [...document.querySelectorAll('.modal, .drawer')].at(-1) as HTMLElement;
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
  const tab = async (el: HTMLElement, label: string) => {
    ([...el.querySelectorAll('.tab')] as HTMLButtonElement[])
      .find((t) => text(t).startsWith(label))!
      .click();
    await settle();
  };
  const choose = async (m: HTMLElement, csv: string) => {
    const input = m.querySelector('#bu-file') as HTMLInputElement;
    const file = new File([csv], 'sheet.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await settle();
  };
  const uploads = (method = 'POST') =>
    request((u) => u === '/api/v1/console/teacher-assignments/uploads', method);

  it('lists every class-section with its class teacher and the combined portal (CR-02)', async () => {
    const el = await open();
    expect(text(el.querySelector('.c-ph p'))).toBe(
      'Class teachers, subject teachers and coordinators for 2026-27',
    );
    expect(text(el.querySelector('#tc-cr02'))).toContain(
      '1 teacher holds both a class-teacher and a subject-teacher assignment in 2026-27 — for example Ravi Kulkarni.',
    );
    expect([...el.querySelectorAll('.tab')].map(text)).toEqual([
      'Class teachers1',
      'Subject teachers2',
      'Coordinators1',
    ]);
    const rows = [...el.querySelectorAll('#ct-table tbody tr')];
    expect(rows.map((r) => text(r.querySelector('td')))).toEqual([
      'Grade 7 A31 students',
      'Grade 7 B29 students',
      'Grade 8 A30 students',
    ]);
    expect(text(rows[0])).toContain('Not assigned');
    expect(text(rows[1])).toContain('Ravi Kulkarni');
    expect(text(rows[1])).toContain('TVPS-T-0101');
    expect(text(rows[1])).toContain('Mathematics');
    expect(text(rows[1])).toContain('Combined');
    ([...el.querySelectorAll('.pill')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith('No class teacher'))!
      .click();
    await settle();
    expect(el.querySelectorAll('#ct-table tbody tr')).toHaveLength(2);
  });

  // 2026-10-13: the Co-ordinator's teacher lists said "No active teachers yet".
  it('offers the active teachers to the Academic Coordinator, without the member directory', async () => {
    const el = await open();
    (el.querySelector('#tc-new') as HTMLButtonElement).click();
    await settle();
    (modal().querySelector('#ct-t-b') as HTMLButtonElement).click();
    await settle();
    const options = () => [...document.querySelectorAll('.dd-menu .dd-opt')].map(text);
    // Ravi already leads Grade 7 B: one class per class teacher (client 2026-10-14).
    expect(options()).toEqual([expect.stringContaining('Sita Rao')]);
    expect(text(document.querySelector('.dd-menu'))).not.toContain('No active teachers yet');
    expect(text(modal().querySelector('#ct-one-class'))).toContain(
      'A teacher can be the class teacher of one class only',
    );
    (modal().querySelector('#ct-t-b') as HTMLButtonElement).click();
    await settle();
    // For his own class he is offered again.
    await pick('ct-k', 'Grade 7 B');
    (modal().querySelector('#ct-t-b') as HTMLButtonElement).click();
    await settle();
    expect(options()).toEqual([
      expect.stringContaining('Ravi Kulkarni'),
      expect.stringContaining('Sita Rao'),
    ]);
    const ctl = TestBed.inject(HttpTestingController);
    expect(ctl.match((r) => r.url.startsWith('/api/v1/console/members'))).toHaveLength(0);
  });

  it('assigns a class teacher; a taken class-section is refused with the register text', async () => {
    const el = await open();
    (el.querySelector('#tc-new') as HTMLButtonElement).click();
    await settle();
    expect(text(modal().querySelector('.sh-t'))).toContain('Assign a class teacher');
    await pick('ct-k', 'Grade 7 B');
    await pick('ct-t', 'Sita Rao');
    (modal().querySelector('#ct-save') as HTMLButtonElement).click();
    await settle();
    expect(text(modal())).toContain(
      'Grade 7 B already has a class teacher for 2026-27 (Ravi Kulkarni).',
    );
    await pick('ct-k', 'Grade 7 A');
    (modal().querySelector('#ct-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/teacher-assignments', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      yearId: 'y-26',
      kind: 'CLASS_TEACHER',
      teacherId: 't-sita',
      sectionIds: ['s-7a'],
      replace: false,
    });
    const ctSita = a({
      id: 'a-ct2',
      kind: 'CLASS_TEACHER',
      teacher: { ...sita, combined: true },
      section: { id: 's-7a', name: 'A' },
      subject: null,
    });
    post.flush({
      ...list({
        classTeachers: [
          {
            section: { id: 's-7a', name: 'A' },
            class: { id: 'c-7', name: 'Grade 7' },
            assignment: ctSita,
          },
          ...list().classTeachers.slice(1),
        ],
      }),
      created: 1,
    });
    await settle();
    expect(toasts()).toContain('Class teacher assigned');
    expect(toasts()).toContain('Sita Rao · Grade 7 A · combined portal');
    expect(text(el.querySelector('#ct-table tbody tr'))).toContain('Sita Rao');
  });

  it('changes a class teacher (replacing the old one) and removes one after a confirmation', async () => {
    const el = await open();
    const row = [...el.querySelectorAll('#ct-table tbody tr')][1]!;
    ([...row.querySelectorAll('button')] as HTMLButtonElement[])
      .find((b) => text(b) === 'Change')!
      .click();
    await settle();
    expect(text(modal())).toContain(
      'Currently Ravi Kulkarni. Saving replaces them for the rest of 2026-27.',
    );
    await pick('ct-t', 'Sita Rao');
    (modal().querySelector('#ct-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/teacher-assignments', 'POST');
    expect(post.request.body).toMatchObject({
      sectionIds: ['s-7b'],
      teacherId: 't-sita',
      replace: true,
    });
    post.flush({ ...list(), created: 1 });
    await settle();

    (
      [
        ...[...el.querySelectorAll('#ct-table tbody tr')][1]!.querySelectorAll('button'),
      ] as HTMLButtonElement[]
    )
      .find((b) => text(b) === 'Change')!
      .click();
    await settle();
    (modal().querySelector('#ct-remove') as HTMLButtonElement).click();
    await confirm();
    (await request((u) => u === '/api/v1/console/teacher-assignments/a-ct', 'DELETE')).flush(
      list(),
    );
    await settle();
    expect(toasts()).toContain('Class teacher removed');
  });

  it('assigns a subject teacher to class-sections; a refusal saves nothing', async () => {
    const el = await open(list(), '/console/teachers?tab=st');
    expect(text(el.querySelector('.fsum'))).toBe('2 assignments');
    const rows = [...el.querySelectorAll('#st-table tbody tr')].map(text);
    expect(rows[0]).toContain('Ravi Kulkarni');
    expect(rows[0]).toContain('Grade 7 B');
    expect(rows[0]).toContain('Combined');
    (el.querySelector('#tc-new') as HTMLButtonElement).click();
    await settle();
    (modal().querySelector('#as-save') as HTMLButtonElement).click();
    await settle();
    expect(text(modal())).toContain('Choose at least one class-section');
    await pick('as-t', 'Sita Rao');
    await pick('as-s', 'Science');
    ([...modal().querySelectorAll('#as-sections input')] as HTMLInputElement[])[0]!.click();
    ([...modal().querySelectorAll('#as-sections input')] as HTMLInputElement[])[2]!.click();
    await settle();
    (modal().querySelector('#as-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/teacher-assignments', 'POST');
    expect(post.request.body).toEqual({
      yearId: 'y-26',
      kind: 'SUBJECT_TEACHER',
      teacherId: 't-sita',
      subjectId: 'sub-sci',
      sectionIds: ['s-7a', 's-8a'],
    });
    post.flush(
      { code: 'ACA.SUBJECT_NOT_MAPPED', params: { subject: 'Science', class: 'Grade 7' } },
      { status: 422, statusText: 'Unprocessable' },
    );
    await settle();
    expect(text(modal())).toContain('Nothing was saved.');
    expect(text(modal())).toContain('Science isn’t mapped to Grade 7. Map it first.');
  });

  it('removes a subject assignment, unless it is still on the timetable', async () => {
    const el = await open(list(), '/console/teachers?tab=st');
    const remove = (n: number) =>
      (
        [...el.querySelectorAll('#st-table tbody tr')][n]!.querySelector(
          'button.iconbtn',
        ) as HTMLButtonElement
      ).click();
    remove(0);
    await settle();
    const dlg = modal();
    expect(text(dlg)).toContain('Assignment is on the timetable');
    expect(text(dlg)).toContain('Ravi Kulkarni has 6 Mathematics periods in Grade 7 B.');
    const router = TestBed.inject(Router);
    // The timetable page is lazy-loaded: wait for the navigation, not a fixed number of ticks.
    const done = firstValueFrom(router.events.pipe(filter((e) => e instanceof NavigationEnd)));
    ([...dlg.querySelectorAll('button')] as HTMLButtonElement[])
      .find((b) => text(b) === 'Open timetable')!
      .click();
    await done;
    expect(router.url).toBe('/console/timetable?section=s-7b');
  });

  it('removes a subject assignment that is not on the timetable after a confirmation', async () => {
    const el2 = await open(list(), '/console/teachers?tab=st');
    (
      [...el2.querySelectorAll('#st-table tbody tr')][1]!.querySelector(
        'button.iconbtn',
      ) as HTMLButtonElement
    ).click();
    await confirm();
    (await request((u) => u === '/api/v1/console/teacher-assignments/a-st2', 'DELETE')).flush(
      list({ subjectTeachers: [stRavi] }),
    );
    await settle();
    expect(toasts()).toContain('Assignment removed');
    expect(el2.querySelectorAll('#st-table tbody tr')).toHaveLength(1);
  });

  it('allocates a coordinator’s classes: adds new ones and withdraws unticked ones', async () => {
    const el = await open();
    expect(el.querySelector('#tc-cr02')).not.toBeNull();
    await tab(el, 'Coordinators');
    expect(el.querySelector('#tc-cr02')).toBeNull();
    const row = el.querySelector('#co-table tbody tr') as HTMLElement;
    expect(text(row)).toContain('Sita Rao');
    expect(text(row)).toContain('Grade 7');
    expect([...row.querySelectorAll('td.r')].map(text)).toEqual(['2', '60']);
    row.click();
    await settle();
    const boxes = () => [...modal().querySelectorAll('#co-classes input')] as HTMLInputElement[];
    expect(boxes().map((b) => b.checked)).toEqual([true, false]);
    boxes()[0]!.click();
    boxes()[1]!.click();
    await settle();
    (modal().querySelector('#co-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/teacher-assignments', 'POST');
    expect(post.request.body).toEqual({
      yearId: 'y-26',
      kind: 'COORDINATOR',
      teacherId: 't-sita',
      classIds: ['c-8'],
    });
    post.flush({ ...list(), created: 1 });
    const del = await request((u) => u === '/api/v1/console/teacher-assignments/a-co', 'DELETE');
    del.flush(list({ coordinators: [] }));
    await settle();
    expect(toasts()).toContain('Coordinator allocation saved');
    expect(toasts()).toContain('Sita Rao · 1 class');
  });

  it('uploads the class-teacher sheet: the year’s template, a check with replace, the import', async () => {
    const el = await open();
    const btn = el.querySelector('#tc-upload') as HTMLButtonElement;
    expect(text(btn)).toBe('Upload class teachers');
    btn.click();
    await settle();
    const m = modal();
    expect(text(m.querySelector('.sh-t'))).toContain('Upload class teachers');
    expect(text(m)).toContain(
      'Columns: class, section, teacher (employee ID or mobile number), teacher name.',
    );
    await saving(async (saved) => {
      (m.querySelector('#bu-template') as HTMLButtonElement).click();
      const t = await request(
        (u) =>
          u ===
          '/api/v1/console/teacher-assignments/uploads/template?kind=CLASS_TEACHER&yearId=y-26',
      );
      expect(t.request.responseType).toBe('blob');
      t.flush(new Blob(['class,section,teacher,teacher_name\r\n'], { type: 'text/csv' }));
      for (let i = 0; i < 20 && !saved().length; i++) await tick();
      expect(saved()[0]?.download).toBe('campusone-class-teachers-2026-27.csv');
    });

    await choose(m, 'class,section,teacher,teacher_name\nGrade 7,A,TVPS-T-0102,\n');
    (m.querySelector('#tc-replace') as HTMLInputElement).click();
    await settle();
    (m.querySelector('#bu-check') as HTMLButtonElement).click();
    const check = await uploads();
    expect(check.request.headers.get('Idempotency-Key')).toBeTruthy();
    const form = check.request.body as FormData;
    expect([form.get('kind'), form.get('yearId'), form.get('replace'), form.get('commit')]).toEqual(
      ['CLASS_TEACHER', 'y-26', 'true', 'false'],
    );
    expect((form.get('file') as File).name).toBe('sheet.csv');
    const report = {
      committed: false,
      kind: 'CLASS_TEACHER',
      year: list().year,
      accepted: 3,
      rejected: 1,
      created: 1,
      replaced: 1,
      unchanged: 1,
      rows: [
        sheetRow({}),
        sheetRow({
          row: 2,
          sections: 'B',
          teacher: '9845012345',
          teacherName: 'ANITA NAIK',
          outcome: 'REPLACE',
        }),
        sheetRow({
          row: 3,
          className: 'Grade 8',
          teacher: '',
          teacherName: null,
          outcome: 'UNCHANGED',
        }),
        sheetRow({
          row: 4,
          className: 'Grade 9',
          teacher: 'EMP-9',
          teacherName: null,
          accepted: false,
          outcome: null,
          code: 'UPL.TEACHER_UNKNOWN',
          params: { t: 'EMP-9' },
        }),
      ],
    };
    check.flush(report);
    await settle();
    const rows = text(m.querySelector('#bu-rows'));
    expect(rows).toContain('1Grade 7ASita RaoAccepted');
    expect(rows).toContain('2Grade 7BAnita NaikAcceptedReplaces the current class teacher');
    expect(rows).toContain('3Grade 8A—AcceptedNo change');
    expect(rows).toContain('No teacher has the employee ID or mobile number “EMP-9”.');
    expect(text(m.querySelector('#bu-summary'))).toBe(
      '1 new assignment · 1 class teacher replaced · 1 unchanged',
    );

    // The check ran with "replace": changing it asks for a new check.
    (m.querySelector('#tc-replace') as HTMLInputElement).click();
    await settle();
    expect(m.querySelector('#bu-report')).toBeNull();
    (m.querySelector('#tc-replace') as HTMLInputElement).click();
    await settle();
    (m.querySelector('#bu-check') as HTMLButtonElement).click();
    (await uploads()).flush(report);
    await settle();
    expect(text(m.querySelector('#bu-import'))).toBe('Import 3 rows');
    (m.querySelector('#bu-import') as HTMLButtonElement).click();
    const commit = await uploads();
    const sent = commit.request.body as FormData;
    expect([sent.get('commit'), sent.get('replace')]).toEqual(['true', 'true']);
    commit.flush({ ...report, committed: true });
    (await request((u) => u === '/api/v1/console/teacher-assignments?yearId=y-26')).flush(list());
    await settle();
    expect(toasts()).toContain('3 rows imported');
    expect(document.querySelector('#bu-body')).toBeNull();
  });

  it('offers the subject-teacher sheet on its tab, and no sheet for coordinators', async () => {
    const el = await open(list(), '/console/teachers?tab=st');
    const btn = el.querySelector('#tc-upload') as HTMLButtonElement;
    expect(text(btn)).toBe('Upload subject teachers');
    btn.click();
    await settle();
    const m = modal();
    expect(text(m.querySelector('.sh-t'))).toContain('Upload subject teachers');
    expect(m.querySelector('#tc-replace')).toBeNull();
    await choose(
      m,
      'class,sections,subject,teacher,teacher_name\nGrade 7,"A, B",SCI,TVPS-T-0102,\n',
    );
    (m.querySelector('#bu-check') as HTMLButtonElement).click();
    const check = await uploads();
    const form = check.request.body as FormData;
    expect([form.get('kind'), form.get('replace'), form.get('commit')]).toEqual([
      'SUBJECT_TEACHER',
      null,
      'false',
    ]);
    check.flush({
      committed: false,
      kind: 'SUBJECT_TEACHER',
      year: list().year,
      accepted: 1,
      rejected: 1,
      created: 2,
      replaced: 0,
      unchanged: 0,
      rows: [
        sheetRow({ sections: 'A, B', subject: 'SCI' }),
        sheetRow({
          row: 2,
          className: 'Grade 8',
          subject: 'Art',
          teacher: 'TVPS-T-0101',
          teacherName: 'RAVI KULKARNI',
          accepted: false,
          outcome: null,
          code: 'ACA.SUBJECT_NOT_MAPPED',
          params: { subject: 'Art', class: 'Grade 8' },
        }),
      ],
    });
    await settle();
    expect([...m.querySelectorAll('#bu-rows th')].map(text)).toEqual([
      'Row',
      'Class',
      'Sections',
      'Subject',
      'Teacher',
      'Result',
    ]);
    expect(text(m.querySelector('#bu-rows'))).toContain('1Grade 7A, BSCISita RaoAccepted');
    expect(text(m.querySelector('#bu-rows'))).toContain(
      'Art isn’t mapped to Grade 8. Map it first.',
    );
    expect(text(m.querySelector('#bu-summary'))).toBe('2 new assignments');
    ([...m.querySelectorAll('.cc-foot button')] as HTMLButtonElement[])
      .find((b) => text(b) === 'Cancel')!
      .click();
    await settle();
    expect(document.querySelector('#bu-body')).toBeNull();
    await tab(el, 'Coordinators');
    expect(el.querySelector('#tc-upload')).toBeNull();
    expect(text(el.querySelector('#tc-new'))).toBe('Allocate coordinator');
  });

  it('copies an earlier year’s class teachers into an empty year', async () => {
    const empty = list({
      classTeachers: list().classTeachers.map((r) => ({ ...r, assignment: null })),
      subjectTeachers: [],
      coordinators: [],
      combinedTeachers: 0,
    });
    const el = await open(empty);
    (el.querySelector('#tc-copy') as HTMLButtonElement).click();
    await confirm();
    const post = await request((u) => u === '/api/v1/console/teacher-assignments', 'POST');
    expect(post.request.body).toEqual({
      yearId: 'y-26',
      kind: 'CLASS_TEACHER',
      copyFromYearId: 'y-25',
    });
    post.flush({ ...list(), created: 1 });
    await settle();
    expect(toasts()).toContain('Assignments copied');
  });
});
