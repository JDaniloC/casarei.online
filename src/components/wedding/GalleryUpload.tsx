import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Trash2, Upload, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface GalleryUploadProps {
  weddingId: string;
}

interface GalleryImage {
  id: string;
  image_url: string;
  display_order: number;
}

export function GalleryUpload({ weddingId }: GalleryUploadProps) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const MAX_PHOTOS = 50;
  const MAX_FILE_SIZE_MB = 5;

  useEffect(() => {
    fetchImages();
  }, [weddingId]);

  const fetchImages = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("gallery_images")
        .select("*")
        .eq("wedding_id", weddingId)
        .order("display_order", { ascending: true });

      if (error) throw error;
      setImages(data || []);
    } catch (error) {
      console.error("Error fetching images:", error);
      toast.error("Erro ao carregar as fotos.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (images.length >= MAX_PHOTOS) {
      toast.error(`Você atingiu o limite de ${MAX_PHOTOS} fotos!`);
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`A foto deve ter no máximo ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${weddingId}/${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("wedding-gallery")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("wedding-gallery")
        .getPublicUrl(fileName);

      const imageUrl = publicUrlData.publicUrl;

      const { error: dbError } = await supabase
        .from("gallery_images")
        .insert({
          wedding_id: weddingId,
          image_url: imageUrl,
          display_order: images.length + 1
        });

      if (dbError) throw dbError;

      toast.success("Foto enviada com sucesso!");
      fetchImages(); // Refresh gallery
      
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Ocorreu um erro ao enviar a foto.");
    } finally {
      setIsUploading(false);
      if (event.target) event.target.value = ''; // Reset input
    }
  };

  const handleDelete = async (image: GalleryImage) => {
    if (!window.confirm("Tem certeza que deseja excluir esta foto?")) return;

    try {
      // 1. Delete from DB
      const { error: dbError } = await supabase
        .from("gallery_images")
        .delete()
        .eq("id", image.id);

      if (dbError) throw dbError;

      // 2. Delete from Storage
      const fileName = image.image_url.split('/wedding-gallery/')[1];
      if (fileName) {
        await supabase.storage
          .from("wedding-gallery")
          .remove([fileName]);
      }

      toast.success("Foto excluída com sucesso.");
      fetchImages();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Erro ao excluir a foto.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border rounded-lg bg-card">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-gold" />
            Adicionar nova foto
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Você usou {images.length} de {MAX_PHOTOS} fotos. Máximo de 5MB por arquivo.
          </p>
        </div>

        <div>
          <input
            type="file"
            accept="image/jpeg, image/png, image/webp"
            onChange={handleFileUpload}
            disabled={isUploading || images.length >= MAX_PHOTOS}
            className="hidden"
            id="foto-upload"
          />
          <Button 
            asChild 
            disabled={isUploading || images.length >= MAX_PHOTOS}
          >
            <label htmlFor="foto-upload" className="cursor-pointer whitespace-nowrap">
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Escolher Foto
                </>
              )}
            </label>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : images.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {images.map((img) => (
            <div key={img.id} className="relative group rounded-lg overflow-hidden border bg-muted aspect-square">
              <img 
                src={img.image_url} 
                alt="Galeria" 
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button 
                  variant="destructive" 
                  size="icon"
                  onClick={() => handleDelete(img)}
                  title="Excluir foto"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center p-12 border border-dashed rounded-lg bg-muted/20">
          <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Nenhuma foto adicionada ainda.</p>
        </div>
      )}
    </div>
  );
}
