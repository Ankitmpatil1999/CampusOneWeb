import { chromium } from '@playwright/test';

async function testLogin(email, password, expectedUrlPrefix, screenshotName) {
  console.log(`\n========================================`);
  console.log(`Testing Login for: ${email}`);
  console.log(`========================================`);

  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const port = process.env.PORT || '50651';
  console.log(`Navigating to http://localhost:${port}/signin ...`);
  await page.goto(`http://localhost:${port}/signin`, { waitUntil: 'networkidle' });

  // Verify unified login UI elements
  console.log('Current URL:', page.url());
  const pageTitle = await page.title();
  console.log('Page Title:', pageTitle);

  // Fill credentials
  const emailInput = page.locator('#cp-au-email');
  await emailInput.fill(email);

  const passwordInput = page.locator('#cp-au-pw');
  await passwordInput.fill(password);

  console.log('Submitting credentials...');
  const submitBtn = page.locator('#cp-au-go');
  await submitBtn.click();

  await page.waitForTimeout(2000);

  // Check for email fallback button if SMS OTP didn't return testCode
  const mailBtn = page.locator('button:has-text("Send the code to my e-mail")');
  if (await mailBtn.isVisible()) {
    console.log('Email fallback button visible, clicking...');
    await mailBtn.click();
    await page.waitForTimeout(1500);
  }

  // Click test code card to auto-fill & verify
  const testCodeCard = page.locator('.cp-test-code-card');
  if (await testCodeCard.isVisible()) {
    console.log('Test code card found! Auto-filling OTP...');
    await testCodeCard.click();
    await page.waitForTimeout(3000);
  } else {
    // If not visible, check for demo hint
    const demoHint = page.locator('.demo-hint b');
    if (await demoHint.isVisible()) {
      const code = (await demoHint.innerText()).trim();
      console.log('Found OTP code in demo hint:', code);
      const inputs = page.locator('.cp-otp input');
      for (let i = 0; i < code.length; i++) {
        await inputs.nth(i).fill(code[i]);
      }
      await page.locator('#cp-au-verify').click();
      await page.waitForTimeout(3000);
    } else {
      console.log('No test code card or demo hint found.');
    }
  }

  console.log('URL after OTP:', page.url());

  // Check if institution selector is shown
  const instChoice = page.locator('.cp-inst-card, button:has-text("Tunga Valley")');
  if (await instChoice.count() > 0 && await instChoice.first().isVisible()) {
    console.log('Selecting institution...');
    await instChoice.first().click();
    await page.waitForTimeout(3000);
  }

  const finalUrl = page.url();
  console.log('Final URL reached:', finalUrl);

  const screenshotPath = `C:/Users/Ankit/.gemini/antigravity/brain/6ddcf0f0-d701-4e4b-82fa-929a3680e429/${screenshotName}`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Saved screenshot to: ${screenshotPath}`);

  await browser.close();

  if (finalUrl.includes(expectedUrlPrefix)) {
    console.log(`SUCCESS: Successfully navigated to ${expectedUrlPrefix} for ${email}`);
    return true;
  } else {
    console.error(`FAILED: Expected ${expectedUrlPrefix} but got ${finalUrl}`);
    return false;
  }
}

(async () => {
  // Test 1: Management Login -> should reach /console
  const ok1 = await testLogin('chairman@tvps.example.in', 'Tvps@2026', '/console', 'unified_management_dashboard.png');

  // Test 2: Super Admin Login -> should reach /backoffice
  const ok2 = await testLogin('arjun@campusone.example', 'CampusOne@2026', '/backoffice', 'unified_superadmin_dashboard.png');

  console.log('\n========================================');
  console.log(`Summary: Management: ${ok1 ? 'PASSED' : 'FAILED'}, SuperAdmin: ${ok2 ? 'PASSED' : 'FAILED'}`);
  console.log('========================================');
})();

