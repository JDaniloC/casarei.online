import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface GuestPasscodeModalProps {
  open: boolean;
  expectedPasscode: string;
  onSuccess: () => void;
}

export default function GuestPasscodeModal({ open, expectedPasscode, onSuccess }: GuestPasscodeModalProps) {
  const [passcode, setPasscode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === expectedPasscode) {
      onSuccess();
    } else {
      toast.error("Senha incorreta");
      setPasscode("");
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
          />
          <Button type="submit" className="w-full">Acessar Convite</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
