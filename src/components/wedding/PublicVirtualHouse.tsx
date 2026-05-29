import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { useCart } from "@/contexts/CartContext";
import { Gift } from "@/contexts/WeddingContext";
import { Loader2, Home, Gift as GiftIcon, ShoppingBag, Eye, X, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

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

const ROOM_DEFINITIONS = {
  kitchen: { name: "Cozinha", color: "bg-amber-50/40 border-amber-200/50", labelColor: "text-amber-700", minX: 0, maxX: 4, minY: 0, maxY: 4 },
  bathroom: { name: "Banheiro", color: "bg-cyan-50/40 border-cyan-200/50", labelColor: "text-cyan-700", minX: 5, maxX: 7, minY: 0, maxY: 4 },
  bedroom: { name: "Quarto", color: "bg-purple-50/40 border-purple-200/50", labelColor: "text-purple-700", minX: 8, maxX: 11, minY: 0, maxY: 4 },
  living_room: { name: "Sala", color: "bg-emerald-50/40 border-emerald-200/50", labelColor: "text-emerald-700", minX: 0, maxX: 11, minY: 5, maxY: 7 },
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
  bed: { w: 2, h: 2 },
  dining_table: { w: 2, h: 2 },
  sofa: { w: 2, h: 1 },
};

export default function PublicVirtualHouse({ weddingId, onOpenCheckout }: PublicVirtualHouseProps) {
  const [loading, setLoading] = useState(true);
  const [gifts, setGifts] = useState<DBGift[]>([]);
  const [buyers, setBuyers] = useState<Record<string, string>>({}); // Mapping from gift_id to buyer guest_name
  const [selectedGhost, setSelectedGhost] = useState<DBGift | null>(null);
  const [activeCabinet, setActiveCabinet] = useState<keyof typeof ROOM_DEFINITIONS | null>(null);
  const [showRoof, setShowRoof] = useState(false);

  const { addItem } = useCart();

  useEffect(() => {
    async function loadHouseData() {
      if (!weddingId) return;
      try {
        setLoading(true);

        // Fetch all gifts that have either a room or an item type
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

        // Fetch approved buyers mapping
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

  // Structural checks
  const foundationPaid = getPaidStructural("foundation");
  const wallsPaid = getPaidStructural("walls");
  const doorsWindowsPaid = getPaidStructural("doors_windows");
  const roofPaid = getPaidStructural("roof");
  const electricPaid = getPaidStructural("electric");
  const plumbingPaid = getPaidStructural("plumbing");

  // Core placeables
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

  // Unpurchased placeable silhouettes / Ghost elements
  const getGhostItemAt = (x: number, y: number, roomKey: string) => {
    return gifts.find((g) => {
      return (
        g.houseItemType &&
        !["foundation", "walls", "doors_windows", "roof", "electric", "plumbing"].includes(g.houseItemType) &&
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

  // Draw 12 columns x 8 rows
  const gridCells = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 12; x++) {
      let roomKey: keyof typeof ROOM_DEFINITIONS | null = null;
      if (y >= 0 && y <= 4) {
        if (x >= 0 && x <= 4) roomKey = "kitchen";
        else if (x >= 5 && x <= 7) roomKey = "bathroom";
        else if (x >= 8 && x <= 11) roomKey = "bedroom";
      } else if (y >= 5 && y <= 7) {
        roomKey = "living_room";
      }
      gridCells.push({ x, y, roomKey });
    }
  }

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

        <div className="bg-[#4a5f41] p-4 sm:p-8 rounded-3xl border-[6px] border-[#3e5036] shadow-elevated relative overflow-hidden max-w-4xl mx-auto">
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
            className={`grid grid-cols-12 grid-rows-8 gap-[2px] w-full aspect-[1.5] relative rounded-xl overflow-hidden border-4 transition-all duration-300 ${
              foundationPaid
                ? wallsPaid
                  ? "border-[6px] border-neutral-800 bg-stone-100 shadow-elevated"
                  : "border-4 border-stone-400 bg-stone-100"
                : "border-dashed border-white/20 bg-[#425539]"
            }`}
          >
            {gridCells.map(({ x, y, roomKey }) => {
              const room = roomKey ? ROOM_DEFINITIONS[roomKey] : null;
              const ghostItem = roomKey ? getGhostItemAt(x, y, roomKey) : null;

              let wallBorder = "";
              if (wallsPaid) {
                if (x === 4 || x === 7) wallBorder += " border-r-[6px] border-r-neutral-800";
                if (y === 4) wallBorder += " border-b-[6px] border-b-neutral-800";
              }

              return (
                <div
                  key={`${x}-${y}`}
                  onClick={() => {
                    if (ghostItem) handleGhostClick(ghostItem);
                  }}
                  className={`relative flex items-center justify-center aspect-square transition-all ${
                    room ? room.color : "bg-transparent"
                  } ${wallBorder} ${
                    ghostItem ? "cursor-pointer hover:bg-gold/10 hover:scale-[1.02]" : ""
                  }`}
                >
                  {/* Grid dot */}
                  {!getFurnitureAt(x, y) && !ghostItem && (
                    <div className="w-0.5 h-0.5 rounded-full bg-foreground/10 absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2" />
                  )}

                  {/* Ghost Furniture Silhouette */}
                  {!getFurnitureAt(x, y) && ghostItem && (
                    <div className="flex flex-col items-center justify-center w-full h-full p-1 opacity-40 hover:opacity-85 transition-opacity relative group">
                      <span className="text-2xl sm:text-4xl select-none filter sepia saturate-200 hue-rotate-[15deg]">
                        {FURNITURE_ICONS[ghostItem.houseItemType || ""] || "📦"}
                      </span>
                      <div className="absolute inset-0 border border-dashed border-gold/60 rounded-md m-0.5 animate-pulse" />
                      {/* Hover Ghost Tooltip */}
                      <div className="absolute bottom-[105%] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-gold text-background text-[9px] sm:text-xs font-bold py-1 px-2.5 rounded-md shadow-soft whitespace-nowrap z-30 transition-all pointer-events-none uppercase tracking-wide">
                        Presentear {ghostItem.name}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gold" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Render Placed Furniture Overlays */}
            {placedFurniture.map((furniture) => {
              if (furniture.housePositionX === null || furniture.housePositionY === null) return null;
              const size = FURNITURE_SIZES[furniture.houseItemType || ""] || { w: 1, h: 1 };
              const buyerName = buyers[furniture.id];

              return (
                <div
                  key={`furn-${furniture.id}`}
                  style={{
                    gridColumn: `${furniture.housePositionX + 1} / span ${size.w}`,
                    gridRow: `${furniture.housePositionY + 1} / span ${size.h}`,
                  }}
                  className="flex flex-col items-center justify-center w-full h-full p-1 animate-fade-in group z-10 relative pointer-events-auto"
                >
                  <span className="text-3xl sm:text-5xl select-none filter drop-shadow-md">
                    {FURNITURE_ICONS[furniture.houseItemType || ""] || "📦"}
                  </span>
                  {/* Hover Tooltip */}
                  <div className="absolute bottom-[105%] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-black/90 text-white text-[9px] sm:text-xs py-1.5 px-3 rounded-lg shadow-soft whitespace-nowrap z-30 transition-all pointer-events-none border border-white/10">
                    <strong>{furniture.name}</strong> <br />
                    <span className="text-gold/90 font-light mt-0.5 block">
                      {buyerName ? `Presenteado por ${buyerName}` : "Presenteado com carinho!"}
                    </span>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black/90" />
                  </div>
                </div>
              );
            })}

            {/* Room Labels & Chest Cabinets */}
            {foundationPaid && (
              <div className="absolute inset-0 pointer-events-none select-none z-10">
                {Object.entries(ROOM_DEFINITIONS).map(([key, room]) => {
                  const left = `${(room.minX / 12) * 100 + 2}%`;
                  const top = `${(room.minY / 8) * 100 + 2}%`;

                  // Cabinet/Chest click handler
                  const hasCabinetItems = gifts.some(
                    (g) => g.houseRoom === key && !g.houseItemType && isGiftPaid(g)
                  );

                  return (
                    <div key={room.name} style={{ left, top }} className="absolute flex flex-col gap-2 items-start pointer-events-auto">
                      <span className={`text-[9px] sm:text-[11px] font-serif font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-white/80 shadow-soft border border-border/40 ${room.labelColor}`}>
                        {room.name}
                      </span>
                      {/* Cabinet Chest Button */}
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

            {/* Render plumbing if paid */}
            {plumbingPaid && (
              <div className="absolute inset-0 pointer-events-none select-none z-5">
                <span className="absolute top-[5%] left-[2%] text-sm sm:text-base">🚰</span>
                <span className="absolute top-[5%] left-[45%] text-sm sm:text-base">🚿</span>
              </div>
            )}

            {/* Render electric bulbs if paid */}
            {electricPaid && (
              <div className="absolute inset-0 pointer-events-none select-none z-5">
                <span className="absolute top-[20%] left-[18%] text-xs animate-pulse">💡</span>
                <span className="absolute top-[20%] left-[53%] text-xs animate-pulse">💡</span>
                <span className="absolute top-[20%] left-[78%] text-xs animate-pulse">💡</span>
                <span className="absolute top-[70%] left-[45%] text-xs animate-pulse">💡</span>
              </div>
            )}

            {/* Render Doors/Windows if paid */}
            {doorsWindowsPaid && (
              <div className="absolute inset-0 pointer-events-none select-none z-5">
                <span className="absolute bottom-0 left-[45%] translate-y-1/2 text-[8px] sm:text-[10px] bg-stone-800 text-white font-bold px-1.5 py-0.5 rounded border border-border">PORTA</span>
              </div>
            )}

            {/* Transparent Roof overlay */}
            {showRoof && roofPaid && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-amber-900/95 flex flex-col items-center justify-center p-6 text-center select-none z-25 border-4 border-amber-950"
                style={{
                  backgroundImage: "repeating-linear-gradient(45deg, #78350f, #78350f 10px, #92400e 10px, #92400e 20px)",
                }}
              >
                <div className="bg-amber-950/70 p-4 rounded-xl border border-amber-800 shadow-card">
                  <span className="text-white text-4xl block">🏠</span>
                  <h4 className="font-serif text-xl text-amber-100 font-bold mt-2">Nossa Casa dos Sonhos</h4>
                  <p className="text-xs text-amber-200/80 max-w-sm mt-1">Concluímos a cobertura! Use o botão no canto superior direito para ver os cômodos e móveis por dentro.</p>
                </div>
              </motion.div>
            )}
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

                <div className="mx-auto w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center">
                  <span className="text-4xl select-none">
                    {FURNITURE_ICONS[selectedGhost.houseItemType || ""] || "🎁"}
                  </span>
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
                    Armário de Enxoval: {ROOM_DEFINITIONS[activeCabinet].name}
                  </h3>
                  <p className="text-[10px] text-[#8b8b8b] mt-1 uppercase tracking-wide">Inventário de presentes recebidos</p>
                </div>

                {/* Grid slots wrapper */}
                <div className="grid grid-cols-4 gap-3 bg-[#111] p-4 rounded-xl border border-[#3c3c3c]">
                  {(() => {
                    const cabinetItems = gifts.filter(
                      (g) => g.houseRoom === activeCabinet && !g.houseItemType && isGiftPaid(g)
                    );

                    // Render 8 modular slots minimum (similar to RE4 or Minecraft chest grid)
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
                              <div className="absolute bottom-[110%] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-[#0f0f0f] border-2 border-[#3c3c3c] text-white text-[9px] sm:text-xs py-2 px-3 rounded shadow-card whitespace-nowrap z-50 pointer-events-none">
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
                  Adicione e compre itens da lista da {ROOM_DEFINITIONS[activeCabinet].name} para preencher este armário!
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
