/**
 * Console journey (prototype c.signin → c.classes → c.onboard → c.fees → c.feerecords →
 * c.settlements): the institution administrator of the sample school signs in with the one-time
 * code, adds a class, onboards a student into it, creates a fee structure for the class (applied
 * directly — the administrator's own request, Q9), assigns it, finds the student's fee records and
 * opens settlements.
 */
import { expect, test } from '@playwright/test';
import {
  ACCOUNTS,
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

test('the administrator onboards a student, bills the class and opens settlements', async ({
  page,
}) => {
  const tag = runTag();
  const className = `E2E ${tag}`;
  const student = { first: 'Asha', last: title(tag), admissionNo: `E2E/${tag}` };
  const structure = `E2E fees ${title(tag)}`;

  await test.step('sign in to the console with the one-time code', async () => {
    await staffSignIn(page, 'console', ACCOUNTS.admin);
  });

  await test.step('add a class with one section (Classes & subjects)', async () => {
    await page.goto('/console/structure');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Classes & subjects');
    await page.getByRole('button', { name: 'Add class' }).first().click();
    const form = dialog(page, 'Add a class');
    await form.getByLabel('Class name').fill(className);
    await form.getByLabel('Order').fill('900');
    await form.getByLabel('Section 1 name').fill('A');
    await form.getByRole('button', { name: 'Add class' }).click();
    await expectToast(page, 'Class added', `${className} · sections A`);
    await expect(page.locator('#cls-table')).toContainText(className);
  });

  let memberNo = '';
  await test.step('onboard a student: check the mobile, details, done', async () => {
    await page.goto('/console/onboard');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Onboard members');
    await expect(
      page.getByRole('heading', { name: 'Check the mobile number first' }),
    ).toBeVisible();
    await page.getByLabel('Mobile number').fill(mobile('7'));
    await page.getByRole('button', { name: 'Check eligibility' }).click();
    await expect(
      page.locator('.note').filter({ hasText: 'This number is new to CampusOne' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.locator('#cp-ob-ut-b')).toHaveText('Student');
    await page.getByLabel('First name').fill(student.first);
    await page.getByLabel('Last name').fill(student.last);
    await choose(page, 'cp-ob-gender', 'Female');
    await page.getByLabel('Date of birth').fill('2015-06-14');
    await page.getByLabel('Admission number').fill(student.admissionNo);
    await choose(page, 'cp-ob-cls', className);
    await choose(page, 'cp-ob-sec', 'Section A');
    await page.locator('#cp-ob-pcn').fill(`Meera ${title(tag)}`);
    await page.locator('#cp-ob-pce').fill(`meera.${tag.toLowerCase()}@example.in`);
    await choose(page, 'cp-ob-rel', 'Mother');
    await page.getByRole('button', { name: 'Create member' }).click();

    await expect(
      page.getByRole('heading', { name: `${student.first} ${student.last} is onboarded` }),
    ).toBeVisible();
    await expectToast(page, `${student.first} is onboarded`);
    const facts = page.locator('dl.kv');
    await expect(facts).toContainText(student.admissionNo);
    memberNo = (await facts.locator('dt:has-text("Member ID") + dd').innerText()).trim();
    expect(memberNo).toMatch(/^TVPS-\d+$/);
  });

  await test.step('create a fee structure for the class and submit it', async () => {
    await page.goto('/console/fees');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fee structures');
    await page.locator('#fs-new').click();
    const form = page.locator('#fs-form');
    await expect(page.getByRole('heading', { name: 'New fee structure' })).toBeVisible();
    await form.getByLabel('Structure name').fill(structure);
    await form.locator('label.cm-clschip', { hasText: className }).click();
    await expect(form.getByRole('heading', { name: /Classes/ })).toContainText('1 selected');
    const heads = form.locator('#fs-heads tbody tr');
    await heads.nth(0).getByLabel('Fee head').selectOption({ label: 'Tuition' });
    await heads.nth(0).getByLabel('Tuition amount').fill('12000');
    await heads.nth(1).getByLabel('Fee head').selectOption({ label: 'Annual' });
    await heads.nth(1).getByLabel('Annual amount').fill('2000');
    await expect(form.locator('#fs-htot')).toHaveText('₹14,000.00');
    const terms = form.locator('#fs-inst tbody tr');
    await terms.nth(0).getByLabel('Instalment label').fill('Term 1');
    await terms.nth(0).getByLabel('Due date').fill(day(30));
    await terms.nth(1).getByLabel('Instalment label').fill('Term 2');
    await terms.nth(1).getByLabel('Due date').fill(day(90));
    await expect(form.locator('#fs-pct')).toHaveText('100% of 100%');
    await page.locator('#fs-submit').click();
    await confirm(page, `Submit ${structure} for approval?`, 'Submit for approval');
    await expectToast(
      page,
      'Structure approved',
      /applied directly — your own request as the administrator/,
    );
  });

  await test.step('assign the structure to the class: fee records are created', async () => {
    const drawer = dialog(page, 'Fee structure');
    await expect(drawer).toContainText(structure);
    await drawer.locator('#fs-assign').click();
    const plan = dialog(page, `Assign ${structure}`);
    await expect(plan.locator('#fa-table')).toContainText(className);
    await expect(plan.locator('#fa-table')).toContainText('₹14,000.00');
    await plan.locator('#fa-create').click();
    await confirm(page, 'Create 2 fee records?', 'Create records');
    await expectToast(page, '2 fee records created', `${structure} · 1 student`);
  });

  await test.step("find the student's fee records", async () => {
    await page.goto('/console/feerecords');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fee records');
    await page.locator('#fr-q').fill(student.admissionNo);
    const rows = page.locator('#fr-table tbody tr', { hasText: student.admissionNo });
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'Term 1' })).toContainText('₹7,000.00');
    await expect(rows.filter({ hasText: 'Term 2' })).toContainText('₹7,000.00');
    await expect(rows.first()).toContainText('Due');
  });

  await test.step('open settlements', async () => {
    await page.goto('/console/settlements');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settlements');
    await expect(page.locator('#stl-kpis')).toBeVisible();
    await expect(page.locator('#stl-table')).toBeVisible();
    // A fresh database has no settlement run yet: the prototype's empty state says when it comes.
    const empty = page.getByRole('heading', { name: 'No settlements in this view' });
    if (await empty.isVisible()) {
      await expect(page.locator('#stl-table')).toContainText(
        'The first settlement appears after the 23:30 run.',
      );
    } else {
      await expect(page.locator('#stl-table tbody tr').first()).toBeVisible();
    }
  });
});
