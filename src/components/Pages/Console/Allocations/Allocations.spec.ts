import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { istBusinessDate } from '../../../Utils/format';
import type { AllocationPage, AllocationRow, Route } from '../Transport/transport.api';

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
const year = {
  id: 'y',
  label: '2026-27',
  startsOn: '2026-04-01',
  endsOn: '2099-03-31',
  closed: false,
  current: true,
};
const row = (id: string, name: string, cls: string | null, alloc: boolean): AllocationRow => ({
  member: {
    id,
    name,
    admissionNo: cls ? `TVPS/2026/${id}` : null,
    class: cls,
    section: cls ? 'B' : null,
    type: cls ? 'Student' : 'Teacher',
  },
  allocation: alloc
    ? {
        id: `al-${id}`,
        route: { id: 'r-1', code: 'R1', name: 'Vinoba Nagar' },
        stop: { id: 'st-1', name: 'Durgigudi' },
        from: '2026-04-01',
        to: '2099-03-31',
        version: 1,
      }
    : null,
});
const page = (items: AllocationRow[], nextCursor: string | null = null): AllocationPage => ({
  year,
  items,
  nextCursor,
});
const r1 = {
  id: 'r-1',
  code: 'R1',
  name: 'Vinoba Nagar',
  active: true,
  passengers: 30,
  stops: [
    {
      seq: 0,
      stop: { id: 'st-0', name: 'School campus', landmark: null, active: true },
      distanceKm: 0,
    },
    {
      seq: 1,
      stop: { id: 'st-1', name: 'Durgigudi', landmark: null, active: true },
      distanceKm: 1.8,
    },
  ],
} as unknown as Route;

describe('console passenger allocations (TRN-020…022)', () => {
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
    const nav = harness.navigateByUrl('/console/allocations');
    (await request((u) => u === '/api/v1/console/session')).flush(session());
    await nav;
    await settle();
    const first = await request(
      (u) => u === '/api/v1/console/passenger-allocations?kind=STUDENT&assigned=true',
    );
    first.flush(page([row('0401', 'AARAV HEGDE', 'Grade 7', true)], 'c-100'));
    (await request((u) => u === '/api/v1/console/routes')).flush({ items: [r1] });
    (await request((u) => u === '/api/v1/console/vehicles')).flush({
      items: [{ id: 'v-1', name: 'Bus 1', registration: 'KA', capacity: 40, active: true }],
    });
    (await request((u) => u === '/api/v1/console/vehicle-assignments')).flush({
      items: [
        {
          id: 'a-1',
          route: { id: 'r-1', code: 'R1', name: 'Vinoba Nagar' },
          vehicle: { id: 'v-1', name: 'Bus 1', registration: 'KA' },
          from: '2026-04-01',
          to: '2099-03-31',
          active: true,
        },
      ],
    });
    (
      await request((u) => u === '/api/v1/console/passenger-allocations?kind=STUDENT&assigned=true')
    ).flush(
      page([
        row('0401', 'AARAV HEGDE', 'Grade 7', true),
        row('0402', 'MEERA NAYAK', 'Grade 7', true),
      ]),
    );
    (
      await request((u) => u === '/api/v1/console/passenger-allocations?kind=STAFF&assigned=true')
    ).flush(page([row('t-1', 'SHREYA NAYAK', null, true)]));
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  it('lists passengers with the CR-09 columns and the figures', async () => {
    const el = await open();
    expect([...el.querySelectorAll('#al-kpis .kpi')].map(words)).toEqual([
      'Active passengers 3 2026-27',
      'Students 2',
      'Teachers and staff 1',
      'Busiest route 75% R1 · 30 of 40 seats',
    ]);
    expect(words(el.querySelector('#al-table tbody tr'))).toBe(
      'AH Aarav Hegde TVPS/2026/0401 · Grade 7 B Student R1 Durgigudi 1 Apr – 31 Mar 2099 2026-27 Active End',
    );
    expect(text(el.querySelector('.pager'))).toContain('Showing 1–1');
  });

  it('pages with the server’s cursor', async () => {
    const el = await open();
    (el.querySelector('.pager [aria-label="Next"]') as HTMLButtonElement).click();
    const next = await request((u) => u.includes('cursor=c-100'));
    expect(next.request.params.get('kind')).toBe('STUDENT');
    next.flush(page([row('0499', 'ZOYA KHAN', 'Grade 8', true)]));
    await settle();
    expect(words(el.querySelector('#al-table tbody tr'))).toContain('Zoya Khan');
  });

  it('ends an allocation with a reason kept on record (TRN-022)', async () => {
    const el = await open();
    ([...el.querySelectorAll('#al-table tbody button')] as HTMLButtonElement[])
      .find((b) => text(b) === 'End')!
      .click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(dlg)).toContain("End Aarav Hegde's allocation?");
    const area = dlg.querySelector('#cf-reason') as HTMLTextAreaElement;
    area.value = 'Moving to Bhadravathi';
    area.dispatchEvent(new Event('input'));
    await settle(1);
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const post = await request(
      (u) => u === '/api/v1/console/passenger-allocations/al-0401/end',
      'POST',
    );
    expect(post.request.body).toEqual({ endDate: today, reason: 'Moving to Bhadravathi' });
    post.flush({ id: 'al-0401', endDate: today, reason: 'Moving to Bhadravathi' });
    await settle();
    expect(toasts()).toContain('Allocation ended');
  });

  it('allocates several students to a route and stop at once (TRN-021)', async () => {
    const el = await open();
    (el.querySelector('#al-new') as HTMLButtonElement).click();
    await settle();
    (await request((u) => u.includes('kind=STUDENT&assigned=false'))).flush(
      page([
        row('0405', 'KAVYA RAO', 'Grade 6', false),
        row('0406', 'ARJUN BHAT', 'Grade 6', false),
      ]),
    );
    await settle();
    (document.querySelector('#al-save') as HTMLButtonElement).click();
    await settle(1);
    expect(text(document.querySelector('#al-m-e'))).toBe('Choose a student');
    expect(text(document.querySelector('#al-r-e'))).toBe('Choose a route');
    (document.querySelector('#al-all') as HTMLInputElement).click();
    await settle(1);
    (document.querySelector('#al-r-b') as HTMLButtonElement).click();
    await settle(1);
    ([...document.querySelectorAll('.dd-opt')] as HTMLButtonElement[])[0]!.click();
    await settle(1);
    (document.querySelector('#al-s-b') as HTMLButtonElement).click();
    await settle(1);
    ([...document.querySelectorAll('.dd-opt')] as HTMLButtonElement[])
      .find((b) => text(b).startsWith('Durgigudi'))!
      .click();
    await settle(1);
    expect(text(document.querySelector('#al-save'))).toBe('Allocate 2');
    (document.querySelector('#al-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/passenger-allocations', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      memberIds: ['0405', '0406'],
      routeId: 'r-1',
      stopId: 'st-1',
      from: expect.any(String),
      to: '2099-03-31',
    });
    post.flush({ allocated: 2, ids: ['a', 'b'] });
    await settle();
    expect(toasts()).toContain('Passengers allocated');
  });

  /** Students without an allocation: one opted, one declined, one with no choice on record. */
  const choices = (): AllocationRow[] => [
    {
      ...row('0405', 'KAVYA RAO', 'Grade 6', false),
      transport: { opted: true, stop: 'Durgigudi' },
    },
    { ...row('0406', 'ARJUN BHAT', 'Grade 6', false), transport: { opted: false, stop: null } },
    // Admitted before the form asked: no choice on record, so still eligible.
    { ...row('0407', 'NISHA PAI', 'Grade 6', false), transport: null },
  ];

  it('lets only students who opted for transport be chosen; no choice on record stays eligible (client 2026-10-12)', async () => {
    const el = await open();
    (el.querySelector('#al-new') as HTMLButtonElement).click();
    await settle();
    (await request((u) => u.includes('kind=STUDENT&assigned=false'))).flush(page(choices()));
    await settle();
    const rows = [...document.querySelectorAll('.cm-pk-row')];
    expect(rows.map((r) => text(r.querySelector('.chip')))).toEqual([
      'Opted · Durgigudi',
      'Not opted',
      '',
    ]);
    const box = (i: number) => rows[i]!.querySelector('input') as HTMLInputElement;
    expect(box(1).disabled).toBe(true);
    expect(rows[1]!.getAttribute('title')).toBe(
      "Didn't opt for school transport on the admission form",
    );
    expect(text(document.querySelector('.cm-pk-bar'))).toContain('Select all 2 shown');
    (document.querySelector('#al-all') as HTMLInputElement).click();
    await settle(1);
    expect([box(0).checked, box(1).checked, box(2).checked]).toEqual([true, false, true]);
  });

  it('keeps Allocate closed in the list for a student who did not opt for transport', async () => {
    const el = await open();
    ([...el.querySelectorAll('.pill')] as HTMLButtonElement[])
      .find((b) => text(b) === 'Not allocated')!
      .click();
    (await request((u) => u.includes('kind=STUDENT&assigned=false'))).flush(page(choices()));
    await settle();
    const [kavya, arjun, nisha] = [...el.querySelectorAll('#al-table tbody tr')];
    const allocate = (tr: Element | undefined) =>
      [...tr!.querySelectorAll('button')].find((b) => text(b) === 'Allocate') as HTMLButtonElement;
    expect(text(kavya!.querySelector('.al-opt'))).toBe('Opted · Durgigudi');
    expect(allocate(kavya).disabled).toBe(false);
    expect(text(arjun!.querySelector('.al-opt'))).toBe('Not opted');
    expect(allocate(arjun).disabled).toBe(true);
    expect(allocate(arjun).parentElement?.getAttribute('title')).toBe(
      'Didn’t opt for school transport on the admission form',
    );
    expect(nisha!.querySelector('.al-opt')).toBeNull();
    expect(allocate(nisha).disabled).toBe(false);
    // No choice on record: nothing to change.
    expect(nisha!.querySelector('.al-choice')).toBeNull();
  });

  it('lets the transport desk mark a student as opted when the family changes its mind (TRN-035)', async () => {
    const el = await open();
    ([...el.querySelectorAll('.pill')] as HTMLButtonElement[])
      .find((b) => text(b) === 'Not allocated')!
      .click();
    (await request((u) => u.includes('kind=STUDENT&assigned=false'))).flush(page(choices()));
    await settle();
    const arjun = el.querySelectorAll('#al-table tbody tr')[1]!;
    const change = arjun.querySelector('.al-choice') as HTMLButtonElement;
    expect(text(change)).toBe('Mark opted');
    change.click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(dlg)).toContain('Mark Arjun Bhat as opted for transport?');
    const area = dlg.querySelector('#cf-reason') as HTMLTextAreaElement;
    area.value = 'Parent asked at the desk';
    area.dispatchEvent(new Event('input'));
    await settle(1);
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const put = await request((u) => u === '/api/v1/console/transport-choices/0406', 'PUT');
    expect(put.request.body).toEqual({ opted: true, reason: 'Parent asked at the desk' });
    put.flush({ memberId: '0406', transport: { opted: true, stop: null } });
    await settle();
    expect(toasts()).toContain('Marked as opted for transport');
  });

  it('keeps "Mark not opted" closed while the student is allocated', async () => {
    const el = await open();
    ([...el.querySelectorAll('.pill')] as HTMLButtonElement[])
      .find((b) => text(b) === 'All')!
      .click();
    (await request((u) => u.includes('kind=STUDENT') && !u.includes('assigned='))).flush(
      page([
        {
          ...row('0408', 'ROHAN SHET', 'Grade 6', true),
          transport: { opted: true, stop: 'Durgigudi' },
        },
      ]),
    );
    await settle();
    const btn = el.querySelector('#al-table .al-choice') as HTMLButtonElement;
    expect(text(btn)).toBe('Mark not opted');
    expect(btn.disabled).toBe(true);
    expect(btn.parentElement?.getAttribute('title')).toBe(
      'End the allocation before marking not opted',
    );
  });
});
