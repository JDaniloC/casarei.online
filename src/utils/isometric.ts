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

export const FURNITURE_PIXEL_SIZES: Record<string, FurniturePixelSize> = {
  fridge: { w: 128, h: 160 },
  stove: { w: 128, h: 128, offsetX: 2, offsetY: -2 },
  microwave: { w: 72, h: 54, offsetX: 36, offsetY: -74 },
  sink_counter: { w: 192, h: 128 },
  dining_table: { w: 256, h: 192, offsetX: -64 },
  dining_table_simple: { w: 192, h: 128 },
  kitchen_cabinet: { w: 192, h: 128, offsetX: 16, offsetY: 8 },
  dishwasher: { w: 128, h: 128 },
  sofa: { w: 192, h: 160 },
  tv_rack: { w: 192, h: 160 },
  coffee_table: { w: 128, h: 80 },
  armchair: { w: 128, h: 128 },
  bed: { w: 256, h: 192, offsetX: -64, offsetY: -4 },
  wardrobe: { w: 192, h: 186 },
  dresser: { w: 192, h: 128 },
  vanity: { w: 128, h: 128 },
  toilet: { w: 128, h: 128, offsetX: 0, offsetY: 0 },
  bathroom_sink: { w: 128, h: 160, offsetX: -14 },
  shower: { w: 128, h: 186 },
  washing_machine: { w: 128, h: 128 },
  dryer: { w: 128, h: 128 },
  laundry_sink: { w: 128, h: 128 },
  coffee_maker: { w: 64, h: 56, offsetX: 32, offsetY: -66 },
  air_fryer: { w: 64, h: 56, offsetX: 40, offsetY: -62 },
  robot_vacuum: { w: 64, h: 48, offsetX: 32, offsetY: 0 },
  generic: { w: 128, h: 128 },
};

// Posição padrão (grid x/y) de cada móvel do catálogo dentro do seu cômodo,
// usada para plantar o móvel assim que o casal ativa o item (antes de qualquer
// pagamento), sem exigir posicionamento manual no Dashboard.
export const DEFAULT_FURNITURE_POSITIONS: Record<string, { x: number; y: number }> = {
  // Cozinha (ISO_ROOMS.kitchen: x0-3, y0-3)
  fridge: { x: 0, y: 0 },
  dishwasher: { x: 0, y: 2 }, // Parede lateral na linha da ilha, liberando 100% da visão da geladeira e corredor livre em y=1
  sink_counter: { x: 1, y: 0 },
  coffee_maker: { x: 1, y: 0 }, // Senta na bancada da pia (1,0) sob a janela
  stove: { x: 3, y: 0 },
  kitchen_cabinet: { x: 2, y: 2 }, // Ilha gourmet central (2,2) e (3,2) com corredor de circulação livre em y=1
  air_fryer: { x: 2, y: 2 }, // Senta na metade esquerda da ilha gourmet (2,2)
  microwave: { x: 3, y: 2 }, // Senta na metade direita da ilha gourmet (3,2)
  dining_table: { x: 2, y: 4 }, // Sala de jantar integrada entre cozinha e living
  dining_table_simple: { x: 2, y: 4 },

  // Banheiro (ISO_ROOMS.bathroom: x4-5, y0-3)
  shower: { x: 4, y: 0 }, // Box shower no canto reservado
  bathroom_sink: { x: 5, y: 0 }, // Na parede de fundo com espelho LED (5,0)
  toilet: { x: 4, y: 2 }, // Encostado na parede lateral divisória (4,2), deixando cuba e circulação 100% livres e longe do quarto

  // Quarto (ISO_ROOMS.bedroom: x6-9, y0-3)
  wardrobe: { x: 8, y: 0 }, // Guarda-roupa 3 portas na parede de fundo
  bed: { x: 6, y: 0 }, // Cama queen size encostada na parede de fundo (6,0)..(7,1)
  vanity: { x: 8, y: 2 }, // Penteadeira com espelho camarim no closet ao lado do guarda-roupa
  dresser: { x: 6, y: 3 }, // Cômoda 6 gavetas baixa na divisória, pés da cama livres e zero sobreposição com a TV

  // Área de Serviço (ISO_ROOMS.laundry: x0-1, y4-6)
  washing_machine: { x: 0, y: 4 },
  dryer: { x: 0, y: 5 }, // Sob a janela da área de serviço
  laundry_sink: { x: 0, y: 6 }, // Tanque inox no canto

  // Sala de Estar (ISO_ROOMS.living_room: x2-9, y4-6)
  tv_rack: { x: 7, y: 4 }, // Centralizado na parede divisória do quarto
  sofa: { x: 4, y: 5 }, // Sofá confortável
  coffee_table: { x: 6, y: 5 }, // Mesa de centro integrada no living
  armchair: { x: 7, y: 6 }, // Poltrona em ângulo aconchegante na frente
  robot_vacuum: { x: 5, y: 6 }, // Robô aspirador no piso livre
  generic: { x: 9, y: 4 }, // Presente surpresa decorativo no canto
};

// Eletrodomésticos de bancada — os únicos tipos com permissão de dividir célula
// com um balcão/armário/mesa (sentam "em cima" dele). Qualquer outra sobreposição
// entre dois itens é considerada colisão indevida — ver findCollisions().
export const COUNTERTOP_ITEM_TYPES = ['microwave', 'coffee_maker', 'air_fryer'];
export const COUNTER_SURFACE_ITEM_TYPES = ['sink_counter', 'kitchen_cabinet', 'dining_table', 'dining_table_simple'];

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
      if (itemType === 'coffee_maker' && gridX === 1) hostFrontX = 2;
      if (itemType === 'coffee_maker' && gridX === 0) hostFrontX = 1;
      if (itemType === 'microwave' && gridX === 2) hostFrontX = 3;
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

