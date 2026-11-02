/**
 * Shared steps of the end-to-end journeys (Phase 9.1). The journeys run against the isolated stack
 * (README.md): the API on 3021 over the schema `campusone_e2e`, this app on 4321. One-time codes come
 * from the test banner (OTP_TEST_SHOW_CODE on that API only). Every journey makes its own names and
 * numbers so it can be run again on the same database.
 */
import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/** The development seed's sample accounts; `npm run e2e:db` gives them these test passwords. */
export const ACCOUNTS = {
  admin: {
    email: 'prakash.shetty@tvps.example.in',
    password: process.env['E2E_STAFF_PASSWORD'] ?? 'Tvps@2026',
    first: 'Prakash',
  },
  operator: {
    email: 'arjun@campusone.example',
    password: process.env['E2E_OPS_PASSWORD'] ?? 'CampusOne@2026',
    first: 'Arjun',
  },
} as const;
export const SCHOOL = 'Tunga Valley Public School';

/** A tag unique to this run, in letters only (names accept letters, spaces and . ' -). */
export function runTag(length = 6): string {
  const n = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
  let s = '';
  for (let v = n; s.length < length; v /= 26n) s = String.fromCharCode(65 + Number(v % 26n)) + s;
  return s;
}
export const title = (tag: string) => tag[0] + tag.slice(1).toLowerCase();

/** A 10-digit Indian mobile starting with `first` (6–9), different on every call. */
let mobiles = 0;
export function mobile(first: '6' | '7' | '8' | '9'): string {
  const n = (Date.now() * 10 + (mobiles++ % 10)) % 1e9;
  return `${first}${String(n).padStart(9, '0')}`;
}

/** A day counted from today in India, as YYYY-MM-DD. */
export function day(offset: number): string {
  return new Date(Date.now() + 330 * 60_000 + offset * 86_400_000).toISOString().slice(0, 10);
}

/** Small files the upload checks accept (type-sniffed, well under 2 MB). */
export const FILES = {
  pdf: {
    name: 'document.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'),
  },
  png: {
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    ),
  },
};

/** The prototype's sign-in for the console or the back office: e-mail, password, then the code. */
export async function staffSignIn(
  page: Page,
  surface: 'console' | 'backoffice',
  who: { email: string; password: string; first: string },
): Promise<void> {
  await page.goto(`/${surface}/signin`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    surface === 'console' ? 'Sign in' : 'Back office sign-in',
  );
  await page.getByLabel('Work e-mail').fill(who.email);
  await page.locator('#cp-au-pw').fill(who.password);
  await page.locator('#cp-au-go').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("Verify it's you");
  const code = (await page.locator('.demo-hint b').innerText()).trim();
  expect(code).toMatch(/^\d{4,8}$/);
  const digits = page.getByRole('group', { name: 'One-time code' }).locator('input');
  await expect(digits).toHaveCount(code.length);
  for (const [i, d] of [...code].entries()) await digits.nth(i).fill(d);
  await expect(page).toHaveURL(new RegExp(`/${surface}/?$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    new RegExp(`^Good (morning|afternoon|evening), ${who.first}$`),
  );
}

/**
 * Picks `label` in the prototype's dropdown (`#<id>-b`) with the keyboard, as its menu opens below
 * the button and may fall outside a short window.
 */
export async function choose(page: Page, id: string, label: string): Promise<void> {
  const button = page.locator(`#${id}-b`);
  await button.scrollIntoViewIfNeeded();
  await button.focus();
  await button.press('Enter');
  const options = page.locator('.dd-menu [role=option]');
  await expect(options.first()).toBeAttached();
  const list = await options.evaluateAll((els) =>
    els.map((e) => ({
      name: e.firstElementChild?.textContent?.trim() ?? '',
      on: e.getAttribute('aria-selected') === 'true',
    })),
  );
  const at = list.findIndex((o) => o.name === label);
  if (at < 0) throw new Error(`#${id} has no option "${label}": ${list.map((o) => o.name)}`);
  const current = list.findIndex((o) => o.on);
  const presses = current < 0 ? at + 1 : (at - current + list.length) % list.length;
  for (let i = 0; i < presses; i++) await button.press('ArrowDown');
  await button.press('Enter');
  await expect(button).toContainText(label);
}

/** The prototype's toast (`.toast`, role status) with its title and, when given, its line. */
export async function expectToast(page: Page, heading: string | RegExp, line?: string | RegExp) {
  const toast = page.getByRole('status').filter({ has: page.locator('b', { hasText: heading }) });
  await expect(toast.first()).toBeVisible();
  if (line) await expect(toast.first()).toContainText(line);
}

/** The confirmation dialog (`role=alertdialog`) with this title: answers with `ok`. */
export async function confirm(page: Page, heading: string | RegExp, ok: string, reason?: string) {
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('heading')).toHaveText(heading);
  if (reason) await dialog.getByRole('textbox').fill(reason);
  await dialog.getByRole('button', { name: ok, exact: true }).click();
  await expect(dialog).toBeHidden();
}

export const dialog = (page: Page, name: string): Locator => page.getByRole('dialog', { name });

/**
 * A new CampusOne account, as the member app makes one (IDN-001…003): mobile code, then details. The
 * back office registers an institution for an existing account that isn't in any institution.
 */
export async function signUpAccount(
  request: APIRequestContext,
  person: { first: string; last: string; email: string; mobile: string },
): Promise<void> {
  const api = '/api/v1/auth/member';
  const ref = await request.get(`${api}/signup/reference`);
  expect(ref.ok()).toBeTruthy();
  const { consent, terms } = (await ref.json()) as {
    consent: { version: string };
    terms: { version: string };
  };
  const otp = await request.post(`${api}/signup/otp`, {
    data: { mobile: person.mobile, consentVersion: consent.version },
  });
  expect(otp.status(), await otp.text()).toBe(202);
  const challenge = (await otp.json()) as { challengeId: string; testCode?: string };
  expect(challenge.testCode, 'OTP_TEST_SHOW_CODE must be on for the e2e API').toBeTruthy();
  const verified = await request.post(`${api}/signup/otp/verify`, {
    data: { challengeId: challenge.challengeId, otp: challenge.testCode },
  });
  expect(verified.ok(), await verified.text()).toBeTruthy();
  const { signupToken } = (await verified.json()) as { signupToken: string };
  const letter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const digits = (n: number) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
  const done = await request.post(`${api}/signup`, {
    headers: { 'Idempotency-Key': randomUUID() },
    data: {
      signupToken,
      mobile: person.mobile,
      consentVersion: consent.version,
      termsVersion: terms.version,
      termsAccepted: true,
      pan: `${letter()}${letter()}${letter()}P${letter()}${digits(4)}${letter()}`,
      firstName: person.first,
      lastName: person.last,
      gender: 'FEMALE',
      dob: '1988-04-12',
      idDocType: 'PASSPORT',
      idDocNumber: `P${digits(7)}`,
      email: person.email,
      password: `Admin@${digits(4)}x`,
      securityQuestion: 'FIRST_PET',
      securityAnswer: 'tommy',
      device: { installId: randomUUID() },
    },
  });
  expect(done.status(), await done.text()).toBe(201);
}
