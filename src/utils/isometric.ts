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
  laundry: { minX: 0, maxX: 3, minY: 4, maxY: 6 },
  living_room: { minX: 4, maxX: 9, minY: 4, maxY: 6 },
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
  dining_table: { w: 2, h: 1 },
  dining_chair: { w: 1, h: 1 },
  dining_chair_back: { w: 1, h: 1 },
  dining_table_simple: { w: 2, h: 1 },
  kitchen_cabinet: { w: 1, h: 2 },
  dishwasher: { w: 1, h: 1 },
  sofa: { w: 2, h: 1 },
  tv_rack: { w: 1, h: 2 },
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

export const FURNITURE_PIXEL_SIZES: Record<string, FurniturePixelSize> = {
  fridge: { w: 128, h: 160 },
  stove: { w: 128, h: 128 },
  microwave: { w: 72, h: 54, offsetX: 28, offsetY: -64 },
  sink_counter: { w: 192, h: 128 },
  dining_table: { w: 192, h: 128 },
  dining_chair: { w: 128, h: 128 },
  dining_chair_back: { w: 128, h: 128 },
  dining_table_simple: { w: 192, h: 128 },
  kitchen_cabinet: { w: 192, h: 128, offsetX: -64, offsetY: 0 },
  dishwasher: { w: 128, h: 128 },
  sofa: { w: 192, h: 160, offsetY: -2 },
  tv_rack: { w: 192, h: 160, offsetX: -64, offsetY: -4 },
  coffee_table: { w: 128, h: 80 },
  armchair: { w: 128, h: 128, offsetY: 0 },
  bed: { w: 256, h: 192, offsetX: -64, offsetY: -4 },
  wardrobe: { w: 192, h: 186, offsetX: 0, offsetY: -8 },
  dresser: { w: 192, h: 128 },
  vanity: { w: 128, h: 128 },
  toilet: { w: 128, h: 128 },
  bathroom_sink: { w: 128, h: 160, offsetX: 0, offsetY: -4 },
  shower: { w: 128, h: 186 },
  washing_machine: { w: 128, h: 128 },
  dryer: { w: 128, h: 128 },
  laundry_sink: { w: 128, h: 128 },
  coffee_maker: { w: 64, h: 56, offsetX: 36, offsetY: -62 },
  air_fryer: { w: 64, h: 56, offsetX: 32, offsetY: -62 },
  robot_vacuum: { w: 64, h: 48, offsetX: 32, offsetY: -8 },
  generic: { w: 128, h: 128, offsetY: 0 },
};

// Posição padrão (grid x/y) de cada móvel do catálogo dentro do seu cômodo,
// usada para plantar o móvel assim que o casal ativa o item (antes de qualquer
// pagamento), sem exigir posicionamento manual no Dashboard.
export const DEFAULT_FURNITURE_POSITIONS: Record<string, { x: number; y: number }> = {
  // Cozinha (ISO_ROOMS.kitchen: x0-3, y0-3)
  kitchen_cabinet: { x: 0, y: 0 }, // 1x2 na parede NW (0,0)..(0,1) voltado para SE (+X)
  microwave: { x: 0, y: 0 },       // Sobre kitchen_cabinet em (0,0) voltado para SE (+X)
  air_fryer: { x: 0, y: 1 },       // Sobre kitchen_cabinet em (0,1) voltado para SE (+X)
  sink_counter: { x: 1, y: 0 },    // 2x1 na parede NE (1,0)..(2,0) sob a janela x=1, voltado para SW (+Y)
  coffee_maker: { x: 1, y: 0 },    // Sobre sink_counter em (1,0) voltada para SW (+Y)
  fridge: { x: 3, y: 0 },          // Na parede NE (3,0) voltada para SW (+Y)
  stove: { x: 0, y: 2 },           // Na parede NW (0,2) voltado para SE (+X)
  dishwasher: { x: 0, y: 3 },      // Na parede NW (0,3) voltada para SE (+X)
  dining_chair: { x: 2, y: 1 },    // Atrás da mesa olhando para SW (+Y)
  dining_table: { x: 2, y: 2 },    // Mesa 2x1 em (2,2)..(3,2)
  dining_table_simple: { x: 2, y: 2 },

  // Banheiro (ISO_ROOMS.bathroom: x4-5, y0-3)
  shower: { x: 4, y: 0 },
  bathroom_sink: { x: 5, y: 0 },
  toilet: { x: 5, y: 2 },          // Voltado para SW (+Y) dentro do banheiro

  // Quarto (ISO_ROOMS.bedroom: x6-9, y0-3)
  bed: { x: 6, y: 0 },             // Sob a janela NE em x=6
  wardrobe: { x: 8, y: 0 },        // Canto direito NE (8,0)..(9,0)
  dresser: { x: 6, y: 2 },
  vanity: { x: 9, y: 2 },          // Voltada para SW (+Y) dentro do quarto

  // Área de Serviço (ISO_ROOMS.laundry: x0-3, y4-6)
  dryer: { x: 0, y: 4 },           // Parede NW (0,4) voltada para SE (+X)
  laundry_sink: { x: 0, y: 5 },    // Parede NW (0,5) sob a janela y=5, voltado para SE (+X)
  washing_machine: { x: 0, y: 6 }, // Parede NW (0,6) voltada para SE (+X)

  // Sala de Estar (ISO_ROOMS.living_room: x4-9, y4-6)
  tv_rack: { x: 4, y: 4 },       // 1x2 na divisa esquerda (4,4)..(4,5) voltado para SE (+X)
  sofa: { x: 7, y: 4 },          // 2x1 frontal em (7,4)..(8,4) voltado para SW (+Y)
  coffee_table: { x: 7, y: 5 },  // Centralizada em frente ao sofá em (7,5)
  armchair: { x: 6, y: 6 },      // Voltada para SE (+X) olhando para a mesa e sofá sem cobrir a TV
  robot_vacuum: { x: 7, y: 6 },  // Piso livre da sala, 100% desobstruído
  generic: { x: 9, y: 6 },       // Presente surpresa no canto frontal direito
};

// Eletrodomésticos de bancada — os únicos tipos com permissão de dividir célula
// com um balcão/armário/mesa (sentam "em cima" dele). Qualquer outra sobreposição
// entre dois itens é considerada colisão indevida — ver findCollisions().
export const COUNTERTOP_ITEM_TYPES = ['microwave', 'coffee_maker', 'air_fryer'];
export const COUNTER_SURFACE_ITEM_TYPES = ['sink_counter', 'kitchen_cabinet', 'dining_table', 'dining_table_simple'];

export function getFurnitureSpriteKey(
  itemType: string,
  gridX: number,
  gridY: number,
  allPlacedItems?: PlacedItem[]
): string {
  if (itemType === "dining_chair") {
    const table = allPlacedItems?.find(
      (i) => i.type === "dining_table" || i.type === "dining_table_simple"
    );
    const tableY = table ? table.y : DEFAULT_FURNITURE_POSITIONS.dining_table.y;
    if (gridY > tableY) {
      return "dining_chair_back";
    }
  }
  return itemType;
}

export function getFurniturePlacement(
  itemType: string,
  gridX: number,
  gridY: number,
  mapOriginX = 0,
  mapOriginY = 0,
  allPlacedItems?: PlacedItem[]
) {
  const footprint = FURNITURE_SIZES[itemType] || { w: 1, h: 1 };
  const pixels = FURNITURE_PIXEL_SIZES[itemType] || { w: 128, h: 128 };
  const iso = getIsoCoords(gridX, gridY, mapOriginX, mapOriginY);

  const left = iso.x + (pixels.offsetX || 0);

  // The base of the footprint sits at the bottom vertex of (gridX + w - 1, gridY + h - 1)
  const frontX = gridX + footprint.w - 1;
  const frontY = gridY + footprint.h - 1;
  const bottomGridSum = frontX + frontY;
  const bottomY = bottomGridSum * (TILE_H / 2 - TILE_Y_OFFSET) + TILE_H + mapOriginY;
  const top = bottomY - pixels.h + (pixels.offsetY || 0);

  // Small countertop appliances sit on top of furniture in the same cell
  const isCountertopItem = COUNTERTOP_ITEM_TYPES.includes(itemType);

  // Depth sorting:
  // Strictly guarantees that furniture further to the back (smaller Y) is COVERED
  // by furniture closer to the camera (larger Y):
  // 1. Primary depth: total distance along the isometric camera viewing axis (frontX + frontY)
  // 2. Secondary depth (tie-breaker for same distance): frontY (items with larger frontY
  //    are closer to the camera and must render on top — e.g. vanity at gridY=2 covers
  //    bed whose back reaches gridY=0, even when both share the same frontSum)
  // 3. Countertop elevation: countertop appliances (microwave, coffee_maker, air_fryer) sit on top of their host counter (+10)
  let hostFrontX = frontX;
  let hostFrontY = frontY;
  if (isCountertopItem) {
    if (allPlacedItems && allPlacedItems.length > 0) {
      const host = allPlacedItems.find((item) => {
        if (item.type === itemType) return false;
        if (!COUNTER_SURFACE_ITEM_TYPES.includes(item.type)) return false;
        const cells = getOccupiedCells(item.type, item.x, item.y);
        return cells.some((c) => c.x === gridX && c.y === gridY);
      });
      if (host) {
        const hostFootprint = FURNITURE_SIZES[host.type] || { w: 1, h: 1 };
        hostFrontX = host.x + hostFootprint.w - 1;
        hostFrontY = host.y + hostFootprint.h - 1;
      }
    } else {
      if (itemType === 'air_fryer' && gridX === 2) hostFrontX = 3;
      if (itemType === 'air_fryer' && gridX === 0) hostFrontX = 1;
      if (itemType === 'coffee_maker' && gridX === 1) hostFrontX = 2;
      if (itemType === 'microwave' && gridX === 1 && gridY === 3) { hostFrontX = 1; hostFrontY = 3; }
      else if (itemType === 'microwave' && gridX === 1) hostFrontX = 2;
      else if (itemType === 'microwave' && gridX === 2) hostFrontX = 2;
    }
  }

  const baseDepth = (hostFrontX + hostFrontY) * 10000;
  const horizontalTier = hostFrontY * 100;
  const countertopBoost = isCountertopItem ? 50 : 0;
  const zIndex = baseDepth + horizontalTier + countertopBoost + 100;

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

/**
 * Valida se um eletrodoméstico de bancada (micro-ondas, cafeteira, air fryer) está
 * obrigatoriamente posicionado sobre uma superfície adequada (bancada, armário ou mesa)
 * e não em chão puro ou sobreposto a outro eletrodoméstico.
 */
export function isCountertopProperlyPlaced(
  itemType: string,
  gridX: number,
  gridY: number,
  allPlacedItems: PlacedItem[],
  currentItemId?: string
): { valid: boolean; reason?: string } {
  if (!COUNTERTOP_ITEM_TYPES.includes(itemType)) {
    return { valid: true };
  }

  const surfaceItems = allPlacedItems.filter((item) => {
    if (currentItemId && (item as any).id === currentItemId) return false;
    const cells = getOccupiedCells(item.type, item.x, item.y);
    return cells.some((c) => c.x === gridX && c.y === gridY) && COUNTER_SURFACE_ITEM_TYPES.includes(item.type);
  });

  if (surfaceItems.length === 0) {
    return {
      valid: false,
      reason: "Eletrodomésticos como micro-ondas, air fryer e cafeteira devem ser colocados obrigatoriamente sobre uma bancada, armário ou mesa.",
    };
  }

  const conflictingAppliances = allPlacedItems.filter((item) => {
    if (currentItemId && (item as any).id === currentItemId) return false;
    const cells = getOccupiedCells(item.type, item.x, item.y);
    return cells.some((c) => c.x === gridX && c.y === gridY) && COUNTERTOP_ITEM_TYPES.includes(item.type);
  });

  if (conflictingAppliances.length > 0) {
    return {
      valid: false,
      reason: "Já existe outro eletrodoméstico neste ponto da bancada ou mesa.",
    };
  }

  return { valid: true };
}


/** Altura (px) das paredes loft acima do piso: o beiral do telhado pousa aqui. */
export const WALL_HEIGHT = 160;

/**
 * Medidas do sprite roof.png (700x400) obtidas por varredura de alfa:
 * vertice esquerdo do beiral em y=184, vertice direito em x=698.
 */
export const ROOF_SPRITE = { width: 700, height: 400, rightX: 698, leftY: 184 };

/**
 * Posiciona o telhado para que o losango do beiral coincida com o topo das paredes:
 * a escala vem da largura do piso (vertice esquerdo do tile 0,6 ate o vertice direito do tile 9,0)
 * e o vertice esquerdo do beiral fica WALL_HEIGHT acima do vertice esquerdo do piso.
 */
export function getRoofPlacement(originX: number, originY: number) {
  const bottomLeft = getIsoCoords(0, 6, originX, originY);
  const topRight = getIsoCoords(9, 0, originX, originY);
  const floorLeftX = bottomLeft.x;
  const floorRightX = topRight.x + TILE_W;
  const floorLeftY = bottomLeft.y + TILE_H / 2;
  const scale = (floorRightX - floorLeftX) / ROOF_SPRITE.rightX;
  return {
    left: Math.round(floorLeftX),
    top: Math.round(floorLeftY - WALL_HEIGHT - ROOF_SPRITE.leftY * scale),
    width: Math.round(ROOF_SPRITE.width * scale),
    height: Math.round(ROOF_SPRITE.height * scale),
  };
}
