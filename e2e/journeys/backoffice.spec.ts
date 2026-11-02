/**
 * Back-office journey (prototype o.signin → o.institutions → o.inst drawer): a platform operator
 * signs in with the one-time code, registers a new institution for an administrator who already has
 * a CampusOne account, completes the required onboarding steps (bank corporate code and pool account,
 * feature toggles, academic year, fee account), activates it, and finds it Active in the list.
 */
import { expect, test } from '@playwright/test';
import {
  ACCOUNTS,
  confirm,
  dialog,
  expectToast,
  mobile,
  runTag,
  signUpAccount,
  staffSignIn,
  title,
} from './support';

test('an operator registers an institution, completes onboarding and activates it', async ({
  page,
  request,
}) => {
  const tag = runTag();
  const name = `Sharavathi ${title(tag)} Public School`;
  const admin = {
    first: 'Kavya',
    last: title(tag),
    email: `kavya.${tag.toLowerCase()}@example.in`,
    mobile: mobile('6'),
  };
  // 4 capital letters or digits, unique across institutions (OQ-28).
  const corporateCode = tag.slice(-4);

  await test.step("the administrator's CampusOne account exists (member app sign-up)", async () => {
    await signUpAccount(request, admin);
  });

  await test.step('sign in to the back office with the one-time code', async () => {
    await staffSignIn(page, 'backoffice', ACCOUNTS.operator);
  });

  await test.step('register the institution', async () => {
    await page.goto('/backoffice/institutions');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Institutions');
    await page.getByRole('button', { name: 'Register institution' }).first().click();
    const form = dialog(page, 'Register an institution');
    await form.getByLabel('Institution name').fill(name);
    await form.getByLabel('Address').fill(`${Date.now() % 1000}, Main Road, Sagara 577401`);
    await form.getByLabel('City or town').fill('Sagara');
    await form.locator('#ob-n-board').selectOption('State');
    await form.locator('#ob-n-pn').fill(`${admin.first} ${admin.last}`);
    await form.locator('#ob-n-pe').fill(`office.${tag.toLowerCase()}@example.in`);
    await form.locator('#ob-n-pp').fill(mobile('9'));
    await form.getByLabel("Administrator's e-mail").fill(admin.email);
    await form.locator('#ob-n-plan').selectOption({ index: 1 });
    await form.getByRole('button', { name: 'Register institution' }).click();
    await expectToast(page, 'Institution registered', /Pending activation/);
  });

  const drawer = dialog(page, name);
  const step = (label: string) => drawer.locator('.ob-check', { hasText: label });

  await test.step('the drawer shows it pending activation with the checklist', async () => {
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('.chip').first()).toHaveText('Pending activation');
    await expect(drawer.getByRole('heading', { name: /Onboarding checklist/ })).toContainText(
      '3 of 9',
    );
    await expect(drawer).toContainText(admin.email);
    await expect(drawer.getByRole('button', { name: 'Activate' })).toBeDisabled();
  });

  await test.step('set the bank corporate code and pool account', async () => {
    await step('Bank corporate code and pool account')
      .getByRole('button', { name: 'Set up' })
      .click();
    const bank = dialog(page, 'Bank corporate code and pool account');
    await bank.getByLabel('Corporate code').fill(corporateCode);
    await bank.getByLabel('Pool account reference').fill(`POOLE2E${corporateCode}`);
    await bank.getByRole('button', { name: 'Save and mark done' }).click();
    await expectToast(page, 'Corporate code saved', corporateCode);
    await expect(drawer).toContainText(`Corporate code ${corporateCode}`);
  });

  await test.step('mark the remaining required steps done', async () => {
    let done = 4;
    for (const label of [
      'Feature toggles set',
      'Academic year declared',
      'Fee account designated',
    ]) {
      await step(label).getByRole('button', { name: 'Mark done' }).click();
      await confirm(page, `Mark “${label}” as done?`, 'Mark done');
      done++;
      await expectToast(page, 'Checklist updated', `${done} of 9 steps complete`);
      await expect(step(label)).toHaveClass(/done/);
    }
    await expect(drawer.locator('.note.tone-ok')).toBeVisible();
  });

  await test.step('activate the institution', async () => {
    await drawer.getByRole('button', { name: 'Activate' }).click();
    await confirm(
      page,
      `Activate ${name}?`,
      'Activate institution',
      'Onboarding complete; first invoice raised (e2e journey)',
    );
    await expectToast(page, `${name} · Active`, /Recorded in the lifecycle history/);
    await expect(drawer.locator('.chip').first()).toHaveText('Active');
    await drawer.getByRole('button', { name: 'Close' }).click();
    await expect(drawer).toBeHidden();
  });

  await test.step('the institution is listed as Active', async () => {
    await page.getByRole('button', { name: /^Active \d+$/ }).click();
    await page.locator('#ob-iq').fill(title(tag));
    const row = page.locator('table tbody tr', { hasText: name });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Active');
    await expect(row).toContainText('Sagara');
  });
});
