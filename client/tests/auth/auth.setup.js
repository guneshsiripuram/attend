const { test } = require('@playwright/test');

test('Authenticate Admin', async ({ page }) => {
  // Open login page
  await page.goto('http://localhost:5173/login');

  console.log('=========================================');
  console.log('LOGIN MANUALLY WITH GOOGLE');
  console.log('After reaching the Admin Dashboard,');
  console.log('come back to this terminal and press ENTER.');
  console.log('=========================================');

  // Wait until you manually finish login
  process.stdin.resume();

  await new Promise(resolve => {
    process.stdin.once('data', () => resolve());
  });

  // Save login session
  await page.context().storageState({
    path: 'playwright/.auth/admin.json',
  });
});