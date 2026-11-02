import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import type { CorporateCodeList, CorporateCodeView } from './corporate-codes.api';

const tick = () => new Promise((r) => setTimeout(r, 0));
async function request(url: string, method = 'GET') {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 80; i++) {
    const found = ctl.match((r) => r.urlWithParams === url && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} ${url}`);
}

const session = (subTasks: string[]) => ({
  name: 'PRAKASH SHETTY',
  email: 'prakash.shetty@tvps.example.in',
  institution: { id: 'i-1', name: 'Tunga Valley Public School', shortName: 'TVPS', city: 'X' },
  roles: [{ code: 'INSTITUTION_ADMIN', name: 'Institution Administrator', readOnly: false }],
  subTasks: ['home.view', 'task.home', 'task.corpcodes', ...subTasks],
  preferredLang: 'en',
});

const code = (over: Partial<CorporateCodeView> = {}): CorporateCodeView => ({
  id: 'cc-1',
  bankName: null,
  ifsc: null,
  corporateCode: 'RPTV',
  poolAccountRef: 'POOLTVPS0042',
  isDefault: true,
  status: 'ACTIVE',
  classes: [],
  version: 1,
  updatedAt: '2026-10-14T05:00:00.000Z',
  ...over,
});
const listOf = (
  items: CorporateCodeView[],
  mapped: Record<string, string> = {},
): CorporateCodeList => ({
  maxLength: 10,
  items,
  classes: [
    { id: 'k-n', name: 'Nursery', codeId: mapped['k-n'] ?? null },
    { id: 'k-9', name: 'Grade 9', codeId: mapped['k-9'] ?? null },
    { id: 'k-10', name: 'Grade 10', codeId: mapped['k-10'] ?? null },
  ],
});

describe('bank accounts & VANs in the console (INS-043…045; client 2026-10-14)', () => {
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

  async function settle(n = 5) {
    for (let i = 0; i < n; i++) await tick();
    harness.detectChanges();
  }
  /** The visible words, with a space between elements (as a screen reader reads them). */
  const text = (sel: string) => {
    const parts: string[] = [];
    const walk = (n: Node) => {
      if (n.nodeType === Node.TEXT_NODE) parts.push(n.textContent ?? '');
      else n.childNodes.forEach(walk);
      if (n.nodeType === Node.ELEMENT_NODE) parts.push(' ');
    };
    const el = document.querySelector(sel);
    if (el) walk(el);
    return parts.join('').replace(/\s+/g, ' ').trim();
  };
  const button = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === label,
    );
  const type = (id: string, v: string) => {
    const el = document.getElementById(id) as HTMLInputElement;
    el.value = v;
    el.dispatchEvent(new Event('input'));
  };

  async function open(subTasks: string[], list: CorporateCodeList) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/corpcodes');
    (await request('/api/v1/console/session')).flush(session(subTasks));
    await nav;
    (await request('/api/v1/console/corporate-codes')).flush(list);
    await settle();
  }

  it('shows the carried-over default code and the classes still on it', async () => {
    await open(['corpcodes.view', 'corpcodes.edit'], listOf([code()]));
    expect(text('#cc-table')).toContain('Bank name not filled in');
    expect(text('#cc-table')).toContain('RPTV Default');
    expect(text('#cc-why')).toContain('default code (RPTV)');
    expect(text('#cc-unmapped')).toContain('Nursery, Grade 9, Grade 10');
  });

  it('adds a code for chosen classes, with the bank, IFSC and pool account', async () => {
    await open(['corpcodes.view', 'corpcodes.edit'], listOf([code()]));
    button('Add a corporate code')!.click();
    await settle();
    type('cc-bank', 'Axis Bank');
    type('cc-code', 'axis');
    type('cc-ifsc', 'utib0cch274');
    const boxes = [...document.querySelectorAll<HTMLInputElement>('#cc-classes input')];
    boxes[0]!.click(); // Nursery
    boxes[1]!.click(); // Grade 9
    await settle();
    button('Add code')!.click();
    const post = await request('/api/v1/console/corporate-codes', 'POST');
    expect(post.request.headers.has('Idempotency-Key')).toBe(true);
    expect(post.request.body).toEqual({
      bankName: 'Axis Bank',
      corporateCode: 'AXIS',
      ifsc: 'UTIB0CCH274',
      poolAccountRef: null,
      classIds: ['k-n', 'k-9'],
    });
    const axis = code({
      id: 'cc-2',
      bankName: 'Axis Bank',
      ifsc: 'UTIB0CCH274',
      corporateCode: 'AXIS',
      isDefault: false,
      classes: [
        { id: 'k-n', name: 'Nursery' },
        { id: 'k-9', name: 'Grade 9' },
      ],
    });
    post.flush(axis, { status: 201, statusText: 'Created' });
    (await request('/api/v1/console/corporate-codes')).flush(
      listOf([code(), axis], { 'k-n': 'cc-2', 'k-9': 'cc-2' }),
    );
    await settle();
    expect(text('#cc-table')).toContain('Axis Bank');
    expect(text('#cc-table')).toContain('Nursery Grade 9');
    expect(text('#cc-unmapped')).toBe('Using the default code: Grade 10.');
  });

  it('greys out a class on another code, and keeps the default', async () => {
    const axis = code({
      id: 'cc-2',
      bankName: 'Axis Bank',
      corporateCode: 'AXIS',
      isDefault: false,
      classes: [{ id: 'k-9', name: 'Grade 9' }],
    });
    await open(['corpcodes.view', 'corpcodes.edit'], listOf([code(), axis], { 'k-9': 'cc-2' }));
    button('Add a corporate code')!.click();
    await settle();
    expect(text('#cc-classes')).toContain('Grade 9 (on AXIS)');
    // A class uses one code: Grade 9 can't be chosen here until it is taken off AXIS.
    const boxes = [...document.querySelectorAll<HTMLInputElement>('#cc-classes input')];
    expect(boxes.map((b) => b.disabled)).toEqual([false, true, false]);
    button('Cancel')!.click();
    await settle();
    // The default has no Disable; another code does.
    const rows = [...document.querySelectorAll('#cc-table tbody tr')];
    expect(rows[0]!.textContent).not.toContain('Disable');
    expect(rows[1]!.textContent).toContain('Make default');
  });

  it('is read-only without the edit task', async () => {
    await open(['corpcodes.view'], listOf([code()]));
    expect(button('Add a corporate code')!.disabled).toBe(true);
    expect(button('Change')).toBeUndefined();
  });
});
