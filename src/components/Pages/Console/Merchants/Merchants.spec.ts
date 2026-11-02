import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { inrWhole, maskedAccount } from './merchant-format';

const tick = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    'task.merchants',
    'merchants.view',
    'merchants.edit',
    'merchants.status',
  ],
  preferredLang: 'en',
  ...over,
});

const merchant = (over: object = {}) => ({
  id: 'mer-1',
  displayName: 'Campus Canteen',
  uniqueId: 'MERCAMTUN000830626',
  subType: 'REGULAR',
  status: 'ACTIVE',
  statusReason: null,
  department: 'Canteen',
  operator: 'Ravi Kumar',
  mobile: '9886110001',
  email: 'campus.canteen@tvps.example.in',
  accepts: { wallet: true, allowance: true, coupon: false },
  channels: { dynamicQr: true, nfc: false },
  isFeeAccount: false,
  today: { amount: money('768.50'), count: 13 },
  onboardedAt: '2026-06-10T05:00:00.000Z',
  version: 4,
  ...over,
});

const list = {
  items: [
    merchant(),
    merchant({
      id: 'mer-2',
      displayName: 'Lab Supplies Co',
      uniqueId: 'MERLABTUN000850626',
      subType: 'VENDOR',
      department: 'Vendors',
      operator: 'Imran Pasha',
      accepts: { wallet: true, allowance: false, coupon: false },
      today: { amount: money('0.00'), count: 0 },
    }),
    merchant({
      id: 'mer-3',
      displayName: 'TVPS Fee Account',
      uniqueId: 'MERTVPTUN000870626',
      department: 'Institution',
      operator: 'Accounts office',
      isFeeAccount: true,
      accepts: { wallet: true, allowance: false, coupon: false },
      today: { amount: money('5450.00'), count: 1 },
    }),
  ],
  nextCursor: null,
  kpis: { total: 3, active: 3, collectionsToday: money('8663.50'), paymentsToday: 46 },
};

const SVG =
  '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 148 148"><rect width="100%" height="100%" fill="white"/><path d="M16,16l4,0 0,4 -4,0 0,-4z"/></svg>';

const qr = (kind: string, over: object = {}) => ({
  id: `qr-${kind.toLowerCase()}`,
  kind,
  status: 'ACTIVE',
  statusReason: null,
  createdAt: '2026-06-10T05:00:00.000Z',
  statusChangedAt: null,
  payload: 'campusone://pay/s/OOPBWM44IY6HR5JBR77EIJAQ2U',
  svg: SVG,
  version: 1,
  ...over,
});

const detail = (over: object = {}) => ({
  ...merchant(),
  bank: {
    holderName: 'RAVI KUMAR',
    bankName: null,
    accountNumber: 'XXXXXXXX1234',
    ifsc: 'SBIN0001234',
    chequeFileId: 'f-9',
  },
  wallet: { walletNo: '555500083', status: 'ACTIVE', balance: money('1250.00') },
  qrCodes: [qr('PAYMENT')],
  ...over,
});

const userTypes = {
  items: [
    {
      id: 'ut-m',
      name: 'Merchant',
      category: 'MERCHANT',
      status: 'ACTIVE',
      members: 3,
      departments: [
        { id: 'd-c', name: 'Canteen', members: 1 },
        { id: 'd-v', name: 'Vendors', members: 1 },
      ],
      version: 1,
    },
  ],
};

const dialog = () => document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
const toasts = () => document.querySelector('.toasts')?.textContent?.replace(/\s+/g, ' ') ?? '';
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();
const button = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('button')].find((b) => text(b) === label) as HTMLButtonElement;

describe('console merchants & QR (PAY-016…024, PAY-029, PAY-031)', () => {
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

  async function open(s: object = session(), path = '/console/merchants') {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl(path);
    (await request((u) => u === '/api/v1/console/session')).flush(s);
    await nav;
    (await request((u) => u.startsWith('/api/v1/console/merchants?'))).flush(list);
    (await request((u) => u === '/api/v1/console/user-types')).flush(userTypes);
    await settle(5);
    return harness.routeNativeElement as HTMLElement;
  }

  async function openDrawer(row: number, d: object) {
    const el = harness.routeNativeElement as HTMLElement;
    (el.querySelectorAll('tbody tr')[row] as HTMLElement).click();
    const id = (d as { id: string }).id;
    (await request((u) => u === `/api/v1/console/merchants/${id}`)).flush(d);
    await settle();
    return document.querySelector('.drawer') as HTMLElement;
  }

  /** Answers the confirmation dialog (with a reason when asked). */
  async function confirm(reason?: string) {
    await settle(2);
    const dlg = dialog();
    expect(dlg).toBeTruthy();
    if (reason !== undefined) {
      const t = dlg.querySelector('textarea') as HTMLTextAreaElement;
      t.value = reason;
      t.dispatchEvent(new Event('input'));
    }
    const buttons = [...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[];
    buttons.at(-1)?.click();
    await settle(2);
    return text(dlg.querySelector('h3'));
  }

  it('formats the key figures and the masked account the prototype way', () => {
    expect(inrWhole(money('8663.50'))).toBe('₹8,664');
    expect(inrWhole(money('124560.49'))).toBe('₹1,24,560');
    expect(maskedAccount('XXXXXXXX1234')).toBe('••••••1234');
    expect(maskedAccount('XX1234')).toBe('••1234');
  });

  it('lists the merchants with the KPIs, accepts tags and today, and filters on the server', async () => {
    const el = await open();
    const kpis = [...el.querySelectorAll('.kpi')].map((k) => [
      text(k.querySelector('.k-l')),
      text(k.querySelector('.k-v')),
      text(k.querySelector('.k-d')) ?? null,
    ]);
    expect(kpis).toEqual([
      ['Active merchants', '3 of 3', null],
      ['Collections today', '₹8,664', '46 successful payments'],
      ['Coupon redemptions today', '—', null],
      ['Latest settlement', '—', null],
    ]);
    expect([...el.querySelectorAll('thead th')].map((t) => text(t)?.replace(/[↑↓]/g, ''))).toEqual([
      'Merchant',
      'Sub-type',
      'Merchant ID',
      'Accepts',
      'Status',
      'Collections today',
    ]);
    const rows = [...el.querySelectorAll('tbody tr')] as HTMLElement[];
    expect(rows.length).toBe(3);
    expect(text(rows[0]!.querySelector('.cell-s'))).toBe('Canteen · Ravi Kumar');
    expect([...rows[0]!.querySelectorAll('.cm-acc.on')].map((a) => text(a))).toEqual([
      'Wallet',
      'Allowance',
    ]);
    expect(rows[1]!.querySelector('.chip.tone-violet')?.textContent?.trim()).toBe('Vendor');
    expect(rows[0]!.querySelector('td.r')?.textContent?.replace(/\s+/g, '')).toBe(
      '₹768.5013payments',
    );
    expect(text(el.querySelector('.fsum'))).toBe('3 merchants');

    // Sorting by today's collections puts the largest first on the second click.
    const th = [...el.querySelectorAll('thead th')].at(-1)!;
    (th.querySelector('button') as HTMLButtonElement).click();
    (th.querySelector('button') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(text(el.querySelector('tbody tr .cell-t'))).toBe('TVPS Fee Account');
    expect(th.getAttribute('aria-sort')).toBe('descending');

    // The sub-type pill, the status filter and the search go to the server.
    button(el, 'Vendor').click();
    harness.detectChanges();
    const vendor = await request((u) => u.includes('subType=VENDOR'));
    vendor.flush({ ...list, items: [list.items[1]] });
    await settle();
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
    expect(text(el.querySelector('.fsum'))).toBe('1 merchant');

    (el.querySelector('#mer-st-b') as HTMLButtonElement).click();
    harness.detectChanges();
    button(document.body, 'Inactive').click();
    harness.detectChanges();
    const inactive = await request((u) => u.includes('status=INACTIVE'));
    expect(inactive.request.urlWithParams).toContain('subType=VENDOR');
    inactive.flush({ ...list, items: [] });
    await settle();
    expect(text(el.querySelector('tbody .empty h4'))).toBe('No merchants match');

    const q = el.querySelector('#mer-q') as HTMLInputElement;
    q.value = 'lab';
    q.dispatchEvent(new Event('input'));
    await wait(300);
    const searched = await request((u) => u.includes('q=lab'));
    searched.flush(list);
  });

  it('registers a merchant: inline errors, the cheque upload once, then the codes it accepts', async () => {
    const el = await open();
    (el.querySelector('#mer-new') as HTMLButtonElement).click();
    harness.detectChanges();
    const modal = document.querySelector('.modal.cm-m') as HTMLElement;
    expect(text(modal.querySelector('.sh-t h3'))).toBe('Register merchant');
    const ok = () => (modal.querySelector('#mn-ok') as HTMLButtonElement).click();
    const fill = (id: string, v: string) => {
      const i = modal.querySelector(`#${id}`) as HTMLInputElement;
      i.value = v;
      i.dispatchEvent(new Event('input'));
    };

    // Everything required is checked before anything is sent.
    ok();
    await settle(2);
    expect(modal.querySelectorAll('.fld.invalid').length).toBe(8);
    expect(text(modal.querySelector('#mn-name-e'))).toBe('This field is required.');

    fill('mn-name', 'campus canteen');
    fill('mn-acct', '123456789012');
    fill('mn-acct2', '123456789099');
    fill('mn-ifsc', 'sbin0001234');
    fill('mn-mobile', '98861x19901');
    ok();
    await settle(2);
    expect(text(modal.querySelector('#mn-name-e'))).toBe(
      'Another merchant already uses this name.',
    );
    expect(text(modal.querySelector('#mn-acct2-e'))).toBe("Account Number don't match");
    expect((modal.querySelector('#mn-ifsc') as HTMLInputElement).value).toBe('SBIN0001234');
    expect((modal.querySelector('#mn-mobile') as HTMLInputElement).value).toBe('9886119901');
    expect(text(modal.querySelector('#mn-bank'))).toBe('State Bank of India');

    // A vendor can't accept allowances or coupons (BR-42) and moves to the Vendors department.
    const choices = [...modal.querySelectorAll('.choice')] as HTMLElement[];
    choices[1]!.click();
    harness.detectChanges();
    expect((modal.querySelector('#mn-a-a') as HTMLInputElement).disabled).toBe(true);
    expect((modal.querySelector('#mn-dept') as HTMLSelectElement).value).toBe('d-v');
    choices[0]!.click();
    harness.detectChanges();
    expect((modal.querySelector('#mn-dept') as HTMLSelectElement).value).toBe('d-c');

    fill('mn-name', 'Fresh Fruits Counter');
    fill('mn-op', 'Asha  Rao');
    fill('mn-acct2', '123456789012');
    fill('mn-holder', 'Asha Rao');
    fill('mn-email', 'Fruits@TVPS.example.in');
    const allowance = modal.querySelector('#mn-a-a') as HTMLInputElement;
    allowance.checked = true;
    allowance.dispatchEvent(new Event('change'));
    const cheque = modal.querySelector('#mn-cheque') as HTMLInputElement;
    const file = new File(['%PDF-1.4 cheque'], 'cheque.pdf', { type: 'application/pdf' });
    Object.defineProperty(cheque, 'files', { value: [file] });
    cheque.dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(modal.querySelector('.upl.done')?.textContent).toContain('cheque.pdf');

    ok();
    expect(await confirm()).toBe('Register Fresh Fruits Counter?');
    const upload = await request((u) => u === '/api/v1/files', 'POST');
    expect(upload.request.headers.get('X-CampusOne-Surface')).toBe('console');
    const form = upload.request.body as FormData;
    expect(form.get('purpose')).toBe('document');
    upload.flush({ fileId: 'f-1' }, { status: 201, statusText: 'Created' });

    let post = await request((u) => u === '/api/v1/console/merchants', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      displayName: 'Fresh Fruits Counter',
      operatorFirstName: 'Asha',
      operatorLastName: 'Rao',
      subType: 'REGULAR',
      departmentId: 'd-c',
      mobile: '9886119901',
      email: 'fruits@tvps.example.in',
      acceptsAllowance: true,
      acceptsCoupon: false,
      bank: {
        holderName: 'Asha Rao',
        bankName: 'State Bank of India',
        accountNumber: '123456789012',
        ifsc: 'SBIN0001234',
      },
      chequeFileId: 'f-1',
      logoFileId: null,
    });
    post.flush(
      {
        code: 'VALIDATION.FAILED',
        status: 422,
        errors: [
          { field: 'displayName', code: 'MER.NAME_TAKEN' },
          { field: 'bank.ifsc', code: 'IDN.IFSC_INVALID' },
        ],
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await settle();
    expect(text(modal.querySelector('#mn-name-e'))).toBe(
      'Another merchant already uses this name.',
    );
    expect(text(modal.querySelector('#mn-ifsc-e'))).toBe(
      'IFSC Code is Not Valid. Please Enter a Valid IFSC Code.',
    );

    // The mobile belongs to another institution (BR-01); the cheque is not uploaded again.
    fill('mn-name', 'Fresh Fruit Counter');
    ok();
    await confirm();
    post = await request((u) => u === '/api/v1/console/merchants', 'POST');
    expect((post.request.body as { chequeFileId: string }).chequeFileId).toBe('f-1');
    post.flush(
      {
        code: 'IDN.MOBILE_IN_OTHER_INSTITUTION',
        status: 409,
        errors: [{ field: 'mobile', code: 'IDN.MOBILE_IN_OTHER_INSTITUTION' }],
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expect(modal.querySelector('#mn-mobile')?.closest('.fld')?.classList).toContain('invalid');
    const ctl = TestBed.inject(HttpTestingController);
    expect(ctl.match((r) => r.url === '/api/v1/files').length).toBe(0);

    fill('mn-mobile', '9886119902');
    ok();
    await confirm();
    post = await request((u) => u === '/api/v1/console/merchants', 'POST');
    post.flush(
      { merchantId: 'mer-9', uniqueId: 'MERFRETUN000880626' },
      { status: 201, statusText: 'Created' },
    );
    const payment = await request((u) => u === '/api/v1/console/merchants/mer-9/qr-codes', 'POST');
    expect(payment.request.body).toEqual({ kind: 'PAYMENT' });
    expect(payment.request.headers.get('Idempotency-Key')).toBeTruthy();
    payment.flush(qr('PAYMENT'), { status: 201, statusText: 'Created' });
    const alw = await request((u) => u === '/api/v1/console/merchants/mer-9/qr-codes', 'POST');
    expect(alw.request.body).toEqual({ kind: 'ALLOWANCE' });
    alw.flush(qr('ALLOWANCE'), { status: 201, statusText: 'Created' });
    await settle();
    expect(toasts()).toContain('Merchant registered');
    expect(toasts()).toContain('Fresh Fruit Counter · MERFRETUN000880626');
    // The list reloads and the new merchant's drawer opens.
    await request((u) => u === '/api/v1/console/merchants/mer-9');
    await request((u) => u.startsWith('/api/v1/console/merchants?'));
    expect(document.querySelector('.modal.cm-m #mn-name')).toBeNull();
  });

  it('opens the drawer with the masked bank account, the tiles and the QR images', async () => {
    await open();
    const drawer = await openDrawer(0, detail());
    expect(text(drawer.querySelector('.sh-t p'))).toBe('MERCAMTUN000830626 · Canteen');
    expect(text(drawer.querySelector('.cm-hero .t-sm'))).toBe(
      'Regular merchant · Canteen · MERCAMTUN000830626',
    );
    expect([...drawer.querySelectorAll('.cm-tile')].map((t) => text(t))).toEqual([
      'Collections today₹768.50',
      'Payments today13',
      'Wallet balance₹1,250.00',
    ]);
    const kv = (label: string) =>
      text(
        [...drawer.querySelectorAll('.kv dt')].find((d) => text(d) === label)?.nextElementSibling,
      );
    expect(kv('Mobile')).toBe('+91 98861 10001');
    expect(kv('Account number')).toBe('••••••1234');
    expect(kv('Bank')).toBe('State Bank of India');
    expect(kv('Account holder')).toBe('Ravi Kumar');
    expect(kv('Cancelled cheque')).toBe('On file');
    expect(drawer.textContent).not.toContain('XXXXXXXX1234');

    const pay = drawer.querySelector('.cm-qr[data-kind="PAYMENT"]') as HTMLElement;
    const svg = pay.querySelector('.qr svg') as SVGElement;
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('width')).toBe('112');
    expect(svg.getAttribute('aria-label')).toBe('Payment QR code of Campus Canteen');
    expect(pay.querySelector('path')).toBeTruthy();
    expect(text(pay.querySelector('.chip'))).toBe('Active');
    const alw = drawer.querySelector('.cm-qr[data-kind="ALLOWANCE"]') as HTMLElement;
    expect(alw.classList).toContain('off');
    expect(text(alw.querySelector('small'))).toBe('Not generated yet');
    const cpn = drawer.querySelector('.cm-qr[data-kind="COUPON"]') as HTMLElement;
    expect(text(cpn.querySelector('small'))).toBe("Campus Canteen doesn't accept coupons");
    expect(cpn.querySelector('button')).toBeNull();
    expect(text(drawer.querySelector('.empty h4'))).toBe('No settlement lines yet');
  });

  it("explains a vendor's codes (BR-42)", async () => {
    await open();
    const drawer = await openDrawer(
      1,
      detail({ ...list.items[1], qrCodes: [qr('PAYMENT')], bank: null }),
    );
    const alw = drawer.querySelector('.cm-qr[data-kind="ALLOWANCE"]') as HTMLElement;
    expect(alw.textContent).toContain("Lab Supplies Co doesn't accept allowances");
    expect(alw.textContent).toContain("Vendors can't accept allowances (BR-42)");
    expect(alw.querySelector('button')).toBeNull();
  });

  it('generates a code, deactivates it with a reason and activates it again (If-Match)', async () => {
    await open();
    const drawer = await openDrawer(0, detail());
    button(drawer, 'Generate allowance QR').click();
    expect(await confirm()).toBe("Generate Campus Canteen's allowance QR?");
    const gen = await request((u) => u === '/api/v1/console/merchants/mer-1/qr-codes', 'POST');
    expect(gen.request.body).toEqual({ kind: 'ALLOWANCE' });
    expect(gen.request.headers.get('Idempotency-Key')).toBeTruthy();
    gen.flush(qr('ALLOWANCE'), { status: 201, statusText: 'Created' });
    await settle();
    const alw = drawer.querySelector('.cm-qr[data-kind="ALLOWANCE"]') as HTMLElement;
    expect(alw.classList).not.toContain('off');
    expect(alw.querySelector('.qr svg')).toBeTruthy();
    expect(toasts()).toContain('Allowance QR generated');

    const pay = () => drawer.querySelector('.cm-qr[data-kind="PAYMENT"]') as HTMLElement;
    button(pay(), 'Deactivate').click();
    expect(await confirm('Printed code damaged')).toBe("Deactivate Campus Canteen's payment QR?");
    let patch = await request((u) => u === '/api/v1/console/qr-codes/qr-payment', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v1"');
    expect(patch.request.body).toEqual({ status: 'INACTIVE', reason: 'Printed code damaged' });
    patch.flush(
      qr('PAYMENT', { status: 'INACTIVE', statusReason: 'Printed code damaged', version: 2 }),
    );
    await settle();
    expect(text(pay().querySelector('.chip'))).toBe('Inactive');
    expect(pay().querySelector('.qr')?.classList).toContain('dim');
    expect(pay().textContent).toContain('Printed code damaged');

    button(pay(), 'Activate').click();
    expect(await confirm()).toBe("Activate Campus Canteen's payment QR?");
    patch = await request((u) => u === '/api/v1/console/qr-codes/qr-payment', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v2"');
    expect(patch.request.body).toEqual({ status: 'ACTIVE', reason: null });
    patch.flush(qr('PAYMENT', { version: 3 }));
    await settle();
    expect(text(pay().querySelector('.chip'))).toBe('Active');
  });

  it('reports a code that already exists in the register wording and reloads', async () => {
    await open();
    const drawer = await openDrawer(0, detail());
    button(drawer, 'Generate allowance QR').click();
    await confirm();
    (await request((u) => u === '/api/v1/console/merchants/mer-1/qr-codes', 'POST')).flush(
      { code: 'MER.QR_EXISTS', status: 409, params: { kind: 'Allowance' } },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expect(toasts()).toContain('Allowance QR already exists. Static codes are generated once.');
    await request((u) => u === '/api/v1/console/merchants/mer-1');
  });

  it('renames with the checks, a confirmation and If-Match', async () => {
    await open();
    const drawer = await openDrawer(0, detail());
    button(drawer, 'Rename').click();
    harness.detectChanges();
    const modal = [...document.querySelectorAll('.modal')].find(
      (m) => text(m.querySelector('.sh-t h3')) === 'Rename merchant',
    ) as HTMLElement;
    const input = modal.querySelector('#mr-name') as HTMLInputElement;
    expect(input.value).toBe('Campus Canteen');
    expect(text(modal.querySelector('.count'))).toBe('14/40');
    const set = (v: string) => {
      input.value = v;
      input.dispatchEvent(new Event('input'));
      (modal.querySelector('#mr-ok') as HTMLButtonElement).click();
      harness.detectChanges();
      return text(modal.querySelector('#mr-name-e'));
    };
    expect(set('lab supplies co')).toBe('Another merchant already uses this name.');
    expect(set('Campus Canteen')).toBe("This is already the merchant's name");
    expect(set('CC')).toBe('Use 3–40 characters');
    set('Campus Kitchen');
    expect(await confirm()).toBe('Rename to “Campus Kitchen”?');
    const patch = await request((u) => u === '/api/v1/console/merchants/mer-1', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v4"');
    expect(patch.request.body).toEqual({ displayName: 'Campus Kitchen' });
    patch.flush(detail({ displayName: 'Campus Kitchen', version: 5 }));
    await settle();
    expect(toasts()).toContain('Merchant renamed');
    expect(text(drawer.querySelector('.cm-hero .t-h3'))).toBe('Campus Kitchen');
    // The list shows the new name.
    await request((u) => u.startsWith('/api/v1/console/merchants?'));
  });

  it('keeps the fee account active and shows a refused deactivation in register wording', async () => {
    await open();
    let drawer = await openDrawer(2, detail({ ...list.items[2] }));
    const status = () => drawer.querySelector('#mer-status') as HTMLButtonElement;
    expect(status().disabled).toBe(true);
    expect(status().parentElement?.getAttribute('title')).toBe(
      "This is the institution's fee account, so it can't be deactivated.",
    );
    (drawer.querySelector('.x-btn') as HTMLButtonElement).click();
    harness.detectChanges();

    drawer = await openDrawer(0, detail());
    expect(status().disabled).toBe(false);
    status().click();
    expect(await confirm('Contract ended')).toBe('Deactivate Campus Canteen?');
    let post = await request((u) => u === '/api/v1/console/merchants/mer-1/status', 'POST');
    expect(post.request.body).toEqual({ to: 'INACTIVE', reason: 'Contract ended' });
    // Made the fee account meanwhile: the server refuses.
    post.flush(
      { code: 'MER.FEE_ACCOUNT_PROTECTED', status: 409 },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    expect(toasts()).toContain('Not changed');
    expect(toasts()).toContain(
      "This is the institution's fee account, so it can't be deactivated.",
    );
    (await request((u) => u === '/api/v1/console/merchants/mer-1')).flush(detail());
    await settle();

    status().click();
    await confirm('Contract ended on 30 Sep');
    post = await request((u) => u === '/api/v1/console/merchants/mer-1/status', 'POST');
    post.flush(
      detail({ status: 'INACTIVE', statusReason: 'Contract ended on 30 Sep', version: 5 }),
    );
    await settle();
    expect(text(status())).toBe('Activate merchant');
    expect(drawer.textContent).toContain('Contract ended on 30 Sep');
    expect(toasts()).toContain('Merchant deactivated');

    status().click();
    expect(await confirm()).toBe('Activate Campus Canteen?');
    post = await request((u) => u === '/api/v1/console/merchants/mer-1/status', 'POST');
    expect(post.request.body).toEqual({ to: 'ACTIVE', reason: null });
  });

  it('switches a collection channel with If-Match', async () => {
    await open();
    const drawer = await openDrawer(0, detail());
    const nfc = () => drawer.querySelector('#mer-ch-nfc') as HTMLButtonElement;
    expect(nfc().getAttribute('aria-checked')).toBe('false');
    expect(drawer.querySelector('#mer-ch-dynamicQr')?.getAttribute('aria-checked')).toBe('true');
    nfc().click();
    expect(await confirm()).toBe('Turn on NFC card taps for Campus Canteen?');
    const put = await request((u) => u === '/api/v1/console/merchants/mer-1/channels', 'PUT');
    expect(put.request.headers.get('If-Match')).toBe('"v4"');
    expect(put.request.body).toEqual({ dynamicQr: true, nfc: true });
    put.flush(detail({ channels: { dynamicQr: true, nfc: true }, version: 5 }));
    await settle();
    expect(nfc().getAttribute('aria-checked')).toBe('true');
    expect(toasts()).toContain('NFC card taps turned on');

    // A stale version is refused and the drawer reloads the merchant.
    nfc().click();
    await confirm();
    (await request((u) => u === '/api/v1/console/merchants/mer-1/channels', 'PUT')).flush(
      { code: 'GEN.CONFLICT_VERSION', status: 412 },
      { status: 412, statusText: 'Precondition Failed' },
    );
    await settle();
    expect(toasts()).toContain('Someone else changed this record.');
    await request((u) => u === '/api/v1/console/merchants/mer-1');
  });

  it('downloads the printable card and e-mails the codes', async () => {
    const saved: string[] = [];
    const url = URL as unknown as {
      createObjectURL?: (b: Blob) => string;
      revokeObjectURL?: (u: string) => void;
    };
    const before = { create: url.createObjectURL, revoke: url.revokeObjectURL };
    url.createObjectURL = () => 'blob:card';
    url.revokeObjectURL = () => undefined;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    try {
      await open();
      const drawer = await openDrawer(0, detail());
      const pay = drawer.querySelector('.cm-qr[data-kind="PAYMENT"]') as HTMLElement;
      button(pay, 'Card').click();
      const pdf = await request((u) => u === '/api/v1/console/qr-codes/qr-payment/card.pdf');
      expect(pdf.request.responseType).toBe('blob');
      pdf.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
      await settle();
      expect(saved).toEqual(['Campus Canteen Payment QR.pdf']);
      expect(toasts()).toContain('QR card downloaded');

      button(drawer, 'E-mail all QR codes').click();
      const mail = await request((u) => u === '/api/v1/console/qr-codes/emails', 'POST');
      expect(mail.request.body).toEqual({ merchantIds: ['mer-1'] });
      expect(mail.request.headers.get('Idempotency-Key')).toBeTruthy();
      mail.flush({ sent: 1, skipped: 0 }, { status: 202, statusText: 'Accepted' });
      await settle();
      expect(toasts()).toContain('1 QR code e-mailed');
      expect(toasts()).toContain('Sent to campus.canteen@tvps.example.in');
    } finally {
      click.mockRestore();
      url.createObjectURL = before.create;
      url.revokeObjectURL = before.revoke;
    }
  });

  it('is read-only for Management and without the merchants sub-tasks', async () => {
    const el = await open(
      session({
        roles: [{ code: 'MANAGEMENT', name: 'Management', readOnly: true }],
        subTasks: ['home.view', 'task.home', 'task.merchants', 'merchants.view'],
      }),
    );
    expect(el.querySelector('#mer-new')).toBeNull();
    const reg = button(el, 'Register merchant');
    expect(reg.disabled).toBe(true);
    expect(text(el.querySelector('.note'))).toContain('Read-only.');
    const drawer = await openDrawer(0, detail());
    expect((drawer.querySelector('#mer-ch-nfc') as HTMLButtonElement).disabled).toBe(true);
    expect(button(drawer, 'Rename').disabled).toBe(true);
    expect(button(drawer, 'Deactivate').disabled).toBe(true);
    expect(button(drawer, 'Generate allowance QR').disabled).toBe(true);
    // Viewing the printable card needs only merchants.view.
    expect(button(drawer, 'Card').disabled).toBe(false);
  });

  it('opens the registration when sent from Onboard → Staff (client 2026-10-14)', async () => {
    await open(session(), '/console/merchants?register=1');
    const modal = document.querySelector('.modal.cm-m') as HTMLElement;
    expect(text(modal.querySelector('.sh-t h3'))).toBe('Register merchant');
  });

  it('does not open the registration for a role that can’t register', async () => {
    await open(
      session({
        roles: [{ code: 'MANAGEMENT', name: 'Management', readOnly: true }],
        subTasks: ['home.view', 'task.home', 'task.merchants', 'merchants.view'],
      }),
      '/console/merchants?register=1',
    );
    expect(document.querySelector('.modal.cm-m #mn-name')).toBeNull();
  });
});
