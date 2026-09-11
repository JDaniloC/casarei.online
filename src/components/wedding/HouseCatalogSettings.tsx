import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Hammer, Armchair, Loader2, DollarSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DEFAULT_FURNITURE_POSITIONS } from "@/utils/isometric";

interface HouseCatalogSettingsProps {
  weddingId: string;
}

interface DBGift {
  id: string;
  name: string;
  price: number;
  stock: number | null;
  house_item_type: string | null;
  is_vaquinha: boolean | null;
  total_quotas: number | null;
}

type FundingMode = "binary" | "vaquinha" | "quotas";

const DEFAULT_QUOTAS = 10;

const CATALOG_ITEMS = [
  // Estruturais (8 itens)
  { id: "foundation", name: "Fundação da Casa", category: "Construção", defaultPrice: 1500, room: null, isStructural: true },
  { id: "floor_coverings", name: "Pisos e Revestimentos", category: "Construção", defaultPrice: 2000, room: null, isStructural: true },
  { id: "walls", name: "Paredes da Casa", category: "Construção", defaultPrice: 3000, room: null, isStructural: true },
  { id: "painting", name: "Pintura Externa e Interna", category: "Construção", defaultPrice: 1500, room: null, isStructural: true },
  { id: "doors_windows", name: "Portas e Janelas", category: "Construção", defaultPrice: 1200, room: null, isStructural: true },
  { id: "roof", name: "Telhado da Casa", category: "Construção", defaultPrice: 4000, room: null, isStructural: true },
  { id: "electric", name: "Instalação Elétrica", category: "Construção", defaultPrice: 1000, room: null, isStructural: true },
  { id: "plumbing", name: "Instalação Hidráulica", category: "Construção", defaultPrice: 1000, room: null, isStructural: true },

  // Cozinha (9 itens)
  { id: "fridge", name: "Geladeira", category: "Cozinha", defaultPrice: 3500, room: "kitchen", isStructural: false },
  { id: "stove", name: "Fogão", category: "Cozinha", defaultPrice: 1500, room: "kitchen", isStructural: false },
  { id: "microwave", name: "Microondas", category: "Cozinha", defaultPrice: 600, room: "kitchen", isStructural: false },
  { id: "sink_counter", name: "Pia e Balcão", category: "Cozinha", defaultPrice: 1200, room: "kitchen", isStructural: false },
  { id: "dining_table", name: "Mesa de Jantar com Cadeiras", category: "Cozinha", defaultPrice: 2000, room: "kitchen", isStructural: false },
  { id: "dining_table_simple", name: "Mesa de Jantar (Sem Cadeiras)", category: "Cozinha", defaultPrice: 1400, room: "kitchen", isStructural: false },
  { id: "kitchen_cabinet", name: "Armários de Cozinha", category: "Cozinha", defaultPrice: 2500, room: "kitchen", isStructural: false },
  { id: "dishwasher", name: "Lava-louças", category: "Cozinha", defaultPrice: 2000, room: "kitchen", isStructural: false },
  { id: "coffee_maker", name: "Cafeteira Expresso", category: "Cozinha", defaultPrice: 450, room: "kitchen", isStructural: false },
  { id: "air_fryer", name: "Air Fryer Digital", category: "Cozinha", defaultPrice: 400, room: "kitchen", isStructural: false },

  // Sala de Estar (5 itens)
  { id: "sofa", name: "Sofá", category: "Sala", defaultPrice: 2500, room: "living_room", isStructural: false },
  { id: "tv_rack", name: "TV e Rack", category: "Sala", defaultPrice: 3000, room: "living_room", isStructural: false },
  { id: "coffee_table", name: "Mesa de Centro", category: "Sala", defaultPrice: 400, room: "living_room", isStructural: false },
  { id: "armchair", name: "Poltrona", category: "Sala", defaultPrice: 800, room: "living_room", isStructural: false },
  { id: "robot_vacuum", name: "Robô Aspirador", category: "Sala", defaultPrice: 1200, room: "living_room", isStructural: false },

  // Quarto (4 itens)
  { id: "bed", name: "Cama de Casal", category: "Quarto", defaultPrice: 1800, room: "bedroom", isStructural: false },
  { id: "wardrobe", name: "Guarda-roupa", category: "Quarto", defaultPrice: 2500, room: "bedroom", isStructural: false },
  { id: "dresser", name: "Cômoda", category: "Quarto", defaultPrice: 800, room: "bedroom", isStructural: false },
  { id: "vanity", name: "Penteadeira", category: "Quarto", defaultPrice: 700, room: "bedroom", isStructural: false },

  // Banheiro (3 itens)
  { id: "toilet", name: "Vaso Sanitário", category: "Banheiro", defaultPrice: 500, room: "bathroom", isStructural: false },
  { id: "bathroom_sink", name: "Pia do Banheiro", category: "Banheiro", defaultPrice: 600, room: "bathroom", isStructural: false },
  { id: "shower", name: "Box e Chuveiro", category: "Banheiro", defaultPrice: 1200, room: "bathroom", isStructural: false },

  // Área de Serviço (3 itens)
  { id: "washing_machine", name: "Máquina de Lavar", category: "Área de Serviço", defaultPrice: 2500, room: "laundry", isStructural: false },
  { id: "dryer", name: "Secadora", category: "Área de Serviço", defaultPrice: 2000, room: "laundry", isStructural: false },
  { id: "laundry_sink", name: "Tanque", category: "Área de Serviço", defaultPrice: 400, room: "laundry", isStructural: false },
];

/** Traduz o modo de financiamento escolhido pelo casal nos campos reais da tabela `gifts`. */
function fieldsForFundingMode(mode: FundingMode, price: number, quotas: number, isCompleted: boolean) {
  if (mode === "quotas") {
    const totalQuotas = quotas > 0 ? quotas : DEFAULT_QUOTAS;
    return {
      price,
      stock: isCompleted ? 0 : totalQuotas,
      total_quotas: totalQuotas,
      is_vaquinha: false,
      is_open_price: false,
    };
  }
  if (mode === "vaquinha") {
    return {
      price,
      stock: isCompleted ? 0 : null,
      total_quotas: null,
      is_vaquinha: true,
      is_open_price: true,
    };
  }
  return {
    price: isCompleted ? 0 : price,
    stock: isCompleted ? 0 : 1,
    total_quotas: null,
    is_vaquinha: false,
    is_open_price: false,
  };
}

export default function HouseCatalogSettings({ weddingId }: HouseCatalogSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingGifts, setExistingGifts] = useState<DBGift[]>([]);
  const [enabledItems, setEnabledItems] = useState<Record<string, boolean>>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>({});
  const [fundingModes, setFundingModes] = useState<Record<string, FundingMode>>({});
  const [quotasCounts, setQuotasCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    async function loadCatalog() {
      if (!weddingId) return;
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("gifts")
          .select("id, name, price, stock, house_item_type, is_vaquinha, total_quotas")
          .eq("wedding_id", weddingId)
          .not("house_item_type", "is", null);

        if (error) throw error;

        const gifts = data as DBGift[];
        setExistingGifts(gifts);

        const newEnabled: Record<string, boolean> = {};
        const newPrices: Record<string, number> = {};
        const newCompleted: Record<string, boolean> = {};
        const newFundingModes: Record<string, FundingMode> = {};
        const newQuotasCounts: Record<string, number> = {};

        CATALOG_ITEMS.forEach((item) => {
          const match = gifts.find((g) => g.house_item_type === item.id);
          newEnabled[item.id] = !!match;
          newPrices[item.id] = match ? match.price : item.defaultPrice;
          newCompleted[item.id] = match ? match.stock === 0 : false;
          newQuotasCounts[item.id] = match?.total_quotas || DEFAULT_QUOTAS;
          newFundingModes[item.id] = match?.total_quotas ? "quotas" : match?.is_vaquinha ? "vaquinha" : "binary";
        });

        setEnabledItems(newEnabled);
        setPrices(newPrices);
        setCompletedItems(newCompleted);
        setFundingModes(newFundingModes);
        setQuotasCounts(newQuotasCounts);
      } catch (err) {
        console.error("Error loading house catalog:", err);
        toast.error("Erro ao carregar catálogo da casa");
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, [weddingId]);

  const getPrice = (id: string) => prices[id] || CATALOG_ITEMS.find((i) => i.id === id)?.defaultPrice || 0;
  const getQuotas = (id: string) => quotasCounts[id] || DEFAULT_QUOTAS;
  const getMode = (id: string): FundingMode => fundingModes[id] || "binary";

  const autoSaveItem = async (
    id: string,
    isEnabled: boolean,
    price: number,
    isCompleted: boolean,
    mode: FundingMode,
    quotas: number
  ) => {
    try {
      const item = CATALOG_ITEMS.find((i) => i.id === id);
      if (!item) return;

      const fields = fieldsForFundingMode(mode, price, quotas, isCompleted);

      // Get fresh data to avoid race conditions
      const { data: matchData } = await supabase
        .from('gifts')
        .select('id')
        .eq('wedding_id', weddingId)
        .eq('house_item_type', item.id)
        .maybeSingle();

      if (isEnabled) {
        if (matchData) {
          await supabase.from('gifts').update(fields).eq('id', matchData.id);
        } else {
          const defaultPos = DEFAULT_FURNITURE_POSITIONS[item.id];
          await supabase.from('gifts').insert({
            wedding_id: weddingId,
            name: item.name,
            category: item.category,
            house_item_type: item.id,
            house_room: item.room,
            house_position_x: defaultPos ? defaultPos.x : null,
            house_position_y: defaultPos ? defaultPos.y : null,
            image_url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=400',
            ...fields,
          });
        }
      } else if (matchData) {
        await supabase.from('gifts').delete().eq('id', matchData.id);
      }
    } catch (err) {
      console.error('Error auto-saving item:', err);
    }
  };

  const handleToggle = (id: string) => {
    setEnabledItems((prev) => {
      const newState = { ...prev, [id]: !prev[id] };
      autoSaveItem(id, newState[id], getPrice(id), completedItems[id] || false, getMode(id), getQuotas(id));
      return newState;
    });
  };

  const handlePriceChange = (id: string, val: string) => {
    const num = parseFloat(val) || 0;
    setPrices((prev) => ({ ...prev, [id]: num }));
  };

  const handleCompletedToggle = (id: string) => {
    setCompletedItems((prev) => {
      const newState = { ...prev, [id]: !prev[id] };
      autoSaveItem(id, enabledItems[id] || false, getPrice(id), newState[id], getMode(id), getQuotas(id));
      return newState;
    });
  };

  const handleFundingModeChange = (id: string, mode: FundingMode) => {
    setFundingModes((prev) => {
      const next = { ...prev, [id]: mode };
      autoSaveItem(id, enabledItems[id] || false, getPrice(id), completedItems[id] || false, mode, getQuotas(id));
      return next;
    });
  };

  const handleQuotasChange = (id: string, val: string) => {
    const num = parseInt(val) || 0;
    setQuotasCounts((prev) => ({ ...prev, [id]: num }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Processes in batch
      for (const item of CATALOG_ITEMS) {
        const isEnabled = enabledItems[item.id];
        const match = existingGifts.find((g) => g.house_item_type === item.id);
        const fields = fieldsForFundingMode(
          getMode(item.id),
          getPrice(item.id),
          getQuotas(item.id),
          completedItems[item.id] || false
        );

        if (isEnabled) {
          if (match) {
            // Update
            const { error } = await supabase
              .from("gifts")
              .update(fields)
              .eq("id", match.id);
            if (error) throw error;
          } else {
            // Check if another gift with same name already exists to avoid conflict
            const { data: existingNameMatch } = await supabase
              .from("gifts")
              .select("id")
              .eq("wedding_id", weddingId)
              .eq("name", item.name)
              .maybeSingle();

            const defaultPos = DEFAULT_FURNITURE_POSITIONS[item.id];

            if (existingNameMatch) {
              // Update existing
               const { error } = await supabase
                .from("gifts")
                .update({
                  ...fields,
                  house_item_type: item.id,
                  house_room: item.room,
                  house_position_x: defaultPos ? defaultPos.x : null,
                  house_position_y: defaultPos ? defaultPos.y : null,
                })
                .eq("id", existingNameMatch.id);
              if (error) throw error;
            } else {
              // Insert
              const { error } = await supabase
                .from("gifts")
                .insert({
                  wedding_id: weddingId,
                  name: item.name,
                  category: item.category,
                  house_item_type: item.id,
                  house_room: item.room,
                  house_position_x: defaultPos ? defaultPos.x : null,
                  house_position_y: defaultPos ? defaultPos.y : null,
                  image_url: `https://images.unsplash.com/photo-1513694203232-719a280e022f?w=400`,
                  ...fields,
                });
              if (error) throw error;
            }
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
        .select("id, name, price, stock, house_item_type, is_vaquinha, total_quotas")
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

  const renderItemRow = (item: (typeof CATALOG_ITEMS)[number]) => {
    const mode = getMode(item.id);
    const isEnabled = enabledItems[item.id] || false;
    const isCompleted = completedItems[item.id] || false;

    return (
      <div
        key={item.id}
        className="bg-card rounded-xl p-4 border border-border shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="space-y-1">
          <h4 className="font-medium text-sm text-foreground">{item.name}</h4>
          <p className="text-xs text-muted-foreground">
            {item.isStructural ? item.category : (
              item.room === "kitchen" ? "Cozinha" :
              item.room === "living_room" ? "Sala" :
              item.room === "bedroom" ? "Quarto" :
              item.room === "bathroom" ? "Banheiro" : "Área de Serviço"
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-between sm:justify-end w-full sm:w-auto">
          <AnimatePresence mode="wait">
            {isEnabled && (
              <motion.div
                key={isCompleted ? "completed" : `active-${mode}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="flex flex-wrap items-center gap-3"
              >
                {!isCompleted && (
                  <Select value={mode} onValueChange={(v) => handleFundingModeChange(item.id, v as FundingMode)}>
                    <SelectTrigger className="h-8 w-[110px] text-xs rounded-md bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="binary">Direto</SelectItem>
                      <SelectItem value="vaquinha">Vaquinha</SelectItem>
                      <SelectItem value="quotas">Cotas</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {isCompleted ? (
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
                      onBlur={() => autoSaveItem(item.id, isEnabled, getPrice(item.id), isCompleted, mode, getQuotas(item.id))}
                      className="h-8 pl-7 text-xs rounded-md bg-background border-border text-foreground"
                      placeholder={mode === "vaquinha" ? "Meta R$" : "Preço"}
                      min="1"
                    />
                  </div>
                )}

                {!isCompleted && mode === "quotas" && (
                  <div className="w-24">
                    <Input
                      type="number"
                      value={quotasCounts[item.id] || ""}
                      onChange={(e) => handleQuotasChange(item.id, e.target.value)}
                      onBlur={() => autoSaveItem(item.id, isEnabled, getPrice(item.id), isCompleted, mode, getQuotas(item.id))}
                      className="h-8 text-xs rounded-md bg-background border-border text-foreground"
                      placeholder="Nº cotas"
                      min="2"
                    />
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">Já Concluído?</span>
                  <Switch
                    checked={isCompleted}
                    onCheckedChange={() => handleCompletedToggle(item.id)}
                    className="scale-75"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <Switch
            checked={isEnabled}
            onCheckedChange={() => handleToggle(item.id)}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-10 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-border">
        <div>
          <h2 className="font-serif text-2xl text-foreground">Catálogo de Construção & Decoração</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Escolha quais etapas estruturais e móveis principais você quer adicionar à sua lista de presentes, e como cada um pode ser financiado pelos convidados.
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
            {structuralItems.map(renderItemRow)}
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
            {furnitureItems.map(renderItemRow)}
          </div>
        </div>
      </div>
    </div>
  );
}
