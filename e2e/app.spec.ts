import { expect, test } from '@playwright/test';

const AREAS = [
  { path: 'console', title: 'Institution Console' },
  { path: 'backoffice', title: 'Operator Back Office' },
  { path: 'admissions', title: 'Admissions' },
  { path: 'portal', title: 'Customer Portal' },
  { path: 'terminal', title: 'Terminal' },
];

test('the landing page lists every area', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('CampusOne');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('CampusOne');
  for (const area of AREAS)
    await expect(page.getByRole('link', { name: area.title })).toBeVisible();
});

for (const [path, heading, panel] of [
  ['console', 'Sign in', 'Run the whole campus from one place.'],
  ['backoffice', 'Back office sign-in', 'Operate every institution, safely.'],
] as const) {
  test(`a signed-out visitor to /${path} gets the prototype's sign-in page`, async ({ page }) => {
    await page.goto(`/${path}`);
    await expect(page).toHaveURL(new RegExp(`/${path}/signin$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(panel);
    await expect(page.getByLabel('Work e-mail')).toBeVisible();
    // The prototype's fonts are served by the app itself.
    const font = await page
      .getByRole('heading', { level: 1 })
      .evaluate((h) => getComputedStyle(h).fontFamily);
    expect(font).toContain('Bricolage Grotesque');
  });
}

test("the customer portal opens on the prototype's product site (s.home)", async ({ page }) => {
  await page.goto('/portal');
  await expect(page).toHaveTitle('CampusOne — Customer Portal');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('on one ring.');
  await page.getByRole('button', { name: 'Start your free trial' }).first().click();
  await expect(page).toHaveURL(/\/portal\/signup$/);
  await expect(page.getByRole('heading', { name: 'Your CampusOne account' })).toBeVisible();
});

test('a signed-out visitor to the portal account gets the portal sign-in page', async ({
  page,
}) => {
  await page.goto('/portal/account');
  await expect(page).toHaveURL(/\/portal\/signin/);
  await expect(page.locator('#sp-si-e')).toBeVisible();
});

test('an unpaired terminal opens on the pairing step', async ({ page }) => {
  await page.goto('/terminal');
  await expect(page).toHaveTitle('CampusOne — Terminal');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pair this terminal');
  await expect(page.getByLabel('Pairing code')).toBeVisible();
});

for (const area of AREAS.filter(
  (a) => !['console', 'backoffice', 'portal', 'terminal'].includes(a.path),
)) {
  test(`the ${area.title} area opens and shows the service status`, async ({ page }) => {
    await page.goto(`/${area.path}`);
    await expect(page).toHaveTitle(`CampusOne — ${area.title}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(area.title);
    await expect(page.locator('rp-api-health')).not.toHaveText(/Checking the service/, {
      timeout: 15000,
    });
  });
}
