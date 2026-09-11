const sharp = require('sharp');

async function group() {
  const items = ['wardrobe', 'dresser', 'tv_rack', 'sofa', 'washing_machine', 'toilet'];
  const composites = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const col = i % 3;
    const row = Math.floor(i / 3);
    const buf = await sharp('public/assets/iso/furniture_' + it + '.png').toBuffer();
    const m = await sharp(buf).metadata();
    composites.push({
      input: buf,
      left: col * 220 + Math.floor((220 - m.width) / 2),
      top: row * 220 + Math.floor((220 - m.height) / 2)
    });
  }
  const svg = '<svg width="660" height="440" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#222"/></svg>';
  await sharp(Buffer.from(svg)).composite(composites).toFile('scripts/audit_results/inspect_group.png');
  console.log('Saved inspect_group.png');
}
group().catch(console.error);
