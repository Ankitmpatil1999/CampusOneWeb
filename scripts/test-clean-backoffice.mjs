import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const page = await browser.newPage();
  const port = process.env.PORT || '50651';
  console.log(`Navigating to http://localhost:${port}/signin ...`);
  await page.goto(`http://localhost:${port}/signin`, { waitUntil: 'networkidle' });

  await page.locator('#cp-au-email').fill('aryapatil963@gmail.com');
  await page.locator('#cp-au-pw').fill('Ankit@1999');
  await page.locator('#cp-au-go').click();
  await page.waitForTimeout(2000);

  const mailBtn = page.locator('button:has-text("Send the code to my e-mail")');
  if (await mailBtn.isVisible()) {
    console.log('Clicking mail fallback...');
    await mailBtn.click();
    await page.waitForTimeout(1500);
  }

  const testCodeCard = page.locator('.cp-test-code-card');
  if (await testCodeCard.isVisible()) {
    console.log('Clicking OTP test code...');
    await testCodeCard.click();
    await page.waitForTimeout(3000);
  }

  console.log('Final URL reached:', page.url());
  const path = 'C:/Users/Ankit/.gemini/antigravity/brain/6ddcf0f0-d701-4e4b-82fa-929a3680e429/fresh_clean_backoffice.png';
  await page.screenshot({ path, fullPage: true });
  console.log('Saved screenshot to:', path);
  await browser.close();
})();

