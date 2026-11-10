import { chromium } from '@playwright/test';

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:4200/signin ...');
  await page.goto('http://localhost:4200/signin', { waitUntil: 'networkidle' });

  console.log('Filling email and password...');
  const emailInput = page.locator('input[type="email"], input[name="email"], input[autocomplete="email"], input[placeholder*="mail" i]').first();
  await emailInput.fill('geeta@gmail.com');

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill('Hello@123');

  console.log('Submitting credentials...');
  const submitBtn = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Sign in")').first();
  await submitBtn.click();

  await page.waitForTimeout(2000);

  // Check if OTP test code card appears or email fallback button
  const mailBtn = page.locator('button:has-text("Send the code to my e-mail")');
  if (await mailBtn.isVisible()) {
    console.log('Clicking email fallback button...');
    await mailBtn.click();
    await page.waitForTimeout(1500);
  }

  const testCodeCard = page.locator('.cp-test-code-card');
  if (await testCodeCard.isVisible()) {
    console.log('Test code card is visible! Clicking it...');
    await testCodeCard.click();
    await page.waitForTimeout(3000);
  } else {
    console.log('Test code card not visible. Current page text:', await page.locator('body').innerText());
  }

  console.log('Current URL after OTP:', page.url());

  // If institution selector appears
  const instCard = page.locator('.cp-inst-card, button:has-text("Sun Rice"), div:has-text("Sun Rice")').first();
  if (await instCard.isVisible()) {
    console.log('Found Sun Rice institution choice, clicking...');
    await instCard.click();
    await page.waitForTimeout(3000);
  }

  console.log('Navigating directly to http://localhost:4200/console/assets ...');
  await page.goto('http://localhost:4200/console/assets', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const screenshotPath = 'C:\\Users\\Ankit\\.gemini\\antigravity\\brain\\6ddcf0f0-d701-4e4b-82fa-929a3680e429\\sunrice_assets_light.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);

  await browser.close();
})();

