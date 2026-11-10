import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to http://localhost:4200/backoffice/signin ...');
  await page.goto('http://localhost:4200/backoffice/signin', { waitUntil: 'networkidle' });

  console.log('Filling Super Admin credentials...');
  await page.locator('#cp-au-email').fill('arjun@campusone.example');
  await page.locator('#cp-au-pw').fill('CampusOne@2026');

  console.log('Clicking Continue...');
  await page.locator('#cp-au-go').click();

  await page.waitForTimeout(2000);

  // Click email fallback button to get fresh testCode card
  const mailBtn = page.locator('button:has-text("Send the code to my e-mail")');
  if (await mailBtn.isVisible()) {
    await mailBtn.click();
    await page.waitForTimeout(1000);
  }

  // Click on test code card to auto-fill & verify
  console.log('Clicking test code card...');
  const testCard = page.locator('.cp-test-code-card');
  if (await testCard.isVisible()) {
    await testCard.click();
  } else {
    // If not visible, enter 3591
    const inputs = page.locator('.otp input, .cp-otp input');
    if (await inputs.count() === 4) {
      await inputs.first().pressSequentially('3591');
      await page.locator('#cp-au-verify').click();
    }
  }

  await page.waitForTimeout(3000);
  console.log('Post-login URL:', page.url());

  // Navigate to Institutions (Onboarding) page
  console.log('Navigating to http://localhost:4200/backoffice/institutions ...');
  await page.goto('http://localhost:4200/backoffice/institutions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('Clicking "Register institution" button to open Onboarding Form modal...');
  const regBtn = page.locator('button:has-text("Register institution")');
  await regBtn.waitFor({ state: 'visible', timeout: 5000 });
  await regBtn.click();
  await page.waitForTimeout(1500);

  console.log('Taking screenshot of School Onboarding Modal...');
  await page.screenshot({
    path: 'C:/Users/Ankit/.gemini/antigravity/brain/6ddcf0f0-d701-4e4b-82fa-929a3680e429/school_onboarding_modal.png',
    fullPage: true
  });

  console.log('SUCCESS! Screenshot saved to school_onboarding_modal.png');
  await browser.close();
})().catch(console.error);
