import { describe, it, expect } from "vitest";
import { DEFAULT_FURNITURE_POSITIONS, findCollisions, getFurniturePlacement, getFurnitureSpriteKey, isCountertopProperlyPlaced, PlacedItem, getRoofPlacement, ROOF_SPRITE, WALL_HEIGHT, TILE_W, TILE_H, COUNTERTOP_ITEM_TYPES, getOccupiedCells, ISO_ROOMS } from "./isometric";
import { DEMO_HOUSE_GIFTS } from "@/components/wedding/PublicVirtualHouse";

describe("ISO_ROOMS - Rebalanceamento da Planta Baixa", () => {
  it("distribui as 70 células em 5 cômodos disjuntos com proporções equilibradas", () => {
    const kitchenCells = (ISO_ROOMS.kitchen.maxX - ISO_ROOMS.kitchen.minX + 1) * (ISO_ROOMS.kitchen.maxY - ISO_ROOMS.kitchen.minY + 1);
    const bathroomCells = (ISO_ROOMS.bathroom.maxX - ISO_ROOMS.bathroom.minX + 1) * (ISO_ROOMS.bathroom.maxY - ISO_ROOMS.bathroom.minY + 1);
    const bedroomCells = (ISO_ROOMS.bedroom.maxX - ISO_ROOMS.bedroom.minX + 1) * (ISO_ROOMS.bedroom.maxY - ISO_ROOMS.bedroom.minY + 1);
    const laundryCells = (ISO_ROOMS.laundry.maxX - ISO_ROOMS.laundry.minX + 1) * (ISO_ROOMS.laundry.maxY - ISO_ROOMS.laundry.minY + 1);
    const livingCells = (ISO_ROOMS.living_room.maxX - ISO_ROOMS.living_room.minX + 1) * (ISO_ROOMS.living_room.maxY - ISO_ROOMS.living_room.minY + 1);

    expect(kitchenCells).toBe(16); // 4x4
    expect(bathroomCells).toBe(8);  // 2x4
    expect(bedroomCells).toBe(16);  // 4x4
    expect(laundryCells).toBe(12);  // 4x3
    expect(livingCells).toBe(18);   // 6x3
    expect(kitchenCells + bathroomCells + bedroomCells + laundryCells + livingCells).toBe(70);

    // Valida que cada célula (0..9, 0..6) tem exatamente 1 cômodo atribuído
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 7; y++) {
        let matchCount = 0;
        for (const room of Object.values(ISO_ROOMS)) {
          if (x >= room.minX && x <= room.maxX && y >= room.minY && y <= room.maxY) {
            matchCount++;
          }
        }
        expect(matchCount, `Célula (${x}, ${y}) deve pertencer a exatamente 1 cômodo`).toBe(1);
      }
    }
  });
});

describe("findCollisions", () => {
  it("não acusa colisão para móveis que não se sobrepõem", () => {
    const items: PlacedItem[] = [
      { type: "fridge", x: 0, y: 0 },
      { type: "stove", x: 1, y: 0 },
    ];
    expect(findCollisions(items)).toEqual([]);
  });

  it("acusa colisão entre dois móveis comuns sobrepostos", () => {
    const items: PlacedItem[] = [
      { type: "sofa", x: 2, y: 4 }, // 2x1
      { type: "robot_vacuum", x: 3, y: 4 }, // cai dentro do footprint do sofá
    ];
    expect(findCollisions(items)).toHaveLength(1);
  });

  it("permite eletrodoméstico de bancada sentado sobre balcão/armário/mesa", () => {
    const items: PlacedItem[] = [
      { type: "kitchen_cabinet", x: 2, y: 1 }, // 2x1
      { type: "air_fryer", x: 3, y: 1 }, // mesma célula final do armário
    ];
    expect(findCollisions(items)).toEqual([]);

    const tableItems: PlacedItem[] = [
      { type: "dining_table", x: 1, y: 2 }, // 2x2
      { type: "microwave", x: 1, y: 2 }, // em cima da mesa
    ];
    expect(findCollisions(tableItems)).toEqual([]);
  });
});

describe("isCountertopProperlyPlaced", () => {
  it("rejeita micro-ondas ou air fryer em chão vazio sem bancada ou mesa", () => {
    const check1 = isCountertopProperlyPlaced("microwave", 0, 0, []);
    expect(check1.valid).toBe(false);
    expect(check1.reason).toContain("obrigatoriamente sobre uma bancada");

    const check2 = isCountertopProperlyPlaced("air_fryer", 2, 2, []);
    expect(check2.valid).toBe(false);
  });

  it("permite micro-ondas sobre mesa de jantar, mesa simples ou balcão", () => {
    const placedOnTable: PlacedItem[] = [{ type: "dining_table", x: 1, y: 2 }];
    const checkTable = isCountertopProperlyPlaced("microwave", 2, 2, placedOnTable);
    expect(checkTable.valid).toBe(true);

    const placedOnSimpleTable: PlacedItem[] = [{ type: "dining_table_simple", x: 1, y: 2 }];
    const checkSimpleTable = isCountertopProperlyPlaced("microwave", 1, 2, placedOnSimpleTable);
    expect(checkSimpleTable.valid).toBe(true);

    const placedOnSink: PlacedItem[] = [{ type: "sink_counter", x: 0, y: 1 }];
    const checkSink = isCountertopProperlyPlaced("air_fryer", 1, 1, placedOnSink);
    expect(checkSink.valid).toBe(true);
  });

  it("rejeita sobreposição de dois eletrodomésticos na mesma célula", () => {
    const placed: PlacedItem[] = [
      { type: "sink_counter", x: 0, y: 1 },
      { type: "coffee_maker", x: 0, y: 1 },
    ];
    const check = isCountertopProperlyPlaced("microwave", 0, 1, placed);
    expect(check.valid).toBe(false);
    expect(check.reason).toContain("Já existe outro eletrodoméstico");
  });

  it("permite itens normais de chão sem exigir bancada", () => {
    expect(isCountertopProperlyPlaced("sofa", 3, 5, []).valid).toBe(true);
    expect(isCountertopProperlyPlaced("fridge", 0, 0, []).valid).toBe(true);
  });
});

describe("Posições padrão do catálogo (DEFAULT_FURNITURE_POSITIONS)", () => {
  it("não tem colisão indevida com a mesa de jantar de 4 cadeiras", () => {
    const items: PlacedItem[] = Object.entries(DEFAULT_FURNITURE_POSITIONS)
      .filter(([type]) => type !== "dining_table_simple")
      .map(([type, pos]) => ({
        type,
        x: pos.x,
        y: pos.y,
      }));
    expect(findCollisions(items)).toEqual([]);
  });

  it("não tem colisão indevida com a mesa de jantar simples 2x1", () => {
    const items: PlacedItem[] = Object.entries(DEFAULT_FURNITURE_POSITIONS)
      .filter(([type]) => type !== "dining_table")
      .map(([type, pos]) => ({
        type,
        x: pos.x,
        y: pos.y,
      }));
    expect(findCollisions(items)).toEqual([]);
  });
});

describe("Dados de demonstração (DEMO_HOUSE_GIFTS)", () => {
  it("não tem colisão indevida entre nenhum par de móveis posicionados", () => {
    const items: PlacedItem[] = DEMO_HOUSE_GIFTS.filter(
      (g) => g.houseItemType && g.housePositionX !== null && g.housePositionY !== null
    ).map((g) => ({ type: g.houseItemType as string, x: g.housePositionX as number, y: g.housePositionY as number }));
    expect(findCollisions(items)).toEqual([]);
  });
});

describe("Ordenação de profundidade isométrica (z-index)", () => {
  it("garante que móveis mais abaixo/direita cobrem móveis mais acima/esquerda", () => {
    const fridge = getFurniturePlacement("fridge", 0, 0);
    const stove = getFurniturePlacement("stove", 1, 0);
    expect(stove.zIndex).toBeGreaterThan(fridge.zIndex);

    const sink = getFurniturePlacement("sink_counter", 0, 1);
    expect(sink.zIndex).toBeGreaterThan(fridge.zIndex);
    expect(sink.zIndex).toBeGreaterThan(stove.zIndex);
  });

  it("garante que móveis mais à direita e abaixo (bancada e micro-ondas) cobrem móveis mais à esquerda (lava-louças)", () => {
    const placed: PlacedItem[] = [
      { type: "kitchen_cabinet", x: 2, y: 0 },
      { type: "microwave", x: 2, y: 1 },
      { type: "dishwasher", x: 3, y: 1 },
    ];
    const dishwasher = getFurniturePlacement("dishwasher", 3, 1, 0, 0, placed);
    const cabinet = getFurniturePlacement("kitchen_cabinet", 2, 0, 0, 0, placed);
    const microwave = getFurniturePlacement("microwave", 2, 1, 0, 0, placed);

    // Micro-ondas fica em cima do armário na seção da bancada
    expect(microwave.zIndex).toBeGreaterThan(cabinet.zIndex);
    // Lava-louças em (3,1) tem frontSum=4 > armário/micro-ondas (frontSum=3)
    expect(dishwasher.zIndex).toBeGreaterThan(cabinet.zIndex);
    expect(dishwasher.zIndex).toBeGreaterThan(microwave.zIndex);
  });

  it("escolhe a orientação correta da cadeira de jantar em relação à mesa (SW atrás, NE à frente)", () => {
    const placed: PlacedItem[] = [
      { type: "dining_table", x: 2, y: 2 },
      { type: "dining_chair", x: 2, y: 1 },
      { type: "dining_chair", x: 3, y: 3 },
    ];
    expect(getFurnitureSpriteKey("dining_chair", 2, 1, placed)).toBe("dining_chair");
    expect(getFurnitureSpriteKey("dining_chair", 3, 3, placed)).toBe("dining_chair_back");
  });

  it("garante que itens na sala e caixa de presentes cobrem camadas anteriores", () => {
    const sofa = getFurniturePlacement("sofa", 3, 5);
    const giftBox = getFurniturePlacement("generic", 7, 5);
    expect(giftBox.zIndex).toBeGreaterThan(sofa.zIndex);
  });

  it("ordena corretamente os móveis da Sala Opção A (tv_rack 1x2 atrás da poltrona, mesa à frente do sofá frontal)", () => {
    const tvRack = getFurniturePlacement("tv_rack", 4, 4);
    const sofa = getFurniturePlacement("sofa", 7, 4);
    const coffeeTable = getFurniturePlacement("coffee_table", 7, 5);
    const armchair = getFurniturePlacement("armchair", 6, 6);
    const giftBox = getFurniturePlacement("generic", 9, 6);

    expect(coffeeTable.zIndex).toBeGreaterThan(sofa.zIndex);
    expect(armchair.zIndex).toBeGreaterThan(tvRack.zIndex);
    expect(giftBox.zIndex).toBeGreaterThan(coffeeTable.zIndex);
  });

  it("garante que a camada do telhado (200.000) e botões de enxoval (185.000) ficam acima do móvel mais frontal", () => {
    const frontmostFurniture = getFurniturePlacement("generic", 9, 6);
    const ROOF_Z_INDEX = 200000;
    const CABINET_Z_INDEX = 185000;
    expect(frontmostFurniture.zIndex).toBeLessThan(CABINET_Z_INDEX);
    expect(CABINET_Z_INDEX).toBeLessThan(ROOF_Z_INDEX);
  });
});


describe("Telhado (getRoofPlacement)", () => {
  it("alinha o beiral ao topo das paredes loft: vértices esquerdo e direito coincidem com o losango do piso", () => {
    const originX = 450;
    const originY = 180;
    const roof = getRoofPlacement(originX, originY);
    const scale = roof.width / ROOF_SPRITE.width;

    // vértice esquerdo do beiral == vértice esquerdo do piso (0,6) elevado WALL_HEIGHT
    const floorLeft = { x: originX - 6 * (TILE_W / 2), y: originY + 6 * (TILE_H / 2) + TILE_H / 2 };
    expect(roof.left).toBe(floorLeft.x);
    expect(Math.abs(roof.top + ROOF_SPRITE.leftY * scale - (floorLeft.y - WALL_HEIGHT))).toBeLessThanOrEqual(1);

    // vértice direito do beiral == vértice direito do piso (9,0)
    const floorRightX = originX + 9 * (TILE_W / 2) + TILE_W;
    expect(Math.abs(roof.left + ROOF_SPRITE.rightX * scale - floorRightX)).toBeLessThanOrEqual(1);
  });

  it("o telhado cobre toda a largura do piso e não passa do canvas da cena", () => {
    const roof = getRoofPlacement(450, 180);
    expect(roof.left).toBeGreaterThanOrEqual(0);
    expect(roof.left + roof.width).toBeLessThanOrEqual(1220);
    expect(roof.top).toBeLessThanOrEqual(20);
  });
});

describe("Acessibilidade do layout demo", () => {
  const GRID_W = 10;
  const GRID_H = 7;
  const floorItems = DEMO_HOUSE_GIFTS.filter(
    (g) => g.houseItemType && g.housePositionX !== null && g.housePositionY !== null && !COUNTERTOP_ITEM_TYPES.includes(g.houseItemType)
  );

  const blocked = new Set<string>();
  floorItems.forEach((g) =>
    getOccupiedCells(g.houseItemType as string, g.housePositionX as number, g.housePositionY as number).forEach((c) => blocked.add(`${c.x},${c.y}`))
  );

  const reachable = new Set<string>();
  const queue: [number, number][] = [[2, 4]];
  reachable.add("2,4");
  while (queue.length) {
    const [x, y] = queue.shift() as [number, number];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H || blocked.has(key) || reachable.has(key)) continue;
      reachable.add(key);
      queue.push([nx, ny]);
    }
  }

  it("todo móvel de chão tem ao menos uma célula vizinha livre e alcançável a partir da sala", () => {
    const inacessiveis = floorItems.filter((g) => {
      const cells = getOccupiedCells(g.houseItemType as string, g.housePositionX as number, g.housePositionY as number);
      return !cells.some((c) =>
        [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reachable.has(`${c.x + dx},${c.y + dy}`))
      );
    });
    expect(inacessiveis.map((g) => g.houseItemType)).toEqual([]);
  });

  it("a frente (lado SW/SE) da bancada da pia, da geladeira e da lava-louças não é bloqueada pela mesa", () => {
    ["sink_counter", "dishwasher", "fridge"].forEach((type) => {
      const g = floorItems.find((i) => i.houseItemType === type)!;
      const cells = getOccupiedCells(type, g.housePositionX as number, g.housePositionY as number);
      const front = cells.flatMap((c) => [`${c.x},${c.y + 1}`, `${c.x + 1},${c.y}`]).filter((k) => !blocked.has(k));
      expect(front.length, type).toBeGreaterThan(0);
    });
  });
});
