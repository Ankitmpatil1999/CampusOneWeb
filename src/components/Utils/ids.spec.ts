import { copyText } from './clipboard';
import { newIdempotencyKey, newUuid } from './ids';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('pages opened at a plain-HTTP LAN address', () => {
  afterEach(() => vi.restoreAllMocks());

  it('make random UUIDs without crypto.randomUUID (secure pages only)', () => {
    const real = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
    });
    try {
      const a = newIdempotencyKey();
      const b = newUuid();
      expect(a).toMatch(UUID);
      expect(b).toMatch(UUID);
      expect(a).not.toBe(b);
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { value: real, configurable: true });
    }
    expect(newIdempotencyKey()).toMatch(UUID);
  });

  it('copy without the Clipboard API (secure pages only)', async () => {
    const real = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    try {
      await copyText('https://example.in/admissions/abc');
      expect(exec).toHaveBeenCalledWith('copy');
      expect(document.querySelector('textarea')).toBeNull();
    } finally {
      if (real) Object.defineProperty(navigator, 'clipboard', real);
      else delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });
});
