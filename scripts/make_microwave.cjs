const sharp = require('sharp');
const fs = require('fs');

function makeMicrowaveSvg(facing) {
  if (facing === 'SE') {
    // Door on South-East face (slope -0.500 from bottom apex up-right)
    return `<svg width="72" height="54" viewBox="0 0 72 54" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
      <!-- Rubber feet -->
      <rect x="8" y="42" width="4" height="2" fill="#111115"/>
      <rect x="22" y="49" width="4" height="2" fill="#111115"/>
      <rect x="50" y="21" width="4" height="2" fill="#111115"/>
      <rect x="64" y="28" width="4" height="2" fill="#111115"/>

      <!-- Body Outline (outer 1px dark border) -->
      <polygon points="6,20 48,0 66,9 66,31 24,52 6,43" fill="#16181d"/>

      <!-- Top Face (brushed stainless steel) -->
      <polygon points="7,20 48,1 65,9 24,28" fill="#d0d5dd"/>
      <!-- Subtle metal highlights -->
      <line x1="20" y1="13" x2="38" y2="4" stroke="#e4e7ec" stroke-width="1"/>
      <line x1="26" y1="17" x2="44" y2="8" stroke="#98a2b3" stroke-width="1"/>

      <!-- Left Side Panel (shadowed) -->
      <polygon points="7,21 23,28 23,49 7,42" fill="#667085"/>
      <line x1="11" y1="28" x2="19" y2="32" stroke="#475467" stroke-width="1"/>
      <line x1="11" y1="33" x2="19" y2="37" stroke="#475467" stroke-width="1"/>
      <line x1="11" y1="38" x2="19" y2="42" stroke="#475467" stroke-width="1"/>

      <!-- Front Face (South-East, slope -0.500) -->
      <polygon points="24,29 65,10 65,30 24,50" fill="#98a2b3"/>

      <!-- Door Bezel (Dark Metallic Grey) -->
      <polygon points="25,30 55,16 55,27 25,41" fill="#1d2939"/>

      <!-- Tinted Glass Window -->
      <polygon points="27,31 49,20 49,26 27,37" fill="#0c111d"/>
      <!-- 2:1 Glass reflection streak -->
      <line x1="33" y1="33" x2="45" y2="27" stroke="#58a6ff" stroke-width="1" stroke-opacity="0.7"/>
      <line x1="31" y1="35" x2="39" y2="31" stroke="#9ac7ff" stroke-width="1" stroke-opacity="0.9"/>

      <!-- Vertical Chrome Handle -->
      <line x1="51" y1="20" x2="51" y2="25" stroke="#f8fafc" stroke-width="1.5"/>

      <!-- Control Panel / Digital Clock -->
      <polygon points="56,15 64,11 64,26 56,30" fill="#101828"/>
      <!-- Green Clock Display -->
      <polygon points="57,16 63,13 63,17 57,20" fill="#054f31"/>
      <rect x="58" y="15" width="4" height="2" fill="#12b76a"/>
      <!-- Touch Buttons -->
      <circle cx="58.5" cy="21.5" r="0.8" fill="#667085"/>
      <circle cx="61.5" cy="20" r="0.8" fill="#667085"/>
      <circle cx="58.5" cy="24.5" r="0.8" fill="#667085"/>
      <circle cx="61.5" cy="23" r="0.8" fill="#667085"/>
      <circle cx="60" cy="27" r="1.2" fill="#388bfd"/>
    </svg>`;
  } else {
    // Door on South-West face (slope +0.500 from bottom apex up-left)
    return `<svg width="72" height="54" viewBox="0 0 72 54" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
      <!-- Rubber feet -->
      <rect x="8" y="28" width="4" height="2" fill="#111115"/>
      <rect x="22" y="21" width="4" height="2" fill="#111115"/>
      <rect x="50" y="49" width="4" height="2" fill="#111115"/>
      <rect x="64" y="42" width="4" height="2" fill="#111115"/>

      <!-- Body Outline -->
      <polygon points="66,20 24,0 6,9 6,31 48,52 66,43" fill="#16181d"/>

      <!-- Top Face -->
      <polygon points="65,20 24,1 7,9 48,28" fill="#d0d5dd"/>
      <line x1="52" y1="13" x2="34" y2="4" stroke="#e4e7ec" stroke-width="1"/>
      <line x1="46" y1="17" x2="28" y2="8" stroke="#98a2b3" stroke-width="1"/>

      <!-- Right Side Panel (shadowed) -->
      <polygon points="65,21 49,28 49,49 65,42" fill="#667085"/>
      <line x1="61" y1="28" x2="53" y2="32" stroke="#475467" stroke-width="1"/>
      <line x1="61" y1="33" x2="53" y2="37" stroke="#475467" stroke-width="1"/>
      <line x1="61" y1="38" x2="53" y2="42" stroke="#475467" stroke-width="1"/>

      <!-- Front Face (South-West, slope +0.500) -->
      <polygon points="48,29 7,10 7,30 48,50" fill="#98a2b3"/>

      <!-- Door Bezel -->
      <polygon points="47,30 17,16 17,27 47,41" fill="#1d2939"/>

      <!-- Tinted Glass Window -->
      <polygon points="45,31 23,20 23,26 45,37" fill="#0c111d"/>
      <line x1="39" y1="33" x2="27" y2="27" stroke="#58a6ff" stroke-width="1" stroke-opacity="0.7"/>
      <line x1="41" y1="35" x2="33" y2="31" stroke="#9ac7ff" stroke-width="1" stroke-opacity="0.9"/>

      <!-- Vertical Chrome Handle -->
      <line x1="21" y1="20" x2="21" y2="25" stroke="#f8fafc" stroke-width="1.5"/>

      <!-- Control Panel / Digital Clock -->
      <polygon points="16,15 8,11 8,26 16,30" fill="#101828"/>
      <polygon points="15,16 9,13 9,17 15,20" fill="#054f31"/>
      <rect x="10" y="15" width="4" height="2" fill="#12b76a"/>
      <circle cx="13.5" cy="21.5" r="0.8" fill="#667085"/>
      <circle cx="10.5" cy="20" r="0.8" fill="#667085"/>
      <circle cx="13.5" cy="24.5" r="0.8" fill="#667085"/>
      <circle cx="10.5" cy="23" r="0.8" fill="#667085"/>
      <circle cx="12" cy="27" r="1.2" fill="#388bfd"/>
    </svg>`;
  }
}

async function main() {
  const sePng = await sharp(Buffer.from(makeMicrowaveSvg('SE'))).png().toBuffer();
  const swPng = await sharp(Buffer.from(makeMicrowaveSvg('SW'))).png().toBuffer();

  fs.writeFileSync('scripts/audit_results/micro_SE.png', sePng);
  fs.writeFileSync('scripts/audit_results/micro_SW.png', swPng);

  // Composite both onto kitchen_cabinet to see exact placement
  await sharp('public/assets/iso/furniture_kitchen_cabinet.png')
    .composite([{ input: sePng, left: 95, top: 0 }])
    .toFile('scripts/audit_results/cabinet_with_micro_SE.png');

  await sharp('public/assets/iso/furniture_kitchen_cabinet.png')
    .composite([{ input: swPng, left: 95, top: 0 }])
    .toFile('scripts/audit_results/cabinet_with_micro_SW.png');

  console.log('Generated micro_SE, micro_SW and their composites on cabinet!');
}

main().catch(console.error);
