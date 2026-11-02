import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import type { Route, Stop } from '../Transport/transport.api';

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
const s = (id: string, name: string, landmark: string, routes = 1): Stop => ({
  id,
  name,
  landmark,
  lat: 13.93,
  lng: 75.56,
  active: true,
  routes,
  version: 1,
});
const stops = [
  s('sp-0', 'School campus', 'Main gate'),
  s('sp-1', 'Durgigudi', 'Temple road'),
  s('sp-2', 'Vinoba Nagar Circle', 'Police station'),
  s('sp-3', 'Basavanagudi', '1st main', 0),
];
const rs = (seq: number, x: Stop, km: number, fromSchoolKm = km) => ({
  seq,
  stop: { id: x.id, name: x.name, landmark: x.landmark, active: true },
  arrival: null,
  departure: null,
  distanceKm: km,
  fromSchoolKm,
});
const r1: Route = {
  id: 'r-1',
  code: 'R1',
  name: 'Vinoba Nagar – Ravindra Nagar',
  description: 'North-east loop',
  type: 'MORNING',
  mapLink: null,
  active: true,
  distanceKm: 3.4,
  passengers: 9,
  stops: [rs(0, stops[0]!, 0), rs(1, stops[1]!, 1.8), rs(2, stops[2]!, 1.6, 3.4)],
  version: 4,
};

describe('console routes and stops (TRN-001…007)', () => {
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
    const nav = harness.navigateByUrl('/console/routes');
    (await request((u) => u === '/api/v1/console/session')).flush(sess);
    await nav;
    await settle();
    if (sess.subTasks.includes('transport.view')) {
      (await request((u) => u === '/api/v1/console/routes')).flush({ items: [r1] });
      (await request((u) => u === '/api/v1/console/stops')).flush({ items: stops });
      (await request((u) => u === '/api/v1/console/vehicle-assignments')).flush({ items: [] });
      (await request((u) => u.startsWith('/api/v1/console/transport/reports/allocation'))).flush({
        kind: 'allocation',
        from: '2026-10-04',
        to: '2026-10-04',
        items: [{ route: 'R1 · Vinoba Nagar – Ravindra Nagar', stop: 'Durgigudi', passengers: 4 }],
      });
      await settle();
    }
    return harness.routeNativeElement as HTMLElement;
  }

  it('lists the routes with their stops, length and passengers', async () => {
    const el = await open();
    expect(words(el.querySelector('#rt-table tbody tr'))).toBe(
      'R1 Vinoba Nagar – Ravindra Nagar North-east loop 3 · School campus → Vinoba Nagar Circle 3.4 km 0 9 — Active',
    );
  });

  it('edits the ordered stops and saves them whole with If-Match (TRN-004)', async () => {
    const el = await open();
    (el.querySelector('#rt-table tbody tr') as HTMLElement).click();
    await settle();
    const d = document.querySelector('.drawer') as HTMLElement;
    const lines = () =>
      [...d.querySelectorAll('#rt-stops .cc-rs')].map((x) => words(x.querySelector('.grow')));
    // Each stop with its distance from the school (the transport fee's, client 2026-10-21).
    expect(lines()).toEqual([
      'School campus Main gate · School end',
      'Durgigudi Temple road · 1.8 km from the school',
      'Vinoba Nagar Circle Police station · 3.4 km from the school',
    ]);
    // Durgigudi has passengers on this route: it can't be removed.
    (
      d
        .querySelectorAll('#rt-stops .cc-rs')[1]!
        .querySelector('[aria-label="Remove stop"]') as HTMLButtonElement
    ).click();
    await settle(1);
    expect(toasts()).toContain("Durgigudi can't be removed");
    // Vinoba Nagar Circle moves up, Basavanagudi is added at 2.2 km.
    (
      d
        .querySelectorAll('#rt-stops .cc-rs')[2]!
        .querySelector('[aria-label="Move up"]') as HTMLButtonElement
    ).click();
    await settle(1);
    (d.querySelector('#rs-add-b') as HTMLButtonElement).click();
    await settle(1);
    ([...document.querySelectorAll('.dd-opt')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith('Basavanagudi'))!
      .click();
    await settle(1);
    (d.querySelector('#rs-add-go') as HTMLButtonElement).click();
    await settle(1);
    const km = [...d.querySelectorAll('#rt-stops .cc-km input')] as HTMLInputElement[];
    km[2]!.value = '2.2';
    km[2]!.dispatchEvent(new Event('input'));
    await settle(1);
    expect(lines().map((l) => l.split(' ')[0])).toEqual([
      'School',
      'Vinoba',
      'Durgigudi',
      'Basavanagudi',
    ]);
    (d.querySelector('#rt-save') as HTMLButtonElement).click();
    const put = await request((u) => u === '/api/v1/console/routes/r-1/stops', 'PUT');
    expect(put.request.headers.get('If-Match')).toBe('"v4"');
    expect(put.request.body).toEqual({
      stops: [
        { stopId: 'sp-0', seq: 0, distanceKm: 0 },
        { stopId: 'sp-2', seq: 1, distanceKm: 1.6 },
        { stopId: 'sp-1', seq: 2, distanceKm: 1.8 },
        { stopId: 'sp-3', seq: 3, distanceKm: 2.2 },
      ],
    });
  });

  it('checks a new route before adding it', async () => {
    const el = await open();
    (el.querySelector('#rt-new') as HTMLButtonElement).click();
    await settle();
    const set = (id: string, v: string) => {
      const i = document.querySelector(id) as HTMLInputElement;
      i.value = v;
      i.dispatchEvent(new Event('input'));
    };
    (document.querySelector('#rt-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#rt-c-e'))).toBe('Enter a route code');
    expect(text(document.querySelector('#rt-n-e'))).toBe('Enter a route name');
    set('#rt-c', 'r1');
    set('#rt-n', 'Gopala – Alkola');
    (document.querySelector('#rt-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#rt-c-e'))).toBe('R1 is already used');
    set('#rt-c', 'R2');
    (document.querySelector('#rt-save') as HTMLButtonElement).click();
    await settle(1);
    expect(toasts()).toContain('A route needs at least two stops');
    TestBed.inject(HttpTestingController).expectNone((r) => r.method === 'POST');
  });

  it('keeps a stop on an active route active, and checks the coordinates', async () => {
    const el = await open();
    ([...el.querySelectorAll('.tabs .tab')] as HTMLButtonElement[])[1]!.click();
    await settle();
    expect(words(el.querySelector('#sp-table tbody tr:nth-child(2)'))).toBe(
      'Durgigudi Temple road 13.930, 75.560 R1 4 Active',
    );
    (el.querySelector('#sp-table tbody tr:nth-child(2)') as HTMLElement).click();
    await settle();
    expect((document.querySelector('#sp-toggle') as HTMLButtonElement).disabled).toBe(true);
    const lat = document.querySelector('#sp-la') as HTMLInputElement;
    lat.value = '51.5';
    lat.dispatchEvent(new Event('input'));
    (document.querySelector('#sp-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#sp-la-e'))).toBe(
      'Latitude must be between 6 and 37 (India)',
    );
    lat.value = '13.931';
    lat.dispatchEvent(new Event('input'));
    (document.querySelector('#sp-save') as HTMLButtonElement).click();
    const patch = await request((u) => u === '/api/v1/console/stops/sp-1', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v1"');
    expect(patch.request.body).toEqual({
      name: 'Durgigudi',
      landmark: 'Temple road',
      lat: 13.931,
      lng: 75.56,
    });
  });

  it('charges per km or by distance range, and saves the ranges (client 2026-10-22)', async () => {
    const el = await open(session(['transport.view', 'transport.edit', 'transport.fees']));
    (el.querySelector('#rt-tab-fee') as HTMLButtonElement).click();
    await settle();
    const rule = {
      active: true,
      mode: 'PER_KM',
      ratePerKm: { amount: '1500.00', currency: 'INR' },
      ratePaisePerKm: 150_000,
      ranges: [],
      dueDay: 5,
      year: { id: 'y-1', label: '2026-27', months: 12 },
      version: 3,
    };
    (await request((u) => u === '/api/v1/console/transport/fee-rule')).flush(rule);
    await settle();
    // Per km: Durgigudi 1.8 km → 1.8 × 2 × ₹1,500 = ₹5,400.
    expect(words(el.querySelector('#tf-stops tbody tr'))).toBe(
      'R1 Durgigudi 1.8 km ₹5,400.00 ₹450.00',
    );
    expect(el.querySelector('#tf-ranges')).toBeNull();

    ([...el.querySelectorAll('#tf-mode button')] as HTMLButtonElement[])[1]!.click();
    await settle(1);
    expect(el.querySelector('#tf-rate')).toBeNull();
    const type = (id: string, v: string) => {
      const i = el.querySelector(id) as HTMLInputElement;
      i.value = v;
      i.dispatchEvent(new Event('input'));
    };
    // The second range must reach farther than the first.
    type('#tf-upto-0', '2');
    type('#tf-amount-0', '10000');
    (el.querySelector('#tf-add') as HTMLButtonElement).click();
    await settle(1);
    type('#tf-upto-1', '2');
    type('#tf-amount-1', '15000');
    (el.querySelector('#tf-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(el.querySelector('#tf-ranges-e'))).toContain('larger than the one before');
    type('#tf-upto-1', '3');
    await settle(1);
    // 1.8 km is in the first range; 3.4 km beyond the last isn't charged.
    expect(words(el.querySelector('#tf-stops tbody tr'))).toBe(
      'R1 Durgigudi 1.8 km ₹10,000.00 ₹833.00',
    );
    expect(words(el.querySelector('#tf-stops tbody tr:nth-child(2)'))).toBe(
      'R1 Vinoba Nagar Circle 3.4 km Not charged —',
    );
    (el.querySelector('#tf-save') as HTMLButtonElement).click();
    const put = await request((u) => u === '/api/v1/console/transport/fee-rule', 'PUT');
    expect(put.request.headers.get('If-Match')).toBe('"v3"');
    expect(put.request.body).toEqual({
      active: true,
      mode: 'RANGE',
      ranges: [
        { uptoKm: 2, yearlyPaise: 1_000_000 },
        { uptoKm: 3, yearlyPaise: 1_500_000 },
      ],
      dueDay: 5,
    });
  });

  it('is read-only for Management', async () => {
    const el = await open(session(['transport.view'], true));
    expect((el.querySelector('#rt-new') as HTMLButtonElement).disabled).toBe(true);
    (el.querySelector('#rt-table tbody tr') as HTMLElement).click();
    await settle();
    expect(document.querySelector('#rt-save')).toBeNull();
    expect(text(document.querySelector('.drawer .note.tone-info'))).toContain('read-only');
  });
});
