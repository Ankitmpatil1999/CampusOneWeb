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
import { SessionKeeper } from '../../../Utils/session-keeper';
import { readCell, readSheet } from './marks-csv';
import type { MarksGrid, TeacherExam } from './marks.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
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
  subTasks: ['task.teaching', 'teaching.view', 'teaching.marks'],
  preferredLang: 'en',
};
const exam = (over: Partial<TeacherExam> = {}): TeacherExam => ({
  id: 'ex-1',
  name: { id: 'n-1', name: 'Unit Test 1' },
  section: { id: 's-1', name: 'A', label: 'Grade 6 A' },
  subject: { id: 'sub-1', code: 'MAT', name: 'Mathematics' },
  date: '2026-09-01',
  maxMarks: 50,
  passMarks: 18,
  marks: { students: 3, entered: 0, valid: 0, status: 'NOT_UPLOADED' },
  published: null,
  version: 1,
  ...over,
});
const row = (id: string, name: string, no: string, marks: number | null = null) => ({
  student: { id, name, admissionNo: no },
  marks,
  absent: false,
  status: marks === null ? null : 'CREATED',
});
const grid = (over: Partial<MarksGrid> = {}): MarksGrid => ({
  examId: 'ex-1',
  held: true,
  maxMarks: 50,
  passMarks: 18,
  rows: [
    row('st-1', 'Asha Rao', 'ADM/1'),
    row('st-2', 'Bala Rao', 'ADM/2'),
    row('st-3', 'Chetan K', 'ADM/3'),
  ],
  summary: { entered: 0, average: null, passed: 0, failed: 0 },
  version: 4,
  ...over,
});

describe('teacher marks on the web (ACA-052…054)', () => {
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

  /** The page with one exam chosen and its grid shown. */
  async function open(g = grid()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/teaching-marks');
    (await request((u) => u === '/api/v1/console/session')).flush(session);
    await nav;
    await settle();
    serve({ '/api/v1/languages': { items: [] } });
    const list = await request((u) => u === '/api/v1/teacher/exams');
    expect(list.request.headers.get('X-CampusOne-Surface')).toBe('console');
    list.flush({ items: [exam()], grid: null });
    await settle();
    const el = harness.routeNativeElement as HTMLElement;
    (el.querySelector('#tm-exam-b') as HTMLButtonElement).click();
    await settle(2);
    (document.querySelector('.dd-menu .dd-opt') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/teacher/exams?examId=ex-1')).flush({
      items: [exam()],
      grid: g,
    });
    await settle();
    return el;
  }
  const type = (el: HTMLElement, i: number, v: string) => {
    const input = el.querySelector(`#tm-m-${i}`) as HTMLInputElement;
    input.value = v;
    input.dispatchEvent(new Event('input'));
    return input;
  };

  it('reads a typed or pasted cell, and a sheet row by row', () => {
    expect(readCell('42.5', 50)).toEqual({ marks: 42.5 });
    expect(readCell('ab', 50)).toEqual({ absent: true });
    expect(readCell('42.3', 50)).toBe('format');
    expect(readCell('51', 50)).toBe('range');
    const sheet = readSheet(
      'Admission no,Student,Marks\r\nADM/1,Asha,44\r\nADM/9,Nobody,10\r\nADM/2,Bala,AB\r\nADM/1,Asha again,30\r\nADM/3,Chetan,70\r\n',
      grid().rows,
      50,
    );
    expect([...sheet.values.entries()]).toEqual([
      ['st-1', { marks: 44 }],
      ['st-2', { absent: true }],
    ]);
    expect(sheet.problems.map((p) => [p.line, p.reason])).toEqual([
      [3, 'unknown'],
      [5, 'duplicate'],
      [6, 'range'],
    ]);
  });

  it('enters marks with the keyboard, refuses a mark out of range, and saves the whole grid', async () => {
    const el = await open();
    expect(text(el.querySelector('#tm-grid tbody'))).toContain('Asha Rao');
    const first = type(el, 0, '42.5');
    // A key press is use the session keeper renews on; the test has no session cookie for it, so
    // the renewal would sign the test out a few ticks later (as in FeeCollection.spec).
    TestBed.inject(SessionKeeper).stop();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle(1);
    expect(document.activeElement?.id).toBe('tm-m-1');
    type(el, 1, '60');
    await settle(1);
    expect(text(el.querySelector('#tm-grid'))).toContain('Marks can be 0 to 50');
    (el.querySelector('#tm-save') as HTMLButtonElement).click();
    await settle(1);
    expect(toasts()).toContain('Correct the marks shown in red first');
    type(el, 1, '17');
    (el.querySelector('#tm-a-2') as HTMLInputElement).click();
    await settle(1);
    expect(text(el.querySelector('#tm-unsaved'))).toContain('3 unsaved changes');
    (el.querySelector('#tm-save') as HTMLButtonElement).click();
    const put = await request((u) => u === '/api/v1/teacher/exams/ex-1/marks', 'PUT');
    expect(put.request.headers.get('If-Match')).toBe('"v4"');
    expect(put.request.headers.get('X-CampusOne-Surface')).toBe('console');
    expect(put.request.body).toEqual({
      marks: [
        { studentId: 'st-1', marks: 42.5 },
        { studentId: 'st-2', marks: 17 },
        { studentId: 'st-3', absent: true },
      ],
    });
    put.flush(
      grid({
        rows: [
          row('st-1', 'Asha Rao', 'ADM/1', 42.5),
          row('st-2', 'Bala Rao', 'ADM/2', 17),
          { ...row('st-3', 'Chetan K', 'ADM/3'), absent: true, status: 'CREATED' },
        ],
        summary: { entered: 3, average: 29.8, passed: 1, failed: 1 },
        version: 5,
      }),
    );
    await settle();
    expect(toasts()).toContain('Marks saved');
    expect(el.querySelector('#tm-unsaved')).toBeNull();
    expect(text(el.querySelector('#tm-grid tbody'))).toContain('Below pass mark');
  });

  it('pastes a column from a spreadsheet into the rows below', async () => {
    const el = await open();
    const input = el.querySelector('#tm-m-0') as HTMLInputElement;
    const ev = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', {
      value: { getData: () => '40\r\nAB\r\n33.5\r\n' },
    });
    input.dispatchEvent(ev);
    await settle(1);
    expect(ev.defaultPrevented).toBe(true);
    expect((el.querySelector('#tm-m-0') as HTMLInputElement).value).toBe('40');
    expect((el.querySelector('#tm-a-1') as HTMLInputElement).checked).toBe(true);
    expect((el.querySelector('#tm-m-2') as HTMLInputElement).value).toBe('33.5');
    expect(toasts()).toContain('3 marks pasted');
  });

  it('reads an uploaded sheet, shows what it will change, then puts it in the grid', async () => {
    const el = await open();
    const input = el.querySelector('#tm-upload') as HTMLInputElement;
    const csv = 'Admission no,Student,Marks\nADM/1,Asha,44\nADM/2,Bala,AB\nADM/7,Who,12\n';
    const file = new File([csv], 'marks.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    for (let i = 0; i < 20 && !el.querySelector('#tm-sheet'); i++) await settle(1);
    expect(text(el.querySelector('#tm-sheet'))).toContain('2 marks to put in the grid');
    expect(text(el.querySelector('#tm-sheet-problems'))).toContain(
      'Line 4: no student with admission no. ADM/7 in this class',
    );
    // Nothing changes until the teacher says so.
    expect((el.querySelector('#tm-m-0') as HTMLInputElement).value).toBe('');
    (el.querySelector('#tm-sheet-apply') as HTMLButtonElement).click();
    await settle(1);
    expect((el.querySelector('#tm-m-0') as HTMLInputElement).value).toBe('44');
    expect((el.querySelector('#tm-a-1') as HTMLInputElement).checked).toBe(true);
    expect(toasts()).toContain('2 marks put in the grid');
  });

  it('reloads when someone else saved first, and publishes a complete grid', async () => {
    const el = await open();
    type(el, 0, '40');
    await settle(1);
    (el.querySelector('#tm-save') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/teacher/exams/ex-1/marks', 'PUT')).flush(
      { status: 412, code: 'GEN.PRECONDITION_FAILED', detail: 'Changed by someone else.' },
      { status: 412, statusText: 'Precondition Failed' },
    );
    const complete = grid({
      rows: [
        row('st-1', 'Asha Rao', 'ADM/1', 40),
        row('st-2', 'Bala Rao', 'ADM/2', 20),
        row('st-3', 'Chetan K', 'ADM/3', 30),
      ],
      summary: { entered: 3, average: 30, passed: 3, failed: 0 },
      version: 6,
    });
    (await request((u) => u === '/api/v1/teacher/exams?examId=ex-1')).flush({
      items: [exam()],
      grid: complete,
    });
    await settle();
    expect(toasts()).toContain('Someone else saved these marks first');
    expect((el.querySelector('#tm-m-0') as HTMLInputElement).value).toBe('40');
    const publish = el.querySelector('#tm-publish') as HTMLButtonElement;
    expect(publish.disabled).toBe(false);
    publish.click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(dlg)).toContain('Publish these marks?');
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const post = await request((u) => u === '/api/v1/teacher/exams/ex-1/marks-publication', 'POST');
    expect(post.request.headers.has('Idempotency-Key')).toBe(true);
    post.flush({});
    (await request((u) => u === '/api/v1/teacher/exams?examId=ex-1')).flush({
      items: [exam({ published: { at: '2026-10-05T06:30:00.000Z' } })],
      grid: complete,
    });
    await settle();
    expect(toasts()).toContain('Marks published');
    expect(text(el.querySelector('#tm-published'))).toContain('Published on');
    expect((el.querySelector('#tm-m-0') as HTMLInputElement).disabled).toBe(true);
  });
});
