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
import type { Enrolment, EnrolmentList, Rollover } from './enrolments.api';

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

const session = (over: object = {}) => ({
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
    'academics.year',
    'members.view',
  ],
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
    {
      id: 'y-27',
      label: '2027-28',
      startsOn: '2027-06-01',
      endsOn: '2028-03-31',
      status: 'OPEN',
      current: false,
      version: 1,
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
      sections: [
        { id: 's-8a', name: 'A', capacity: null, students: 30 },
        { id: 's-8b', name: 'B', capacity: null, students: 28 },
      ],
      students: 58,
      version: 1,
    },
  ],
};
const year = (id = 'y-26') => {
  const y = years.items.find((x) => x.id === id)!;
  return {
    id: y.id,
    label: y.label,
    startsOn: y.startsOn,
    endsOn: y.endsOn,
    closed: y.status === 'CLOSED',
    current: y.current,
  };
};
const en = (over: Partial<Enrolment>): Enrolment => ({
  id: 'e-1',
  student: { id: 'st-1', name: 'AARAV HEGDE', admissionNo: 'TVPS/2019/0412', status: 'ACTIVE' },
  class: { id: 'c-7', name: 'Grade 7' },
  section: { id: 's-7b', name: 'B' },
  enrolledOn: '2026-06-01',
  outcome: null,
  moves: 0,
  correctionPending: null,
  ...over,
});
const aarav = en({});
const anika = en({
  id: 'e-2',
  student: { id: 'st-2', name: 'ANIKA RAO', admissionNo: 'TVPS/2023/0981', status: 'SUSPENDED' },
  section: { id: 's-7a', name: 'A' },
  moves: 1,
});
const vihaan = en({
  id: 'e-3',
  student: { id: 'st-3', name: 'VIHAAN KARANTH', admissionNo: 'TVPS/2022/1857', status: 'ACTIVE' },
  class: { id: 'c-8', name: 'Grade 8' },
  section: { id: 's-8a', name: 'A' },
  outcome: 'PROMOTED',
});
const enrolments = (items: Enrolment[] = [aarav, anika, vihaan], id = 'y-26'): EnrolmentList => ({
  year: year(id),
  total: items.length,
  items,
  nextCursor: null,
});
const students = (n: number, items: object[] = []) => ({
  year: null,
  columns: [],
  filters: [],
  counts: { tabs: { STUDENTS: n, PARENTS: 0, STAFF: 0, MERCHANTS: 0, ALL: n }, statuses: {} },
  items,
  nextCursor: null,
});
const rollover = (over: Partial<Rollover> = {}): Rollover => ({
  id: 'ro-1',
  status: 'PROPOSED',
  from: year('y-26'),
  to: year('y-27'),
  committedAt: null,
  counts: { promoted: 2, repeated: 0, left: 1 },
  items: [
    {
      student: aarav.student,
      from: 'Grade 7 B',
      outcome: 'PROMOTED',
      to: { sectionId: 's-8b', label: 'Grade 8 B' },
      amended: false,
    },
    {
      student: anika.student,
      from: 'Grade 7 A',
      outcome: 'PROMOTED',
      to: { sectionId: 's-8a', label: 'Grade 8 A' },
      amended: false,
    },
    { student: vihaan.student, from: 'Grade 8 A', outcome: 'LEFT', to: null, amended: false },
  ],
  version: 4,
  ...over,
});

describe('console enrolment & promotion (ACA-027…033)', () => {
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

  async function open(url = '/console/enrol', list = enrolments()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl(url);
    (await request((u) => u === '/api/v1/console/session')).flush(session());
    await nav;
    await settle();
    serve({
      '/api/v1/console/academic-years': years,
      '/api/v1/console/classes': classes,
    });
    await settle();
    serve({ '/api/v1/console/members?kind=STUDENTS&status=ACTIVE&limit=1': students(5) });
    const get = TestBed.inject(HttpTestingController).match(
      (r) => r.urlWithParams === '/api/v1/console/enrolments?yearId=y-26',
    );
    for (const r of get) r.flush(list);
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  const modal = () => [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
  const pick = async (id: string, label: string) => {
    (modal().querySelector(`#${id}-b`) as HTMLButtonElement).click();
    await settle();
    ([...document.querySelectorAll('.dd-menu .dd-opt')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith(label))!
      .click();
    await settle();
  };
  const type = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
    el.value = v;
    el.dispatchEvent(new Event('input'));
  };
  const confirm = async () => {
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    await settle(2);
  };
  const rowOf = (el: HTMLElement, name: string) =>
    [...el.querySelectorAll('#en-table tbody tr')].find((r) =>
      text(r).includes(name),
    ) as HTMLElement;

  it('lists the year’s enrolments with figures, statuses and filters', async () => {
    const el = await open();
    expect(text(el.querySelector('.tab.on'))).toBe('Enrolment · 2026-27');
    expect(text([...el.querySelectorAll('.tab')][1])).toBe('Roll-over to 2027-28');
    const kpis = [...el.querySelectorAll('.kpi')].map((k) => [
      text(k.querySelector('.k-l')),
      text(k.querySelector('.k-v')),
    ]);
    expect(kpis).toEqual([
      ['Enrolled', '3'],
      ['Class-sections', '3'],
      ['Mid-term joiners', '—'],
      ['Active students not enrolled', '3'],
    ]);
    expect(text(rowOf(el, 'Anika'))).toContain('Suspended');
    expect(text(rowOf(el, 'Anika'))).toContain('1 transfer this year');
    expect(text(rowOf(el, 'Vihaan'))).toContain('Roll-over');
    expect(text(rowOf(el, 'Aarav'))).toContain('Grade 7 B');
    expect(text(rowOf(el, 'Aarav'))).toContain('01 Jun 2026');

    const q = el.querySelector('#en-q') as HTMLInputElement;
    type(q, '2022/1857');
    await settle();
    expect(el.querySelectorAll('#en-table tbody tr')).toHaveLength(1);
    expect(text(el.querySelector('.fsum'))).toBe('1 student');
  });

  it('enrols an active student who is not enrolled yet (ACA-028)', async () => {
    const el = await open();
    (el.querySelector('#en-new') as HTMLButtonElement).click();
    await settle();
    (modal().querySelector('#ne-go') as HTMLButtonElement).click();
    await settle();
    expect(modal().querySelectorAll('.fld.invalid')).toHaveLength(2);
    (modal().querySelector('#ne-m-b') as HTMLButtonElement).click();
    await settle();
    (
      await request((u) => u === '/api/v1/console/members?kind=STUDENTS&status=ACTIVE&limit=50')
    ).flush(
      students(5, [
        {
          id: 'st-1',
          name: 'AARAV HEGDE',
          admissionNo: 'TVPS/2019/0412',
          kind: 'STUDENTS',
          grade: { class: 'Grade 7', section: 'B' },
          userType: { id: 'u', name: 'Student', category: 'STUDENT' },
        },
        {
          id: 'st-9',
          name: 'MEERA NAIK',
          admissionNo: 'TVPS/2026/1201',
          kind: 'STUDENTS',
          grade: null,
          userType: { id: 'u', name: 'Student', category: 'STUDENT' },
        },
      ]),
    );
    await settle();
    const opts = [...document.querySelectorAll('.dd-menu .dd-opt')] as HTMLButtonElement[];
    expect(opts.map(text)).toEqual(['MEERA NAIK · TVPS/2026/1201Not enrolled']);
    opts[0]!.click();
    await settle();
    await pick('ne-k', 'Grade 8 B');
    const d = modal().querySelector('#ne-d') as HTMLInputElement;
    d.value = '2026-05-01';
    d.dispatchEvent(new Event('change'));
    (modal().querySelector('#ne-go') as HTMLButtonElement).click();
    await settle();
    expect(text(modal())).toContain('Choose a date within 2026-27 (01 Jun 2026 – 31 Mar 2027).');
    d.value = '2026-10-05';
    d.dispatchEvent(new Event('change'));
    (modal().querySelector('#ne-go') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/enrolments', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      yearId: 'y-26',
      studentId: 'st-9',
      sectionId: 's-8b',
      enrolledOn: '2026-10-05',
    });
    post.flush(
      en({
        id: 'e-9',
        student: {
          id: 'st-9',
          name: 'MEERA NAIK',
          admissionNo: 'TVPS/2026/1201',
          status: 'ACTIVE',
        },
        class: { id: 'c-8', name: 'Grade 8' },
        section: { id: 's-8b', name: 'B' },
      }),
    );
    (await request((u) => u === '/api/v1/console/enrolments?yearId=y-26')).flush(enrolments());
    await settle();
    expect(toasts()).toContain('Student enrolled');
    expect(toasts()).toContain('Meera Naik · Grade 8 B · family notified');
  });

  it('transfers a student to another section of the class with a reason (ACA-029)', async () => {
    const el = await open();
    ([...rowOf(el, 'Aarav').querySelectorAll('button')] as HTMLButtonElement[])
      .find((b) => text(b) === 'Transfer')!
      .click();
    await settle();
    expect(text(modal().querySelector('.sh-t'))).toBe('Transfer Aarav HegdeGrade 7 · 2026-27');
    await pick('xf-s', 'Grade 7 A');
    type(modal().querySelector('#xf-r') as HTMLInputElement, 'abc');
    (modal().querySelector('#xf-go') as HTMLButtonElement).click();
    await settle();
    expect(text(modal())).toContain('Give a reason of 4 to 200 characters.');
    type(modal().querySelector('#xf-r') as HTMLInputElement, 'Balancing section strength');
    (modal().querySelector('#xf-go') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/enrolments/e-1/transfers', 'POST');
    expect(post.request.body).toMatchObject({
      sectionId: 's-7a',
      reason: 'Balancing section strength',
    });
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    post.flush({ ...aarav, section: { id: 's-7a', name: 'A' } });
    (await request((u) => u === '/api/v1/console/enrolments?yearId=y-26')).flush(enrolments());
    await settle();
    expect(toasts()).toContain('1 student transferred');
  });

  it('a bulk transfer stays within one class', async () => {
    const el = await open();
    (rowOf(el, 'Aarav').querySelector('input') as HTMLInputElement).click();
    (rowOf(el, 'Vihaan').querySelector('input') as HTMLInputElement).click();
    await settle();
    expect(text(el.querySelector('#en-bulk'))).toContain('2 students selected');
    ([...el.querySelectorAll('#en-bulk button')] as HTMLButtonElement[])[0]!.click();
    await settle();
    expect(toasts()).toContain('Choose students from one class');
    expect(toasts()).toContain(
      'A section transfer stays within the class. Moving up a class happens at roll-over.',
    );
  });

  it('asks for a correction in a closed year; the administrator decides (ACA-030)', async () => {
    const el = await open();
    (el.querySelector('#en-year-b') as HTMLButtonElement).click();
    await settle();
    ([...document.querySelectorAll('.dd-opt')] as HTMLButtonElement[])
      .find((b) => text(b).includes('2025-26'))!
      .click();
    (await request((u) => u === '/api/v1/console/enrolments?yearId=y-25')).flush(
      enrolments([aarav, en({ ...anika, correctionPending: 'apr-1' })], 'y-25'),
    );
    await settle();
    expect(text(el.querySelector('#en-closed'))).toContain('2025-26 is closed.');
    expect(el.querySelector('#en-table .c-chk')).toBeNull();
    expect(text(rowOf(el, 'Anika'))).toContain('Correction pending approval');
    expect(text(rowOf(el, 'Anika'))).not.toContain('Request correction');
    ([...rowOf(el, 'Aarav').querySelectorAll('button')] as HTMLButtonElement[])
      .find((b) => text(b) === 'Request correction')!
      .click();
    await settle();
    expect(text(modal().querySelector('.sh-t'))).toContain(
      'Aarav Hegde · Grade 7 B · 2025-26 (closed)',
    );
    await pick('cr-k', 'Grade 7 A');
    type(modal().querySelector('#cr-r') as HTMLTextAreaElement, 'Register shows 7 A');
    (modal().querySelector('#cr-go') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/closed-year-corrections', 'POST');
    expect(post.request.body).toEqual({
      enrolmentId: 'e-1',
      sectionId: 's-7a',
      reason: 'Register shows 7 A',
    });
    post.flush(
      { approvalId: 'apr-2', appliedDirectly: false, enrolment: aarav },
      { status: 202, statusText: 'Accepted' },
    );
    (await request((u) => u === '/api/v1/console/enrolments?yearId=y-25')).flush(
      enrolments([en({ correctionPending: 'apr-2' })], 'y-25'),
    );
    await settle();
    expect(toasts()).toContain('Correction sent for approval');
  });

  it('amends the roll-over per student and commits it as a whole (ACA-031…033)', async () => {
    const el = await open('/console/enrol?tab=ro');
    (await request((u) => u === '/api/v1/console/rollover-proposals')).flush(rollover());
    await settle();
    const kpis = [...el.querySelectorAll('.kpi')].map((k) => text(k.querySelector('.k-v')));
    expect(kpis).toEqual(['2', '0', '1', '1']);
    expect(text(el.querySelector('#ro-table thead'))).toBe('Student↑ 2026-27↑NoteDecision2027-28');
    // By class-section: Grade 7 A first; Anika is suspended.
    let rows = [...el.querySelectorAll('#ro-table tbody tr')];
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toContain('Suspended — decide before committing');
    const decision = rows[0]!.querySelector('select') as HTMLSelectElement;
    decision.value = 'REPEATED';
    decision.dispatchEvent(new Event('change'));
    const patch = await request(
      (u) => u === '/api/v1/console/rollover-proposals/ro-1/items/st-2',
      'PATCH',
    );
    expect(patch.request.headers.get('If-Match')).toBe('"v4"');
    expect(patch.request.body).toEqual({ outcome: 'REPEATED', sectionId: 's-7a' });
    const amended = rollover({
      counts: { promoted: 1, repeated: 1, left: 1 },
      items: rollover().items.map((i) =>
        i.student.id === 'st-2'
          ? {
              ...i,
              outcome: 'REPEATED' as const,
              to: { sectionId: 's-7a', label: 'Grade 7 A' },
              amended: true,
            }
          : i,
      ),
      version: 5,
    });
    patch.flush(amended);
    await settle();
    rows = [...el.querySelectorAll('#ro-table tbody tr')];
    expect(text(rows[0])).toContain('Grade 7 A again');
    expect(text(rows[0])).toContain('Amended');

    // The final class leaves.
    ([...el.querySelectorAll('.pill')] as HTMLButtonElement[])[0]!.click();
    (el.querySelector('#f-rk-b') as HTMLButtonElement).click();
    await settle();
    ([...document.querySelectorAll('.dd-opt')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith('Grade 8 A'))!
      .click();
    await settle();
    expect(text(el.querySelector('#ro-table tbody tr'))).toContain('Completes the final class');

    (el.querySelector('#ro-commit') as HTMLButtonElement).click();
    await settle(2);
    expect(text(document.querySelector('.modal[role="alertdialog"]'))).toContain(
      '1 promoted, 1 held back and 1 leaving. This creates 2 enrolments in 2027-28',
    );
    await confirm();
    const commit = await request(
      (u) => u === '/api/v1/console/rollover-proposals/ro-1/commit',
      'POST',
    );
    expect(commit.request.headers.get('If-Match')).toBe('"v5"');
    expect(commit.request.headers.get('Idempotency-Key')).toBeTruthy();
    commit.flush({
      ...amended,
      status: 'COMMITTED',
      committedAt: '2026-10-04T06:00:00.000Z',
      version: 6,
    });
    await settle();
    expect(toasts()).toContain('Roll-over committed');
    expect(text(el.querySelector('#ro-done'))).toContain('Roll-over committed');
    expect(text(el.querySelector('#ro-done'))).toContain('2026-27 → 2027-28');
    expect(el.querySelector('.tab .ic')).not.toBeNull();
  });

  it('asks for the next year before a roll-over', async () => {
    const el = await open('/console/enrol?tab=ro');
    (await request((u) => u === '/api/v1/console/rollover-proposals')).flush(
      { code: 'ACA.NEXT_YEAR_NEEDED' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expect(text(el)).toContain('Add the next academic year first');
    expect(text(el)).toContain('Add the next academic year before rolling over.');
  });
});
