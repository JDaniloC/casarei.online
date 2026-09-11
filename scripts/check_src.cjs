const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/demo', { waitUntil: 'networkidle' });
  const sofa = page.locator('img[src*="furniture_sofa"]').first();
  console.log('Sofa src:', await sofa.getAttribute('src'));
  const box = await sofa.boundingBox();
  console.log('Sofa box:', box);
  await browser.close();
})();
