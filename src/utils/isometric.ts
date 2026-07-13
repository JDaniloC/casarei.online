export const TILE_W = 128;
export const TILE_H = 64;
// We overlap the tiles on the Y axis by 3 pixels to hide the "staircase" border thickness
export const TILE_Y_OFFSET = 3;

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
