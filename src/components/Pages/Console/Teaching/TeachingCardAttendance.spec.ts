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
import { CARD_READER_URL } from '../../../Utils/card-reader';
import type { MyPeriod, Register } from './classes.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
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
async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 200; i++) {
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
  name: 'RAVI RAO',
  email: 'ravi@tvps.example.in',
  institution: { id: 'i-1', name: 'Tunga Valley Public School', shortName: 'TVPS', city: 'X' },
  roles: [{ code: 'TEACHER', name: 'Teacher', readOnly: false }],
  subTasks: ['task.teaching', 'teaching.view', 'teaching.attendance'],
  preferredLang: 'en',
};
const section = { id: 's-1', label: 'Grade 6 A' };
const student = (id: string, name: string, no: string) => ({ id, name, admissionNo: no });
const register = (): Register => ({
  date: '2026-10-13',
  section,
  sections: [section],
  holiday: null,
  sunday: false,
  counts: { students: 3, present: 1, late: 0, halfDay: 0, absent: 0, notMarked: 2, onLeave: 0 },
  items: [
    {
      student: student('st-1', 'Asha Rao', 'ADM/1'),
      status: 'PRESENT',
      method: 'NFC',
      remark: null,
      onApprovedLeave: false,
    },
    {
      student: student('st-2', 'Bala Rao', 'ADM/2'),
      status: null,
      method: null,
      remark: null,
      onApprovedLeave: false,
    },
    {
      student: student('st-3', 'Chetan K', 'ADM/3'),
      status: null,
      method: null,
      remark: null,
      onApprovedLeave: false,
    },
  ],
});
const myPeriod = (slotId: string): MyPeriod => ({
  slotId,
  period: { name: 'Period 2', startsAt: '00:00', endsAt: '23:59' },
  subject: { name: 'Science', colour: '' },
  section,
  students: 2,
  captured: 0,
  state: 'NOW',
});

/** CampusOne Card Reader on this computer with one card on it (read once, then taken off). */
function readerWithCard(token: string) {
  let cards = [token];
  const real = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (!u.startsWith(CARD_READER_URL)) return real(url as RequestInfo, init);
      const path = u.slice(CARD_READER_URL.length);
      if (path === '/status') return new Response('{"ok":true}', { status: 200 });
      if (path === '/token') {
        const next = cards.shift();
        return next
          ? new Response(JSON.stringify({ token: btoa(next) }), { status: 200 })
          : new Response('{"error":"no card"}', { status: 409 });
      }
      return new Response('{}', { status: 404 });
    }),
  );
  return { put: (t: string) => (cards = [t]) };
}

describe('taking attendance by card on the web (client 2026-10-13; ATT-028)', () => {
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
  afterEach(() => vi.unstubAllGlobals());

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

  it('marks the class register as each student taps, then the rest absent', async () => {
    const el = await open('/console/teaching-attendance');
    (await request((u) => u.startsWith('/api/v1/teacher/attendance/register?'))).flush(register());
    await settle();
    expect(text(el.querySelector('#ta-card'))).toContain('Take attendance by card');
    expect(el.querySelector('#ta-rest-absent')).toBeNull();

    readerWithCard('NFCCHETAN0000003');
    (el.querySelector('#ta-card-start') as HTMLButtonElement).click();
    const tap = await request((u) => u === '/api/v1/teacher/attendance/card-taps', 'POST');
    expect(tap.request.body).toEqual({
      cardToken: 'NFCCHETAN0000003',
      mode: 'DAILY',
      classSectionId: 's-1',
    });
    expect(tap.request.headers.has('Idempotency-Key')).toBe(true);
    expect(tap.request.headers.get('X-CampusOne-Surface')).toBe('console');
    tap.flush({
      result: 'MARKED',
      status: 'PRESENT',
      student: { id: 'st-3', name: 'Chetan K' },
      at: '2026-10-13T03:30:00.000Z',
    });
    await settle(6);
    expect(text(el.querySelector('#ta-card-feed'))).toContain('Chetan K Marked Present');
    expect(text(el.querySelector('#ta-card-count'))).toBe('1 marked by card');
    expect(text(el.querySelector('#ta-grid tbody'))).toContain('Chetan K Reader');
    expect(text(el.querySelector('#ta-kpis'))).toContain('2 of 3 marked');
    expect(text(el.querySelector('#ta-card-rest'))).toContain('mark the rest absent');

    // Bala didn't tap: the rest absent, then the register is saved with Bala only.
    (el.querySelector('#ta-card-stop') as HTMLButtonElement).click();
    (el.querySelector('#ta-rest-absent') as HTMLButtonElement).click();
    await settle(1);
    expect(text(el.querySelector('#ta-kpis'))).toContain('3 of 3 marked');
    (el.querySelector('#ta-save') as HTMLButtonElement).click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(dlg)).toContain('2 present · 0 late · 0 half day · 1 absent');
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const put = await request((u) => u === '/api/v1/teacher/attendance/register', 'PUT');
    expect(put.request.body.entries).toEqual([
      { studentId: 'st-2', status: 'ABSENT', remark: null },
    ]);
    put.flush({ saved: 1, overridden: 0 });
    (await request((u) => u.startsWith('/api/v1/teacher/attendance/register?'))).flush(register());
    await settle();
  });

  it('lets any teacher of the class record a student who missed the gate (By card)', async () => {
    const el = await open('/console/teaching-attendance');
    (await request((u) => u.startsWith('/api/v1/teacher/attendance/register?'))).flush(
      { status: 403, code: 'ATT.NO_CLASSES', detail: 'No classes.' },
      { status: 403, statusText: 'Forbidden' },
    );
    (await request((u) => u.startsWith('/api/v1/teacher/attendance/periods?'))).flush({
      date: '2026-10-13',
      items: [],
    });
    await settle();
    expect(el.querySelector('#ta-tab-card')).not.toBeNull();
    expect(text(el.querySelector('#ta-not-ct'))).toContain('missed tapping at the gate');
    (el.querySelector('#ta-goto-card') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/teacher/classes')).flush({
      items: [
        { id: 's-1', label: 'Nursery A', students: 2, classTeacher: false, subjects: [] },
        { id: 's-2', label: 'Grade 6 A', students: 30, classTeacher: false, subjects: [] },
      ],
    });
    (await request((u) => u === '/api/v1/teacher/classes/s-1/students')).flush({
      section: { id: 's-1', label: 'Nursery A', classTeacher: false },
      items: [
        {
          id: 'st-1',
          name: 'Asha Rao',
          admissionNo: 'ADM/1',
          gender: 'F',
          attendanceToday: 'PRESENT',
        },
        { id: 'st-2', name: 'Bala Rao', admissionNo: 'ADM/2', gender: 'M', attendanceToday: null },
      ],
    });
    await settle();
    // Today only: no date to choose; the class is chosen.
    expect(el.querySelector('#ta-date')).toBeNull();
    expect(text(el.querySelector('#ta-card-why'))).toContain('didn’t tap at the gate');
    expect(text(el.querySelector('#ta-cgrid tbody'))).toContain('Asha Rao Present');
    expect(text(el.querySelector('#ta-cgrid tbody'))).toContain('Bala Rao Not marked');

    readerWithCard('NFCBALA000000002');
    (el.querySelector('#ta-card-start') as HTMLButtonElement).click();
    const tap = await request((u) => u === '/api/v1/teacher/attendance/card-taps', 'POST');
    expect(tap.request.body).toEqual({
      cardToken: 'NFCBALA000000002',
      mode: 'DAILY',
      classSectionId: 's-1',
    });
    tap.flush({
      result: 'MARKED',
      status: 'PRESENT',
      student: { id: 'st-2', name: 'Bala Rao' },
      at: '2026-10-13T11:30:00.000Z',
    });
    await settle(6);
    expect(text(el.querySelector('#ta-cgrid tbody'))).toContain('Bala Rao Card Present');
    expect(text(el.querySelector('#ta-card-feed'))).toContain('Bala Rao Marked Present');
    (el.querySelector('#ta-card-stop') as HTMLButtonElement).click();
  });

  it('keeps periods to marking by hand (no card reading there)', async () => {
    const el = await open('/console/teaching-attendance');
    (await request((u) => u.startsWith('/api/v1/teacher/attendance/register?'))).flush(
      { status: 403, code: 'ATT.NO_CLASSES', detail: 'No classes.' },
      { status: 403, statusText: 'Forbidden' },
    );
    (await request((u) => u.startsWith('/api/v1/teacher/attendance/periods?'))).flush({
      date: '2026-10-13',
      items: [myPeriod('s-1.p2')],
    });
    await settle();
    (el.querySelector('#ta-take-0') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/teacher/classes/s-1/students')).flush({
      section: { ...section, classTeacher: false },
      items: [
        { id: 'st-1', name: 'Asha Rao', admissionNo: 'ADM/1', gender: 'F', attendanceToday: null },
      ],
    });
    await settle();
    expect(el.querySelector('#ta-card')).toBeNull();
    expect(el.querySelector('#ta-psave')).not.toBeNull();
  });

  it('says so when the card reader doesn’t start', async () => {
    const el = await open('/console/teaching-attendance');
    (await request((u) => u.startsWith('/api/v1/teacher/attendance/register?'))).flush(register());
    await settle();
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });
    (el.querySelector('#ta-card-start') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(25_000);
    vi.useRealTimers();
    await settle();
    expect(text(el.querySelector('#ta-card-note'))).toContain(
      'CampusOne Card Reader didn’t start on this computer',
    );
  });
});
