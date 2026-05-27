import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Hammer, Armchair, Loader2, DollarSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

interface HouseCatalogSettingsProps {
  weddingId: string;
}

interface DBGift {
  id: string;
  name: string;
  price: number;
  stock: number | null;
  house_item_type: string | null;
}

const CATALOG_ITEMS = [
  // Estrutura
  { id: "foundation", name: "Fundação da Casa", category: "Construção", defaultPrice: 1500, room: null, isStructural: true },
  { id: "walls", name: "Paredes da Casa", category: "Construção", defaultPrice: 3000, room: null, isStructural: true },
  { id: "doors_windows", name: "Portas e Janelas", category: "Construção", defaultPrice: 1200, room: null, isStructural: true },
  { id: "roof", name: "Telhado da Casa", category: "Construção", defaultPrice: 4000, room: null, isStructural: true },
  { id: "electric", name: "Instalação Elétrica", category: "Construção", defaultPrice: 1000, room: null, isStructural: true },
  { id: "plumbing", name: "Instalação Hidráulica", category: "Construção", defaultPrice: 1000, room: null, isStructural: true },

  // Móveis Essenciais
  { id: "fridge", name: "Geladeira Duplex Inox", category: "Cozinha", defaultPrice: 3500, room: "kitchen", isStructural: false },
  { id: "stove", name: "Fogão 5 Bocas Inox", category: "Cozinha", defaultPrice: 1500, room: "kitchen", isStructural: false },
  { id: "dining_table", name: "Mesa de Jantar 6 Cadeiras", category: "Cozinha", defaultPrice: 2000, room: "kitchen", isStructural: false },
  { id: "sofa", name: "Sofá Retrátil 3 Lugares", category: "Sala", defaultPrice: 2500, room: "living_room", isStructural: false },
  { id: "tv", name: "Smart TV 55\" 4K", category: "Sala", defaultPrice: 2200, room: "living_room", isStructural: false },
  { id: "bed", name: "Cama Casal Queen Box", category: "Quarto", defaultPrice: 1800, room: "bedroom", isStructural: false },
];

export default function HouseCatalogSettings({ weddingId }: HouseCatalogSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingGifts, setExistingGifts] = useState<DBGift[]>([]);
  const [enabledItems, setEnabledItems] = useState<Record<string, boolean>>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadCatalog() {
      if (!weddingId) return;
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("gifts")
          .select("id, name, price, stock, house_item_type")
          .eq("wedding_id", weddingId)
          .not("house_item_type", "is", null);

        if (error) throw error;

        const gifts = data as DBGift[];
        setExistingGifts(gifts);

        const newEnabled: Record<string, boolean> = {};
        const newPrices: Record<string, number> = {};
        const newCompleted: Record<string, boolean> = {};

        CATALOG_ITEMS.forEach((item) => {
          const match = gifts.find((g) => g.house_item_type === item.id);
          newEnabled[item.id] = !!match;
          newPrices[item.id] = match ? match.price : item.defaultPrice;
          newCompleted[item.id] = match ? match.stock === 0 : false;
        });

        setEnabledItems(newEnabled);
        setPrices(newPrices);
        setCompletedItems(newCompleted);
      } catch (err) {
        console.error("Error loading house catalog:", err);
        toast.error("Erro ao carregar catálogo da casa");
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, [weddingId]);

  const handleToggle = (id: string) => {
    setEnabledItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePriceChange = (id: string, val: string) => {
    const num = parseFloat(val) || 0;
    setPrices((prev) => ({ ...prev, [id]: num }));
  };

  const handleCompletedToggle = (id: string) => {
    setCompletedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Processes in batch
      for (const item of CATALOG_ITEMS) {
        const isEnabled = enabledItems[item.id];
        const match = existingGifts.find((g) => g.house_item_type === item.id);
        const isCompleted = completedItems[item.id] || false;
        const stock = isCompleted ? 0 : 1;
        const price = isCompleted ? 0 : (prices[item.id] || item.defaultPrice);

        if (isEnabled) {
          if (match) {
            // Update
            const { error } = await supabase
              .from("gifts")
              .update({ price, stock })
              .eq("id", match.id);
            if (error) throw error;
          } else {
            // Insert
            const { error } = await supabase
              .from("gifts")
              .insert({
                wedding_id: weddingId,
                name: item.name,
                category: item.category,
                price,
                house_item_type: item.id,
                house_room: item.room,
                stock,
                image_url: `https://images.unsplash.com/photo-1513694203232-719a280e022f?w=400`, // Default beautiful house texture placeholder
              });
            if (error) throw error;
          }
        } else if (match) {
          // Delete
          const { error } = await supabase
            .from("gifts")
            .delete()
            .eq("id", match.id);
          if (error) throw error;
        }
      }

      // Reload
      const { data } = await supabase
        .from("gifts")
        .select("id, name, price, stock, house_item_type")
        .eq("wedding_id", weddingId)
        .not("house_item_type", "is", null);

      if (data) {
        setExistingGifts(data as DBGift[]);
      }

      toast.success("Catálogo da Casa atualizado com sucesso!");
    } catch (err) {
      console.error("Error saving house catalog:", err);
      toast.error("Erro ao salvar catálogo da casa");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 animate-spin text-gold" />
        <p className="text-sm text-muted-foreground mt-4 font-serif">Carregando catálogo da casa...</p>
      </div>
    );
  }

  const structuralItems = CATALOG_ITEMS.filter((i) => i.isStructural);
  const furnitureItems = CATALOG_ITEMS.filter((i) => !i.isStructural);

  return (
    <div className="space-y-10 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-border">
        <div>
          <h2 className="font-serif text-2xl text-foreground">Catálogo de Construção & Decoração</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Escolha quais etapas estruturais e móveis principais você quer adicionar à sua lista de presentes.
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="btn-wedding bg-primary text-primary-foreground min-w-[150px] shadow-soft"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Salvando...
            </>
          ) : (
            "Salvar Catálogo"
          )}
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Bloco 1: Estrutura */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center">
              <Hammer className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h3 className="font-serif text-lg text-foreground">Estrutura & Engenharia</h3>
              <p className="text-xs text-muted-foreground">Etapas fundamentais da construção física da casa</p>
            </div>
          </div>

          <div className="grid gap-4">
            {structuralItems.map((item) => (
              <div
                key={item.id}
                className="bg-card rounded-xl p-4 border border-border shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <h4 className="font-medium text-sm text-foreground">{item.name}</h4>
                  <p className="text-xs text-muted-foreground">{item.category}</p>
                </div>
                <div className="flex items-center gap-4 justify-between sm:justify-end w-full sm:w-auto">
                  <AnimatePresence mode="wait">
                    {enabledItems[item.id] && (
                      <motion.div
                        key={completedItems[item.id] ? "completed" : "active"}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-3"
                      >
                        {completedItems[item.id] ? (
                          <span className="text-[11px] font-bold px-2.5 py-1 bg-gold/15 text-gold rounded-full border border-gold/30 select-none">
                            Pronto
                          </span>
                        ) : (
                          <div className="relative w-28">
                            <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                              type="number"
                              value={prices[item.id] || ""}
                              onChange={(e) => handlePriceChange(item.id, e.target.value)}
                              className="h-8 pl-7 text-xs rounded-md bg-background border-border text-foreground"
                              placeholder="Preço"
                              min="1"
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">Já Concluído?</span>
                          <Switch
                            checked={completedItems[item.id] || false}
                            onCheckedChange={() => handleCompletedToggle(item.id)}
                            className="scale-75"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <Switch
                    checked={enabledItems[item.id] || false}
                    onCheckedChange={() => handleToggle(item.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bloco 2: Móveis */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center">
              <Armchair className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h3 className="font-serif text-lg text-foreground">Móveis Essenciais</h3>
              <p className="text-xs text-muted-foreground">Mobiliários de alto impacto visual nos cômodos</p>
            </div>
          </div>

          <div className="grid gap-4">
            {furnitureItems.map((item) => (
              <div
                key={item.id}
                className="bg-card rounded-xl p-4 border border-border shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <h4 className="font-medium text-sm text-foreground">{item.name}</h4>
                  <p className="text-xs text-muted-foreground">
                    {item.category} • {item.room === "kitchen" ? "Cozinha" : item.room === "living_room" ? "Sala" : "Quarto"}
                  </p>
                </div>
                <div className="flex items-center gap-4 justify-between sm:justify-end w-full sm:w-auto">
                  <AnimatePresence mode="wait">
                    {enabledItems[item.id] && (
                      <motion.div
                        key={completedItems[item.id] ? "completed" : "active"}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-3"
                      >
                        {completedItems[item.id] ? (
                          <span className="text-[11px] font-bold px-2.5 py-1 bg-gold/15 text-gold rounded-full border border-gold/30 select-none">
                            Pronto
                          </span>
                        ) : (
                          <div className="relative w-28">
                            <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                              type="number"
                              value={prices[item.id] || ""}
                              onChange={(e) => handlePriceChange(item.id, e.target.value)}
                              className="h-8 pl-7 text-xs rounded-md bg-background border-border text-foreground"
                              placeholder="Preço"
                              min="1"
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">Já Concluído?</span>
                          <Switch
                            checked={completedItems[item.id] || false}
                            onCheckedChange={() => handleCompletedToggle(item.id)}
                            className="scale-75"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <Switch
                    checked={enabledItems[item.id] || false}
                    onCheckedChange={() => handleToggle(item.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
