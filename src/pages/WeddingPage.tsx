import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { Heart, Loader2, ArrowLeft } from "lucide-react";
import { WeddingProvider, WeddingConfig } from "@/contexts/WeddingContext";
import PublicLanding from "@/components/wedding/PublicLanding";
import { Button } from "@/components/ui/button";
import GuestPasscodeModal from "@/components/wedding/GuestPasscodeModal";
import { supabase } from "@/integrations/supabase/client";

interface WeddingData {
  id: string;
  couple_name: string;
  wedding_date: string | null;
  tagline: string | null;
  layout: string;
  section_about: boolean;
  section_wedding_info: boolean;
  section_gifts: boolean;
  section_rsvp: boolean;
  section_message_wall: boolean;
  section_gallery: boolean;
  section_video: boolean;
  section_dress_code: boolean;
  section_virtual_house: boolean;
  hero_image_url: string | null;
  video_url: string | null;
  ceremony_date: string | null;
  ceremony_time: string | null;
  ceremony_location: string | null;
  ceremony_address: string | null;
  reception_location: string | null;
  reception_address: string | null;
  reception_time: string | null;
  same_location: boolean;
  about_text: string | null;
  dress_code_text: string | null;
  colors_to_avoid: string | null;
  additional_info: string | null;
  mercado_pago_public_key: string | null;
  story_photo_1: string | null;
  story_photo_2: string | null;
  story_photo_3: string | null;
  partner1_name: string;
  partner2_name: string;
  payment_credit_card?: boolean;
  payment_pix?: boolean;
  payment_boleto?: boolean;
  max_installments?: number;
  manual_pix_type?: string;
  manual_pix_key?: string;
  manual_pix_qr_image_url?: string;
  whatsapp_number?: string;
  global_passcode?: string | null;
}

interface GiftData {
  id: string;
  name: string;
  category: string;
  price: number;
  image_url: string | null;
  external_link: string | null;
  total_quotas: number | null;
  stock: number | null;
  is_open_price: boolean;
  is_vaquinha: boolean;
  raised_amount: number | null;
}

interface GalleryImageData {
  id: string;
  image_url: string;
  caption: string | null;
  display_order: number;
}

// Component that uses the wedding context with loaded data
const WeddingContent = ({ 
  weddingData, 
  gifts,
  weddingId,
  mercadoPagoPublicKey,
  guest
}: { 
  weddingData: WeddingData;
  gifts: GiftData[];
  weddingId: string;
  mercadoPagoPublicKey: string | null;
  guest?: any;
}) => {
  const initialConfig: WeddingConfig = {
    coupleName: weddingData.couple_name,
    weddingDate: weddingData.wedding_date || "",
    tagline: weddingData.tagline || "",
    layout: weddingData.layout as "classic" | "modern" | "minimalist",
    whatsappNumber: weddingData.whatsapp_number || "",
    sections: {
      about: weddingData.section_about,
      weddingInfo: weddingData.section_wedding_info,
      gifts: weddingData.section_gifts,
      rsvp: weddingData.section_rsvp,
      messageWall: weddingData.section_message_wall,
      gallery: weddingData.section_gallery,
      video: weddingData.section_video,
      dressCode: weddingData.section_dress_code,
      virtualHouse: weddingData.section_virtual_house || false,
    },
    heroImage: weddingData.hero_image_url || "",
    videoUrl: weddingData.video_url || "",
    ceremonyDate: weddingData.ceremony_date || "",
    ceremonyTime: weddingData.ceremony_time || "",
    ceremonyLocation: weddingData.ceremony_location || "",
    ceremonyAddress: weddingData.ceremony_address || "",
    receptionLocation: weddingData.reception_location || "",
    receptionAddress: weddingData.reception_address || "",
    receptionTime: weddingData.reception_time || "",
    sameLocation: weddingData.same_location,
    aboutText: weddingData.about_text || "",
    dressCodeText: weddingData.dress_code_text || "",
    colorsToAvoid: weddingData.colors_to_avoid || "",
    additionalInfo: weddingData.additional_info || "",
    storyPhotos: [
      weddingData.story_photo_1 || "",
      weddingData.story_photo_2 || "",
      weddingData.story_photo_3 || "",
    ].filter(Boolean),
    gifts: gifts.map(g => ({
      id: g.id,
      name: g.name,
      category: g.category,
      price: Number(g.price),
      image: g.image_url || "",
      externalLink: g.external_link || "",
      totalQuotas: g.total_quotas !== null && g.total_quotas !== undefined ? Number(g.total_quotas) : null,
      stock: g.stock !== null && g.stock !== undefined ? Number(g.stock) : null,
      isOpenPrice: g.is_open_price || false,
      isVaquinha: g.is_vaquinha || false,
      raisedAmount: Number(g.raised_amount) || 0,
    })),
    galleryImages: [],
  };

  const location = useLocation();
  const isPreview = location.pathname.startsWith("/preview");
  const isGuestView = isPreview || location.pathname.includes("/convite") || new URLSearchParams(location.search).has("convite");

  return (
    <WeddingProvider initialConfig={initialConfig}>
      <PublicLanding 
        weddingId={weddingId}
        mercadoPagoPublicKey={mercadoPagoPublicKey}
        paymentCreditCard={weddingData.payment_credit_card ?? true}
        paymentPix={weddingData.payment_pix ?? true}
        paymentBoleto={weddingData.payment_boleto ?? true}
        maxInstallments={weddingData.max_installments ?? 12}
        manualPixType={weddingData.manual_pix_type}
        manualPixKey={weddingData.manual_pix_key}
        manualPixQrImageUrl={weddingData.manual_pix_qr_image_url}
        isGuestView={isGuestView}
        guest={guest}
      />
    </WeddingProvider>
  );
};

// Preload critical images before showing content
const preloadImages = (urls: string[]): Promise<void[]> => {
  return Promise.all(
    urls.filter(Boolean).map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve(); // Don't block on error
          img.src = url;
        })
    )
  );
};

const WeddingPage = () => {
  const { slug, token } = useParams<{ slug: string; token?: string }>();
  const [wedding, setWedding] = useState<WeddingData | null>(null);
  const [gifts, setGifts] = useState<GiftData[]>([]);
  const [loading, setLoading] = useState(true);
  const [imagesReady, setImagesReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guest, setGuest] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const location = useLocation();
  const isPreview = location.pathname.startsWith("/preview");
  const isGuestView = isPreview || location.pathname.includes("/convite") || new URLSearchParams(location.search).has("convite");

  useEffect(() => {
    const fetchWedding = async () => {
      if (!slug) {
        setError("URL inválida");
        setLoading(false);
        return;
      }

      const systemRoutes = ['login', 'register', 'dashboard', 'preview', 'demo'];
      if (systemRoutes.includes(slug)) {
        setError("Página não encontrada");
        setLoading(false);
        return;
      }

      if (!/^[a-z0-9-]+$/.test(slug)) {
        setError("URL inválida");
        setLoading(false);
        return;
      }

      try {
        const baseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        
        const fetchResponse = await fetch(
          `${baseUrl}/functions/v1/get-public-wedding?slug=${encodeURIComponent(slug)}`,
          {
            headers: {
              'apikey': anonKey,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!fetchResponse.ok) {
          const errorData = await fetchResponse.json().catch(() => ({}));
          setError(errorData.error || "Casamento não encontrado");
          setLoading(false);
          return;
        }

        const publicData = await fetchResponse.json();
        const weddingData = publicData.wedding as WeddingData;
        setWedding(weddingData);
        setGifts(publicData.gifts || []);

        // Authentication logic based on weddingData and token
        if (!token) {
          const isGenericGuestView = location.pathname.includes("/convite") || new URLSearchParams(location.search).has("convite");
          if (isGenericGuestView && weddingData.global_passcode) {
            setIsAuthenticated(false);
          } else {
            setIsAuthenticated(true);
          }
        }

        // Preload critical images (hero + story photos)
        const criticalImages = [
          weddingData.hero_image_url,
        ].filter(Boolean) as string[];

        if (criticalImages.length > 0) {
          await preloadImages(criticalImages);
        }
        setImagesReady(true);
      } catch (err) {
        console.error('Error fetching wedding:', err);
        setError("Erro ao carregar página");
      } finally {
        setLoading(false);
      }
    };

    const fetchGuest = async () => {
      if (token) {
        const { data } = await supabase.from("guests").select("*").eq("token", token).single();
        if (data) {
          setGuest(data);
          if (!data.passcode) {
            setIsAuthenticated(true);
          }
        } else {
          // invalid token, just let them see the public page
          setIsAuthenticated(true);
        }
      }
    };

    fetchWedding();
    fetchGuest();
  }, [slug, token, location.pathname, location.search]);

  if (loading || (!imagesReady && !error)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-gold mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (error || !wedding) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <Heart className="w-16 h-16 text-gold/30 mx-auto mb-6" />
          <h1 className="font-serif text-2xl text-foreground mb-2">
            {error || "Página não encontrada"}
          </h1>
          <p className="text-muted-foreground mb-8">
            Verifique se a URL está correta e tente novamente.
          </p>
          <Link to="/">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Voltar para o início
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isGenericGuestView = isGuestView && !token;
  const requiresGlobalPasscode = isGenericGuestView && wedding.global_passcode;
  const requiresGuestPasscode = !!(guest && guest.passcode);
  const expectedPasscode = requiresGuestPasscode ? guest.passcode : (requiresGlobalPasscode ? wedding.global_passcode : null);

  return (
    <>
      {expectedPasscode && (
        <GuestPasscodeModal 
          open={!isAuthenticated} 
          expectedPasscode={expectedPasscode} 
          onSuccess={() => setIsAuthenticated(true)} 
        />
      )}
      {isAuthenticated && (
        <WeddingContent 
          weddingData={wedding} 
          gifts={gifts}
          weddingId={wedding.id}
          mercadoPagoPublicKey={wedding.mercado_pago_public_key}
          guest={guest}
        />
      )}
    </>
  );
};

export default WeddingPage;
