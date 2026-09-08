import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'iso');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 128x64 isometric diamond geometry
const W = 128;
const H = 64;

function generateSVG(name) {
  let innerArt = '';

  if (name === 'tile_living') {
    // Warm golden oak wood parquet
    innerArt = `
      <!-- Base wood floor -->
      <polygon points="64,0 128,32 64,64 0,32" fill="#BA7D43" />
      
      <!-- Planks running along South-East isometric axis -->
      <!-- Plank 1 -->
      <polygon points="64,0 85,10.5 21,42.5 0,32" fill="#C98C51" />
      <line x1="85" y1="10.5" x2="21" y2="42.5" stroke="#9A6230" stroke-width="0.8" />
      
      <!-- Plank 2 -->
      <polygon points="85,10.5 106,21 42,53 21,42.5" fill="#BA7D43" />
      <line x1="106" y1="21" x2="42" y2="53" stroke="#9A6230" stroke-width="0.8" />
      
      <!-- Plank 3 -->
      <polygon points="106,21 128,32 64,64 42,53" fill="#C4864C" />
      <line x1="106" y1="21" x2="42" y2="53" stroke="#9A6230" stroke-width="0.8" />

      <!-- Subtle grain lines and plank cuts -->
      <line x1="32" y1="16" x2="53" y2="26.5" stroke="#9A6230" stroke-width="0.7" stroke-dasharray="8 4 12 3" opacity="0.6" />
      <line x1="53" y1="26.5" x2="74" y2="37" stroke="#9A6230" stroke-width="0.7" stroke-dasharray="14 5 7 4" opacity="0.6" />
      <line x1="74" y1="37" x2="95" y2="47.5" stroke="#9A6230" stroke-width="0.7" stroke-dasharray="6 3 15 4" opacity="0.6" />

      <!-- Horizontal plank dividers (staggered joints) -->
      <line x1="42.5" y1="21.25" x2="53" y2="16" stroke="#8A5526" stroke-width="1" />
      <line x1="63.5" y1="42.25" x2="74" y2="37" stroke="#8A5526" stroke-width="1" />

      <!-- Soft gloss highlight across planks -->
      <polygon points="64,0 100,18 70,33 34,15" fill="white" opacity="0.1" />
    `;
  } else if (name === 'tile_bedroom') {
    // Rich dark walnut wood parquet
    innerArt = `
      <!-- Base dark walnut floor -->
      <polygon points="64,0 128,32 64,64 0,32" fill="#4B3323" />
      
      <!-- Planks running along South-East isometric axis -->
      <!-- Plank 1 -->
      <polygon points="64,0 85,10.5 21,42.5 0,32" fill="#583D2B" />
      <line x1="85" y1="10.5" x2="21" y2="42.5" stroke="#372418" stroke-width="0.8" />
      
      <!-- Plank 2 -->
      <polygon points="85,10.5 106,21 42,53 21,42.5" fill="#493122" />
      <line x1="106" y1="21" x2="42" y2="53" stroke="#372418" stroke-width="0.8" />
      
      <!-- Plank 3 -->
      <polygon points="106,21 128,32 64,64 42,53" fill="#523827" />
      <line x1="106" y1="21" x2="42" y2="53" stroke="#372418" stroke-width="0.8" />

      <!-- Subtle grain lines and plank cuts -->
      <line x1="32" y1="16" x2="53" y2="26.5" stroke="#322014" stroke-width="0.7" stroke-dasharray="10 4 14 3" opacity="0.7" />
      <line x1="53" y1="26.5" x2="74" y2="37" stroke="#322014" stroke-width="0.7" stroke-dasharray="8 6 12 4" opacity="0.7" />
      <line x1="74" y1="37" x2="95" y2="47.5" stroke="#322014" stroke-width="0.7" stroke-dasharray="14 4 8 5" opacity="0.7" />

      <!-- Staggered joints -->
      <line x1="32" y1="26.5" x2="42.5" y2="21.25" stroke="#2B1A0F" stroke-width="1" />
      <line x1="74" y1="37" x2="84.5" y2="31.75" stroke="#2B1A0F" stroke-width="1" />

      <!-- Velvet sheen highlight -->
      <polygon points="64,0 100,18 70,33 34,15" fill="white" opacity="0.06" />
    `;
  } else if (name === 'tile_kitchen') {
    // Light modern porcelain tiles (4x4 checkered sub-grid)
    innerArt = `
      <!-- Base light ceramic -->
      <polygon points="64,0 128,32 64,64 0,32" fill="#EFECE6" />

      <!-- 2x2 Large Porcelain Slabs -->
      <!-- Center dividers -->
      <line x1="32" y1="16" x2="96" y2="48" stroke="#D3CCC2" stroke-width="1" />
      <line x1="96" y1="16" x2="32" y2="48" stroke="#D3CCC2" stroke-width="1" />

      <!-- 4x4 Grid lines -->
      <line x1="16" y1="24" x2="80" y2="56" stroke="#D9D3C9" stroke-width="0.8" />
      <line x1="48" y1="8" x2="112" y2="40" stroke="#D9D3C9" stroke-width="0.8" />
      
      <line x1="80" y1="8" x2="16" y2="40" stroke="#D9D3C9" stroke-width="0.8" />
      <line x1="112" y1="24" x2="48" y2="56" stroke="#D9D3C9" stroke-width="0.8" />

      <!-- Subtle tile texture / shading -->
      <polygon points="64,0 80,8 64,16 48,8" fill="#F7F5F0" />
      <polygon points="96,16 112,24 96,32 80,24" fill="#F7F5F0" />
      <polygon points="32,16 48,24 32,32 16,24" fill="#F7F5F0" />
      <polygon points="64,32 80,40 64,48 48,40" fill="#F7F5F0" />

      <!-- Marble/stone soft gleam -->
      <polygon points="48,8 80,24 64,32 32,16" fill="white" opacity="0.25" />
    `;
  } else if (name === 'tile_bathroom') {
    // Contemporary clean neutral tiles
    innerArt = `
      <!-- Base light stone -->
      <polygon points="64,0 128,32 64,64 0,32" fill="#E4E7EA" />

      <!-- Diagonal grid -->
      <line x1="32" y1="16" x2="96" y2="48" stroke="#C8CFD4" stroke-width="1" />
      <line x1="96" y1="16" x2="32" y2="48" stroke="#C8CFD4" stroke-width="1" />

      <line x1="16" y1="24" x2="80" y2="56" stroke="#D2D9DE" stroke-width="0.8" />
      <line x1="48" y1="8" x2="112" y2="40" stroke="#D2D9DE" stroke-width="0.8" />
      
      <line x1="80" y1="8" x2="16" y2="40" stroke="#D2D9DE" stroke-width="0.8" />
      <line x1="112" y1="24" x2="48" y2="56" stroke="#D2D9DE" stroke-width="0.8" />

      <!-- Mosaic accents -->
      <polygon points="64,0 80,8 64,16 48,8" fill="#EDF0F2" />
      <polygon points="96,16 112,24 96,32 80,24" fill="#DAE0E4" />
      <polygon points="32,16 48,24 32,32 16,24" fill="#DAE0E4" />
      <polygon points="64,32 80,40 64,48 48,40" fill="#EDF0F2" />

      <!-- Soft gloss -->
      <polygon points="64,16 96,32 64,48 32,32" fill="white" opacity="0.18" />
    `;
  } else if (name === 'tile_laundry') {
    // Smooth technical light gray polished cement
    innerArt = `
      <!-- Base polished cement -->
      <polygon points="64,0 128,32 64,64 0,32" fill="#ABB1B5" />

      <!-- 2 Large technical slabs -->
      <line x1="32" y1="16" x2="96" y2="48" stroke="#8E959A" stroke-width="1" />
      <line x1="96" y1="16" x2="32" y2="48" stroke="#8E959A" stroke-width="1" />

      <!-- Subtle concrete grain -->
      <polygon points="64,0 96,16 64,32 32,16" fill="#B4BAC0" opacity="0.6" />
      <polygon points="64,32 96,48 64,64 32,48" fill="#9EA4A9" opacity="0.4" />

      <!-- Highlight -->
      <polygon points="48,8 80,24 64,32 32,16" fill="white" opacity="0.12" />
    `;
  } else if (name === 'tile_foundation') {
    // Solid foundation concrete slab
    innerArt = `
      <!-- Base concrete slab -->
      <polygon points="64,0 128,32 64,64 0,32" fill="#75797E" />

      <!-- Expansion joints -->
      <line x1="32" y1="16" x2="96" y2="48" stroke="#56595D" stroke-width="1.2" />
      <line x1="96" y1="16" x2="32" y2="48" stroke="#56595D" stroke-width="1.2" />

      <!-- Texture & subtle surface weathering -->
      <polygon points="64,0 96,16 64,32 32,16" fill="#81868B" opacity="0.5" />
      <polygon points="64,32 96,48 64,64 32,48" fill="#696D71" opacity="0.5" />
    `;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <clipPath id="iso-diamond">
        <polygon points="64,0 128,32 64,64 0,32" />
      </clipPath>
    </defs>
    <g clip-path="url(#iso-diamond)">
      ${innerArt}
    </g>
    <!-- Border to eliminate subpixel rounding antialias fringes -->
    <polygon points="64,0 128,32 64,64 0,32" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="0.5" />
  </svg>`;
}

async function run() {
  const tiles = ['tile_kitchen', 'tile_living', 'tile_bedroom', 'tile_bathroom', 'tile_laundry', 'tile_foundation'];
  
  console.log('Generating seamless isometric floor tiles (128x64)...');
  for (const name of tiles) {
    const svg = generateSVG(name);
    const dest = path.join(OUTPUT_DIR, `${name}.png`);
    await sharp(Buffer.from(svg))
      .png()
      .toFile(dest);
    console.log(`✅ Gerado: ${name}.png (128x64)`);
  }
  console.log('Todos os pisos geométricos foram gerados com sucesso!');
}

run().catch(console.error);
