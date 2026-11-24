import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const BRAIN_DIR = 'C:/Users/danil/.gemini/antigravity-ide/brain/3c6d2009-04b8-4fdb-96f3-0d88fef6bc61';
const OUT_DIR = path.resolve('public/assets/iso');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// 1px contour outline
function applyOutline(data, width, height, outlineColor = [30, 35, 42]) {
  const result = Buffer.from(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] === 0) {
        let hasOpaqueNeighbor = false;
        if (x > 0 && data[idx - 4 + 3] > 180) hasOpaqueNeighbor = true;
        else if (x < width - 1 && data[idx + 4 + 3] > 180) hasOpaqueNeighbor = true;
        else if (y > 0 && data[((y - 1) * width + x) * 4 + 3] > 180) hasOpaqueNeighbor = true;
        else if (y < height - 1 && data[((y + 1) * width + x) * 4 + 3] > 180) hasOpaqueNeighbor = true;

        if (hasOpaqueNeighbor) {
          result[idx] = outlineColor[0];
          result[idx + 1] = outlineColor[1];
          result[idx + 2] = outlineColor[2];
          result[idx + 3] = 255;
        }
      }
    }
  }
  return result;
}

export async function processItem(filename, targetW, targetH, outFilename, options = {}) {
  const fullPath = path.isAbsolute(filename) ? filename : path.join(BRAIN_DIR, filename);
  if (!fs.existsSync(fullPath)) {
    console.warn(`File not found: ${fullPath}`);
    return false;
  }

  const inputBuf = fs.readFileSync(fullPath);
  const { data, info } = await sharp(inputBuf).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const channels = info.channels;

  const marginTrim = options.marginTrim || 25;
  // Clear outer margin trim to 255 to eliminate any generator border artifacts
  if (marginTrim > 0) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x < marginTrim || x >= w - marginTrim || y < marginTrim || y >= h - marginTrim) {
          const idx = (y * w + x) * channels;
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
        }
      }
    }
  }

  const bgThreshold = options.bgThreshold || 232;
  const visited = new Uint8Array(w * h);
  const queue = [];

  // Seed flood fill from borders
  for (let x = 0; x < w; x++) {
    queue.push(x, 0); visited[x] = 1;
    queue.push(x, h - 1); visited[(h - 1) * w + x] = 1;
  }
  for (let y = 0; y < h; y++) {
    queue.push(0, y); visited[y * w] = 1;
    queue.push(w - 1, y); visited[y * w + (w - 1)] = 1;
  }

  let head = 0;
  while (head < queue.length) {
    const cx = queue[head++];
    const cy = queue[head++];
    const idx = (cy * w + cx) * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    if (r >= bgThreshold && g >= bgThreshold && b >= bgThreshold) {
      const neighbors = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1]
      ];
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const nPos = ny * w + nx;
          if (!visited[nPos]) {
            visited[nPos] = 1;
            const nIdx = nPos * channels;
            if (data[nIdx] >= bgThreshold && data[nIdx + 1] >= bgThreshold && data[nIdx + 2] >= bgThreshold) {
              queue.push(nx, ny);
            }
          }
        }
      }
    }
  }

  // Create RGBA
  const rgba = Buffer.alloc(w * h * 4);
  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pos = y * w + x;
      const srcIdx = pos * channels;
      const dstIdx = pos * 4;

      if (visited[pos] && data[srcIdx] >= bgThreshold && data[srcIdx + 1] >= bgThreshold && data[srcIdx + 2] >= bgThreshold) {
        rgba[dstIdx + 3] = 0;
      } else {
        rgba[dstIdx] = data[srcIdx];
        rgba[dstIdx + 1] = data[srcIdx + 1];
        rgba[dstIdx + 2] = data[srcIdx + 2];
        rgba[dstIdx + 3] = 255;

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    console.error(`Invalid bounds for ${filename}: minX=${minX}, maxX=${maxX}, minY=${minY}, maxY=${maxY}`);
    return false;
  }

  // Defringe 1px outer white halo
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = (y * w + x) * 4;
      if (rgba[idx + 3] > 0) {
        let hasTransNeighbor = false;
        if (x > 0 && rgba[idx - 4 + 3] === 0) hasTransNeighbor = true;
        else if (x < w - 1 && rgba[idx + 4 + 3] === 0) hasTransNeighbor = true;
        else if (y > 0 && rgba[((y - 1) * w + x) * 4 + 3] === 0) hasTransNeighbor = true;
        else if (y < h - 1 && rgba[((y + 1) * w + x) * 4 + 3] === 0) hasTransNeighbor = true;

        if (hasTransNeighbor && rgba[idx] > 220 && rgba[idx + 1] > 220 && rgba[idx + 2] > 220) {
          rgba[idx + 3] = 0; // eliminate fringe
        }
      }
    }
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  const croppedPng = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: minX, top: minY, width: cropW, height: cropH })
    .png()
    .toBuffer();

  // 1. Aspect-preserving scaling with diamond safety inset (92%) so base sits cleanly inside cell lines
  const isCompact = (targetW <= 72);
  const insetFactor = isCompact ? 1.0 : 0.92;
  const scale = Math.min((targetW * insetFactor) / cropW, (targetH * insetFactor) / cropH);
  const scaledW = Math.max(1, Math.round(cropW * scale));
  const scaledH = Math.max(1, Math.round(cropH * scale));

  const scaledPng = await sharp(croppedPng)
    .resize(scaledW, scaledH, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();

  const leftPad = Math.max(0, Math.floor((targetW - scaledW) / 2));
  // Inset bottom by 4px so front vertex does not touch or exceed the cell boundary
  const bottomInset = isCompact ? 0 : 4;
  const topPad = Math.max(0, targetH - scaledH - bottomInset);

  // Composite into target size canvas
  const canvas = await sharp({
    create: {
      width: targetW,
      height: targetH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite([
    { input: scaledPng, left: leftPad, top: topPad }
  ]).png().toBuffer();

  // 2. Strict Geometric Base Clamping:
  // Zero pixels may ever exist below the bottom isometric floor diamond boundary of the cell
  const { data: cData, info: cInfo } = await sharp(canvas).raw().toBuffer({ resolveWithObject: true });
  
  const is1x1 = (targetW === 128);
  const is2x1 = (targetW === 192);
  const is2x2 = (targetW === 256);

  if (is1x1 || is2x1 || is2x2) {
    for (let y = 0; y < cInfo.height; y++) {
      for (let x = 0; x < cInfo.width; x++) {
        let maxAllowedY = cInfo.height;
        if (is1x1) {
          // 1x1 floor diamond: bottom vertex at (64, H-2), edges go up to (0, H-34) and (128, H-34)
          maxAllowedY = (x <= 64) ? (cInfo.height - 34 + 0.5 * x) : (cInfo.height - 34 + 0.5 * (128 - x));
        } else if (is2x1) {
          // 2x1 floor diamond: bottom vertex at (128, H-2), edges to (0, H-66) and (192, H-34)
          maxAllowedY = (x <= 128) ? (cInfo.height - 66 + 0.5 * x) : (cInfo.height - 2 - 0.5 * (x - 128));
        } else if (is2x2) {
          // 2x2 floor diamond: bottom vertex at (128, H-2), edges to (0, H-66) and (256, H-66)
          maxAllowedY = (x <= 128) ? (cInfo.height - 66 + 0.5 * x) : (cInfo.height - 2 - 0.5 * (x - 128));
        }
        if (y > maxAllowedY) {
          const idx = (y * cInfo.width + x) * 4;
          cData[idx + 3] = 0; // Cut off any stray pixel spilling below the cell's diamond
        }
      }
    }
  }

  // 3. Apply crisp 1px outline
  const outlined = applyOutline(cData, cInfo.width, cInfo.height, [30, 35, 42]);
  const finalPng = await sharp(outlined, { raw: cInfo }).png().toBuffer();

  fs.writeFileSync(path.join(OUT_DIR, outFilename), finalPng);
  console.log(`Successfully rendered ${outFilename}: ${targetW}x${targetH} (cropped ${cropW}x${cropH} -> scaled ${scaledW}x${scaledH}, topPad=${topPad})`);
  return true;
}

// Full furniture catalog mapping
export const FURNITURE_CATALOG = [
  // Kitchen
  { file: 'pixel_art_table_test_1788959355833.jpg', w: 256, h: 192, out: 'furniture_dining_table.png' },
  { file: 'raw_pixel_fridge_1788960191904.jpg', w: 128, h: 160, out: 'furniture_fridge.png' },
  { file: 'raw_pixel_stove_1788960283074.jpg', w: 128, h: 128, out: 'furniture_stove.png' },
  { file: 'raw_pixel_dishwasher_1788960376484.jpg', w: 128, h: 128, out: 'furniture_dishwasher.png' },
  { file: 'raw_pixel_sink_counter_1788960467825.jpg', w: 192, h: 128, out: 'furniture_sink_counter.png' },
  { file: 'raw_pixel_kitchen_cabinet_1788960563573.jpg', w: 192, h: 128, out: 'furniture_kitchen_cabinet.png' },
  { file: 'raw_pixel_microwave_1788960662792.jpg', w: 72, h: 54, out: 'furniture_microwave.png' },
  { file: 'raw_pixel_coffee_maker_1788960762704.jpg', w: 64, h: 56, out: 'furniture_coffee_maker.png' },
  { file: 'raw_pixel_air_fryer_1788962366757.jpg', w: 64, h: 56, out: 'furniture_air_fryer.png' },

  // Bedroom
  { file: 'pixel_art_bed_test_1788959617417.jpg', w: 256, h: 192, out: 'furniture_bed.png' },
  { file: 'raw_pixel_wardrobe_1788962402208.jpg', w: 192, h: 160, out: 'furniture_wardrobe.png' },

  // Bathroom
  { file: 'pixel_art_shower_test_1788959531263.jpg', w: 192, h: 160, out: 'furniture_shower.png' },
  { file: 'raw_toilet_1788920461682.jpg', w: 128, h: 128, out: 'furniture_toilet.png' },
  { file: 'raw_bathroom_sink_1788903455536.jpg', w: 128, h: 128, out: 'furniture_bathroom_sink.png' },

  // Laundry
  { file: 'raw_washing_machine_1788903536068.jpg', w: 128, h: 128, out: 'furniture_washing_machine.png' },
  { file: 'raw_dryer_1788898420271.jpg', w: 128, h: 128, out: 'furniture_dryer.png' },
  { file: 'raw_laundry_sink_1788903508550.jpg', w: 128, h: 128, out: 'furniture_laundry_sink.png' },

  // Living Room
  { file: 'pixel_art_sofa_test_1788959448281.jpg', w: 192, h: 128, out: 'furniture_sofa.png' },
  { file: 'raw_tv_rack_1788903570697.jpg', w: 192, h: 160, out: 'furniture_tv_rack.png' },
  { file: 'raw_generic_1788898582402.jpg', w: 128, h: 128, out: 'furniture_generic.png' },
];

async function main() {
  console.log(`Starting clean pixel art rendering (${FURNITURE_CATALOG.length} items)...`);
  for (const item of FURNITURE_CATALOG) {
    await processItem(item.file, item.w, item.h, item.out);
  }
  console.log('All furniture catalog items rendered successfully!');
}

main().catch(console.error);
