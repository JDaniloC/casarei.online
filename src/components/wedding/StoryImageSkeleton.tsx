import React, { useState } from "react";
import { Plus, X, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import HeroImageUploader from "./HeroImageUploader";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface StoryImageSkeletonProps {
  weddingId: string;
  photos: string[];
  onChange: (photos: string[]) => void;
}

export function StoryImageSkeleton({ weddingId, photos, onChange }: StoryImageSkeletonProps) {
  // Pad the photos array to length 3 with empty strings for easier mapping
  const activePhotos = photos.filter(Boolean);
  const displayPhotos = [
    activePhotos[0] || "",
    activePhotos[1] || "",
    activePhotos[2] || "",
  ];

  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  const handleUpdatePhoto = (url: string) => {
    if (activeSlot === null) return;
    const newPhotos = [...displayPhotos];
    newPhotos[activeSlot] = url;
    onChange(newPhotos.filter(Boolean));
    setActiveSlot(null);
  };

  const handleRemovePhoto = (index: number) => {
    const newPhotos = [...displayPhotos];
    newPhotos[index] = "";
    // Remove empty strings from middle to collapse the array
    onChange(newPhotos.filter(Boolean));
  };

  const count = activePhotos.length;

  const getGridClass = () => {
    if (count === 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-2";
    return "grid-cols-2"; // 3 photos uses a 2 column grid where the first spans 2 cols
  };

  // Helper function for rendering a slot
  const renderSlot = (index: number, className: string) => {
    const hasPhoto = !!displayPhotos[index];
    
    // Only show slot 1 & 2 if slot 0 is filled.
    if (index > 0 && !displayPhotos[index - 1] && !hasPhoto) return null;

    return (
      <div 
        key={index}
        className={`relative rounded-lg overflow-hidden border-2 border-dashed border-muted-foreground/30 bg-muted/20 flex flex-col items-center justify-center transition-all group ${className}`}
        style={{ minHeight: "150px" }}
      >
        {hasPhoto ? (
          <>
            <img src={displayPhotos[index]} alt={`Story ${index + 1}`} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setActiveSlot(index)}>
                Trocar
              </Button>
              <Button variant="destructive" size="icon" onClick={() => handleRemovePhoto(index)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </>
        ) : (
          <div 
            className="w-full h-full flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors p-4 text-center"
            onClick={() => setActiveSlot(index)}
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Plus className="w-5 h-5 text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {index === 0 ? "Adicionar Foto Principal" : `Adicionar Foto ${index + 1}`}
            </p>
            <p className="text-xs text-muted-foreground max-w-[150px]">
              {index === 0 ? "Clique para adicionar a foto de destaque" : "Adicione mais momentos"}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">
          Clique nos espaços abaixo para adicionar fotos. O layout se adaptará automaticamente (1, 2 ou 3 fotos).
        </p>
        <div className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground">
          {count} de 3 fotos
        </div>
      </div>

      <div className={`grid gap-4 ${getGridClass()}`}>
        {renderSlot(0, count === 3 ? "col-span-2 h-64" : (count === 1 ? "h-64 sm:h-80" : "h-48 sm:h-64"))}
        {count >= 1 && renderSlot(1, count === 3 ? "col-span-1 h-48" : "h-48 sm:h-64")}
        {count >= 2 && renderSlot(2, count === 3 ? "col-span-1 h-48" : "hidden")}
      </div>

      <Dialog open={activeSlot !== null} onOpenChange={(open) => !open && setActiveSlot(null)}>
        <DialogContent className="max-w-2xl">
          {activeSlot !== null && (
            <div className="pt-4">
              <p className="font-medium text-lg mb-4 text-center">
                Adicionar {activeSlot === 0 ? "Foto de Destaque" : `Foto ${activeSlot + 1}`} da História
              </p>
              {/* Reuse the logic from HeroImageUploader, but adapt it to not assume Hero */}
              <HeroImageUploader 
                weddingId={weddingId}
                value={displayPhotos[activeSlot]}
                onChange={handleUpdatePhoto}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
