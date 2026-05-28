import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Image as ImageIcon } from "lucide-react";

interface MediaLibraryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weddingId: string;
  onSelect: (url: string) => void;
}

interface GalleryImage {
  id: string;
  image_url: string;
}

export function MediaLibraryPicker({ open, onOpenChange, weddingId, onSelect }: MediaLibraryPickerProps) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open && weddingId) {
      fetchImages();
    }
  }, [open, weddingId]);

  const fetchImages = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("gallery_images")
        .select("id, image_url")
        .eq("wedding_id", weddingId)
        .order("created_at", { ascending: false }); // Show newest first

      if (error) throw error;
      setImages(data || []);
    } catch (error) {
      console.error("Error fetching library images:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (url: string) => {
    onSelect(url);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Biblioteca de Fotos</DialogTitle>
          <DialogDescription>
            Escolha uma foto que você já enviou para a galeria.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-gold" />
          </div>
        ) : images.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mt-4">
            {images.map((img) => (
              <div 
                key={img.id} 
                className="relative group rounded-lg overflow-hidden border bg-muted aspect-square cursor-pointer hover:ring-2 ring-primary ring-offset-2 transition-all"
                onClick={() => handleSelect(img.image_url)}
              >
                <img 
                  src={img.image_url} 
                  alt="Biblioteca" 
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-sm font-medium">Selecionar</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center p-12 border border-dashed rounded-lg bg-muted/20 mt-4">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">Nenhuma foto na biblioteca.</p>
            <p className="text-xs text-muted-foreground mt-1">Envie fotos pela aba "Galeria" para usá-las aqui.</p>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
