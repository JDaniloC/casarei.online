const sharp = require('sharp');
const fs = require('fs');

// We have make_microwave.cjs that can generate SE and SW
// Let's generate both and composite them on top of kitchen_cabinet!
const { execSync } = require('child_process');

async function testMicrowave() {
  const makeMicro = require('./make_microwave.cjs');
  // Generate both SVGs
  // Let's read make_microwave
}
testMicrowave().catch(console.error);
