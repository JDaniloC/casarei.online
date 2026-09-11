import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCart } from "@/contexts/CartContext";
import { Gift } from "@/contexts/WeddingContext";
import { Loader2, ShoppingBag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { getIsoCoords, TILE_W, TILE_H, ISO_ROOMS, FURNITURE_SIZES, getFurniturePlacement } from "@/utils/isometric";
import { getGiftFundingProgress, isGiftFundingComplete } from "@/utils/giftFunding";

interface PublicVirtualHouseProps {
  weddingId: string;
  onOpenCheckout: () => void;
}

interface DBGift extends Gift {
  houseItemType: string | null;
  houseRoom: string | null;
  housePositionX: number | null;
  housePositionY: number | null;
}

const ROOM_DISPLAY = {
  kitchen: { name: "Cozinha", color: "bg-amber-50/40 border-amber-200/50", labelColor: "text-amber-700", ...ISO_ROOMS.kitchen },
  bathroom: { name: "Banheiro", color: "bg-cyan-50/40 border-cyan-200/50", labelColor: "text-cyan-700", ...ISO_ROOMS.bathroom },
  bedroom: { name: "Quarto", color: "bg-purple-50/40 border-purple-200/50", labelColor: "text-purple-700", ...ISO_ROOMS.bedroom },
  laundry: { name: "Área de Serviço", color: "bg-stone-50/40 border-stone-200/50", labelColor: "text-stone-700", ...ISO_ROOMS.laundry },
  living_room: { name: "Sala", color: "bg-emerald-50/40 border-emerald-200/50", labelColor: "text-emerald-700", ...ISO_ROOMS.living_room },
};

const FURNITURE_ICONS: Record<string, string> = {
  fridge: "🧊",
  stove: "🔥",
  microwave: "📻",
  sink_counter: "🚰",
  kitchen_cabinet: "🗄️",
  dishwasher: "🍽️",
  coffee_maker: "☕",
  air_fryer: "🍟",
  dining_table: "🍽️",
  dining_table_simple: "🪵",
  sofa: "🛋️",
  tv_rack: "📺",
  tv: "📺",
  coffee_table: "🪵",
  armchair: "🪑",
  robot_vacuum: "🤖",
  bed: "🛏️",
  wardrobe: "🚪",
  dresser: "🗄️",
  vanity: "💄",
  toilet: "🚽",
  bathroom_sink: "🪞",
  shower: "🚿",
  washing_machine: "🧺",
  dryer: "💨",
  laundry_sink: "🧼",
  generic: "📦",
};

const STRUCTURAL_ITEMS = ["foundation", "floor_coverings", "walls", "painting", "doors_windows", "roof", "electric", "plumbing"];

export const DEMO_HOUSE_GIFTS: DBGift[] = [
  { id: "demo-foundation", name: "Fundação e Alicerce", price: 1500, stock: 0, houseItemType: "foundation", housePositionX: null, housePositionY: null },
  { id: "demo-floors", name: "Pisos e Revestimentos", price: 1200, stock: 0, houseItemType: "floor_coverings", housePositionX: null, housePositionY: null },
  { id: "demo-walls", name: "Paredes e Estrutura", price: 1800, stock: 0, houseItemType: "walls", housePositionX: null, housePositionY: null },
  { id: "demo-painting", name: "Pintura Completa", price: 900, stock: 0, houseItemType: "painting", housePositionX: null, housePositionY: null },
  { id: "demo-doors", name: "Portas e Janelas", price: 1100, stock: 0, houseItemType: "doors_windows", housePositionX: null, housePositionY: null },
  { id: "demo-plumbing", name: "Instalação Hidráulica", price: 800, stock: 0, houseItemType: "plumbing", housePositionX: null, housePositionY: null },
  { id: "demo-electric", name: "Instalação Elétrica", price: 850, stock: 0, houseItemType: "electric", housePositionX: null, housePositionY: null },

  // Cozinha
  { id: "demo-fridge", name: "Geladeira French Door", price: 4200, stock: 0, houseItemType: "fridge", houseRoom: "kitchen", housePositionX: 0, housePositionY: 0 },
  { id: "demo-dishwasher", name: "Lava-Louças Inox 14 Serviços", price: 2800, stock: 0, houseItemType: "dishwasher", houseRoom: "kitchen", housePositionX: 0, housePositionY: 2 },
  { id: "demo-sink", name: "Bancada com Pia & Torneira", price: 1850, stock: 0, houseItemType: "sink_counter", houseRoom: "kitchen", housePositionX: 1, housePositionY: 0 },
  { id: "demo-coffee", name: "Cafeteira Expresso Italiana", price: 450, stock: 0, houseItemType: "coffee_maker", houseRoom: "kitchen", housePositionX: 1, housePositionY: 0 },
  { id: "demo-stove", name: "Fogão Cooktop 4 Bocas Inox", price: 1650, stock: 0, houseItemType: "stove", houseRoom: "kitchen", housePositionX: 3, housePositionY: 0 },
  { id: "demo-cabinet", name: "Armários Planejados Cozinha", price: 3200, stock: 0, houseItemType: "kitchen_cabinet", houseRoom: "kitchen", housePositionX: 2, housePositionY: 2 },
  { id: "demo-airfryer", name: "Air Fryer Digital 4L", price: 390, stock: 0, houseItemType: "air_fryer", houseRoom: "kitchen", housePositionX: 2, housePositionY: 2 },
  { id: "demo-micro", name: "Micro-ondas Espelhado 30L", price: 650, stock: 0, houseItemType: "microwave", houseRoom: "kitchen", housePositionX: 3, housePositionY: 2 },
  { id: "demo-table", name: "Mesa de Jantar 4 Lugares", price: 2100, stock: 0, houseItemType: "dining_table", houseRoom: "kitchen", housePositionX: 2, housePositionY: 4 },

  // Banheiro
  { id: "demo-shower", name: "Box Blindex & Chuveiro Ducha", price: 1100, stock: 0, houseItemType: "shower", houseRoom: "bathroom", housePositionX: 4, housePositionY: 0 },
  { id: "demo-bath-sink", name: "Gabinete & Cuba Esculpida", price: 890, stock: 0, houseItemType: "bathroom_sink", houseRoom: "bathroom", housePositionX: 5, housePositionY: 0 },
  { id: "demo-toilet", name: "Vaso Sanitário Monobloco", price: 580, stock: 0, houseItemType: "toilet", houseRoom: "bathroom", housePositionX: 4, housePositionY: 2 },

  // Quarto
  { id: "demo-wardrobe", name: "Guarda-Roupa Casal 3 Portas", price: 2800, stock: 0, houseItemType: "wardrobe", houseRoom: "bedroom", housePositionX: 8, housePositionY: 0 },
  { id: "demo-bed", name: "Cama Queen Size", price: 2400, stock: 0, houseItemType: "bed", houseRoom: "bedroom", housePositionX: 6, housePositionY: 0 },
  { id: "demo-vanity", name: "Penteadeira com Espelho Camarim", price: 950, stock: 0, houseItemType: "vanity", houseRoom: "bedroom", housePositionX: 8, housePositionY: 2 },
  { id: "demo-dresser", name: "Cômoda 6 Gavetas Carvalho", price: 1200, stock: 0, houseItemType: "dresser", houseRoom: "bedroom", housePositionX: 6, housePositionY: 3 },

  // Área de Serviço
  { id: "demo-washer", name: "Máquina de Lavar 13kg Front-Load", price: 2200, stock: 0, houseItemType: "washing_machine", houseRoom: "laundry", housePositionX: 0, housePositionY: 4 },
  { id: "demo-dryer", name: "Secadora de Roupas Front-Load", price: 1800, stock: 0, houseItemType: "dryer", houseRoom: "laundry", housePositionX: 0, housePositionY: 5 },
  { id: "demo-laundry-sink", name: "Tanque Inox com Gabinete", price: 680, stock: 0, houseItemType: "laundry_sink", houseRoom: "laundry", housePositionX: 0, housePositionY: 6 },

  // Sala de Estar
  { id: "demo-tv", name: "Rack & Painel TV Smart OLED", price: 1950, stock: 0, houseItemType: "tv_rack", houseRoom: "living_room", housePositionX: 7, housePositionY: 4 },
  { id: "demo-sofa", name: "Sofá Retrátil Confort", price: 2200, stock: 0, houseItemType: "sofa", houseRoom: "living_room", housePositionX: 4, housePositionY: 5 },
  { id: "demo-coffee-table", name: "Mesa de Centro Tampo Vidro", price: 550, stock: 0, houseItemType: "coffee_table", houseRoom: "living_room", housePositionX: 6, housePositionY: 5 },
  { id: "demo-armchair", name: "Poltrona Sala de Estar", price: 850, stock: 0, houseItemType: "armchair", houseRoom: "living_room", housePositionX: 7, housePositionY: 6 },
  { id: "demo-robot", name: "Robô Aspirador Inteligente", price: 1250, stock: 0, houseItemType: "robot_vacuum", houseRoom: "living_room", housePositionX: 5, housePositionY: 6 },
  { id: "demo-generic", name: "Presente Surpresa para a Casa", price: 350, stock: 1, houseItemType: "generic", houseRoom: "living_room", housePositionX: 9, housePositionY: 4 },
];

const DEMO_BUYERS: Record<string, string> = {
  "demo-foundation": "Pais da Noiva",
  "demo-floors": "Padrinhos Lucas & Ana",
  "demo-walls": "Tios Roberto & Carla",
  "demo-painting": "Primos Marcos & Julia",
  "demo-doors": "Família Oliveira",
  "demo-plumbing": "Amigos da Faculdade",
  "demo-electric": "Tia Cecília",
  "demo-sink": "Vovó Helena",
  "demo-cabinet": "Padrinho Gabriel",
  "demo-stove": "Tia Cláudia & Tio Jorge",
  "demo-micro": "Bruna & Thiago",
  "demo-dishwasher": "Padrinhos Marcelo & Bia",
  "demo-coffee": "Camila & Renato",
  "demo-airfryer": "Primos Lucas & Sofia",
  "demo-table": "Vovô Antônio",
  "demo-shower": "Família Souza",
  "demo-toilet": "Amigos do Trabalho",
  "demo-bath-sink": "Amigos de Infância",
  "demo-wardrobe": "Pais do Noivo",
  "demo-vanity": "Madrinha Juliana",
  "demo-bed": "Irmãos e Cunhados",
  "demo-dresser": "Tia Marisa & Tio Carlos",
  "demo-washer": "Família Costa",
  "demo-dryer": "Madrinha Mariana",
  "demo-laundry-sink": "Tia Regina",
  "demo-tv": "Tio Fernando",
  "demo-coffee-table": "Colegas de Trabalho",
  "demo-armchair": "Família Barreto",
  "demo-sofa": "Padrinho Felipe",
  "demo-robot": "Dindos Pedro & Laura",
};

export default function PublicVirtualHouse({ weddingId, onOpenCheckout }: PublicVirtualHouseProps) {
  const [loading, setLoading] = useState(true);
  const [gifts, setGifts] = useState<DBGift[]>([]);
  const [buyers, setBuyers] = useState<Record<string, string>>({}); // Mapping from gift_id to buyer guest_name
  const [selectedGhost, setSelectedGhost] = useState<DBGift | null>(null);
  const [contributionAmount, setContributionAmount] = useState("");
  const [activeCabinet, setActiveCabinet] = useState<keyof typeof ROOM_DISPLAY | null>(null);
  const [showRoof, setShowRoof] = useState(false);
  const constraintsRef = useRef(null);

  const { addItem } = useCart();

  useEffect(() => {
    async function loadHouseData() {
      if (!weddingId) {
        setGifts(DEMO_HOUSE_GIFTS);
        setBuyers(DEMO_BUYERS);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);

        const { data: giftsData, error: giftsError } = await supabase
          .from("gifts")
          .select("id, name, price, category, stock, image_url, external_link, is_open_price, is_vaquinha, raised_amount, total_quotas, house_item_type, house_room, house_position_x, house_position_y")
          .eq("wedding_id", weddingId)
          .or("house_item_type.not.is.null,house_room.not.is.null");

        if (giftsError) throw giftsError;

        const formattedGifts: DBGift[] = (giftsData || []).map((g) => ({
          id: g.id,
          name: g.name,
          category: g.category,
          price: Number(g.price),
          image: g.image_url || "",
          externalLink: g.external_link || "",
          isOpenPrice: g.is_open_price,
          isVaquinha: g.is_vaquinha,
          raisedAmount: Number(g.raised_amount) || 0,
          stock: g.stock !== null && g.stock !== undefined ? Number(g.stock) : null,
          totalQuotas: g.total_quotas !== null && g.total_quotas !== undefined ? Number(g.total_quotas) : null,
          houseItemType: g.house_item_type,
          houseRoom: g.house_room,
          housePositionX: g.house_position_x !== null ? Number(g.house_position_x) : null,
          housePositionY: g.house_position_y !== null ? Number(g.house_position_y) : null,
        }));

        setGifts(formattedGifts);

        const { data: orderItems, error: ordersError } = await supabase
          .from("order_items")
          .select("gift_id, orders(guest_name, status)");

        if (!ordersError && orderItems) {
          const buyersMap: Record<string, string> = {};
          orderItems.forEach((item: any) => {
            if (item.orders && item.orders.status === "approved" && item.gift_id) {
              buyersMap[item.gift_id] = item.orders.guest_name;
            }
          });
          setBuyers(buyersMap);
        }
      } catch (err) {
        console.error("Error loading public virtual house:", err);
      } finally {
        setLoading(false);
      }
    }
    loadHouseData();
  }, [weddingId]);

  const isGiftPaid = (g: DBGift) => isGiftFundingComplete(g);

  const getPaidStructural = (type: string) => {
    const item = gifts.find((g) => g.houseItemType === type);
    return item ? isGiftPaid(item) : false;
  };

  const foundationPaid = getPaidStructural("foundation");
  const floorCoveringsPaid = getPaidStructural("floor_coverings");
  const wallsPaid = getPaidStructural("walls");
  const paintingPaid = getPaidStructural("painting");
  const doorsWindowsPaid = getPaidStructural("doors_windows");
  const roofPaid = getPaidStructural("roof");
  const electricPaid = getPaidStructural("electric");
  const plumbingPaid = getPaidStructural("plumbing");

  // Todo móvel já posicionado no grid, independente de já estar 100% financiado —
  // a revelação gradual acontece na própria renderização, via getGiftFundingProgress.
  const positionedFurniture = gifts.filter((g) => {
    return g.houseItemType && !STRUCTURAL_ITEMS.includes(g.houseItemType) && g.housePositionX !== null && g.housePositionY !== null;
  });

  const getGhostItemAt = (x: number, y: number, roomKey: string) => {
    return gifts.find((g) => {
      return (
        g.houseItemType &&
        !STRUCTURAL_ITEMS.includes(g.houseItemType) &&
        g.houseRoom === roomKey &&
        !isGiftPaid(g) &&
        g.housePositionX === x && g.housePositionY === y 
      );
    });
  };

  const handleGhostClick = (gift: DBGift) => {
    setSelectedGhost(gift);
    setContributionAmount("");
  };

  const handleBuyGhost = () => {
    if (!selectedGhost) return;

    let priceToUse = selectedGhost.price;
    if (selectedGhost.totalQuotas && selectedGhost.price > 0) {
      priceToUse = selectedGhost.price / selectedGhost.totalQuotas;
    } else if (selectedGhost.isOpenPrice) {
      const amount = parseFloat(contributionAmount) || 0;
      if (amount <= 0) {
        toast.error("Por favor, insira um valor válido para presentear.");
        return;
      }
      priceToUse = amount;
    }

    addItem(selectedGhost, priceToUse);
    onOpenCheckout();
    setSelectedGhost(null);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-gold" />
        <p className="text-sm text-muted-foreground mt-4 font-serif">Carregando Casa dos Sonhos...</p>
      </div>
    );
  }

  const gridCells = [];
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 10; x++) {
      let roomKey: keyof typeof ROOM_DISPLAY | null = null;
      for (const [key, room] of Object.entries(ROOM_DISPLAY)) {
        if (x >= room.minX && x <= room.maxX && y >= room.minY && y <= room.maxY) {
          roomKey = key as keyof typeof ROOM_DISPLAY;
          break;
        }
      }
      gridCells.push({ x, y, roomKey });
    }
  }

  // Calculate container dimensions based on isometric bounds
  const mapOriginX = 400;
  const mapOriginY = 180;
  const containerHeight = (9 + 6) * (TILE_H / 2) + 260;

  return (
    <section className="py-24 bg-cream relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-16">
          <p className="text-gold uppercase tracking-[0.2em] text-sm mb-4 font-sans font-semibold">Nossa Futura Casa</p>
          <h2 className="section-title">Casa dos Sonhos</h2>
          <div className="gold-divider mt-6" />
          <p className="section-subtitle max-w-2xl mx-auto mt-4 leading-relaxed">
            Acompanhe a construção e decoração do nosso futuro lar em tempo real! Escolha qualquer silhueta dourada para nos presentear com aquela etapa da obra ou móvel.
          </p>
        </div>

        <div className="bg-[#141614] p-3 sm:p-6 rounded-3xl border border-white/10 shadow-elevated relative overflow-hidden max-w-5xl mx-auto">
          <div className="absolute top-4 right-4 z-30 flex gap-2">
            {roofPaid && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRoof(!showRoof)}
                className="bg-white/90 hover:bg-white text-xs border-gold text-gold font-medium rounded-lg shadow-soft"
              >
                {showRoof ? "Mostrar Interior" : "Mostrar Telhado"}
              </Button>
            )}
          </div>

          <div 
            ref={constraintsRef} 
            className="bg-[#1a1c1a] rounded-2xl border border-border shadow-card overflow-hidden w-full relative cursor-grab active:cursor-grabbing" 
            style={{ minHeight: `${containerHeight}px` }}
          >
            <motion.div 
              drag 
              dragConstraints={constraintsRef}
              dragElastic={0.1}
              className="relative mx-auto" 
              style={{ width: '1160px', height: `${containerHeight}px` }}
            >
              
              {/* Grid Foundation & Cells */}
              {gridCells.map(({ x, y, roomKey }) => {
                const iso = getIsoCoords(x, y, mapOriginX, mapOriginY);
                const ghostItem = roomKey ? getGhostItemAt(x, y, roomKey) : null;
                
                let tileImg = null;
                if (floorCoveringsPaid && roomKey) {
                  if (roomKey === "kitchen") tileImg = "tile_kitchen.png";
                  if (roomKey === "bathroom") tileImg = "tile_bathroom.png";
                  if (roomKey === "bedroom") tileImg = "tile_bedroom.png";
                  if (roomKey === "laundry") tileImg = "tile_laundry.png";
                  if (roomKey === "living_room") tileImg = "tile_living.png";
                } else if (foundationPaid) {
                  tileImg = "tile_foundation.png";
                }

                return (
                  <div
                    key={`cell-${x}-${y}`}
                    onClick={() => {
                      if (ghostItem) handleGhostClick(ghostItem);
                    }}
                    style={{
                      position: "absolute",
                      left: `${iso.x}px`,
                      top: `${iso.y}px`,
                      width: `${TILE_W}px`,
                      height: `${TILE_H}px`,
                      zIndex: iso.zIndex,
                      clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
                    }}
                    className={`transition-all flex items-center justify-center
                      ${!tileImg ? "border border-white/20" : ""}
                      ${ghostItem ? "cursor-pointer hover:brightness-110" : ""}
                    `}
                  >
                    {tileImg && (
                      <img src={`/assets/iso/${tileImg}`} alt="floor" className="w-full h-full object-contain pointer-events-none" />
                    )}
                    
                    {!tileImg && (
                      <div className="w-1 h-1 rounded-full bg-white/30 absolute pointer-events-none" />
                    )}
                  </div>
                );
              })}

              {/* Walls Rendering - Continuous Tall Loft Back Walls */}
              {wallsPaid && Array.from({ length: 10 }).map((_, x) => {
                // Back-right / North-East wall (along y=0 edge, x from 0 to 9)
                const iso = getIsoCoords(x, 0, mapOriginX, mapOriginY);
                // Windows in Kitchen (x=1) and Bedroom (x=8) if doors_windows paid
                const hasWindow = doorsWindowsPaid && (x === 1 || x === 8);
                const wallImg = hasWindow ? "wall_ne_window.png" : "wall_ne_plain.png";

                return (
                  <div
                    key={`wall-ne-${x}`}
                    style={{
                      position: "absolute",
                      left: `${iso.x + TILE_W / 2}px`,
                      top: `${iso.y - 160}px`,
                      width: "64px",
                      height: "192px",
                      zIndex: iso.zIndex + 1,
                      pointerEvents: "none"
                    }}
                  >
                    <img src={`/assets/iso/${wallImg}`} className="w-full h-full object-contain" alt="wall" />
                  </div>
                );
              })}
              {wallsPaid && Array.from({ length: 7 }).map((_, y) => {
                // Back-left / North-West wall (along x=0 edge, y from 0 to 6)
                const iso = getIsoCoords(0, y, mapOriginX, mapOriginY);
                // Window in Laundry (y=5) if doors_windows paid
                const hasWindow = doorsWindowsPaid && (y === 5);
                const wallImg = hasWindow ? "wall_nw_window.png" : "wall_nw_plain.png";

                return (
                  <div
                    key={`wall-nw-${y}`}
                    style={{
                      position: "absolute",
                      left: `${iso.x}px`,
                      top: `${iso.y - 160}px`,
                      width: "64px",
                      height: "192px",
                      zIndex: iso.zIndex + 1,
                      pointerEvents: "none"
                    }}
                  >
                    <img src={`/assets/iso/${wallImg}`} className="w-full h-full object-contain" alt="wall" />
                  </div>
                );
              })}

              {/* Móveis posicionados: revelação gradual conforme o financiamento avança.
                  A camada "fantasma" (sépia/translúcida) fica sempre embaixo; a camada
                  sólida é recortada por clip-path para mostrar só o progresso% de baixo
                  pra cima — em 100% o fantasma some por baixo do móvel completo. */}
              {(() => {
                const allPlacedItemsList = positionedFurniture
                  .filter((f) => f.housePositionX !== null && f.housePositionY !== null && f.houseItemType)
                  .map((f) => ({
                    type: f.houseItemType as string,
                    x: f.housePositionX as number,
                    y: f.housePositionY as number,
                  }));

                return positionedFurniture.map((furniture) => {
                  if (furniture.housePositionX === null || furniture.housePositionY === null || !furniture.houseItemType) return null;
                  const placement = getFurniturePlacement(
                    furniture.houseItemType,
                    furniture.housePositionX,
                    furniture.housePositionY,
                    mapOriginX,
                    mapOriginY,
                    allPlacedItemsList
                  );
                  const progress = getGiftFundingProgress(furniture);
                  const isComplete = progress >= 100;
                  const buyerName = buyers[furniture.id];

                  return (
                    <div
                      key={`furn-${furniture.id}`}
                      onClick={() => { if (!isComplete) handleGhostClick(furniture); }}
                      style={{
                        position: "absolute",
                        left: `${placement.left}px`,
                        top: `${placement.top}px`,
                        width: `${placement.width}px`,
                        height: `${placement.height}px`,
                        zIndex: placement.zIndex,
                      }}
                      className={`group pointer-events-auto ${!isComplete ? "cursor-pointer hover:brightness-125 transition-all" : ""}`}
                    >
                      {!isComplete && (
                        <img
                          src={`/assets/iso/furniture_${furniture.houseItemType}.png?v=16`}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 w-full h-full object-contain filter sepia saturate-200 hue-rotate-[15deg] opacity-50 drop-shadow-[0_0_8px_rgba(255,215,0,0.5)] pointer-events-none"
                          style={{ imageRendering: "pixelated" }}
                        />
                      )}
                      {progress > 0 && (
                        <img
                          src={`/assets/iso/furniture_${furniture.houseItemType}.png?v=16`}
                          alt={furniture.name}
                          className="absolute inset-0 w-full h-full object-contain drop-shadow-lg pointer-events-none"
                          style={{ clipPath: `inset(${100 - progress}% 0 0 0)`, imageRendering: "pixelated" }}
                        />
                      )}
                    <div className="absolute bottom-[105%] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-black/90 text-white text-[9px] sm:text-xs py-1.5 px-3 rounded-lg shadow-soft whitespace-nowrap z-50 pointer-events-none border border-white/10">
                      {isComplete ? (
                        <>
                          <strong>{furniture.name}</strong> <br />
                          <span className="text-gold/90 font-light mt-0.5 block">
                            {buyerName ? `Presenteado por ${buyerName}` : "Presenteado com carinho!"}
                          </span>
                        </>
                      ) : (
                        <>
                          <strong>Presentear {furniture.name}</strong>
                          {progress > 0 && (
                            <span className="text-gold/90 font-light mt-0.5 block">
                              {Math.round(progress)}% financiado
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              });
            })()}

              {/* Room Cabinet Buttons */}
              {foundationPaid && (
                <div className="absolute inset-0 pointer-events-none select-none z-[60]">
                  {Object.entries(ROOM_DISPLAY).map(([key, room]) => {
                    // Place the cabinet button at the room's starting iso coords visually offset
                    const iso = getIsoCoords(room.minX, room.minY, mapOriginX, mapOriginY);
                    
                    const hasCabinetItems = gifts.some(
                      (g) => g.houseRoom === key && !g.houseItemType && isGiftPaid(g)
                    );

                    return (
                      <div 
                        key={room.name} 
                        style={{ left: `${iso.x + TILE_W/2}px`, top: `${iso.y - 20}px` }} 
                        className="absolute flex flex-col gap-2 items-center pointer-events-auto transform -translate-x-1/2"
                      >
                        <button
                          onClick={() => setActiveCabinet(key as any)}
                          className={`p-1.5 sm:p-2 rounded-full border shadow-card transition-all flex items-center justify-center ${
                            hasCabinetItems
                              ? "bg-gold text-background hover:bg-gold-light border-gold-light animate-pulse"
                              : "bg-white/90 text-muted-foreground hover:bg-white border-border"
                          }`}
                          title={`Armário de Enxoval da ${room.name}`}
                        >
                          <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Roof Overlay */}
              {showRoof && roofPaid && (() => {
                // Compute roof position from the grid's bounding diamond
                const topLeft = getIsoCoords(0, 0, mapOriginX, mapOriginY);
                const topRight = getIsoCoords(9, 0, mapOriginX, mapOriginY);
                const bottomLeft = getIsoCoords(0, 6, mapOriginX, mapOriginY);
                const bottomRight = getIsoCoords(9, 6, mapOriginX, mapOriginY);
                // Diamond extremes
                const topY = topLeft.y;
                const leftX = bottomLeft.x;
                const rightX = topRight.x + TILE_W;
                const bbW = rightX - leftX;
                // Use roof's native aspect ratio (700:400 = 1.75) to compute height
                const ROOF_ASPECT = 700 / 400;
                const roofW = bbW + 160;
                const roofH = roofW / ROOF_ASPECT;
                const roofLeft = leftX - 80;
                const roofTop = topY - 180;
                return (
                  <div 
                    className="absolute pointer-events-none"
                    style={{
                      left: `${roofLeft}px`,
                      top: `${roofTop}px`,
                      width: `${roofW}px`,
                      height: `${roofH}px`,
                      zIndex: 200,
                    }}
                  >
                    <img src="/assets/iso/roof.png" alt="Roof" className="w-full h-full drop-shadow-2xl opacity-95" />
                  </div>
                );
              })()}

            </motion.div>
          </div>
        </div>

        {/* Ghost Direct Purchase Modal dialog */}
        <AnimatePresence>
          {selectedGhost && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-card rounded-2xl p-6 border border-border max-w-md w-full shadow-elevated relative text-center space-y-6"
              >
                <button
                  onClick={() => setSelectedGhost(null)}
                  className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 rounded-full bg-muted/40 hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="mx-auto w-24 h-24 rounded-xl bg-gold/10 flex items-center justify-center p-2 relative overflow-hidden">
                   <img 
                      src={`/assets/iso/furniture_${selectedGhost.houseItemType}.png?v=3`} 
                      alt={selectedGhost.name}
                      className="w-full h-full object-contain filter sepia saturate-200 hue-rotate-[15deg]"
                   />
                </div>

                <div className="space-y-2">
                  <span className="text-xs text-gold uppercase tracking-widest font-sans font-semibold">
                    {selectedGhost.category}
                  </span>
                  <h3 className="font-serif text-2xl text-foreground font-semibold">
                    {selectedGhost.name}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Presenteie-nos com essa parte essencial do nosso novo lar! Ela ficará destacada na planta da nossa casa dos sonhos com o seu nome gravado com muito carinho.
                  </p>
                </div>

                {(selectedGhost.totalQuotas || selectedGhost.isVaquinha) && (
                  <div className="space-y-1.5 text-left">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gold rounded-full transition-all"
                        style={{ width: `${getGiftFundingProgress(selectedGhost)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {selectedGhost.totalQuotas
                        ? `${selectedGhost.totalQuotas - (selectedGhost.stock || 0)} de ${selectedGhost.totalQuotas} cotas adquiridas`
                        : `Arrecadado: R$ ${(selectedGhost.raisedAmount || 0).toFixed(2).replace(".", ",")} de R$ ${selectedGhost.price.toFixed(2).replace(".", ",")}`}
                    </p>
                  </div>
                )}

                {selectedGhost.totalQuotas && selectedGhost.price > 0 ? (
                  <p className="text-3xl font-serif text-gold font-bold">
                    R$ {(selectedGhost.price / selectedGhost.totalQuotas).toFixed(2).replace(".", ",")}
                    <span className="text-sm text-muted-foreground font-sans"> / cota</span>
                  </p>
                ) : selectedGhost.isOpenPrice ? (
                  <div className="text-left space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Com quanto deseja apoiar essa meta?</label>
                    <Input
                      type="number"
                      min="1"
                      value={contributionAmount}
                      onChange={(e) => setContributionAmount(e.target.value)}
                      placeholder="R$ 0,00"
                      className="text-center text-lg"
                    />
                  </div>
                ) : (
                  <p className="text-3xl font-serif text-gold font-bold">
                    R$ {selectedGhost.price.toFixed(2).replace(".", ",")}
                  </p>
                )}

                <Button
                  onClick={handleBuyGhost}
                  className="w-full bg-gold hover:bg-gold-light text-background font-bold py-4 text-sm uppercase tracking-wider rounded-xl shadow-soft"
                >
                  <ShoppingBag className="w-4 h-4 mr-2" />
                  {selectedGhost.totalQuotas ? "Adquirir Cota" : "Presentear Agora"}
                </Button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Room Cabinet Inventory Slots (Minecraft-style modal) */}
        <AnimatePresence>
          {activeCabinet && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-[#1f1f1f] text-[#dedede] border-4 border-[#3c3c3c] rounded-2xl p-6 max-w-lg w-full shadow-elevated relative space-y-6 select-none font-mono"
              >
                {/* Modal close */}
                <button
                  onClick={() => setActiveCabinet(null)}
                  className="absolute top-4 right-4 text-[#8b8b8b] hover:text-white p-1 rounded bg-[#3c3c3c]/50 hover:bg-[#3c3c3c]"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Cabinet Header */}
                <div className="border-b border-[#3c3c3c] pb-3">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2 font-mono">
                    <ShoppingBag className="w-5 h-5 text-gold" />
                    Armário de Enxoval: {ROOM_DISPLAY[activeCabinet].name}
                  </h3>
                  <p className="text-[10px] text-[#8b8b8b] mt-1 uppercase tracking-wide">Inventário de presentes recebidos</p>
                </div>

                {/* Grid slots wrapper */}
                <div className="grid grid-cols-4 gap-3 bg-[#111] p-4 rounded-xl border border-[#3c3c3c]">
                  {(() => {
                    const cabinetItems = gifts.filter(
                      (g) => g.houseRoom === activeCabinet && !g.houseItemType && isGiftPaid(g)
                    );

                    const slots = [];
                    for (let i = 0; i < 8; i++) {
                      const item = cabinetItems[i];
                      const buyerName = item ? buyers[item.id] : null;

                      slots.push(
                        <div
                          key={`slot-${i}`}
                          className={`aspect-square rounded-md border-2 bg-[#2d2d2d] flex items-center justify-center relative group ${
                            item ? "border-[#4a4a4a] cursor-pointer hover:border-gold hover:bg-[#3d3d3d]" : "border-[#222]"
                          }`}
                        >
                          {item ? (
                            <>
                              {item.image ? (
                                <img src={item.image} alt={item.name} className="w-full h-full object-cover rounded" />
                              ) : (
                                <span className="text-2xl">🎁</span>
                              )}
                              {/* Minecraft Style Slot Hover Card */}
                              <div className="absolute bottom-[110%] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-[#0f0f0f] border-2 border-[#3c3c3c] text-white text-[9px] sm:text-xs py-2 px-3 rounded shadow-card whitespace-nowrap z-[100] pointer-events-none">
                                <span className="text-gold font-bold">{item.name}</span> <br />
                                <span className="text-white/60 font-light block mt-1">
                                  {buyerName ? `De: ${buyerName}` : "Enxoval conquistado!"}
                                </span>
                              </div>
                            </>
                          ) : (
                            <span className="text-[10px] text-[#333] font-bold">SLOT</span>
                          )}
                        </div>
                      );
                    }
                    return slots;
                  })()}
                </div>

                <div className="text-center py-2 text-[10px] text-[#8b8b8b] border-t border-[#3c3c3c]">
                  Adicione e compre itens da lista da {ROOM_DISPLAY[activeCabinet].name} para preencher este armário!
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
