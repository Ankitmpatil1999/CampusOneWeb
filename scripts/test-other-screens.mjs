import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  await page.goto('http://localhost:4200/signin', { waitUntil: 'networkidle' });

  const emailInput = page.locator('input[type="email"], input[name="email"], input[autocomplete="email"], input[placeholder*="mail" i]').first();
  await emailInput.fill('geeta@gmail.com');

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill('Hello@123');

  const submitBtn = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Sign in")').first();
  await submitBtn.click();
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

  const instCard = page.locator('.cp-inst-card, button:has-text("Sun Rice"), div:has-text("Sun Rice")').first();
  if (await instCard.isVisible()) {
    await instCard.click();
    await page.waitForTimeout(3000);
  }

  // 1. Dashboard
  await page.goto('http://localhost:4200/console/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:\\Users\\Ankit\\.gemini\\antigravity\\brain\\6ddcf0f0-d701-4e4b-82fa-929a3680e429\\sunrice_dashboard_light.png', fullPage: true });

  // 2. Transport
  await page.goto('http://localhost:4200/console/transport', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:\\Users\\Ankit\\.gemini\\antigravity\\brain\\6ddcf0f0-d701-4e4b-82fa-929a3680e429\\sunrice_transport_light.png', fullPage: true });

  console.log('Screenshots saved!');
  await browser.close();
})();

