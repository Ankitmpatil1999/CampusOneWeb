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
import { plusDays } from '../Applications/app-format';
import type { AdmissionLink, AdmissionLinks } from './admission-links.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
const money = (amount: string) => ({ amount, currency: 'INR' as const });
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const toasts = () => text(document.querySelector('.toasts'));
const today = istBusinessDate(new Date());

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
  subTasks: [
    'task.admqr',
    'admqr.view',
    'admqr.edit',
    'admissions.view',
    'academics.view',
    'fees.view',
  ],
  preferredLang: 'en',
  ...over,
});

const link = (over: Partial<AdmissionLink> = {}): AdmissionLink => ({
  id: 'l-2',
  status: 'ACTIVE',
  url: 'http://localhost:4200/admissions/tok-2',
  qrSvg: '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
  year: '2027-28',
  expiresAt: null,
  expired: false,
  createdAt: '2026-10-04T02:41:47.398Z',
  replacedAt: null,
  ...over,
});
const links = (over: Partial<AdmissionLinks> = {}): AdmissionLinks => ({
  current: link(),
  history: [
    link({
      id: 'l-1',
      status: 'REPLACED',
      url: null,
      qrSvg: null,
      createdAt: '2026-06-01T05:00:00.000Z',
      replacedAt: '2026-10-04T02:41:47.398Z',
    }),
  ],
  ...over,
});
const lookups = {
  '/api/v1/console/academic-years': {
    items: [
      {
        id: 'y-27',
        label: '2027-28',
        startsOn: '2027-04-01',
        endsOn: '2028-03-31',
        status: 'OPEN',
        current: false,
      },
      {
        id: 'y-26',
        label: '2026-27',
        startsOn: '2026-04-01',
        endsOn: plusDays(today, 90),
        status: 'OPEN',
        current: true,
      },
    ],
  },
  '/api/v1/console/entry-fees': {
    items: [
      {
        year: { id: 'y-27', label: '2027-28', status: 'OPEN', current: false },
        fees: {
          applicationFee: money('600.00'),
          applicationMandatory: true,
          admissionFee: money('12000.00'),
          updatedAt: null,
          version: 1,
        },
      },
    ],
  },
};

describe('console admission link and QR (INS-027…029)', () => {
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

  async function open(s: object = session(), l: AdmissionLinks = links()) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/admissionqr');
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    (await request((u) => u === '/api/v1/console/admission-links')).flush(l);
    for (let i = 0; i < 4; i++) {
      serve(lookups);
      await settle(2);
    }
    const counts = TestBed.inject(HttpTestingController).match((r) =>
      r.urlWithParams.startsWith('/api/v1/console/applications'),
    );
    for (const c of counts) {
      c.flush({ items: [], nextCursor: null, counts: { DRAFT: 2, SUBMITTED: 3 }, kpis: null });
    }
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  it('shows the link with its QR, the year, applications, fee and every link', async () => {
    const el = await open();
    const card = el.querySelector('#aq-current') as HTMLElement;
    expect(text(card)).toContain('2027-28Admissions open');
    expect(text(card)).toContain('Applications for the year starting 01 Apr 2027.');
    expect(text(card.querySelector('#aq-url'))).toBe('http://localhost:4200/admissions/tok-2');
    expect(card.querySelector('.qr svg')?.getAttribute('width')).toBe('168');
    const kpis = text(card.querySelector('#aq-kpis'));
    expect(kpis).toContain('5applications');
    expect(kpis).toContain('3to review');
    expect(kpis).toContain('₹600application fee · required');
    expect(kpis).toContain('No end datelink works until');
    const rows = el.querySelectorAll('#aq-table tbody tr');
    expect(rows).toHaveLength(2);
    expect(text(rows[0])).toContain('Active');
    expect(text(rows[1])).toContain('No longer works');
    expect(text(rows[1])).toContain('Replaced');
  });

  it('e-mails the link to the addresses given (INS-029)', async () => {
    const el = await open();
    (el.querySelector('#aq-mail') as HTMLButtonElement).click();
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(text(m.querySelector('#qe-msg'))).toContain('http://localhost:4200/admissions/tok-2');
    const to = m.querySelector('#qe-to') as HTMLInputElement;
    to.value = 'office@example.com, not-an-address';
    to.dispatchEvent(new Event('input'));
    (m.querySelector('#qe-send') as HTMLButtonElement).click();
    await settle();
    expect(text(m)).toContain("“not-an-address” isn't a valid e-mail address");
    to.value = 'Office@example.com, desk@example.com';
    to.dispatchEvent(new Event('input'));
    (m.querySelector('#qe-send') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/admission-links/l-2/email', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({ emails: ['office@example.com', 'desk@example.com'] });
    post.flush({ sent: 2 }, { status: 202, statusText: 'Accepted' });
    await settle();
    expect(toasts()).toContain('Link e-mailed');
    expect(toasts()).toContain('2 recipients');
  });

  it('replaces the link with a year and a last day (INS-028)', async () => {
    const el = await open();
    (el.querySelector('#aq-replace') as HTMLButtonElement).click();
    await settle();
    const m = [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
    expect(text(m)).toContain('The current link and QR stop working straight away');
    expect(text(m.querySelector('#ql-year-b'))).toBe('2027-28');
    const exp = m.querySelector('#ql-exp') as HTMLInputElement;
    exp.value = today;
    exp.dispatchEvent(new Event('input'));
    (m.querySelector('#ql-go') as HTMLButtonElement).click();
    await settle();
    expect(text(m)).toContain('Choose a day after today');
    const last = plusDays(today, 30);
    exp.value = last;
    exp.dispatchEvent(new Event('input'));
    (m.querySelector('#ql-go') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/admission-links', 'POST');
    expect(post.request.body).toEqual({
      yearId: 'y-27',
      expiresAt: new Date(`${last}T23:59:59+05:30`).toISOString(),
    });
    post.flush(link({ id: 'l-3' }), { status: 201, statusText: 'Created' });
    await settle();
    expect(toasts()).toContain('New link generated');
    (await request((u) => u === '/api/v1/console/admission-links')).flush(links());
  });

  it('offers to generate a link when there is none, and is read-only without admqr.edit', async () => {
    const el = await open(
      session({ subTasks: ['task.admqr', 'admqr.view'] }),
      links({ current: null, history: [] }),
    );
    expect(text(el.querySelector('#aq-none'))).toContain('No admission link yet');
    expect((el.querySelector('#aq-gen') as HTMLButtonElement).disabled).toBe(true);
  });
});
