/**
 * The USB NFC reader on this computer (client 2026-10-08). CampusOne runs in the browser as usual; a
 * small helper, **CampusOne Card Reader** (`src-tauri`), talks to the PC/SC reader and offers the CUG
 * dashboard's three operations at http://127.0.0.1:47821 to the CampusOne pages:
 *
 * - `GET /uid`: the card's serial number (hex);
 * - `GET /token`: sector 1 of a MIFARE Classic card (blocks 4–6, at most 48 bytes), base64;
 * - `POST /token {token}`: writes those bytes (a new card's key is changed on the first write).
 *
 * CampusOne writes the card's token itself (`NFC` + 13 characters, ATT-004/027) as plain ASCII, so a
 * read gives exactly what every tap endpoint takes as `cardToken`. POS operator tags hold their
 * `OT…` token the same way. When the helper isn't running, pages keep their typed field (a
 * keyboard-wedge reader types the token there).
 */
import { signal, type Signal } from '@angular/core';

/** Where CampusOne Card Reader listens (this computer only). */
export const CARD_READER_URL = 'http://127.0.0.1:47821';

const ready = signal(false);
const readOnly = ready.asReadonly();
let probing = false;

async function probe() {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch(`${CARD_READER_URL}/status`, { cache: 'no-store', signal: ctl.signal });
    clearTimeout(t);
    ready.set(r.ok);
  } catch {
    ready.set(false);
  }
}

/**
 * Whether CampusOne Card Reader is running on this computer: checked at once and every 5 s, so pages
 * switch to the reader as soon as it is started (and back when it is closed).
 */
export function cardReader(): Signal<boolean> {
  if (!probing && typeof window !== 'undefined' && typeof fetch === 'function') {
    probing = true;
    void probe();
    setInterval(() => void probe(), 5000);
  }
  return readOnly;
}

/** The current answer, without starting the check. */
export function hasCardReader(): boolean {
  return ready();
}

/** The link that starts CampusOne Card Reader (registered when it is installed). */
export const CARD_READER_LINK = 'campusone-reader://open';

/**
 * Starts CampusOne Card Reader from the page (client 2026-10-08): the browser asks once whether to
 * open it; it starts minimised so the page keeps the focus. Nothing happens when it isn't installed.
 */
export function launchCardReader() {
  const a = document.createElement('a');
  a.href = CARD_READER_LINK;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * The reader for an action the user just started: at once when CampusOne Card Reader runs, else it is
 * started and awaited (up to `waitMs`). False when it didn't start (not installed, or refused).
 */
export async function ensureCardReader(waitMs = 20_000): Promise<boolean> {
  cardReader();
  // Asked again each time: it may have been closed since the last check.
  await probe();
  if (ready()) return true;
  launchCardReader();
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 500));
    await probe();
    if (ready()) return true;
  }
  return false;
}

/** One reader call at a time: a write must never meet the background read. */
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${CARD_READER_URL}${path}`, { cache: 'no-store', ...init });
  } catch {
    ready.set(false);
    throw new Error('READER_APP_OFF');
  }
  ready.set(true);
  const body = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(body.error || `The reader answered ${r.status}`);
  return body as T;
}

/** The card's serial number, upper-case hex (for example `04A1B2C3`). */
export function readCardUid(): Promise<string> {
  return exclusive(async () => String((await call<{ uid: string }>('/uid')).uid).toUpperCase());
}

const TOKEN = /^[A-Z0-9]{4,40}$/;

/**
 * The token on the card, as the tap endpoints take it: CampusOne's token, or the value a card carried
 * over from the earlier application holds (client 2026-10-23, see cardValue). Any other data is
 * refused with FOREIGN_CARD: the card must be issued from CampusOne first.
 */
export function readCardToken(): Promise<string> {
  return exclusive(async () => {
    const raw = (await call<{ token: string }>('/token')).token;
    const token = cardValue(raw);
    if (!token && raw) throw new Error('FOREIGN_CARD');
    return token;
  });
}

/**
 * The value read off a card carried over from the earlier application (client 2026-10-23): it wrote
 * an encrypted token (base64, "U2FsdGVkX1…" = "Salted__") instead of CampusOne's plain one. CampusOne
 * finds such a card by that value (migration 0089), so it is sent as it is.
 */
export const LEGACY_CARD_VALUE = /^U2FsdGVkX1[A-Za-z0-9+/]{30,116}={0,2}$/;

/** What a tap sends for a card's sector data: CampusOne's token, a carried-over card's value, or ''. */
export function cardValue(base64: string): string {
  const token = decodeToken(base64);
  if (token) return token;
  const raw = String(base64 ?? '').trim();
  return LEGACY_CARD_VALUE.test(raw) ? raw : '';
}

/** Writes the token on the card and reads it back to check it. */
export function writeCardToken(token: string): Promise<void> {
  const value = token.trim().toUpperCase();
  if (!TOKEN.test(value)) return Promise.reject(new Error('Not a CampusOne card token'));
  return exclusive(async () => {
    await call('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: btoa(value) }),
    });
    const back = decodeToken((await call<{ token: string }>('/token')).token);
    if (back !== value) throw new Error('The card did not keep the token. Try again.');
  });
}

export function decodeToken(base64: string): string {
  let text: string;
  try {
    text = atob(String(base64 ?? ''));
  } catch {
    return '';
  }
  const value = text.replace(/\0+$/, '').trim().toUpperCase();
  return TOKEN.test(value) ? value : '';
}

/**
 * Plain words for what the reader answered (the helper returns its technical message).
 */
export function readerProblem(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? '');
  if (/READER_APP_OFF/.test(raw)) {
    return "CampusOne Card Reader isn't running on this computer. Start it and try again.";
  }
  if (/no nfc reader|no readers|reader error|NoReadersAvailable|NoService/i.test(raw)) {
    return 'No NFC reader is connected. Plug in the reader and try again.';
  }
  if (/connect error|RemovedCard|NoSmartcard|UnresponsiveCard|no card/i.test(raw)) {
    return 'Place the card on the reader and hold it still.';
  }
  if (/FOREIGN_CARD/.test(raw)) {
    return "This card wasn't issued by CampusOne (it holds another system's data). Issue it in Console → NFC cards first.";
  }
  if (/authentication|load key|63 00|Card returned error/i.test(raw)) {
    return "This card can't be used: it was set up by another system or is not a MIFARE Classic card.";
  }
  if (/no token found/i.test(raw)) {
    return 'This card is blank. Issue it in Console → NFC cards first.';
  }
  if (/too large|Invalid Base64|Not a CampusOne/i.test(raw)) return 'This is not a CampusOne card token.';
  return raw || 'The reader did not answer. Try again.';
}

export interface CardWatch {
  /** Stops reading. */
  stop(): void;
}

/** The last card placed on the reader, as CampusOne Card Reader read it (GET /card). */
export interface PlacedCard {
  /** Grows by one with every card placed. */
  readonly seq: number;
  /** A card lies on the reader now. */
  readonly present: boolean;
  readonly uid: string | null;
  /** Base64 of sector 1, as GET /token. */
  readonly token: string | null;
  readonly error: string | null;
}

/** The last card placed; null from a CampusOne Card Reader too old to watch the reader. */
async function placedCard(): Promise<PlacedCard | null> {
  let r: Response;
  try {
    r = await fetch(`${CARD_READER_URL}/card`, { cache: 'no-store' });
  } catch {
    ready.set(false);
    throw new Error('READER_APP_OFF');
  }
  ready.set(true);
  if (r.status === 404) return null;
  const body = (await r.json().catch(() => ({}))) as PlacedCard & { error?: string };
  if (!r.ok) throw new Error(body.error || `The reader answered ${r.status}`);
  return body;
}

/**
 * Calls `onCard` with the token of each card placed on the reader while CampusOne Card Reader runs
 * (client 2026-10-22): the helper reads every card once, when it is placed, and this asks it for
 * the last one every `intervalMs` — nothing touches the card while it lies there. Placing the same
 * card again is another tap; a card left on the reader counts once (one already there when the
 * watch starts counts too). A problem (a card from another system, no reader) is said once and
 * cleared when the card is taken off or the next card is read.
 *
 * With a CampusOne Card Reader from before that, the card is read every second instead, and a card
 * left on the reader counts once until it has been taken off.
 */
export function watchCards(
  onCard: (token: string) => void | Promise<void>,
  opts: { intervalMs?: number; onProblem?: (message: string) => void } = {},
): CardWatch {
  const available = cardReader();
  let mode: 'unknown' | 'placed' | 'read' = 'unknown';
  let stopped = false;
  let seen = -1;
  let shown = '';
  let last = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const say = (message: string) => {
    if (message === shown) return;
    shown = message;
    opts.onProblem?.(message);
  };
  /** The helper reads each card once; the page asks for the last one. */
  const askPlaced = async () => {
    try {
      const p = await placedCard();
      if (!p) {
        mode = 'read';
        return;
      }
      mode = 'placed';
      // A card already on the reader when the watch starts counts once.
      if (seen < 0) seen = p.present ? p.seq - 1 : p.seq;
      if (p.seq > seen) {
        seen = p.seq;
        const token = p.token ? cardValue(p.token) : '';
        if (token) {
          say('');
          await onCard(token);
        } else {
          say(readerProblem(new Error(p.token ? 'FOREIGN_CARD' : (p.error ?? 'No token found'))));
        }
      } else if (!p.present && shown) {
        // The card was taken off: an earlier note is cleared.
        say('');
      }
    } catch (e) {
      say(readerProblem(e));
    }
  };
  /** An older helper: the page reads the card itself every second. */
  const readCard = async () => {
    try {
      const token = await readCardToken();
      if (!token) {
        last = '';
      } else if (token !== last) {
        last = token;
        await onCard(token);
      }
    } catch (e) {
      const message = readerProblem(e);
      if (message.startsWith('Place the card')) {
        // No card on the reader is the normal state: an earlier note is cleared.
        if (last) opts.onProblem?.('');
        last = '';
      } else if (last !== message) {
        // A missing reader, or a card from another system: said once while it lasts.
        last = message;
        opts.onProblem?.(message);
      }
    }
  };
  const tick = async () => {
    if (stopped) return;
    if (available()) {
      if (mode !== 'read') await askPlaced();
      if (mode === 'read' && !stopped) await readCard();
    }
    const every = opts.intervalMs ?? (mode === 'read' ? 1000 : 400);
    if (!stopped) timer = setTimeout(() => void tick(), every);
  };
  timer = setTimeout(() => void tick(), 0);
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
