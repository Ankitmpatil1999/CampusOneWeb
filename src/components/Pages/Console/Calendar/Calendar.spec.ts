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
import { istBusinessDate } from '../../../Utils/format';
import type { CalendarEntry, CalendarList } from './calendar.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const toasts = () => text(document.querySelector('.toasts'));
const today = istBusinessDate(new Date());
const Y = today.slice(0, 4);
const M = today.slice(0, 7);

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
  const hit = (r: { method: string; url: string }) => r.method === 'GET' && r.url in routes;
  for (const r of ctl.match(hit) as TestRequest[]) r.flush(routes[r.request.url] as object);
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
  subTasks: ['home.view', 'task.home', 'task.academics', 'academics.view', 'academics.edit'],
  preferredLang: 'en',
  ...over,
});

/** The year in context runs through the calendar year of today, so the month grid shows it. */
const years = {
  items: [
    {
      id: 'y-now',
      label: `${Y}-${String(Number(Y.slice(2)) + 1).padStart(2, '0')}`,
      startsOn: `${Y}-01-01`,
      endsOn: `${Y}-12-31`,
      status: 'OPEN',
      current: true,
      version: 1,
    },
    {
      id: 'y-old',
      label: '2019-20',
      startsOn: '2019-06-01',
      endsOn: '2020-03-31',
      status: 'CLOSED',
      current: false,
      version: 3,
    },
  ],
};
const label = years.items[0]!.label;

const entry = (over: Partial<CalendarEntry>): CalendarEntry => ({
  id: 'e-1',
  type: 'Holiday',
  holidayType: 'Public holiday',
  title: 'Founders Day',
  description: null,
  allDay: true,
  startDate: `${M}-10`,
  endDate: `${M}-10`,
  startTime: null,
  endTime: null,
  location: null,
  audience: { kind: 'ALL', targets: [] },
  recurrence: 'NONE',
  repeatUntil: null,
  colour: '#8C3B3B',
  reminders: [],
  source: null,
  createdBy: 'Prakash Shetty',
  createdAt: null,
  deleted: null,
  version: 1,
  occurrences: [{ start: `${M}-10`, end: `${M}-10` }],
  ...over,
});
const holiday = entry({});
const ptm = entry({
  id: 'e-2',
  type: 'PTM',
  holidayType: null,
  title: 'Parent–teacher meeting',
  allDay: false,
  startDate: `${M}-20`,
  endDate: `${M}-20`,
  startTime: '09:30',
  endTime: '13:00',
  audience: { kind: 'CLASS', targets: [{ kind: 'CLASS', id: 'c-6', name: 'Grade 6' }] },
  colour: '#0C6F7D',
  reminders: ['DAY_BEFORE'],
  version: 3,
  occurrences: [{ start: `${M}-20`, end: `${M}-20` }],
});
const gone = entry({
  id: 'e-3',
  type: 'Exam',
  holidayType: null,
  title: 'Cancelled test',
  startDate: `${M}-12`,
  endDate: `${M}-12`,
  colour: '#5E4BB0',
  deleted: { at: `${M}-02T05:00:00.000Z` },
  version: 2,
  occurrences: [{ start: `${M}-12`, end: `${M}-12` }],
});
const calendar = (items: CalendarEntry[] = [holiday, ptm, gone]): CalendarList => ({
  year: {
    id: 'y-now',
    label,
    startsOn: `${Y}-01-01`,
    endsOn: `${Y}-12-31`,
    closed: false,
    current: true,
  },
  from: `${Y}-01-01`,
  to: `${Y}-12-31`,
  types: ['Holiday', 'Exam', 'Event', 'PTM', 'Sports', 'Meeting'],
  holidayTypes: ['Public holiday', 'Institution holiday', 'Vacation'],
  reminders: {
    DAY_BEFORE: '1 day before',
    HOUR_BEFORE: '1 hour before',
    MORNING_OF: 'On the day at 7:00 AM',
  },
  counts: { entries: 2, holidays: 1, holidayDays: 1, exams: 0 },
  items,
});
const classes = {
  year: { id: 'y-now', label },
  items: [
    {
      id: 'c-6',
      name: 'Grade 6',
      order: 6,
      sections: [{ id: 's-6a', name: 'A', capacity: null, students: 30 }],
      students: 30,
      version: 1,
    },
    {
      id: 'c-7',
      name: 'Grade 7',
      order: 7,
      sections: [
        { id: 's-7a', name: 'A', capacity: null, students: 28 },
        { id: 's-7b', name: 'B', capacity: null, students: 29 },
      ],
      students: 57,
      version: 1,
    },
  ],
};

describe('console academic calendar (ACA-004…008)', () => {
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

  async function open(over: object = {}, list = calendar()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/calendar');
    (await request((u) => u === '/api/v1/console/session')).flush(session(over));
    await nav;
    await settle();
    serve({ '/api/v1/console/academic-years': years, '/api/v1/console/classes': classes });
    (await request((u) => u === '/api/v1/console/calendar-events?yearId=y-now&deleted=true')).flush(
      list,
    );
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  const drawer = () => [...document.querySelectorAll('.drawer')].at(-1) as HTMLElement;
  const confirm = async () => {
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    await settle(2);
  };
  const type = (el: HTMLInputElement, v: string, ev = 'input') => {
    el.value = v;
    el.dispatchEvent(new Event(ev));
  };

  it('shows the year’s figures, the month grid and the list with deleted entries on request', async () => {
    const el = await open();
    expect(text(el.querySelector('.c-ph p'))).toBe(
      `One calendar for ${label} — holidays, exams, events and meetings`,
    );
    const kpis = [...el.querySelectorAll('.kpi')].map((k) => [
      text(k.querySelector('.k-l')),
      text(k.querySelector('.k-v')),
      text(k.querySelector('.k-d')),
    ]);
    expect(kpis[0]).toEqual(['Entries this year', '2', label]);
    expect(kpis[1]).toEqual(['Holidays', '1', '1 day off']);
    expect(kpis[2]?.slice(0, 2)).toEqual(['Exam windows', '0']);
    // The month grid: Monday first, the holiday day marked, the deleted entry left out.
    expect(text(el.querySelector('.cc-cal .dh'))).toBe('Mon');
    const hol = el.querySelector('.cc-cal .dc.hol') as HTMLElement;
    expect(text(hol)).toContain('Founders Day');
    expect(text(el.querySelector('.cc-cal'))).toContain('9:30AM Parent–teacher meeting');
    expect(text(el.querySelector('.cc-cal'))).not.toContain('Cancelled test');
    expect(el.querySelector('.cc-cal .dc.today')).not.toBeNull();

    // The list: sorted by date, deleted entries only with "Show deleted".
    ([...el.querySelectorAll('.seg button')] as HTMLButtonElement[])[1]!.click();
    await settle();
    let rows = [...el.querySelectorAll('#cal-table tbody tr')];
    expect(rows).toHaveLength(2);
    expect(text(rows[0])).toContain('Founders Day');
    expect(text(rows[1])).toContain('Grade 6');
    expect(text(rows[1])).toContain('9:30 AM – 1:00 PM');
    expect(text(rows[1])).toContain('1 day before');
    (el.querySelector('#f-del') as HTMLInputElement).click();
    await settle();
    rows = [...el.querySelectorAll('#cal-table tbody tr')];
    expect(rows).toHaveLength(3);
    const del = rows.find((r) => r.classList.contains('cc-del'))!;
    expect(text(del)).toContain('Deleted');

    // Restore (ACA-006 {"restore": true}) with the entry's version.
    ([...del.querySelectorAll('button')] as HTMLButtonElement[])
      .find((b) => text(b) === 'Restore')!
      .click();
    const patch = await request((u) => u === '/api/v1/console/calendar-events/e-3', 'PATCH');
    expect(patch.request.body).toEqual({ restore: true });
    expect(patch.request.headers.get('If-Match')).toBe('"v2"');
    patch.flush({ ...gone, deleted: null, version: 3 });
    (await request((u) => u === '/api/v1/console/calendar-events?yearId=y-now&deleted=true')).flush(
      calendar(),
    );
    await settle();
    expect(toasts()).toContain('Entry restored');

    // The type pills filter the list.
    ([...el.querySelectorAll('.pill')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith('PTM'))!
      .click();
    await settle();
    expect(el.querySelectorAll('#cal-table tbody tr')).toHaveLength(1);
  });

  it('adds the next academic year from the day after the latest one ends (ACA-002)', async () => {
    const el = await open();
    (el.querySelector('#cal-year-new') as HTMLButtonElement).click();
    await settle();
    const next = Number(Y) + 1;
    const label2 = `${next}-${String((next + 1) % 100).padStart(2, '0')}`;
    expect((document.querySelector('#ny-l') as HTMLInputElement).value).toBe(label2);
    expect((document.querySelector('#ny-s') as HTMLInputElement).value).toBe(`${next}-01-01`);
    expect((document.querySelector('#ny-e') as HTMLInputElement).value).toBe(`${next}-12-31`);
    (document.querySelector('#ny-go') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/academic-years', 'POST');
    expect(post.request.body).toEqual({
      label: label2,
      startsOn: `${next}-01-01`,
      endsOn: `${next}-12-31`,
    });
    expect(post.request.headers.has('Idempotency-Key')).toBe(true);
    post.flush({ id: 'y-next', label: label2 }, { status: 201, statusText: 'Created' });
    (await request((u) => u === '/api/v1/console/academic-years')).flush(years);
    await settle();
    expect(document.querySelector('#ny-l')).toBeNull();
    expect(toasts()).toContain(`Academic year ${label2} added`);
  });

  it('adds an entry: the prototype’s checks with register wording, then ACA-005', async () => {
    const el = await open();
    (el.querySelector('#cal-new') as HTMLButtonElement).click();
    await settle();
    const d = drawer();
    expect(text(d.querySelector('.sh-t h3'))).toBe('New calendar entry');
    expect(text(d)).toContain(`Entries belong to the ${label} calendar`);
    // An end before the start, and no title.
    type(d.querySelector('#cal-sd') as HTMLInputElement, `${Y}-05-10`, 'change');
    type(d.querySelector('#cal-ed') as HTMLInputElement, `${Y}-05-09`, 'change');
    (d.querySelector('#cal-save') as HTMLButtonElement).click();
    await settle();
    expect(text(d)).toContain('Enter a title of 3 to 80 characters.');
    expect(text(d)).toContain('The end date can’t be before the start date.');

    type(d.querySelector('#cal-title') as HTMLInputElement, 'Science exhibition');
    type(d.querySelector('#cal-ed') as HTMLInputElement, `${Y}-05-11`, 'change');
    // For classes: nothing ticked is refused.
    ([...d.querySelectorAll('input[name="cal-tg"]')] as HTMLInputElement[])[1]!.click();
    await settle();
    (d.querySelector('#cal-save') as HTMLButtonElement).click();
    await settle();
    expect(text(d)).toContain('Choose who the entry is for.');
    ([...d.querySelectorAll('#cal-classes input')] as HTMLInputElement[])[1]!.click();
    ([...d.querySelectorAll('.cc-checks input')] as HTMLInputElement[]).at(-1)!.click(); // On the day at 7:00 AM
    await settle();
    (d.querySelector('#cal-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/calendar-events', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      yearId: 'y-now',
      type: 'Event',
      holidayType: null,
      title: 'Science exhibition',
      description: null,
      allDay: true,
      startDate: `${Y}-05-10`,
      endDate: `${Y}-05-11`,
      startTime: null,
      endTime: null,
      location: null,
      audience: { kind: 'CLASS', ids: ['c-7'] },
      recurrence: 'NONE',
      repeatUntil: null,
      colour: '#0C6F7D',
      reminders: ['MORNING_OF'],
    });
    post.flush(
      { code: 'ACA.CAL_DUPLICATE', params: { title: 'Science exhibition', date: '10 May' } },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expect(text(d)).toContain('Science exhibition is already on the calendar on 10 May.');

    (d.querySelector('#cal-save') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/console/calendar-events', 'POST')).flush(
      entry({
        id: 'e-9',
        type: 'Event',
        title: 'Science exhibition',
        startDate: `${Y}-05-10`,
        endDate: `${Y}-05-11`,
      }),
    );
    (await request((u) => u === '/api/v1/console/calendar-events?yearId=y-now&deleted=true')).flush(
      calendar(),
    );
    await settle();
    expect(document.querySelector('.drawer')).toBeNull();
    expect(toasts()).toContain('Entry added');
    expect(text(el.querySelector('#cal-month h3'))).toContain('May');
  });

  it('edits an entry with its version and deletes one after a confirmation', async () => {
    const el = await open();
    ([...el.querySelectorAll('.cc-cal .ev')] as HTMLButtonElement[])
      .find((b) => text(b).includes('Parent–teacher'))!
      .click();
    await settle();
    const d = drawer();
    expect((d.querySelector('#cal-st') as HTMLInputElement).value).toBe('09:30');
    expect(
      ([...d.querySelectorAll('#cal-classes input')] as HTMLInputElement[]).map((i) => i.checked),
    ).toEqual([true, false]);
    type(d.querySelector('#cal-et') as HTMLInputElement, '09:00', 'change');
    (d.querySelector('#cal-save') as HTMLButtonElement).click();
    await settle();
    expect(text(d)).toContain('The end time must be after the start time.');
    type(d.querySelector('#cal-et') as HTMLInputElement, '12:30', 'change');
    (d.querySelector('#cal-save') as HTMLButtonElement).click();
    const patch = await request((u) => u === '/api/v1/console/calendar-events/e-2', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v3"');
    expect(patch.request.body).toMatchObject({
      type: 'PTM',
      allDay: false,
      startTime: '09:30',
      endTime: '12:30',
      audience: { kind: 'CLASS', ids: ['c-6'] },
      reminders: ['DAY_BEFORE'],
    });
    patch.flush({ ...ptm, endTime: '12:30', version: 4 });
    (await request((u) => u === '/api/v1/console/calendar-events?yearId=y-now&deleted=true')).flush(
      calendar(),
    );
    await settle();
    expect(toasts()).toContain('Entry updated');

    ([...el.querySelectorAll('.cc-cal .ev')] as HTMLButtonElement[])
      .find((b) => text(b).includes('Founders'))!
      .click();
    await settle();
    (drawer().querySelector('#cal-del') as HTMLButtonElement).click();
    await confirm();
    (await request((u) => u === '/api/v1/console/calendar-events/e-1', 'DELETE')).flush({
      ...holiday,
      deleted: { at: new Date().toISOString() },
    });
    (await request((u) => u === '/api/v1/console/calendar-events?yearId=y-now&deleted=true')).flush(
      calendar([ptm, gone]),
    );
    await settle();
    expect(toasts()).toContain('Entry deleted');
  });

  it('checks a spreadsheet, then imports the accepted rows (ACA-008)', async () => {
    const el = await open();
    (el.querySelector('#cal-upload') as HTMLButtonElement).click();
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(text(m)).toContain('Columns: type, title, start date, end date, all day, colour.');
    const input = m.querySelector('#bu-file') as HTMLInputElement;
    const file = new File(['type,title,start_date\nHoliday,Diwali,2026-11-08\n'], 'cal.csv', {
      type: 'text/csv',
    });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await settle();
    (m.querySelector('#bu-check') as HTMLButtonElement).click();
    const check = await request((u) => u === '/api/v1/console/calendar-events/uploads', 'POST');
    const form = check.request.body as FormData;
    expect(form.get('commit')).toBe('false');
    expect(form.get('yearId')).toBe('y-now');
    expect(check.request.headers.get('Idempotency-Key')).toBeTruthy();
    const report = {
      year: calendar().year,
      committed: false,
      accepted: 1,
      rejected: 1,
      imported: 0,
      rows: [
        {
          row: 1,
          type: 'Holiday',
          title: 'Diwali',
          startDate: `${Y}-11-08`,
          endDate: `${Y}-11-08`,
          accepted: true,
          code: null,
        },
        {
          row: 2,
          type: 'Holiday',
          title: 'Founders Day',
          startDate: `${M}-10`,
          endDate: `${M}-10`,
          accepted: false,
          code: 'ACA.CAL_DUPLICATE',
        },
      ],
    };
    check.flush(report);
    await settle();
    expect(text(m.querySelector('#bu-report'))).toContain('1 ready');
    expect(text(m.querySelector('#bu-report'))).toContain(
      'Founders Day is already on the calendar',
    );
    (m.querySelector('#bu-import') as HTMLButtonElement).click();
    const commit = await request((u) => u === '/api/v1/console/calendar-events/uploads', 'POST');
    expect((commit.request.body as FormData).get('commit')).toBe('true');
    commit.flush({ ...report, committed: true, imported: 1 });
    (await request((u) => u === '/api/v1/console/calendar-events?yearId=y-now&deleted=true')).flush(
      calendar(),
    );
    await settle();
    expect(toasts()).toContain('1 entry imported');
  });

  it('a closed year is read-only, with the banner back to the current year', async () => {
    const el = await open();
    ([...el.querySelectorAll('#cal-year-b')] as HTMLButtonElement[])[0]!.click();
    await settle();
    ([...document.querySelectorAll('.dd-opt')] as HTMLButtonElement[])
      .find((b) => text(b).includes('2019-20'))!
      .click();
    (await request((u) => u === '/api/v1/console/calendar-events?yearId=y-old&deleted=true')).flush(
      {
        ...calendar([
          entry({
            id: 'e-old',
            startDate: '2019-06-10',
            endDate: '2019-06-10',
            occurrences: [{ start: '2019-06-10', end: '2019-06-10' }],
          }),
        ]),
        year: {
          id: 'y-old',
          label: '2019-20',
          startsOn: '2019-06-01',
          endsOn: '2020-03-31',
          closed: true,
          current: false,
        },
      },
    );
    await settle();
    expect(text(document.querySelector('.c-yr-banner'))).toContain(
      "You're viewing 2019-20, which is closed.",
    );
    expect((el.querySelector('#cal-new') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('#cal-new')!.parentElement!.getAttribute('title')).toBe(
      '2019-20 is closed. Its records can’t be changed; ask for a correction instead.',
    );
    expect(el.querySelector('.cc-add')).toBeNull();
    ([...el.querySelectorAll('.cc-cal .ev')] as HTMLButtonElement[])[0]!.click();
    await settle();
    expect(drawer().querySelector('#cal-view')).not.toBeNull();
    expect(drawer().querySelector('#cal-save')).toBeNull();
  });

  it('tells a role without the task that it has no access', async () => {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/calendar');
    (await request((u) => u === '/api/v1/console/session')).flush(
      session({ subTasks: ['home.view', 'task.home'] }),
    );
    await nav;
    await settle();
    TestBed.inject(HttpTestingController).expectNone((r) => r.url.includes('calendar-events'));
    expect(text(harness.routeNativeElement)).toContain("You don't have access to this page");
  });
});
