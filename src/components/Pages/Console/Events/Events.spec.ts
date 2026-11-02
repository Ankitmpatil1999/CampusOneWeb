import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { istBusinessDate } from '../../../Utils/format';
import { addDays } from '../Coupons/coupon-format';
import { audienceText, eventState } from './event-format';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function request(match: (url: string) => boolean, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
    const found = ctl.match((r) => match(r.urlWithParams) && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} request`);
}

const money = (amount: string) => ({ amount, currency: 'INR' });
const TODAY = istBusinessDate(new Date());

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
  subTasks: ['home.view', 'task.home', 'task.events', 'events.view', 'events.edit'],
  preferredLang: 'en',
  ...over,
});

const event = (over: object = {}) => ({
  id: 'e-1',
  title: 'Annual Day 2026 · costume & transport',
  description: 'Costume hire and return transport for performers.',
  startDate: addDays(TODAY, -5),
  endDate: addDays(TODAY, 20),
  heads: [
    { name: 'Costume', amount: money('450.00') },
    { name: 'Transport', amount: money('150.00') },
  ],
  total: money('600.00'),
  merchant: 'TVPS Fee Account',
  audience: [{ id: 'c-5', name: 'Grade 5' }],
  status: 'ACTIVE',
  payments: { count: 2, collected: money('1200.00') },
  createdAt: '2026-09-15T04:30:00.000Z',
  version: 3,
  ...over,
});
const list = {
  items: [
    event(),
    event({
      id: 'e-2',
      title: 'Science Fair 2026 · registration',
      startDate: addDays(TODAY, -30),
      endDate: addDays(TODAY, -2),
      heads: [{ name: 'Registration', amount: money('350.00') }],
      total: money('350.00'),
      audience: null,
      status: 'INACTIVE',
      payments: { count: 0, collected: money('0.00') },
      version: 1,
    }),
  ],
  kpis: { live: 1, upcoming: 0, collected: money('1200.00'), payments: 2 },
};
const classes = {
  year: { id: 'y-1', label: '2026–27' },
  items: [
    { id: 'c-5', name: 'Grade 5', order: 8, sections: [], students: 0, version: 1 },
    { id: 'c-6', name: 'Grade 6', order: 9, sections: [], students: 0, version: 1 },
  ],
};
const reportOf = {
  event: { id: 'e-1', title: 'Annual Day 2026 · costume & transport' },
  totals: { paid: 2, failed: 1, collected: money('1200.00') },
  items: [
    {
      reference: 'RP2610041234567EV',
      payer: 'Aarav Hegde',
      admissionNo: 'TVPS/2019/0412',
      grade: 'Grade 5 B',
      amount: money('600.00'),
      status: 'SUCCESS',
      failureCode: null,
      at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    },
    {
      reference: 'RP2610041234568EV',
      payer: 'Kiran Rao',
      admissionNo: null,
      grade: null,
      amount: money('600.00'),
      status: 'FAILURE',
      failureCode: 'PAY.INSUFFICIENT_BALANCE',
      at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    },
    {
      reference: 'RP2610041234569EV',
      payer: 'Diya Shetty',
      admissionNo: null,
      grade: 'Grade 5 A',
      amount: money('600.00'),
      status: 'SUCCESS',
      failureCode: null,
      at: new Date(Date.now() - 5 * 3600_000).toISOString(),
    },
  ],
};

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find((b) => text(b) === label) as HTMLButtonElement;
const toasts = () => text(document.querySelector('.toasts'));
const confirmOk = () =>
  ([...document.querySelectorAll('.modal[role="alertdialog"] .sh-f button')] as HTMLButtonElement[])
    .at(-1)!
    .click();
const set = (root: ParentNode, sel: string, v: string) => {
  const i = root.querySelector(sel) as HTMLInputElement;
  i.value = v;
  i.dispatchEvent(new Event('input'));
};

describe('console events (FEE-028…031)', () => {
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

  async function open(s: object = session()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/events');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    (await request((u) => u === '/api/v1/console/events')).flush(list);
    (await request((u) => u === '/api/v1/console/classes')).flush(classes);
    await settle(5);
    return harness.routeNativeElement as HTMLElement;
  }

  it('tells the state of an event and its audience', () => {
    const e = { status: 'ACTIVE' as const, startDate: '2026-10-01', endDate: '2026-10-10' };
    expect(eventState(e, '2026-09-30')).toBe('Upcoming');
    expect(eventState(e, '2026-10-10')).toBe('Active');
    expect(eventState(e, '2026-10-11')).toBe('Ended');
    expect(eventState({ ...e, status: 'INACTIVE' }, '2026-10-05')).toBe('Inactive');
    expect(audienceText({ audience: null })).toBe('Whole institution');
    expect(audienceText({ audience: [{ id: 'c', name: 'Grade 7' }] })).toBe('Grade 7');
  });

  it('lists the events with the figures and filters them', async () => {
    const el = await open();
    expect(text(el.querySelector('h1'))).toContain('Events');
    expect(text(el.querySelector('.c-grid.k4'))).toContain('₹1,200');
    expect(text(el.querySelector('.c-grid.k4'))).toContain('23:50');
    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(text(rows[0])).toContain('Grade 5 · 2 heads');
    expect(text(rows[0])).toContain('TVPS Fee Account');
    expect(text(rows[1])).toContain('Whole institution · 1 head');
    expect(text(rows[1])).toContain('Inactive');

    button(el, 'Inactive').click();
    await settle();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
    button(el, 'All').click();
    set(el, '#ev-q', 'science');
    await settle();
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(text(el.querySelector('tbody tr'))).toContain('Science Fair');
  });

  it('deactivates an event from its row, and refuses to reopen an ended one (FEE-030)', async () => {
    const el = await open();
    const toggles = el.querySelectorAll<HTMLButtonElement>('tbody .toggle');
    // Ended (closed two days ago): it can't open again.
    toggles[1]!.click();
    await settle();
    expect(toasts()).toContain('This event has ended');

    toggles[0]!.click();
    await settle(2);
    confirmOk();
    const patch = await request((u) => u === '/api/v1/console/events/e-1', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v3"');
    expect(patch.request.body).toEqual({ status: 'INACTIVE' });
    patch.flush(event({ status: 'INACTIVE', version: 4 }));
    await settle();
    expect(toasts()).toContain('Event deactivated');
    (await request((u) => u === '/api/v1/console/events')).flush(list);
  });

  it('opens the drawer with the heads and the report, and exports the CSV (FEE-031)', async () => {
    const saved: string[] = [];
    const url = URL as unknown as {
      createObjectURL?: (b: Blob) => string;
      revokeObjectURL?: (u: string) => void;
    };
    const before = { create: url.createObjectURL, revoke: url.revokeObjectURL };
    url.createObjectURL = () => 'blob:csv';
    url.revokeObjectURL = () => undefined;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    try {
      const el = await open();
      (el.querySelectorAll('tbody tr')[0] as HTMLElement).click();
      await settle();
      (await request((u) => u === '/api/v1/console/events/e-1/report')).flush(reportOf);
      await settle();
      const drawer = document.querySelector('.drawer') as HTMLElement;
      expect(text(drawer)).toContain('Total — paid in full, once');
      expect(text(drawer)).toContain('₹600.00');
      expect(text(drawer)).toContain('Aarav Hegde');
      expect(text(drawer)).not.toContain('Kiran Rao');
      expect(text(drawer)).toContain("1 failed attempt isn't listed here");
      expect(text(drawer)).toContain('2 hr ago');

      button(drawer, 'Export').click();
      const csv = await request((u) => u === '/api/v1/console/events/e-1/report?format=csv');
      expect(csv.request.responseType).toBe('blob');
      csv.flush(new Blob(['Date,Payer'], { type: 'text/csv' }));
      await settle();
      expect(saved).toEqual(['Annual_Day_2026_costume_transport_payments.csv']);
    } finally {
      click.mockRestore();
      url.createObjectURL = before.create;
      url.revokeObjectURL = before.revoke;
    }
  });

  it('registers an event with heads and an audience (FEE-029)', async () => {
    const el = await open();
    button(el, 'Register event').click();
    await settle(3);
    const modal = document.querySelector('.modal') as HTMLElement;
    button(modal, 'Register event').click();
    await settle();
    expect(text(modal)).toContain('Enter the event title');
    expect(text(modal)).toContain('Choose the closing date');
    expect(text(modal)).toContain('Give every head a name and an amount above ₹0');

    set(modal, '#en-title', 'Mysuru heritage trip');
    // Neither date may be in the past; the pickers start at today (client 2026-10-15).
    const start = modal.querySelector('#en-start') as HTMLInputElement;
    const end = modal.querySelector('#en-end') as HTMLInputElement;
    expect(start.min).toBe(TODAY);
    expect(end.min).toBe(TODAY);
    set(modal, '#en-start', addDays(TODAY, -2));
    set(modal, '#en-end', addDays(TODAY, -1));
    await settle();
    button(modal, 'Register event').click();
    await settle();
    expect(text(modal)).toContain('The opening date can’t be in the past.');
    expect(text(modal)).toContain('The closing date can’t be in the past.');
    // The closing date can't come before the opening date either.
    set(modal, '#en-start', addDays(TODAY, 5));
    set(modal, '#en-end', addDays(TODAY, 2));
    await settle();
    expect(end.min).toBe(addDays(TODAY, 5));
    button(modal, 'Register event').click();
    await settle();
    expect(text(modal)).toContain('The end date can’t be before the start date.');
    set(modal, '#en-start', TODAY);
    set(modal, '#en-end', addDays(TODAY, 10));
    button(modal, 'Add head').click();
    await settle();
    const names = modal.querySelectorAll<HTMLInputElement>('input[aria-label="Head name"]');
    const amounts = modal.querySelectorAll<HTMLInputElement>('input[aria-label="Amount"]');
    names[0]!.value = 'Bus';
    names[0]!.dispatchEvent(new Event('input'));
    amounts[0]!.value = '450';
    amounts[0]!.dispatchEvent(new Event('input'));
    names[1]!.value = 'Entry tickets';
    names[1]!.dispatchEvent(new Event('input'));
    amounts[1]!.value = '250.5';
    amounts[1]!.dispatchEvent(new Event('input'));
    modal.querySelectorAll<HTMLInputElement>('.cm-clschip input')[1]!.click();
    await settle();
    expect(text(modal.querySelector('#en-tot'))).toBe('₹700.50');
    button(modal, 'Register event').click();
    await settle(2);
    confirmOk();
    const post = await request((u) => u === '/api/v1/console/events', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      title: 'Mysuru heritage trip',
      description: null,
      startDate: TODAY,
      endDate: addDays(TODAY, 10),
      heads: [
        { name: 'Bus', amount: money('450.00') },
        { name: 'Entry tickets', amount: money('250.50') },
      ],
      audienceClassIds: ['c-6'],
    });
    post.flush({ code: 'FEE.NO_FEE_ACCOUNT' }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(text(modal)).toContain('Designate the institution’s fee account first');
  });

  it("locks the heads and the opening date of an event that's been paid for", async () => {
    const el = await open();
    (el.querySelectorAll('tbody tr')[0] as HTMLElement).click();
    await settle();
    (await request((u) => u === '/api/v1/console/events/e-1/report')).flush(reportOf);
    await settle();
    button(document.querySelector('.drawer') as HTMLElement, 'Edit event').click();
    await settle(3);
    const modal = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(text(modal)).toContain('Members have paid for this event');
    expect((modal.querySelector('#en-start') as HTMLInputElement).disabled).toBe(true);
    set(modal, '#en-end', addDays(TODAY, 25));
    await settle();
    button(modal, 'Save event').click();
    await settle(2);
    confirmOk();
    const patch = await request((u) => u === '/api/v1/console/events/e-1', 'PATCH');
    expect(patch.request.body).toEqual({ endDate: addDays(TODAY, 25) });
    patch.flush(event({ endDate: addDays(TODAY, 25), version: 4 }));
    await settle();
    expect(toasts()).toContain('Event saved');
  });

  it('is read-only for Management', async () => {
    const el = await open(
      session({
        roles: [{ code: 'MANAGEMENT', name: 'Management', readOnly: true }],
        subTasks: ['home.view', 'task.home', 'task.events', 'events.view'],
      }),
    );
    expect(el.querySelector('#ev-new')).toBeNull();
    expect(button(el, 'Register event').disabled).toBe(true);
    expect(el.querySelector<HTMLButtonElement>('tbody .toggle')!.disabled).toBe(true);
  });
});
