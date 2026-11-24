import sharp from 'sharp';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Directory setup
const OUT_DIR = path.resolve('public/assets/iso');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// Commit 36a3744 contains the authentic pixel art sprites
function getCommitAsset(filename) {
  return execSync(`git show 36a3744:public/assets/iso/${filename}`);
}

// 1px outline applicator on raw pixel buffer
function applyOutline(data, width, height, outlineColor = [30, 35, 42]) {
  const result = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] === 0) {
        // check 4-neighbors
        let hasOpaqueNeighbor = false;
        if (x > 0 && data[idx - 4 + 3] > 180) hasOpaqueNeighbor = true;
        else if (x < width - 1 && data[idx + 4 + 3] > 180) hasOpaqueNeighbor = true;
        else if (y > 0 && data[((y - 1) * width + x) * 4 + 3] > 180) hasOpaqueNeighbor = true;
        else if (y < height - 1 && data[((y + 1) * width + x) * 4 + 3] > 180) hasOpaqueNeighbor = true;

        if (hasOpaqueNeighbor) {
          result[idx] = outlineColor[0];
          result[idx + 1] = outlineColor[1];
          result[idx + 2] = outlineColor[2];
          result[idx + 3] = 255;
        }
      }
    }
  }
  return result;
}

// Factor to normalize 30-deg isometric to 2:1 dimetric axonometry
// tan(26.565) / tan(30) = sqrt(3)/2 ~= 0.8660
const DIMETRIC_FACTOR = Math.sqrt(3) / 2;

async function processStandardPixelItem(filename, targetW, targetH, options = {}) {
  const rawBuf = getCommitAsset(filename);
  const meta = await sharp(rawBuf).metadata();
  
  // Normalized height under 2:1 dimetric projection
  const normH = Math.round(meta.height * DIMETRIC_FACTOR);
  
  // Resize with nearest-neighbor to retain authentic pixel art stepping
  let resized = await sharp(rawBuf)
    .resize(meta.width, normH, { kernel: sharp.kernel.nearest })
    .toBuffer();

  // If options specify custom floor shadow removal
  if (options.cleanFloorShadow) {
    const { data, info } = await sharp(resized).raw().toBuffer({ resolveWithObject: true });
    // Strip black floor shadow in bottom 10 rows
    for (let y = info.height - 12; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const idx = (y * info.width + x) * 4;
        const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
        // floor shadow pixels are near-black with low saturation and not part of wooden foot
        if (a > 0 && r < 45 && g < 45 && b < 45 && Math.abs(r - g) < 10 && Math.abs(g - b) < 10) {
          // keep feet (wood feet have r > 55 or distinct tint)
          if (r < 35 && g < 35 && b < 35) {
            data[idx + 3] = 0;
          }
        }
      }
    }
    resized = await sharp(data, { raw: info }).png().toBuffer();
  }

  // Anchor inside target canvas with bottom alignment
  const resizedMeta = await sharp(resized).metadata();
  const topPad = Math.max(0, targetH - resizedMeta.height);
  const leftPad = Math.max(0, Math.floor((targetW - resizedMeta.width) / 2));

  // Create clean canvas
  const canvas = await sharp({
    create: {
      width: targetW,
      height: targetH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite([
    { input: resized, left: leftPad, top: topPad }
  ]).png().toBuffer();

  // Reinforce 1px outline
  const { data: canvasData, info: canvasInfo } = await sharp(canvas).raw().toBuffer({ resolveWithObject: true });
  const outlined = applyOutline(canvasData, canvasInfo.width, canvasInfo.height, options.outlineColor || [30, 35, 42]);
  
  const finalPng = await sharp(outlined, { raw: canvasInfo }).png().toBuffer();
  fs.writeFileSync(path.join(OUT_DIR, filename), finalPng);
  console.log(`Rendered ${filename}: ${targetW}x${targetH}`);
}

// 1. Sofa (Strict straight 3-seater linear model 2x1)
async function renderSofa() {
  await processStandardPixelItem('furniture_sofa.png', 192, 128, {
    cleanFloorShadow: true,
    outlineColor: [35, 38, 45]
  });
}

// 2. Armchair (1x1)
async function renderArmchair() {
  await processStandardPixelItem('furniture_armchair.png', 128, 128, {
    cleanFloorShadow: true,
    outlineColor: [35, 38, 45]
  });
}

// 3. Bed (2x2)
async function renderBed() {
  await processStandardPixelItem('furniture_bed.png', 256, 192, {
    cleanFloorShadow: true,
    outlineColor: [45, 32, 25]
  });
}

// 4. Dining Table (2x2)
async function renderDiningTable() {
  await processStandardPixelItem('furniture_dining_table.png', 256, 192, {
    cleanFloorShadow: true,
    outlineColor: [50, 35, 25]
  });
}

// 5. Coffee Table (1x1)
async function renderCoffeeTable() {
  await processStandardPixelItem('furniture_coffee_table.png', 128, 80, {
    cleanFloorShadow: true,
    outlineColor: [45, 35, 25]
  });
}

// 6. TV Rack (2x1)
async function renderTvRack() {
  await processStandardPixelItem('furniture_tv_rack.png', 192, 160, {
    cleanFloorShadow: true,
    outlineColor: [40, 30, 25]
  });
}

// 7. Wardrobe (2x1)
async function renderWardrobe() {
  await processStandardPixelItem('furniture_wardrobe.png', 192, 160, {
    cleanFloorShadow: true,
    outlineColor: [45, 30, 25]
  });
}

// 8. Dresser (2x1)
async function renderDresser() {
  await processStandardPixelItem('furniture_dresser.png', 192, 128, {
    cleanFloorShadow: true,
    outlineColor: [45, 30, 25]
  });
}

// 9. Vanity (1x1)
async function renderVanity() {
  await processStandardPixelItem('furniture_vanity.png', 128, 128, {
    cleanFloorShadow: true,
    outlineColor: [45, 35, 25]
  });
}

// 10. Fridge (1x1)
async function renderFridge() {
  await processStandardPixelItem('furniture_fridge.png', 128, 160, {
    cleanFloorShadow: true,
    outlineColor: [32, 36, 42]
  });
}

// 11. Stove (1x1)
async function renderStove() {
  await processStandardPixelItem('furniture_stove.png', 128, 128, {
    cleanFloorShadow: true,
    outlineColor: [32, 36, 42]
  });
}

// 12. Dishwasher (1x1)
async function renderDishwasher() {
  await processStandardPixelItem('furniture_dishwasher.png', 128, 128, {
    cleanFloorShadow: true,
    outlineColor: [32, 36, 42]
  });
}

// 13. Kitchen Cabinet (2x1)
async function renderKitchenCabinet() {
  await processStandardPixelItem('furniture_kitchen_cabinet.png', 192, 128, {
    cleanFloorShadow: true,
    outlineColor: [45, 35, 25]
  });
}

// 14. Sink Counter (2x1)
async function renderSinkCounter() {
  await processStandardPixelItem('furniture_sink_counter.png', 192, 128, {
    cleanFloorShadow: true,
    outlineColor: [45, 35, 25]
  });
}

// 15. Washing Machine (1x1)
async function renderWashingMachine() {
  await processStandardPixelItem('furniture_washing_machine.png', 128, 128, {
    cleanFloorShadow: true,
    outlineColor: [32, 36, 42]
  });
}

// 16. Dryer (1x1)
async function renderDryer() {
  await processStandardPixelItem('furniture_dryer.png', 128, 128, {
    cleanFloorShadow: true,
    outlineColor: [32, 36, 42]
  });
}

// 17. Laundry Sink (1x1)
async function renderLaundrySink() {
  await processStandardPixelItem('furniture_laundry_sink.png', 128, 128, {
    cleanFloorShadow: true,
    outlineColor: [32, 36, 42]
  });
}

// 18. Bathroom Sink (1x1)
async function renderBathroomSink() {
  await processStandardPixelItem('furniture_bathroom_sink.png', 128, 128, {
    cleanFloorShadow: true,
    outlineColor: [32, 36, 42]
  });
}

// 19. Toilet (1x1)
async function renderToilet() {
  await processStandardPixelItem('furniture_toilet.png', 128, 128, {
    cleanFloorShadow: true,
    outlineColor: [32, 36, 42]
  });
}

// 20. Microwave (Isolated compact countertop appliance, 72x54)
async function renderMicrowave() {
  const rawBuf = getCommitAsset('furniture_microwave.png');
  const { data, info } = await sharp(rawBuf).raw().toBuffer({ resolveWithObject: true });
  
  // Remove wooden support table
  for (let y = 30; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * 4;
      const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
      if (a === 0) continue;
      // Wood table is brown
      const isWood = (r > 35 && g < 60 && b < 50 && r > b + 8) || (y > 68 && (r < 35 && g < 35 && b < 35));
      if (isWood) {
        data[idx + 3] = 0;
      }
    }
  }
  
  // Clear any residual pixels below the cut in each column
  for (let x = 0; x < info.width; x++) {
    let foundWood = false;
    for (let y = 30; y < info.height; y++) {
      const idx = (y * info.width + x) * 4;
      if (data[idx + 3] === 0 && y > 45) foundWood = true;
      if (foundWood) data[idx + 3] = 0;
    }
  }

  // Clear bottom-right stray fringe
  for (let y = 50; y < info.height; y++) {
    for (let x = 100; x < info.width; x++) {
      const idx = (y * info.width + x) * 4;
      if (data[idx + 3] > 0 && data[idx] > data[idx+2] + 10) {
        data[idx + 3] = 0;
      }
    }
  }
  
  // Resize to 72px wide with dimetric 2:1 ratio
  const normH = Math.round(info.height * DIMETRIC_FACTOR * (72 / info.width));
  const resized = await sharp(data, { raw: info })
    .resize(72, normH, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();

  // Anchor inside 72x54 canvas with bottom alignment
  const resizedMeta = await sharp(resized).metadata();
  const topPad = Math.max(0, 54 - resizedMeta.height);
  const canvas = await sharp({
    create: {
      width: 72,
      height: 54,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite([
    { input: resized, left: 0, top: topPad }
  ]).png().toBuffer();

  const { data: canvasData, info: canvasInfo } = await sharp(canvas).raw().toBuffer({ resolveWithObject: true });
  const outlined = applyOutline(canvasData, canvasInfo.width, canvasInfo.height, [32, 36, 42]);
  const finalPng = await sharp(outlined, { raw: canvasInfo }).png().toBuffer();
  fs.writeFileSync(path.join(OUT_DIR, 'furniture_microwave.png'), finalPng);
  console.log(`Rendered furniture_microwave.png: 72x54`);
}

// 21. Shower (1x2 with fully transparent floor)
async function renderShower() {
  const rawBuf = getCommitAsset('furniture_shower.png');
  const { data, info } = await sharp(rawBuf).raw().toBuffer({ resolveWithObject: true });
  
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * 4;
      const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];
      if (a === 0) continue;

      const isShowerHead = x >= 46 && x <= 95 && y <= 75;
      const isDrain = x >= 90 && x <= 102 && y >= 122 && y <= 129 && Math.abs(r - g) < 10;
      const isPost = (x <= 7) || (x >= 45 && x <= 53) || (x >= 92 && x <= 98) || (x >= 101 && x <= 107) || (x >= 185);
      const isTopRail = y <= 25 || (y >= 52 && y <= 60);
      const isBottomRail = (y >= info.height - 4) || (y >= 105 && Math.abs(y - (110 + 0.48 * x)) < 4) || (y >= 112 && Math.abs(y - (160 - 0.48 * (x - 104))) < 4);

      const isRealFrame = isShowerHead || isDrain || isPost || isTopRail || isBottomRail;

      if (!isRealFrame) {
        if (y < 75 && r > 180 && g > 200 && b > 210) {
          data[idx + 3] = 70; // translucent glass
        } else {
          data[idx + 3] = 0; // crystal clear transparent floor!
        }
      }
    }
  }

  const normH = Math.round(info.height * DIMETRIC_FACTOR); // ~139px
  const resized = await sharp(data, { raw: info })
    .resize(192, normH, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();

  const topPad = Math.max(0, 160 - normH);
  const canvas = await sharp({
    create: {
      width: 192,
      height: 160,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite([
    { input: resized, left: 0, top: topPad }
  ]).png().toBuffer();

  const { data: canvasData, info: canvasInfo } = await sharp(canvas).raw().toBuffer({ resolveWithObject: true });
  const outlined = applyOutline(canvasData, canvasInfo.width, canvasInfo.height, [35, 40, 48]);
  const finalPng = await sharp(outlined, { raw: canvasInfo }).png().toBuffer();
  fs.writeFileSync(path.join(OUT_DIR, 'furniture_shower.png'), finalPng);
  console.log(`Rendered furniture_shower.png: 192x160 (Transparent floor)`);
}

// 22. Generic (Cozy Pixel Art Gift Box, 128x128)
async function renderGeneric() {
  const giftSvg = `
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
  <!-- Left Face -->
  <polygon points="32,64 64,80 64,116 32,100" fill="#d9664f" stroke="#23262d" stroke-width="1"/>
  <!-- Left Ribbon -->
  <polygon points="46,71 50,73 50,109 46,107" fill="#e4b95f"/>

  <!-- Right Face -->
  <polygon points="64,80 96,64 96,100 64,116" fill="#b54a38" stroke="#23262d" stroke-width="1"/>
  <!-- Right Ribbon -->
  <polygon points="78,73 82,71 82,107 78,109" fill="#c4963e"/>

  <!-- Top Face -->
  <polygon points="64,48 96,64 64,80 32,64" fill="#ee8e72" stroke="#23262d" stroke-width="1"/>
  <!-- Top Ribbons -->
  <polygon points="46,55 50,57 82,73 78,71" fill="#f6d285"/>
  <polygon points="82,57 78,55 46,71 50,73" fill="#f6d285"/>

  <!-- Bow Knot on Top -->
  <!-- Left Bow Loop -->
  <polygon points="64,48 54,40 50,44 60,49" fill="#f6d285" stroke="#23262d" stroke-width="1"/>
  <!-- Right Bow Loop -->
  <polygon points="64,48 74,40 78,44 68,49" fill="#e4b95f" stroke="#23262d" stroke-width="1"/>
  <!-- Center Knot -->
  <circle cx="64" cy="48" r="3.5" fill="#f6d285" stroke="#23262d" stroke-width="1" shape-rendering="geometricPrecision"/>
</svg>
`;
  await sharp(Buffer.from(giftSvg)).png().toFile(path.join(OUT_DIR, 'furniture_generic.png'));
  console.log(`Rendered furniture_generic.png: 128x128`);
}

// 23. Pixel Art Compact Appliances (Coffee Maker, Air Fryer, Robot Vacuum)
async function renderCompactAppliances() {
  const coffeeMakerSvg = `
<svg width="64" height="56" viewBox="0 0 64 56" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
  <!-- Drip Tray Base (Chrome) -->
  <polygon points="18,42 32,49 46,42 46,45 32,52 18,45" fill="#95a5a6" stroke="#23262d" stroke-width="1"/>
  <!-- Drip Tray Grille Top -->
  <polygon points="18,42 32,49 46,42 32,35" fill="#7f8c8d" stroke="#23262d" stroke-width="1"/>
  <!-- Grille slots -->
  <line x1="24" y1="42" x2="40" y2="42" stroke="#2c3e50" stroke-width="1"/>
  <line x1="28" y1="45" x2="36" y2="45" stroke="#2c3e50" stroke-width="1"/>

  <!-- Main Body Column -->
  <!-- Left Face (Highlight Red) -->
  <polygon points="20,18 32,24 32,44 20,38" fill="#e74c3c" stroke="#23262d" stroke-width="1"/>
  <!-- Right Face (Shadow Red) -->
  <polygon points="32,24 44,18 44,38 32,44" fill="#c0392b" stroke="#23262d" stroke-width="1"/>
  <!-- Top Face (Cup Warmer) -->
  <polygon points="32,12 44,18 32,24 20,18" fill="#bdc3c7" stroke="#23262d" stroke-width="1"/>

  <!-- Control Fascia Panel -->
  <polygon points="24,25 32,29 40,25 40,32 32,36 24,32" fill="#2c3e50" stroke="#1a252f" stroke-width="1"/>
  <!-- Chrome Pressure Gauge -->
  <circle cx="32" cy="29" r="2.5" fill="#ecf0f1" stroke="#1a252f" stroke-width="1" shape-rendering="geometricPrecision"/>
  <circle cx="32" cy="29" r="0.8" fill="#e74c3c" shape-rendering="geometricPrecision"/>

  <!-- Filter Portafilter & Handle -->
  <polygon points="28,34 36,34 34,36 30,36" fill="#7f8c8d" stroke="#23262d" stroke-width="1"/>
  <line x1="28" y1="35" x2="18" y2="40" stroke="#1a252f" stroke-width="2"/>

  <!-- Little White Espresso Cup -->
  <polygon points="28,41 36,41 35,46 29,46" fill="#ffffff" stroke="#23262d" stroke-width="1"/>
  <polygon points="29,41 35,41 34,42 30,42" fill="#795548"/>
</svg>
`;

  const airFryerSvg = `
<svg width="64" height="56" viewBox="0 0 64 56" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
  <!-- Body Base & Faces -->
  <polygon points="18,22 32,29 32,48 18,41" fill="#34495e" stroke="#1a252f" stroke-width="1"/>
  <polygon points="32,29 46,22 46,41 32,48" fill="#2c3e50" stroke="#1a252f" stroke-width="1"/>
  <polygon points="32,15 46,22 32,29 18,22" fill="#4a627a" stroke="#1a252f" stroke-width="1"/>

  <!-- Digital Display Panel on Top Front -->
  <polygon points="24,20 32,24 40,20 32,16" fill="#11151c" stroke="#1a252f" stroke-width="1"/>
  <rect x="29" y="19" width="6" height="2" fill="#00d2d3"/>

  <!-- Chrome Trim Band -->
  <polygon points="18,29 32,36 46,29 46,31 32,38 18,31" fill="#bdc3c7" stroke="#1a252f" stroke-width="1"/>

  <!-- Basket Drawer Seam -->
  <polygon points="20,33 32,39 44,33 44,45 32,51 20,45" fill="#243342" stroke="#1a252f" stroke-width="1"/>
  <!-- Handle -->
  <polygon points="30,38 34,38 34,45 30,45" fill="#bdc3c7" stroke="#1a252f" stroke-width="1"/>
  <rect x="31" y="40" width="2" height="3" fill="#11151c"/>
</svg>
`;

  const robotVacuumSvg = `
<svg width="64" height="40" viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
  <!-- 2:1 Isometric Cylinder Body -->
  <path d="M 12,20 L 12,24 C 12,31 52,31 52,24 L 52,20 Z" fill="#1a1c20" stroke="#0d0e10" stroke-width="1"/>
  <ellipse cx="32" cy="20" rx="20" ry="10" fill="#343a40" stroke="#121416" stroke-width="1" shape-rendering="geometricPrecision"/>
  <ellipse cx="32" cy="20" rx="16" ry="8" fill="none" stroke="#f1c40f" stroke-width="1" shape-rendering="geometricPrecision"/>

  <!-- LiDAR Turret in Center -->
  <ellipse cx="32" cy="15" rx="5" ry="2.5" fill="#212529" stroke="#121416" stroke-width="1" shape-rendering="geometricPrecision"/>
  <path d="M 27,15 L 27,17 C 27,19 37,19 37,17 L 37,15 Z" fill="#121416"/>
  <circle cx="32" cy="15" r="1" fill="#e74c3c" shape-rendering="geometricPrecision"/>
  <circle cx="32" cy="23" r="1.2" fill="#2ecc71" shape-rendering="geometricPrecision"/>
</svg>
`;

  await Promise.all([
    sharp(Buffer.from(coffeeMakerSvg)).png().toFile(path.join(OUT_DIR, 'furniture_coffee_maker.png')),
    sharp(Buffer.from(airFryerSvg)).png().toFile(path.join(OUT_DIR, 'furniture_air_fryer.png')),
    sharp(Buffer.from(robotVacuumSvg)).png().toFile(path.join(OUT_DIR, 'furniture_robot_vacuum.png'))
  ]);
  console.log('Rendered compact pixel appliances: coffee_maker, air_fryer, robot_vacuum');
}

async function run() {
  console.log('--- Starting Clean Cozy Pixel Art Asset Generation ---');
  await renderSofa();
  await renderArmchair();
  await renderBed();
  await renderDiningTable();
  await renderCoffeeTable();
  await renderTvRack();
  await renderWardrobe();
  await renderDresser();
  await renderVanity();
  await renderFridge();
  await renderStove();
  await renderDishwasher();
  await renderKitchenCabinet();
  await renderSinkCounter();
  await renderWashingMachine();
  await renderDryer();
  await renderLaundrySink();
  await renderBathroomSink();
  await renderToilet();
  await renderMicrowave();
  await renderShower();
  await renderGeneric();
  await renderCompactAppliances();
  console.log('--- All 24 Clean Cozy Pixel Art Assets Generated Successfully! ---');
}

run().catch(err => {
  console.error('Fatal error during generation:', err);
  process.exit(1);
});
