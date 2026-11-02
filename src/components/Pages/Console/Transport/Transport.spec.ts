import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { translate } from '../../../Utils/translate';
import type { Trip, TripDetail, TripList, TripStop } from './transport.api';
import { TRIP_STATUS, periodStatus } from './transport-format';

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
const trip = (over: Partial<Trip> & { id: string }): Trip => ({
  date: '2026-10-04',
  direction: 'PICKUP',
  session: 'Morning pickup',
  route: { id: 'r-1', code: 'R1', name: 'Vinoba Nagar – Ravindra Nagar' },
  vehicle: { id: 'v-1', name: 'Bus 1', registration: 'KA-14-F-2231', capacity: 40 },
  driver: 'Manjunath Gowda',
  attendant: 'Lalitha Shetty',
  plannedStart: '07:15',
  status: 'SCHEDULED',
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  cancelRemarks: null,
  progress: { stops: 3, passed: 0 },
  version: 1,
  ...over,
});
const stop = (seq: number, name: string, status: TripStop['status'], n = 0): TripStop => ({
  seq,
  stop: { id: `st-${seq}`, name, landmark: null },
  plannedTime: null,
  distanceKm: seq ? 1.5 : 0,
  status,
  reachedAt: status === 'UPCOMING' ? null : '2026-10-04T01:50:00.000Z',
  departedAt: status === 'DEPARTED' ? '2026-10-04T01:52:00.000Z' : null,
  skipRemarks: null,
  passengers: Array.from({ length: n }, (_, i) => ({
    id: `p-${seq}-${i}`,
    name: `Child ${i}`,
    admissionNo: null,
    classSection: 'Grade 7 B',
    boarding: null,
  })),
});
const t1 = trip({ id: 't-1' });
const t2 = trip({
  id: 't-2',
  route: { id: 'r-2', code: 'R2', name: 'Gopala – Alkola' },
  vehicle: { id: 'v-2', name: 'Bus 2', registration: 'KA-14-F-1187', capacity: 32 },
  driver: 'Ramesh Naik',
  status: 'STARTED',
  startedAt: '2026-10-04T01:45:00.000Z',
  progress: { stops: 3, passed: 1 },
  version: 2,
});
const detail = (t: Trip, stops: TripStop[], over: Partial<TripDetail> = {}): TripDetail => ({
  ...t,
  stops,
  passengers: stops.reduce((n, s) => n + s.passengers.length, 0),
  boarded: 0,
  events: [
    { event: 'SCHEDULED', seq: null, remarks: null, at: '2026-10-03T18:40:00.000Z', by: null },
  ],
  ...over,
});
const d1 = detail(t1, [
  stop(0, 'Ravindra Nagar', 'UPCOMING', 3),
  stop(1, 'Vinoba Nagar Circle', 'UPCOMING', 5),
  stop(2, 'School campus', 'UPCOMING'),
]);
const d2 = detail(
  t2,
  [
    stop(0, 'Alkola Circle', 'DEPARTED', 3),
    stop(1, 'Gopala Circle', 'UPCOMING', 4),
    stop(2, 'School campus', 'UPCOMING'),
  ],
  {
    events: [
      { event: 'SCHEDULED', seq: null, remarks: null, at: '2026-10-03T18:40:00.000Z', by: null },
      {
        event: 'STARTED',
        seq: null,
        remarks: null,
        at: '2026-10-04T01:45:00.000Z',
        by: 'Ramesh Naik',
      },
      {
        event: 'REACHED',
        seq: 0,
        remarks: null,
        at: '2026-10-04T01:50:00.000Z',
        by: 'Ramesh Naik',
      },
    ],
  },
);
const list: TripList = {
  date: '2026-10-04',
  counts: { scheduled: 1, started: 1, completed: 0, cancelled: 0 },
  items: [t1, t2],
  nextCursor: null,
};

describe('console live trips (TRN-023…026)', () => {
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
    const nav = harness.navigateByUrl('/console/transport');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    await settle();
    if (s.subTasks.includes('transport.view')) {
      (await request((u) => u === '/api/v1/console/trips')).flush(list);
      (await request((u) => u === '/api/v1/console/trips/t-1')).flush(d1);
      (await request((u) => u === '/api/v1/console/trips/t-2')).flush(d2);
      await settle();
    }
    return harness.routeNativeElement as HTMLElement;
  }
  const cards = (el: HTMLElement) => [...el.querySelectorAll('#trn-cards .cc-trip')];

  it('names trip statuses as the register does', () => {
    expect(TRIP_STATUS.SCHEDULED.l()).toBe(translate('status.trip.scheduled'));
    expect(TRIP_STATUS.STARTED.l()).toBe(translate('status.trip.started'));
    expect(periodStatus('2000-01-01', '2000-02-01').l).toBe('Ended');
    expect(periodStatus('2999-01-01', '2999-02-01').l).toBe('Upcoming');
  });

  it('shows today’s trips with their stop progress, the trip on the road first', async () => {
    const el = await open();
    expect([...el.querySelectorAll('#trn-kpis .kpi')].map(words)).toEqual([
      'Trips today 2 Sunday, 4 October 2026',
      'On the road 1 Live from the crew app',
      'Completed 0',
      `${translate('status.trip.scheduled')} 1 None cancelled`,
    ]);
    const c = cards(el);
    expect(c).toHaveLength(2);
    expect(c[0]!.classList.contains('live')).toBe(true);
    expect(words(c[0])).toBe(
      `R2 Gopala – Alkola ${translate('status.trip.started')} Morning pickup · 7:15 AM · Bus 2 · Ramesh Naik Alkola Circle School campus Next: Gopala Circle 1/3 stops No position from the crew's phone yet Details Cancel trip`,
    );
    expect(c[0]!.querySelectorAll('.cc-line .st.departed')).toHaveLength(1);
    expect(words(c[1])).toContain('8 passengers · starts 7:15 AM 0/3 stops');
    const cancel = c[0]!.querySelector('.cp-why') as HTMLElement;
    expect(cancel.getAttribute('title')).toBe(translate('TRN.TRIP_STARTED_CANCEL'));
    expect((cancel.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('opens a trip with its events and stops', async () => {
    const el = await open();
    (cards(el)[0]!.querySelector('.btn-sec') as HTMLButtonElement).click();
    await settle();
    (await request((u) => u === '/api/v1/console/trips/t-2')).flush(d2);
    await settle();
    expect(text(document.querySelector('.drawer .sh-t'))).toContain('R2 · Morning pickup');
    expect(words(document.querySelector('#trip-events'))).toBe(
      'Reached Alkola Circle 7:20 AM · Ramesh Naik Trip started 7:15 AM · Ramesh Naik',
    );
    expect(words(document.querySelector('#trip-stops'))).toContain(
      'Gopala Circle Upcoming · 4 passengers',
    );
  });

  it('cancels a scheduled trip with remarks for the families (TRN-025)', async () => {
    const el = await open();
    (cards(el)[1]!.querySelector('.cp-why button') as HTMLButtonElement).click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(dlg)).toContain('Cancel R1 · Morning pickup?');
    expect(text(dlg)).toContain("8 passengers' families get a transport alert");
    const area = dlg.querySelector('#cf-reason') as HTMLTextAreaElement;
    area.value = 'Road closed for a procession';
    area.dispatchEvent(new Event('input'));
    await settle(1);
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const post = await request((u) => u === '/api/v1/console/trips/t-1/cancellation', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({ remarks: 'Road closed for a procession' });
    post.flush({ ...d1, status: 'CANCELLED', cancelRemarks: 'Road closed for a procession' });
    await settle();
    expect(toasts()).toContain('Trip cancelled');
    await request((u) => u === '/api/v1/console/trips');
  });

  it('reads the reports over a date range (TRN-026)', async () => {
    const el = await open();
    ([...el.querySelectorAll('.tabs .tab')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith('Reports'))!
      .click();
    await settle();
    const r = await request((u) =>
      u.startsWith('/api/v1/console/transport/reports/route-performance'),
    );
    expect(r.request.params.get('from')).toBeTruthy();
    r.flush({
      kind: 'route-performance',
      from: '2026-09-27',
      to: '2026-10-04',
      items: [
        {
          route: 'R1 · Vinoba Nagar',
          trips: 4,
          completed: 4,
          cancelled: 0,
          onTime: 3,
          averageDelayMinutes: 4,
        },
      ],
    });
    await settle();
    expect(words(el.querySelector('#trp-table tbody'))).toBe('R1 · Vinoba Nagar 4 100% 0 3 4 min');
    ([...el.querySelectorAll('#trp-filters .seg button')] as HTMLButtonElement[])[2]!.click();
    await settle();
    (await request((u) => u.startsWith('/api/v1/console/transport/reports/cancelled-trips'))).flush(
      {
        kind: 'cancelled-trips',
        from: '2026-09-27',
        to: '2026-10-04',
        items: [],
      },
    );
    await settle();
    expect(text(el.querySelector('#trp-table .empty'))).toContain('No cancelled trips');
  });

  it('is read-only for Management', async () => {
    const el = await open(session(['transport.view'], true));
    expect(text(el.querySelector('.note.tone-info'))).toContain('Read-only.');
    const btn = cards(el)[1]!.querySelector('.cp-why button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('is refused without the transport task', async () => {
    const el = await open(session([]));
    expect(text(el.querySelector('.empty'))).toContain("You don't have access to this page");
  });
});
