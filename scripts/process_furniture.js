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
  furniture_microwave: { w: 128, h: 96 },
  furniture_sink_counter: { w: 192, h: 128 },
  furniture_kitchen_cabinet: { w: 192, h: 128 },
  furniture_generic: { w: 128, h: 128 },
};

const RAW_FILE_PREFIXES = {
  furniture_dryer: 'raw_dryer',
  furniture_wardrobe: 'raw_wardrobe',
  furniture_shower: 'raw_shower',
  furniture_microwave: 'raw_microwave',
  furniture_sink_counter: 'raw_sink_counter',
  furniture_kitchen_cabinet: 'raw_kitchen_cabinet',
  furniture_generic: 'raw_generic',
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

  const isWhite = (x, y) => {
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    // Background threshold (pure or near-pure white)
    return r >= 242 && g >= 242 && b >= 242;
  };

  // Seed flood fill from all perimeter pixels
  for (let x = 0; x < width; x++) {
    if (isWhite(x, 0)) { queue.push((0 * width) + x); visited[(0 * width) + x] = 1; }
    if (isWhite(x, height - 1)) { queue.push(((height - 1) * width) + x); visited[((height - 1) * width) + x] = 1; }
  }
  for (let y = 0; y < height; y++) {
    if (isWhite(0, y)) { queue.push((y * width) + 0); visited[(y * width) + 0] = 1; }
    if (isWhite(width - 1, y)) { queue.push((y * width) + (width - 1)); visited[(y * width) + (width - 1)] = 1; }
  }

  let head = 0;
  while (head < queue.length) {
    const pos = queue[head++];
    const x = pos % width;
    const y = Math.floor(pos / width);

    // Set alpha to 0 for background
    data[pos * 4 + 3] = 0;

    // Check 4-connected neighbors
    const neighbors = [
      [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nPos = ny * width + nx;
        if (!visited[nPos] && isWhite(nx, ny)) {
          visited[nPos] = 1;
          queue.push(nPos);
        }
      }
    }
  }

  // Also soften edge transition (1px anti-alias border)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const pos = y * width + x;
      if (visited[pos]) continue; // already transparent

      // Check if neighboring transparent pixel
      const hasTransparentNeighbor =
        visited[(y - 1) * width + x] ||
        visited[(y + 1) * width + x] ||
        visited[y * width + (x - 1)] ||
        visited[y * width + (x + 1)];

      if (hasTransparentNeighbor) {
        const idx = pos * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const brightness = (r + g + b) / 3;
        if (brightness > 230) {
          // Soft blend
          data[idx + 3] = Math.round((255 - brightness) * (255 / 25));
        }
      }
    }
  }

  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function processAll() {
  const artifactFiles = fs.readdirSync(ARTIFACT_DIR);

  for (const [key, target] of Object.entries(TARGET_SIZES)) {
    const prefix = RAW_FILE_PREFIXES[key];
    const match = artifactFiles.find(f => f.startsWith(prefix) && (f.endsWith('.jpg') || f.endsWith('.png')));
    if (!match) {
      console.warn(`No raw file found for ${key} (prefix ${prefix})`);
      continue;
    }

    const rawPath = path.join(ARTIFACT_DIR, match);
    console.log(`Processing ${key} from ${match}...`);

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
