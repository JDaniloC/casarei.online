import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ISO_DIR = 'public/assets/iso';

// Expected pixel sizes from isometric.ts
const FURNITURE_PIXEL_SIZES = {
  fridge:          { w: 128, h: 160 },
  stove:           { w: 128, h: 128 },
  microwave:       { w: 72,  h: 54, offsetX: 28, offsetY: -34 },
  sink_counter:    { w: 192, h: 128 },
  dining_table:    { w: 256, h: 192, offsetX: -64 },
  dining_table_simple: { w: 192, h: 128 },
  kitchen_cabinet: { w: 192, h: 128 },
  dishwasher:      { w: 128, h: 128 },
  sofa:            { w: 192, h: 160 },
  tv_rack:         { w: 192, h: 160 },
  coffee_table:    { w: 128, h: 80 },
  armchair:        { w: 128, h: 128 },
  bed:             { w: 256, h: 192, offsetX: -58 },
  wardrobe:        { w: 192, h: 186 },
  dresser:         { w: 192, h: 128 },
  vanity:          { w: 128, h: 128 },
  toilet:          { w: 128, h: 128, offsetX: 6, offsetY: -8 },
  bathroom_sink:   { w: 128, h: 160 },
  shower:          { w: 128, h: 186 },
  washing_machine: { w: 128, h: 128 },
  dryer:           { w: 128, h: 128 },
  laundry_sink:    { w: 128, h: 128 },
  coffee_maker:    { w: 64,  h: 56, offsetX: 32, offsetY: -34 },
  air_fryer:       { w: 64,  h: 56, offsetX: 32, offsetY: -34 },
  robot_vacuum:    { w: 64,  h: 48, offsetX: 32, offsetY: 0 },
  generic:         { w: 128, h: 128 },
};

// Grid footprints from isometric.ts
const FURNITURE_SIZES = {
  fridge: { w: 1, h: 1 },
  stove: { w: 1, h: 1 },
  microwave: { w: 1, h: 1 },
  sink_counter: { w: 2, h: 1 },
  dining_table: { w: 2, h: 2 },
  dining_table_simple: { w: 2, h: 1 },
  kitchen_cabinet: { w: 2, h: 1 },
  dishwasher: { w: 1, h: 1 },
  sofa: { w: 2, h: 1 },
  tv_rack: { w: 2, h: 1 },
  coffee_table: { w: 1, h: 1 },
  armchair: { w: 1, h: 1 },
  bed: { w: 2, h: 2 },
  wardrobe: { w: 2, h: 1 },
  dresser: { w: 2, h: 1 },
  vanity: { w: 1, h: 1 },
  toilet: { w: 1, h: 1 },
  bathroom_sink: { w: 1, h: 1 },
  shower: { w: 1, h: 1 },
  washing_machine: { w: 1, h: 1 },
  dryer: { w: 1, h: 1 },
  laundry_sink: { w: 1, h: 1 },
  coffee_maker: { w: 1, h: 1 },
  air_fryer: { w: 1, h: 1 },
  robot_vacuum: { w: 1, h: 1 },
  generic: { w: 1, h: 1 },
};

const TILE_W = 128;
const TILE_H = 64;

async function getBoundingBox(filePath) {
  const img = sharp(filePath);
  const meta = await img.metadata();
  const { data } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = meta;

  let minX = width, maxX = -1, minY = height, maxY = -1;
  let opaquePixels = 0;
  let semiTransparentWhite = 0;
  let whiteFringePixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx+1], b = data[idx+2], a = data[idx+3];

      if (a > 15) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        opaquePixels++;
      }

      if (a > 0 && a < 255 && r > 200 && g > 200 && b > 200) {
        semiTransparentWhite++;
      }

      if (a === 255) {
        const hasTransNeighbor =
          (x > 0 && data[(y * width + (x - 1)) * 4 + 3] === 0) ||
          (x < width - 1 && data[(y * width + (x + 1)) * 4 + 3] === 0) ||
          (y > 0 && data[((y - 1) * width + x) * 4 + 3] === 0) ||
          (y < height - 1 && data[((y + 1) * width + x) * 4 + 3] === 0);
        if (hasTransNeighbor && r > 220 && g > 220 && b > 220) {
          whiteFringePixels++;
        }
      }
    }
  }

  return {
    width, height,
    bbox: maxX >= 0 ? { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 } : null,
    opaquePixels,
    semiTransparentWhite,
    whiteFringePixels,
  };
}

function getIsoDiamondVertices(footprintW, footprintH) {
  // For a WxH footprint placed at grid (0,0), the isometric diamond vertices are:
  // Top:    ((0 - 0) * 64, (0 + 0) * 32) => (0*64, 0*32) for tile (0,0) top
  //  actually the diamond top = ((0-0)*64 + 64, (0+0)*32) = (64, 0)
  // 
  // For footprint w x h starting at (gx,gy), the 4 corner vertices of the combined diamond:
  // Top vertex: from cell (gx, gy) top => iso.x + 64, iso.y
  // Right vertex: from cell (gx+w-1, gy) right => iso.x + 128, iso.y + 32
  // Bottom vertex: from cell (gx+w-1, gy+h-1) bottom => iso.x + 64, iso.y + 64
  // Left vertex: from cell (gx, gy+h-1) left => iso.x, iso.y + 32
  
  // Simpler approach: compute the bounding diamond of the full footprint
  const gx = 0, gy = 0;
  
  // Compute iso coords for each corner cell
  const cells = [];
  for (let i = 0; i < footprintW; i++) {
    for (let j = 0; j < footprintH; j++) {
      cells.push({ x: gx + i, y: gy + j });
    }
  }
  
  // Each cell has 4 vertices
  let allX = [], allY = [];
  for (const c of cells) {
    const cx = (c.x - c.y) * (TILE_W / 2);
    const cy = (c.x + c.y) * (TILE_H / 2);
    // Diamond vertices
    allX.push(cx + 64, cx + 128, cx + 64, cx);
    allY.push(cy, cy + 32, cy + 64, cy + 32);
  }
  
  const top = { x: (gx - gy) * 64 + 64, y: (gx + gy) * 32 };
  const right = { x: ((gx + footprintW - 1) - gy) * 64 + 128, y: ((gx + footprintW - 1) + gy) * 32 + 32 };
  const bottom = { x: ((gx + footprintW - 1) - (gy + footprintH - 1)) * 64 + 64, y: ((gx + footprintW - 1) + (gy + footprintH - 1)) * 32 + 64 };
  const left = { x: (gx - (gy + footprintH - 1)) * 64, y: (gx + (gy + footprintH - 1)) * 32 + 32 };
  
  // Diamond width and height
  const diamondW = right.x - left.x;
  const diamondH = bottom.y - top.y;
  
  return { top, right, bottom, left, diamondW, diamondH };
}

async function renderGridDiagnostic(itemType, outPath) {
  const footprint = FURNITURE_SIZES[itemType] || { w: 1, h: 1 };
  const expectedSize = FURNITURE_PIXEL_SIZES[itemType] || { w: 128, h: 128 };
  const filePath = path.join(ISO_DIR, `furniture_${itemType}.png`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP: ${filePath} does not exist`);
    return;
  }

  const W = 500, H = 400;
  const originX = 150, originY = 60;
  const gridX = 2, gridY = 2;

  // Draw grid tiles
  const svgParts = [`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`];
  
  for (let gx = gridX - 1; gx <= gridX + footprint.w + 1; gx++) {
    for (let gy = gridY - 1; gy <= gridY + footprint.h + 1; gy++) {
      const px = (gx - gy) * 64 + originX;
      const py = (gx + gy) * 32 + originY;
      const isTarget = (gx >= gridX && gx < gridX + footprint.w && gy >= gridY && gy < gridY + footprint.h);
      const fill = isTarget ? 'rgba(255,255,0,0.3)' : 'rgba(100,150,255,0.08)';
      const stroke = isTarget ? '#ffff00' : '#4488ff';
      const strokeW = isTarget ? 2.5 : 1;
      svgParts.push(`<polygon points="${px+64},${py} ${px+128},${py+32} ${px+64},${py+64} ${px},${py+32}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"/>`);
      svgParts.push(`<text x="${px+64}" y="${py+36}" fill="#999" font-size="10" text-anchor="middle">${gx},${gy}</text>`);
    }
  }

  // Label
  svgParts.push(`<text x="10" y="20" fill="#fff" font-size="14" font-weight="bold">${itemType} (${footprint.w}x${footprint.h}) → ${expectedSize.w}x${expectedSize.h}px</text>`);
  svgParts.push(`</svg>`);

  const gridBuf = await sharp(Buffer.from(svgParts.join(''))).png().toBuffer();

  // Calculate furniture placement (same logic as getFurniturePlacement)
  const isoX = (gridX - gridY) * 64 + originX;
  const left = isoX + (expectedSize.offsetX || 0);
  const frontX = gridX + footprint.w - 1;
  const frontY = gridY + footprint.h - 1;
  const bottomGridSum = frontX + frontY;
  const bottomY = bottomGridSum * 32 + 64 + originY;
  const top = bottomY - expectedSize.h + (expectedSize.offsetY || 0);

  // Read actual image and resize to expected size
  const itemImg = await sharp(filePath)
    .resize(expectedSize.w, expectedSize.h, { fit: 'fill' })
    .png()
    .toBuffer();

  // Compose
  const bg = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 25, g: 25, b: 30, alpha: 1 } }
  }).png().toBuffer();

  await sharp(bg)
    .composite([
      { input: gridBuf, top: 0, left: 0 },
      { input: itemImg, top: Math.round(top), left: Math.round(left) }
    ])
    .png()
    .toFile(outPath);
}

async function main() {
  const outputDir = 'scripts/audit_results';
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const results = [];

  for (const [itemType, expectedSize] of Object.entries(FURNITURE_PIXEL_SIZES)) {
    const filePath = path.join(ISO_DIR, `furniture_${itemType}.png`);
    
    if (!fs.existsSync(filePath)) {
      results.push({
        item: itemType,
        status: 'MISSING',
        issues: ['File not found'],
      });
      continue;
    }

    const info = await getBoundingBox(filePath);
    const footprint = FURNITURE_SIZES[itemType] || { w: 1, h: 1 };
    const diamond = getIsoDiamondVertices(footprint.w, footprint.h);
    
    const issues = [];
    const warnings = [];

    // 1. Canvas size check
    const canvasMatch = info.width === expectedSize.w && info.height === expectedSize.h;
    if (!canvasMatch) {
      issues.push(`Canvas ${info.width}x${info.height} ≠ expected ${expectedSize.w}x${expectedSize.h}`);
    }

    // 2. Content bounding box analysis
    if (info.bbox) {
      const contentW = info.bbox.w;
      const contentH = info.bbox.h;

      // Check if content is centered horizontally
      const leftPad = info.bbox.minX;
      const rightPad = info.width - info.bbox.maxX - 1;
      const hCenterDiff = Math.abs(leftPad - rightPad);
      if (hCenterDiff > 8) {
        warnings.push(`H-center off by ${hCenterDiff}px (L=${leftPad}, R=${rightPad})`);
      }

      // Check if content touches bottom (should be near bottom for bottom-aligned assets)
      const bottomPad = info.height - info.bbox.maxY - 1;
      if (bottomPad > 10) {
        warnings.push(`Content ${bottomPad}px from bottom (should be near bottom)`);
      }

      // Check if content fills reasonable portion of canvas
      const fillRatio = contentW / info.width;
      if (fillRatio < 0.5) {
        issues.push(`Content only fills ${Math.round(fillRatio*100)}% of canvas width`);
      }

      // Check if content is too small for the expected diamond
      const diamondFillW = contentW / diamond.diamondW;
      const diamondFillH = contentH / diamond.diamondH;
      
      if (diamondFillW < 0.4) {
        warnings.push(`Content width only ${Math.round(diamondFillW*100)}% of diamond width`);
      }

      // Check if content overflows the diamond width significantly
      if (contentW > diamond.diamondW * 1.3) {
        issues.push(`Content overflows diamond by ${Math.round((contentW/diamond.diamondW - 1)*100)}%`);
      }

      // Cropping detection: content touching canvas edge
      const isCroppedTop = info.bbox.minY === 0;
      const isCroppedLeft = info.bbox.minX === 0;
      const isCroppedRight = info.bbox.maxX === info.width - 1;
      const isCroppedBottom = info.bbox.maxY === info.height - 1;

      const croppedEdges = [];
      if (isCroppedTop) croppedEdges.push('top');
      if (isCroppedLeft) croppedEdges.push('left');
      if (isCroppedRight) croppedEdges.push('right');
      // Bottom is expected for floor-based items, only flag if unexpected
      
      if (croppedEdges.length > 0 && !(croppedEdges.length === 1 && croppedEdges[0] === 'top')) {
        // Top cropping is often okay for tall items. Left/right cropping is a problem.
        const problematic = croppedEdges.filter(e => e === 'left' || e === 'right');
        if (problematic.length > 0) {
          issues.push(`CROPPED at edges: ${problematic.join(', ')}`);
        }
      }
    }

    // 3. White fringe/halo check
    if (info.whiteFringePixels > 20) {
      issues.push(`White fringe: ${info.whiteFringePixels} fringe pixels`);
    }
    if (info.semiTransparentWhite > 50) {
      warnings.push(`Semi-transparent white halo: ${info.semiTransparentWhite} pixels`);
    }

    // 4. Low opacity pixel count (might indicate very faint/invisible content)
    if (info.opaquePixels < 100) {
      issues.push(`Very few visible pixels (${info.opaquePixels})`);
    }

    let status = 'OK';
    if (issues.length > 0) status = 'NEEDS FIX';
    else if (warnings.length > 0) status = 'WARNING';

    results.push({
      item: itemType,
      status,
      canvasSize: `${info.width}x${info.height}`,
      expectedSize: `${expectedSize.w}x${expectedSize.h}`,
      bbox: info.bbox ? `(${info.bbox.minX},${info.bbox.minY})-(${info.bbox.maxX},${info.bbox.maxY}) [${info.bbox.w}x${info.bbox.h}]` : 'EMPTY',
      diamondSize: `${diamond.diamondW}x${diamond.diamondH}`,
      whiteFringe: info.whiteFringePixels,
      semiTransWhite: info.semiTransparentWhite,
      issues: issues.length > 0 ? issues : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    });

    // Generate visual diagnostic
    try {
      await renderGridDiagnostic(itemType, path.join(outputDir, `audit_${itemType}.png`));
    } catch(e) {
      console.error(`Failed to render diagnostic for ${itemType}:`, e.message);
    }
  }

  // Summary
  console.log('\n=== ASSET AUDIT RESULTS ===\n');
  
  const needsFix = results.filter(r => r.status === 'NEEDS FIX');
  const warnings = results.filter(r => r.status === 'WARNING');
  const ok = results.filter(r => r.status === 'OK');
  const missing = results.filter(r => r.status === 'MISSING');

  console.log(`Total assets: ${results.length}`);
  console.log(`✅ OK: ${ok.length}`);
  console.log(`⚠️ Warnings: ${warnings.length}`);
  console.log(`❌ Needs Fix: ${needsFix.length}`);
  console.log(`🚫 Missing: ${missing.length}`);
  console.log('');

  for (const r of results) {
    const icon = r.status === 'OK' ? '✅' : r.status === 'WARNING' ? '⚠️' : r.status === 'MISSING' ? '🚫' : '❌';
    console.log(`${icon} ${r.item}: ${r.status}`);
    console.log(`   Canvas: ${r.canvasSize}, Expected: ${r.expectedSize}, BBox: ${r.bbox}`);
    if (r.issues) r.issues.forEach(i => console.log(`   ❌ ${i}`));
    if (r.warnings) r.warnings.forEach(w => console.log(`   ⚠️ ${w}`));
    console.log('');
  }

  // Save JSON report
  fs.writeFileSync(
    path.join(outputDir, 'audit_report.json'),
    JSON.stringify(results, null, 2)
  );
  console.log(`\nFull report saved to ${outputDir}/audit_report.json`);
  console.log(`Visual diagnostics saved to ${outputDir}/audit_*.png`);
}

main().catch(console.error);
