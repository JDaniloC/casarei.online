const sharp = require('sharp');
const fs = require('fs');

async function testFlipped() {
  const cabBuf = fs.readFileSync('public/assets/iso/furniture_kitchen_cabinet.png');
  const cabFlipped = await sharp(cabBuf).flop().toBuffer();
  fs.writeFileSync('scripts/audit_results/cab_flipped.png', cabFlipped);

  const microSW = fs.readFileSync('scripts/audit_results/micro_SW.png');
  // Composite microSW onto flipped cabinet
  // The flipped cabinet has its long face sloping down-left? Wait!
  // Let's inspect cabFlipped!
}
testFlipped().catch(console.error);
