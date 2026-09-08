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
  generic: { w: 1, h: 1 },
};

export const FURNITURE_PIXEL_SIZES: Record<string, FurniturePixelSize> = {
  fridge: { w: 128, h: 160 },
  stove: { w: 128, h: 128 },
  microwave: { w: 72, h: 54, offsetX: 28 },
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
  toilet: { w: 128, h: 112 },
  bathroom_sink: { w: 128, h: 128 },
  shower: { w: 192, h: 160, offsetX: -64 },
  washing_machine: { w: 128, h: 128 },
  dryer: { w: 128, h: 128 },
  laundry_sink: { w: 128, h: 128 },
  generic: { w: 128, h: 128 },
};

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
  const top = bottomY - pixels.h;

  const zIndex = ((gridX + footprint.w - 1) + (gridY + footprint.h - 1)) * 2 + 10;

  return {
    left,
    top,
    width: pixels.w,
    height: pixels.h,
    zIndex,
  };
}

