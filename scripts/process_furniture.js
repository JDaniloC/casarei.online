import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACT_DIR = 'C:\\Users\\danil\\.gemini\\antigravity-ide\\brain\\3c6d2009-04b8-4fdb-96f3-0d88fef6bc61';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'iso');

const TARGET_SIZES = {
  furniture_dryer: { w: 128, h: 128 },
  furniture_wardrobe: { w: 192, h: 160 },
  furniture_shower: { w: 192, h: 160 },
  furniture_microwave: { w: 72, h: 54 },
  furniture_sink_counter: { w: 192, h: 128 },
  furniture_kitchen_cabinet: { w: 192, h: 128 },
  furniture_generic: { w: 128, h: 128 },
  furniture_stove: { w: 128, h: 128 },
  furniture_bathroom_sink: { w: 128, h: 128 },
  furniture_laundry_sink: { w: 128, h: 128 },
  furniture_washing_machine: { w: 128, h: 128 },
  furniture_toilet: { w: 80, h: 96 },
  furniture_tv_rack: { w: 192, h: 160 },
  furniture_dining_table: { w: 256, h: 192 },
  furniture_bed: { w: 256, h: 192 },
  furniture_fridge: { w: 128, h: 160 },
  furniture_dishwasher: { w: 128, h: 128 },
  furniture_sofa: { w: 192, h: 128 },
};

const RAW_FILE_PREFIXES = {
  furniture_dryer: 'raw_dryer',
  furniture_wardrobe: 'raw_wardrobe',
  furniture_shower: 'raw_shower',
  furniture_microwave: 'raw_microwave',
  furniture_sink_counter: 'raw_sink_counter',
  furniture_kitchen_cabinet: 'raw_kitchen_cabinet',
  furniture_generic: 'raw_generic',
  furniture_stove: 'raw_stove',
  furniture_bathroom_sink: 'raw_bathroom_sink',
  furniture_laundry_sink: 'raw_laundry_sink',
  furniture_washing_machine: 'raw_washing_machine',
  furniture_toilet: 'raw_toilet',
  furniture_tv_rack: 'raw_tv_rack',
  furniture_dining_table: 'raw_dining_table',
  furniture_bed: 'raw_bed',
  furniture_fridge: 'raw_fridge',
  furniture_dishwasher: 'raw_dishwasher',
  furniture_sofa: 'raw_sofa',
};

async function removeWhiteBackgroundFloodFill(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const visited = new Uint8Array(width * height);
  const queue = [];

  const isWhite = (x, y, threshold = 238) => {
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    return r >= threshold && g >= threshold && b >= threshold && maxDiff <= 10;
  };

  // 1. Flood fill from perimeter
  for (let x = 0; x < width; x++) {
    if (isWhite(x, 0)) { queue.push(x); visited[x] = 1; }
    if (isWhite(x, height - 1)) { queue.push((height - 1) * width + x); visited[(height - 1) * width + x] = 1; }
  }
  for (let y = 0; y < height; y++) {
    if (isWhite(0, y)) { queue.push(y * width); visited[y * width] = 1; }
    if (isWhite(width - 1, y)) { queue.push(y * width + (width - 1)); visited[y * width + (width - 1)] = 1; }
  }

  let head = 0;
  while (head < queue.length) {
    const pos = queue[head++];
    const x = pos % width;
    const y = Math.floor(pos / width);

    data[pos * 4 + 3] = 0; // Transparent

    const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nPos = ny * width + nx;
        if (!visited[nPos] && isWhite(nx, ny, 236)) {
          visited[nPos] = 1;
          queue.push(nPos);
        }
      }
    }
  }

  // 2. DEFRINGE: Eliminate the white halo around the boundary
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const pos = y * width + x;
        if (data[pos * 4 + 3] === 0) continue;

        const hasTransparentNeighbor =
          data[((y - 1) * width + x) * 4 + 3] === 0 ||
          data[((y + 1) * width + x) * 4 + 3] === 0 ||
          data[(y * width + (x - 1)) * 4 + 3] === 0 ||
          data[(y * width + (x + 1)) * 4 + 3] === 0;

        if (hasTransparentNeighbor) {
          const idx = pos * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const brightness = (r + g + b) / 3;
          const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));

          // If edge pixel is very bright and neutral (white background bleed), strip it
          if (brightness > 230 && maxDiff < 14) {
            data[idx + 3] = 0;
          }
        }
      }
    }
  }

  // 3. Color Decontamination for remaining anti-aliased edge pixels:
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const pos = y * width + x;
      const alpha = data[pos * 4 + 3];
      if (alpha === 0) continue;

      const neighbors = [
        [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1],
        [x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]
      ];

      const hasTransNeighbor = neighbors.some(([nx, ny]) => data[(ny * width + nx) * 4 + 3] === 0);

      if (hasTransNeighbor) {
        let bestNeighbor = null;
        let lowestBrightness = 999;

        for (const [nx, ny] of neighbors) {
          const nPos = ny * width + nx;
          if (data[nPos * 4 + 3] === 255) {
            const nr = data[nPos * 4];
            const ng = data[nPos * 4 + 1];
            const nb = data[nPos * 4 + 2];
            const b = (nr + ng + nb) / 3;
            if (b < lowestBrightness) {
              lowestBrightness = b;
              bestNeighbor = [nr, ng, nb];
            }
          }
        }

        if (bestNeighbor) {
          const idx = pos * 4;
          const curR = data[idx];
          const curG = data[idx + 1];
          const curB = data[idx + 2];
          const curBrt = (curR + curG + curB) / 3;

          if (curBrt > lowestBrightness + 20) {
            data[idx] = Math.round(curR * 0.4 + bestNeighbor[0] * 0.6);
            data[idx + 1] = Math.round(curG * 0.4 + bestNeighbor[1] * 0.6);
            data[idx + 2] = Math.round(curB * 0.4 + bestNeighbor[2] * 0.6);
          }
        }
      }
    }
  }

  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function processAll() {
  const artifactFiles = fs.readdirSync(ARTIFACT_DIR);

  const rawDir = path.join(__dirname, '..', 'raw_assets');
  const rawDirFiles = fs.existsSync(rawDir) ? fs.readdirSync(rawDir) : [];

  for (const [key, target] of Object.entries(TARGET_SIZES)) {
    const prefix = RAW_FILE_PREFIXES[key];
    // Find all matches in ARTIFACT_DIR and sort to get the latest
    const matches = artifactFiles
      .filter(f => f.startsWith(prefix) && (f.endsWith('.jpg') || f.endsWith('.png')))
      .sort(); // Lexicographical sort on timestamp suffix puts newest last

    let rawPath = null;
    let matchName = null;

    if (matches.length > 0) {
      matchName = matches[matches.length - 1];
      rawPath = path.join(ARTIFACT_DIR, matchName);
    } else {
      const rawMatch = rawDirFiles.find(f => f.startsWith(prefix) && (f.endsWith('.jpg') || f.endsWith('.png')));
      if (rawMatch) {
        matchName = rawMatch;
        rawPath = path.join(rawDir, rawMatch);
      }
    }

    if (!rawPath) {
      console.warn(`No raw file found for ${key} (prefix ${prefix})`);
      continue;
    }
    console.log(`Processing ${key} from ${matchName}...`);

    const rawBuffer = fs.readFileSync(rawPath);
    const transparentBuffer = await removeWhiteBackgroundFloodFill(rawBuffer);

    // Save to public/assets/iso/<key>.png with trim & bottom alignment
    const outputPath = path.join(OUTPUT_DIR, `${key}.png`);

    await sharp(transparentBuffer)
      .trim({ threshold: 10 })
      .resize({
        width: target.w,
        height: target.h,
        fit: 'contain',
        position: 'bottom',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toFile(outputPath);

    console.log(`✅ Salvo: ${outputPath} (${target.w}x${target.h})`);
  }
}

processAll().catch(console.error);
