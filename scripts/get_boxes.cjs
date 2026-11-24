const { chromium } = require('@playwright/test');
const sharp = require('sharp');

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:5173/demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const micro = page.locator('img[src*="furniture_microwave"]').first();
  const mBox = await micro.boundingBox();
  console.log('Microwave box:', mBox);

  const cab = page.locator('img[src*="furniture_kitchen_cabinet"]').first();
  const cBox = await cab.boundingBox();
  console.log('Cabinet box:', cBox);

  // Find house container
  const container = page.locator('.relative.overflow-hidden').first();
  await container.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // Take screenshot of container directly
  await container.screenshot({ path: 'scripts/audit_results/house_container.png' });
  console.log('House container screenshotted');

  // Microwave element screenshot
  await micro.screenshot({ path: 'scripts/audit_results/micro_elem.png' });
  console.log('Micro elem screenshotted');

  await browser.close();
}

run().catch(console.error);
