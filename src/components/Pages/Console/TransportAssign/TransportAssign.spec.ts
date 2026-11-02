import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { translate } from '../../../Utils/translate';
import type { Assignment, Crew, Session } from '../Transport/transport.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
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

const session = (subTasks = ['transport.view', 'transport.edit']) => ({
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    shortName: 'TVPS',
    city: 'Shivamogga',
  },
  roles: [{ code: 'TRANSPORT_ADMIN', name: 'Transport Administrator', readOnly: false }],
  subTasks: ['home.view', 'task.home', 'task.transport', ...subTasks],
  preferredLang: 'en',
});
const morning: Session = {
  id: 's-1',
  name: 'Morning pickup',
  direction: 'PICKUP',
  startTime: '07:15',
  endTime: '08:30',
  days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
  daily: true,
  active: true,
  version: 1,
};
const evening: Session = {
  ...morning,
  id: 's-2',
  name: 'Afternoon drop',
  direction: 'DROP',
  startTime: '15:30',
  endTime: null,
  days: ['MON', 'FRI'],
  daily: false,
};
const crew = (id: string, name: string, role: Crew['role']): Crew => ({
  id,
  member: { id: `m-${id}`, name },
  role,
  licenceNo: role === 'DRIVER' ? 'KA14 20110004521' : null,
  licenceExpiry: role === 'DRIVER' ? '2029-06-30' : null,
  licenceExpired: false,
  employeeRef: `REF-${id}`,
  active: true,
  version: 1,
});
const a1: Assignment = {
  id: 'a-1',
  route: { id: 'r-1', code: 'R1', name: 'Vinoba Nagar' },
  session: { id: 's-1', name: 'Morning pickup', direction: 'PICKUP', startTime: '07:15' },
  vehicle: { id: 'v-1', name: 'Bus 1', registration: 'KA-14-F-2231' },
  driver: { id: 'c-1', name: 'MANJUNATH GOWDA' },
  attendant: null,
  from: '2026-04-01',
  to: '2099-03-31',
  active: true,
  version: 3,
};
const vehicle = (id: string, name: string) => ({
  id,
  name,
  registration: `KA-14-F-${id.slice(-1)}000`,
  capacity: 40,
  gps: { enabled: false, device: null },
  active: true,
  version: 1,
});

describe('console sessions and assignments (TRN-014…019)', () => {
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
  async function open() {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/tassign');
    (await request((u) => u === '/api/v1/console/session')).flush(session());
    await nav;
    await settle();
    (await request((u) => u === '/api/v1/console/vehicle-assignments')).flush({ items: [a1] });
    (await request((u) => u === '/api/v1/console/transport-sessions')).flush({
      items: [morning, evening],
    });
    (await request((u) => u === '/api/v1/console/routes')).flush({
      items: [
        { id: 'r-1', code: 'R1', name: 'Vinoba Nagar', active: true, stops: [], passengers: 0 },
        { id: 'r-4', code: 'R4', name: 'Old town loop', active: false, stops: [], passengers: 0 },
      ],
    });
    (await request((u) => u === '/api/v1/console/vehicles')).flush({
      items: [vehicle('v-1', 'Bus 1'), vehicle('v-2', 'Bus 2')],
    });
    (await request((u) => u === '/api/v1/console/crew')).flush({
      items: [
        crew('c-1', 'MANJUNATH GOWDA', 'DRIVER'),
        crew('c-3', 'RAMESH NAIK', 'DRIVER'),
        crew('c-2', 'LALITHA SHETTY', 'ATTENDANT'),
      ],
    });
    (await request((u) => u.startsWith('/api/v1/console/passenger-allocations'))).flush({
      year: { id: 'y', label: '2026-27', startsOn: '2026-04-01', endsOn: '2099-03-31' },
      items: [],
      nextCursor: null,
    });
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }
  const pick = async (id: string, label: string) => {
    (document.querySelector(`#${id}-b`) as HTMLButtonElement).click();
    await settle(1);
    ([...document.querySelectorAll('.dd-opt')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith(label))!
      .click();
    await settle(1);
  };

  it('lists the assignments and the sessions with their days', async () => {
    const el = await open();
    expect(words(el.querySelector('#va-table tbody tr'))).toBe(
      'R1 Vinoba Nagar Morning pickup 7:15 AM · Pickup Bus 1 Manjunath Gowda — 1 Apr – 31 Mar 2099 Current',
    );
    ([...el.querySelectorAll('.tabs .tab')] as HTMLButtonElement[])[1]!.click();
    await settle();
    const rows = [...el.querySelectorAll('#ss-table tbody tr')];
    expect(words(rows[1])).toBe('Afternoon drop Drop 3:30 PM Mo Tu We Th Fr Sa Su 0 Active');
    expect([...rows[1]!.querySelectorAll('.cc-days .on')].map((x) => text(x))).toEqual([
      'Mo',
      'Fr',
    ]);
  });

  it('checks a new assignment, then creates it (TRN-018)', async () => {
    const el = await open();
    (el.querySelector('#ta-new') as HTMLButtonElement).click();
    await settle();
    await pick('va-r', 'R4');
    await pick('va-d', 'Manjunath');
    (document.querySelector('#va-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#va-r-e'))).toBe(translate('TRN.ROUTE_INACTIVE'));
    expect(text(document.querySelector('#va-s-e'))).toBe('Choose a session');
    expect(text(document.querySelector('#va-v-e'))).toBe('Choose a vehicle');
    await pick('va-r', 'R1');
    await pick('va-s', 'Afternoon drop');
    await pick('va-v', 'Bus 2');
    await pick('va-a', 'Lalitha');
    (document.querySelector('#va-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/vehicle-assignments', 'POST');
    expect(post.request.body).toEqual({
      routeId: 'r-1',
      sessionId: 's-2',
      vehicleId: 'v-2',
      driverId: 'c-1',
      attendantId: 'c-2',
      from: expect.any(String),
      to: '2099-03-31',
    });
  });

  it('changes only the crew of an assignment, with If-Match (TRN-019)', async () => {
    const el = await open();
    (el.querySelector('#va-table tbody tr') as HTMLElement).click();
    await settle();
    expect((document.querySelector('#va-r-b') as HTMLButtonElement).disabled).toBe(true);
    await pick('va-d', 'Ramesh');
    (document.querySelector('#va-save') as HTMLButtonElement).click();
    const patch = await request((u) => u === '/api/v1/console/vehicle-assignments/a-1', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v3"');
    expect(patch.request.body).toEqual({ driverId: 'c-3' });
    patch.flush({ code: 'TRN.DRIVER_BOOKED' }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(text(document.querySelector('#va-err'))).toBe(
      `Not saved. ${translate('TRN.DRIVER_BOOKED')}`,
    );
  });

  it('checks a session’s times and days before adding it (TRN-015)', async () => {
    const el = await open();
    ([...el.querySelectorAll('.tabs .tab')] as HTMLButtonElement[])[1]!.click();
    await settle();
    (el.querySelector('#ta-new') as HTMLButtonElement).click();
    await settle();
    const set = (id: string, v: string) => {
      const i = document.querySelector(id) as HTMLInputElement;
      i.value = v;
      i.dispatchEvent(new Event('input'));
    };
    set('#ss-n', 'morning pickup');
    set('#ss-e', '07:00');
    for (const d of ['MON', 'TUE', 'WED', 'THU', 'FRI'])
      (document.querySelector(`#ss-${d}`) as HTMLInputElement).click();
    (document.querySelector('#ss-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#ss-n-e'))).toBe('morning pickup already exists');
    expect(text(document.querySelector('#ss-e-e'))).toBe(translate('TRN.SESSION_TIMES'));
    expect(text(document.querySelector('#ss-days-e'))).toBe(translate('TRN.SESSION_DAYS'));
    set('#ss-n', 'Evening drop');
    set('#ss-e', '');
    (document.querySelector('#ss-SAT') as HTMLInputElement).click();
    ([...document.querySelectorAll('input[name="ss-d"]')] as HTMLInputElement[])[1]!.click();
    (document.querySelector('#ss-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/transport-sessions', 'POST');
    expect(post.request.body).toEqual({
      name: 'Evening drop',
      direction: 'DROP',
      startTime: '07:15',
      endTime: null,
      days: ['SAT'],
    });
  });
});
