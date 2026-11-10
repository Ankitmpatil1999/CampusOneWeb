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

  // Sign in as Platform Operator (aryapatil963@gmail.com)
  const emailInput = page.locator('input[type="email"], input[name="email"], input[autocomplete="email"], input[placeholder*="mail" i]').first();
  await emailInput.fill('aryapatil963@gmail.com');

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill('Ankit@1999');

  const submitBtn = page.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Sign in")').first();
  await submitBtn.click();
  await page.waitForTimeout(2000);

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
  }

  console.log('Current URL after OTP:', page.url());

  // Navigate to Backoffice Institutions
  await page.goto('http://localhost:4200/backoffice/institutions', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Click Register Institution button
  console.log('Clicking Register institution...');
  const regBtn = page.locator('button:has-text("Register institution")').first();
  await regBtn.click();
  await page.waitForTimeout(1000);

  // Take screenshot of Modal with School selected initially
  const modalScreenshotPath = 'C:\\Users\\Ankit\\.gemini\\antigravity\\brain\\6ddcf0f0-d701-4e4b-82fa-929a3680e429\\onboarding_modal_type_selector.png';
  await page.screenshot({ path: modalScreenshotPath, fullPage: true });
  console.log('Modal initial screenshot saved!');

  // Now click Degree College / University card
  console.log('Selecting Degree College / University...');
  const collegeCard = page.locator('.inst-type-card:has-text("Degree College")').first();
  await collegeCard.click();
  await page.waitForTimeout(1000);

  // Take screenshot showing College selected and dynamic University / Affiliation dropdown
  const collegeModalScreenshotPath = 'C:\\Users\\Ankit\\.gemini\\antigravity\\brain\\6ddcf0f0-d701-4e4b-82fa-929a3680e429\\onboarding_modal_college_selected.png';
  await page.screenshot({ path: collegeModalScreenshotPath, fullPage: true });
  console.log('College selected screenshot saved!');

  // Fill College Details
  console.log('Filling College Details...');
  await page.locator('#ob-n-name').fill('Nagpur Institute of Engineering & Technology');
  await page.locator('#ob-n-addr').fill('Wardha Road, Outer Ring Road Junction, Khapri');
  await page.locator('#ob-n-city').fill('Nagpur');
  await page.locator('#ob-n-board').selectOption({ label: 'State University' });

  // Primary contact (Dean)
  await page.locator('#ob-n-pn').fill('Dr. Arvind Sharma');
  await page.locator('#ob-n-pe').fill('arvind.dean@gmail.com');
  await page.locator('#ob-n-pp').fill('9822991001');

  // Administrator email
  await page.locator('#ob-n-adm').fill('arvind.dean@gmail.com');

  // Take screenshot before submitting
  const readyScreenshotPath = 'C:\\Users\\Ankit\\.gemini\\antigravity\\brain\\6ddcf0f0-d701-4e4b-82fa-929a3680e429\\onboarding_modal_college_filled.png';
  await page.screenshot({ path: readyScreenshotPath, fullPage: true });

  // Submit registration!
  console.log('Submitting College registration...');
  const submitRegBtn = page.locator('button.btn-pri:has-text("Register institution")').last();
  await submitRegBtn.click();
  await page.waitForTimeout(3000);

  // Dismiss temporary password panel if visible
  const confirmPwBtn = page.locator('button:has-text("I’ve noted the temporary password"), button:has-text("I have noted")').first();
  if (await confirmPwBtn.isVisible()) {
    console.log('Confirming noted password...');
    await confirmPwBtn.click();
    await page.waitForTimeout(2000);
  }

  // Take screenshot of institutions table showing the new college with badge!
  const listScreenshotPath = 'C:\\Users\\Ankit\\.gemini\\antigravity\\brain\\6ddcf0f0-d701-4e4b-82fa-929a3680e429\\backoffice_institutions_with_college.png';
  await page.screenshot({ path: listScreenshotPath, fullPage: true });
  console.log('All done! Final list screenshot saved.');

  await browser.close();
})();
