import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Loader2, Armchair, Move, Trash2, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

interface DashboardVirtualHouseProps {
  weddingId: string;
}

interface DBGift {
  id: string;
  name: string;
  price: number;
  stock: number | null;
  raised_amount?: number;
  house_item_type: string | null;
  house_room: string | null;
  house_position_x: number | null;
  house_position_y: number | null;
}

const ROOM_DEFINITIONS = {
  kitchen: { name: "Cozinha", color: "bg-amber-50/40 border-amber-200/50", labelColor: "text-amber-700", minX: 0, maxX: 4, minY: 0, maxY: 4 },
  bathroom: { name: "Banheiro", color: "bg-cyan-50/40 border-cyan-200/50", labelColor: "text-cyan-700", minX: 5, maxX: 7, minY: 0, maxY: 4 },
  bedroom: { name: "Quarto", color: "bg-purple-50/40 border-purple-200/50", labelColor: "text-purple-700", minX: 8, maxX: 11, minY: 0, maxY: 4 },
  living_room: { name: "Sala", color: "bg-emerald-50/40 border-emerald-200/50", labelColor: "text-emerald-700", minX: 0, maxX: 11, minY: 5, maxY: 7 },
};

const FURNITURE_ICONS: Record<string, string> = {
  fridge: "❄️",
  stove: "🔥",
  dining_table: "🪑",
  sofa: "🛋️",
  tv: "📺",
  bed: "🛏️",
};

export default function DashboardVirtualHouse({ weddingId }: DashboardVirtualHouseProps) {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [gifts, setGifts] = useState<DBGift[]>([]);
  const [selectedFurniture, setSelectedFurniture] = useState<DBGift | null>(null);
  const [showRoof, setShowRoof] = useState(false);

  useEffect(() => {
    async function loadHouseData() {
      if (!weddingId) return;
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("gifts")
          .select("id, name, price, stock, house_item_type, house_room, house_position_x, house_position_y")
          .eq("wedding_id", weddingId)
          .not("house_item_type", "is", null);

        if (error) throw error;
        setGifts(data as DBGift[]);
      } catch (err) {
        console.error("Error loading house data:", err);
        toast.error("Erro ao carregar dados da casa virtual");
      } finally {
        setLoading(false);
      }
    }
    loadHouseData();
  }, [weddingId]);

  const isGiftPaid = (g: DBGift) => {
    return g.stock === 0 || (g.raised_amount !== undefined && g.raised_amount >= g.price);
  };

  const getPaidStructural = (type: string) => {
    const item = gifts.find((g) => g.house_item_type === type);
    return item ? isGiftPaid(item) : false;
  };

  // Structural checks
  const foundationPaid = getPaidStructural("foundation");
  const wallsPaid = getPaidStructural("walls");
  const doorsWindowsPaid = getPaidStructural("doors_windows");
  const roofPaid = getPaidStructural("roof");
  const electricPaid = getPaidStructural("electric");
  const plumbingPaid = getPaidStructural("plumbing");

  // Placeable items drawer
  const placeableFurniture = gifts.filter((g) => {
    return (
      g.house_item_type &&
      !["foundation", "walls", "doors_windows", "roof", "electric", "plumbing"].includes(g.house_item_type) &&
      isGiftPaid(g) &&
      g.house_position_x === null
    );
  });

  // Already placed items
  const placedFurniture = gifts.filter((g) => {
    return g.house_item_type && g.house_position_x !== null && g.house_position_y !== null;
  });

  const getFurnitureAt = (x: number, y: number) => {
    return placedFurniture.find((g) => g.house_position_x === x && g.house_position_y === y);
  };

  const handleCellClick = async (x: number, y: number) => {
    if (!selectedFurniture) return;

    // Validate if cell is inside the designated room for this furniture
    const roomKey = selectedFurniture.house_room as keyof typeof ROOM_DEFINITIONS;
    const room = ROOM_DEFINITIONS[roomKey];
    if (!room) return;

    if (x < room.minX || x > room.maxX || y < room.minY || y > room.maxY) {
      toast.error(`Apenas é permitido colocar este item na ${room.name}`);
      return;
    }

    // Check if cell is already occupied
    if (getFurnitureAt(x, y)) {
      toast.error("Este espaço já está ocupado por outro móvel");
      return;
    }

    try {
      setUpdating(selectedFurniture.id);
      const { error } = await supabase
        .from("gifts")
        .update({
          house_position_x: x,
          house_position_y: y,
        } as any)
        .eq("id", selectedFurniture.id);

      if (error) throw error;

      // Update state locally
      setGifts((prev) =>
        prev.map((g) =>
          g.id === selectedFurniture.id ? { ...g, house_position_x: x, house_position_y: y } : g
        )
      );

      toast.success(`${selectedFurniture.name} posicionado no mapa!`);
      setSelectedFurniture(null);
    } catch (err) {
      console.error("Error placing furniture:", err);
      toast.error("Erro ao posicionar móvel");
    } finally {
      setUpdating(null);
    }
  };

  const handleRemoveFromMap = async (id: string, name: string) => {
    try {
      setUpdating(id);
      const { error } = await supabase
        .from("gifts")
        .update({
          house_position_x: null,
          house_position_y: null,
        } as any)
        .eq("id", id);

      if (error) throw error;

      setGifts((prev) =>
        prev.map((g) =>
          g.id === id ? { ...g, house_position_x: null, house_position_y: null } : g
        )
      );

      toast.success(`${name} removido do mapa.`);
    } catch (err) {
      console.error("Error removing furniture:", err);
      toast.error("Erro ao remover móvel");
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 animate-spin text-gold" />
        <p className="text-sm text-muted-foreground mt-4 font-serif">Carregando planta interativa...</p>
      </div>
    );
  }

  // Draw 12 columns x 8 rows
  const gridCells = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 12; x++) {
      // Find room category
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
    <div className="grid lg:grid-cols-12 gap-8 items-start animate-fade-in">
      {/* Left Column: Interactive Map Grid */}
      <div className="lg:col-span-8 space-y-6">
        <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border shadow-soft">
          <div>
            <h3 className="font-serif text-lg text-foreground">Planta Baixa Interativa</h3>
            <p className="text-xs text-muted-foreground">Posicione seus móveis adquiridos no grid</p>
          </div>
          {roofPaid && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRoof(!showRoof)}
              className="text-xs border-gold text-gold hover:bg-gold/5"
            >
              {showRoof ? "Mostrar Interior" : "Mostrar Telhado"}
            </Button>
          )}
        </div>

        {/* Outer Soil Frame */}
        <div className="bg-[#4a5f41] p-4 sm:p-6 rounded-2xl border-4 border-[#3e5036] shadow-card relative overflow-hidden">
          {/* Grid Layout Container */}
          <div
            className={`grid grid-cols-12 gap-[2px] w-full aspect-[1.5] relative rounded-lg overflow-hidden border-4 ${
              foundationPaid ? "border-stone-500 bg-stone-100" : "border-dashed border-white/20 bg-[#425539]"
            }`}
          >
            {/* Grid Cells */}
            {gridCells.map(({ x, y, roomKey }) => {
              const room = roomKey ? ROOM_DEFINITIONS[roomKey] : null;
              const furniture = getFurnitureAt(x, y);
              const isSelectedRoom = selectedFurniture && selectedFurniture.house_room === roomKey;

              // Structural Walls Styling
              let wallBorder = "";
              if (wallsPaid) {
                // Room Division walls
                if (x === 4 || x === 7) wallBorder += " border-r-4 border-r-stone-700";
                if (y === 4) wallBorder += " border-b-4 border-b-stone-700";
              }

              return (
                <div
                  key={`${x}-${y}`}
                  onClick={() => handleCellClick(x, y)}
                  className={`relative flex items-center justify-center aspect-square transition-all cursor-pointer ${
                    room ? room.color : "bg-transparent"
                  } ${wallBorder} ${
                    isSelectedRoom
                      ? "hover:bg-gold/20 hover:scale-[1.03] shadow-inner ring-1 ring-gold/40"
                      : "hover:bg-white/10"
                  }`}
                >
                  {/* Grid Dots helper */}
                  {!furniture && (
                    <div className="w-1 h-1 rounded-full bg-foreground/10 absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2" />
                  )}

                  {/* Render Placed Furniture */}
                  {furniture && (
                    <div className="flex flex-col items-center justify-center w-full h-full p-1 animate-fade-in group">
                      <span className="text-2xl sm:text-3xl select-none">
                        {FURNITURE_ICONS[furniture.house_item_type || ""] || "🎁"}
                      </span>
                      {updating === furniture.id ? (
                        <div className="absolute inset-0 bg-background/80 rounded-lg flex items-center justify-center">
                          <Loader2 className="w-4 h-4 animate-spin text-gold" />
                        </div>
                      ) : (
                        <div className="absolute inset-0 opacity-0 hover:opacity-100 bg-background/95 rounded-lg flex flex-col items-center justify-center p-2 text-center transition-opacity border border-border shadow-soft">
                          <span className="text-[10px] font-bold text-foreground truncate w-full">{furniture.name}</span>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFromMap(furniture.id, furniture.name);
                              }}
                              className="p-1 bg-destructive/10 hover:bg-destructive text-destructive hover:text-white rounded"
                              title="Remover"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Room Labels inside Grid overlay */}
            {foundationPaid && (
              <div className="absolute inset-0 pointer-events-none select-none">
                {Object.values(ROOM_DEFINITIONS).map((room) => {
                  // Approximate coordinates for label placement inside the 12x8 layout
                  const left = `${(room.minX / 12) * 100 + 2}%`;
                  const top = `${(room.minY / 8) * 100 + 2}%`;
                  return (
                    <span
                      key={room.name}
                      style={{ left, top }}
                      className={`absolute text-[10px] sm:text-xs font-serif font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-white/70 shadow-soft border border-border/40 ${room.labelColor}`}
                    >
                      {room.name}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Render plumbing icons (Kitchen sink & Bathroom tap) if plumbingPaid */}
            {plumbingPaid && (
              <div className="absolute inset-0 pointer-events-none select-none">
                {/* Kitchen Plumbing */}
                <span className="absolute top-[5%] left-[2%] text-sm" title="Pia da Cozinha">🚰</span>
                {/* Bathroom Plumbing */}
                <span className="absolute top-[5%] left-[45%] text-sm" title="Pia do Banheiro">🚿</span>
              </div>
            )}

            {/* Render electric bulbs glow if electricPaid */}
            {electricPaid && (
              <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center">
                <span className="absolute top-[20%] left-[18%] text-xs opacity-70 animate-pulse">💡</span>
                <span className="absolute top-[20%] left-[53%] text-xs opacity-70 animate-pulse">💡</span>
                <span className="absolute top-[20%] left-[78%] text-xs opacity-70 animate-pulse">💡</span>
                <span className="absolute top-[70%] left-[45%] text-xs opacity-70 animate-pulse">💡</span>
              </div>
            )}

            {/* Render Doors/Windows cutouts if doorsWindowsPaid */}
            {doorsWindowsPaid && (
              <div className="absolute inset-0 pointer-events-none select-none">
                {/* Main Front Door */}
                <span className="absolute bottom-0 left-[45%] translate-y-1/2 text-xs bg-stone-800 text-white font-bold px-1.5 py-0.5 rounded border border-border">PORTA</span>
              </div>
            )}

            {/* Transparent Roof overlay if enabled */}
            {showRoof && roofPaid && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 bg-amber-900/90 flex flex-col items-center justify-center p-6 text-center select-none z-25 cursor-not-allowed border-4 border-amber-950"
                style={{
                  backgroundImage: "repeating-linear-gradient(45deg, #78350f, #78350f 10px, #92400e 10px, #92400e 20px)",
                }}
              >
                <div className="bg-amber-950/70 p-3 rounded-lg border border-amber-800">
                  <span className="text-white text-3xl">🏠</span>
                  <h4 className="font-serif text-lg text-amber-100 font-bold mt-2">Telhado da Casa dos Sonhos</h4>
                  <p className="text-xs text-amber-200/80">O interior está coberto. Clique no botão de alternar no topo para visualizar por dentro.</p>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Placed Furniture Drawer Sidebar */}
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-card rounded-xl p-5 border border-border shadow-soft space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <Armchair className="w-5 h-5 text-gold" />
            <h3 className="font-serif text-base text-foreground">Móveis para Posicionar</h3>
          </div>

          {placeableFurniture.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <HelpCircle className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-xs">Nenhum móvel essencial adquirido aguardando posicionamento no momento.</p>
              <p className="text-[10px] mt-2 leading-relaxed">
                Assim que um convidado comprar um móvel essencial (Geladeira, Cama, Sofá, etc.), ele aparecerá aqui para você colocar na casa!
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {placeableFurniture.map((furniture) => {
                const isSelected = selectedFurniture?.id === furniture.id;
                const roomName = ROOM_DEFINITIONS[furniture.house_room as keyof typeof ROOM_DEFINITIONS]?.name || "";

                return (
                  <button
                    key={furniture.id}
                    onClick={() => setSelectedFurniture(isSelected ? null : furniture)}
                    className={`w-full text-left p-3 rounded-lg border shadow-soft flex items-center justify-between transition-all ${
                      isSelected
                        ? "border-gold bg-gold/5 ring-1 ring-gold"
                        : "border-border bg-muted/30 hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl select-none">{FURNITURE_ICONS[furniture.house_item_type || ""] || "🎁"}</span>
                      <div>
                        <h4 className="font-medium text-xs text-foreground leading-none">{furniture.name}</h4>
                        <span className="text-[10px] text-muted-foreground mt-1 block">Colocar na: {roomName}</span>
                      </div>
                    </div>
                    <Move className="w-3.5 h-3.5 text-gold animate-pulse" />
                  </button>
                );
              })}
            </div>
          )}

          {selectedFurniture && (
            <div className="p-3 bg-gold/5 rounded-lg border border-gold/30 text-center animate-fade-in">
              <p className="text-xs text-gold font-medium leading-relaxed">
                <strong>Modo Posicionamento Ativado!</strong> <br />
                Clique em uma célula vazia do cômodo <strong>{ROOM_DEFINITIONS[selectedFurniture.house_room as keyof typeof ROOM_DEFINITIONS]?.name}</strong> na planta baixa para fixar o móvel.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
