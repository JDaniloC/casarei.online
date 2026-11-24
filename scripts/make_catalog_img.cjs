const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function makeGrid() {
  const items = [
    // Kitchen
    'fridge', 'dishwasher', 'stove', 'sink_counter', 'kitchen_cabinet',
    'microwave', 'coffee_maker', 'air_fryer', 'dining_table', 'dining_table_simple',
    // Bathroom
    'shower', 'bathroom_sink', 'toilet',
    // Bedroom
    'bed', 'wardrobe', 'dresser', 'vanity',
    // Laundry
    'washing_machine', 'dryer', 'laundry_sink',
    // Living room
    'tv_rack', 'sofa', 'coffee_table', 'armchair', 'robot_vacuum', 'generic'
  ];

  // We will create an image montage 5 columns x 6 rows
  // Each cell 200x200
  const cols = 5;
  const rows = Math.ceil(items.length / cols);
  const cellW = 200;
  const cellH = 200;
  const canvasW = cols * cellW;
  const canvasH = rows * cellH;

  const composites = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW;
    const y = row * cellH;

    const p = path.join('public', 'assets', 'iso', `furniture_${it}.png`);
    const imgBuf = fs.readFileSync(p);
    const m = await sharp(imgBuf).metadata();

    // Scale to fit inside 180x160 if larger, keeping pixel art intact if possible
    let processed = imgBuf;
    if (m.width > 180 || m.height > 160) {
      processed = await sharp(imgBuf).resize({ width: 180, height: 160, fit: 'inside' }).toBuffer();
    }
    const pm = await sharp(processed).metadata();

    const left = x + Math.floor((cellW - pm.width) / 2);
    const top = y + Math.floor((cellH - 30 - pm.height) / 2);

    composites.push({
      input: processed,
      left,
      top
    });
  }

  // Create background with labels
  const svgLabels = items.map((it, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW + cellW / 2;
    const y = row * cellH + cellH - 10;
    return `<text x="${x}" y="${y}" font-family="monospace" font-size="12" fill="#aaa" text-anchor="middle">${it}</text>
            <rect x="${col * cellW}" y="${row * cellH}" width="${cellW}" height="${cellH}" fill="none" stroke="#333" stroke-width="1"/>`;
  }).join('\n');

  const bgSvg = `<svg width="${canvasW}" height="${canvasH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#1a1a1a"/>
    ${svgLabels}
  </svg>`;

  await sharp(Buffer.from(bgSvg))
    .composite(composites)
    .toFile('scripts/audit_results/all_mobs_montage.png');

  console.log('Saved montage to scripts/audit_results/all_mobs_montage.png');
}

makeGrid().catch(console.error);
