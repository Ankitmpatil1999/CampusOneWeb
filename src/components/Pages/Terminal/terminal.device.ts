/**
 * The terminal's device identity (CR-10, OI-IDN-45; IDN-040/041). The console issues a one-time
 * pairing code; pairing binds this browser's fingerprint and returns a device secret, which is
 * imported at once as a non-extractable HMAC key and kept in IndexedDB — page script can sign with
 * it but never read it. Every sign-in signs `<terminalId>.<nonce>`; the access token lives in memory
 * only and is renewed by signing again. Offline captures are signed with the same key (12.10).
 */
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiProblem } from '../../Utils/problem';
import { newIdempotencyKey } from '../../Utils/ids';
import { newUuid } from '../../Utils/ids';

export type TerminalPurpose =
  | 'ATTENDANCE'
  | 'PERIOD_ATTENDANCE'
  | 'LOCATION'
  | 'COUPON'
  | 'BALANCE_CHECK'
  | 'CARD_ISSUE'
  | 'POS';

/** ATT-001: who the terminal is (cached for the signed-out screen). */
export interface TerminalConfig {
  readonly terminal: {
    readonly id: string;
    readonly name: string;
    readonly location: string | null;
    readonly purpose: TerminalPurpose;
    readonly locationType: string | null;
    readonly fingerprint: string | null;
    readonly pairedAt: string | null;
    readonly registeredAt: string;
    readonly registeredBy: string | null;
  };
  readonly institution: {
    readonly id: string;
    readonly name: string;
    readonly code: string;
    readonly city: string;
    readonly board: string | null;
    readonly status: string;
  };
  readonly merchant: string | null;
  readonly section: string | null;
}

/** Where the device keeps what survives a reload. Replaced in tests. */
export interface DeviceStore {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
  loadKey(): Promise<CryptoKey | null>;
  saveKey(key: CryptoKey | null): Promise<void>;
}

const DB = 'campusone-terminal';
const idb = <T>(run: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode) =>
  new Promise<T>((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('keys', mode);
      const req = run(tx.objectStore('keys'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => open.result.close();
    };
  });

export const browserDeviceStore: DeviceStore = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      // Private mode: the device stays paired for this page only.
    }
  },
  loadKey: async () =>
    typeof indexedDB === 'undefined'
      ? null
      : (((await idb((s) => s.get('device'), 'readonly')) as CryptoKey | undefined) ?? null),
  saveKey: async (key) => {
    if (typeof indexedDB === 'undefined') return;
    await idb<unknown>(
      (s) => (key ? s.put(key, 'device') : s.delete('device')) as IDBRequest<unknown>,
      'readwrite',
    );
  },
};

const K = {
  fingerprint: 'rp_term_fp',
  terminalId: 'rp_term_id',
  config: 'rp_term_cfg',
  signedOut: 'rp_term_out',
} as const;

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export interface CallOptions {
  readonly body?: unknown;
  /** Sends an Idempotency-Key (money and create requests). */
  readonly idempotent?: boolean;
  readonly ifMatch?: number;
}

@Injectable({ providedIn: 'root' })
export class TerminalDevice {
  private readonly http = inject(HttpClient);
  /** Replaced in tests. */
  store: DeviceStore = browserDeviceStore;
  private key: CryptoKey | null = null;
  private token: { value: string; expiresAt: number } | null = null;
  private signing: Promise<void> | null = null;

  readonly config = signal<TerminalConfig | null>(null);

  constructor() {
    const cached = this.store.get(K.config);
    if (cached) {
      try {
        this.config.set(JSON.parse(cached) as TerminalConfig);
      } catch {
        this.store.set(K.config, null);
      }
    }
  }

  get terminalId() {
    return this.store.get(K.terminalId);
  }

  /** A random id for this browser, made once (the console sees it as the device fingerprint). */
  get fingerprint() {
    let fp = this.store.get(K.fingerprint);
    if (!fp) {
      fp = `web-${newUuid()}`;
      this.store.set(K.fingerprint, fp);
    }
    return fp;
  }

  get signedOut() {
    return this.store.get(K.signedOut) === '1';
  }

  async paired() {
    if (!this.terminalId) return false;
    this.key ??= await this.store.loadKey();
    return !!this.key;
  }

  /** IDN-040: the one-time code from the console; the secret never leaves the key store. */
  async pair(pairingCode: string) {
    // The device key is kept unreadable by the browser's key store, which a plain-HTTP LAN address
    // doesn't offer: say so instead of failing after the code is spent.
    if (!globalThis.crypto?.subtle) {
      throw new ApiProblem(
        0,
        'TRM.SECURE_PAGE_NEEDED',
        'Pairing needs a secure address: open this page with https://, or on this device as localhost.',
        null,
      );
    }
    const out = await firstValueFrom(
      this.http.post<{ terminalId: string; credential: string; purpose: TerminalPurpose }>(
        '/api/v1/terminal/pairing',
        { pairingCode: pairingCode.trim(), deviceFingerprint: this.fingerprint },
      ),
    );
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(out.credential),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    await this.store.saveKey(key);
    this.key = key;
    this.token = null;
    this.store.set(K.terminalId, out.terminalId);
    this.store.set(K.signedOut, null);
    return out;
  }

  /** Forget the pairing (the console issues a new code to pair again). */
  async forget() {
    this.key = null;
    this.token = null;
    await this.store.saveKey(null);
    for (const k of [K.terminalId, K.config, K.signedOut]) this.store.set(k, null);
    this.config.set(null);
  }

  /** Hex HMAC-SHA256 of a message with the device key (sign-in challenges, offline captures). */
  async sign(message: string) {
    if (!(await this.paired())) throw new ApiProblem(401, 'TRM.SIGNATURE_INVALID', '', null);
    return hex(await crypto.subtle.sign('HMAC', this.key!, new TextEncoder().encode(message)));
  }

  /** IDN-041: sign a fresh challenge; then read ATT-001 for the screen. */
  async signIn() {
    await this.renew();
    this.store.set(K.signedOut, null);
    const cfg = await this.call<TerminalConfig>('GET', '/api/v1/terminal/reader/config');
    this.config.set(cfg);
    this.store.set(K.config, JSON.stringify(cfg));
    return cfg;
  }

  /** The prototype's "Sign out of this terminal": the session ends; the device stays paired. */
  signOut() {
    this.token = null;
    this.store.set(K.signedOut, '1');
  }

  get signedIn() {
    return !!this.token && this.token.expiresAt > Date.now();
  }

  /** An authenticated call; an expired session is renewed once by signing again. */
  async call<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, o: CallOptions = {}) {
    const send = () => {
      let headers = new HttpHeaders({ Authorization: `Bearer ${this.token?.value ?? ''}` });
      if (o.idempotent) headers = headers.set('Idempotency-Key', newIdempotencyKey());
      if (o.ifMatch !== undefined) headers = headers.set('If-Match', `"v${o.ifMatch}"`);
      return firstValueFrom(this.http.request<T>(method, path, { body: o.body, headers }));
    };
    if (!this.signedIn && !this.signing) await this.renew();
    try {
      return await send();
    } catch (e) {
      if (e instanceof ApiProblem && e.status === 401 && e.code === 'AUTH.UNAUTHENTICATED') {
        await this.renew();
        return send();
      }
      throw e;
    }
  }

  private async renew() {
    this.signing ??= (async () => {
      const id = this.terminalId;
      if (!id) throw new ApiProblem(401, 'AUTH.UNAUTHENTICATED', '', null);
      const nonce = `${Math.floor(Date.now() / 1000)}.${newUuid()}`;
      const out = await firstValueFrom(
        this.http.post<{ accessToken: string; expiresAt: string }>('/api/v1/terminal/auth/signin', {
          terminalId: id,
          deviceFingerprint: this.fingerprint,
          nonce,
          signature: await this.sign(`${id}.${nonce}`),
        }),
      );
      this.token = { value: out.accessToken, expiresAt: Date.parse(out.expiresAt) };
    })().finally(() => (this.signing = null));
    await this.signing;
  }
}
