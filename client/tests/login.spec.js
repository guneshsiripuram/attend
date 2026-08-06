const { test, expect } = require('@playwright/test');

test('Admin Login', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Replace these selectors with your actual ones
  await page.fill('input[type="email"]', 'admin@gmail.com');
  await page.fill('input[type="password"]', '123456');

  await page.click('button[type="submit"]');

  await expect(page).toHaveURL(/dashboard/);
});