const { chromium } = require('@playwright/test');
const path = require('path');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto('http://localhost:5173/demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Find the virtual house furniture container
  const furn = page.locator('img[src*="furniture_bed"]').first();
  await furn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // Find the house container box
  const houseBox = await furn.evaluate(el => {
    const box = el.closest('.relative.overflow-hidden') || el.closest('.overflow-hidden') || el.parentElement.parentElement;
    const r = box.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });

  const outPath = process.argv[2] || path.join(__dirname, 'audit_results', 'playwright_demo.png');
  await page.screenshot({
    path: outPath,
    clip: {
      x: Math.max(0, houseBox.x - 20),
      y: Math.max(0, houseBox.y - 20),
      width: Math.min(1920, houseBox.width + 40),
      height: Math.min(1080, houseBox.height + 40)
    }
  });
  console.log('Saved snapshot to:', outPath);
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
