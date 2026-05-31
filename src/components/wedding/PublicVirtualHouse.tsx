import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { Gift } from "@/contexts/WeddingContext";
import { Loader2, ShoppingBag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { getIsoCoords, TILE_W, TILE_H, ISO_ROOMS } from "@/utils/isometric";

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
  dining_table: "🍽️",
  sofa: "🛋️",
  tv: "📺",
  bed: "🛏️",
  generic: "📦",
};

const FURNITURE_SIZES: Record<string, { w: number; h: number }> = {
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

const STRUCTURAL_ITEMS = ["foundation", "floor_coverings", "walls", "painting", "doors_windows", "roof", "electric", "plumbing"];

export default function PublicVirtualHouse({ weddingId, onOpenCheckout }: PublicVirtualHouseProps) {
  const [loading, setLoading] = useState(true);
  const [gifts, setGifts] = useState<DBGift[]>([]);
  const [buyers, setBuyers] = useState<Record<string, string>>({}); // Mapping from gift_id to buyer guest_name
  const [selectedGhost, setSelectedGhost] = useState<DBGift | null>(null);
  const [activeCabinet, setActiveCabinet] = useState<keyof typeof ROOM_DISPLAY | null>(null);
  const [showRoof, setShowRoof] = useState(false);

  const { addItem } = useCart();

  useEffect(() => {
    async function loadHouseData() {
      if (!weddingId) return;
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

  const isGiftPaid = (g: DBGift) => {
    return g.stock === 0 || (g.raisedAmount !== undefined && g.raisedAmount >= g.price);
  };

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

  const placedFurniture = gifts.filter((g) => {
    return g.houseItemType && g.housePositionX !== null && g.housePositionY !== null;
  });

  const getFurnitureAt = (x: number, y: number) => {
    return placedFurniture.find((g) => {
      if (g.housePositionX === null || g.housePositionY === null) return false;
      const size = FURNITURE_SIZES[g.houseItemType || ""] || { w: 1, h: 1 };
      return (
        x >= g.housePositionX &&
        x < g.housePositionX + size.w &&
        y >= g.housePositionY &&
        y < g.housePositionY + size.h
      );
    });
  };

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
  };

  const handleBuyGhost = () => {
    if (!selectedGhost) return;
    addItem(selectedGhost);
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
  const mapOriginX = (6 * (TILE_W / 2)) + 100;
  const mapOriginY = 100;
  const containerHeight = (9 + 6) * (TILE_H / 2) + 200;

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

        <div className="bg-[#4a5f41] p-4 sm:p-8 rounded-3xl border-[6px] border-[#3e5036] shadow-elevated relative overflow-hidden max-w-5xl mx-auto">
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

          <div className="bg-[#1a1c1a] rounded-2xl border border-border shadow-card overflow-hidden w-full overflow-x-auto relative" style={{ minHeight: `${containerHeight}px` }}>
            <div className="relative mx-auto" style={{ width: '1000px', height: `${containerHeight}px` }}>
              
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
                      clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)"
                    }}
                    className={`transition-all flex items-center justify-center
                      ${!tileImg ? "border border-white/20" : ""}
                      ${ghostItem ? "cursor-pointer hover:brightness-125" : ""}
                    `}
                  >
                    {tileImg && (
                      <img src={`/assets/iso/${tileImg}`} alt="floor" className="w-full h-full object-contain pointer-events-none" />
                    )}
                    
                    {!tileImg && (
                      <div className="w-1 h-1 rounded-full bg-white/30 absolute pointer-events-none" />
                    )}

                    {/* Ghost item fallback icon (rendered behind if there's no img yet, or to show hover) */}
                    {ghostItem && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gold/20 backdrop-blur-[1px] group z-20 pointer-events-none">
                         <span className="text-3xl filter sepia saturate-200 drop-shadow-md">
                           {FURNITURE_ICONS[ghostItem.houseItemType || ""] || "📦"}
                         </span>
                         <div className="absolute opacity-0 group-hover:opacity-100 bg-gold text-background text-[10px] font-bold py-1 px-2 rounded -top-8 whitespace-nowrap transition-opacity">
                           Presentear {ghostItem.name}
                         </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Placed Furniture */}
              {placedFurniture.map((furniture) => {
                if (furniture.housePositionX === null || furniture.housePositionY === null) return null;
                const iso = getIsoCoords(furniture.housePositionX, furniture.housePositionY, mapOriginX, mapOriginY);
                const buyerName = buyers[furniture.id];
                
                return (
                  <div
                    key={`furn-${furniture.id}`}
                    style={{
                      position: "absolute",
                      left: `${iso.x}px`,
                      top: `${iso.y - TILE_H}px`,
                      zIndex: iso.zIndex + 10,
                    }}
                    className="group"
                  >
                    <img 
                      src={`/assets/iso/furniture_${furniture.houseItemType}.png`} 
                      alt={furniture.name}
                      className="w-full h-full object-contain drop-shadow-lg"
                    />
                    <div className="absolute bottom-[105%] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-black/90 text-white text-[9px] sm:text-xs py-1.5 px-3 rounded-lg shadow-soft whitespace-nowrap z-50 pointer-events-none border border-white/10">
                      <strong>{furniture.name}</strong> <br />
                      <span className="text-gold/90 font-light mt-0.5 block">
                        {buyerName ? `Presenteado por ${buyerName}` : "Presenteado com carinho!"}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Ghost Unplaced Furniture Assets (Using the same PNG but filtered) */}
              {gifts.filter(g => g.houseItemType && !STRUCTURAL_ITEMS.includes(g.houseItemType) && !isGiftPaid(g) && g.housePositionX !== null && g.housePositionY !== null).map((furniture) => {
                const iso = getIsoCoords(furniture.housePositionX!, furniture.housePositionY!, mapOriginX, mapOriginY);
                return (
                  <div
                    key={`ghost-img-${furniture.id}`}
                    onClick={() => handleGhostClick(furniture)}
                    style={{
                      position: "absolute",
                      left: `${iso.x}px`,
                      top: `${iso.y - TILE_H}px`,
                      zIndex: iso.zIndex + 10,
                    }}
                    className="group cursor-pointer hover:brightness-125 transition-all"
                  >
                    <img 
                      src={`/assets/iso/furniture_${furniture.houseItemType}.png`} 
                      alt={furniture.name}
                      className="w-full h-full object-contain filter sepia saturate-200 hue-rotate-[15deg] opacity-60 drop-shadow-[0_0_8px_rgba(255,215,0,0.5)]"
                    />
                    <div className="absolute bottom-[105%] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-gold text-background text-[10px] font-bold py-1 px-2.5 rounded-md shadow-soft whitespace-nowrap z-50 transition-all pointer-events-none uppercase tracking-wide">
                      Presentear {furniture.name}
                    </div>
                  </div>
                );
              })}

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
              {showRoof && roofPaid && (
                <div className="absolute inset-0 z-[100] pointer-events-none flex items-center justify-center">
                  <img src="/assets/iso/roof.png" alt="Roof" className="drop-shadow-2xl opacity-95 object-contain" />
                </div>
              )}

            </div>
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
                      src={`/assets/iso/furniture_${selectedGhost.houseItemType}.png`} 
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

                <p className="text-3xl font-serif text-gold font-bold">
                  R$ {selectedGhost.price.toFixed(2).replace(".", ",")}
                </p>

                <Button
                  onClick={handleBuyGhost}
                  className="w-full bg-gold hover:bg-gold-light text-background font-bold py-4 text-sm uppercase tracking-wider rounded-xl shadow-soft"
                >
                  <ShoppingBag className="w-4 h-4 mr-2" />
                  Presentear Agora
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
