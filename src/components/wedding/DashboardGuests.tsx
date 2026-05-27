import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWedding } from "@/contexts/WeddingContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Copy, MessageCircle, Trash2 } from "lucide-react";

export default function DashboardGuests() {
  const { wedding } = useWedding();
  const [guests, setGuests] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [passcode, setPasscode] = useState("");

  useEffect(() => {
    if (wedding) fetchGuests();
  }, [wedding]);

  const fetchGuests = async () => {
    const { data, error } = await supabase
      .from("guests")
      .select("*")
      .eq("wedding_id", wedding?.id)
      .order("created_at", { ascending: false });
    
    if (data) setGuests(data);
  };

  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !wedding) return;

    const { error } = await supabase.from("guests").insert({
      wedding_id: wedding.id,
      name,
      phone: phone || null,
      passcode: passcode || null,
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

  const getInviteLink = (token: string) => {
    return `${window.location.origin}/${wedding?.slug}/convite/${token}`;
  };

  const copyLink = (token: string) => {
    navigator.clipboard.writeText(getInviteLink(token));
    toast.success("Link copiado!");
  };

  const shareWhatsApp = (phone: string | null, token: string) => {
    const link = getInviteLink(token);
    const message = encodeURIComponent(`Você foi convidado para o nosso casamento! Acesse seu convite exclusivo: ${link}`);
    const url = phone 
      ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${message}`
      : `https://wa.me/?text=${message}`;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-medium mb-4">Adicionar Convidado</h3>
        <form onSubmit={handleAddGuest} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-muted/50 p-4 rounded-lg">
          <div className="space-y-2">
            <label className="text-sm font-medium">Nome do Convidado</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex: João e Maria" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">WhatsApp (Opcional)</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Senha (Opcional)</label>
            <Input value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="Deixe em branco para sem senha" />
          </div>
          <Button type="submit">Adicionar</Button>
        </form>
      </div>

      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-medium mb-4">Lista de Convidados</h3>
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Senha</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    Nenhum convidado cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                guests.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell>{g.passcode || <span className="text-muted-foreground italic">Nenhuma</span>}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="icon" onClick={() => copyLink(g.token)} title="Copiar link">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => shareWhatsApp(g.phone, g.token)} title="Enviar por WhatsApp">
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button variant="destructive" size="icon" onClick={() => handleDeleteGuest(g.id)} title="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
