import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_DIR = path.join(__dirname, 'raw_assets');
const OUTPUT_DIR = path.join(__dirname, 'public', 'assets', 'iso');

// Create raw_assets directory if it doesn't exist
if (!fs.existsSync(INPUT_DIR)) {
  fs.mkdirSync(INPUT_DIR, { recursive: true });
}
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Target dimensions mapping
const TARGET_SIZES = {
  // Floor Tiles
  tile_foundation: { w: 128, h: 64 },
  tile_kitchen: { w: 128, h: 64 },
  tile_bathroom: { w: 128, h: 64 },
  tile_bedroom: { w: 128, h: 64 },
  tile_living: { w: 128, h: 64 },
  tile_laundry: { w: 128, h: 64 },

  // Wall Segments
  wall_left: { w: 64, h: 128 },
  wall_right: { w: 64, h: 128 },
  wall_left_painted: { w: 64, h: 128 },
  wall_right_painted: { w: 64, h: 128 },
  wall_door: { w: 64, h: 128 },
  wall_window: { w: 64, h: 128 },

  // Overlays
  roof: { w: 700, h: 400 },
  light_ceiling: { w: 32, h: 48 },
  pipe_sink: { w: 32, h: 32 },
  pipe_shower: { w: 32, h: 32 },

  // Kitchen
  furniture_fridge: { w: 128, h: 160 },
  furniture_stove: { w: 128, h: 128 },
  furniture_microwave: { w: 128, h: 96 },
  furniture_sink_counter: { w: 192, h: 128 },
  furniture_dining_table: { w: 256, h: 192 },
  furniture_kitchen_cabinet: { w: 192, h: 128 },
  furniture_dishwasher: { w: 128, h: 128 },

  // Living Room
  furniture_sofa: { w: 192, h: 128 },
  furniture_tv_rack: { w: 192, h: 160 },
  furniture_coffee_table: { w: 128, h: 80 },
  furniture_armchair: { w: 128, h: 128 },

  // Bedroom
  furniture_bed: { w: 256, h: 192 },
  furniture_wardrobe: { w: 192, h: 160 },
  furniture_dresser: { w: 192, h: 128 },
  furniture_vanity: { w: 128, h: 128 },

  // Bathroom
  furniture_toilet: { w: 128, h: 112 },
  furniture_bathroom_sink: { w: 128, h: 128 },
  furniture_shower: { w: 192, h: 160 },

  // Laundry
  furniture_washing_machine: { w: 128, h: 128 },
  furniture_dryer: { w: 128, h: 128 },
  furniture_laundry_sink: { w: 128, h: 128 },
  furniture_generic: { w: 128, h: 128 },
};

async function processImages() {
  const files = fs.readdirSync(INPUT_DIR);
  
  if (files.length === 0) {
    console.log(`\nA pasta "raw_assets" está vazia.`);
    console.log(`Coloque suas imagens com fundo transparente geradas pela IA na pasta:`);
    console.log(`=> ${INPUT_DIR}`);
    console.log(`Nomes suportados (ex: tile_bathroom.png, furniture_bed.png, etc)\n`);
    return;
  }

  console.log(`Encontradas ${files.length} imagens em raw_assets. Processando...`);

  for (const file of files) {
    if (!file.endsWith('.png')) {
      console.log(`Skipping ${file} - Not a PNG file.`);
      continue;
    }

    const baseName = path.basename(file, '.png');
    const targetSize = TARGET_SIZES[baseName];

    if (!targetSize) {
      console.log(`Skipping ${file} - Nome não reconhecido no dicionário de tamanhos.`);
      continue;
    }

    const inputPath = path.join(INPUT_DIR, file);
    const outputPath = path.join(OUTPUT_DIR, file);

    try {
      // Step 1: Trim the transparent pixels from all edges
      // Step 2: Resize to the target width/height exactly (forcing fit)
      // We use "fill" fit to squeeze the cropped image exactly into the bounding box.
      await sharp(inputPath)
        .trim({ threshold: 10 }) // Removes transparent/empty edges
        .resize({
          width: targetSize.w,
          height: targetSize.h,
          fit: 'fill' // Squeezes exact proportions
        })
        .toFile(outputPath);

      console.log(`✅ Processado: ${file} -> Crop e Resize para ${targetSize.w}x${targetSize.h}`);
    } catch (err) {
      console.error(`❌ Erro processando ${file}:`, err.message);
    }
  }

  console.log(`\n🎉 Processamento concluído! As imagens formatadas foram salvas em: ${OUTPUT_DIR}\n`);
}

processImages();
