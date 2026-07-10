import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GuestPasscodeModalProps {
  open: boolean;
  /** Casamento a validar (senha global) quando não houver token */
  weddingId: string;
  /** Token do convite individual; quando presente, valida a senha do convidado */
  guestToken?: string;
  onSuccess: () => void;
}

// A senha nunca chega ao cliente: a validação é feita server-side pela edge
// function verify-passcode, que responde apenas { authorized: boolean }.
export default function GuestPasscodeModal({ open, weddingId, guestToken, onSuccess }: GuestPasscodeModalProps) {
  const [passcode, setPasscode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim() || loading) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("verify-passcode", {
        body: {
          passcode: passcode.trim(),
          token: guestToken || undefined,
          wedding_id: guestToken ? undefined : weddingId,
        },
      });

      if (error) throw error;

      if (data?.authorized) {
        onSuccess();
      } else {
        toast.error("Senha incorreta");
        setPasscode("");
      }
    } catch (err) {
      console.error("Passcode verification error:", err);
      toast.error("Não foi possível validar a senha. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Convite Protegido</DialogTitle>
          <DialogDescription>
            Este convite exige uma senha de acesso. Por favor, insira a senha fornecida pelos noivos.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="password"
            placeholder="Digite a senha"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            disabled={loading}
          />
          <Button type="submit" className="w-full" disabled={loading || !passcode.trim()}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Verificando...
              </>
            ) : (
              "Acessar Convite"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
