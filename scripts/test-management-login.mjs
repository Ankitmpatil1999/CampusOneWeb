import { chromium } from '@playwright/test';

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to http://localhost:4200/console/signin ...');
  await page.goto('http://localhost:4200/console/signin', { waitUntil: 'networkidle' });

  console.log('Filling email and password...');
  const emailInput = page.locator('input[type="email"], input[name="email"], input[autocomplete="email"], input[placeholder*="mail" i]').first();
  await emailInput.fill('chairman@tvps.example.in');

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill('Tvps@2026');

  console.log('Submitting...');
  const submitBtn = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Sign in")').first();
  await submitBtn.click();

  await page.waitForTimeout(2000);

  // Click email fallback button to get OTP and testCode card
  console.log('Clicking email fallback button...');
  const mailBtn = page.locator('button:has-text("Send the code to my e-mail")');
  if (await mailBtn.isVisible()) {
    await mailBtn.click();
    console.log('Email fallback clicked, waiting for test code card...');
    await page.waitForTimeout(1500);
  }

  // Click test code card
  const testCodeCard = page.locator('.cp-test-code-card');
  if (await testCodeCard.isVisible()) {
    console.log('Test code card is visible! Clicking it to auto-fill & verify...');
    await testCodeCard.click();
    await page.waitForTimeout(3000);
  } else {
    console.log('Test code card not visible. Current page text:', await page.locator('body').innerText());
  }

  console.log('URL after OTP step:', page.url());

  // Check if institution card appears
  const instChoice = page.locator('.cp-inst-card, button:has-text("Tunga Valley")');
  if (await instChoice.count() > 0 && await instChoice.first().isVisible()) {
    console.log('Selecting institution...');
    await instChoice.first().click();
    await page.waitForTimeout(3000);
  }

  console.log('Final URL:', page.url());
  await page.screenshot({
    path: 'C:/Users/Ankit/.gemini/antigravity/brain/6ddcf0f0-d701-4e4b-82fa-929a3680e429/web_management_dashboard.png',
    fullPage: true
  });
  console.log('Screenshot saved successfully!');
  await browser.close();
})().catch(console.error);
