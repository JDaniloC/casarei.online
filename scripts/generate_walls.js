import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'iso');

// Geometry:
// W = 64, H = 192, Wall Height = 160, Slope dy = 32
//
// NE Wall (slopes down-right, dy = +32 from X=0 to X=64):
// Top: (0, 0) -> (64, 32)
// Base: (0, 160) -> (64, 192)
// Left: (0, 0) -> (0, 160)
// Right: (64, 32) -> (64, 192)
//
// NW Wall (slopes down-left, dy = -32 from X=0 to X=64, i.e. base is 192 at X=0, 160 at X=64):
// Top: (0, 32) -> (64, 0)
// Base: (0, 192) -> (64, 160)
// Left: (0, 32) -> (0, 192)
// Right: (64, 0) -> (64, 160)

function generateNEWallSVG({ hasWindow = false } = {}) {
  // Base polygon: 0,0 64,32 64,192 0,160
  // Baseboard polygon: 0,146 64,178 64,192 0,160
  // Top crown polygon: 0,0 64,32 64,38 0,6

  let windowSVG = '';
  if (hasWindow) {
    // Window parallelogram centered: X from 12 to 52 (width 40), Y from 50 to 125 (height 75)
    // Sloping at dy = (X - 12) * (32/64) = 0.5 * dx
    const wX1 = 12;
    const wX2 = 52;
    const yTop1 = 48;
    const yTop2 = 48 + 20; // 68
    const yBot1 = 128;
    const yBot2 = 128 + 20; // 148

    windowSVG = `
      <!-- Window Outer Frame -->
      <polygon points="${wX1-2},${yTop1-1} ${wX2+2},${yTop2+1} ${wX2+2},${yBot2+1} ${wX1-2},${yBot1-1}" fill="#24282f" />
      <polygon points="${wX1},${yTop1} ${wX2},${yTop2} ${wX2},${yBot2} ${wX1},${yBot1}" fill="#333842" />
      
      <!-- Sky & Outdoor Backdrop -->
      <defs>
        <linearGradient id="skyNE" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#93c5fd" />
          <stop offset="60%" stop-color="#dbeafe" />
          <stop offset="100%" stop-color="#bbf7d0" />
        </linearGradient>
      </defs>
      <polygon points="${wX1+3},${yTop1+3} ${wX2-3},${yTop2+3} ${wX2-3},${yBot2-3} ${wX1+3},${yBot1-3}" fill="url(#skyNE)" />
      
      <!-- Tree foliage outside -->
      <circle cx="28" cy="${yBot1-8}" r="12" fill="#4ade80" opacity="0.6" />
      <circle cx="40" cy="${yBot2-12}" r="10" fill="#22c55e" opacity="0.5" />
      
      <!-- Glass reflection highlight -->
      <polygon points="${wX1+5},${yTop1+5} ${wX1+18},${yTop1+11} ${wX1+10},${yBot1-5} ${wX1+3},${yBot1-5}" fill="#ffffff" opacity="0.35" />
      
      <!-- Window mullions (crossbars) -->
      <line x1="32" y1="${yTop1+10}" x2="32" y2="${yBot1+10}" stroke="#24282f" stroke-width="2" />
      <line x1="${wX1+3}" y1="${(yTop1+yBot1)/2}" x2="${wX2-3}" y2="${(yTop2+yBot2)/2}" stroke="#24282f" stroke-width="2" />
      
      <!-- Window Sill (peitoril 3D) -->
      <polygon points="${wX1-4},${yBot1} ${wX2+4},${yBot2} ${wX2+4},${yBot2+4} ${wX1-4},${yBot1+4}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" />
    `;
  }

  return `
  <svg width="64" height="192" viewBox="0 0 64 192" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="wallNEGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#fdfcf9" />
        <stop offset="100%" stop-color="#f3efe8" />
      </linearGradient>
      <linearGradient id="baseboardNE" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#ffffff" />
        <stop offset="100%" stop-color="#e2e8f0" />
      </linearGradient>
    </defs>

    <!-- Main Wall Surface -->
    <polygon points="0,0 64,32 64,192 0,160" fill="url(#wallNEGrad)" />

    <!-- Subtle texture / soft lighting tone -->
    <polygon points="0,0 64,32 64,192 0,160" fill="#000000" opacity="0.02" />

    ${windowSVG}

    <!-- Top Crown Molding (Sanca superior) -->
    <polygon points="0,0 64,32 64,37 0,5" fill="#ffffff" />
    <line x1="0" y1="5" x2="64" y2="37" stroke="#e2e8f0" stroke-width="1" />

    <!-- Baseboard Molding (Rodapé em madeira branca) -->
    <polygon points="0,144 64,176 64,192 0,160" fill="url(#baseboardNE)" />
    <!-- Baseboard top groove -->
    <line x1="0" y1="144" x2="64" y2="176" stroke="#94a3b8" stroke-width="1.2" opacity="0.6" />
    <line x1="0" y1="146" x2="64" y2="178" stroke="#ffffff" stroke-width="1" />
    <!-- Bottom contact shadow with floor -->
    <line x1="0" y1="160" x2="64" y2="192" stroke="#64748b" stroke-width="1" opacity="0.4" />
  </svg>`;
}

function generateNWWallSVG({ hasWindow = false } = {}) {
  // NW Wall (slopes down-left):
  // Top: (0, 32) -> (64, 0)
  // Base: (0, 192) -> (64, 160)
  // Left: (0, 32) -> (0, 192)
  // Right: (64, 0) -> (64, 160)

  let windowSVG = '';
  if (hasWindow) {
    const wX1 = 12;
    const wX2 = 52;
    const yTop1 = 48 + 20; // 68
    const yTop2 = 48;
    const yBot1 = 128 + 20; // 148
    const yBot2 = 128;

    windowSVG = `
      <!-- Window Outer Frame -->
      <polygon points="${wX1-2},${yTop1+1} ${wX2+2},${yTop2-1} ${wX2+2},${yBot2-1} ${wX1-2},${yBot1+1}" fill="#24282f" />
      <polygon points="${wX1},${yTop1} ${wX2},${yTop2} ${wX2},${yBot2} ${wX1},${yBot1}" fill="#333842" />
      
      <!-- Sky & Outdoor Backdrop -->
      <defs>
        <linearGradient id="skyNW" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#93c5fd" />
          <stop offset="60%" stop-color="#dbeafe" />
          <stop offset="100%" stop-color="#bbf7d0" />
        </linearGradient>
      </defs>
      <polygon points="${wX1+3},${yTop1-3} ${wX2-3},${yTop2+3} ${wX2-3},${yBot2-3} ${wX1+3},${yBot1-3}" fill="url(#skyNW)" />
      
      <!-- Tree foliage outside -->
      <circle cx="36" cy="${yBot2+4}" r="12" fill="#4ade80" opacity="0.6" />
      <circle cx="24" cy="${yBot1-12}" r="10" fill="#22c55e" opacity="0.5" />
      
      <!-- Glass reflection highlight -->
      <polygon points="${wX1+5},${yTop1-5} ${wX1+18},${yTop1-11} ${wX1+10},${yBot1-5} ${wX1+3},${yBot1-5}" fill="#ffffff" opacity="0.35" />
      
      <!-- Window mullions -->
      <line x1="32" y1="${(yTop1+yTop2)/2}" x2="32" y2="${(yBot1+yBot2)/2}" stroke="#24282f" stroke-width="2" />
      <line x1="${wX1+3}" y1="${(yTop1+yBot1)/2}" x2="${wX2-3}" y2="${(yTop2+yBot2)/2}" stroke="#24282f" stroke-width="2" />
      
      <!-- Window Sill -->
      <polygon points="${wX1-4},${yBot1} ${wX2+4},${yBot2} ${wX2+4},${yBot2+4} ${wX1-4},${yBot1+4}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" />
    `;
  }

  return `
  <svg width="64" height="192" viewBox="0 0 64 192" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="wallNWGrad" x1="100%" y1="0%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="#fdfcf9" />
        <stop offset="100%" stop-color="#ede9e1" />
      </linearGradient>
      <linearGradient id="baseboardNW" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#ffffff" />
        <stop offset="100%" stop-color="#cbd5e1" />
      </linearGradient>
    </defs>

    <!-- Main Wall Surface (slightly darker than NE to simulate natural ambient light direction) -->
    <polygon points="0,32 64,0 64,160 0,192" fill="url(#wallNWGrad)" />

    <!-- Soft ambient shadow -->
    <polygon points="0,32 64,0 64,160 0,192" fill="#000000" opacity="0.04" />

    ${windowSVG}

    <!-- Top Crown Molding -->
    <polygon points="0,32 64,0 64,5 0,37" fill="#ffffff" />
    <line x1="0" y1="37" x2="64" y2="5" stroke="#cbd5e1" stroke-width="1" />

    <!-- Baseboard Molding -->
    <polygon points="0,176 64,144 64,160 0,192" fill="url(#baseboardNW)" />
    <!-- Baseboard top groove -->
    <line x1="0" y1="176" x2="64" y2="144" stroke="#94a3b8" stroke-width="1.2" opacity="0.6" />
    <line x1="0" y1="178" x2="64" y2="146" stroke="#ffffff" stroke-width="1" />
    <!-- Bottom contact shadow with floor -->
    <line x1="0" y1="192" x2="64" y2="160" stroke="#64748b" stroke-width="1" opacity="0.4" />
  </svg>`;
}

async function main() {
  console.log('Generating continuous isometric loft back walls...');

  const files = [
    { name: 'wall_ne_plain.png', svg: generateNEWallSVG({ hasWindow: false }) },
    { name: 'wall_ne_window.png', svg: generateNEWallSVG({ hasWindow: true }) },
    { name: 'wall_nw_plain.png', svg: generateNWWallSVG({ hasWindow: false }) },
    { name: 'wall_nw_window.png', svg: generateNWWallSVG({ hasWindow: true }) },
  ];

  for (const item of files) {
    const filePath = path.join(OUT_DIR, item.name);
    await sharp(Buffer.from(item.svg))
      .png({ compressionLevel: 9 })
      .toFile(filePath);
    console.log(`✓ Generated ${item.name} (64x192)`);
  }

  console.log('Done generating loft wall assets!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
