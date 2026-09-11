// Test collision check
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

const COUNTERTOP_ITEM_TYPES = ['microwave', 'coffee_maker', 'air_fryer'];
const COUNTER_SURFACE_ITEM_TYPES = ['sink_counter', 'kitchen_cabinet', 'dining_table', 'dining_table_simple'];

function getOccupiedCells(itemType, gridX, gridY) {
  const { w, h } = FURNITURE_SIZES[itemType] || { w: 1, h: 1 };
  const cells = [];
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      cells.push({ x: gridX + i, y: gridY + j });
    }
  }
  return cells;
}

function findCollisions(items) {
  const collisions = [];
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

function isCountertopProperlyPlaced(itemType, gridX, gridY, allPlacedItems) {
  if (!COUNTERTOP_ITEM_TYPES.includes(itemType)) return { valid: true };
  const surfaceItems = allPlacedItems.filter((item) => {
    const cells = getOccupiedCells(item.type, item.x, item.y);
    return cells.some((c) => c.x === gridX && c.y === gridY) && COUNTER_SURFACE_ITEM_TYPES.includes(item.type);
  });
  if (surfaceItems.length === 0) {
    return { valid: false, reason: 'Sem bancada' };
  }
  const conflictingAppliances = allPlacedItems.filter((item) => {
    if (item.type === itemType) return false;
    const cells = getOccupiedCells(item.type, item.x, item.y);
    return cells.some((c) => c.x === gridX && c.y === gridY) && COUNTERTOP_ITEM_TYPES.includes(item.type);
  });
  if (conflictingAppliances.length > 0) {
    return { valid: false, reason: 'Conflito de eletrodoméstico' };
  }
  return { valid: true };
}

module.exports = { findCollisions, isCountertopProperlyPlaced, getOccupiedCells, FURNITURE_SIZES };
