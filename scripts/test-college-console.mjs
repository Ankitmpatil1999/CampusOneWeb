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

  // Sign in as Dean (arvind.dean@gmail.com)
  const emailInput = page.locator('input[type="email"], input[name="email"], input[autocomplete="email"], input[placeholder*="mail" i]').first();
  await emailInput.fill('arvind.dean@gmail.com');

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill('Hello@123');

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

  // If institution card appears, select Nagpur Institute of Engineering
  const collegeChoice = page.locator('.cp-inst-card, button:has-text("Nagpur Institute"), div:has-text("Nagpur Institute")').first();
  if (await collegeChoice.isVisible()) {
    console.log('College choice visible, clicking...');
    await collegeChoice.click();
    await page.waitForTimeout(3000);
  }

  // 1. College Console Overview / Dashboard
  console.log('Taking College Console Overview screenshot...');
  const consoleScreenshot = 'C:\\Users\\Ankit\\.gemini\\antigravity\\brain\\6ddcf0f0-d701-4e4b-82fa-929a3680e429\\college_console_home.png';
  await page.screenshot({ path: consoleScreenshot, fullPage: true });

  // 2. Academics / Classes & subjects
  console.log('Navigating to Classes & subjects (/console/structure)...');
  await page.goto('http://localhost:4200/console/structure', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const classesScreenshot = 'C:\\Users\\Ankit\\.gemini\\antigravity\\brain\\6ddcf0f0-d701-4e4b-82fa-929a3680e429\\college_classes_degree_programs.png';
  await page.screenshot({ path: classesScreenshot, fullPage: true });

  // 3. Timetable
  console.log('Navigating to Timetable (/console/timetable)...');
  await page.goto('http://localhost:4200/console/timetable', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const timetableScreenshot = 'C:\\Users\\Ankit\\.gemini\\antigravity\\brain\\6ddcf0f0-d701-4e4b-82fa-929a3680e429\\college_timetable_lectures.png';
  await page.screenshot({ path: timetableScreenshot, fullPage: true });

  console.log('All college screenshots taken successfully!');
  await browser.close();
})();
