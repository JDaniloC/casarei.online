export const TILE_W = 128;
export const TILE_H = 64;
// Seamless flat tiles require 0 vertical offset for exact diamond intersection
export const TILE_Y_OFFSET = 0;

export function getIsoCoords(gridX: number, gridY: number, offsetX = 0, offsetY = 0) {
  return {
    x: (gridX - gridY) * (TILE_W / 2) + offsetX,
    y: (gridX + gridY) * (TILE_H / 2 - TILE_Y_OFFSET) + offsetY,
    // Multiply by 2 so walls can sit between floor depth layers (floor=even, wall=odd)
    zIndex: (gridX + gridY) * 2,
  };
}

export const ISO_ROOMS = {
  kitchen: { minX: 0, maxX: 3, minY: 0, maxY: 3 },
  bathroom: { minX: 4, maxX: 5, minY: 0, maxY: 3 },
  bedroom: { minX: 6, maxX: 9, minY: 0, maxY: 3 },
  laundry: { minX: 0, maxX: 1, minY: 4, maxY: 6 },
  living_room: { minX: 2, maxX: 9, minY: 4, maxY: 6 },
};

export interface FurnitureFootprint {
  w: number;
  h: number;
}

export interface FurniturePixelSize {
  w: number;
  h: number;
  offsetX?: number;
  offsetY?: number;
}

export const FURNITURE_SIZES: Record<string, FurnitureFootprint> = {
  fridge: { w: 1, h: 1 },
  stove: { w: 1, h: 1 },
  microwave: { w: 1, h: 1 },
  sink_counter: { w: 2, h: 1 },
  dining_table: { w: 2, h: 2 },
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
  shower: { w: 1, h: 2 },
  washing_machine: { w: 1, h: 1 },
  dryer: { w: 1, h: 1 },
  laundry_sink: { w: 1, h: 1 },
  coffee_maker: { w: 1, h: 1 },
  air_fryer: { w: 1, h: 1 },
  robot_vacuum: { w: 1, h: 1 },
  generic: { w: 1, h: 1 },
};

export const FURNITURE_PIXEL_SIZES: Record<string, FurniturePixelSize> = {
  fridge: { w: 128, h: 160 },
  stove: { w: 128, h: 128 },
  microwave: { w: 72, h: 54, offsetX: 28, offsetY: -34 },
  sink_counter: { w: 192, h: 128 },
  dining_table: { w: 256, h: 192, offsetX: -64 },
  kitchen_cabinet: { w: 192, h: 128 },
  dishwasher: { w: 128, h: 128 },
  sofa: { w: 192, h: 128 },
  tv_rack: { w: 192, h: 160 },
  coffee_table: { w: 128, h: 80 },
  armchair: { w: 128, h: 128 },
  bed: { w: 256, h: 192, offsetX: -64 },
  wardrobe: { w: 192, h: 160 },
  dresser: { w: 192, h: 128 },
  vanity: { w: 128, h: 128 },
  toilet: { w: 128, h: 128 },
  bathroom_sink: { w: 128, h: 128 },
  shower: { w: 192, h: 160, offsetX: -64 },
  washing_machine: { w: 128, h: 128 },
  dryer: { w: 128, h: 128 },
  laundry_sink: { w: 128, h: 128 },
  coffee_maker: { w: 64, h: 56, offsetX: 32, offsetY: -34 },
  air_fryer: { w: 64, h: 56, offsetX: 32, offsetY: -34 },
  robot_vacuum: { w: 64, h: 40, offsetX: 32 },
  generic: { w: 128, h: 128 },
};

// Posição padrão (grid x/y) de cada móvel do catálogo dentro do seu cômodo,
// usada para plantar o móvel assim que o casal ativa o item (antes de qualquer
// pagamento), sem exigir posicionamento manual no Dashboard.
export const DEFAULT_FURNITURE_POSITIONS: Record<string, { x: number; y: number }> = {
  // Cozinha (ISO_ROOMS.kitchen: x0-3, y0-3)
  fridge: { x: 0, y: 0 },
  stove: { x: 1, y: 0 },
  microwave: { x: 2, y: 0 },
  dishwasher: { x: 3, y: 0 },
  sink_counter: { x: 0, y: 1 },
  kitchen_cabinet: { x: 2, y: 1 },
  coffee_maker: { x: 0, y: 2 },
  air_fryer: { x: 3, y: 1 },
  dining_table: { x: 1, y: 2 },

  // Banheiro (ISO_ROOMS.bathroom: x4-5, y0-3)
  toilet: { x: 4, y: 0 },
  bathroom_sink: { x: 5, y: 0 },
  shower: { x: 4, y: 1 },

  // Quarto (ISO_ROOMS.bedroom: x6-9, y0-3)
  bed: { x: 6, y: 0 },
  wardrobe: { x: 8, y: 0 },
  dresser: { x: 8, y: 1 },
  vanity: { x: 6, y: 2 },

  // Área de Serviço (ISO_ROOMS.laundry: x0-1, y4-6)
  washing_machine: { x: 0, y: 4 },
  dryer: { x: 1, y: 4 },
  laundry_sink: { x: 0, y: 5 },

  // Sala de Estar (ISO_ROOMS.living_room: x2-9, y4-6)
  sofa: { x: 2, y: 4 },
  coffee_table: { x: 4, y: 4 },
  tv_rack: { x: 5, y: 4 },
  armchair: { x: 7, y: 4 },
  robot_vacuum: { x: 4, y: 5 },
};

// Eletrodomésticos de bancada — os únicos tipos com permissão de dividir célula
// com um balcão/armário (sentam "em cima" dele). Qualquer outra sobreposição
// entre dois itens é considerada colisão indevida — ver findCollisions().
export const COUNTERTOP_ITEM_TYPES = ['microwave', 'coffee_maker', 'air_fryer'];
export const COUNTER_SURFACE_ITEM_TYPES = ['sink_counter', 'kitchen_cabinet'];

export function getFurniturePlacement(
  itemType: string,
  gridX: number,
  gridY: number,
  mapOriginX = 0,
  mapOriginY = 0
) {
  const footprint = FURNITURE_SIZES[itemType] || { w: 1, h: 1 };
  const pixels = FURNITURE_PIXEL_SIZES[itemType] || { w: 128, h: 128 };
  const iso = getIsoCoords(gridX, gridY, mapOriginX, mapOriginY);

  const left = iso.x + (pixels.offsetX || 0);

  // The base of the footprint sits at the bottom vertex of (gridX + w - 1, gridY + h - 1)
  const bottomGridSum = (gridX + footprint.w - 1) + (gridY + footprint.h - 1);
  const bottomY = bottomGridSum * (TILE_H / 2 - TILE_Y_OFFSET) + TILE_H + mapOriginY;
  const top = bottomY - pixels.h + (pixels.offsetY || 0);

  // Small countertop appliances sit on top of furniture in the same cell
  const isCountertopItem = COUNTERTOP_ITEM_TYPES.includes(itemType);
  const zIndex = ((gridX + footprint.w - 1) + (gridY + footprint.h - 1)) * 2 + 100 + (isCountertopItem ? 3 : 0);

  return {
    left,
    top,
    width: pixels.w,
    height: pixels.h,
    zIndex,
  };
}

/** Todas as células (x,y) que um móvel ocupa a partir do seu canto superior-esquerdo. */
export function getOccupiedCells(itemType: string, gridX: number, gridY: number): { x: number; y: number }[] {
  const { w, h } = FURNITURE_SIZES[itemType] || { w: 1, h: 1 };
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      cells.push({ x: gridX + i, y: gridY + j });
    }
  }
  return cells;
}

export interface PlacedItem {
  type: string;
  x: number;
  y: number;
}

/**
 * Encontra pares de itens posicionados que dividem pelo menos uma célula sem que
 * isso seja a sobreposição intencional de um eletrodoméstico de bancada em cima
 * de um balcão/armário.
 */
export function findCollisions(items: PlacedItem[]): [PlacedItem, PlacedItem][] {
  const collisions: [PlacedItem, PlacedItem][] = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const cellsA = getOccupiedCells(a.type, a.x, a.y);
      const cellsB = getOccupiedCells(b.type, b.x, b.y);
      const overlaps = cellsA.some((ca) => cellsB.some((cb) => ca.x === cb.x && ca.y === cb.y));
      if (!overlaps) continue;

      const isAllowedStack =
        (COUNTERTOP_ITEM_TYPES.includes(a.type) && COUNTER_SURFACE_ITEM_TYPES.includes(b.type)) ||
        (COUNTERTOP_ITEM_TYPES.includes(b.type) && COUNTER_SURFACE_ITEM_TYPES.includes(a.type));

      if (!isAllowedStack) {
        collisions.push([a, b]);
      }
    }
  }

  return collisions;
}

