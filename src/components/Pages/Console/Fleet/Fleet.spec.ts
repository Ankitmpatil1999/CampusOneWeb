import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { istBusinessDate } from '../../../Utils/format';
import { translate } from '../../../Utils/translate';
import type { Assignment, Crew, Vehicle } from '../Transport/transport.api';

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

const today = istBusinessDate(new Date());
const session = (subTasks = ['transport.view', 'transport.edit'], ro = false) => ({
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
      : { code: 'TRANSPORT_ADMIN', name: 'Transport Administrator', readOnly: false },
  ],
  subTasks: ['home.view', 'task.home', 'task.transport', ...subTasks],
  preferredLang: 'en',
});
const v1: Vehicle = {
  id: 'v-1',
  name: 'Bus 1',
  registration: 'KA-14-F-2231',
  capacity: 12,
  gps: { enabled: false, device: null },
  active: true,
  version: 2,
};
const v2: Vehicle = {
  ...v1,
  id: 'v-2',
  name: 'Bus 4',
  registration: 'KA-14-F-0942',
  capacity: 40,
  active: false,
};
const driver: Crew = {
  id: 'c-1',
  member: { id: 'm-1', name: 'MANJUNATH GOWDA' },
  role: 'DRIVER',
  licenceNo: 'KA14 20110004521',
  licenceExpiry: '2029-06-30',
  licenceExpired: false,
  employeeRef: 'TVPS-D-0011',
  active: true,
  version: 1,
};
const attendant: Crew = {
  ...driver,
  id: 'c-2',
  member: { id: 'm-2', name: 'LALITHA SHETTY' },
  role: 'ATTENDANT',
  licenceNo: null,
  licenceExpiry: null,
  employeeRef: 'TVPS-A-0021',
};
const a1: Assignment = {
  id: 'a-1',
  route: { id: 'r-1', code: 'R1', name: 'Vinoba Nagar' },
  session: { id: 's-1', name: 'Morning pickup', direction: 'PICKUP', startTime: '07:15' },
  vehicle: { id: 'v-1', name: 'Bus 1', registration: 'KA-14-F-2231' },
  driver: { id: 'c-1', name: 'Manjunath Gowda' },
  attendant: { id: 'c-2', name: 'Lalitha Shetty' },
  from: '2026-04-01',
  to: '2099-03-31',
  active: true,
  version: 1,
};

describe('console vehicles and crew (TRN-008…013)', () => {
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
  async function open(sess = session()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/fleet');
    (await request((u) => u === '/api/v1/console/session')).flush(sess);
    await nav;
    await settle();
    (await request((u) => u === '/api/v1/console/vehicles')).flush({ items: [v1, v2] });
    (await request((u) => u === '/api/v1/console/crew')).flush({ items: [driver, attendant] });
    (await request((u) => u === '/api/v1/console/vehicle-assignments')).flush({ items: [a1] });
    (await request((u) => u === '/api/v1/console/routes')).flush({
      items: [
        { id: 'r-1', code: 'R1', name: 'Vinoba Nagar', passengers: 14, stops: [], active: true },
      ],
    });
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }
  const set = (id: string, v: string) => {
    const i = document.querySelector(id) as HTMLInputElement;
    i.value = v;
    i.dispatchEvent(new Event('input'));
  };

  it('lists the vehicles with their assignments and peak passengers', async () => {
    const el = await open();
    const rows = [...el.querySelectorAll('#vh-table tbody tr')].map(words);
    expect(rows).toEqual([
      'Bus 1 KA-14-F-2231 12 R1 · Morning pickup 14 over capacity Active',
      'Bus 4 KA-14-F-0942 40 Not assigned 0 Inactive',
    ]);
  });

  it('checks a new vehicle and adds it (TRN-009)', async () => {
    const el = await open();
    (el.querySelector('#fl-new') as HTMLButtonElement).click();
    await settle();
    set('#vh-b', 'bus 1');
    set('#vh-r', 'KA 14 F 2231');
    (document.querySelector('#vh-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#vh-b-e'))).toBe('bus 1 already exists');
    expect(text(document.querySelector('#vh-r-e'))).toBe(
      'This registration is already registered to another vehicle',
    );
    set('#vh-b', 'Van 5');
    set('#vh-r', 'KA14X');
    (document.querySelector('#vh-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#vh-r-e'))).toBe('Use the format KA-14-F-2231');
    set('#vh-r', 'KA-14-B-7781');
    set('#vh-c', '14');
    (document.querySelector('#vh-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/vehicles', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      name: 'Van 5',
      registration: 'KA-14-B-7781',
      capacity: 14,
    });
  });

  it('keeps an assigned vehicle active', async () => {
    const el = await open();
    (el.querySelector('#vh-table tbody tr') as HTMLElement).click();
    await settle();
    (document.querySelector('#vh-a') as HTMLInputElement).click();
    (document.querySelector('#vh-save') as HTMLButtonElement).click();
    await settle(1);
    expect(toasts()).toContain('Still assigned');
    TestBed.inject(HttpTestingController).expectNone((r) => r.method === 'PATCH');
  });

  it('adds a driver with a licence that expires in the future (TRN-012)', async () => {
    const el = await open();
    ([...el.querySelectorAll('.tabs .tab')] as HTMLButtonElement[])[1]!.click();
    await settle();
    expect(words(el.querySelector('#cw-table tbody tr'))).toBe(
      'MG Manjunath Gowda Licence valid till 30 Jun 2029 Driver KA14 20110004521 TVPS-D-0011 R1 · Morning pickup Active',
    );
    (el.querySelector('#fl-new') as HTMLButtonElement).click();
    await settle();
    (await request((u) => u.startsWith('/api/v1/console/passenger-allocations?kind=STAFF'))).flush({
      year: { id: 'y', label: '2026-27' },
      items: [
        {
          member: {
            id: 'm-1',
            name: 'MANJUNATH GOWDA',
            admissionNo: null,
            class: null,
            section: null,
            type: 'Staff',
          },
          allocation: null,
        },
        {
          member: {
            id: 'm-9',
            name: 'RAMESH NAIK',
            admissionNo: null,
            class: null,
            section: null,
            type: 'Staff',
          },
          allocation: null,
        },
      ],
      nextCursor: null,
    });
    await settle();
    (document.querySelector('#cw-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#cw-m-e'))).toBe('Choose a member');
    expect(text(document.querySelector('#cw-l-e'))).toBe('A driver needs a licence number');
    expect(text(document.querySelector('#cw-x-e'))).toBe(translate('TRN.LICENCE_REQUIRED'));
    (document.querySelector('#cw-m-b') as HTMLButtonElement).click();
    await settle(1);
    const opts = [...document.querySelectorAll('.dd-opt')] as HTMLButtonElement[];
    expect(opts.map((o) => words(o))).toEqual(['Ramesh Naik Staff']);
    opts[0]!.click();
    await settle(1);
    set('#cw-l', 'ka14 20150008812');
    const x = document.querySelector('#cw-x') as HTMLInputElement;
    x.value = '2028-11-30';
    x.dispatchEvent(new Event('change'));
    set('#cw-e', 'tvps-d-0011');
    (document.querySelector('#cw-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#cw-e-e'))).toBe('This employee reference is already used');
    set('#cw-e', 'TVPS-D-0012');
    (document.querySelector('#cw-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/crew', 'POST');
    expect(post.request.body).toEqual({
      memberId: 'm-9',
      role: 'DRIVER',
      licenceNo: 'KA14 20150008812',
      licenceExpiry: '2028-11-30',
      employeeRef: 'TVPS-D-0012',
    });
    expect(today).toBeTruthy();
  });

  it('is read-only for Management', async () => {
    const el = await open(session(['transport.view'], true));
    expect((el.querySelector('#fl-new') as HTMLButtonElement).disabled).toBe(true);
    (el.querySelector('#vh-table tbody tr') as HTMLElement).click();
    await settle();
    expect(document.querySelector('#vh-save')).toBeNull();
  });
});
