import React, { useState, useRef } from "react";
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface ImageCropperModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => Promise<void>;
}

// Helper to initialize crop to 16:9
function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: "%",
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

export default function ImageCropperModal({ open, onOpenChange, imageSrc, onCropComplete }: ImageCropperModalProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isProcessing, setIsProcessing] = useState(false);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, 16 / 9));
  }

  const handleSave = async () => {
    if (!completedCrop || !imgRef.current) return;
    setIsProcessing(true);

    try {
      const image = imgRef.current;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        throw new Error("No 2d context");
      }

      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;
      const pixelRatio = window.devicePixelRatio;

      canvas.width = Math.floor(completedCrop.width * scaleX * pixelRatio);
      canvas.height = Math.floor(completedCrop.height * scaleY * pixelRatio);

      ctx.scale(pixelRatio, pixelRatio);
      ctx.imageSmoothingQuality = "high";

      const cropX = completedCrop.x * scaleX;
      const cropY = completedCrop.y * scaleY;
      const cropWidth = completedCrop.width * scaleX;
      const cropHeight = completedCrop.height * scaleY;

      ctx.drawImage(
        image,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight
      );

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setIsProcessing(false);
          return;
        }
        await onCropComplete(blob);
        setIsProcessing(false);
        onOpenChange(false);
      }, "image/jpeg", 0.95);

    } catch (e) {
      console.error("Crop error", e);
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !isProcessing && onOpenChange(val)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Recortar Imagem (16:9)</DialogTitle>
          <DialogDescription>
            Ajuste a área da imagem para se encaixar na proporção ideal do site.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center items-center bg-black/5 rounded-lg overflow-hidden min-h-[300px] max-h-[60vh]">
          {imageSrc ? (
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={16 / 9}
              className="max-h-[60vh]"
            >
              <img
                ref={imgRef}
                alt="Crop me"
                src={imageSrc}
                onLoad={onImageLoad}
                className="max-h-[60vh] object-contain"
                crossOrigin="anonymous" // Attempt to bypass strict CORS if possible
              />
            </ReactCrop>
          ) : (
            <div className="text-muted-foreground">Nenhuma imagem carregada</div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isProcessing || !completedCrop} className="bg-primary text-primary-foreground">
            {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar Recorte
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
