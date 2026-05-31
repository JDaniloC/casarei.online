import React, { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Image as ImageIcon, Upload, Link as LinkIcon, Loader2, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ImageCropperModal from "./ImageCropperModal";
import { MediaLibraryPicker } from "./MediaLibraryPicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface HeroImageUploaderProps {
  weddingId: string;
  value: string;
  onChange: (url: string) => void;
}

export default function HeroImageUploader({ weddingId, value, onChange }: HeroImageUploaderProps) {
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [croppingSrc, setCroppingSrc] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [loadingUrl, setLoadingUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setCroppingSrc(reader.result?.toString() || null);
        setIsOptionsModalOpen(false);
      });
      reader.readAsDataURL(file);
      e.target.value = ""; // Reset input
    }
  };

  const handleUrlLoad = async () => {
    if (!urlInput) return;
    setLoadingUrl(true);
    
    try {
      // Tenta fazer o fetch para burlar/verificar CORS e transformar em Blob
      const response = await fetch(urlInput, { mode: "cors" });
      if (!response.ok) throw new Error("Network response was not ok");
      
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setCroppingSrc(objectUrl);
      setIsOptionsModalOpen(false);
    } catch (err) {
      console.error("CORS ou erro de rede ao carregar imagem externa:", err);
      toast.error("A URL não permite edição (bloqueio de segurança). Por favor, salve a imagem no seu computador e faça o Upload.");
    } finally {
      setLoadingUrl(false);
    }
  };

  const onCropComplete = async (croppedBlob: Blob) => {
    const toastId = toast.loading("Salvando e fazendo upload da imagem...");
    try {
      // 1. Gera nome único
      const fileName = `hero_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
      const filePath = `${weddingId}/${fileName}`;

      // 2. Upload para o Supabase
      const { data, error } = await supabase.storage
        .from("wedding-gallery")
        .upload(filePath, croppedBlob, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (error) throw error;

      // 3. Pega a URL pública
      const { data: publicUrlData } = supabase.storage
        .from("wedding-gallery")
        .getPublicUrl(filePath);

      // 4. Salva nas configurações
      onChange(publicUrlData.publicUrl);
      
      toast.success("Foto principal atualizada com sucesso!", { id: toastId });
    } catch (error) {
      console.error("Erro no upload da imagem:", error);
      toast.error("Erro ao salvar a imagem.", { id: toastId });
    } finally {
      if (croppingSrc && croppingSrc.startsWith("blob:")) {
        URL.revokeObjectURL(croppingSrc); // cleanup
      }
      setCroppingSrc(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Preview atual */}
      {value ? (
        <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-border group bg-muted">
          <img src={value} alt="Hero Preview" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Button variant="secondary" onClick={() => setIsOptionsModalOpen(true)}>
              Alterar Foto
            </Button>
          </div>
        </div>
      ) : (
        <div className="w-full aspect-video rounded-xl border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-2 bg-muted/20">
          <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
          <Button variant="outline" onClick={() => setIsOptionsModalOpen(true)}>
            Adicionar Foto Principal
          </Button>
        </div>
      )}

      {/* Modal de Escolha (Upload vs URL) */}
      <Dialog open={isOptionsModalOpen} onOpenChange={setIsOptionsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Foto Principal (Hero)</DialogTitle>
            <DialogDescription>
              A foto principal é a primeira coisa que seus convidados verão. Ela será recortada em 16:9 para encaixar perfeitamente.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="upload" className="w-full mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="upload" className="flex gap-2">
                <Upload className="w-4 h-4 hidden sm:block" /> Upload
              </TabsTrigger>
              <TabsTrigger value="url" className="flex gap-2">
                <LinkIcon className="w-4 h-4 hidden sm:block" /> URL
              </TabsTrigger>
              <TabsTrigger value="library" className="flex gap-2">
                <Library className="w-4 h-4 hidden sm:block" /> Biblioteca
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="upload" className="space-y-4 mt-4">
              <div 
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <Upload className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Clique para selecionar</p>
                    <p className="text-xs text-muted-foreground">JPG, PNG ou WebP</p>
                  </div>
                </div>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileSelect} 
              />
            </TabsContent>
            
            <TabsContent value="url" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Input 
                  placeholder="https://exemplo.com/sua-foto.jpg" 
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">
                  Nota: Algumas imagens da internet podem bloquear a edição por motivos de segurança (CORS).
                </p>
              </div>
              <Button 
                onClick={handleUrlLoad} 
                disabled={!urlInput || loadingUrl} 
                className="w-full bg-primary text-primary-foreground"
              >
                {loadingUrl && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Carregar Imagem
              </Button>
            </TabsContent>
            
            <TabsContent value="library" className="space-y-4 mt-4">
              <div className="text-center p-6 border rounded-lg bg-muted/20">
                <Library className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-4">
                  Escolha uma foto que você já enviou para a sua galeria.
                </p>
                <Button 
                  onClick={() => {
                    setIsOptionsModalOpen(false);
                    setIsLibraryOpen(true);
                  }}
                  className="w-full"
                >
                  Abrir Biblioteca
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <MediaLibraryPicker 
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        weddingId={weddingId}
        onSelect={(url) => {
          setCroppingSrc(url);
        }}
      />

      {/* Cropper Modal */}
      {croppingSrc && (
        <ImageCropperModal
          open={!!croppingSrc}
          onOpenChange={(open) => !open && setCroppingSrc(null)}
          imageSrc={croppingSrc}
          onCropComplete={onCropComplete}
        />
      )}
    </div>
  );
}
