const { chromium } = require('@playwright/test');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const config1 = {
  name: 'config_1',
  description: 'Kitchen: Fridge(0,0), Dishwasher(1,0), Stove(2,0). Island: Cabinet(2,1)+Micro(3,1). Sink: (0,2)+Coffee(0,2)+Airfryer(1,2). Table: (1,3)...',
};

// Let's test a script that updates PublicVirtualHouse.tsx and isometric.ts with a given dictionary,
// captures the screenshot, and restores.
async function capture(name) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://localhost:5173/demo?preview=' + name + '&t=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const furn = page.locator('img[src*="furniture_bed"]').first();
  await furn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  const houseBox = await furn.evaluate(el => {
    const box = el.closest('.relative.overflow-hidden') || el.closest('.overflow-hidden') || el.parentElement.parentElement;
    const r = box.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });

  const snapPath = path.join(__dirname, 'audit_results', `${name}.png`);
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
  await browser.close();
}
