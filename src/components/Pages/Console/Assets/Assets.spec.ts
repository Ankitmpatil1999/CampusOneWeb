import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { paymentsByAsset } from './asset-format';
import { linkedAfter, type Asset, type AssetGroup, type VendorInvoice } from './assets.api';

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

const money = (amount: string) => ({ amount, currency: 'INR' as const });

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
    'task.config',
    'config.view',
    'config.edit',
    'merchants.view',
    'merchants.edit',
  ],
  preferredLang: 'en',
  ...over,
});

const group = (over: Partial<AssetGroup> = {}): AssetGroup => ({
  id: 'g-lab',
  name: 'Science lab equipment',
  description: null,
  status: 'ACTIVE',
  assets: 2,
  vendors: 1,
  version: 1,
  ...over,
});

const groups = () => ({
  items: [
    group(),
    group({ id: 'g-lib', name: 'Library books', assets: 1, vendors: 0 }),
    group({ id: 'g-hst', name: 'Hostel furnishings', status: 'INACTIVE', assets: 0, vendors: 0 }),
  ],
});

const asset = (over: Partial<Asset> = {}): Asset => ({
  id: 'a-1',
  group: { id: 'g-lab', name: 'Science lab equipment' },
  name: 'Compound microscopes ×3',
  type: 'PHYSICAL',
  description: null,
  status: 'ACTIVE',
  version: 2,
  ...over,
});

const assets = () => ({
  items: [
    asset(),
    asset({ id: 'a-2', name: 'Glassware set', version: 1 }),
    asset({
      id: 'a-3',
      group: { id: 'g-lib', name: 'Library books' },
      name: 'Kannada fiction collection',
      status: 'INACTIVE',
    }),
  ],
});

const merchant = (id: string, name: string, sub: 'REGULAR' | 'VENDOR') => ({
  id,
  displayName: name,
  uniqueId: `MER${id}`,
  subType: sub,
  status: 'ACTIVE',
  statusReason: null,
  department: sub === 'VENDOR' ? 'Vendors' : 'Canteen',
  operator: 'Ravi Kumar',
  mobile: null,
  email: null,
  accepts: { wallet: true, allowance: false, coupon: false },
  channels: { dynamicQr: false, nfc: false },
  isFeeAccount: false,
  today: { amount: money('0.00'), count: 0 },
  onboardedAt: null,
  version: 1,
});

const invoice = (over: Partial<VendorInvoice> = {}): VendorInvoice => ({
  reference: 'PAY2610040001',
  merchant: { id: 'v-1', name: 'Lab Supplies Co' },
  invoiceNo: 'INV-77',
  asset: { id: 'a-1', name: 'Compound microscopes ×3' },
  amount: money('18450.00'),
  paidAt: '2026-10-02T06:30:00.000Z',
  payer: 'Prakash Shetty',
  ...over,
});

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const toasts = () => text(document.querySelector('.toasts'));

describe('console assets (INS-020…026, MER-013)', () => {
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

  /** The merchants, invoices and audit entries the page reads after the groups and assets. */
  async function flushMerchants(audit: object[]) {
    (await request((u) => u === '/api/v1/console/merchants?limit=200')).flush({
      items: [
        merchant('m-1', 'Campus Canteen', 'REGULAR'),
        merchant('v-1', 'Lab Supplies Co', 'VENDOR'),
      ],
      nextCursor: null,
      kpis: { total: 2, active: 2, collectionsToday: money('0.00'), paymentsToday: 0 },
    });
    (await request((u) => u === '/api/v1/console/vendor-invoices')).flush({ items: [invoice()] });
    (await request((u) => u.startsWith('/api/v1/console/audit-events?entity=merchant'))).flush({
      items: audit,
      nextCursor: null,
    });
  }

  const linkEvent = {
    action: 'VENDOR_ASSET_GROUPS_SET',
    entity: { type: 'merchant', id: 'v-1' },
    actor: { type: 'staff', name: 'Prakash Shetty' },
    at: '2026-10-01T05:00:00.000Z',
    before: { groups: [] },
    after: { groups: ['g-lab'], skipped: [] },
    reason: null,
  };

  async function open(audit: object[] = [linkEvent]) {
    harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/console/assets');
    (await request((u) => u === '/api/v1/console/session')).flush(session());
    await nav;
    (await request((u) => u === '/api/v1/console/asset-groups')).flush(groups());
    (await request((u) => u === '/api/v1/console/assets')).flush(assets());
    await flushMerchants(audit);
    await settle(5);
    return harness.routeNativeElement as HTMLElement;
  }

  const set = (root: ParentNode, id: string, v: string) => {
    const i = root.querySelector(`#${id}`) as HTMLInputElement;
    i.value = v;
    i.dispatchEvent(new Event('input'));
  };

  it('reads the links an INS-026 change left and totals the payments in paise', () => {
    expect([...linkedAfter({ groups: ['a', 'b'], skipped: [] })]).toEqual(['a', 'b']);
    // b was inactive and not linked; c was inactive, linked and kept.
    expect([
      ...linkedAfter({
        groups: ['a', 'b'],
        skipped: [
          { groupId: 'b', reason: 'INACTIVE' },
          { groupId: 'c', reason: 'INACTIVE' },
        ],
      }),
    ]).toEqual(['a', 'c']);
    const p = paymentsByAsset([
      invoice(),
      invoice({ reference: 'P2', amount: money('0.10') }),
      invoice({ reference: 'P3', amount: money('0.20') }),
      invoice({ reference: 'P4', asset: null }),
    ]);
    expect(p.get('a-1')).toEqual({ n: 3, paise: 1845030 });
  });

  it('lists the groups, the assets with their payments and the vendors with their groups', async () => {
    const el = await open();
    const list = el.querySelector('#ag-list')!;
    expect([...list.querySelectorAll('.li-t')].map((x) => text(x))).toEqual([
      'All groups',
      'Science lab equipment',
      'Library books',
      'Hostel furnishings',
    ]);
    expect([...list.querySelectorAll('.li-s')].map((x) => text(x))).toEqual([
      '3 assets',
      '2 assets · 1 merchant',
      '1 asset · 0 merchants',
      '0 assets · 0 merchants',
    ]);
    expect(text(list.querySelector('.li-r'))).toBe('Inactive');

    let rows = el.querySelectorAll('#as-table tbody tr');
    expect(rows).toHaveLength(3);
    expect(text(rows[0])).toContain('Compound microscopes ×3');
    expect(text(rows[0])).toContain('1 · ₹18,450');
    expect(text(rows[1])).toContain('None');

    // A group filters the assets.
    (el.querySelectorAll('#ag-list .cp-grp > .li')[2] as HTMLButtonElement).click();
    await settle();
    rows = el.querySelectorAll('#as-table tbody tr');
    expect(rows).toHaveLength(1);
    expect(text(el.querySelector('.fsum'))).toBe('Library books');

    const mer = el.querySelectorAll('#al-table tbody tr');
    expect(text(mer[0])).toContain('Lab Supplies Co');
    expect(text(mer[0])).toContain('Vendor');
    expect(text(mer[0])).toContain('Science lab equipment');
    expect(text(mer[0])).toContain('1');
    expect(text(mer[1])).toContain('Regular');
    expect(text(mer[1])).toContain('None');
  });

  it('marks a vendor’s links unknown when the audit trail does not account for them', async () => {
    const el = await open([]);
    expect(text(el.querySelector('#al-table tbody tr'))).toContain('Not known');
  });

  it('creates a group and makes an asset inactive (INS-021, INS-025)', async () => {
    const el = await open();
    (el.querySelector('#ag-new') as HTMLButtonElement).click();
    await settle();
    let drawer = document.querySelector('.drawer') as HTMLElement;
    (drawer.querySelector('#ag-save') as HTMLButtonElement).click();
    await settle();
    expect(text(drawer)).toContain('Name the group');
    set(drawer, 'ag-name', 'library books');
    (drawer.querySelector('#ag-save') as HTMLButtonElement).click();
    await settle();
    expect(text(drawer)).toContain('A group called “library books” already exists');
    set(drawer, 'ag-name', 'Sports equipment');
    set(drawer, 'ag-desc', 'Kits, nets and mats');
    (drawer.querySelector('#ag-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/asset-groups', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      name: 'Sports equipment',
      description: 'Kits, nets and mats',
      status: 'ACTIVE',
    });
    post.flush({ groupId: 'g-spt' });
    await settle();
    expect(toasts()).toContain('Group created');
    (await request((u) => u === '/api/v1/console/asset-groups')).flush(groups());
    (await request((u) => u === '/api/v1/console/assets')).flush(assets());
    await flushMerchants([linkEvent]);
    await settle();

    (el.querySelectorAll('#as-table tbody tr')[0] as HTMLElement).click();
    await settle();
    drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer)).toContain('Vendor payments · 1');
    expect(text(drawer)).toContain('₹18,450.00 to Lab Supplies Co');
    expect(text(drawer)).toContain('Invoice INV-77');
    (drawer.querySelector('#as-act') as HTMLInputElement).click();
    await settle();
    (drawer.querySelector('#as-save') as HTMLButtonElement).click();
    await settle(2);
    const dlg = document.querySelector('.modal[role="alertdialog"]') as HTMLElement;
    expect(text(dlg)).toContain('Make “Compound microscopes ×3” inactive?');
    ([...dlg.querySelectorAll('.sh-f button')] as HTMLButtonElement[]).at(-1)!.click();
    const patch = await request((u) => u === '/api/v1/console/assets/a-1', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v2"');
    expect(patch.request.body).toEqual({ status: 'INACTIVE' });
    patch.flush(asset({ status: 'INACTIVE', version: 3 }));
    await settle();
    expect(toasts()).toContain('Asset saved');
  });

  it('adds an asset to the chosen group (INS-024)', async () => {
    const el = await open();
    (el.querySelector('#as-new') as HTMLButtonElement).click();
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    expect(text(drawer.querySelector('#as-grp-b'))).toBe('Science lab equipment');
    set(drawer, 'as-name', 'Glassware set');
    (drawer.querySelector('#as-save') as HTMLButtonElement).click();
    await settle();
    expect(text(drawer)).toContain('An asset with this name already exists in the group.');
    set(drawer, 'as-name', 'Human anatomy models');
    (drawer.querySelector('#as-save') as HTMLButtonElement).click();
    const post = await request((u) => u === '/api/v1/console/assets', 'POST');
    expect(post.request.body).toEqual({
      groupId: 'g-lab',
      name: 'Human anatomy models',
      type: 'PHYSICAL',
      description: null,
      status: 'ACTIVE',
    });
    post.flush({ assetId: 'a-9' });
    await settle();
    expect(toasts()).toContain('Asset added');
  });

  it("sets a vendor's asset groups (INS-026)", async () => {
    const el = await open();
    (el.querySelectorAll('#al-table tbody tr')[0] as HTMLElement).click();
    await settle();
    const drawer = document.querySelector('.drawer') as HTMLElement;
    const lab = drawer.querySelector('#vl-g-lab') as HTMLInputElement;
    const lib = drawer.querySelector('#vl-g-lib') as HTMLInputElement;
    const hostel = drawer.querySelector('#vl-g-hst') as HTMLInputElement;
    expect(lab.checked).toBe(true);
    expect(lib.checked).toBe(false);
    expect(hostel.disabled).toBe(true);
    expect(text(drawer)).toContain('Library books 0 active assets');
    lib.click();
    await settle();
    (drawer.querySelector('#vl-save') as HTMLButtonElement).click();
    const put = await request((u) => u === '/api/v1/console/merchants/v-1/asset-groups', 'PUT');
    expect(put.request.body).toEqual({ groupIds: ['g-lab', 'g-lib'] });
    put.flush({
      linked: [
        { id: 'g-lab', name: 'Science lab equipment', status: 'ACTIVE' },
        { id: 'g-lib', name: 'Library books', status: 'ACTIVE' },
      ],
      skipped: [],
    });
    await settle();
    expect(toasts()).toContain('Links saved');
    expect(toasts()).toContain('Lab Supplies Co · 2 groups');
  });
});
