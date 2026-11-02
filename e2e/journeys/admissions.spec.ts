/**
 * Admissions journey (prototype c.fees entry fees → c.admissionqr → p.landing → p.form → p.resume →
 * p.done → p.status → c.applications). The administrator opens a class for admission, sets the
 * year's entry fees and generates the admission link; a parent opens the sample school's public
 * page, starts a mid-term application, saves the draft, resumes it with the one-time code sent to
 * the mobile on the application, completes and submits it, and tracks it as Submitted; the
 * administrator (who holds the counsellor's tasks) then finds it under Applications.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  ACCOUNTS,
  FILES,
  SCHOOL,
  choose,
  confirm,
  day,
  dialog,
  expectToast,
  mobile,
  runTag,
  staffSignIn,
  title,
} from './support';

test('a parent applies through the admission link and the school sees the application', async ({
  page: staff,
  browser,
  baseURL,
}) => {
  const tag = runTag();
  const className = `Adm ${tag}`;
  const child = { first: 'Diya', last: title(tag) };
  const father = { name: `Rohan ${title(tag)}`, mobile: mobile('9') };
  const parent = await browser.newPage({ ...(baseURL ? { baseURL } : {}) });
  let link = '';

  await test.step('console: sign in and add the class families apply to', async () => {
    await staffSignIn(staff, 'console', ACCOUNTS.admin);
    await staff.goto('/console/structure');
    await staff.getByRole('button', { name: 'Add class' }).first().click();
    const form = dialog(staff, 'Add a class');
    await form.getByLabel('Class name').fill(className);
    await form.getByLabel('Order').fill('900');
    await form.getByLabel('Section 1 name').fill('A');
    await form.getByRole('button', { name: 'Add class' }).click();
    await expectToast(staff, 'Class added', className);
  });

  let year = '';
  await test.step("console: set the current year's entry fees (application fee optional)", async () => {
    await staff.goto('/console/fees');
    const entry = staff.locator('#ef-card .cm-entry').filter({ hasText: 'In context' });
    year = (await entry.locator('b').first().innerText()).trim();
    expect(year).toMatch(/^\d{4}-\d{2}$/);
    await entry.getByRole('button', { name: /Set entry fees|Edit/ }).click();
    const form = dialog(staff, `Entry fees · ${year}`);
    await form.locator('#ef-app').fill('500');
    const mandatory = form.getByRole('switch', { name: 'Application fee is mandatory' });
    if ((await mandatory.getAttribute('aria-checked')) === 'true') await mandatory.click();
    await expect(mandatory).toHaveAttribute('aria-checked', 'false');
    await form.locator('#ef-adm').fill('10000');
    await form.getByRole('button', { name: 'Save entry fees' }).click();
    await confirm(staff, `Save entry fees for ${year}?`, 'Save');
    await expectToast(staff, 'Entry fees saved', year);
    await expect(entry).toContainText('₹500.00');
    await expect(entry).toContainText('No');
  });

  await test.step('console: generate the admission link and QR', async () => {
    await staff.goto('/console/admissionqr');
    await expect(staff.getByRole('heading', { level: 1 })).toHaveText('Admission link & QR');
    await staff.locator('#aq-gen, #aq-replace').first().click();
    await staff.locator('#ql-go').click();
    await expectToast(staff, /^(Link and QR generated|New link generated)$/);
    link = (await staff.locator('#aq-url').innerText()).trim();
    expect(link).toMatch(/\/admissions\/[\w-]{20,}$/);
  });

  const continueTo = async (heading: string) => {
    await parent.locator('#pa-next').click();
    await expect(parent.getByRole('heading', { level: 2 })).toHaveText(heading);
  };

  await test.step("parent: open the school's admissions page", async () => {
    await parent.goto(new URL(link).pathname);
    await expect(parent.getByRole('heading', { level: 1 })).toHaveText(
      `A place for your child at ${SCHOOL}`,
    );
    await expect(parent.getByRole('heading', { name: 'Open academic years' })).toBeVisible();
    await parent.getByRole('button', { name: 'Start an application' }).first().click();
    await expect(parent.getByRole('heading', { level: 1 })).toHaveText('Application for admission');
    await expect(parent.getByRole('heading', { level: 2 })).toHaveText('Class & year');
  });

  await test.step('parent: class & year, student, addresses', async () => {
    await choose(parent, 'pa-class', className);
    // The current year has started: this is a mid-term admission with a joining date.
    await parent.getByLabel('Joining date').fill(day(7));
    await continueTo('Student');
    await parent.getByLabel('First name').fill(child.first);
    await parent.getByLabel('Last name').fill(child.last);
    await choose(parent, 'pa-gender', 'Female');
    await parent.getByLabel('Date of birth').fill('2016-08-20');
    await parent.locator('#pa-id').fill(String(100000 + Math.floor(Math.random() * 899999)));
    await choose(parent, 'pa-cat', 'General');
    await choose(parent, 'pa-med', 'English');
    await choose(parent, 'pa-blood', 'O+');
    await parent.locator('#pa-photo').setInputFiles(FILES.png);
    await expect(parent.locator('label.upl[for="pa-photo"]')).toContainText('uploaded');
    await continueTo('Addresses');
    await parent.getByLabel('House number and street').fill('No. 12, 4th Cross, Gopala');
    await parent.getByLabel('City or town').fill('Shivamogga');
    await parent.getByLabel('PIN code').fill('577205');
    await continueTo('Previous schooling');
  });

  await test.step('parent: previous schooling with the transfer certificate', async () => {
    await parent.locator('#pa-psch').fill('Sunshine English School');
    await choose(parent, 'pa-plast', className);
    await parent.locator('#pa-pres').fill('Passed');
    await choose(parent, 'pa-pboard', 'State board');
    await parent.locator('#pa-tcfile').setInputFiles(FILES.pdf);
    await expect(parent.locator('label.upl[for="pa-tcfile"]')).toContainText('uploaded');
    await continueTo('Parents & guardians');
  });

  await test.step('parent: father as the primary contact; the draft is saved', async () => {
    await parent.locator('#pa-f-name').fill(father.name);
    await parent.locator('#pa-f-mob').fill(father.mobile);
    await parent.locator('#pa-f-email').fill(`rohan.${tag.toLowerCase()}@example.in`);
    await choose(parent, 'pa-primary', 'Father');
    await parent.getByRole('button', { name: 'Save draft' }).first().click();
    await expectToast(
      parent,
      'Draft saved',
      'Resume any time with the identity number you entered',
    );
    await expect(parent.getByRole('main')).toContainText(/Draft\s*TVPS\/\d{4}\/\d+/);
    await continueTo('References');
  });

  await test.step('parent: resume the draft with the one-time code', async () => {
    await parent.goto(new URL(link).pathname);
    await parent.getByRole('button', { name: 'Resume an application' }).first().click();
    await expect(parent.getByRole('heading', { name: 'Resume an application' })).toBeVisible();
    await parent.locator('#pa-rq').fill(father.mobile);
    await parent.locator('#pa-rfind').click();
    await expectToast(parent, 'Code sent');
    const code = (await parent.locator('#pa-resume .demo-hint b').innerText()).trim();
    expect(code).toMatch(/^\d{4,8}$/);
    await parent.getByLabel('One-time code').fill(code);
    await parent.locator('#pa-rverify').click();
    await expect(parent.getByRole('heading', { level: 1 })).toHaveText('Application for admission');
    await expect(parent.getByRole('heading', { level: 2 })).toHaveText('References');
  });

  await test.step('parent: a reference, the documents, the declaration — submit', async () => {
    await parent.getByRole('button', { name: 'Add a reference' }).click();
    await parent.locator('#pa-ref0-name').fill('Lakshmi Bhat');
    await parent.locator('#pa-ref0-rel').fill('Class teacher at the previous school');
    await parent.locator('#pa-ref0-phone').fill(mobile('8'));
    await continueTo('Documents');
    for (const doc of ['pa-dbirth', 'pa-daddr', 'pa-dreport']) {
      if (!(await parent.locator(`#${doc}`).count())) continue; // the report card: from Grade 1
      await parent.locator(`#${doc}`).setInputFiles(FILES.pdf);
      await expect(parent.locator(`label.upl[for="${doc}"]`)).toContainText('uploaded');
    }
    await continueTo('Review & declaration');
    await expect(parent.getByText(father.name).first()).toBeVisible();
    await parent.locator('#pa-declare').check();
    await expect(parent.locator('#pa-next')).toHaveText('Submit application');
    await parent.locator('#pa-next').click();
  });

  let applicationNo = '';
  await test.step('parent: the application is submitted', async () => {
    await expect(parent.getByRole('heading', { level: 1 })).toHaveText('Application submitted');
    applicationNo = (await parent.locator('.pa-appno b').innerText()).trim();
    expect(applicationNo).toMatch(/^TVPS\/\d{4}\/\d+$/);
    const facts = parent.locator('dl.kv');
    await expect(facts).toContainText(`${child.first} ${child.last}`);
    await expect(facts).toContainText(className);
    await expect(facts).toContainText('Mid-term');
  });

  await test.step('parent: track the application — Submitted', async () => {
    const status = parent.locator('.pa-stat');
    await parent.getByRole('button', { name: 'Track this application' }).click();
    await expect(status).toContainText(`Application ${applicationNo}`);
    await expect(status.locator('.pa-stat-h > .chip')).toHaveText('Submitted');
    // Later, by the application number and the mobile on it (p.status, RNG-GOV-007).
    await parent.getByRole('button', { name: 'Check another application' }).click();
    await expect(parent.getByRole('heading', { name: 'Track an application' })).toBeVisible();
    await parent.getByLabel('Application number').fill(applicationNo);
    await parent.getByLabel('Mobile number').fill(father.mobile);
    await parent.locator('#pa-tgo').click();
    await expect(status).toContainText(`Application ${applicationNo}`);
    await expect(status.locator('.pa-stat-h > .chip')).toHaveText('Submitted');
    await expect(status).toContainText('Counsellor review');
  });

  await test.step('console: the application is listed as Submitted', async () => {
    await openApplications(staff, applicationNo);
    const row = staff.locator('#ap-table tbody tr', { hasText: applicationNo });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`${child.first} ${child.last}`.toUpperCase(), {
      ignoreCase: true,
    });
    await expect(row).toContainText('Submitted');
    await expect(row).toContainText(className);
  });

  await parent.close();
});

async function openApplications(page: Page, applicationNo: string) {
  await page.goto('/console/applications');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Applications');
  await page.locator('#ap-q').fill(applicationNo);
}
