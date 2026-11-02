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
import { minutesOf, t12, tRange } from './academic-format';

const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const toasts = () => text(document.querySelector('.toasts'));

async function request(url: string, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
    const found = ctl.match((r) => r.urlWithParams === url && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} ${url}`);
}

function serve(routes: Readonly<Record<string, unknown>>) {
  const ctl = TestBed.inject(HttpTestingController);
  const hit = (r: { method: string; url: string }) => r.method === 'GET' && r.url in routes;
  for (const r of ctl.match(hit) as TestRequest[]) r.flush(routes[r.request.url] as object);
}

const session = (readOnly = false) => ({
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
  subTasks: readOnly
    ? ['home.view', 'academics.view', 'task.home', 'task.academics']
    : ['home.view', 'academics.view', 'academics.edit', 'task.home', 'task.academics'],
  preferredLang: 'en',
});

const grade2 = {
  id: 'c-2',
  name: 'Grade 2',
  order: 1,
  sections: [
    { id: 's-2a', name: 'A', capacity: 40, students: 31 },
    { id: 's-2b', name: 'B', capacity: null, students: 0 },
  ],
  students: 31,
  version: 3,
};
const grade1 = {
  id: 'c-1',
  name: 'Grade 1',
  order: 0,
  sections: [{ id: 's-1a', name: 'A', capacity: null, students: 28 }],
  students: 28,
  version: 1,
};
const classes = { year: { id: 'y-1', label: '2026-27' }, items: [grade2, grade1] };
const eng = {
  id: 'sub-eng',
  code: 'ENG',
  name: 'English',
  colour: '#2D5DA8',
  classes: 2,
  teachers: 3,
  periodsAWeek: 14,
  version: 2,
};
const mat = {
  id: 'sub-mat',
  code: 'MAT',
  name: 'Mathematics',
  colour: '#1F7A4D',
  classes: 1,
  teachers: 1,
  periodsAWeek: 7,
  version: 1,
};
const subjects = { year: { id: 'y-1', label: '2026-27' }, items: [eng, mat] };
const mapping = {
  'c-1': {
    class: { id: 'c-1', name: 'Grade 1' },
    subjects: [{ id: 'sub-eng', code: 'ENG', name: 'English' }],
    version: 1,
  },
  'c-2': {
    class: { id: 'c-2', name: 'Grade 2' },
    subjects: [
      { id: 'sub-eng', code: 'ENG', name: 'English' },
      { id: 'sub-mat', code: 'MAT', name: 'Mathematics' },
    ],
    version: 3,
  },
};
const period = (
  id: string,
  name: string,
  startsAt: string,
  endsAt: string,
  isBreak = false,
  slots = 0,
) => ({
  id,
  name,
  startsAt,
  endsAt,
  isBreak,
  minutes: minutesOf(endsAt) - minutesOf(startsAt),
  timetableSlots: slots,
});
const periods = {
  items: [
    period('p-1', 'Period 1', '08:45', '09:25', false, 12),
    period('p-b', 'Short break', '09:25', '09:40', true),
    period('p-2', 'Period 2', '09:40', '10:20'),
  ],
  summary: { teachingPeriods: 2, teachingMinutes: 80, breakMinutes: 15 },
  version: 77,
};
const teacher = { id: 't-1', name: 'RAVI KULKARNI', combined: false };
const assignments = {
  year: { id: 'y-1', label: '2026-27' },
  classTeachers: [
    {
      section: { id: 's-1a', name: 'A' },
      class: { id: 'c-1', name: 'Grade 1' },
      assignment: {
        id: 'a-1',
        kind: 'CLASS_TEACHER',
        teacher,
        class: { id: 'c-1', name: 'Grade 1' },
        section: { id: 's-1a', name: 'A' },
        subject: null,
        periodsAWeek: 0,
        since: null,
      },
    },
    { section: { id: 's-2a', name: 'A' }, class: { id: 'c-2', name: 'Grade 2' }, assignment: null },
    { section: { id: 's-2b', name: 'B' }, class: { id: 'c-2', name: 'Grade 2' }, assignment: null },
  ],
  subjectTeachers: [],
  coordinators: [],
  combinedTeachers: 0,
};

describe('console Classes & subjects (ACA-009…020)', () => {
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

  async function settle(n = 5) {
    for (let i = 0; i < n; i++) await tick();
    harness.detectChanges();
  }

  async function open(readOnly = false, url = '/console/structure') {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl(url);
    (await request('/api/v1/console/session')).flush(session(readOnly));
    await nav;
    (await request('/api/v1/console/classes')).flush(classes);
    serve({
      '/api/v1/console/subjects': subjects,
      '/api/v1/console/periods': periods,
      '/api/v1/console/teacher-assignments': assignments,
    });
    await settle();
    serve({
      '/api/v1/console/classes/c-1/subjects': mapping['c-1'],
      '/api/v1/console/classes/c-2/subjects': mapping['c-2'],
    });
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  const click = (root: ParentNode, label: string) =>
    [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)?.click();
  const tab = async (el: HTMLElement, label: string) => {
    ([...el.querySelectorAll('.tab')] as HTMLButtonElement[])
      .find((t) => t.textContent?.includes(label))!
      .click();
    await settle();
  };
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const drawer = () => document.querySelector('.drawer') as HTMLElement;
  const confirm = async () => {
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    await settle(2);
  };

  it('formats the bell schedule as the prototype does', () => {
    expect(t12('08:45')).toBe('8:45 AM');
    expect(t12('13:05')).toBe('1:05 PM');
    expect(tRange('08:45', '09:25')).toBe('8:45–9:25 am');
    expect(tRange('11:40', '12:20')).toBe('11:40 am–12:20 pm');
  });

  it('lists the classes in order with sections, subjects and the year’s class teachers', async () => {
    const el = await open();
    const rows = [...el.querySelectorAll('#cls-table tbody tr')] as HTMLElement[];
    expect(rows.map((r) => r.querySelector('b')?.textContent)).toEqual(['Grade 1', 'Grade 2']);
    expect(rows[1]?.querySelector('td')?.textContent?.trim()).toBe('2');
    expect([...rows[1]!.querySelectorAll('.tag')].map((t) => t.textContent?.trim())).toEqual([
      'A 31',
      'B 0',
    ]);
    const cells = (r: HTMLElement) => [...r.querySelectorAll('td')].map(text);
    expect(cells(rows[0]!)[4]).toBe('1');
    expect(cells(rows[0]!)[5]).toBe('1 of 1');
    expect(cells(rows[1]!)[4]).toBe('2');
    expect(cells(rows[1]!)[5]).toBe('0 of 2');
    expect(rows[1]!.querySelector('.chip')?.classList.contains('tone-warn')).toBe(true);
    expect(el.querySelector('thead')?.textContent).toContain('Class teachers · 2026-27');
    expect(el.querySelector('.pager')?.textContent).toContain('2 classes');
    expect([...el.querySelectorAll('.tab .n')].map(text)).toEqual(['2', '2', '2']);

    const th = [...el.querySelectorAll('th')].find((t) => t.textContent?.includes('Students'))!;
    (th as HTMLElement).click();
    (th as HTMLElement).click();
    harness.detectChanges();
    expect(el.querySelector('tbody tr b')?.textContent).toBe('Grade 2');

    rows[0]!.click();
    await settle();
    expect(text(drawer())).toContain('Grade 1 A28 students · Class teacher Ravi Kulkarni');
  });

  it('adds a class with its sections', async () => {
    const el = await open();
    click(el.querySelector('.c-ph')!, 'Add class');
    await settle();
    const d = drawer();
    expect(d.querySelector('h3')?.textContent).toBe('Add a class');
    expect((d.querySelector('#cp-cl-o') as HTMLInputElement).value).toBe('3');
    expect((d.querySelector('#cp-cl-s0') as HTMLInputElement).value).toBe('A');

    click(d, 'Add class');
    harness.detectChanges();
    expect(d.querySelector('.fld.invalid .fld-e')?.textContent).toContain(
      'This field is required.',
    );

    type(d.querySelector('#cp-cl-n') as HTMLInputElement, 'Grade 1');
    click(d, 'Add section');
    harness.detectChanges();
    type(d.querySelector('#cp-cl-s1') as HTMLInputElement, 'a');
    harness.detectChanges();
    click(d, 'Add class');
    harness.detectChanges();
    expect(d.textContent).toContain('Another class already has this name.');
    expect(d.textContent).toContain('Give each section a different name.');

    type(d.querySelector('#cp-cl-n') as HTMLInputElement, ' Grade 3 ');
    type(d.querySelector('#cp-cl-s1') as HTMLInputElement, 'B');
    type(d.querySelector('#cp-cl-c1') as HTMLInputElement, '35');
    harness.detectChanges();
    click(d, 'Add class');
    const post = await request('/api/v1/console/classes', 'POST');
    expect(post.request.body).toEqual({
      name: 'Grade 3',
      order: 2,
      sections: [
        { name: 'A', capacity: null },
        { name: 'B', capacity: 35 },
      ],
    });
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    post.flush({
      id: 'c-3',
      name: 'Grade 3',
      order: 2,
      sections: [
        { id: 's-3a', name: 'A', capacity: null, students: 0 },
        { id: 's-3b', name: 'B', capacity: 35, students: 0 },
      ],
      students: 0,
      version: 1,
    });
    (await request('/api/v1/console/classes')).flush(classes);
    await settle();
    expect(drawer()).toBeNull();
    expect(toasts()).toContain('Class added');
    expect(toasts()).toContain('Grade 3 · sections A, B');
  });

  it('edits a class; a section with students stays, the server answer shows on the field', async () => {
    const el = await open();
    const row = [...el.querySelectorAll('#cls-table tbody tr')].find((r) =>
      r.textContent?.includes('Grade 2'),
    ) as HTMLElement;
    row.click();
    await settle();
    const d = drawer();
    expect(d.querySelector('h3')?.textContent).toBe('Grade 2');
    expect(d.querySelector('.sh-t p')?.textContent).toContain('2 sections · 31 students');
    expect(d.querySelector('[aria-label="Remove section A"]')).toBeNull();
    expect(d.querySelector('.cp-why')?.getAttribute('title')).toContain(
      'Section A has 31 students — move them before removing it',
    );
    (d.querySelector('[aria-label="Remove section B"]') as HTMLButtonElement).click();
    harness.detectChanges();
    type(d.querySelector('#cp-cl-n') as HTMLInputElement, 'Grade 2 (old)');
    harness.detectChanges();

    click(d, 'Save class');
    const first = await request('/api/v1/console/classes/c-2', 'PATCH');
    expect(first.request.headers.get('If-Match')).toBe('"v3"');
    expect(first.request.body).toEqual({
      name: 'Grade 2 (old)',
      order: 1,
      sections: [{ id: 's-2a', name: 'A', capacity: 40 }],
    });
    first.flush(
      {
        code: 'ACA.CLASS_NAME_TAKEN',
        errors: [{ field: 'name', code: 'ACA.CLASS_NAME_TAKEN' }],
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expect(d.querySelector('.fld.invalid #cp-cl-n')).not.toBeNull();
    expect(d.textContent).toContain('Another class already has this name.');

    type(d.querySelector('#cp-cl-n') as HTMLInputElement, 'Grade Two');
    harness.detectChanges();
    click(d, 'Save class');
    const second = await request('/api/v1/console/classes/c-2', 'PATCH');
    second.flush(
      { code: 'ACA.SECTION_IN_USE', params: { name: 'B' } },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expect(d.textContent).toContain("Section B has students this year and can't be removed.");

    click(d, 'Save class');
    const third = await request('/api/v1/console/classes/c-2', 'PATCH');
    third.flush({ ...grade2, name: 'Grade Two', sections: [grade2.sections[0]], version: 4 });
    (await request('/api/v1/console/classes')).flush(classes);
    await settle();
    expect(toasts()).toContain('Class saved');
    expect(toasts()).toContain('Grade Two · sections A');
  });

  it('lists subjects, refuses a duplicate and adds or renames one (ACA-015…017)', async () => {
    const el = await open();
    await tab(el, 'Subjects');
    const rows = [...el.querySelectorAll('#sub-table tbody tr')].map((r) =>
      [...r.querySelectorAll('td')].map(text),
    );
    expect(rows).toEqual([
      ['ENG', 'English', '2', '3', '14'],
      ['MAT', 'Mathematics', '1', '1', '7'],
    ]);
    (el.querySelector('#cs-add-subject') as HTMLButtonElement).click();
    await settle();
    let d = drawer();
    expect(text(d.querySelector('.sh-t'))).toContain(
      "Subjects can be mapped to classes after they're added",
    );
    type(d.querySelector('#sb-c') as HTMLInputElement, 'eng');
    type(d.querySelector('#sb-n') as HTMLInputElement, 'mathematics');
    (d.querySelector('#sb-save') as HTMLButtonElement).click();
    await settle();
    expect(text(d)).toContain('ENG is already used.');
    expect(text(d)).toContain('mathematics already exists.');
    type(d.querySelector('#sb-c') as HTMLInputElement, 'evs');
    type(d.querySelector('#sb-n') as HTMLInputElement, 'Environmental Studies');
    ([...d.querySelectorAll('.cc-sw input')] as HTMLInputElement[])[3]!.click();
    (d.querySelector('#sb-save') as HTMLButtonElement).click();
    const post = await request('/api/v1/console/subjects', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      code: 'EVS',
      name: 'Environmental Studies',
      colour: '#1F7A4D',
    });
    post.flush({ ...eng, id: 'sub-evs', code: 'EVS', name: 'Environmental Studies' });
    (await request('/api/v1/console/subjects')).flush(subjects);
    await settle();
    expect(toasts()).toContain('Subject added');

    ([...el.querySelectorAll('#sub-table tbody tr')] as HTMLElement[])[0]!.click();
    await settle();
    d = drawer();
    expect((d.querySelector('#sb-c') as HTMLInputElement).readOnly).toBe(true);
    type(d.querySelector('#sb-n') as HTMLInputElement, 'English Language');
    (d.querySelector('#sb-save') as HTMLButtonElement).click();
    const patch = await request('/api/v1/console/subjects/sub-eng', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v2"');
    expect(patch.request.body).toEqual({ name: 'English Language', colour: '#2D5DA8' });
  });

  it('saves the subject mapping per class; a timetabled subject is refused in a dialog', async () => {
    const el = await open();
    await tab(el, 'Subject mapping');
    const box = (cls: string, sub: string) =>
      el.querySelector(`input[aria-label="${cls} studies ${sub}"]`) as HTMLInputElement;
    expect(box('Grade 1', 'English').checked).toBe(true);
    expect(box('Grade 1', 'Mathematics').checked).toBe(false);
    expect((el.querySelector('#mx-save') as HTMLButtonElement).disabled).toBe(true);
    box('Grade 1', 'Mathematics').click();
    box('Grade 2', 'Mathematics').click();
    await settle();
    expect(text(el.querySelector('#mx-pending'))).toBe('2 changes not saved');
    expect(box('Grade 1', 'Mathematics').closest('td')!.classList.contains('chg')).toBe(true);
    (el.querySelector('#mx-save') as HTMLButtonElement).click();
    const p1 = await request('/api/v1/console/classes/c-1/subjects', 'PUT');
    expect(p1.request.headers.get('If-Match')).toBe('"v1"');
    expect(p1.request.body).toEqual({ subjectIds: ['sub-eng', 'sub-mat'] });
    p1.flush({
      ...mapping['c-1'],
      subjects: [...mapping['c-1'].subjects, { id: 'sub-mat', code: 'MAT', name: 'Mathematics' }],
      version: 2,
    });
    const p2 = await request('/api/v1/console/classes/c-2/subjects', 'PUT');
    expect(p2.request.body).toEqual({ subjectIds: ['sub-eng'] });
    p2.flush(
      { code: 'ACA.SUBJECT_TIMETABLED', params: { class: 'Grade 2', subject: 'Mathematics' } },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    const dlg = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(text(dlg)).toContain('Some subjects are still timetabled');
    expect(text(dlg)).toContain(
      'Grade 2 has Mathematics periods on its timetable. Remove them first, then unmap the subject.',
    );
    expect(toasts()).toContain('Subject mapping saved');
    expect(text(el.querySelector('#mx-pending'))).toBe('1 change not saved');
  });

  it('selects or clears all subjects for a class with its "All" tick (client 2026-10-26)', async () => {
    const el = await open();
    await tab(el, 'Subject mapping');
    const box = (cls: string, sub: string) =>
      el.querySelector(`input[aria-label="${cls} studies ${sub}"]`) as HTMLInputElement;
    const all = (cls: string) =>
      el.querySelector(`input[aria-label="All subjects for ${cls}"]`) as HTMLInputElement;
    // Grade 1 studies English only: partly ticked; Grade 2 studies both.
    expect(all('Grade 1').checked).toBe(false);
    expect(all('Grade 1').indeterminate).toBe(true);
    expect(all('Grade 2').checked).toBe(true);
    expect(all('Grade 2').indeterminate).toBe(false);

    all('Grade 1').click();
    await settle();
    expect(box('Grade 1', 'English').checked).toBe(true);
    expect(box('Grade 1', 'Mathematics').checked).toBe(true);
    expect(all('Grade 1').checked).toBe(true);
    expect(text(el.querySelector('#mx-pending'))).toBe('1 change not saved');

    // Clearing a class, then ticking it all again, leaves nothing changed there.
    all('Grade 2').click();
    await settle();
    expect(box('Grade 2', 'English').checked).toBe(false);
    expect(box('Grade 2', 'Mathematics').checked).toBe(false);
    expect(text(el.querySelector('#mx-pending'))).toBe('3 changes not saved');
    all('Grade 2').click();
    await settle();
    expect(text(el.querySelector('#mx-pending'))).toBe('1 change not saved');

    (el.querySelector('#mx-save') as HTMLButtonElement).click();
    const put = await request('/api/v1/console/classes/c-1/subjects', 'PUT');
    expect(put.request.body).toEqual({ subjectIds: ['sub-eng', 'sub-mat'] });
  });

  it('shows the bell schedule and adds a period after the overlap check (ACA-019/020)', async () => {
    const el = await open(false, '/console/structure?tab=periods');
    const rows = [...el.querySelectorAll('#per-table tbody tr')].map((r) =>
      [...r.querySelectorAll('td')].map(text),
    );
    expect(rows[0]).toEqual(['1', 'Period 1', '8:45 AM', '9:25 AM', '40 min', 'Teaching', '12']);
    expect(rows[1]).toEqual(['2', 'Short break', '9:25 AM', '9:40 AM', '15 min', 'Break', '—']);
    expect([...el.querySelectorAll('.cc-bell .bi')].map(text)).toEqual(['P1', 'Short break', 'P2']);
    expect(text(el.querySelector('#per-day .kv'))).toContain('Teaching time80 min');

    (el.querySelector('#cs-add-period') as HTMLButtonElement).click();
    await settle();
    const d = drawer();
    expect((d.querySelector('#pd-s') as HTMLInputElement).value).toBe('10:20');
    type(d.querySelector('#pd-n') as HTMLInputElement, 'Period 3');
    type(d.querySelector('#pd-s') as HTMLInputElement, '10:00');
    type(d.querySelector('#pd-e') as HTMLInputElement, '10:40');
    (d.querySelector('#pd-save') as HTMLButtonElement).click();
    await settle();
    expect(text(d)).toContain('Overlaps Period 2 (9:40 AM – 10:20 AM).');
    type(d.querySelector('#pd-s') as HTMLInputElement, '10:20');
    type(d.querySelector('#pd-e') as HTMLInputElement, '11:00');
    (d.querySelector('#pd-save') as HTMLButtonElement).click();
    const put = await request('/api/v1/console/periods', 'PUT');
    expect(put.request.headers.get('If-Match')).toBe('"v77"');
    expect(put.request.body).toEqual({
      periods: [
        { id: 'p-1', name: 'Period 1', startsAt: '08:45', endsAt: '09:25', isBreak: false },
        { id: 'p-b', name: 'Short break', startsAt: '09:25', endsAt: '09:40', isBreak: true },
        { id: 'p-2', name: 'Period 2', startsAt: '09:40', endsAt: '10:20', isBreak: false },
        { name: 'Period 3', startsAt: '10:20', endsAt: '11:00', isBreak: false },
      ],
    });
    put.flush({
      ...periods,
      items: [...periods.items, period('p-3', 'Period 3', '10:20', '11:00')],
      version: 78,
    });
    await settle();
    expect(drawer()).toBeNull();
    expect(toasts()).toContain('Period added');
    expect(el.querySelectorAll('#per-table tbody tr')).toHaveLength(4);
  });

  it('removes an unused period after a confirmation; a timetabled one is kept', async () => {
    const el = await open(false, '/console/structure?tab=periods');
    ([...el.querySelectorAll('#per-table tbody tr')] as HTMLElement[])[0]!.click();
    await settle();
    expect(text(drawer())).toContain('Used in 12 timetable slots.');
    (drawer().querySelector('#pd-del') as HTMLButtonElement).click();
    await settle();
    expect(toasts()).toContain('Period 1 is used by a timetable and can’t be removed.');
    (drawer().querySelector('.x-btn') as HTMLButtonElement).click();
    await settle();
    ([...el.querySelectorAll('#per-table tbody tr')] as HTMLElement[])[2]!.click();
    await settle();
    (drawer().querySelector('#pd-del') as HTMLButtonElement).click();
    await confirm();
    const put = await request('/api/v1/console/periods', 'PUT');
    expect(
      (put.request.body as { periods: { name: string }[] }).periods.map((p) => p.name),
    ).toEqual(['Period 1', 'Short break']);
  });

  it('checks the class sheet, then imports the accepted rows (ACA-014)', async () => {
    const el = await open();
    (el.querySelector('#cs-upload') as HTMLButtonElement).click();
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    // The class sheet's template is the page's own rows, saved in the browser (no request).
    const u = URL as unknown as {
      createObjectURL?: (b: Blob) => string;
      revokeObjectURL?: (s: string) => void;
    };
    const before = { create: u.createObjectURL, revoke: u.revokeObjectURL };
    u.createObjectURL = () => 'blob:classes';
    u.revokeObjectURL = () => undefined;
    const save = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      (m.querySelector('#bu-template') as HTMLButtonElement).click();
      await settle();
      expect((save.mock.contexts[0] as HTMLAnchorElement).download).toBe('classes_template.csv');
      const ctl = TestBed.inject(HttpTestingController);
      expect(ctl.match((r) => r.url.includes('/uploads/template'))).toHaveLength(0);
    } finally {
      save.mockRestore();
      u.createObjectURL = before.create;
      u.revokeObjectURL = before.revoke;
    }
    const input = m.querySelector('#bu-file') as HTMLInputElement;
    const file = new File(['class_name,sections\nGrade 3,"A, B"\n'], 'classes.csv', {
      type: 'text/csv',
    });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await settle();
    (m.querySelector('#bu-check') as HTMLButtonElement).click();
    const check = await request('/api/v1/console/classes/uploads', 'POST');
    expect((check.request.body as FormData).get('commit')).toBe('false');
    const report = {
      committed: false,
      accepted: 1,
      rejected: 1,
      created: 0,
      extended: 0,
      rows: [
        {
          row: 1,
          className: 'Grade 3',
          sections: ['A', 'B'],
          newSections: ['A', 'B'],
          accepted: true,
          code: null,
        },
        {
          row: 2,
          className: 'Grade 1',
          sections: ['A'],
          newSections: [],
          accepted: false,
          code: 'ACA.CLASS_NAME_TAKEN',
        },
      ],
    };
    check.flush(report);
    await settle();
    expect(text(m.querySelector('#bu-rows'))).toContain('Grade 3A, BAccepted');
    expect(text(m.querySelector('#bu-rows'))).toContain('Already exists with these sections');
    expect(m.querySelector('#bu-summary')).toBeNull();
    (m.querySelector('#bu-import') as HTMLButtonElement).click();
    const commit = await request('/api/v1/console/classes/uploads', 'POST');
    expect((commit.request.body as FormData).get('commit')).toBe('true');
    commit.flush({ ...report, committed: true, created: 1 });
    (await request('/api/v1/console/classes')).flush(classes);
    await settle();
    expect(toasts()).toContain('1 class imported');
  });

  it('is read-only for Management', async () => {
    const el = await open(true);
    expect(el.textContent).toContain('Management can view this page but not change it.');
    const add = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Add class'),
    ) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    (el.querySelector('#cls-table tbody tr') as HTMLElement).click();
    await settle();
    const d = drawer();
    expect(d.textContent).toContain('Management has read-only access');
    expect(
      [...d.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Save class'),
    ).toBe(false);
    expect((d.querySelector('#cp-cl-n') as HTMLInputElement).readOnly).toBe(true);
  });

  it('tells a role without the task that it has no access', async () => {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/structure');
    (await request('/api/v1/console/session')).flush({
      ...session(),
      subTasks: ['home.view', 'task.home'],
    });
    await nav;
    await settle();
    TestBed.inject(HttpTestingController).expectNone('/api/v1/console/classes');
    expect((harness.routeNativeElement as HTMLElement).textContent).toContain(
      "You don't have access to this page",
    );
  });
});
