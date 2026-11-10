import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const page = await browser.newPage();
  const port = process.env.PORT || '4200';
  await page.goto(`http://localhost:${port}/signin`, { waitUntil: 'networkidle' });

  await page.locator('#cp-au-email').fill('aryapatil963@gmail.com');
  await page.locator('#cp-au-pw').fill('Ankit@1999');
  await page.locator('#cp-au-go').click();
  await page.waitForTimeout(2000);

  const mailBtn = page.locator('button:has-text("Send the code to my e-mail")');
  if (await mailBtn.isVisible()) {
    await mailBtn.click();
    await page.waitForTimeout(1500);
  }

  const testCodeCard = page.locator('.cp-test-code-card');
  if (await testCodeCard.isVisible()) {
    await testCodeCard.click();
    await page.waitForTimeout(3000);
  }

  console.log('Logged in. Navigating to /backoffice/institutions...');
  await page.goto(`http://localhost:${port}/backoffice/institutions`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const path = 'C:/Users/Ankit/.gemini/antigravity/brain/6ddcf0f0-d701-4e4b-82fa-929a3680e429/backoffice_tenants_sun_rice.png';
  await page.screenshot({ path, fullPage: true });
  console.log('Saved tenants screenshot to:', path);

  await browser.close();
})();
