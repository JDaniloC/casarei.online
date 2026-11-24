const { chromium } = require('@playwright/test');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function testCandidate(positions, name) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:5173/demo', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Take screenshot
  const outDir = path.join(__dirname, 'audit_results');
  const snapPath = path.join(outDir, `${name}.png`);

  const furn = page.locator('img[src*="furniture_bed"]').first();
  await furn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  const houseBox = await furn.evaluate(el => {
    const box = el.closest('.relative.overflow-hidden') || el.closest('.overflow-hidden') || el.parentElement.parentElement;
    const r = box.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });

  await page.screenshot({
    path: snapPath,
    clip: {
      x: Math.max(0, houseBox.x - 20),
      y: Math.max(0, houseBox.y - 20),
      width: Math.min(1920, houseBox.width + 40),
      height: Math.min(1080, houseBox.height + 40)
    }
  });

  console.log(`Saved ${snapPath}`);

  // Room crops
  await sharp(snapPath)
    .extract({ left: 420, top: 100, width: 480, height: 420 })
    .toFile(path.join(outDir, `${name}_kitchen.png`));

  await sharp(snapPath)
    .extract({ left: 520, top: 220, width: 480, height: 440 })
    .toFile(path.join(outDir, `${name}_bedroom.png`));

  await sharp(snapPath)
    .extract({ left: 150, top: 320, width: 700, height: 440 })
    .toFile(path.join(outDir, `${name}_living.png`));

  await sharp(snapPath)
    .extract({ left: 20, top: 220, width: 380, height: 380 })
    .toFile(path.join(outDir, `${name}_laundry.png`));

  await sharp(snapPath)
    .extract({ left: 400, top: 120, width: 350, height: 350 })
    .toFile(path.join(outDir, `${name}_bathroom.png`));

  await browser.close();
}

testCandidate(null, process.argv[2] || 'layout_test').catch(console.error);
