import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Armchair, Move, Trash2, HelpCircle, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { getIsoCoords, TILE_W, TILE_H, ISO_ROOMS, FURNITURE_SIZES, getFurniturePlacement, getFurnitureSpriteKey, getRoofPlacement, WALL_HEIGHT, isCountertopProperlyPlaced, COUNTERTOP_ITEM_TYPES, COUNTER_SURFACE_ITEM_TYPES } from "@/utils/isometric";
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

const SCENE_WIDTH = 1220;
const SCENE_HEIGHT = (9 + 6) * (TILE_H / 2) + 260; // 740
const ASSET_VERSION = "37";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [viewportHeight, setViewportHeight] = useState<number>(typeof window !== "undefined" ? window.innerHeight : 900);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [resetKey, setResetKey] = useState<number>(0);

  // O container só existe depois que `loading` termina, por isso `loading` é dependência
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setContainerWidth(el.clientWidth);
      setViewportHeight(window.innerHeight);
    };
    update();
    window.addEventListener("resize", update);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(el);
    }
    return () => {
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [loading]);

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

  const getFurnituresAt = (x: number, y: number) => {
    return placedFurniture.filter((g) => {
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

    const isCountertop = COUNTERTOP_ITEM_TYPES.includes(selectedFurniture.house_item_type || "");

    if (isCountertop) {
      const placedItems = placedFurniture.map((g) => ({
        id: g.id,
        type: g.house_item_type || "",
        x: g.house_position_x ?? 0,
        y: g.house_position_y ?? 0,
      }));
      const check = isCountertopProperlyPlaced(
        selectedFurniture.house_item_type || "",
        x,
        y,
        placedItems,
        selectedFurniture.id
      );
      if (!check.valid) {
        toast.error(check.reason);
        return;
      }
    } else {
      let isOccupied = false;
      for (let i = 0; i < size.w; i++) {
        for (let j = 0; j < size.h; j++) {
          const items = getFurnituresAt(x + i, y + j).filter((g) => g.id !== selectedFurniture.id);
          if (items.length > 0) {
            isOccupied = true;
          }
        }
      }

      if (isOccupied) {
        toast.error("Este espaço já está ocupado por outro móvel");
        return;
      }
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

  // Câmera: encaixa a cena na largura do card (e na altura da janela no desktop).
  const isDesktop = containerWidth >= 900;
  const widthScale = containerWidth ? (containerWidth - 8) / SCENE_WIDTH : 1;
  const heightCap = isDesktop ? Math.max(0.55, (viewportHeight - 150) / SCENE_HEIGHT) : Infinity;
  const fitScale = Math.min(1.35, Math.max(0.2, Math.min(widthScale, heightCap)));
  const currentScale = Math.min(3, Math.max(0.2, fitScale * zoomLevel));
  const displayHeight = Math.round(SCENE_HEIGHT * fitScale);
  const overflowX = Math.max(0, (SCENE_WIDTH * currentScale - containerWidth) / 2) + 40;
  const overflowY = Math.max(0, (SCENE_HEIGHT * currentScale - displayHeight) / 2) + 40;

  const mapOriginX = 450;
  const mapOriginY = 180;

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
          ref={containerRef}
          className="bg-[#1a1c1a] rounded-2xl border border-border shadow-card overflow-hidden w-full relative select-none"
          style={{ height: `${displayHeight}px`, touchAction: zoomLevel > 1.05 ? "none" : "pan-y" }}
        >

          {/* Controles de câmera */}
          <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5 bg-black/75 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/10 shadow-elevated">
            <button type="button" onClick={() => setZoomLevel((z) => Math.max(0.6, Number((z - 0.2).toFixed(1))))} disabled={zoomLevel <= 0.6} title="Diminuir zoom" className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all disabled:opacity-40">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-white/80 min-w-[38px] text-center select-none">{Math.round(currentScale * 100)}%</span>
            <button type="button" onClick={() => setZoomLevel((z) => Math.min(2.5, Number((z + 0.2).toFixed(1))))} disabled={zoomLevel >= 2.5} title="Aumentar zoom" className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all disabled:opacity-40">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {zoomLevel !== 1 && (
              <button type="button" onClick={() => { setZoomLevel(1); setResetKey((k) => k + 1); }} title="Ajustar à tela" className="px-2 h-7 rounded-lg bg-gold/20 hover:bg-gold/30 text-gold flex items-center text-[10px] font-medium transition-all ml-0.5">
                <RotateCcw className="w-3 h-3 mr-1" />
                Ajustar
              </button>
            )}
          </div>

          <motion.div
            key={resetKey}
            drag={zoomLevel > 1.05}
            dragConstraints={{ left: -overflowX, right: overflowX, top: -overflowY, bottom: overflowY }}
            dragElastic={0.05}
            className="absolute shrink-0"
            style={{
              width: `${SCENE_WIDTH}px`,
              height: `${SCENE_HEIGHT}px`,
              left: "50%",
              top: "50%",
              marginLeft: `-${SCENE_WIDTH / 2}px`,
              marginTop: `-${SCENE_HEIGHT / 2}px`,
              scale: currentScale,
            }}
          >

            {/* Grid Foundation & Cells */}
            {gridCells.map(({ x, y, roomKey }) => {
              const iso = getIsoCoords(x, y, mapOriginX, mapOriginY);
              const isSelectedRoom = selectedFurniture && selectedFurniture.house_room === roomKey;
              
              // Floor texture determination
              let tileImg = null;
              if (floorCoveringsPaid && roomKey) {
                if (roomKey === "kitchen") tileImg = "tile_kitchen.png?v=" + ASSET_VERSION;
                if (roomKey === "bathroom") tileImg = "tile_bathroom.png?v=" + ASSET_VERSION;
                if (roomKey === "bedroom") tileImg = "tile_bedroom.png?v=" + ASSET_VERSION;
                if (roomKey === "laundry") tileImg = "tile_laundry.png?v=" + ASSET_VERSION;
                if (roomKey === "living_room") tileImg = "tile_living.png?v=" + ASSET_VERSION;
              } else if (foundationPaid) {
                tileImg = "tile_foundation.png?v=" + ASSET_VERSION;
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
              // Windows in Kitchen (x=1) and Bedroom (x=6, above bed headboard) if doors_windows paid
              const hasWindow = doorsWindowsPaid && (x === 1 || x === 6);
              const wallImg = hasWindow ? "wall_ne_window.png?v=" + ASSET_VERSION : "wall_ne_plain.png?v=" + ASSET_VERSION;

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
              const wallImg = hasWindow ? "wall_nw_window.png?v=" + ASSET_VERSION : "wall_nw_plain.png?v=" + ASSET_VERSION;

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
            {(() => {
              const allPlacedItemsList = placedFurniture
                .filter((f) => f.house_position_x !== null && f.house_position_y !== null && f.house_item_type)
                .map((f) => ({
                  type: f.house_item_type as string,
                  x: f.house_position_x as number,
                  y: f.house_position_y as number,
                }));

              return placedFurniture.map((furniture) => {
                if (furniture.house_position_x === null || furniture.house_position_y === null || !furniture.house_item_type) return null;
                const placement = getFurniturePlacement(
                  furniture.house_item_type,
                  furniture.house_position_x,
                  furniture.house_position_y,
                  mapOriginX,
                  mapOriginY,
                  allPlacedItemsList
                );
                const spriteKey = getFurnitureSpriteKey(
                  furniture.house_item_type,
                  furniture.house_position_x,
                  furniture.house_position_y,
                  allPlacedItemsList
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
                      src={`/assets/iso/furniture_${spriteKey}.png?v=${ASSET_VERSION}`} 
                      alt={furniture.name}
                      className="w-full h-full object-contain drop-shadow-lg"
                      style={{ imageRendering: "pixelated" }}
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
            });
          })()}

            {/* Fachada frontal: fecha a casa por baixo do telhado */}
            {showRoof && roofPaid && (
              <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 195000 }}>
                {Array.from({ length: 7 }).map((_, y) => {
                  const iso = getIsoCoords(9, y, mapOriginX, mapOriginY);
                  return (
                    <div key={`facade-se-${y}`} style={{ position: "absolute", left: `${iso.x + TILE_W / 2}px`, top: `${iso.y + TILE_H - WALL_HEIGHT - 32}px`, width: "64px", height: "192px" }}>
                      <img src={`/assets/iso/wall_nw_plain.png?v=${ASSET_VERSION}`} className="w-full h-full object-contain" alt="" />
                    </div>
                  );
                })}
                {Array.from({ length: 10 }).map((_, x) => {
                  const iso = getIsoCoords(x, 6, mapOriginX, mapOriginY);
                  return (
                    <div key={`facade-sw-${x}`} style={{ position: "absolute", left: `${iso.x}px`, top: `${iso.y + TILE_H - WALL_HEIGHT - 32}px`, width: "64px", height: "192px" }}>
                      <img src={`/assets/iso/wall_ne_plain.png?v=${ASSET_VERSION}`} className="w-full h-full object-contain" alt="" />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Telhado: acima de móveis e fachada, beiral alinhado ao topo das paredes */}
            {showRoof && roofPaid && (() => {
              const roof = getRoofPlacement(mapOriginX, mapOriginY);
              return (
                <div className="absolute pointer-events-none" style={{ left: `${roof.left}px`, top: `${roof.top}px`, width: `${roof.width}px`, height: `${roof.height}px`, zIndex: 200000 }}>
                  <img src={`/assets/iso/roof.png?v=${ASSET_VERSION}`} alt="Telhado" className="w-full h-full drop-shadow-2xl" style={{ imageRendering: "pixelated" }} />
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
                          <img src={`/assets/iso/furniture_${furniture.house_item_type}.png?v=${ASSET_VERSION}`} alt="icon" className="w-full h-full object-contain drop-shadow" />
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
                {Object.keys(FURNITURE_SIZES)
                  .filter((type) => type !== "dining_chair_back")
                  .map(type => (
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
