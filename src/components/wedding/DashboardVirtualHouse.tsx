import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Armchair, Move, Trash2, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { getIsoCoords, TILE_W, TILE_H, ISO_ROOMS, FURNITURE_SIZES, getFurniturePlacement } from "@/utils/isometric";
import { getGiftFundingProgress, isGiftFundingComplete } from "@/utils/giftFunding";

interface DashboardVirtualHouseProps {
  weddingId: string;
}

interface DBGift {
  id: string;
  name: string;
  price: number;
  stock: number | null;
  raised_amount?: number;
  is_vaquinha?: boolean | null;
  total_quotas?: number | null;
  house_item_type: string | null;
  house_room: string | null;
  house_position_x: number | null;
  house_position_y: number | null;
}

const ROOM_DISPLAY = {
  kitchen: { name: "Cozinha", ...ISO_ROOMS.kitchen },
  bathroom: { name: "Banheiro", ...ISO_ROOMS.bathroom },
  bedroom: { name: "Quarto", ...ISO_ROOMS.bedroom },
  laundry: { name: "Área de Serviço", ...ISO_ROOMS.laundry },
  living_room: { name: "Sala de Estar", ...ISO_ROOMS.living_room },
};

const STRUCTURAL_ITEMS = ["foundation", "floor_coverings", "walls", "painting", "doors_windows", "roof", "electric", "plumbing"];

const toFundable = (g: DBGift) => ({
  price: g.price,
  stock: g.stock,
  totalQuotas: g.total_quotas,
  isVaquinha: g.is_vaquinha || false,
  raisedAmount: g.raised_amount,
});

export default function DashboardVirtualHouse({ weddingId }: DashboardVirtualHouseProps) {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [gifts, setGifts] = useState<DBGift[]>([]);
  const [selectedFurniture, setSelectedFurniture] = useState<DBGift | null>(null);
  const [showRoof, setShowRoof] = useState(false);
  const constraintsRef = useRef(null);

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [selectedLinkGift, setSelectedLinkGift] = useState("");
  const [selectedLinkRoom, setSelectedLinkRoom] = useState("");
  const [selectedLinkType, setSelectedLinkType] = useState("");

  useEffect(() => {
    async function loadHouseData() {
      if (!weddingId) return;
      try {
        setLoading(true);
        // Carrega todos os presentes do casamento (não só os já vinculados à casa):
        // o modal "Vincular Presente" precisa enxergar presentes ainda sem house_item_type.
        const { data, error } = await supabase
          .from("gifts")
          .select("id, name, price, stock, raised_amount, is_vaquinha, total_quotas, house_item_type, house_room, house_position_x, house_position_y")
          .eq("wedding_id", weddingId);

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

  // Presentes ainda não vinculados a nenhum móvel/etapa da casa, independente de já
  // estarem financiados ou não — vincular não exige mais pagamento prévio.
  const unlinkedGifts = gifts.filter((g) => !g.house_item_type);

  const getPaidStructural = (type: string) => {
    const item = gifts.find((g) => g.house_item_type === type);
    return item ? isGiftFundingComplete(toFundable(item)) : false;
  };

  const foundationPaid = getPaidStructural("foundation");
  const floorCoveringsPaid = getPaidStructural("floor_coverings");
  const wallsPaid = getPaidStructural("walls");
  const paintingPaid = getPaidStructural("painting");
  const doorsWindowsPaid = getPaidStructural("doors_windows");
  const roofPaid = getPaidStructural("roof");
  const electricPaid = getPaidStructural("electric");
  const plumbingPaid = getPaidStructural("plumbing");

  // Móveis já vinculados a um tipo/cômodo mas ainda sem posição no grid (hoje só
  // acontece via "Vincular Presente", já que os itens do catálogo já nascem
  // posicionados na posição padrão do cômodo).
  const placeableFurniture = gifts.filter((g) => {
    return (
      g.house_item_type &&
      !STRUCTURAL_ITEMS.includes(g.house_item_type) &&
      g.house_position_x === null
    );
  });

  const placedFurniture = gifts.filter((g) => {
    return g.house_item_type && g.house_position_x !== null && g.house_position_y !== null;
  });

  const getFurnitureAt = (x: number, y: number) => {
    return placedFurniture.find((g) => {
      if (g.house_position_x === null || g.house_position_y === null) return false;
      const size = FURNITURE_SIZES[g.house_item_type || ""] || { w: 1, h: 1 };
      return (
        x >= g.house_position_x &&
        x < g.house_position_x + size.w &&
        y >= g.house_position_y &&
        y < g.house_position_y + size.h
      );
    });
  };

  const handleCellClick = async (x: number, y: number) => {
    if (!selectedFurniture) return;

    const roomKey = selectedFurniture.house_room as keyof typeof ROOM_DISPLAY;
    const room = ROOM_DISPLAY[roomKey];
    if (!room) return;

    const size = FURNITURE_SIZES[selectedFurniture.house_item_type || ""] || { w: 1, h: 1 };
    
    if (x < room.minX || (x + size.w - 1) > room.maxX || y < room.minY || (y + size.h - 1) > room.maxY) {
      toast.error(`Espaço insuficiente na ${room.name} para este móvel.`);
      return;
    }

    let isOccupied = false;
    for (let i = 0; i < size.w; i++) {
      for (let j = 0; j < size.h; j++) {
        if (getFurnitureAt(x + i, y + j)) {
          isOccupied = true;
        }
      }
    }

    if (isOccupied) {
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

  const handleLinkGift = async () => {
    if (!selectedLinkGift || !selectedLinkRoom || !selectedLinkType) {
      toast.error("Preencha todos os campos para vincular!");
      return;
    }
    
    try {
      setUpdating(selectedLinkGift);
      const { error } = await supabase
        .from("gifts")
        .update({
          house_item_type: selectedLinkType,
          house_room: selectedLinkRoom,
        } as any)
        .eq("id", selectedLinkGift);

      if (error) throw error;

      setGifts(prev => prev.map(g => g.id === selectedLinkGift ? { ...g, house_item_type: selectedLinkType, house_room: selectedLinkRoom } : g));
      toast.success("Presente vinculado com sucesso! Agora posicione-o na planta.");
      setIsLinkModalOpen(false);
      setSelectedLinkGift("");
      setSelectedLinkRoom("");
      setSelectedLinkType("");
    } catch(err) {
      console.error(err);
      toast.error("Erro ao vincular");
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
  // Grid X max = 9, Grid Y max = 6
  const mapOriginX = (6 * (TILE_W / 2)) + 100; // Offset enough to fit the left corner (y max)
  const mapOriginY = 180;
  const containerHeight = (9 + 6) * (TILE_H / 2) + 260; // rough bounds

  return (
    <div className="grid lg:grid-cols-12 gap-8 items-start animate-fade-in">
      <div className="lg:col-span-8 space-y-6">
        <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border shadow-soft">
          <div>
            <h3 className="font-serif text-lg text-foreground">Planta Baixa Interativa</h3>
            <p className="text-xs text-muted-foreground">Posicione seus móveis adquiridos no grid isométrico</p>
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
            style={{ width: '1200px', height: `${containerHeight}px` }}
          >
            
            {/* Grid Foundation & Cells */}
            {gridCells.map(({ x, y, roomKey }) => {
              const iso = getIsoCoords(x, y, mapOriginX, mapOriginY);
              const isSelectedRoom = selectedFurniture && selectedFurniture.house_room === roomKey;
              
              // Floor texture determination
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
                  onClick={() => handleCellClick(x, y)}
                  style={{
                    position: "absolute",
                    left: `${iso.x}px`,
                    top: `${iso.y}px`,
                    width: `${TILE_W}px`,
                    height: `${TILE_H}px`,
                    zIndex: iso.zIndex,
                    clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
                  }}
                  className={`transition-all cursor-pointer flex items-center justify-center
                    ${!tileImg ? "border border-white/20 hover:bg-white/10" : ""}
                    ${isSelectedRoom ? "brightness-125" : ""}
                  `}
                >
                  {tileImg && (
                    <img src={`/assets/iso/${tileImg}`} alt="floor" className="w-full h-full object-contain pointer-events-none" />
                  )}
                  {/* Grid Lines if no tile */}
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

            {/* Placed Furniture */}
            {placedFurniture.map((furniture) => {
              if (furniture.house_position_x === null || furniture.house_position_y === null || !furniture.house_item_type) return null;
              const placement = getFurniturePlacement(
                furniture.house_item_type,
                furniture.house_position_x,
                furniture.house_position_y,
                mapOriginX,
                mapOriginY
              );
              
              return (
                <div
                  key={`furn-${furniture.id}`}
                  style={{
                    position: "absolute",
                    left: `${placement.left}px`,
                    top: `${placement.top}px`,
                    width: `${placement.width}px`,
                    height: `${placement.height}px`,
                    zIndex: placement.zIndex,
                  }}
                  className="group pointer-events-auto"
                >
                  <img 
                    src={`/assets/iso/furniture_${furniture.house_item_type}.png?v=3`} 
                    alt={furniture.name}
                    className="w-full h-full object-contain drop-shadow-lg"
                  />
                  {/* Tooltip Overlay */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-background/95 rounded-lg flex flex-col items-center justify-center p-2 text-center transition-opacity border border-border shadow-soft z-50">
                      <span className="text-[10px] font-bold text-foreground whitespace-nowrap">{furniture.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFromMap(furniture.id, furniture.name);
                        }}
                        className="mt-2 p-1 bg-destructive/10 hover:bg-destructive text-destructive hover:text-white rounded"
                        title="Remover"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                  </div>
                </div>
              );
            })}

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
              const bottomY = bottomRight.y + TILE_H;
              const bbW = rightX - leftX;
              // Use roof's native aspect ratio (700:400 = 1.75) to compute height
              // so object-contain fills 100% of the container
              const ROOF_ASPECT = 700 / 400;
              const roofW = bbW + 160;
              const roofH = roofW / ROOF_ASPECT;
              // Center the roof over the grid
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

      {/* Right Column */}
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-card rounded-xl p-5 border border-border shadow-soft space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Armchair className="w-5 h-5 text-gold" />
              <h3 className="font-serif text-base text-foreground">Móveis para Posicionar</h3>
            </div>
            <Button onClick={() => setIsLinkModalOpen(true)} variant="outline" size="sm" className="h-8 text-[10px] sm:text-xs">
              Vincular Presente
            </Button>
          </div>

          {placeableFurniture.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <HelpCircle className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-xs">Nenhum presente vinculado aguardando posicionamento no momento.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {placeableFurniture.map((furniture) => {
                const isSelected = selectedFurniture?.id === furniture.id;
                const roomName = ROOM_DISPLAY[furniture.house_room as keyof typeof ROOM_DISPLAY]?.name || "";
                const progress = Math.round(getGiftFundingProgress(toFundable(furniture)));

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
                      <div className="w-8 h-8 relative">
                          <img src={`/assets/iso/furniture_${furniture.house_item_type}.png?v=3`} alt="icon" className="w-full h-full object-contain drop-shadow" />
                      </div>
                      <div>
                        <h4 className="font-medium text-xs text-foreground leading-none">{furniture.name}</h4>
                        <span className="text-[10px] text-muted-foreground mt-1 block">
                          Colocar na: {roomName} {progress > 0 && progress < 100 && `· ${progress}% financiado`}
                        </span>
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
                Clique em uma célula vazia do cômodo <strong>{ROOM_DISPLAY[selectedFurniture.house_room as keyof typeof ROOM_DISPLAY]?.name}</strong> na planta baixa para fixar o móvel.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Link Gift Modal */}
      <Dialog open={isLinkModalOpen} onOpenChange={setIsLinkModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Vincular Presente à Casa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">1. Escolha o Presente</label>
              <select 
                className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedLinkGift}
                onChange={e => setSelectedLinkGift(e.target.value)}
              >
                <option value="">Selecione...</option>
                {unlinkedGifts.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">2. Cômodo</label>
              <select 
                className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedLinkRoom}
                onChange={e => setSelectedLinkRoom(e.target.value)}
              >
                <option value="">Selecione...</option>
                {Object.entries(ROOM_DISPLAY).map(([key, room]) => (
                  <option key={key} value={key}>{room.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">3. Tipo</label>
              <select 
                className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedLinkType}
                onChange={e => setSelectedLinkType(e.target.value)}
              >
                <option value="">Selecione...</option>
                {Object.keys(FURNITURE_SIZES).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <Button onClick={handleLinkGift} disabled={!selectedLinkGift || !selectedLinkRoom || !selectedLinkType || updating !== null} className="mt-2">
              {updating === selectedLinkGift ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Vincular"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
