/**
 * A random UUID (v4). The browser's own where the page is secure (HTTPS, localhost); a page opened
 * at a plain-HTTP LAN address has no `crypto.randomUUID`, so the same random UUID is built from
 * `crypto.getRandomValues`, which every page has (client 2026-10-06: LAN test servers).
 */
export function newUuid(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A fresh Idempotency-Key for a money or create request (brief §7.1). */
export function newIdempotencyKey(): string {
  return newUuid();
}
