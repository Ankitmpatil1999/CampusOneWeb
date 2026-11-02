import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { boundTo, healthOf, purposeOf } from './reader-format';
import type { Terminal } from './readers.api';

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
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

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
    'task.readers',
    'readers.view',
    'readers.edit',
    'merchants.view',
    'academics.view',
  ],
  preferredLang: 'en',
  ...over,
});

const terminal = (over: Partial<Terminal> = {}): Terminal => ({
  id: 't-1',
  name: 'Main gate',
  location: 'Main gate',
  purpose: 'ATTENDANCE',
  merchant: null,
  section: null,
  locationType: null,
  status: 'ACTIVE',
  statusReason: null,
  paired: true,
  pairedAt: '2026-10-01T05:00:00.000Z',
  device: '…A1B2C3',
  lastSeenAt: ago(1),
  version: 3,
  ...over,
});

const list = () => ({
  items: [
    terminal(),
    terminal({
      id: 't-2',
      name: 'Library desk',
      location: 'Library',
      purpose: 'LOCATION',
      locationType: 'Library',
      paired: false,
      pairedAt: null,
      device: null,
      lastSeenAt: null,
      version: 1,
    }),
    terminal({
      id: 't-3',
      name: 'Science lab',
      location: 'Block C',
      purpose: 'LOCATION',
      locationType: 'Laboratory',
      lastSeenAt: ago(180),
    }),
    terminal({
      id: 't-4',
      name: 'Mess counter',
      location: 'Mess hall',
      purpose: 'COUPON',
      merchant: { id: 'm-1', name: 'Campus Canteen' },
      status: 'DISABLED',
      statusReason: 'Water damage',
      paired: false,
      device: null,
    }),
    terminal({
      id: 't-5',
      name: 'Canteen counter 1',
      location: 'Canteen',
      purpose: 'POS',
      merchant: { id: 'm-1', name: 'Campus Canteen' },
    }),
  ],
});

const pos = {
  date: '2026-10-04',
  items: [
    {
      id: 't-5',
      name: 'Canteen counter 1',
      location: 'Canteen',
      status: 'ACTIVE',
      merchant: 'Campus Canteen',
      outlet: 'Campus Canteen',
      operator: 'Ramesh Poojary',
      lastSeenAt: ago(2),
      lastSyncAt: ago(2),
      today: {
        orders: 3,
        paid: 3,
        collected: money('204.75'),
        unpaid: 0,
        offlineAccepted: 1,
        offlineRefused: 0,
      },
    },
  ],
};

const merchant = (id: string, name: string, over: object = {}) => ({
  id,
  displayName: name,
  uniqueId: `MER${id}`,
  subType: 'REGULAR',
  status: 'ACTIVE',
  statusReason: null,
  department: 'Canteen',
  operator: 'Ravi Kumar',
  mobile: null,
  email: null,
  accepts: { wallet: true, allowance: true, coupon: true },
  channels: { dynamicQr: true, nfc: false },
  isFeeAccount: false,
  today: { amount: money('0.00'), count: 0 },
  onboardedAt: null,
  version: 1,
  ...over,
});

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find((b) => text(b) === label) as HTMLButtonElement;
const toasts = () => text(document.querySelector('.toasts'));

describe('console readers (INS-030…034, MER-012)', () => {
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

  async function open(s: object = session(), lookups = true) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/readers');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    (await request((u) => u === '/api/v1/console/readers')).flush(list());
    (await request((u) => u === '/api/v1/console/pos-terminals')).flush(pos);
    if (lookups) await flushLookups();
    await settle(5);
    return harness.routeNativeElement as HTMLElement;
  }

  async function flushLookups() {
    (await request((u) => u === '/api/v1/console/classes')).flush({
      year: null,
      items: [
        {
          id: 'c-6',
          name: 'Grade 6',
          order: 8,
          sections: [{ id: 'sec-6a', name: 'A', capacity: null, students: 1 }],
          students: 1,
          version: 1,
        },
      ],
    });
    (await request((u) => u.startsWith('/api/v1/console/merchants?'))).flush({
      items: [
        merchant('m-1', 'Campus Canteen'),
        merchant('m-2', 'Lab Supplies Co', {
          subType: 'VENDOR',
          accepts: { wallet: true, allowance: false, coupon: false },
        }),
      ],
      nextCursor: null,
      kpis: { total: 2, active: 2, collectionsToday: money('0.00'), paymentsToday: 0 },
    });
  }

  const set = (root: ParentNode, id: string, v: string) => {
    const i = root.querySelector(`#${id}`) as HTMLInputElement;
    i.value = v;
    i.dispatchEvent(new Event('input'));
  };

  it('derives the status from the register, the pairing and the last sign-in', () => {
    const now = Date.now();
    expect(healthOf(terminal({ status: 'DISABLED' }), now)).toBe('DISABLED');
    expect(healthOf(terminal({ paired: false }), now)).toBe('UNPAIRED');
    expect(healthOf(terminal({ lastSeenAt: ago(5) }), now)).toBe('ONLINE');
    expect(healthOf(terminal({ lastSeenAt: ago(45) }), now)).toBe('OFFLINE');
    expect(healthOf(terminal({ lastSeenAt: null }), now)).toBe('OFFLINE');
    expect(boundTo(terminal({ purpose: 'LOCATION', locationType: 'Library' }))).toBe('Library');
    expect(
      boundTo(terminal({ purpose: 'PERIOD_ATTENDANCE', section: { id: 's', name: 'Grade 6 A' } })),
    ).toBe('Grade 6 A');
    expect(purposeOf('CARD_ISSUE').l).toBe('Card issue');
  });

  it('lists the readers with their figures, filters by purpose and shows the POS counters', async () => {
    const el = await open();
    expect(text(el.querySelector('h1'))).toBe('Readers');
    const kpis = [...el.querySelectorAll('.kpi')];
    expect(kpis.map((k) => text(k.querySelector('.k-v')))).toEqual(['1', '1', '—', '1']);
    expect(text(kpis[1]!.querySelector('.k-d'))).toBe('Science lab');

    const rows = el.querySelectorAll('#rd-table tbody tr');
    expect(rows).toHaveLength(4);
    expect(text(el.querySelector('#rd-table'))).not.toContain('Canteen counter 1');
    expect(text(rows[0])).toContain('…A1B2C3');
    expect(text(rows[0])).toContain('Online');
    expect(text(el.querySelector('#rd-table'))).toContain('Awaiting pairing');
    expect(text(el.querySelector('#rd-table'))).toContain('Disabled');
    expect(text(el.querySelector('#rd-table'))).toContain('Campus Canteen');

    [...el.querySelectorAll<HTMLButtonElement>('.pill')]
      .find((b) => text(b).startsWith('Location attendance'))!
      .click();
    await settle();
    expect(el.querySelectorAll('#rd-table tbody tr')).toHaveLength(2);

    const counters = text(el.querySelector('#rd-pos'));
    expect(counters).toContain('Canteen counter 1');
    expect(counters).toContain('operator Ramesh Poojary');
    expect(counters).toContain('₹204.75 collected');
    expect(counters).toContain('offline 1 accepted, 0 refused');
  });

  it('registers a reader, then shows its one-time pairing code (INS-031, INS-033)', async () => {
    const el = await open();
    (el.querySelector('#rd-new') as HTMLButtonElement).click();
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    (drawer.querySelector('#rd-save') as HTMLButtonElement).click();
    await settle();
    expect(text(drawer)).toContain('Name the reader');
    expect(text(drawer)).toContain('Say where the reader is');

    set(drawer, 'rd-name', 'Main gate');
    set(drawer, 'rd-loc', 'Sports block');
    (drawer.querySelector('.choice[data-v="COUPON"]') as HTMLElement).click();
    await settle();
    (drawer.querySelector('#rd-save') as HTMLButtonElement).click();
    await settle();
    expect(text(drawer)).toContain('An active reader already has this name');
    expect(text(drawer)).toContain('A coupon counter must be bound to a merchant');

    set(drawer, 'rd-name', 'Sports room desk');
    (drawer.querySelector('#rd-mer-b') as HTMLButtonElement).click();
    await settle();
    const opts = [...document.querySelectorAll('.dd-opt')].map((o) => text(o));
    expect(opts).toEqual(['Campus Canteen']);
    (document.querySelector('.dd-opt') as HTMLButtonElement).click();
    await settle();
    (drawer.querySelector('#rd-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/readers', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      name: 'Sports room desk',
      location: 'Sports block',
      purpose: 'COUPON',
      merchantId: 'm-1',
      sectionId: null,
      locationType: null,
    });
    post.flush({ readerId: 't-9' });
    const fresh = list();
    fresh.items.push(
      terminal({
        id: 't-9',
        name: 'Sports room desk',
        location: 'Sports block',
        purpose: 'COUPON',
        merchant: { id: 'm-1', name: 'Campus Canteen' },
        paired: false,
        device: null,
        lastSeenAt: null,
        version: 1,
      }),
    );
    (await request((u) => u === '/api/v1/console/readers')).flush(fresh);
    (await request((u) => u === '/api/v1/console/pos-terminals')).flush(pos);
    const code = await request((u) => u === '/api/v1/console/readers/t-9/pairing-codes', 'POST');
    expect(code.request.headers.get('Idempotency-Key')).toBeTruthy();
    code.flush({ code: 'ABCD-EFGH', expiresAt: new Date(Date.now() + 600_000).toISOString() });
    await settle();
    const pair = document.querySelector('.drawer') as HTMLElement;
    expect(text(pair.querySelector('.sh-t h3'))).toBe('Pair Sports room desk');
    expect(text(pair.querySelector('#rd-code'))).toBe('ABCD-EFGH');
    expect(text(pair)).toContain('Valid for 10 minutes');
    expect(toasts()).toContain('Reader registered');
  });

  it('disables a reader with a reason, renames one and issues a pairing code (INS-032…034)', async () => {
    const el = await open();
    (el.querySelectorAll('#rd-table tbody tr')[0] as HTMLElement).click();
    await settle();
    let drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer)).toContain('Gate attendance');
    expect(text(drawer)).toContain('…A1B2C3');
    button(drawer, 'Disable').click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    const t = dlg.querySelector('textarea') as HTMLTextAreaElement;
    t.value = 'Water damage at the gate';
    t.dispatchEvent(new Event('input'));
    await settle(1);
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const off = await request((u) => u === '/api/v1/console/readers/t-1/status', 'POST');
    expect(off.request.body).toEqual({ enabled: false, reason: 'Water damage at the gate' });
    off.flush(
      terminal({ status: 'DISABLED', statusReason: 'Water damage at the gate', paired: false }),
    );
    await settle();
    expect(toasts()).toContain('Reader disabled');
    expect(text(drawer)).toContain('This reader is disabled');
    (await request((u) => u === '/api/v1/console/readers')).flush(list());
    drawer.querySelector<HTMLButtonElement>('.x-btn')!.click();
    await settle();

    // Rename / move: only what changed is sent, with If-Match.
    const row = el.querySelectorAll('#rd-table tbody tr')[1] as HTMLElement;
    (row.querySelector('.row-acts button') as HTMLButtonElement).click();
    await settle();
    drawer = document.querySelector('.drawer') as HTMLElement;
    expect((drawer.querySelector('#rd-name') as HTMLInputElement).value).toBe('Library desk');
    set(drawer, 'rd-loc', 'Library, first floor');
    await settle();
    (drawer.querySelector('#rd-save') as HTMLButtonElement).click();
    const patch = await request((u) => u === '/api/v1/console/readers/t-2', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v1"');
    expect(patch.request.body).toEqual({ location: 'Library, first floor' });
    patch.flush(list().items[1]!);
    await settle();
    expect(toasts()).toContain('Reader updated');
    (await request((u) => u === '/api/v1/console/readers')).flush(list());

    // An unpaired reader: a pairing code from its drawer.
    (el.querySelectorAll('#rd-table tbody tr')[1] as HTMLElement).click();
    await settle();
    drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer)).toContain('No device is paired yet');
    (drawer.querySelector('#rd-code') as HTMLButtonElement).click();
    (await request((u) => u === '/api/v1/console/readers/t-2/pairing-codes', 'POST')).flush({
      code: 'WXYZ-2345',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
    await settle();
    expect(text(document.querySelector('.drawer #rd-code'))).toBe('WXYZ-2345');
  });

  it('is read-only for management', async () => {
    const el = await open(
      session({ roles: [{ code: 'MANAGEMENT', name: 'Management', readOnly: true }] }),
      false,
    );
    expect(text(el)).toContain('Read-only.');
    expect(el.querySelector('#rd-new')).toBeNull();
    expect(el.querySelector('#rd-table .row-acts')).toBeNull();
  });
});
