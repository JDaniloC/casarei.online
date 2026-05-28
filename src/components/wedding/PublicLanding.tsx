import { useState, useEffect } from "react";
import { useWedding, WeddingConfig } from "@/contexts/WeddingContext";
import { CartProvider } from "@/contexts/CartContext";
import PublicHero from "./PublicHero";
import PublicAbout from "./PublicAbout";
import PublicWeddingInfo from "./PublicWeddingInfo";
import PublicDressCode from "./PublicDressCode";
import GiftRegistrySection from "./GiftRegistrySection";
import PublicRSVP from "./PublicRSVP";
import PublicMessageWall from "./PublicMessageWall";
import VideoSection from "./VideoSection";
import PhotoGallery from "./PhotoGallery";
import PublicFooter from "./PublicFooter";
import CartButton from "./CartButton";
import CheckoutModal from "./CheckoutModal";
import PublicVirtualHouse from "./PublicVirtualHouse";

interface PublicLandingProps {
  isPreview?: boolean;
  config?: WeddingConfig;
  weddingId?: string;
  mercadoPagoPublicKey?: string | null;
  paymentCreditCard?: boolean;
  paymentPix?: boolean;
  paymentBoleto?: boolean;
  maxInstallments?: number;
  manualPixType?: string;
  manualPixKey?: string;
  manualPixQrImageUrl?: string;
  isGuestView?: boolean;
  guest?: any;
}

const PublicLandingContent = ({ 
  weddingId,
  mercadoPagoPublicKey,
  paymentCreditCard,
  paymentPix,
  paymentBoleto,
  maxInstallments,
  manualPixType,
  manualPixKey,
  manualPixQrImageUrl,
  isGuestView = true,
  guest,
}: {
  weddingId?: string;
  mercadoPagoPublicKey?: string | null;
  paymentCreditCard?: boolean;
  paymentPix?: boolean;
  paymentBoleto?: boolean;
  maxInstallments?: number;
  manualPixType?: string;
  manualPixKey?: string;
  manualPixQrImageUrl?: string;
  isGuestView?: boolean;
  guest?: any;
}) => {
  const { config } = useWedding();
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Apply layout theme and visual customizations to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-layout', config.layout || 'classic');
    document.documentElement.setAttribute('data-theme-color', config.themeColor || 'terracotta');
    document.documentElement.setAttribute('data-theme-font', config.themeFont || 'serif');
    document.documentElement.setAttribute('data-theme-decorations', String(config.themeDecorations ?? true));
    
    return () => {
      document.documentElement.removeAttribute('data-layout');
      document.documentElement.removeAttribute('data-theme-color');
      document.documentElement.removeAttribute('data-theme-font');
      document.documentElement.removeAttribute('data-theme-decorations');
    };
  }, [config.layout, config.themeColor, config.themeFont, config.themeDecorations]);

  const sections = {
    ...config.sections,
    weddingInfo: isGuestView ? config.sections.weddingInfo : false,
    dressCode: isGuestView ? config.sections.dressCode : false,
    rsvp: isGuestView ? config.sections.rsvp : false,
    messageWall: isGuestView ? config.sections.messageWall : false,
  };

  return (
    <>
      <main className="overflow-x-hidden">
        <PublicHero />
        
        {sections.about && <PublicAbout />}
        
        {sections.video && config.videoUrl && (
          <VideoSection videoUrl={config.videoUrl} />
        )}
        
        {sections.weddingInfo && <PublicWeddingInfo />}
        
        {sections.dressCode && <PublicDressCode />}
        
        {sections.gifts && <GiftRegistrySection />}
        
        {sections.virtualHouse && (
          <PublicVirtualHouse
            weddingId={weddingId || ""}
            onOpenCheckout={() => setIsCheckoutOpen(true)}
          />
        )}
        
        {sections.rsvp && <PublicRSVP weddingId={weddingId} guest={guest} />}
        
        {sections.gallery && <PhotoGallery weddingId={weddingId} />}
        
        {sections.messageWall && <PublicMessageWall weddingId={weddingId} />}
        
        <PublicFooter />
      </main>

      {config.sections.gifts && (
        <>
          <CartButton onClick={() => setIsCheckoutOpen(true)} />
          <CheckoutModal
            isOpen={isCheckoutOpen}
            onClose={() => setIsCheckoutOpen(false)}
            weddingId={weddingId || ""}
            mercadoPagoPublicKey={mercadoPagoPublicKey}
            paymentCreditCard={paymentCreditCard}
            paymentPix={paymentPix}
            paymentBoleto={paymentBoleto}
            maxInstallments={maxInstallments}
            manualPixType={manualPixType}
            manualPixKey={manualPixKey}
            manualPixQrImageUrl={manualPixQrImageUrl}
          />
        </>
      )}
    </>
  );
};

const PublicLanding = ({ 
  isPreview = false, 
  config: propConfig,
  weddingId,
  mercadoPagoPublicKey,
  paymentCreditCard,
  paymentPix,
  paymentBoleto,
  maxInstallments,
  manualPixType,
  manualPixKey,
  manualPixQrImageUrl,
  isGuestView,
  guest,
}: PublicLandingProps) => {
  return (
    <CartProvider>
      <PublicLandingContent 
        weddingId={weddingId}
        mercadoPagoPublicKey={mercadoPagoPublicKey}
        paymentCreditCard={paymentCreditCard}
        paymentPix={paymentPix}
        paymentBoleto={paymentBoleto}
        maxInstallments={maxInstallments}
        manualPixType={manualPixType}
        manualPixKey={manualPixKey}
        manualPixQrImageUrl={manualPixQrImageUrl}
        isGuestView={isPreview ? true : isGuestView}
        guest={guest}
      />
    </CartProvider>
  );
};

export default PublicLanding;
