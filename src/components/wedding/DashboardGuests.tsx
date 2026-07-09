import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWedding } from "@/contexts/WeddingContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { 
  Copy, 
  MessageCircle, 
  Trash2, 
  Check, 
  X, 
  RefreshCw, 
  Users, 
  UserPlus, 
  RotateCcw, 
  Search, 
  Lock, 
  MessageSquare,
  UtensilsCrossed,
  Sparkles,
  UserCheck
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DashboardGuestsProps {
  weddingId: string;
  weddingSlug: string | null;
}

interface RsvpResponse {
  id: string;
  guest_name: string;
  guest_email: string | null;
  phone: string | null;
  attendance: string;
  guests_count: number;
  dietary_restrictions: string | null;
  message: string | null;
  created_at: string;
  companion_names?: string[];
}

export default function DashboardGuests({ weddingId, weddingSlug }: DashboardGuestsProps) {
  const { config, updateConfig } = useWedding();
  const [guests, setGuests] = useState<any[]>([]);
  const [rsvps, setRsvps] = useState<RsvpResponse[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<"list" | "rsvps">("list");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Add guest form inputs
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (weddingId) {
      fetchGuests();
      fetchRsvps();
    }
  }, [weddingId]);

  const fetchGuests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("guests")
      .select("*")
      .eq("wedding_id", weddingId)
      .order("created_at", { ascending: false });
    
    if (data) setGuests(data);
    setLoading(false);
  };

  const fetchRsvps = async () => {
    const { data, error } = await supabase
      .from("rsvp_responses")
      .select("*")
      .eq("wedding_id", weddingId)
      .order("created_at", { ascending: false });
    
    if (data) setRsvps(data as unknown as RsvpResponse[]);
  };

  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !weddingId) return;

    const { error } = await supabase.from("guests").insert({
      wedding_id: weddingId,
      name,
      phone: phone || null,
      passcode: passcode || null,
      status: "pending"
    });

    if (error) {
      toast.error("Erro ao adicionar convidado.");
    } else {
      toast.success("Convidado adicionado!");
      setName("");
      setPhone("");
      setPasscode("");
      fetchGuests();
    }
  };

  const handleDeleteGuest = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este convidado?")) return;
    
    const { error } = await supabase.from("guests").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir convidado.");
    } else {
      toast.success("Convidado excluído!");
      fetchGuests();
    }
  };

  const handleUpdateStatus = async (id: string, status: "pending" | "confirmed" | "declined") => {
    const { error } = await supabase
      .from("guests")
      .update({ status })
      .eq("id", id);

    if (error) {
      toast.error("Erro ao atualizar confirmação.");
    } else {
      toast.success(`Confirmação atualizada para: ${
        status === "confirmed" ? "Confirmado" : status === "declined" ? "Não irá" : "Pendente"
      }`);
      fetchGuests();
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: "pending" | "confirmed" | "declined") => {
    const nextStatus = currentStatus === "confirmed" ? "pending" : "confirmed";
    await handleUpdateStatus(id, nextStatus);
  };

  const handleResetAllStatus = async () => {
    if (!confirm("Tem certeza que deseja desmarcar todas as confirmações? Isso definirá o status de todos os convidados como 'Pendente' e limpará as respostas de RSVP detalhadas para reiniciar seus testes.")) return;

    setLoading(true);
    // 1. Reset all guest statuses to 'pending'
    const { error: guestError } = await supabase
      .from("guests")
      .update({ status: "pending" })
      .eq("wedding_id", weddingId);

    // 2. Clear all RSVP responses for this wedding
    const { error: rsvpError } = await supabase
      .from("rsvp_responses")
      .delete()
      .eq("wedding_id", weddingId);

    setLoading(false);

    if (guestError || rsvpError) {
      toast.error("Erro ao reiniciar contagem.");
    } else {
      toast.success("Contagem reiniciada com sucesso!");
      fetchGuests();
      fetchRsvps();
    }
  };

  const getInviteLink = (token: string) => {
    return `${window.location.origin}/${weddingSlug}/convite/${token}`;
  };

  const copyLink = (token: string) => {
    const link = getInviteLink(token);
    const message = `Você foi convidado para o nosso casamento! Acesse seu convite exclusivo pelo link a seguir:\n\n${link}`;
    navigator.clipboard.writeText(message);
    toast.success("Mensagem com link copiada!");
  };

  const shareWhatsApp = (phone: string | null, token: string) => {
    const link = getInviteLink(token);
    const message = encodeURIComponent(`Você foi convidado para o nosso casamento! Acesse seu convite exclusivo: ${link}`);
    let url = `https://wa.me/?text=${message}`;
    if (phone) {
      let digits = phone.replace(/\D/g, "");
      // wa.me exige o número em formato internacional. Números brasileiros
      // locais (DDD + número, 10 ou 11 dígitos) recebem o DDI 55.
      if (digits.length === 10 || digits.length === 11) {
        digits = `55${digits}`;
      }
      url = `https://wa.me/${digits}?text=${message}`;
    }
    window.open(url, "_blank");
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // Metrics calculations
  const totalGuests = guests.length;
  const confirmedGuests = guests.filter(g => g.status === "confirmed").length;
  const declinedGuests = guests.filter(g => g.status === "declined").length;
  const pendingGuests = guests.filter(g => g.status === "pending").length;

  // Headcount sum: count actual RSVP guests_count if it exists, otherwise fall back to 1 for each manually confirmed guest card
  const confirmedHeadcount = guests
    .filter(g => g.status === "confirmed")
    .reduce((sum, g) => {
      const matchingRsvp = rsvps.find(r => 
        (r.attendance === "yes" || r.attendance === "confirmed") &&
        r.guest_name.toLowerCase() === g.name.toLowerCase()
      );
      return sum + (matchingRsvp ? matchingRsvp.guests_count : 1);
    }, 0);

  // Filtered guest list for search
  const filteredGuests = guests.filter(g => 
    g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (g.phone && g.phone.includes(searchQuery))
  );

  return (
    <div className="space-y-8">
      {/* 1. Summary Cards Panel */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-card rounded-xl p-5 border border-border shadow-soft">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">Convites Criados</span>
          </div>
          <p className="text-3xl font-serif font-bold text-foreground">{totalGuests}</p>
        </div>

        <div className="bg-card rounded-xl p-5 border border-border shadow-soft border-l-4 border-l-green-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <UserCheck className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">Confirmados (Grupos)</span>
          </div>
          <p className="text-3xl font-serif font-bold text-green-700">{confirmedGuests}</p>
          <p className="text-xs text-muted-foreground font-sans mt-1">Convites aceitos</p>
        </div>

        <div className="bg-card rounded-xl p-5 border border-border shadow-soft border-l-4 border-l-gold">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gold/10 rounded-lg">
              <Sparkles className="w-5 h-5 text-gold" />
            </div>
            <span className="text-sm text-muted-foreground font-medium font-serif">Pessoas Totais</span>
          </div>
          <p className="text-3xl font-serif font-bold text-gold-light">{confirmedHeadcount}</p>
          <p className="text-xs text-muted-foreground font-sans mt-1">Contando acompanhantes</p>
        </div>

        <div className="bg-card rounded-xl p-5 border border-border shadow-soft border-l-4 border-l-yellow-500">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-yellow-500/10 rounded-lg">
              <RefreshCw className="w-5 h-5 text-yellow-600 animate-spin-slow" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">Pendentes</span>
          </div>
          <p className="text-3xl font-serif font-bold text-yellow-600">{pendingGuests}</p>
          <p className="text-xs text-muted-foreground font-sans mt-1">Aguardando resposta</p>
        </div>

        <div className="bg-card rounded-xl p-5 border border-border shadow-soft border-l-4 border-l-destructive">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-destructive/10 rounded-lg">
              <X className="w-5 h-5 text-destructive" />
            </div>
            <span className="text-sm text-muted-foreground font-medium">Não Irão</span>
          </div>
          <p className="text-3xl font-serif font-bold text-destructive">{declinedGuests}</p>
          <p className="text-xs text-muted-foreground font-sans mt-1">Recusaram o convite</p>
        </div>
      </div>

      {/* 2. Quick Actions: reset and passcode */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border p-6 shadow-soft space-y-4">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-gold" />
            <h3 className="text-lg font-serif text-foreground">Senha Global do Convite</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Se você definir uma senha de segurança aqui, qualquer convidado que acesse o link geral precisará digitá-la antes de ver as seções e detalhes.
          </p>
          <div className="max-w-xs pt-2">
            <Input 
              type="text" 
              placeholder="Ex: noivos2026" 
              value={config?.globalPasscode || ""} 
              onChange={(e) => updateConfig({ globalPasscode: e.target.value })} 
              className="bg-background font-mono"
            />
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-soft space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <RotateCcw className="w-5 h-5 text-destructive" />
              <h3 className="text-lg font-serif text-foreground">Área de Testes e Simulações</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Deseja simular o RSVP novamente? Você pode desmarcar todos os status de confirmações e limpar as respostas do formulário com um único clique.
            </p>
          </div>
          <div className="pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleResetAllStatus}
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive flex items-center gap-2"
              disabled={loading}
            >
              <RotateCcw className="w-4 h-4" />
              Resetar Todas as Confirmações
            </Button>
          </div>
        </div>
      </div>

      {/* 3. Add Guest Form */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-soft space-y-4">
        <div className="flex items-center gap-3">
          <UserPlus className="w-5 h-5 text-gold" />
          <h3 className="text-lg font-serif text-foreground">Adicionar Novo Convidado</h3>
        </div>
        <form onSubmit={handleAddGuest} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end bg-muted/40 p-4 rounded-xl border border-border/50">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome do Convidado / Família</label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              required 
              placeholder="Ex: Sr. e Sra. Silva"
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">WhatsApp (Opcional)</label>
            <Input 
              value={phone} 
              onChange={(e) => setPhone(e.target.value)} 
              placeholder="Ex: 11999999999"
              className="bg-background font-mono"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Senha do Convite (Opcional)</label>
            <Input 
              value={passcode} 
              onChange={(e) => setPasscode(e.target.value)} 
              placeholder="Deixe em branco para sem senha"
              className="bg-background"
            />
          </div>
          <Button type="submit" className="w-full bg-gold hover:bg-gold-light text-background font-semibold flex items-center justify-center gap-2">
            <UserPlus className="w-4 h-4" />
            Adicionar Convidado
          </Button>
        </form>
      </div>

      {/* 4. Tabs & Lists Area */}
      <div className="bg-card rounded-xl border border-border shadow-soft overflow-hidden">
        {/* Sub-tab Navigation */}
        <div className="flex gap-2 border-b border-border bg-muted/20 px-6 pt-3">
          <button
            onClick={() => setActiveSubTab("list")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeSubTab === "list"
                ? "border-gold text-gold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="w-4 h-4" />
            Lista de Convites ({filteredGuests.length})
          </button>
          <button
            onClick={() => setActiveSubTab("rsvps")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeSubTab === "rsvps"
                ? "border-gold text-gold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Respostas RSVP Detalhadas ({rsvps.length})
          </button>
        </div>

        {/* Tab 1: Guest List */}
        {activeSubTab === "list" && (
          <div className="p-6 space-y-4">
            {/* Search filter */}
            <div className="flex items-center gap-3 w-full max-w-sm border border-border rounded-lg px-3 py-2 bg-background focus-within:ring-2 focus-within:ring-gold/30">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input 
                type="text"
                placeholder="Buscar convidado pelo nome..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground focus:ring-0 p-0"
              />
            </div>

            <div className="border rounded-xl overflow-x-auto bg-background">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="font-semibold text-muted-foreground w-12 text-center">Presença</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Nome Convidado</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Senha Individual</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Status do Convite</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Confirmação Manual</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Ações de Convite</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGuests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                        Nenhum convidado correspondente à busca.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredGuests.map((g) => {
                      const matchingRsvp = rsvps.find(r => 
                        r.guest_name.toLowerCase() === g.name.toLowerCase()
                      );

                      return (
                        <TableRow key={g.id} className="hover:bg-muted/10 transition-colors">
                          <TableCell className="py-4 text-center">
                            <div className="flex justify-center">
                              {g.status === "confirmed" ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleStatus(g.id, g.status)}
                                  className="w-5 h-5 rounded border border-green-500 bg-green-500 text-background flex items-center justify-center hover:opacity-80 transition-opacity"
                                  title="Confirmado (Clique para desmarcar)"
                                >
                                  <Check className="h-3.5 w-3.5 stroke-[3.5] text-white" />
                                </button>
                              ) : g.status === "declined" ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleStatus(g.id, g.status)}
                                  className="w-5 h-5 rounded border border-destructive bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20 transition-colors"
                                  title="Não Irá (Clique para confirmar)"
                                >
                                  <X className="h-3.5 w-3.5 stroke-[3.5]" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleToggleStatus(g.id, g.status)}
                                  className="w-5 h-5 rounded border border-input bg-background hover:border-gold/50 flex items-center justify-center transition-colors"
                                  title="Pendente (Clique para confirmar)"
                                />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="space-y-1">
                              <span className="font-semibold text-foreground block">{g.name}</span>
                              {g.phone && (
                                <span className="block text-xs text-muted-foreground font-mono">{g.phone}</span>
                              )}
                              
                              {/* RSVP details integrated inline */}
                              {matchingRsvp ? (
                                <div className="space-y-1 pt-0.5">
                                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                    <span className="font-medium text-gold">
                                      Confirmou {matchingRsvp.guests_count} {matchingRsvp.guests_count === 1 ? "pessoa" : "pessoas"}
                                    </span>
                                    {matchingRsvp.dietary_restrictions && (
                                      <Badge variant="outline" className="text-[10px] py-0 border-yellow-200 bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400 font-sans flex items-center gap-0.5 shrink-0">
                                        <UtensilsCrossed className="w-2.5 h-2.5 shrink-0" />
                                        Restrição Alimentar
                                      </Badge>
                                    )}
                                  </div>
                                  
                                  {matchingRsvp.companion_names && matchingRsvp.companion_names.length > 0 && (
                                    <p className="text-[11px] text-muted-foreground/80 leading-tight">
                                      Acompanhantes: {matchingRsvp.companion_names.join(", ")}
                                    </p>
                                  )}
                                  
                                  {matchingRsvp.message && (
                                    <p className="text-xs text-muted-foreground/90 font-serif italic max-w-md pt-0.5">
                                      "{matchingRsvp.message}"
                                    </p>
                                  )}
                                </div>
                              ) : (
                                g.status === "confirmed" && (
                                  <p className="text-xs text-muted-foreground font-medium pt-0.5">
                                    Confirmado manualmente (1 pessoa)
                                  </p>
                                )
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            {g.passcode ? (
                              <span className="bg-muted px-2 py-0.5 rounded text-xs font-mono border border-border">{g.passcode}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs italic">Livre</span>
                            )}
                          </TableCell>
                          <TableCell className="py-4">
                            <Badge
                              className={
                                g.status === "confirmed"
                                  ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400"
                                  : g.status === "declined"
                                  ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400"
                                  : "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400"
                              }
                            >
                              {g.status === "confirmed" ? "Confirmado" : g.status === "declined" ? "Não irá" : "Pendente"}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="flex gap-1.5">
                              <Button 
                                variant="outline" 
                                size="icon" 
                                className="h-7 w-7 border-green-200 hover:bg-green-50 text-green-600"
                                onClick={() => handleUpdateStatus(g.id, "confirmed")}
                                title="Marcar como Confirmado"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="icon" 
                                className="h-7 w-7 border-red-200 hover:bg-red-50 text-destructive"
                                onClick={() => handleUpdateStatus(g.id, "declined")}
                                title="Marcar como Não Irá"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="icon" 
                                className="h-7 w-7 border-yellow-200 hover:bg-yellow-50 text-yellow-600"
                                onClick={() => handleUpdateStatus(g.id, "pending")}
                                title="Marcar como Pendente"
                              >
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="flex gap-2">
                              <Button variant="outline" size="icon" className="h-8 w-8 hover:border-gold/50" onClick={() => copyLink(g.token)} title="Copiar link do convite">
                                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                              <Button variant="outline" size="icon" className="h-8 w-8 hover:border-green-400" onClick={() => shareWhatsApp(g.phone, g.token)} title="Enviar convite por WhatsApp">
                                <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                              <Button variant="destructive" size="icon" className="h-8 w-8 hover:bg-red-700" onClick={() => handleDeleteGuest(g.id)} title="Excluir Convidado">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Tab 2: Detailed RSVP Responses */}
        {activeSubTab === "rsvps" && (
          <div className="p-6">
            <div className="border rounded-xl overflow-x-auto bg-background">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="font-semibold text-muted-foreground">Convidado & Acompanhantes</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Presença</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Restrições</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Mensagem Enviada</TableHead>
                    <TableHead className="font-semibold text-muted-foreground">Data Resposta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rsvps.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                        Nenhuma resposta detalhada de RSVP enviada até o momento.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rsvps.map((rsvp) => (
                      <TableRow key={rsvp.id} className="hover:bg-muted/10 transition-colors">
                        <TableCell className="py-4">
                          <p className="font-bold text-foreground leading-normal">{rsvp.guest_name}</p>
                          <Badge variant="outline" className="mt-1 text-[10px] bg-muted">
                            Total: {rsvp.guests_count} {rsvp.guests_count === 1 ? "pessoa" : "pessoas"}
                          </Badge>
                          {rsvp.companion_names && rsvp.companion_names.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {rsvp.companion_names.map((name, i) => (
                                <p key={i} className="text-xs text-muted-foreground font-sans">+ {name}</p>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          <Badge
                            className={
                              rsvp.attendance === "yes" || rsvp.attendance === "confirmed"
                                ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400"
                            }
                          >
                            {rsvp.attendance === "yes" || rsvp.attendance === "confirmed" ? "Confirmado" : "Não irá"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4 text-xs">
                          {rsvp.dietary_restrictions ? (
                            <div className="flex items-center gap-1 text-yellow-700 bg-yellow-50 px-2 py-1 rounded border border-yellow-100 max-w-[150px]">
                              <UtensilsCrossed className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate" title={rsvp.dietary_restrictions}>{rsvp.dietary_restrictions}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">Nenhuma</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4 max-w-[200px]">
                          {rsvp.message ? (
                            <p className="text-xs text-foreground font-serif italic truncate" title={rsvp.message}>
                              "{rsvp.message}"
                            </p>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">Sem recado</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4 text-xs text-muted-foreground">
                          {formatDate(rsvp.created_at)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
