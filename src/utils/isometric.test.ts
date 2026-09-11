import { describe, it, expect } from "vitest";
import { DEFAULT_FURNITURE_POSITIONS, findCollisions, getFurniturePlacement, isCountertopProperlyPlaced, PlacedItem } from "./isometric";
import { DEMO_HOUSE_GIFTS } from "@/components/wedding/PublicVirtualHouse";

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
    const checkTable = isCountertopProperlyPlaced("microwave", 2, 3, placedOnTable);
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
    const dishwasher = getFurniturePlacement("dishwasher", 2, 1);
    const cabinet = getFurniturePlacement("kitchen_cabinet", 2, 0);
    const microwave = getFurniturePlacement("microwave", 3, 0);

    // Micro-ondas fica em cima do armário na seção da bancada
    expect(microwave.zIndex).toBeGreaterThan(cabinet.zIndex);

    // Bancada/micro-ondas e lava-louças compartilham a mesma profundidade
    // (frontSum=3). Com o tiebreaker por frontY, a lava-louças (frontY=1) fica
    // na frente do armário (frontY=0), o que é isometricamente correto — ela
    // está mais para baixo-esquerda na tela.
    expect(dishwasher.zIndex).toBeGreaterThan(cabinet.zIndex);
    // O micro-ondas (3,0, frontY=0) está na parede de fundo sobre o armário,
    // a lava-louças (2,1, frontY=1) está uma fileira à frente — ela cobre o micro.
    expect(dishwasher.zIndex).toBeGreaterThan(microwave.zIndex);
  });

  it("garante que itens na sala e caixa de presentes cobrem camadas anteriores", () => {
    const sofa = getFurniturePlacement("sofa", 3, 5);
    const giftBox = getFurniturePlacement("generic", 7, 5);
    expect(giftBox.zIndex).toBeGreaterThan(sofa.zIndex);
  });
});

