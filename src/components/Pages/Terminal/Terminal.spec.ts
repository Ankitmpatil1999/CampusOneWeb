import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TerminalApi, money, paiseOf, priceLine, type PosMenu } from './terminal.api';
import { TerminalDevice, type TerminalConfig } from './terminal.device';
import { TerminalPos } from './TerminalPos';
import { TerminalSignin } from './TerminalSignin';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => {
  for (let i = 0; i < 6; i++) await tick();
};

const cfg = (purpose: TerminalConfig['terminal']['purpose'] = 'POS'): TerminalConfig => ({
  terminal: {
    id: '0198c0de-0000-7000-8000-00000000a001',
    name: 'Canteen counter 1',
    location: 'Canteen',
    purpose,
    locationType: null,
    fingerprint: '9C2B-77AF',
    pairedAt: '2026-10-04T03:00:00.000Z',
    registeredAt: '2026-10-01T05:00:00.000Z',
    registeredBy: 'Prakash Shetty',
  },
  institution: {
    id: 'i-1',
    name: 'Tunga Valley Public School',
    code: 'RPETUNSHI000011026',
    city: 'Shivamogga',
    board: 'CBSE',
    status: 'ACTIVE',
  },
  merchant: 'Campus Canteen',
  section: null,
});

const item = (id: string, name: string, rupees: string, available = true) => ({
  id,
  categoryId: 'c-1',
  name,
  description: null,
  foodType: 'VEG' as const,
  price: { amount: rupees, currency: 'INR' as const },
  gstRate: 5,
  available,
  version: 1,
});

const menu = (operator = true): PosMenu => ({
  terminal: { id: 't-1', name: 'Canteen counter 1' },
  outlet: {
    id: 'o-1',
    name: 'Campus Canteen',
    merchant: 'Campus Canteen',
    opensAt: '07:30',
    closesAt: '17:00',
    gstin: '29ABCDE1234F1Z5',
    version: 1,
  },
  operator: operator
    ? {
        id: 'op-1',
        name: 'Ramesh Poojary',
        mobile: '••••••4567',
        tag: 'OT••••MESH',
        since: '2026-10-04T03:00:00.000Z',
        expiresAt: '2026-10-04T06:00:00.000Z',
      }
    : null,
  pricesIncludeGst: false,
  defaultGstRate: 5,
  gstRates: [0, 5, 12, 18, 28],
  categories: [
    {
      id: 'c-1',
      name: 'Meals',
      items: [
        item('i-1', 'Veg thali', '60.00'),
        item('i-2', 'Filter coffee', '15.00'),
        item('i-3', 'Veg pulao', '45.00', false),
      ],
    },
  ],
});

class FakeDevice {
  readonly config = signal<TerminalConfig | null>(cfg());
  signedOut = false;
  signedIn = true;
  isPaired = true;
  pairCode = '';
  paired = () => Promise.resolve(this.isPaired);
  pair = (code: string) => {
    this.pairCode = code;
    this.isPaired = true;
    return Promise.resolve({ terminalId: 't-1', credential: 'x', purpose: 'POS' });
  };
  signIn = () => Promise.resolve(this.config()!);
  signOut = () => undefined;
  forget = () => Promise.resolve();
  sign = () => Promise.resolve('0'.repeat(64));
}

function setup(o: { device?: FakeDevice; api?: Partial<Record<keyof TerminalApi, unknown>> } = {}) {
  const device = o.device ?? new FakeDevice();
  const api = {
    menu: () => Promise.resolve(menu()),
    orders: () =>
      Promise.resolve({
        date: '2026-10-04',
        summary: {
          orders: 0,
          collected: money(0),
          unpaid: { count: 0, amount: money(0) },
          offline: { accepted: 0, refused: 0 },
          lastSyncAt: null,
        },
        items: [],
      }),
    tags: () => Promise.resolve({ items: [] }),
    ...o.api,
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: TerminalDevice, useValue: device },
      { provide: TerminalApi, useValue: api },
    ],
  });
  return { device, api };
}

describe('order line pricing (the server prices the same way, pos.service priceLine)', () => {
  it('adds GST to the price, rounding half a paisa up per line', () => {
    expect(priceLine(6_000, 2, 500, false)).toEqual({ net: 12_000, tax: 600, total: 12_600 });
    expect(priceLine(1_010, 1, 500, false)).toEqual({ net: 1_010, tax: 51, total: 1_061 });
  });
  it('takes GST out of a price that includes it', () => {
    expect(priceLine(10_500, 1, 500, true)).toEqual({ net: 10_000, tax: 500, total: 10_500 });
    expect(priceLine(10_000, 1, 1_800, true)).toEqual({ net: 8_475, tax: 1_525, total: 10_000 });
  });
  it('turns money into paise and back without floats', () => {
    expect(paiseOf({ amount: '94.50', currency: 'INR' })).toBe(9_450);
    expect(paiseOf({ amount: '15', currency: 'INR' })).toBe(1_500);
    expect(money(9_450)).toEqual({ amount: '94.50', currency: 'INR' });
  });
});

describe('t.signin', () => {
  it('asks an unpaired terminal for the pairing code, then the operator tag', async () => {
    const device = new FakeDevice();
    device.isPaired = false;
    device.config.set(null);
    const tags = [
      {
        id: 'g-1',
        operatorName: 'Ramesh Poojary',
        mobile: '••••••4567',
        tag: 'OT••••MESH',
        status: 'ACTIVE' as const,
        reissueCount: 0,
        reissueReason: null,
        issuedAt: null,
        endedAt: null,
      },
    ];
    const { api } = setup({
      device,
      api: {
        menu: () => Promise.resolve(menu(false)),
        tags: () => Promise.resolve({ items: tags }),
        operatorSignIn: vi.fn(() => Promise.resolve({ operator: menu().operator })),
      },
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const f = TestBed.createComponent(TerminalSignin);
    f.detectChanges();
    await settle();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Pair this terminal');
    (el.querySelector('#tm-si-btn') as HTMLButtonElement).click();
    f.detectChanges();
    expect(el.textContent).toContain('Enter the pairing code');

    const input = el.querySelector('#tm-code') as HTMLInputElement;
    input.value = 'K7Q2-M9TX';
    input.dispatchEvent(new Event('input'));
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    device.config.set(cfg());
    await settle();
    f.detectChanges();
    expect(device.pairCode).toBe('K7Q2-M9TX');
    expect(el.textContent).toContain('Operator, tap your tag');
    expect(el.textContent).toContain('Ramesh Poojary');
    expect(el.textContent).toContain('Campus Canteen');

    const tag = el.querySelector('#tm-tag') as HTMLInputElement;
    tag.value = 'OTDEVRAMESH';
    tag.dispatchEvent(new Event('input'));
    (el.querySelector('.tm-tagin') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await settle();
    expect(api.operatorSignIn).toHaveBeenCalledWith('OTDEVRAMESH');
    expect(navigate).toHaveBeenCalledWith('/terminal/pos');
  });

  it('sends a reader straight to its screen', async () => {
    const device = new FakeDevice();
    device.config.set(cfg('BALANCE_CHECK'));
    setup({ device });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const f = TestBed.createComponent(TerminalSignin);
    f.detectChanges();
    await settle();
    expect(navigate).toHaveBeenCalledWith('/terminal/reader');
  });
});

describe('t.pos counter', () => {
  it('prices the cart as the server will, and creates the order from items and quantities only', async () => {
    const createOrder = vi.fn(() =>
      Promise.resolve({
        id: 'ord-1',
        number: 'ORD-1004-001',
        type: 'DINE_IN',
        status: 'CREATED',
        payment: 'PENDING',
        lastFailureCode: null,
        lines: [{ name: 'Veg thali', qty: 1 }],
        total: money(9_450),
      }),
    );
    setup({ api: { createOrder } });
    const f = TestBed.createComponent(TerminalPos);
    f.detectChanges();
    await settle();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const tiles = [...el.querySelectorAll<HTMLButtonElement>('.tm-tile')];
    expect(tiles.map((t) => t.querySelector('.tm-tile-n')?.textContent)).toEqual([
      'Veg thali',
      'Filter coffee',
      'Veg pulao',
    ]);
    expect(tiles[2]!.disabled).toBe(true);
    tiles[0]!.click();
    tiles[1]!.click();
    tiles[1]!.click();
    f.detectChanges();
    const tot = el.querySelector('.tm-tot')!.textContent!.replace(/\s+/g, ' ');
    expect(tot).toContain('Subtotal₹90.00');
    expect(tot).toContain('GST 5%₹4.50');
    expect(tot).toContain('Total₹94.50');
    (el.querySelector('#tm-order') as HTMLButtonElement).click();
    await settle();
    f.detectChanges();
    expect(createOrder).toHaveBeenCalledWith('DINE_IN', [
      { itemId: 'i-1', qty: 1 },
      { itemId: 'i-2', qty: 2 },
    ]);
    expect(el.textContent).toContain('How is the student paying?');
    expect(el.textContent).toContain('ORD-1004-001');
  });
});
