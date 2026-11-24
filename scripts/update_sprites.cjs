const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function applyAssetUpdates() {
  // 1. Microwave SW
  const makeMicro = require('./make_microwave.cjs');
  // In make_microwave.cjs, makeMicrowaveSvg('SW') produces the exact 2:1 South-West microwave
  const microCode = fs.readFileSync('scripts/make_microwave.cjs', 'utf-8');
  // Extract makeMicrowaveSvg function
  eval(microCode.replace(/async function main[\s\S]*$/, ''));
  const swSvg = makeMicrowaveSvg('SW');
  const swPng = await sharp(Buffer.from(swSvg)).png().toBuffer();
  fs.writeFileSync('public/assets/iso/furniture_microwave.png', swPng);
  console.log('Updated public/assets/iso/furniture_microwave.png to SW');

  // 2. Kitchen cabinet flop
  // Make sure we flop from the canonical base
  const cabOrig = fs.readFileSync('scripts/sources/furniture_kitchen_cabinet.png');
  // Let's check if scripts/sources/furniture_kitchen_cabinet.png exists
  let cabBuf;
  if (fs.existsSync('scripts/sources/furniture_kitchen_cabinet.png')) {
    cabBuf = fs.readFileSync('scripts/sources/furniture_kitchen_cabinet.png');
  } else {
    cabBuf = fs.readFileSync('public/assets/iso/furniture_kitchen_cabinet.png');
  }
  // If we already flopped once, let's be careful not to double-flop.
  // We want the doors on the face sloping down-right (from left to center).
  // Let's check scripts/audit_results/cab_flipped.png: that was flopped from public/assets/iso
  // and had doors on the face sloping down-right!
  const cabFlipped = await sharp('public/assets/iso/furniture_kitchen_cabinet.png').flop().toBuffer();
  fs.writeFileSync('public/assets/iso/furniture_kitchen_cabinet.png', cabFlipped);
  console.log('Updated public/assets/iso/furniture_kitchen_cabinet.png (doors facing SW)');

  // 3. Sink counter flop
  const sinkFlipped = await sharp('public/assets/iso/furniture_sink_counter.png').flop().toBuffer();
  fs.writeFileSync('public/assets/iso/furniture_sink_counter.png', sinkFlipped);
  console.log('Updated public/assets/iso/furniture_sink_counter.png (doors facing SW)');

  // 4. Sofa flop (seats facing SE towards TV)
  const sofaFlipped = await sharp('public/assets/iso/furniture_sofa.png').flop().toBuffer();
  fs.writeFileSync('public/assets/iso/furniture_sofa.png', sofaFlipped);
  console.log('Updated public/assets/iso/furniture_sofa.png (seats facing SE)');
}

applyAssetUpdates().catch(console.error);
