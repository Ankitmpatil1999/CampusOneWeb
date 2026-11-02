import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CAMPUSONE_WEB_CONFIG, WEB_CONFIG } from '../../../../Config';
import { appRoutes } from '../../../../App.routes';
import { apiInterceptor } from '../../../Utils/api';
import { allowLines, refusalLabel, tokenState, validAllowEntry } from './partner-format';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function request(url: string, method = 'GET'): Promise<TestRequest> {
  const ctl = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 60; i++) {
    const found = ctl.match((r) => r.urlWithParams === url && r.method === method);
    if (found[0]) return found[0];
    await tick();
  }
  throw new Error(`no ${method} ${url}`);
}

const admin = (subTasks: string[] = ['partners.edit']) => ({
  name: 'ARJUN MEHTA',
  email: 'arjun@campusone.example',
  role: { code: 'PLATFORM_ADMIN', name: 'Platform Administrator' },
  subTasks: ['home.view', 'task.home', 'task.platform', ...subTasks],
  preferredLang: 'en',
});

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const ahead = (min: number) => new Date(Date.now() + min * 60_000).toISOString();

const client = (over: object = {}) => ({
  id: 'c-1',
  clientId: 'rpc_bankva01',
  name: 'Sponsor bank — campus virtual accounts',
  partner: 'SPONSOR_BANK',
  scopes: ['va.validate', 'va.notify'],
  ipAllowlist: ['203.0.113.10', '203.0.113.11'],
  status: 'ACTIVE',
  statusReason: null,
  secretRotatedAt: '2026-07-01T04:30:00.000Z',
  previousSecretValidUntil: null,
  createdAt: '2024-02-12T04:30:00.000Z',
  lastTokenAt: ago(13),
  version: 4,
  ...over,
});

const token = (over: object = {}) => ({
  id: 't-1',
  outcome: 'ISSUED',
  reason: null,
  scopes: ['va.validate', 'va.notify'],
  issuedAt: ago(13),
  expiresAt: ahead(2),
  revokedAt: null,
  live: true,
  ...over,
});

const LOG = [
  token(),
  token({
    id: 't-2',
    outcome: 'REFUSED',
    reason: 'IP_NOT_ALLOWED',
    scopes: [],
    issuedAt: ago(40),
    expiresAt: null,
    live: false,
  }),
  token({ id: 't-3', issuedAt: ago(60 * 30), expiresAt: ago(60 * 30 - 15), live: false }),
];

const policy = { minutes: 15, min: 5, max: 60, version: 2 };

describe('back office — partner API clients (INT-001…008)', () => {
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

  async function openPage(
    clients: object[] = [
      client(),
      client({
        id: 'c-2',
        clientId: 'rpc_gw02',
        name: 'Gateway',
        partner: 'PAYMENT_GATEWAY',
        scopes: ['va.validate'],
        ipAllowlist: ['192.0.2.40/29'],
        status: 'INACTIVE',
        statusReason: 'Contract paused',
        lastTokenAt: null,
        version: 1,
      }),
    ],
    subTasks?: string[],
  ) {
    const harness = await RouterTestingHarness.create();
    const nav = harness.navigateByUrl('/backoffice/partners');
    (await request('/api/v1/ops/session')).flush(admin(subTasks));
    await nav;
    (await request('/api/v1/ops/api-clients')).flush({ items: clients });
    (await request('/api/v1/ops/token-policy')).flush(policy);
    for (const c of clients as { id: string }[]) {
      (await request(`/api/v1/ops/api-clients/${c.id}/tokens`)).flush({
        items: c.id === 'c-1' ? LOG : [],
        nextCursor: null,
      });
    }
    for (let i = 0; i < 5; i++) await tick();
    harness.detectChanges();
    return { harness, el: harness.routeNativeElement as HTMLElement };
  }

  const settle = async (harness: RouterTestingHarness) => {
    for (let i = 0; i < 4; i++) await tick();
    harness.detectChanges();
  };
  const lastModal = () => [...document.querySelectorAll('.modal')].at(-1) as HTMLElement;
  const button = (scope: ParentNode, text: string) =>
    [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as
      HTMLButtonElement | undefined;
  const type = (el: Element | null, v: string, event = 'input') => {
    const i = el as HTMLInputElement | HTMLTextAreaElement;
    i.value = v;
    i.dispatchEvent(new Event(event));
  };

  async function openDrawer(harness: RouterTestingHarness, el: HTMLElement, row = 0) {
    (el.querySelectorAll('tbody tr')[row] as HTMLElement).click();
    harness.detectChanges();
    const id = row === 0 ? 'c-1' : 'c-2';
    (await request(`/api/v1/ops/api-clients/${id}/tokens`)).flush({
      items: id === 'c-1' ? LOG : [],
      nextCursor: id === 'c-1' ? 'cur-2' : null,
    });
    await settle(harness);
    return document.querySelector('.drawer') as HTMLElement;
  }

  it('checks allowlist entries and labels tokens as the server does', () => {
    expect(validAllowEntry('203.0.113.10')).toBe(true);
    expect(validAllowEntry('192.0.2.40/29')).toBe(true);
    expect(validAllowEntry('2001:db8::1')).toBe(true);
    expect(validAllowEntry('2001:db8::/32')).toBe(false);
    expect(validAllowEntry('10.0.0.256')).toBe(false);
    expect(validAllowEntry('10.0.0.1/33')).toBe(false);
    expect(validAllowEntry('01.2.3.4')).toBe(false);
    expect(validAllowEntry('example.com')).toBe(false);
    expect(allowLines(' 203.0.113.10 \n\n192.0.2.1\n')).toEqual(['203.0.113.10', '192.0.2.1']);
    expect(refusalLabel('IP_NOT_ALLOWED')).toBe('IP address not on the allowlist');
    expect(tokenState(token() as never)).toBe('live');
    expect(tokenState(token({ live: false, revokedAt: ago(1) }) as never)).toBe('revoked');
    expect(tokenState(token({ live: false }) as never)).toBe('expired');
  });

  it('lists the clients with the 24-hour figures, the token policy and the example signing contract', async () => {
    const { harness, el } = await openPage();
    expect(el.querySelector('.c-ph h1')?.textContent).toBe('Partner API clients');
    const kpis = [...el.querySelectorAll('.kpi')].map((k) => [
      k.querySelector('.k-l')?.textContent?.trim(),
      k.querySelector('.k-v')?.textContent?.trim(),
      k.querySelector('.k-d')?.textContent?.trim(),
    ]);
    expect(kpis).toEqual([
      ['Active clients', '1', '1 suspended'],
      ['Tokens issued · 24 h', '1', '1 client with a live token'],
      ['Token lifetime', '15 min', 'Configurable'],
      ['Refused · 24 h', '1', 'Wrong secret, address or scope'],
    ]);
    const rows = [...el.querySelectorAll('tbody tr')] as HTMLElement[];
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain('Sponsor bank — campus virtual accounts');
    expect(rows[0]?.textContent).toContain('Sponsor bank');
    expect(rows[0]?.textContent).toContain('rpc_bankva01');
    expect([...rows[0]!.querySelectorAll('.tag')].map((t) => t.textContent)).toEqual([
      'va.validate',
      'va.notify',
    ]);
    expect(rows[0]?.textContent).toContain('13 min ago');
    expect(rows[0]?.textContent).toContain('01 Jul 2026');
    expect(rows[1]?.querySelector('.chip')?.textContent).toBe('Suspended');
    expect(rows[1]?.textContent).toContain('Payment gateway');
    expect(el.querySelector('.pager')?.textContent).toContain('2 clients');
    // Sorting by name (in the page, no request) puts the gateway first, then last.
    (el.querySelector('th .cp-th') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(el.querySelector('tbody tr .cell-t')?.textContent).toBe('Gateway');
    expect(el.querySelector('th.sort')?.getAttribute('aria-sort')).toBe('ascending');
    (el.querySelector('th .cp-th') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(el.querySelector('tbody tr .cell-t')?.textContent).toBe(
      'Sponsor bank — campus virtual accounts',
    );
    const policyCard = [...el.querySelectorAll('.card')].find((c) =>
      c.textContent?.includes('Token policy'),
    ) as HTMLElement;
    expect(policyCard.textContent).toContain('15 minutes');
    const activity = [...el.querySelectorAll('.list.plain .li')].map((l) =>
      l.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(activity.length).toBe(3);
    expect(activity[0]).toContain('Sponsor bank — campus virtual accounts · token issued');
    expect(activity[1]).toContain('refused');
    expect(activity[1]).toContain('IP address not on the allowlist');
    const contract = el.querySelector('#ob-contract') as HTMLElement;
    expect(contract.textContent).toContain('POST /api/v1/partners/oauth/token');
    expect(contract.textContent).toContain('/api/v1/partners/bank/va/validate');
    expect(contract.textContent).toContain('/api/v1/partners/bank/va/notify');
    expect(contract.textContent).toContain('X-CampusOne-Timestamp');
    expect(contract.textContent).toContain(
      'v1=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>',
    );
    expect(el.textContent).toContain("An example contract until the sponsor bank's API is known.");
  });

  it('creates a client and shows its secret once, in a panel that only closes once it is stored', async () => {
    const { harness, el } = await openPage([client()]);
    (el.querySelector('#ob-api-new') as HTMLButtonElement).click();
    harness.detectChanges();
    let modal = lastModal();
    expect(modal.querySelector('h3')?.textContent).toBe('New API client');
    // Everything missing: every field says what to do, nothing is sent.
    (modal.querySelector('#ob-ac-create') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(modal.querySelector('#ob-ac-n-e')?.textContent).toContain('Name the client');
    expect(modal.querySelector('#ob-ac-p-e')?.textContent).toContain('Choose the partner');
    expect(modal.querySelector('#ob-ac-scopes-e')?.textContent).toContain(
      'Choose at least one scope',
    );
    expect(modal.querySelector('#ob-ac-ip-e')?.textContent).toContain(
      'Add at least one IP address',
    );
    // A taken name and a bad address are caught here too.
    type(modal.querySelector('#ob-ac-n'), 'sponsor bank — campus virtual accounts');
    type(modal.querySelector('#ob-ac-ip'), '203.0.113.10\n300.1.1.1');
    (modal.querySelector('#ob-ac-create') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(modal.querySelector('#ob-ac-n-e')?.textContent).toContain(
      'A client with this name already exists.',
    );
    expect(modal.querySelector('#ob-ac-ip-e')?.textContent).toContain(
      'Not a valid IPv4 address or range: 300.1.1.1',
    );

    type(modal.querySelector('#ob-ac-n'), '  Example Sponsor   Bank (test) ');
    (modal.querySelector('#ob-ac-p-b') as HTMLButtonElement).click();
    harness.detectChanges();
    button(document, 'Sponsor bank')?.click();
    (modal.querySelector('#ob-ac-s-va_notify') as HTMLInputElement).click();
    (modal.querySelector('#ob-ac-s-va_validate') as HTMLInputElement).click();
    type(modal.querySelector('#ob-ac-ip'), '203.0.113.10\n\n192.0.2.40/29\n');
    harness.detectChanges();
    (modal.querySelector('#ob-ac-create') as HTMLButtonElement).click();
    const post = await request('/api/v1/ops/api-clients', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({
      name: 'Example Sponsor Bank (test)',
      partner: 'SPONSOR_BANK',
      scopes: ['va.validate', 'va.notify'],
      ipAllowlist: ['203.0.113.10', '192.0.2.40/29'],
    });
    post.flush({ id: 'c-9', clientId: 'rpc_new9', secret: 's3cr3t-shown-once' });
    await settle(harness);

    modal = lastModal();
    expect(modal.querySelector('h3')?.textContent).toBe('Client created — copy the secret now');
    expect(modal.querySelector('.x-btn')).toBeNull();
    expect(modal.querySelector('#ob-secret')?.textContent).toBe('s3cr3t-shown-once');
    expect(modal.textContent).toContain('rpc_new9');
    // The list reloads behind the panel.
    (await request('/api/v1/ops/api-clients')).flush({
      items: [
        client(),
        client({ id: 'c-9', clientId: 'rpc_new9', name: 'Example Sponsor Bank (test)' }),
      ],
    });
    (await request('/api/v1/ops/token-policy')).flush(policy);
    (await request('/api/v1/ops/api-clients/c-1/tokens')).flush({ items: LOG, nextCursor: null });
    (await request('/api/v1/ops/api-clients/c-9/tokens')).flush({ items: [], nextCursor: null });
    await settle(harness);
    // A click outside does not close it, nor does "Done" before the box is ticked.
    (modal.parentElement as HTMLElement).click();
    (modal.querySelector('#ob-sec-done') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(document.querySelector('#ob-secret')).not.toBeNull();
    expect(modal.querySelector('#ob-sec-ok-e')?.textContent).toContain(
      "Confirm you've stored the secret — it can't be shown again",
    );
    // Copy goes to the clipboard only.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    (modal.querySelector('#ob-secret-copy') as HTMLButtonElement).click();
    await tick();
    expect(writeText).toHaveBeenCalledWith('s3cr3t-shown-once');
    (modal.querySelector('#ob-sec-ok') as HTMLInputElement).click();
    (modal.querySelector('#ob-sec-done') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(document.querySelector('#ob-secret')).toBeNull();
    expect(document.body.textContent).not.toContain('s3cr3t-shown-once');
    expect(el.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('shows server field errors on the field they belong to', async () => {
    const { harness, el } = await openPage([client()]);
    (el.querySelector('#ob-api-new') as HTMLButtonElement).click();
    harness.detectChanges();
    const modal = lastModal();
    type(modal.querySelector('#ob-ac-n'), 'Second bank');
    (modal.querySelector('#ob-ac-p-b') as HTMLButtonElement).click();
    harness.detectChanges();
    button(document, 'Other partner')?.click();
    (modal.querySelector('#ob-ac-s-va_validate') as HTMLInputElement).click();
    type(modal.querySelector('#ob-ac-ip'), '203.0.113.10\n2001:db8::1');
    harness.detectChanges();
    (modal.querySelector('#ob-ac-create') as HTMLButtonElement).click();
    (await request('/api/v1/ops/api-clients', 'POST')).flush(
      {
        code: 'VALIDATION.FAILED',
        status: 422,
        detail: 'x',
        errors: [{ field: 'ipAllowlist.1', code: 'VALIDATION.FORMAT' }],
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    await settle(harness);
    expect(modal.querySelector('#ob-ac-ip-e')?.textContent).toContain(
      'Not a valid IPv4 address or range: 2001:db8::1',
    );
    (modal.querySelector('#ob-ac-create') as HTMLButtonElement).click();
    (await request('/api/v1/ops/api-clients', 'POST')).flush(
      { code: 'INT.CLIENT_NAME_TAKEN', status: 409, detail: 'x' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle(harness);
    expect(modal.querySelector('#ob-ac-n-e')?.textContent).toContain(
      'A client with this name already exists.',
    );
  });

  it('opens a client with its credentials and token log, and loads more with the cursor', async () => {
    const { harness, el } = await openPage();
    const drawer = await openDrawer(harness, el);
    expect(drawer.querySelector('.sh-t h3')?.textContent).toBe(
      'Sponsor bank — campus virtual accounts',
    );
    expect(drawer.querySelector('.sh-t p')?.textContent).toBe('Sponsor bank · rpc_bankva01');
    // The secret itself is never shown again: only that it is kept encrypted.
    expect(drawer.textContent).toContain('Kept encrypted');
    expect(drawer.textContent).toContain('••••••••••••');
    const rows = () => [...drawer.querySelectorAll('.tbl.dense tbody tr')] as HTMLElement[];
    expect(rows().length).toBe(3);
    expect(rows()[0]?.textContent).toContain('· live');
    expect(rows()[0]?.querySelector('.chip')?.textContent).toBe('Issued');
    expect(rows()[1]?.querySelector('.chip')?.textContent).toBe(
      'Refused · IP address not on the allowlist',
    );
    expect(rows()[2]?.textContent).toContain('· expired');
    (drawer.querySelector('#ob-tok-more') as HTMLButtonElement).click();
    const more = await request('/api/v1/ops/api-clients/c-1/tokens?cursor=cur-2');
    more.flush({
      items: [token({ id: 't-9', live: false, revokedAt: ago(100), issuedAt: ago(110) })],
      nextCursor: null,
    });
    await settle(harness);
    expect(rows().length).toBe(4);
    expect(rows()[3]?.textContent).toContain('· revoked');
    expect(drawer.querySelector('#ob-tok-more')).toBeNull();
  });

  it('edits scopes and IPs with If-Match after a confirmation', async () => {
    const { harness, el } = await openPage();
    const drawer = await openDrawer(harness, el);
    (drawer.querySelector('#ob-api-edit') as HTMLButtonElement).click();
    harness.detectChanges();
    const modal = lastModal();
    expect(modal.querySelector('h3')?.textContent).toBe(
      'Scopes and IPs · Sponsor bank — campus virtual accounts',
    );
    expect(modal.querySelector('#ob-ac-n')).toBeNull();
    expect((modal.querySelector('#ob-ac-ip') as HTMLTextAreaElement).value).toBe(
      '203.0.113.10\n203.0.113.11',
    );
    expect((modal.querySelector('#ob-ac-s-va_notify') as HTMLInputElement).checked).toBe(true);
    (modal.querySelector('#ob-ac-s-va_notify') as HTMLInputElement).click();
    type(modal.querySelector('#ob-ac-ip'), '203.0.113.10');
    harness.detectChanges();
    (modal.querySelector('#ob-ac-save') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    const confirm = lastModal();
    expect(confirm.textContent).toContain(
      'Save changes to Sponsor bank — campus virtual accounts?',
    );
    expect(confirm.textContent).toContain('Scopes: va.validate. IPs: 203.0.113.10.');
    button(confirm, 'Save')?.click();
    const patch = await request('/api/v1/ops/api-clients/c-1', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v4"');
    expect(patch.request.body).toEqual({ scopes: ['va.validate'], ipAllowlist: ['203.0.113.10'] });
    patch.flush(client({ scopes: ['va.validate'], ipAllowlist: ['203.0.113.10'], version: 5 }));
    await settle(harness);
    expect(document.querySelector('.toasts')?.textContent).toContain('updated');
    (await request('/api/v1/ops/api-clients')).flush({ items: [client({ version: 5 })] });
  });

  it('suspends a client only with a reason, and reactivates it', async () => {
    const { harness, el } = await openPage();
    const drawer = await openDrawer(harness, el);
    (drawer.querySelector('#ob-api-st') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    let dialog = lastModal();
    expect(dialog.querySelector('h3')?.textContent?.trim()).toBe(
      'Suspend Sponsor bank — campus virtual accounts?',
    );
    button(dialog, 'Suspend client')?.click();
    harness.detectChanges();
    expect(dialog.textContent).toContain('Enter a reason to continue');
    type(dialog.querySelector('textarea'), 'Bank asked to pause');
    button(dialog, 'Suspend client')?.click();
    const patch = await request('/api/v1/ops/api-clients/c-1', 'PATCH');
    expect(patch.request.headers.get('If-Match')).toBe('"v4"');
    expect(patch.request.body).toEqual({ status: 'INACTIVE', reason: 'Bank asked to pause' });
    patch.flush(client({ status: 'INACTIVE', statusReason: 'Bank asked to pause', version: 5 }));
    await settle(harness);
    expect(document.querySelector('.toasts')?.textContent).toContain('suspended');
    (await request('/api/v1/ops/api-clients')).flush({
      items: [client({ status: 'INACTIVE', statusReason: 'Bank asked to pause', version: 5 })],
    });
    (await request('/api/v1/ops/token-policy')).flush(policy);
    await settle(harness);
    expect(drawer.querySelector('.row .chip')?.textContent).toBe('Suspended');
    expect(drawer.textContent).toContain('Bank asked to pause');
    expect((drawer.querySelector('#ob-api-rotate') as HTMLButtonElement).disabled).toBe(true);
    expect((drawer.querySelector('#ob-api-edit') as HTMLButtonElement).disabled).toBe(true);

    (drawer.querySelector('#ob-api-st') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    dialog = lastModal();
    expect(dialog.querySelector('h3')?.textContent?.trim()).toBe(
      'Reactivate Sponsor bank — campus virtual accounts?',
    );
    type(dialog.querySelector('textarea'), 'Bank confirmed again');
    button(dialog, 'Reactivate client')?.click();
    const again = await request('/api/v1/ops/api-clients/c-1', 'PATCH');
    expect(again.request.headers.get('If-Match')).toBe('"v5"');
    expect(again.request.body).toEqual({ status: 'ACTIVE', reason: 'Bank confirmed again' });
  });

  it('rotates the secret and shows the new one once with the overlap of the old one', async () => {
    const { harness, el } = await openPage();
    const drawer = await openDrawer(harness, el);
    (drawer.querySelector('#ob-api-rotate') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    const dialog = lastModal();
    expect(dialog.querySelector('h3')?.textContent?.trim()).toBe(
      'Rotate the secret of Sponsor bank — campus virtual accounts?',
    );
    button(dialog, 'Rotate secret')?.click();
    const post = await request('/api/v1/ops/api-clients/c-1/secret-rotations', 'POST');
    expect(post.request.headers.get('Idempotency-Key')).toBeTruthy();
    expect(post.request.body).toEqual({});
    post.flush({ secret: 'n3w-s3cr3t', previousSecretValidUntil: '2026-10-04T15:30:00.000Z' });
    await settle(harness);
    const panel = lastModal();
    expect(panel.querySelector('h3')?.textContent).toBe('New client secret');
    expect(panel.querySelector('#ob-secret')?.textContent).toBe('n3w-s3cr3t');
    expect(panel.textContent).toContain('The old secret keeps working until');
    expect(panel.textContent).toContain('04 Oct 2026 · 9:00 PM');
    // The rotation changed the client's version: the list is read again.
    (await request('/api/v1/ops/api-clients')).flush({ items: [client({ version: 5 })] });
    (panel.querySelector('#ob-sec-ok') as HTMLInputElement).click();
    (panel.querySelector('#ob-sec-done') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(document.body.textContent).not.toContain('n3w-s3cr3t');
  });

  it('ends every live token with a reason', async () => {
    const { harness, el } = await openPage();
    const drawer = await openDrawer(harness, el);
    (drawer.querySelector('#ob-api-revoke') as HTMLButtonElement).click();
    await tick();
    harness.detectChanges();
    const dialog = lastModal();
    expect(dialog.querySelector('h3')?.textContent?.trim()).toBe(
      'End the live tokens of Sponsor bank — campus virtual accounts?',
    );
    type(dialog.querySelector('textarea'), 'Token leaked in a log');
    button(dialog, 'End live tokens')?.click();
    const post = await request('/api/v1/ops/api-clients/c-1/token-revocations', 'POST');
    expect(post.request.body).toEqual({ reason: 'Token leaked in a log' });
    post.flush(null, { status: 204, statusText: 'No Content' });
    await settle(harness);
    expect(document.querySelector('.toasts')?.textContent).toContain('Live tokens ended');
    // The log is read again.
    await request('/api/v1/ops/api-clients/c-1/tokens');
  });

  it('keeps "End live tokens" off when the client has none', async () => {
    const { harness, el } = await openPage();
    const drawer = await openDrawer(harness, el, 1);
    const revoke = drawer.querySelector('#ob-api-revoke') as HTMLButtonElement;
    expect(revoke.disabled).toBe(true);
    expect(revoke.parentElement?.getAttribute('title')).toBe(
      'The client has no live tokens right now.',
    );
    expect(drawer.textContent).toContain('No tokens issued');
  });

  it('changes the token lifetime within its bounds, with a reason and If-Match', async () => {
    const { harness, el } = await openPage([client()]);
    (el.querySelector('#ob-api-ttl') as HTMLButtonElement).click();
    harness.detectChanges();
    const modal = lastModal();
    expect(modal.querySelector('h3')?.textContent).toBe('Token lifetime');
    expect((modal.querySelector('#ob-ttl') as HTMLInputElement).value).toBe('15');
    type(modal.querySelector('#ob-ttl'), '90');
    (modal.querySelector('#ob-ttl-save') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(modal.querySelector('#ob-ttl-e')?.textContent).toContain('Choose 5 to 60 minutes');
    expect(modal.querySelector('#ob-ttl-r-e')?.textContent).toContain('Enter a reason');
    type(modal.querySelector('#ob-ttl'), '30');
    type(modal.querySelector('#ob-ttl-r'), 'Bank asked for longer tokens');
    harness.detectChanges();
    (modal.querySelector('#ob-ttl-save') as HTMLButtonElement).click();
    const put = await request('/api/v1/ops/token-policy', 'PUT');
    expect(put.request.headers.get('If-Match')).toBe('"v2"');
    expect(put.request.body).toEqual({ minutes: 30, reason: 'Bank asked for longer tokens' });
    put.flush({ ...policy, minutes: 30, version: 3 });
    await settle(harness);
    expect(document.querySelector('#ob-ttl')).toBeNull();
    expect(document.querySelector('.toasts')?.textContent).toContain(
      'Token lifetime set to 30 minutes',
    );
    expect(el.textContent).toContain('30 min');
  });

  it('shows the actions locked without the “Partner API clients” sub-task', async () => {
    const { el } = await openPage([client()], ['jobs.view']);
    const add = el.querySelector('#ob-api-new') as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(add.parentElement?.getAttribute('title')).toContain('Partner API clients');
  });

  it('imports the earlier application’s client with its client id and secret hash (INT-009)', async () => {
    const { harness } = await openPage();
    button(document, 'Import existing client')!.click();
    await settle(harness);
    const modal = lastModal();
    expect(modal.textContent).toContain('Import an existing client');
    type(modal.querySelector('#ob-ac-n'), 'Axis Bank Power E-coll');
    (modal.querySelector('#ob-ac-p-b') as HTMLButtonElement).click();
    harness.detectChanges();
    button(document, 'Sponsor bank')?.click();
    (modal.querySelector('#ob-ac-s-va_validate') as HTMLInputElement).click();
    (modal.querySelector('#ob-ac-s-va_notify') as HTMLInputElement).click();
    type(modal.querySelector('#ob-ac-ip'), '103.208.251.25');
    type(modal.querySelector('#ob-ac-cid'), 'AXISBANKEC_6BBFE1A3');
    type(modal.querySelector('#ob-ac-hash'), 'not-a-hash');
    harness.detectChanges();
    (modal.querySelector('#ob-ac-import') as HTMLButtonElement).click();
    await settle(harness);
    expect(modal.textContent).toContain('bcrypt hash');
    const hash = '$2b$12$' + 'a'.repeat(53);
    type(modal.querySelector('#ob-ac-hash'), hash);
    harness.detectChanges();
    (modal.querySelector('#ob-ac-import') as HTMLButtonElement).click();
    const post = await request('/api/v1/ops/api-clients/imports', 'POST');
    expect(post.request.headers.has('Idempotency-Key')).toBe(true);
    expect(post.request.body).toEqual({
      name: 'Axis Bank Power E-coll',
      partner: 'SPONSOR_BANK',
      clientId: 'AXISBANKEC_6BBFE1A3',
      secretHash: hash,
      scopes: ['va.validate', 'va.notify'],
      ipAllowlist: ['103.208.251.25'],
    });
    post.flush(client({ id: 'c-9', clientId: 'AXISBANKEC_6BBFE1A3', secretKind: 'HASH' }), {
      status: 201,
      statusText: 'Created',
    });
    await settle(harness);
    expect(document.querySelector('.toasts')?.textContent).toContain('imported');
  });
  it('lists the messaging channels and switches Phone push on with If-Match (INT-009/010, client 2026-10-21)', async () => {
    const channel = (c: string, over: object = {}) => ({
      channel: c,
      provider: c === 'IN_APP' ? 'in-app' : c === 'WHATSAPP' ? null : 'log',
      testMode: c !== 'IN_APP' && c !== 'WHATSAPP',
      integrated: c !== 'WHATSAPP',
      enabled: c === 'IN_APP',
      templateSet: 'default',
      updatedAt: null,
      version: 1,
      ...over,
    });
    const { harness, el } = await openPage();
    // Before the server has a push provider: the switch is shut and the note says what to set.
    (await request('/api/v1/ops/messaging-providers')).flush({
      items: ['IN_APP', 'SMS', 'EMAIL', 'WHATSAPP', 'PUSH'].map((c) =>
        c === 'PUSH'
          ? channel(c, { provider: null, testMode: false, integrated: false })
          : channel(c),
      ),
    });
    await settle(harness);
    const table = el.querySelector('#ob-channels') as HTMLElement;
    expect([...table.querySelectorAll('tbody tr b')].map((b) => b.textContent)).toEqual([
      'In-app',
      'SMS',
      'E-mail',
      'WhatsApp',
      'Phone push',
    ]);
    const sw = (c: string) =>
      table.querySelector(`tr[data-channel="${c}"] button[role="switch"]`) as HTMLButtonElement;
    expect(sw('IN_APP').disabled).toBe(true);
    expect(sw('PUSH').disabled).toBe(true);
    expect(el.textContent).toContain('PUSH_PROVIDER=fcm');

    // Once it is set up (PUSH_PROVIDER=fcm): switched on.
    const page = harness.routeDebugElement!.query((d) => d.name === 'rp-messaging-channels')
      .componentInstance as { load: () => Promise<void> };
    const loaded = page.load();
    (await request('/api/v1/ops/messaging-providers')).flush({
      items: ['IN_APP', 'PUSH'].map((c) =>
        c === 'PUSH' ? channel(c, { provider: 'fcm', testMode: false, version: 3 }) : channel(c),
      ),
    });
    await loaded;
    await settle(harness);
    expect(sw('PUSH').disabled).toBe(false);
    sw('PUSH').click();
    const put = await request('/api/v1/ops/messaging-providers/push', 'PUT');
    expect(put.request.headers.get('If-Match')).toBe('"v3"');
    expect(put.request.body).toEqual({ enabled: true });
    put.flush(channel('PUSH', { provider: 'fcm', testMode: false, enabled: true, version: 4 }));
    await settle(harness);
    expect(sw('PUSH').getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('.toasts')?.textContent).toContain('Phone push switched on');
  });
});
