const sharp = require('sharp');

async function run() {
  const items = ['sink_counter', 'kitchen_cabinet', 'sofa', 'tv_rack', 'armchair', 'vanity', 'dining_table'];
  const composites = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const col = i % 4;
    const row = Math.floor(i / 4);
    const buf = await sharp('public/assets/iso/furniture_' + it + '.png').toBuffer();
    const m = await sharp(buf).metadata();
    composites.push({
      input: buf,
      left: col * 260 + Math.floor((260 - m.width) / 2),
      top: row * 220 + Math.floor((220 - m.height) / 2)
    });
  }
  const labels = items.map((it, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    return `<text x="${col * 260 + 130}" y="${row * 220 + 210}" font-family="sans-serif" font-size="14" fill="#ffcc00" text-anchor="middle">${it}</text>`;
  }).join('\n');

  const svg = `<svg width="1040" height="440" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#222"/>
    ${labels}
  </svg>`;
  await sharp(Buffer.from(svg)).composite(composites).toFile('scripts/audit_results/inspect_facing.png');
  console.log('Saved inspect_facing.png');
}
run().catch(console.error);
