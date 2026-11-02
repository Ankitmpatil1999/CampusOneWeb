import {
  CARD_READER_LINK,
  CARD_READER_URL,
  cardReader,
  cardValue,
  decodeToken,
  ensureCardReader,
  readCardToken,
  readCardUid,
  readerProblem,
  watchCards,
  writeCardToken,
} from './card-reader';

/** CampusOne Card Reader's answers, by "METHOD /path" (a function may throw like a dead helper). */
type Answer = { status?: number; body: unknown } | (() => never);
const b64 = (s: string) => btoa(s);

describe('CampusOne Card Reader, the helper next to the browser (client 2026-10-08)', () => {
  let answers: Record<string, Answer[]>;
  let calls: { method: string; path: string; body?: unknown }[];

  beforeEach(() => {
    answers = {};
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = url.replace(CARD_READER_URL, '');
        const method = init?.method ?? 'GET';
        calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        const key = `${method} ${path}`;
        const next = answers[key]?.shift() ?? answers[`${key}*`]?.[0];
        if (!next) throw new TypeError('Failed to fetch');
        if (typeof next === 'function') next();
        const a = next as { status?: number; body: unknown };
        return new Response(JSON.stringify(a.body), { status: a.status ?? 200 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reads the serial number and the token CampusOne wrote', async () => {
    answers['GET /uid'] = [{ body: { uid: '04a1b2c3' } }];
    answers['GET /token'] = [{ body: { token: b64('NFCAB12CD34EF567') } }];
    expect(await readCardUid()).toBe('04A1B2C3');
    expect(await readCardToken()).toBe('NFCAB12CD34EF567');
  });

  it('treats what another system wrote as no CampusOne token', () => {
    expect(decodeToken(b64('NFCAB12CD34EF567\0\0'))).toBe('NFCAB12CD34EF567');
    expect(decodeToken(btoa(String.fromCharCode(0x8f, 0x12, 0xff, 0x00, 0x41)))).toBe('');
    expect(decodeToken('not base64!')).toBe('');
  });

  it('writes the token and reads it back to check it', async () => {
    answers['POST /token'] = [{ body: { ok: true } }, { body: { ok: true } }];
    answers['GET /token'] = [
      { body: { token: b64('OT23456789ABCDEFGHJKLM') } },
      { body: { token: b64('SOMETHINGELSE') } },
    ];
    await writeCardToken('ot23456789abcdefghjklm');
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/token',
      body: { token: b64('OT23456789ABCDEFGHJKLM') },
    });
    await expect(writeCardToken('NFCAB12CD34EF567')).rejects.toThrow(/did not keep/);
    await expect(writeCardToken('bad token!')).rejects.toThrow(/Not a CampusOne/);
  });

  it('passes on what the reader said, in plain words', async () => {
    answers['GET /uid'] = [{ status: 503, body: { error: 'No NFC reader found' } }];
    await readCardUid().catch((e) => expect(readerProblem(e)).toMatch(/No NFC reader/));
    await readCardUid().catch((e) => expect(readerProblem(e)).toMatch(/isn't running/));
    expect(readerProblem('Connect error: RemovedCard')).toMatch(/Place the card/);
    expect(readerProblem('Card returned error: 63 00')).toMatch(/can't be used/);
    expect(readerProblem('No token found in NFC tag')).toMatch(/blank/);
  });

  it('sends a card carried over from the earlier application as its value (2026-10-23)', async () => {
    // Blocks 4–6 of the CUG card on the reader (2026-10-08): the earlier application's encrypted
    // "Salted__" token. CampusOne finds such a carried-over card by that value (migration 0089).
    const cug = 'U2FsdGVkX1+iHwx1dvayNs1hBmdPsYCkB8aDTE74fQzQPbFs3xMgnbZ8dhbzHVda';
    answers['GET /token'] = [{ body: { token: cug } }];
    expect(await readCardToken()).toBe(cug);
    expect(cardValue(cug)).toBe(cug);
    expect(cardValue(b64('NFCAB12CD34EF567'))).toBe('NFCAB12CD34EF567');
  });

  it('refuses data from any other system', async () => {
    const other = btoa(String.fromCharCode(0x8f, 0x12, 0xff, 0x00, 0x41, 0x10, 0x20, 0x30));
    answers['GET /token'] = [{ body: { token: other } }];
    await expect(readCardToken()).rejects.toThrow('FOREIGN_CARD');
    expect(readerProblem(new Error('FOREIGN_CARD'))).toMatch(/wasn't issued by CampusOne/);
  });

  it('takes each card placed once, from what the helper read, never reading the card itself (2026-10-22)', async () => {
    vi.useFakeTimers();
    answers['GET /status*'] = [{ body: { ok: true, readers: ['ACS ACR122U PICC Interface 0'] } }];
    const placed = (seq: number, present: boolean, token: string | null, error?: string) => ({
      body: { seq, present, uid: '04A1B2C3', token, error: error ?? null },
    });
    answers['GET /card'] = [
      // A card left on the reader before the watch counts once.
      placed(4, true, b64('NFCAB12CD34EF567')),
      placed(4, true, b64('NFCAB12CD34EF567')),
      placed(4, false, b64('NFCAB12CD34EF567')),
      // The same card placed again is the next tap (check-out).
      placed(5, false, b64('NFCAB12CD34EF567')),
      // Another system's card: said once, cleared when it is taken off.
      placed(6, true, null, 'Card returned error: 63 00'),
      placed(6, true, null, 'Card returned error: 63 00'),
      placed(6, false, null, 'Card returned error: 63 00'),
      placed(7, true, b64('NFCZZ99YY88XX776')),
    ];
    const ready = cardReader();
    await vi.advanceTimersByTimeAsync(20);
    expect(ready()).toBe(true);
    const seen: string[] = [];
    const notes: string[] = [];
    const watch = watchCards((t) => void seen.push(t), {
      intervalMs: 100,
      onProblem: (m) => notes.push(m),
    });
    await vi.advanceTimersByTimeAsync(750);
    watch.stop();
    expect(seen).toEqual(['NFCAB12CD34EF567', 'NFCAB12CD34EF567', 'NFCZZ99YY88XX776']);
    expect(notes).toEqual([expect.stringMatching(/can't be used/), '']);
    expect(calls.some((c) => c.path === '/token')).toBe(false);
  });

  it('reads the card itself with a helper too old to watch the reader', async () => {
    vi.useFakeTimers();
    answers['GET /status*'] = [{ body: { ok: true, readers: ['ACS ACR122U PICC Interface 0'] } }];
    answers['GET /card*'] = [{ status: 404, body: { error: 'Not found' } }];
    answers['GET /token'] = [
      { body: { token: b64('NFCAB12CD34EF567') } },
      { body: { token: b64('NFCAB12CD34EF567') } },
      { status: 422, body: { error: 'Connect error: RemovedCard' } },
      { body: { token: b64('NFCAB12CD34EF567') } },
    ];
    const ready = cardReader();
    await vi.advanceTimersByTimeAsync(20);
    expect(ready()).toBe(true);
    const seen: string[] = [];
    const watch = watchCards((t) => void seen.push(t), { intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(450);
    watch.stop();
    expect(seen).toEqual(['NFCAB12CD34EF567', 'NFCAB12CD34EF567']);
  });

  it('opens CampusOne Card Reader for an action and waits until it answers', async () => {
    vi.useFakeTimers();
    const opened: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      opened.push(this.href);
      // The helper starts a moment after the link is opened.
      setTimeout(() => {
        answers['GET /status*'] = [{ body: { ok: true, readers: ['ACR122U'] } }];
      }, 1200);
    });
    const started = ensureCardReader(5000);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await started).toBe(true);
    expect(opened).toEqual([CARD_READER_LINK]);
    click.mockRestore();
  });

  it("says so when it doesn't start (not installed)", async () => {
    vi.useFakeTimers();
    answers['GET /status*'] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    delete answers['GET /status*'];
    const started = ensureCardReader(1500);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await started).toBe(false);
    click.mockRestore();
  });
});
