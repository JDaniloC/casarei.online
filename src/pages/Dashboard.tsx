import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Settings, Eye, Heart, Calendar, Image, Gift, 
  MessageSquare, Users, Camera, Video, Shirt, 
  Plus, Trash2, Edit2, Save, ChevronRight, LogOut,
  CreditCard, Link2, Copy, Check, ExternalLink, Info,
  Loader2, CheckCircle2, XCircle, AlertCircle, MapPin,
  History, Home, QrCode, FileText, Wand2, Upload, Download,
  Palette, LayoutDashboard
} from "lucide-react";
import DashboardHistory from "@/components/wedding/DashboardHistory";
import DashboardVirtualHouse from "@/components/wedding/DashboardVirtualHouse";
import DashboardGuests from "@/components/wedding/DashboardGuests";
import HouseCatalogSettings from "@/components/wedding/HouseCatalogSettings";
import { GalleryUpload } from "@/components/wedding/GalleryUpload";
import HeroImageUploader from "@/components/wedding/HeroImageUploader";
import { StoryImageSkeleton } from "@/components/wedding/StoryImageSkeleton";
import { useWedding, Gift as GiftType } from "@/contexts/WeddingContext";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";

const layoutOptions = [
  {
    id: "classic" as const,
    name: "Clássico",
    description: "Elegância atemporal com tons dourados e tipografia serifada",
    preview: "bg-gradient-to-br from-amber-50 to-orange-50",
  },
  {
    id: "modern" as const,
    name: "Moderno",
    description: "Design limpo com linhas geométricas e cores neutras",
    preview: "bg-gradient-to-br from-slate-50 to-gray-100",
  },
  {
    id: "minimalist" as const,
    name: "Minimalista",
    description: "Simplicidade sofisticada com muito espaço em branco",
    preview: "bg-gradient-to-br from-stone-50 to-neutral-100",
  },
  {
    id: "editorial" as const,
    name: "Editorial",
    description: "Layout dividido, foto no topo e texto embaixo para legibilidade perfeita",
    preview: "bg-gradient-to-b from-primary/10 to-transparent",
  },
  {
    id: "magazine" as const,
    name: "Revista (Magazine)",
    description: "Layout split sofisticado com foto lateral de grande impacto e tipografia moderna",
    preview: "bg-gradient-to-r from-neutral-100 to-neutral-200",
  },
  {
    id: "romantic" as const,
    name: "Romântico (Fine Art)",
    description: "Bordas duplas luxuosas, caligrafia fina e delicados detalhes floridos em tons suaves",
    preview: "bg-gradient-to-br from-rose-50 to-pink-100",
  },
];

const sectionOptions = [
  { key: "about" as const, label: "Sobre o Casal", icon: Heart },
  { key: "weddingInfo" as const, label: "Informações do Casamento", icon: Calendar },
  { key: "dressCode" as const, label: "Dress Code", icon: Shirt },
  { key: "gifts" as const, label: "Lista de Presentes", icon: Gift },
  { key: "rsvp" as const, label: "Confirmação de Presença", icon: Users },
  { key: "messageWall" as const, label: "Mural de Mensagens", icon: MessageSquare },
  { key: "gallery" as const, label: "Galeria de Fotos", icon: Camera },
  { key: "video" as const, label: "Vídeo", icon: Video },
  { key: "virtualHouse" as const, label: "Casa dos Sonhos (2D)", icon: Home },
];

const categories = ["Cozinha", "Quarto", "Sala", "Banheiro", "Casa", "Eletrônicos", "Experiências", "Outros"];

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const { config, updateConfig, addGift, updateGift, removeGift, toggleSection } = useWedding();
  
  const [editingGift, setEditingGift] = useState<GiftType | null>(null);
  const [isAddingGift, setIsAddingGift] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [weddingSlug, setWeddingSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedPublic, setCopiedPublic] = useState(false);
  const [copiedGuest, setCopiedGuest] = useState(false);

  const copyPublicLink = () => {
    if (weddingSlug) {
      navigator.clipboard.writeText(`${window.location.origin}/${weddingSlug}`);
      setCopiedPublic(true);
      setTimeout(() => setCopiedPublic(false), 2000);
    }
  };

  const copyGuestLink = () => {
    if (weddingSlug) {
      navigator.clipboard.writeText(`${window.location.origin}/${weddingSlug}/convite`);
      setCopiedGuest(true);
      setTimeout(() => setCopiedGuest(false), 2000);
    }
  };
  const [newGift, setNewGift] = useState({
    name: "",
    category: "Cozinha",
    price: 0,
    image: "",
    externalLink: "",
    isOpenPrice: false,
  });

  const location = useLocation();
  const [dashboardTab, setDashboardTab] = useState<"settings" | "history" | "guests">(() => {
    return (location.state as any)?.activeTab || "history";
  });
  const [settingsSubTab, setSettingsSubTab] = useState<"appearance" | "story" | "event" | "gifts" | "virtualHouse" | "gallery" | "advanced">("appearance");
  const [houseActiveView, setHouseActiveView] = useState<"blueprint" | "catalog">("blueprint");
  const [weddingId, setWeddingId] = useState<string>("");
  const [mercadoPagoAccessToken, setMercadoPagoAccessToken] = useState("");
  const [mpValidating, setMpValidating] = useState(false);
  const [mpValidation, setMpValidation] = useState<{
    valid: boolean;
    message?: string;
    error?: string;
    isTestMode?: boolean;
  } | null>(null);
  const [uploadingQr, setUploadingQr] = useState(false);
  const loadingWeddingRef = useRef(false);

  // Load existing wedding data - only once on mount
  useEffect(() => {
    const loadWeddingData = async () => {
      if (!user || config.isLoaded || loadingWeddingRef.current) return;
      loadingWeddingRef.current = true;

      try {
        let { data: wedding } = await supabase
          .from("weddings")
          .select(`
            id, slug, couple_name, wedding_date, tagline, layout,
            section_about, section_wedding_info, section_gifts, section_rsvp,
            section_message_wall, section_gallery, section_video, section_dress_code, section_virtual_house,
            hero_image_url, video_url,
            ceremony_date, ceremony_time, ceremony_location, ceremony_address,
            reception_location, reception_address, reception_time, same_location,
            about_text, dress_code_text, colors_to_avoid, additional_info,
            mercado_pago_public_key,
            payment_credit_card, payment_pix, payment_boleto, max_installments,
            manual_pix_type, manual_pix_key, manual_pix_qr_image_url,
            story_photo_1, story_photo_2, story_photo_3,
            whatsapp_number,
            theme_color, theme_font, theme_decorations, global_passcode
          `)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!wedding) {
          // Auto-create a wedding draft for new couples
          const randomString = Math.random().toString(36).substring(2, 8);
          const defaultSlug = `casal-${randomString}`;
          
          const { data: newWedding, error: createError } = await supabase
            .from("weddings")
            .insert({
              user_id: user.id,
              couple_name: "Camila & Rafael",
              slug: defaultSlug,
              layout: "classic",
              section_about: true,
              section_wedding_info: true,
              section_gifts: true,
              section_rsvp: true,
              section_message_wall: true,
              section_gallery: true,
              section_video: false,
              section_dress_code: true,
              section_virtual_house: false,
            })
            .select(`
              id, slug, couple_name, wedding_date, tagline, layout,
              section_about, section_wedding_info, section_gifts, section_rsvp,
              section_message_wall, section_gallery, section_video, section_dress_code, section_virtual_house,
              hero_image_url, video_url,
              ceremony_date, ceremony_time, ceremony_location, ceremony_address,
              reception_location, reception_address, reception_time, same_location,
              about_text, dress_code_text, colors_to_avoid, additional_info,
              mercado_pago_public_key,
              payment_credit_card, payment_pix, payment_boleto, max_installments,
              manual_pix_type, manual_pix_key, manual_pix_qr_image_url,
              story_photo_1, story_photo_2, story_photo_3,
              whatsapp_number,
              theme_color, theme_font, theme_decorations, global_passcode
            `)
            .single();

          if (createError) {
            if ((createError as any).code === "23505") {
              const { data: retryWedding, error: retryError } = await supabase
                .from("weddings")
                .select(`
                  id, slug, couple_name, wedding_date, tagline, layout,
                  section_about, section_wedding_info, section_gifts, section_rsvp,
                  section_message_wall, section_gallery, section_video, section_dress_code, section_virtual_house,
                  hero_image_url, video_url,
                  ceremony_date, ceremony_time, ceremony_location, ceremony_address,
                  reception_location, reception_address, reception_time, same_location,
                  about_text, dress_code_text, colors_to_avoid, additional_info,
                  mercado_pago_public_key,
                  payment_credit_card, payment_pix, payment_boleto, max_installments,
                  manual_pix_type, manual_pix_key, manual_pix_qr_image_url,
                  story_photo_1, story_photo_2, story_photo_3,
                  whatsapp_number,
                  theme_color, theme_font, theme_decorations, global_passcode
                `)
                .eq("user_id", user.id)
                .single();
              if (retryError) throw retryError;
              wedding = retryWedding;
            } else {
              throw createError;
            }
          } else {
            wedding = newWedding;
          }
        }

        if (wedding) {
          setWeddingSlug(wedding.slug);
          setWeddingId(wedding.id);
          
          // Update context with saved data
          updateConfig({
            coupleName: wedding.couple_name,
            weddingDate: wedding.wedding_date || "",
            tagline: wedding.tagline || "",
            layout: wedding.layout as "classic" | "modern" | "minimalist" | "editorial",
            sections: {
              about: wedding.section_about,
              weddingInfo: wedding.section_wedding_info,
              gifts: wedding.section_gifts,
              rsvp: wedding.section_rsvp,
              messageWall: wedding.section_message_wall,
              gallery: wedding.section_gallery,
              video: wedding.section_video,
              dressCode: wedding.section_dress_code,
              virtualHouse: wedding.section_virtual_house || false,
            },
            heroImage: wedding.hero_image_url || "",
            videoUrl: wedding.video_url || "",
            ceremonyDate: wedding.ceremony_date || "",
            ceremonyTime: wedding.ceremony_time || "",
            ceremonyLocation: wedding.ceremony_location || "",
            ceremonyAddress: wedding.ceremony_address || "",
            receptionLocation: wedding.reception_location || "",
            receptionAddress: wedding.reception_address || "",
            receptionTime: wedding.reception_time || "",
            sameLocation: (wedding as Record<string, unknown>).same_location as boolean || false,
            aboutText: wedding.about_text || "",
            dressCodeText: wedding.dress_code_text || "",
            colorsToAvoid: wedding.colors_to_avoid || "",
            additionalInfo: wedding.additional_info || "",
            storyPhotos: [
              (wedding as Record<string, unknown>).story_photo_1 as string,
              (wedding as Record<string, unknown>).story_photo_2 as string,
              (wedding as Record<string, unknown>).story_photo_3 as string,
            ].filter(Boolean) as string[],
            whatsappNumber: (wedding as Record<string, unknown>).whatsapp_number as string || "",
            themeColor: (wedding as any).theme_color as string || "terracotta",
            backgroundColor: (wedding as any).background_color as any || "default",
            themeFont: (wedding as any).theme_font as string || "serif",
            themeDecorations: (wedding as any).theme_decorations ?? true,
            globalPasscode: (wedding as any).global_passcode as string || "",
            mercadoPagoPublicKey: wedding.mercado_pago_public_key || "",
            paymentCreditCard: (wedding as any).payment_credit_card ?? true,
            paymentPix: (wedding as any).payment_pix ?? true,
            paymentBoleto: (wedding as any).payment_boleto ?? true,
            maxInstallments: (wedding as any).max_installments ?? 12,
            manualPixType: (wedding as any).manual_pix_type || "cpf",
            manualPixKey: (wedding as any).manual_pix_key || "",
            manualPixQrImageUrl: (wedding as any).manual_pix_qr_image_url || "",
            isLoaded: true,
          });

          // Load gifts
          const { data: gifts } = await supabase
            .from("gifts")
            .select("*")
            .eq("wedding_id", wedding.id);

          if (gifts && gifts.length > 0) {
            const formattedGifts = gifts.map(g => ({
              id: g.id,
              name: g.name,
              category: g.category,
              price: Number(g.price),
              image: g.image_url || "",
              externalLink: g.external_link || "",
              isOpenPrice: g.is_open_price || false,
              isVaquinha: g.is_vaquinha || false,
              raisedAmount: Number(g.raised_amount) || 0,
              stock: g.stock !== null && g.stock !== undefined ? Number(g.stock) : null,
              totalQuotas: g.total_quotas !== null && g.total_quotas !== undefined ? Number(g.total_quotas) : null,
            }));
            updateConfig({ gifts: formattedGifts });
          }
        }
      } catch (err) {
        console.error("Error loading wedding data:", err);
      } finally {
        loadingWeddingRef.current = false;
      }
    };

    loadWeddingData();
  }, [user, config.isLoaded]);

  const generateSlug = (coupleName: string): string => {
    return coupleName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/\s*&\s*/g, "-e-") // replace & with -e-
      .replace(/[^a-z0-9\s-]/g, "") // remove special chars
      .replace(/\s+/g, "-") // replace spaces with hyphens
      .replace(/-+/g, "-") // collapse multiple hyphens
      .replace(/^-|-$/g, "") // remove leading/trailing hyphens
      .trim();
  };

  const validateMercadoPago = async () => {
    if (!config.mercadoPagoPublicKey || !mercadoPagoAccessToken) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha a Public Key e o Access Token para validar",
        variant: "destructive",
      });
      return false;
    }

    setMpValidating(true);
    setMpValidation(null);

    try {
      const { data, error } = await supabase.functions.invoke("validate-mercadopago", {
        body: {
          accessToken: mercadoPagoAccessToken,
          publicKey: config.mercadoPagoPublicKey || "",
        },
      });

      if (error) {
        setMpValidation({ valid: false, error: error.message });
        return false;
      }

      setMpValidation(data);
      
      if (data.valid) {
        toast({
          title: "Credenciais válidas!",
          description: data.message,
        });
        return true;
      } else {
        toast({
          title: "Credenciais inválidas",
          description: data.error,
          variant: "destructive",
        });
        return false;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      setMpValidation({ valid: false, error: message });
      return false;
    } finally {
      setMpValidating(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    // Validate Mercado Pago if credentials are provided
    if (config.mercadoPagoPublicKey && mercadoPagoAccessToken) {
      const isValid = await validateMercadoPago();
      if (!isValid) {
        toast({
          title: "Credenciais do Mercado Pago inválidas",
          description: "Corrija as credenciais antes de salvar",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSaving(true);

    try {
      // Check if wedding exists
      const { data: existingWedding } = await supabase
        .from("weddings")
        .select("id, slug")
        .eq("user_id", user.id)
        .single();

      // Always regenerate slug based on couple name
      const newSlug = generateSlug(config.coupleName);
      let slug = newSlug;

      // Check for uniqueness only if it's different from current
      if (!existingWedding?.slug || existingWedding.slug !== newSlug) {
        const { data: slugCheck } = await supabase
          .from("weddings")
          .select("slug, id")
          .eq("slug", newSlug)
          .maybeSingle();

        if (slugCheck && slugCheck.id !== existingWedding?.id) {
          slug = `${newSlug}-${Date.now().toString(36)}`;
        }
      }

      const weddingData = {
        user_id: user.id,
        couple_name: config.coupleName,
        wedding_date: config.weddingDate || null,
        tagline: config.tagline || null,
        slug,
        layout: config.layout,
        section_about: config.sections.about,
        section_wedding_info: config.sections.weddingInfo,
        section_gifts: config.sections.gifts,
        section_rsvp: config.sections.rsvp,
        section_message_wall: config.sections.messageWall,
        section_gallery: config.sections.gallery,
        section_video: config.sections.video,
        section_dress_code: config.sections.dressCode,
        section_virtual_house: config.sections.virtualHouse || false,
        hero_image_url: config.heroImage || null,
        video_url: config.videoUrl || null,
        ceremony_date: config.ceremonyDate || null,
        ceremony_time: config.ceremonyTime || null,
        ceremony_location: config.ceremonyLocation || null,
        ceremony_address: config.ceremonyAddress || null,
        reception_location: config.sameLocation ? config.ceremonyLocation : (config.receptionLocation || null),
        reception_address: config.sameLocation ? config.ceremonyAddress : (config.receptionAddress || null),
        reception_time: config.receptionTime || null,
        same_location: config.sameLocation,
        about_text: config.aboutText || null,
        dress_code_text: config.dressCodeText || null,
        colors_to_avoid: config.colorsToAvoid || null,
        additional_info: config.additionalInfo || null,
        mercado_pago_public_key: config.mercadoPagoPublicKey || null,
        payment_credit_card: config.paymentCreditCard ?? true,
        payment_pix: config.paymentPix ?? true,
        payment_boleto: config.paymentBoleto ?? true,
        max_installments: config.maxInstallments ?? 12,
        manual_pix_type: config.manualPixType || "cpf",
        manual_pix_key: config.manualPixKey || null,
        manual_pix_qr_image_url: config.manualPixQrImageUrl || null,
        story_photo_1: config.storyPhotos[0] || null,
        story_photo_2: config.storyPhotos[1] || null,
        story_photo_3: config.storyPhotos[2] || null,
        whatsapp_number: config.whatsappNumber || null,
        theme_color: config.themeColor || "terracotta",
        background_color: config.backgroundColor || "default",
        theme_font: config.themeFont || "serif",
        theme_decorations: config.themeDecorations ?? true,
        global_passcode: config.globalPasscode || null,
      };

      let weddingId: string;

      if (existingWedding) {
        // Update
        const { error } = await supabase
          .from("weddings")
          .update(weddingData)
          .eq("id", existingWedding.id);

        if (error) throw error;
        weddingId = existingWedding.id;
      } else {
        // Insert
        const { data: newWedding, error } = await supabase
          .from("weddings")
          .insert(weddingData)
          .select("id")
          .single();

        if (error) throw error;
        weddingId = newWedding.id;
      }

      // Save gifts - only insert new ones and update existing ones, delete removed ones
      const currentGiftsIds = config.gifts.map(g => g.id).filter(id => id.length > 20); // valid UUIDs
      
      // Find gifts to delete (in DB but not in current config)
      const { data: dbGifts } = await supabase.from("gifts").select("id").eq("wedding_id", weddingId);
      if (dbGifts) {
        const idsToDelete = dbGifts.map(g => g.id).filter(id => !currentGiftsIds.includes(id));
        if (idsToDelete.length > 0) {
          await supabase.from("gifts").delete().in("id", idsToDelete);
        }
      }

      if (config.gifts.length > 0) {
        const giftsToUpdate = config.gifts.filter(g => g.id.length > 20).map(g => ({
          id: g.id,
          wedding_id: weddingId,
          name: g.name,
          category: g.category,
          price: g.price,
          image_url: g.image || null,
          external_link: g.externalLink || null,
          is_open_price: g.isOpenPrice || false,
          is_vaquinha: g.isVaquinha || false,
          stock: g.stock !== undefined ? g.stock : null,
          total_quotas: g.totalQuotas !== undefined ? g.totalQuotas : null,
        }));

        const giftsToInsert = config.gifts.filter(g => g.id.length <= 20).map(g => ({
          wedding_id: weddingId,
          name: g.name,
          category: g.category,
          price: g.price,
          image_url: g.image || null,
          external_link: g.externalLink || null,
          is_open_price: g.isOpenPrice || false,
          is_vaquinha: g.isVaquinha || false,
          stock: g.stock !== undefined ? g.stock : null,
          total_quotas: g.totalQuotas !== undefined ? g.totalQuotas : null,
        }));

        if (giftsToUpdate.length > 0) {
          const { error: updateGiftsError } = await supabase.from("gifts").upsert(giftsToUpdate);
          if (updateGiftsError) throw new Error("Erro ao atualizar presentes.");
        }

        if (giftsToInsert.length > 0) {
          const { error: insertGiftsError } = await supabase.from("gifts").insert(giftsToInsert);
          if (insertGiftsError) throw new Error("Erro ao inserir novos presentes.");
        }

        // Reload gifts from DB to get proper UUIDs and raised_amount
        const { data: savedGifts } = await supabase
          .from("gifts")
          .select("*")
          .eq("wedding_id", weddingId);
  
        if (savedGifts) {
          const formattedGifts = savedGifts.map(g => ({
            id: g.id,
            name: g.name,
            category: g.category,
            price: Number(g.price),
            image: g.image_url || "",
            externalLink: g.external_link || "",
            isOpenPrice: g.is_open_price || false,
            isVaquinha: g.is_vaquinha || false,
            raisedAmount: Number(g.raised_amount) || 0,
            stock: g.stock !== null && g.stock !== undefined ? Number(g.stock) : null,
            totalQuotas: g.total_quotas !== null && g.total_quotas !== undefined ? Number(g.total_quotas) : null,
          }));
          updateConfig({ gifts: formattedGifts });
        }
      }

      setWeddingSlug(slug);
      setWeddingId(weddingId);
      
      // Save MP credentials via edge function (encrypted server-side)
      if (mercadoPagoAccessToken && weddingId) {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (token) {
          const { data: credResult, error: credError } = await supabase.functions.invoke("save-mp-credentials", {
            body: {
              wedding_id: weddingId,
              access_token: mercadoPagoAccessToken,
              public_key: config.mercadoPagoPublicKey || "",
            },
          });

          if (credError) {
            console.error("Error saving credentials:", credError);
            toast({
              title: "Aviso",
              description: "Configurações salvas, mas houve um erro ao criptografar credenciais do Mercado Pago.",
              variant: "destructive",
            });
          }
        }
      }

      // Update story photos in context
      updateConfig({
        storyPhotos: [config.storyPhotos[0] || "", config.storyPhotos[1] || "", config.storyPhotos[2] || ""].filter(Boolean),
      });
      
      toast({
        title: "Salvo com sucesso!",
        description: `Seu site está disponível em: ${window.location.origin}/${slug}`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      toast({
        title: "Erro ao salvar",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNewGift = () => {
    if (newGift.name && (newGift.isOpenPrice || newGift.price > 0)) {
      addGift(newGift);
      setNewGift({ name: "", category: "Cozinha", price: 0, image: "", externalLink: "", isOpenPrice: false });
      setIsAddingGift(false);
    }
  };

  const [isScraping, setIsScraping] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    toast({
      title: "Lendo arquivo...",
      description: "Iniciando importação de presentes.",
    });

    try {
      const text = await file.text();
      // Simple CSV parser
      const lines = text.split("\n").filter(line => line.trim().length > 0);
      let importedCount = 0;

      // Ignore header if exists, or just try parsing all
      // Assuming format: Nome, Categoria, Preco, Link, Imagem
      for (const line of lines) {
        // Handle basic comma separation (does not handle quoted commas properly, keeping it simple for MVP)
        const columns = line.split(",").map(col => col.trim());
        if (columns.length >= 3) {
          const name = columns[0];
          if (name.toLowerCase() === "nome" || name.toLowerCase() === "name") continue; // Skip header

          const category = columns[1] || "Geral";
          const price = parseFloat(columns[2]) || 0;
          const externalLink = columns[3] || "";
          const image = columns[4] || "";

          if (name && price >= 0) {
            await addGift({
              name,
              category,
              price,
              externalLink,
              image,
              isOpenPrice: price === 0,
              isVaquinha: false,
            });
            importedCount++;
          }
        }
      }

      toast({
        title: "Importação Concluída!",
        description: `${importedCount} presentes importados com sucesso.`,
      });
    } catch (error) {
      toast({
        title: "Erro na importação",
        description: "Verifique o formato do arquivo CSV.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = "Nome,Categoria,Preco,Link,Imagem\nGeladeira Frost Free,Cozinha,3299.90,https://www.example.com/geladeira,https://www.example.com/geladeira.jpg\nJogo de Panelas Antiaderente,Cozinha,499.00,,\nJogo de Pratos 20 Pecas,Jantar,299.90,,";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "modelo_presentes.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: "Modelo baixado!",
      description: "Preencha a planilha e depois clique em Importar.",
    });
  };

  const handleScrapeGift = async (isEditing: boolean = false) => {
    const url = isEditing ? editingGift?.externalLink : newGift.externalLink;
    if (!url) {
      toast({
        title: "Link Obrigatório",
        description: "Por favor, preencha o link do presente primeiro.",
        variant: "destructive",
      });
      return;
    }

    setIsScraping(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch("https://mykaowlastbbtwvhgokt.supabase.co/functions/v1/scrape-gift", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        throw new Error("Falha ao buscar dados do presente.");
      }

      const data = await response.json();
      
      if (isEditing && editingGift) {
        setEditingGift({
          ...editingGift,
          name: data.title || editingGift.name,
          price: data.price || editingGift.price,
          image: data.imageUrl || editingGift.image,
        });
      } else {
        setNewGift({
          ...newGift,
          name: data.title || newGift.name,
          price: data.price || newGift.price,
          image: data.imageUrl || newGift.image,
        });
      }

      toast({
        title: "Presente Importado!",
        description: "Os dados foram preenchidos com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro na importação",
        description: "Não foi possível extrair os dados. Por favor, preencha manualmente.",
        variant: "destructive",
      });
    } finally {
      setIsScraping(false);
    }
  };

  const handleUpdateGift = () => {
    if (editingGift) {
      updateGift(editingGift.id, editingGift);
      setEditingGift(null);
    }
  };

  const copyLink = () => {
    if (weddingSlug) {
      navigator.clipboard.writeText(`${window.location.origin}/${weddingSlug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLogout = async () => {
    sessionStorage.removeItem("dashboard_initial_loaded");
    await signOut();
    navigate("/");
  };

  const handleSameLocationChange = (checked: boolean) => {
    updateConfig({ sameLocation: checked });
    if (checked) {
      updateConfig({
        receptionLocation: config.ceremonyLocation,
        receptionAddress: config.ceremonyAddress,
      });
    }
  };

  const publicUrl = weddingSlug ? `${window.location.origin}/${weddingSlug}` : null;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gold/10 rounded-lg">
                <Settings className="w-6 h-6 text-gold" />
              </div>
              <div>
                <h1 className="font-serif text-2xl text-foreground">Painel do Casal</h1>
                <p className="text-sm text-muted-foreground">Configure seu site de casamento</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                variant="outline"
                onClick={() => navigate("/preview")}
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </Button>
              <Button 
                onClick={handleSave}
                disabled={isSaving}
                className="bg-gold hover:bg-gold-light text-background"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar e Publicar
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            <button
              onClick={() => setDashboardTab("history")}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                dashboardTab === "history"
                  ? "border-gold text-gold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Painel Geral
            </button>
            <button
              onClick={() => setDashboardTab("settings")}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                dashboardTab === "settings"
                  ? "border-gold text-gold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Settings className="w-4 h-4" />
              Configurar Site
            </button>
            <button
              onClick={() => setDashboardTab("guests")}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                dashboardTab === "guests"
                  ? "border-gold text-gold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="w-4 h-4" />
              Convidados
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {dashboardTab === "history" ? (
          <DashboardHistory />
        ) : dashboardTab === "guests" ? (
          <DashboardGuests weddingId={weddingId} weddingSlug={weddingSlug} />
        ) : (
        <>
        {/* Published URL */}
        {publicUrl && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gold/10 rounded-xl p-6 border border-gold/20 space-y-6"
          >
            <div>
              <h3 className="font-serif text-lg text-gold font-medium mb-1">Compartilhar Site de Casamento</h3>
              <p className="text-sm text-muted-foreground">Copie e compartilhe os links corretos dependendo de quem irá acessar.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Public Link Card */}
              <div className="p-4 bg-background/50 rounded-lg border border-border flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded">Público</span>
                    <h4 className="font-medium text-foreground text-sm">Link Geral (Para Todos)</h4>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Ideal para colocar na bio do Instagram ou redes sociais. Exibe apenas a história do casal, fotos e a lista de presentes (oculta local e RSVP).
                  </p>
                  <p className="text-sm font-mono bg-muted/80 p-2 rounded border border-border select-all truncate">{publicUrl}</p>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="w-full" onClick={copyPublicLink}>
                    {copiedPublic ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />}
                    {copiedPublic ? "Copiado!" : "Copiar Link"}
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              </div>

              {/* Guest Link Card */}
              <div className="p-4 bg-background/50 rounded-lg border border-border flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 text-xs font-semibold bg-gold/20 text-gold rounded">Convidados</span>
                    <h4 className="font-medium text-foreground text-sm">Link do Convite (Para Convidados)</h4>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Compartilhe privadamente via WhatsApp ou no convite oficial. Exibe o local, horário da cerimônia, dress code, RSVP e mural de recados.
                  </p>
                  <p className="text-sm font-mono bg-muted/80 p-2 rounded border border-border select-all truncate">{`${publicUrl}/convite`}</p>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="w-full" onClick={copyGuestLink}>
                    {copiedGuest ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />}
                    {copiedGuest ? "Copiado!" : "Copiar Link"}
                  </Button>
                  <Button size="sm" className="bg-gold hover:bg-gold-light text-background" asChild>
                    <a href={`${publicUrl}/convite`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </motion.section>
        )}
        {/* Sub-tabs for Settings */}
        <div className="flex gap-2 border-b border-border overflow-x-auto pb-1 mb-6">
          {[
            { key: "appearance" as const, label: "Aparência & Seções", icon: Palette },
            { key: "story" as const, label: "Nossa História", icon: Heart },
            { key: "event" as const, label: "Evento & Estilo", icon: MapPin },
            { key: "gifts" as const, label: "Presentes & Pix", icon: Gift },
            { key: "virtualHouse" as const, label: "Casa Virtual", icon: Home },
            { key: "gallery" as const, label: "Galeria de Fotos", icon: Camera },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSettingsSubTab(key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                settingsSubTab === key
                  ? "border-gold text-gold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {settingsSubTab === "appearance" && (
          <div className="grid lg:grid-cols-12 gap-8 items-start animate-fade-in">
            {/* Left Column: Controls */}
            <div className="lg:col-span-7 space-y-8">
              {/* Section 1: Couple Info */}
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card rounded-xl p-6 shadow-soft border border-border"
              >
                <div className="flex items-center gap-3 mb-6">
                  <Heart className="w-5 h-5 text-gold" />
                  <h2 className="font-serif text-xl text-foreground">Informações do Casal</h2>
                </div>
                
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="coupleName">Nome do Casal *</Label>
                    <Input
                      id="coupleName"
                      value={config.coupleName}
                      onChange={(e) => updateConfig({ coupleName: e.target.value })}
                      placeholder="Ex: Maria & João"
                      className="bg-background"
                    />
                    <p className="text-xs text-muted-foreground">
                      Será usado na URL: /{generateSlug(config.coupleName) || "nome-do-casal"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weddingDate">Data do Casamento</Label>
                    <Input
                      id="weddingDate"
                      type="date"
                      value={config.weddingDate}
                      onChange={(e) => updateConfig({ weddingDate: e.target.value })}
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                    <Label htmlFor="tagline">Frase de Destaque</Label>
                    <Input
                      id="tagline"
                      value={config.tagline}
                      onChange={(e) => updateConfig({ tagline: e.target.value })}
                      placeholder="Uma frase especial..."
                      className="bg-background"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                    <Label htmlFor="whatsappNumber">WhatsApp para Contato/Dúvidas (Opcional)</Label>
                    <Input
                      id="whatsappNumber"
                      value={config.whatsappNumber || ""}
                      onChange={(e) => {
                        updateConfig({ whatsappNumber: e.target.value });
                      }}
                      placeholder="Ex: 11999999999"
                      className="bg-background"
                    />
                  </div>
                </div>
              </motion.section>

              {/* Section 2: Layout Selection */}
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-card rounded-xl p-6 shadow-soft border border-border"
              >
                <div className="flex items-center gap-3 mb-6">
                  <Image className="w-5 h-5 text-gold" />
                  <h2 className="font-serif text-xl text-foreground">Escolha do Layout</h2>
                </div>
                
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {layoutOptions.map((layout) => (
                    <button
                      key={layout.id}
                      onClick={() => {
                        const updates: Partial<typeof config> = { layout: layout.id };
                        if (layout.id === "modern") {
                          updates.themeFont = "sans";
                          updates.themeColor = "navy";
                        } else if (layout.id === "minimalist") {
                          updates.themeFont = "sans";
                          updates.themeColor = "blue";
                        } else if (layout.id === "classic") {
                          updates.themeFont = "serif";
                          updates.themeColor = "terracotta";
                        } else if (layout.id === "editorial") {
                          updates.themeFont = "serif";
                          updates.themeColor = "terracotta";
                        } else if (layout.id === "magazine") {
                          updates.themeFont = "serif";
                          updates.themeColor = "navy";
                        } else if (layout.id === "romantic") {
                          updates.themeFont = "elegant";
                          updates.themeColor = "rose";
                        }
                        updateConfig(updates);
                      }}
                      className={`p-4 rounded-xl border-2 transition-all text-left ${
                        config.layout === layout.id
                          ? "border-gold bg-gold/5"
                          : "border-border hover:border-gold/50"
                      }`}
                    >
                      {layout.id === "classic" && (
                        <div className="h-28 rounded-lg mb-3 bg-[#FAF8F5] border border-[#EBE6DD] flex flex-col items-center justify-between p-3 relative overflow-hidden font-serif select-none">
                          <div className="absolute inset-1 border border-[#D4AF37]/20 rounded pointer-events-none" />
                          <div className="flex justify-between w-full text-[6px] text-[#8C7A6B] font-sans px-1 tracking-wider uppercase opacity-80">
                            <span>Home</span>
                            <span>História</span>
                            <span>Presentes</span>
                          </div>
                          <div className="flex flex-col items-center justify-center my-auto">
                            <span className="text-[11px] font-bold text-[#B38F4D] tracking-widest leading-none mb-0.5">M & J</span>
                            <span className="text-[5px] text-[#8C7A6B] font-sans italic opacity-75">15 de Agosto de 2025</span>
                            <div className="w-8 h-[0.5px] bg-[#D4AF37] my-1 opacity-60" />
                            <span className="text-[4px] text-[#8C7A6B] font-sans tracking-wide">SALVEM A DATA</span>
                          </div>
                          <div className="flex gap-1 justify-center items-center w-full">
                            <div className="w-1 h-1 rounded-full bg-[#D4AF37]/40" />
                            <div className="w-[3px] h-[3px] rounded-full bg-[#D4AF37]/30" />
                            <div className="w-1 h-1 rounded-full bg-[#D4AF37]/40" />
                          </div>
                        </div>
                      )}

                      {layout.id === "modern" && (
                        <div className="h-28 rounded-lg mb-3 bg-[#F1F3F5] border border-[#E2E8F0] flex flex-col justify-between p-3 relative overflow-hidden font-sans select-none">
                          <div className="flex justify-between items-center w-full text-[6px] text-[#475569] font-medium border-b border-[#E2E8F0] pb-1 px-1">
                            <span className="font-bold text-primary">m+j</span>
                            <div className="flex gap-2 text-[4px] opacity-75">
                              <span>Gifts</span>
                              <span className="bg-primary text-white px-1 py-0.5 rounded-full">RSVP</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 my-auto items-center">
                            <div className="flex flex-col text-left">
                              <span className="text-[8px] font-bold text-[#1E293B] leading-none mb-0.5">Maria + João</span>
                              <span className="text-[4px] text-[#64748B] font-semibold tracking-wider uppercase mb-1">15.08.2025</span>
                              <div className="h-2.5 w-10 bg-primary rounded-sm flex items-center justify-center">
                                <span className="text-[4px] text-white font-bold">Confirmar</span>
                              </div>
                            </div>
                            <div className="w-full h-8 bg-[#CBD5E1] rounded-md relative overflow-hidden flex items-center justify-center">
                              <div className="w-4 h-4 rounded-full bg-[#94A3B8]/40" />
                            </div>
                          </div>
                        </div>
                      )}

                      {layout.id === "minimalist" && (
                        <div className="h-28 rounded-lg mb-3 bg-white border border-[#E5E7EB] flex flex-col justify-between p-3 relative overflow-hidden font-light select-none tracking-wide text-neutral-800">
                          <div className="flex justify-start gap-3 w-full text-[5px] text-neutral-400 font-sans tracking-widest uppercase">
                            <span>M | J</span>
                            <span className="ml-auto">Info</span>
                            <span>RSVP</span>
                          </div>
                          <div className="flex flex-col items-start text-left my-auto font-serif pl-1">
                            <span className="text-[9px] font-light tracking-tight text-neutral-900 leading-none mb-1">
                              Maria <span className="font-sans text-[7px] font-thin text-neutral-400">|</span> João
                            </span>
                            <span className="text-[4px] font-sans tracking-widest text-neutral-400 uppercase">AUGUST 15, 2025</span>
                          </div>
                          <div className="border-t border-[#F3F4F6] pt-1 flex justify-between items-center w-full">
                            <span className="text-[4px] text-neutral-400 tracking-wider">#MARIAEJOAO</span>
                            <span className="text-[4px] font-sans uppercase tracking-widest text-neutral-900 border-b border-neutral-900 pb-0.5 font-medium">VER DETALHES</span>
                          </div>
                        </div>
                      )}

                      {layout.id === "editorial" && (
                        <div className="h-28 rounded-lg mb-3 bg-white border border-border flex flex-col relative overflow-hidden font-serif select-none">
                          <div className="h-1/2 w-full bg-slate-200 relative overflow-hidden">
                            <div className="absolute inset-0 bg-black/10" />
                            <div className="absolute bottom-1 right-1 w-3 h-3 border border-white/50 rounded-full flex items-center justify-center">
                              <div className="w-1.5 h-1.5 bg-white/70 rounded-full" />
                            </div>
                          </div>
                          <div className="h-1/2 w-full flex flex-col items-center justify-center bg-white p-2">
                            <span className="text-[4px] font-sans tracking-widest uppercase text-muted-foreground mb-1">Vamos nos casar</span>
                            <span className="text-[10px] font-normal tracking-tight text-primary leading-none">M & J</span>
                            <span className="text-[4px] font-sans mt-1 bg-primary text-white px-1.5 py-0.5 rounded-sm uppercase tracking-wider">RSVP</span>
                          </div>
                        </div>
                      )}

                      {layout.id === "magazine" && (
                        <div className="h-28 rounded-lg mb-3 bg-white border border-border flex relative overflow-hidden font-serif select-none">
                          <div className="w-2/5 h-full bg-slate-300 relative overflow-hidden">
                            <div className="absolute inset-0 bg-black/5" />
                          </div>
                          <div className="w-3/5 h-full flex flex-col justify-between p-2 bg-[#FAF9F6]">
                            <span className="text-[3px] font-sans tracking-[0.2em] uppercase text-muted-foreground">CASAMENTO</span>
                            <div className="flex flex-col text-left py-1">
                              <span className="text-[7px] font-serif font-bold text-neutral-800 leading-none mb-0.5">Maria &</span>
                              <span className="text-[7px] font-serif font-bold text-neutral-800 leading-none">João</span>
                              <span className="text-[3px] text-muted-foreground font-sans mt-0.5 uppercase tracking-widest">15 . 08 . 2025</span>
                            </div>
                            <div className="w-full h-2.5 bg-neutral-900 rounded-sm flex items-center justify-center">
                              <span className="text-[3px] text-white font-sans uppercase tracking-wider">Ver Convite</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {layout.id === "romantic" && (
                        <div className="h-28 rounded-lg mb-3 bg-[#FCF8F8] border border-rose-100 flex flex-col justify-between p-3 relative overflow-hidden select-none font-serif text-center">
                          <div className="absolute inset-1 border border-rose-200/50 rounded pointer-events-none" />
                          <div className="absolute inset-1.5 border border-dashed border-rose-200/30 rounded pointer-events-none" />
                          <span className="text-[4px] font-sans text-rose-400 uppercase tracking-widest leading-none">Save our Date</span>
                          <div className="flex flex-col items-center justify-center my-auto">
                            <span className="text-[12px] font-serif italic text-rose-700 leading-none">M & J</span>
                            <div className="flex items-center justify-center text-rose-300 gap-0.5 my-0.5">
                              <Heart className="w-1.5 h-1.5 fill-rose-300 text-rose-300" />
                            </div>
                            <span className="text-[4px] font-sans text-rose-500 uppercase tracking-wider">15 de Agosto de 2025</span>
                          </div>
                          <div className="flex justify-center">
                            <div className="h-2.5 px-3 bg-rose-600 text-white rounded-full flex items-center justify-center text-[3px] uppercase tracking-wider font-sans">
                              Confirmar
                            </div>
                          </div>
                        </div>
                      )}

                      <h3 className="font-medium text-foreground">{layout.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{layout.description}</p>
                    </button>
                  ))}
                </div>
              </motion.section>

              {/* Section 1.5: Identidade Visual em Tempo Real */}
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="bg-card rounded-xl p-6 shadow-soft border border-border"
              >
                <div className="flex items-center gap-3 mb-6">
                  <Palette className="w-5 h-5 text-gold" />
                  <h2 className="font-serif text-xl text-foreground">Identidade Visual Rápida</h2>
                </div>
                
                <div className="space-y-6">
                  {/* Color Palette Selector */}
                  <div>
                    <Label className="text-sm font-medium block mb-3">Paleta de Cores Curada</Label>
                    <div className="flex flex-wrap gap-4">
                      {[
                        { id: "terracotta", name: "Terracotta", color: "bg-[#C2593F]" },
                        { id: "sage", name: "Sage Green", color: "bg-[#5E7A60]" },
                        { id: "rose", name: "Dusty Rose", color: "bg-[#B86F7D]" },
                        { id: "blue", name: "Slate Blue", color: "bg-[#5D7F9B]" },
                        { id: "gold", name: "Champagne Gold", color: "bg-[#A68A5E]" },
                        { id: "lavender", name: "Lavender", color: "bg-[#9b7bbf]" },
                        { id: "emerald", name: "Emerald", color: "bg-[#2e6b4d]" },
                        { id: "navy", name: "Midnight Navy", color: "bg-[#1a2f4c]" },
                      ].map((palette) => (
                        <button
                          key={palette.id}
                          type="button"
                          onClick={() => updateConfig({ themeColor: palette.id })}
                          className={`flex items-center gap-2 px-3 py-2 rounded-full border-2 transition-all text-xs font-medium ${
                            config.themeColor === palette.id
                              ? "border-primary bg-primary/5 text-primary shadow-sm"
                              : "border-border hover:border-muted-foreground/30 text-muted-foreground bg-background"
                          }`}
                        >
                          <span className={`w-4 h-4 rounded-full ${palette.color} block shadow-inner`} />
                          {palette.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Background Selector */}
                  <div>
                    <Label className="text-sm font-medium block mb-3">Cor de Fundo</Label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: "default", name: "Padrão do Layout", color: "bg-background border-border" },
                        { id: "light", name: "Claro (Branco)", color: "bg-white border-gray-200" },
                        { id: "sand", name: "Areia", color: "bg-[#F5F0E6] border-[#E6D9C3]" },
                        { id: "dark", name: "Escuro", color: "bg-zinc-900 border-zinc-700 text-white" },
                      ].map((bg) => (
                        <button
                          key={bg.id}
                          type="button"
                          onClick={() => updateConfig({ backgroundColor: bg.id as any })}
                          className={`flex items-center gap-2 px-3 py-2 rounded-full border-2 transition-all text-xs font-medium ${
                            (config.backgroundColor || "default") === bg.id
                              ? "border-primary shadow-sm ring-1 ring-primary/20"
                              : "border-transparent hover:border-border/50 hover:bg-accent/50"
                          } ${bg.id === 'dark' && config.backgroundColor !== 'dark' ? 'text-zinc-900' : ''}`}
                        >
                          <span className={`w-4 h-4 rounded-full border ${bg.color} block shadow-inner`} />
                          {bg.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Typography Selector */}
                  <div>
                    <Label className="text-sm font-medium block mb-3">Combinação Tipográfica</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { id: "serif", title: "Aa", subtitle: "Serifada Clássica", fontClass: "font-serif" },
                        { id: "sans", title: "Aa", subtitle: "Moderna Limpa", fontClass: "font-sans font-bold" },
                        { id: "elegant", title: "Aa", subtitle: "Caligráfica Delicada", fontClass: "font-serif italic" },
                      ].map((fontOption) => (
                        <button
                          key={fontOption.id}
                          type="button"
                          onClick={() => updateConfig({ themeFont: fontOption.id })}
                          className={`p-4 rounded-xl border-2 transition-all text-left flex flex-col justify-between ${
                            config.themeFont === fontOption.id
                              ? "border-primary bg-primary/5 shadow-sm"
                              : "border-border hover:border-muted-foreground/30 bg-background"
                          }`}
                        >
                          <span className={`text-2xl mb-1 text-foreground ${fontOption.fontClass}`}>
                            {fontOption.id === "elegant" ? "Aa" : fontOption.title}
                          </span>
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mt-2">
                            {fontOption.subtitle}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Decorative Elements Switch */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border mt-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Wand2 className="w-4 h-4 text-gold" />
                        Elementos Decorativos Florais
                      </Label>
                      <p className="text-xs text-muted-foreground leading-normal">
                        Exibe ilustrações delicadas de folhagens e ramos botânicos no site.
                      </p>
                    </div>
                    <Switch
                      checked={config.themeDecorations ?? true}
                      onCheckedChange={(checked) => updateConfig({ themeDecorations: checked })}
                    />
                  </div>
                </div>
              </motion.section>

              {/* Section 3: Toggle Sections */}
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-card rounded-xl p-6 shadow-soft border border-border"
              >
                <div className="flex items-center gap-3 mb-6">
                  <Settings className="w-5 h-5 text-gold" />
                  <h2 className="font-serif text-xl text-foreground">Seções do Site</h2>
                </div>
                
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {sectionOptions.map(({ key, label, icon: Icon }) => (
                    <div
                      key={key}
                      className="flex flex-col justify-between p-5 rounded-xl bg-muted/40 border border-border/80 hover:border-gold/30 hover:bg-muted/60 transition-all duration-300 min-h-[7.5rem] h-full shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <Icon className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                        <button
                          type="button"
                          onClick={() => toggleSection(key)}
                          className="text-sm font-semibold text-foreground leading-normal text-left hover:text-gold transition-colors focus:outline-none"
                        >
                          {label}
                        </button>
                      </div>
                      <div className="flex justify-end pt-3 mt-4 border-t border-border/40">
                        <Switch
                          checked={config.sections[key]}
                          onCheckedChange={() => toggleSection(key)}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* UX Tip Banner */}
                <div className="mt-6 flex gap-3 p-4 bg-gold/5 rounded-lg border border-gold/20 text-sm text-gold items-start">
                  <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-gold" />
                  <div>
                    <p className="font-semibold mb-1">Dica de UX</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Ao desativar uma seção acima, o painel de configurações correspondente ficará oculto temporariamente para simplificar sua navegação. Não se preocupe: você pode reativar qualquer seção a qualquer momento sem perder os dados já preenchidos!
                    </p>
                  </div>
                </div>
              </motion.section>

              {/* Section 4: Media with dimensions */}
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-card rounded-xl p-6 shadow-soft border border-border"
              >
                <div className="flex items-center gap-3 mb-6">
                  <Camera className="w-5 h-5 text-gold" />
                  <h2 className="font-serif text-xl text-foreground">Mídia (Opcional)</h2>
                </div>
                
                <div className={`grid gap-6 ${config.sections.video ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="heroImage">Foto Principal (Hero)</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="w-4 h-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="font-medium mb-1">Dimensões recomendadas:</p>
                          <p className="text-sm">1920 x 1080 pixels (16:9)</p>
                          <p className="text-sm text-muted-foreground mt-1">A imagem será recortada automaticamente para 16:9.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <HeroImageUploader 
                      weddingId={weddingId}
                      value={config.heroImage}
                      onChange={(url) => updateConfig({ heroImage: url })}
                    />
                  </div>
                  {config.sections.video && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="videoUrl">Link do Vídeo (YouTube/Vimeo)</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="w-4 h-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="font-medium mb-1">Formatos aceitos:</p>
                            <p className="text-sm">youtube.com/watch?v=...</p>
                            <p className="text-sm">vimeo.com/...</p>
                            <p className="text-sm text-muted-foreground mt-1">Proporção 16:9 recomendada</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        id="videoUrl"
                        value={config.videoUrl}
                        onChange={(e) => updateConfig({ videoUrl: e.target.value })}
                        placeholder="https://youtube.com/watch?v=..."
                        className="bg-background"
                      />
                      <p className="text-xs text-muted-foreground">
                        🎬 Proporção recomendada: 16:9
                      </p>
                    </div>
                  )}
                </div>

                {/* Gallery dimensions note */}
                {(config.sections.about || config.sections.gallery || config.sections.gifts) && (
                  <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-border">
                    <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                      <Camera className="w-4 h-4 text-gold" />
                      Dimensões Recomendadas
                    </h4>
                    <div className="grid sm:grid-cols-3 gap-4 text-sm text-muted-foreground">
                      {config.sections.about && (
                        <div>
                          <p className="font-medium text-foreground">Fotos da História</p>
                          <p>800 x 600px (4:3)</p>
                        </div>
                      )}
                      {config.sections.gallery && (
                        <div>
                          <p className="font-medium text-foreground">Galeria Geral</p>
                          <p>800 x 800px (1:1) ou 800 x 600px</p>
                        </div>
                      )}
                      {config.sections.gifts && (
                        <div>
                          <p className="font-medium text-foreground">Imagem de Presente</p>
                          <p>400 h 400px (1:1)</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.section>
            </div>

            {/* Right Column: Simulated Mobile Frame Preview */}
            <div className="lg:col-span-5 lg:sticky lg:top-8 flex flex-col items-center justify-center space-y-4">
              <div className="text-center">
                <span className="text-xs font-semibold text-primary uppercase tracking-widest">Prévia em Tempo Real</span>
                <h3 className="font-serif text-lg text-foreground mt-1">Como os convidados verão</h3>
              </div>

              <div className="relative w-full max-w-[280px] aspect-[9/18.5] bg-neutral-900 rounded-[38px] p-2.5 shadow-elevated border-[5px] border-neutral-800 ring-1 ring-neutral-700/50 overflow-hidden flex flex-col">
                {/* Notch / Dynamic Island */}
                <div className="absolute top-3.5 left-1/2 -translate-x-1/2 w-20 h-4 bg-black rounded-full z-30 flex items-center justify-between px-2 text-[8px] text-white">
                  <div className="w-1.5 h-1.5 rounded-full bg-neutral-800" />
                  <div className="w-1 h-1 rounded-full bg-green-500/80" />
                </div>
                
                {/* Simulated Viewport Screen */}
                <div 
                  className="w-full h-full rounded-[30px] bg-background border border-neutral-800 overflow-hidden relative flex flex-col justify-between py-6 px-4 select-none animate-fade-in"
                  data-theme-color={config.themeColor || "terracotta"}
                  data-bg={config.backgroundColor || "default"}
                  data-theme-font={config.themeFont || "serif"}
                  data-layout={config.layout || "classic"}
                >
                  {/* Top Bar Sim */}
                  <div className="flex justify-between items-center w-full text-[5px] text-muted-foreground font-semibold tracking-widest uppercase mb-2">
                    <span>{config.coupleName ? config.coupleName.split("&")[0].trim()[0] + " | " + (config.coupleName.split("&")[1] || "").trim()[0] : "C | R"}</span>
                    <span>RSVP</span>
                  </div>

                  {/* Main Wedding Card Mockup */}
                  {(!config.layout || config.layout === "classic") && (
                    <div className="my-auto flex flex-col items-center text-center space-y-4">
                      {/* Leaf Decoration SVG */}
                      {config.themeDecorations !== false && (
                        <div className="w-10 h-10 text-primary flex items-center justify-center opacity-80 animate-fade-in">
                          <svg className="w-full h-full" viewBox="0 0 100 100" fill="currentColor">
                            <path d="M50 15 C45 35, 25 35, 10 40 C30 45, 45 40, 50 15 Z" />
                            <path d="M50 15 C55 35, 75 35, 90 40 C70 45, 55 40, 50 15 Z" />
                            <path d="M50 15 C50 45, 50 70, 50 85" stroke="currentColor" strokeWidth="1.5" fill="none" />
                            <path d="M50 40 C35 50, 30 65, 20 70 C35 68, 45 60, 50 40 Z" />
                            <path d="M50 50 C65 60, 70 75, 80 80 C65 78, 55 70, 50 50 Z" />
                          </svg>
                        </div>
                      )}

                      <div className="space-y-1">
                        <p className="text-[6px] tracking-[0.25em] uppercase text-muted-foreground font-medium">
                          Salvem a Data
                        </p>
                        <h2 className="font-serif text-lg text-foreground font-medium leading-tight">
                          {config.coupleName || "Camila & Rafael"}
                        </h2>
                      </div>

                      <div className="w-10 h-[0.5px] bg-primary/40" />

                      <p className="text-[6px] uppercase tracking-wider text-primary font-semibold">
                        {config.weddingDate ? (() => {
                          const [year, month, day] = config.weddingDate.split('-').map(Number);
                          const date = new Date(year, month - 1, day);
                          return date.toLocaleDateString("pt-BR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          });
                        })() : "15 de Agosto de 2025"}
                      </p>

                      {/* Countdown Mockup */}
                      <div className="grid grid-cols-4 gap-1.5 w-full max-w-[200px] mt-2">
                        {[
                          { value: "60", label: "Dias" },
                          { value: "08", label: "Horas" },
                          { value: "12", label: "Min" },
                          { value: "54", label: "Seg" }
                        ].map((item) => (
                          <div key={item.label} className="bg-primary/5 rounded-md p-1.5 border border-primary/10 flex flex-col items-center justify-center">
                            <span className="text-[10px] font-serif text-primary font-bold leading-none">{item.value}</span>
                            <span className="text-[4px] uppercase tracking-wider text-muted-foreground mt-1">{item.label}</span>
                          </div>
                        ))}
                      </div>

                      {/* Welcome card details */}
                      <p className="text-[6px] text-muted-foreground max-w-[180px] leading-normal font-sans pt-1">
                        Criamos este site para compartilhar com vocês os detalhes da organização do nosso casamento. Estamos muito felizes!
                      </p>

                      {/* CTA Button Sim */}
                      <div className="w-full max-w-[180px] pt-1">
                        <div className="w-full bg-primary text-primary-foreground py-1.5 rounded-md text-[5px] uppercase tracking-widest font-bold flex items-center justify-center shadow-soft">
                          Confirmar Presença
                        </div>
                      </div>
                    </div>
                  )}

                  {config.layout === "modern" && (
                    <div className="my-auto flex flex-col items-start text-left space-y-4 px-2">
                      <div className="w-full flex justify-between items-end mb-2">
                        <h2 className="font-serif text-xl text-foreground font-bold leading-none w-2/3">
                          {config.coupleName ? (
                            <>
                              {config.coupleName.split('&')[0].trim()} <br />
                              <span className="text-primary">+</span> {config.coupleName.split('&')[1]?.trim() || ''}
                            </>
                          ) : (
                            <>Camila <br/><span className="text-primary">+</span> Rafael</>
                          )}
                        </h2>
                        <div className="text-right">
                           <p className="text-[6px] tracking-widest uppercase text-muted-foreground font-semibold mb-1">
                            {config.weddingDate ? config.weddingDate.split('-').reverse().join('.') : "15.08.2025"}
                          </p>
                        </div>
                      </div>
                      
                      <div className="w-full h-24 bg-neutral-200 rounded-lg relative overflow-hidden">
                        <div className="absolute inset-0 bg-black/5" />
                      </div>

                      <div className="w-full flex gap-2">
                        <div className="flex-1 bg-primary text-primary-foreground py-2 rounded-md text-[6px] uppercase tracking-widest font-bold flex items-center justify-center shadow-soft">
                          RSVP
                        </div>
                        <div className="flex-1 bg-white border border-border text-foreground py-2 rounded-md text-[6px] uppercase tracking-widest font-bold flex items-center justify-center">
                          Presentes
                        </div>
                      </div>
                    </div>
                  )}

                  {config.layout === "minimalist" && (
                    <div className="my-auto flex flex-col items-start text-left space-y-6 px-2">
                      <div className="space-y-2">
                        {config.themeDecorations !== false && (
                          <div className="w-6 h-6 text-foreground flex items-center justify-start opacity-60 mb-2">
                            <svg className="w-full h-full" viewBox="0 0 100 100" fill="currentColor">
                              <path d="M50 15 C45 35, 25 35, 10 40 C30 45, 45 40, 50 15 Z" />
                              <path d="M50 15 C55 35, 75 35, 90 40 C70 45, 55 40, 50 15 Z" />
                              <path d="M50 15 C50 45, 50 70, 50 85" stroke="currentColor" strokeWidth="1.5" fill="none" />
                            </svg>
                          </div>
                        )}
                        <p className="text-[5px] tracking-[0.3em] uppercase text-muted-foreground">
                          {config.weddingDate ? (() => {
                            const [year, month, day] = config.weddingDate.split('-').map(Number);
                            const date = new Date(year, month - 1, day);
                            return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase();
                          })() : "AUGUST 15, 2025"}
                        </p>
                        <h2 className="font-serif text-2xl text-foreground font-light leading-tight tracking-tight">
                          {config.coupleName ? (
                            <>
                              {config.coupleName.split('&')[0].trim()}
                              <span className="font-sans text-[12px] text-muted-foreground mx-1 font-thin">|</span>
                              {config.coupleName.split('&')[1]?.trim() || ''}
                            </>
                          ) : (
                            <>Camila <span className="font-sans text-[12px] text-muted-foreground mx-1 font-thin">|</span> Rafael</>
                          )}
                        </h2>
                      </div>
                      
                      <p className="text-[7px] text-foreground font-light max-w-[160px] leading-relaxed">
                        We invite you to celebrate our wedding.
                      </p>

                      <div className="w-full border-t border-border pt-4 mt-4 flex justify-between items-center">
                        <span className="text-[5px] tracking-widest text-muted-foreground">#CAMILARAFA</span>
                        <span className="text-[5px] uppercase tracking-[0.2em] font-medium border-b border-foreground pb-0.5">VER DETALHES</span>
                      </div>
                    </div>
                  )}

                  {config.layout === "editorial" && (
                    <div className="absolute inset-0 flex flex-col font-serif bg-white pointer-events-none">
                      <div className="h-[55%] w-full bg-neutral-200 relative overflow-hidden">
                        <div className="absolute inset-0 bg-black/10" />
                        <div className="absolute top-4 left-4 right-4 flex justify-between items-center text-[5px] text-white font-sans uppercase tracking-widest opacity-80">
                          <span>{config.coupleName ? config.coupleName.split('&')[0].trim()[0] + ' | ' + (config.coupleName.split('&')[1] || '').trim()[0] : 'C | R'}</span>
                          <span>RSVP</span>
                        </div>
                      </div>
                      <div className="h-[45%] w-full flex flex-col items-center justify-center p-6 text-center space-y-3 z-10 bg-background">
                        <p className="text-[5px] font-sans tracking-[0.2em] uppercase text-muted-foreground">
                          Vamos nos casar
                        </p>
                        <h2 className="font-serif text-2xl text-primary font-normal leading-none tracking-tight">
                          {config.coupleName ? config.coupleName.replace(' & ', ' e ') : 'Camila e Rafael'}
                        </h2>
                        <div className="mt-2">
                          <div className="bg-primary text-white px-4 py-1.5 rounded-sm text-[5px] uppercase tracking-widest font-sans">
                            RSVP
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {config.layout === "magazine" && (
                    <div className="absolute inset-0 flex font-serif bg-[#FAF9F6] pointer-events-none select-none">
                      <div className="w-[42%] h-full bg-neutral-200 relative overflow-hidden">
                        <div className="absolute inset-0 bg-black/5" />
                        <div className="absolute bottom-2 left-2 text-[4px] text-white font-sans uppercase tracking-widest opacity-80">
                          {config.coupleName ? config.coupleName.split('&')[0].trim()[0] + ' & ' + (config.coupleName.split('&')[1] || '').trim()[0] : 'C & R'}
                        </div>
                      </div>
                      <div className="w-[58%] h-full flex flex-col justify-between p-4 pl-3">
                        <span className="text-[4px] font-sans tracking-[0.25em] uppercase text-muted-foreground leading-none">Wedding Day</span>
                        
                        {config.themeDecorations !== false && (
                          <div className="w-8 h-8 text-primary flex items-center justify-start opacity-80 mb-2">
                            <svg className="w-full h-full" viewBox="0 0 100 100" fill="currentColor">
                              <path d="M50 15 C45 35, 25 35, 10 40 C30 45, 45 40, 50 15 Z" />
                              <path d="M50 15 C55 35, 75 35, 90 40 C70 45, 55 40, 50 15 Z" />
                              <path d="M50 15 C50 45, 50 70, 50 85" stroke="currentColor" strokeWidth="1.5" fill="none" />
                              <path d="M50 40 C35 50, 30 65, 20 70 C35 68, 45 60, 50 40 Z" />
                              <path d="M50 50 C65 60, 70 75, 80 80 C65 78, 55 70, 50 50 Z" />
                            </svg>
                          </div>
                        )}
                        
                        <div className="my-auto py-2 text-left">
                          <h2 className="text-sm font-bold text-neutral-800 font-serif leading-none tracking-tight">
                            {config.coupleName ? config.coupleName.split('&')[0].trim() : "Camila"}
                          </h2>
                          <span className="text-[8px] font-sans text-primary font-light block my-0.5">&</span>
                          <h2 className="text-sm font-bold text-neutral-800 font-serif leading-none tracking-tight">
                            {config.coupleName ? (config.coupleName.split('&')[1] || "").trim() : "Rafael"}
                          </h2>
                          <p className="text-[4px] font-sans text-muted-foreground uppercase tracking-widest mt-1.5">
                            {config.weddingDate ? config.weddingDate.split('-').reverse().join(' . ') : "15.08.2025"}
                          </p>
                        </div>
                        <div className="w-full">
                          <div className="bg-neutral-900 text-white py-1 text-center rounded-sm text-[4px] uppercase tracking-widest font-sans font-bold">
                            Ver Convite
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {config.layout === "romantic" && (
                    <div className="absolute inset-0 flex flex-col justify-between p-4 bg-[#FCF8F8] border border-rose-100 pointer-events-none select-none text-center">
                      <div className="absolute inset-1.5 border border-rose-200/40 rounded pointer-events-none" />
                      <div className="absolute inset-2 border border-dashed border-rose-200/20 rounded pointer-events-none" />
                      <span className="text-[4px] font-sans text-rose-500 uppercase tracking-widest leading-none pt-2">Save our Date</span>
                      
                      <div className="my-auto flex flex-col items-center">
                        {config.themeDecorations !== false && (
                          <div className="w-10 h-10 text-rose-400 flex items-center justify-center opacity-80 mb-3">
                            <svg className="w-full h-full" viewBox="0 0 100 100" fill="currentColor">
                              <path d="M50 15 C45 35, 25 35, 10 40 C30 45, 45 40, 50 15 Z" />
                              <path d="M50 15 C55 35, 75 35, 90 40 C70 45, 55 40, 50 15 Z" />
                              <path d="M50 15 C50 45, 50 70, 50 85" stroke="currentColor" strokeWidth="1.5" fill="none" />
                              <path d="M50 40 C35 50, 30 65, 20 70 C35 68, 45 60, 50 40 Z" />
                              <path d="M50 50 C65 60, 70 75, 80 80 C65 78, 55 70, 50 50 Z" />
                            </svg>
                          </div>
                        )}
                        
                        <h2 className="font-serif italic text-lg text-rose-700 leading-none">
                          {config.coupleName || "Camila & Rafael"}
                        </h2>
                        <div className="flex items-center gap-0.5 text-rose-400 my-1 justify-center">
                          <Heart className="w-2.5 h-2.5 fill-rose-400 text-rose-400 animate-pulse" />
                        </div>
                        <p className="text-[5px] font-sans tracking-wide text-rose-600 uppercase">
                          {config.weddingDate ? (() => {
                            const [year, month, day] = config.weddingDate.split('-').map(Number);
                            const date = new Date(year, month - 1, day);
                            return date.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
                          })() : "15 de Agosto de 2025"}
                        </p>
                      </div>
                      <div className="flex justify-center pb-2">
                        <div className="h-3 px-4 bg-rose-600 text-white rounded-full flex items-center justify-center text-[4px] uppercase tracking-wider font-sans font-bold shadow-sm">
                          Confirmar Presença
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bottom Footer Sim */}
                  <div className="text-center text-[4px] text-muted-foreground tracking-wide mt-2">
                    casarei.online
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {settingsSubTab === "story" && (
          <div className="space-y-8 animate-fade-in">
            {!config.sections.about ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-card rounded-xl p-8 border border-border text-center space-y-6 max-w-xl mx-auto shadow-soft my-10"
              >
                <div className="mx-auto w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center">
                  <Heart className="w-8 h-8 text-gold" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-serif text-2xl text-foreground">Sua História está oculta</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    A seção "Sobre o Casal" e as "Fotos da História" estão desativadas no site do seu casamento. Ative-as para personalizar sua história para os convidados!
                  </p>
                </div>
                <Button
                  onClick={() => toggleSection("about")}
                  className="bg-gold hover:bg-gold-light text-background font-medium px-6"
                >
                  Ativar Seção "Sobre o Casal"
                </Button>
              </motion.div>
            ) : (
              <>
                {/* Section 8: About */}
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  className="bg-card rounded-xl p-6 shadow-soft border border-border"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <Heart className="w-5 h-5 text-gold" />
                    <h2 className="font-serif text-xl text-foreground">Sobre o Casal</h2>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Sua História</Label>
                    <Textarea
                      value={config.aboutText}
                      onChange={(e) => updateConfig({ aboutText: e.target.value })}
                      placeholder="Conte a história de vocês..."
                      className="bg-background min-h-[150px]"
                    />
                  </div>
                </motion.section>

                {/* Section 5: Story Photos */}
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.32 }}
                  className="bg-card rounded-xl p-6 shadow-soft border border-border"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <Heart className="w-5 h-5 text-gold" />
                    <h2 className="font-serif text-xl text-foreground">Fotos da Nossa História</h2>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mb-4">
                    Adicione até 3 fotos do casal para a seção "Nossa História". Essas fotos aparecerão na página pública do seu casamento.
                  </p>

                  <StoryImageSkeleton 
                      weddingId={weddingId}
                      photos={config.storyPhotos}
                      onChange={(photos) => {
                        updateConfig({ storyPhotos: photos });
                      }}
                  />
                  
                  <p className="text-xs text-muted-foreground mt-4">
                    📐 Dimensão recomendada: 800x600px (4:3) para melhor visualização
                  </p>
                </motion.section>
              </>
            )}
          </div>
        )}

        {settingsSubTab === "event" && (
          <div className="space-y-8 animate-fade-in">
            {!config.sections.weddingInfo && !config.sections.dressCode ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-card rounded-xl p-8 border border-border text-center space-y-6 max-w-xl mx-auto shadow-soft my-10"
              >
                <div className="mx-auto w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center">
                  <Calendar className="w-8 h-8 text-gold" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-serif text-2xl text-foreground">Evento e Estilo ocultados</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    As seções de "Informações do Casamento" e "Dress Code" estão desativadas no site. Ative-as para configurar local, data, horário e trajes recomendados.
                  </p>
                </div>
                <div className="flex gap-3 justify-center">
                  <Button
                    variant="outline"
                    onClick={() => toggleSection("weddingInfo")}
                    className="border-gold text-gold hover:bg-gold/5"
                  >
                    Ativar Info do Casamento
                  </Button>
                  <Button
                    onClick={() => toggleSection("dressCode")}
                    className="bg-gold hover:bg-gold-light text-background"
                  >
                    Ativar Dress Code
                  </Button>
                </div>
              </motion.div>
            ) : (
              <>
                {!config.sections.weddingInfo && (
                  <div className="p-4 bg-muted/50 rounded-lg border border-border text-sm text-muted-foreground flex items-center gap-2">
                    <Info className="w-4 h-4 text-gold flex-shrink-0" />
                    <span>As informações da cerimônia/recepção estão desativadas no site. Você pode ativá-las na aba <strong>Aparência & Seções</strong>.</span>
                  </div>
                )}
                
                {config.sections.weddingInfo && (
                  /* Section 7: Wedding Info */
                  <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-card rounded-xl p-6 shadow-soft border border-border"
                  >
                    <div className="flex items-center gap-3 mb-6">
                      <Calendar className="w-5 h-5 text-gold" />
                      <h2 className="font-serif text-xl text-foreground">Informações do Casamento</h2>
                    </div>
                    
                    <div className="grid lg:grid-cols-2 gap-8">
                      {/* Ceremony */}
                      <div className="space-y-4">
                        <h3 className="font-medium text-foreground flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-gold" />
                          Cerimônia
                        </h3>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Data</Label>
                            <Input
                              value={config.ceremonyDate}
                              onChange={(e) => updateConfig({ ceremonyDate: e.target.value })}
                              placeholder="15 de Agosto de 2025"
                              className="bg-background"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Horário</Label>
                            <Input
                              value={config.ceremonyTime}
                              onChange={(e) => updateConfig({ ceremonyTime: e.target.value })}
                              placeholder="16:00"
                              className="bg-background"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Local</Label>
                          <Input
                            value={config.ceremonyLocation}
                            onChange={(e) => updateConfig({ ceremonyLocation: e.target.value })}
                            placeholder="Nome do local"
                            className="bg-background"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Endereço</Label>
                          <Input
                            value={config.ceremonyAddress}
                            onChange={(e) => updateConfig({ ceremonyAddress: e.target.value })}
                            placeholder="Endereço completo"
                            className="bg-background"
                          />
                        </div>
                      </div>

                      {/* Reception */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium text-foreground flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-gold" />
                            Recepção
                          </h3>
                        </div>

                        {/* Same location toggle */}
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-gold/5 border border-gold/20">
                          <Checkbox
                            id="sameLocation"
                            checked={config.sameLocation}
                            onCheckedChange={(checked) => handleSameLocationChange(checked === true)}
                          />
                          <label htmlFor="sameLocation" className="text-sm cursor-pointer">
                            Cerimônia e recepção no mesmo local
                          </label>
                        </div>

                        {!config.sameLocation && (
                          <>
                            <div className="space-y-2">
                              <Label>Horário</Label>
                              <Input
                                value={config.receptionTime}
                                onChange={(e) => updateConfig({ receptionTime: e.target.value })}
                                placeholder="18:30"
                                className="bg-background"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Local</Label>
                              <Input
                                value={config.receptionLocation}
                                onChange={(e) => updateConfig({ receptionLocation: e.target.value })}
                                placeholder="Nome do local"
                                className="bg-background"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Endereço</Label>
                              <Input
                                value={config.receptionAddress}
                                onChange={(e) => updateConfig({ receptionAddress: e.target.value })}
                                placeholder="Endereço completo"
                                className="bg-background"
                              />
                            </div>
                          </>
                        )}

                        {config.sameLocation && (
                          <div className="space-y-2">
                            <Label>Horário da Recepção</Label>
                            <Input
                              value={config.receptionTime}
                              onChange={(e) => updateConfig({ receptionTime: e.target.value })}
                              placeholder="18:30"
                              className="bg-background"
                            />
                            <p className="text-xs text-muted-foreground">
                              Local será o mesmo da cerimônia
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.section>
                )}

                {!config.sections.dressCode && (
                  <div className="p-4 bg-muted/50 rounded-lg border border-border text-sm text-muted-foreground flex items-center gap-2">
                    <Info className="w-4 h-4 text-gold flex-shrink-0" />
                    <span>O Dress Code está desativado no site. Você pode ativá-lo na aba <strong>Aparência & Seções</strong>.</span>
                  </div>
                )}

                {config.sections.dressCode && (
                  /* Section 9: Dress Code */
                  <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.47 }}
                    className="bg-card rounded-xl p-6 shadow-soft border border-border"
                  >
                    <div className="flex items-center gap-3 mb-6">
                      <Shirt className="w-5 h-5 text-gold" />
                      <h2 className="font-serif text-xl text-foreground">Dress Code</h2>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Descrição do Traje</Label>
                        <Textarea
                          value={config.dressCodeText}
                          onChange={(e) => updateConfig({ dressCodeText: e.target.value })}
                          placeholder="Esporte fino, traje social, etc."
                          className="bg-background"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Cores a Evitar</Label>
                        <Input
                          value={config.colorsToAvoid}
                          onChange={(e) => updateConfig({ colorsToAvoid: e.target.value })}
                          placeholder="Branco, off-white..."
                          className="bg-background"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Informações Adicionais</Label>
                        <Textarea
                          value={config.additionalInfo}
                          onChange={(e) => updateConfig({ additionalInfo: e.target.value })}
                          placeholder="Dicas extras, como calçados confortáveis..."
                          className="bg-background"
                        />
                      </div>
                    </div>
                  </motion.section>
                )}
              </>
            )}
          </div>
        )}

        {settingsSubTab === "gifts" && (
          <div className="space-y-8 animate-fade-in">
            {!config.sections.gifts ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-card rounded-xl p-8 border border-border text-center space-y-6 max-w-xl mx-auto shadow-soft my-10"
              >
                <div className="mx-auto w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center">
                  <Gift className="w-8 h-8 text-gold" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-serif text-2xl text-foreground">Lista de Presentes desativada</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    A "Lista de Presentes" e a "Integração com Mercado Pago" estão desativadas no site do seu casamento. Ative-as para que seus convidados possam enviar presentes em dinheiro de forma segura!
                  </p>
                </div>
                <Button
                  onClick={() => toggleSection("gifts")}
                  className="bg-gold hover:bg-gold-light text-background font-medium px-6"
                >
                  Ativar Lista de Presentes
                </Button>
              </motion.div>
            ) : (
              <>
                {/* Section 6: Mercado Pago Integration */}
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="bg-card rounded-xl p-6 shadow-soft border border-border"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <CreditCard className="w-5 h-5 text-gold" />
                    <h2 className="font-serif text-xl text-foreground">Integração Mercado Pago</h2>
                  </div>
                  
                  <div className="bg-muted/50 rounded-lg p-4 mb-6 border border-border">
                    <p className="text-sm text-muted-foreground">
                      Configure sua conta do Mercado Pago para receber pagamentos diretamente na sua conta.
                      Os convidados poderão pagar via Pix, cartão ou boleto.
                    </p>
                    <a 
                      href="https://www.mercadopago.com.br/developers/panel/credentials" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-gold hover:underline inline-flex items-center gap-1 mt-2"
                    >
                      Obter credenciais no Mercado Pago
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {mpValidation && (
                    <Alert className={`mb-4 ${mpValidation.valid ? 'border-green-500 bg-green-500/10' : 'border-destructive bg-destructive/10'}`}>
                      <AlertDescription className="flex items-center gap-2">
                        {mpValidation.valid ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            <span className="text-green-700">{mpValidation.message}</span>
                            {mpValidation.isTestMode && (
                              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">Modo Teste</span>
                            )}
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 text-destructive" />
                            <span className="text-destructive">{mpValidation.error}</span>
                          </>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="mpPublicKey">Public Key</Label>
                      <Input
                        id="mpPublicKey"
                        value={config.mercadoPagoPublicKey || ""}
                        onChange={(e) => {
                          updateConfig({ mercadoPagoPublicKey: e.target.value });
                          setMpValidation(null);
                        }}
                        placeholder="APP_USR-... ou TEST-..."
                        className="bg-background font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mpAccessToken">Access Token</Label>
                      <Input
                        id="mpAccessToken"
                        type="password"
                        value={mercadoPagoAccessToken}
                        onChange={(e) => {
                          setMercadoPagoAccessToken(e.target.value);
                          setMpValidation(null);
                        }}
                        placeholder="APP_USR-... ou TEST-..."
                        className="bg-background font-mono text-sm"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-4">
                    <Button
                      variant="outline"
                      onClick={validateMercadoPago}
                      disabled={mpValidating || !config.mercadoPagoPublicKey || !mercadoPagoAccessToken}
                    >
                      {mpValidating ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                      )}
                      Testar Conexão
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      ⚠️ As credenciais serão validadas antes de salvar
                    </p>
                  </div>

                  {/* Payment Method Toggles */}
                  <div className="mt-6 border-t border-border pt-6">
                    <h3 className="font-medium text-foreground mb-4 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-gold" />
                      Métodos de Pagamento
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Escolha quais métodos de pagamento estarão disponíveis para os convidados.
                    </p>
                    
                    <div className="grid sm:grid-cols-3 gap-4 mb-6">
                      <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
                        <div className="flex items-center gap-3">
                          <CreditCard className="w-4 h-4 text-gold" />
                          <span className="text-sm font-medium text-foreground">Cartão de Crédito</span>
                        </div>
                        <Switch
                          checked={config.paymentCreditCard ?? true}
                          onCheckedChange={(checked) => updateConfig({ paymentCreditCard: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
                        <div className="flex items-center gap-3">
                          <QrCode className="w-4 h-4 text-gold" />
                          <span className="text-sm font-medium text-foreground">Pix</span>
                        </div>
                        <Switch
                          checked={config.paymentPix ?? true}
                          onCheckedChange={(checked) => updateConfig({ paymentPix: checked })}
                        />
                      </div>
                      <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-gold" />
                          <span className="text-sm font-medium text-foreground">Boleto</span>
                        </div>
                        <Switch
                          checked={config.paymentBoleto ?? true}
                          onCheckedChange={(checked) => updateConfig({ paymentBoleto: checked })}
                        />
                      </div>
                    </div>

                    {/* Installment Configuration */}
                    {config.paymentCreditCard && (
                      <div className="p-4 rounded-lg bg-muted/50 border border-border mb-6">
                        <Label htmlFor="maxInstallments" className="flex items-center gap-2 mb-2">
                          <CreditCard className="w-4 h-4 text-gold" />
                          Máximo de Parcelas
                        </Label>
                        <Select
                          value={(config.maxInstallments ?? 12).toString()}
                          onValueChange={(val) => updateConfig({ maxInstallments: parseInt(val) })}
                        >
                          <SelectTrigger className="w-full sm:w-48 bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6, 9, 10, 12].map((n) => (
                              <SelectItem key={n} value={n.toString()}>
                                {n === 1 ? "À vista (sem parcelamento)" : `Até ${n}x`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-2">
                          Define o número máximo de parcelas disponíveis no cartão de crédito.
                        </p>
                      </div>
                    )}

                    {/* Manual PIX Configuration */}
                    <div className="p-4 rounded-lg bg-muted/50 border border-border">
                      <h4 className="font-medium text-foreground mb-4 flex items-center gap-2">
                        <QrCode className="w-4 h-4 text-gold" />
                        Pix Manual (Sem taxas do Mercado Pago)
                      </h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Se preenchido, os convidados poderão fazer um PIX diretamente para sua conta. Eles confirmarão o envio e você aprovará manualmente depois.
                      </p>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="manualPixType">Tipo de Chave</Label>
                          <Select
                            value={config.manualPixType || "cpf"}
                            onValueChange={(val) => updateConfig({ manualPixType: val })}
                          >
                            <SelectTrigger className="w-full bg-background">
                              <SelectValue placeholder="Selecione o tipo" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cpf">CPF</SelectItem>
                              <SelectItem value="cnpj">CNPJ</SelectItem>
                              <SelectItem value="email">E-mail</SelectItem>
                              <SelectItem value="celular">Celular</SelectItem>
                              <SelectItem value="aleatoria">Chave Aleatória</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="manualPixKey">Chave PIX</Label>
                          <Input
                            id="manualPixKey"
                            value={config.manualPixKey || ""}
                            onChange={(e) => updateConfig({ manualPixKey: e.target.value })}
                            placeholder="Ex: 123.456.789-00"
                            className="bg-background"
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2 sm:col-span-2 mt-2">
                        <Label>QR Code da Chave PIX (Opcional)</Label>
                        <div className="flex gap-4 items-start">
                          <div className="flex-1 space-y-2">
                            <Input
                              type="file"
                              accept="image/*"
                              disabled={uploadingQr}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                
                                setUploadingQr(true);
                                try {
                                  const fileExt = file.name.split('.').pop();
                                  const fileName = `${user?.id}-qr-${Date.now()}.${fileExt}`;
                                  
                                  const { error: uploadError } = await supabase.storage
                                    .from('wedding-assets')
                                    .upload(fileName, file);

                                  if (uploadError) throw uploadError;
                                  
                                  const { data: { publicUrl } } = supabase.storage
                                    .from('wedding-assets')
                                    .getPublicUrl(fileName);
                                    
                                  updateConfig({ manualPixQrImageUrl: publicUrl });
                                  toast({ title: "Imagem do QR Code enviada com sucesso!" });
                                } catch (error) {
                                  console.error("Error uploading QR code:", error);
                                  toast({ title: "Erro ao enviar imagem do QR Code.", variant: "destructive" });
                                } finally {
                                  setUploadingQr(false);
                                }
                              }}
                              className="bg-background"
                            />
                            <p className="text-xs text-muted-foreground">
                              Você pode anexar uma imagem do QR Code gerada pelo seu banco para facilitar o pagamento dos convidados.
                            </p>
                          </div>
                          
                          {config.manualPixQrImageUrl && (
                            <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-border bg-muted flex-shrink-0 group">
                              <img 
                                src={config.manualPixQrImageUrl} 
                                alt="QR Code PIX" 
                                className="w-full h-full object-cover"
                              />
                              <button
                                onClick={() => updateConfig({ manualPixQrImageUrl: "" })}
                                className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                title="Remover imagem"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {!config.paymentCreditCard && !config.paymentPix && !config.paymentBoleto && (
                      <Alert className="border-destructive bg-destructive/10 mt-4">
                        <AlertDescription className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-destructive" />
                          <span className="text-destructive">Pelo menos um método de pagamento deve estar ativado.</span>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </motion.section>

                {/* Section 10: Gift Registry */}
                <motion.section
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="bg-card rounded-xl p-6 shadow-soft border border-border"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <Gift className="w-5 h-5 text-gold" />
                      <h2 className="font-serif text-xl text-foreground">Lista de Presentes</h2>
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="file" 
                        accept=".csv" 
                        className="hidden" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                      />
                      <Button 
                        variant="outline" 
                        className="bg-background text-foreground hover:bg-muted"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                      >
                        {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                        Importar CSV
                      </Button>

                      <Button 
                        variant="outline" 
                        className="bg-background text-foreground hover:bg-muted"
                        onClick={handleDownloadTemplate}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Baixar Modelo
                      </Button>

                      <Dialog open={isAddingGift} onOpenChange={setIsAddingGift}>
                        <DialogTrigger asChild>
                          <Button className="bg-gold hover:bg-gold-light text-background">
                            <Plus className="w-4 h-4 mr-2" />
                            Adicionar Presente
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-card">
                          <DialogHeader>
                            <DialogTitle className="font-serif">Adicionar Novo Presente</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 mt-4">
                            
                            <div className="space-y-2 bg-secondary/50 p-4 rounded-lg border border-border">
                              <Label className="text-gold font-medium">Link do Presente (Auto-preenchimento)</Label>
                              <p className="text-xs text-muted-foreground mb-2">Cole o link da loja e clique no botão para extrair os dados automaticamente.</p>
                              <div className="flex gap-2">
                                <Input
                                  value={newGift.externalLink || ""}
                                  onChange={(e) => setNewGift({ ...newGift, externalLink: e.target.value })}
                                  placeholder="https://www.loja..."
                                  className="bg-background flex-1"
                                />
                                <Button 
                                  onClick={() => handleScrapeGift(false)} 
                                  disabled={isScraping || !newGift.externalLink}
                                  variant="secondary"
                                  className="bg-gold text-background hover:bg-gold-light"
                                >
                                  {isScraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label>Nome do Presente *</Label>
                              <Input
                                value={newGift.name}
                                onChange={(e) => setNewGift({ ...newGift, name: e.target.value })}
                                placeholder="Ex: Jogo de Panelas"
                                className="bg-background"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Categoria</Label>
                                <Select
                                  value={newGift.category}
                                  onValueChange={(value) => setNewGift({ ...newGift, category: value })}
                                >
                                  <SelectTrigger className="bg-background">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-card border-border">
                                    {categories.map((cat) => (
                                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>{newGift.isVaquinha ? "Meta da Vaquinha (R$) *" : "Valor (R$) *"}</Label>
                                <Input
                                  type="number"
                                  value={(newGift.isOpenPrice && !newGift.isVaquinha) ? "" : (newGift.price || "")}
                                  onChange={(e) => setNewGift({ ...newGift, price: parseFloat(e.target.value) || 0 })}
                                  placeholder="0.00"
                                  className="bg-background"
                                  disabled={newGift.isOpenPrice && !newGift.isVaquinha}
                                />
                              </div>
                            </div>
                            <div className="flex flex-col space-y-3 py-1">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="isVaquinha"
                                  checked={newGift.isVaquinha || false}
                                  onCheckedChange={(checked) => setNewGift({ 
                                    ...newGift, 
                                    isVaquinha: checked === true,
                                    isOpenPrice: checked === true ? true : newGift.isOpenPrice // Vaquinha is always Open Price
                                  })}
                                />
                                <Label htmlFor="isVaquinha" className="text-sm font-medium leading-none cursor-pointer">
                                  É uma Vaquinha? (Exibe barra de progresso)
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="isOpenPrice"
                                  checked={newGift.isOpenPrice || false}
                                  disabled={newGift.isVaquinha}
                                  onCheckedChange={(checked) => setNewGift({ 
                                    ...newGift, 
                                    isOpenPrice: checked === true,
                                    price: checked === true ? 0 : newGift.price 
                                  })}
                                />
                                <Label htmlFor="isOpenPrice" className="text-sm font-medium leading-none cursor-pointer">
                                  Permitir valor livre (definido pelo convidado)
                                </Label>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Label>URL da Imagem</Label>
                                <span className="text-xs text-muted-foreground">(400x400px)</span>
                              </div>
                              <Input
                                value={newGift.image}
                                onChange={(e) => setNewGift({ ...newGift, image: e.target.value })}
                                placeholder="https://..."
                                className="bg-background"
                              />
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Label>Quantidade em Estoque</Label>
                                <span className="text-xs text-muted-foreground">(Opcional)</span>
                              </div>
                              <Input
                                type="number"
                                min="0"
                                value={newGift.stock !== null && newGift.stock !== undefined ? newGift.stock : ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setNewGift({ ...newGift, stock: val === "" ? null : parseInt(val) || 0 });
                                }}
                                placeholder="Ilimitado"
                                className="bg-background"
                                disabled={!!newGift.totalQuotas}
                              />
                              {!!newGift.totalQuotas && (
                                <p className="text-xs text-muted-foreground">Estoque gerenciado pelas cotas</p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Label>Número de Cotas</Label>
                                <span className="text-xs text-muted-foreground">(Opcional — divide o valor em partes iguais)</span>
                              </div>
                              <Input
                                type="number"
                                min="2"
                                value={newGift.totalQuotas !== null && newGift.totalQuotas !== undefined ? newGift.totalQuotas : ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const quotas = val === "" ? null : parseInt(val) || 0;
                                  setNewGift({ 
                                    ...newGift, 
                                    totalQuotas: quotas,
                                    stock: quotas ? quotas : newGift.stock,
                                  });
                                }}
                                placeholder="Sem cotas"
                                className="bg-background"
                              />
                              {newGift.totalQuotas && newGift.price > 0 && (
                                <p className="text-xs text-gold font-medium">
                                  Cada cota: R$ {(newGift.price / newGift.totalQuotas).toFixed(2).replace(".", ",")}
                                </p>
                              )}
                            </div>
                            <Button onClick={handleSaveNewGift} className="w-full bg-gold hover:bg-gold-light text-background">
                              <Save className="w-4 h-4 mr-2" />
                              Salvar Presente
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>

                  {/* Gifts Grid */}
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {config.gifts.map((gift) => (
                      <div
                        key={gift.id}
                        className="bg-muted/50 rounded-lg border border-border overflow-hidden group"
                      >
                        <div className="aspect-video bg-secondary relative">
                          {gift.image ? (
                            <img src={gift.image} alt={gift.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Gift className="w-8 h-8 text-muted-foreground" />
                            </div>
                          )}
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setEditingGift(gift)}
                              className="p-2 bg-card rounded-lg shadow hover:bg-muted"
                            >
                              <Edit2 className="w-4 h-4 text-foreground" />
                            </button>
                            <button
                              onClick={() => removeGift(gift.id)}
                              className="p-2 bg-card rounded-lg shadow hover:bg-destructive hover:text-destructive-foreground"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="p-4">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-xs text-gold uppercase tracking-wider">{gift.category}</span>
                            {gift.totalQuotas ? (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${(gift.stock || 0) > 0 ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
                                {(gift.stock || 0) > 0 ? `${gift.stock} DE ${gift.totalQuotas} COTAS` : "TODAS AS COTAS VENDIDAS"}
                              </span>
                            ) : gift.stock !== null && gift.stock !== undefined && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${gift.stock > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                {gift.stock > 0 ? `RESTAM ${gift.stock}` : "ESGOTADO"}
                              </span>
                            )}
                          </div>
                          <h3 className="font-medium text-foreground mt-1">{gift.name}</h3>
                          {gift.totalQuotas && gift.price > 0 ? (
                            <div className="mt-2">
                              <p className="text-sm font-medium text-muted-foreground mb-1">
                                {gift.totalQuotas} cotas de R$ {(gift.price / gift.totalQuotas).toFixed(2).replace(".", ",")}
                              </p>
                              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                <div 
                                  className="bg-blue-500 h-full rounded-full transition-all duration-500"
                                  style={{ width: `${Math.min(100, ((gift.totalQuotas - (gift.stock || 0)) / gift.totalQuotas) * 100)}%` }}
                                />
                              </div>
                            </div>
                          ) : gift.isVaquinha ? (
                            <div className="mt-2">
                              <p className="text-sm font-medium text-muted-foreground mb-1">
                                Arrecadado: R$ {(gift.raisedAmount || 0).toFixed(2).replace(".", ",")} de R$ {gift.price.toFixed(2).replace(".", ",")}
                              </p>
                              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                <div 
                                  className="bg-gold h-full rounded-full transition-all duration-500"
                                  style={{ width: `${Math.min(100, ((gift.raisedAmount || 0) / gift.price) * 100)}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <p className="text-lg font-serif text-gold mt-2">
                              {gift.isOpenPrice ? "Valor Livre" : `R$ ${gift.price.toFixed(2).replace(".", ",")}`}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Edit Gift Dialog */}
                  <Dialog open={!!editingGift} onOpenChange={(open) => !open && setEditingGift(null)}>
                    <DialogContent className="bg-card">
                      <DialogHeader>
                        <DialogTitle className="font-serif">Editar Presente</DialogTitle>
                      </DialogHeader>
                      {editingGift && (
                        <div className="space-y-4 mt-4">
                          
                          <div className="space-y-2 bg-secondary/50 p-4 rounded-lg border border-border">
                            <Label className="text-gold font-medium">Link do Presente (Auto-preenchimento)</Label>
                            <p className="text-xs text-muted-foreground mb-2">Cole o link da loja e clique no botão para extrair os dados automaticamente.</p>
                            <div className="flex gap-2">
                              <Input
                                value={editingGift.externalLink || ""}
                                onChange={(e) => setEditingGift({ ...editingGift, externalLink: e.target.value })}
                                placeholder="https://www.loja..."
                                className="bg-background flex-1"
                              />
                              <Button 
                                onClick={() => handleScrapeGift(true)} 
                                disabled={isScraping || !editingGift.externalLink}
                                variant="secondary"
                                className="bg-gold text-background hover:bg-gold-light"
                              >
                                {isScraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Nome do Presente</Label>
                            <Input
                              value={editingGift.name}
                              onChange={(e) => setEditingGift({ ...editingGift, name: e.target.value })}
                              className="bg-background"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Categoria</Label>
                              <Select
                                value={editingGift.category}
                                onValueChange={(value) => setEditingGift({ ...editingGift, category: value })}
                              >
                                <SelectTrigger className="bg-background">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                  {categories.map((cat) => (
                                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>{editingGift.isVaquinha ? "Meta da Vaquinha (R$)" : "Valor (R$)"}</Label>
                              <Input
                                type="number"
                                value={(editingGift.isOpenPrice && !editingGift.isVaquinha) ? "" : editingGift.price}
                                onChange={(e) => setEditingGift({ ...editingGift, price: parseFloat(e.target.value) || 0 })}
                                className="bg-background"
                                disabled={editingGift.isOpenPrice && !editingGift.isVaquinha}
                              />
                            </div>
                          </div>
                          <div className="flex flex-col space-y-3 py-1">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="editIsVaquinha"
                                checked={editingGift.isVaquinha || false}
                                onCheckedChange={(checked) => setEditingGift({ 
                                  ...editingGift, 
                                  isVaquinha: checked === true,
                                  isOpenPrice: checked === true ? true : editingGift.isOpenPrice
                                })}
                              />
                              <Label htmlFor="editIsVaquinha" className="text-sm font-medium leading-none cursor-pointer">
                                É uma Vaquinha? (Exibe barra de progresso)
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="editIsOpenPrice"
                                checked={editingGift.isOpenPrice || false}
                                disabled={editingGift.isVaquinha}
                                onCheckedChange={(checked) => setEditingGift({ 
                                  ...editingGift, 
                                  isOpenPrice: checked === true,
                                  price: checked === true ? 0 : editingGift.price 
                                })}
                              />
                              <Label htmlFor="editIsOpenPrice" className="text-sm font-medium leading-none cursor-pointer">
                                Permitir valor livre (definido pelo convidado)
                              </Label>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>URL da Imagem</Label>
                            <Input
                              value={editingGift.image}
                              onChange={(e) => setEditingGift({ ...editingGift, image: e.target.value })}
                              className="bg-background"
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Label>Quantidade em Estoque</Label>
                              <span className="text-xs text-muted-foreground">(Opcional)</span>
                            </div>
                            <Input
                              type="number"
                              min="0"
                              value={editingGift.stock !== null && editingGift.stock !== undefined ? editingGift.stock : ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditingGift({ ...editingGift, stock: val === "" ? null : parseInt(val) || 0 });
                              }}
                              placeholder="Ilimitado"
                              className="bg-background"
                              disabled={!!editingGift.totalQuotas}
                            />
                            {!!editingGift.totalQuotas && (
                              <p className="text-xs text-muted-foreground">Estoque gerenciado pelas cotas</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Label>Número de Cotas</Label>
                              <span className="text-xs text-muted-foreground">(Opcional — divide o valor em partes iguais)</span>
                            </div>
                            <Input
                              type="number"
                              min="2"
                              value={editingGift.totalQuotas !== null && editingGift.totalQuotas !== undefined ? editingGift.totalQuotas : ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                const quotas = val === "" ? null : parseInt(val) || 0;
                                setEditingGift({ 
                                  ...editingGift, 
                                  totalQuotas: quotas,
                                  stock: quotas ? quotas : editingGift.stock,
                                });
                              }}
                              placeholder="Sem cotas"
                              className="bg-background"
                            />
                            {editingGift.totalQuotas && editingGift.price > 0 && (
                              <p className="text-xs text-gold font-medium">
                                Cada cota: R$ {(editingGift.price / editingGift.totalQuotas).toFixed(2).replace(".", ",")}
                              </p>
                            )}
                          </div>
                          <Button onClick={handleUpdateGift} className="w-full bg-gold hover:bg-gold-light text-background">
                            <Save className="w-4 h-4 mr-2" />
                            Atualizar Presente
                          </Button>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </motion.section>
              </>
            )}
          </div>
        )}

        {settingsSubTab === "virtualHouse" && (
          <div className="space-y-8 animate-fade-in">
            {!config.sections.virtualHouse ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-card rounded-xl p-8 border border-border text-center space-y-6 max-w-xl mx-auto shadow-soft my-10"
              >
                <div className="mx-auto w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center">
                  <Home className="w-8 h-8 text-gold" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-serif text-2xl text-foreground">Casa dos Sonhos desativada</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                    Habilite a seção da Casa dos Sonhos (2D) para gamificar sua lista de presentes! Seus convidados poderão ajudar a construir sua casa doando fundações, paredes, telhado e móveis.
                  </p>
                </div>
                <Button 
                  onClick={() => toggleSection("virtualHouse")}
                  className="bg-gold hover:bg-gold-light text-background"
                >
                  Ativar Seção Casa dos Sonhos
                </Button>
              </motion.div>
            ) : (
              <div className="space-y-6">
                <div className="flex justify-between items-center gap-4 flex-wrap border-b border-border pb-4">
                  <div>
                    <h2 className="font-serif text-2xl text-foreground">Casa Virtual 2D</h2>
                    <p className="text-sm text-muted-foreground">Gerencie sua Casa dos Sonhos e posicione os itens no mapa interativo</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={houseActiveView === "blueprint" ? "default" : "outline"}
                      onClick={() => setHouseActiveView("blueprint")}
                      className={houseActiveView === "blueprint" ? "bg-gold hover:bg-gold-light text-background" : ""}
                    >
                      Visualizar Planta Baixa
                    </Button>
                    <Button
                      variant={houseActiveView === "catalog" ? "default" : "outline"}
                      onClick={() => setHouseActiveView("catalog")}
                      className={houseActiveView === "catalog" ? "bg-gold hover:bg-gold-light text-background" : "border-gold text-gold hover:bg-gold/5"}
                    >
                      Gerenciar Catálogo (Preços)
                    </Button>
                  </div>
                </div>

                {houseActiveView === "blueprint" ? (
                  <DashboardVirtualHouse weddingId={weddingId} />
                ) : (
                  <HouseCatalogSettings weddingId={weddingId} />
                )}
              </div>
            )}
          </div>
        )}

        {settingsSubTab === "gallery" && (
          <div className="space-y-8 animate-fade-in">
            <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-gold/10 rounded-full">
                  <Camera className="w-6 h-6 text-gold" />
                </div>
                <div>
                  <h2 className="font-serif text-2xl text-foreground">Sua Galeria de Fotos</h2>
                  <p className="text-sm text-muted-foreground">
                    Gerencie as fotos que aparecem na seção de galeria do seu site.
                  </p>
                </div>
              </div>
              
              {!config.sections.gallery ? (
                <div className="bg-muted p-4 rounded-lg border border-border mb-6">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    A seção de galeria está desativada. As fotos que você adicionar só aparecerão no site se você ativar a seção na aba "Aparência & Seções".
                  </p>
                </div>
              ) : null}

              <GalleryUpload weddingId={weddingId} />
            </div>
          </div>
        )}

        {settingsSubTab === "advanced" && (
          <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
            <div className="bg-destructive/5 rounded-xl border border-destructive/20 p-8 shadow-soft">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-4 bg-destructive/10 rounded-full">
                  <AlertCircle className="w-8 h-8 text-destructive" />
                </div>
                <div>
                  <h2 className="font-serif text-3xl text-foreground mb-2">Área de Perigo (Avançado)</h2>
                  <p className="text-sm text-muted-foreground text-lg">Ações irreversíveis para limpar dados de teste ou resetar completamente o seu casamento.</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-background rounded-xl p-6 border border-border flex flex-col justify-between space-y-4 shadow-sm hover:border-destructive/30 transition-colors">
                  <div>
                    <h3 className="font-medium text-lg flex items-center gap-2 mb-3"><Users className="w-5 h-5 text-destructive" /> Limpar Todos os Convidados</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">Exclui todos os convidados adicionados e suas respectivas respostas de RSVP. Ideal para começar do zero após fazer testes de usabilidade no formulário de presença.</p>
                  </div>
                  <Button 
                    variant="destructive" 
                    className="w-full flex gap-2 font-medium"
                    onClick={async () => {
                      if (!confirm("Tem certeza que deseja apagar TODOS os convidados? Esta ação não pode ser desfeita.")) return;
                      await supabase.from("guests").delete().eq("wedding_id", weddingId);
                      await supabase.from("rsvp_responses").delete().eq("wedding_id", weddingId);
                      toast({ title: "Sucesso", description: "Todos os convidados foram apagados do banco de dados." });
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    Apagar Todos os Convidados
                  </Button>
                </div>

                <div className="bg-background rounded-xl p-6 border border-border flex flex-col justify-between space-y-4 shadow-sm hover:border-destructive/30 transition-colors">
                  <div>
                    <h3 className="font-medium text-lg flex items-center gap-2 mb-3"><MessageSquare className="w-5 h-5 text-destructive" /> Limpar Mural de Recados</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">Apaga todas as mensagens que foram deixadas no seu mural público de recados na landing page. Ideal para limpar testes antes de enviar o link oficial.</p>
                  </div>
                  <Button 
                    variant="destructive" 
                    className="w-full flex gap-2 font-medium"
                    onClick={async () => {
                      if (!confirm("Tem certeza que deseja apagar TODAS as mensagens do mural? Esta ação não pode ser desfeita.")) return;
                      await supabase.from("messages").delete().eq("wedding_id", weddingId);
                      toast({ title: "Sucesso", description: "O mural de recados foi limpo completamente." });
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    Apagar Mural de Recados
                  </Button>
                </div>

                <div className="bg-background rounded-xl p-6 border border-border flex flex-col justify-between space-y-4 shadow-sm hover:border-destructive/30 transition-colors">
                  <div>
                    <h3 className="font-medium text-lg flex items-center gap-2 mb-3"><Gift className="w-5 h-5 text-destructive" /> Limpar Lista de Presentes</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">Apaga todos os presentes cadastrados na sua lista (e consequentemente na Casa Virtual 2D). Compras e transações já efetuadas não serão afetadas, mas o catálogo de itens ficará vazio.</p>
                  </div>
                  <Button 
                    variant="destructive" 
                    className="w-full flex gap-2 font-medium"
                    onClick={async () => {
                      if (!confirm("Tem certeza que deseja apagar TODOS os presentes da sua lista? Esta ação não pode ser desfeita.")) return;
                      await supabase.from("gifts").delete().eq("wedding_id", weddingId);
                      toast({ title: "Sucesso", description: "Todos os presentes foram apagados. Recarregando a página..." });
                      setTimeout(() => window.location.reload(), 1500);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    Apagar Todos os Presentes
                  </Button>
                </div>

                <div className="bg-background rounded-xl p-6 border-2 border-destructive/80 flex flex-col justify-between space-y-4 shadow-md bg-destructive/5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/10 rounded-bl-full -mr-4 -mt-4 blur-2xl pointer-events-none"></div>
                  <div className="relative z-10">
                    <h3 className="font-medium text-xl flex items-center gap-2 mb-3 text-destructive"><AlertCircle className="w-6 h-6" /> Factory Reset Total</h3>
                    <p className="text-sm text-destructive/80 font-medium leading-relaxed mb-2">Ação Extremamente Destrutiva!</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">Apaga COMPLETAMENTE o seu casamento do banco de dados. Convidados, presentes, histórico financeiro, configurações, personalizações de layout... tudo será deletado e voltará ao padrão de fábrica (Camila & Rafael).</p>
                  </div>
                  <Button 
                    variant="destructive" 
                    size="lg"
                    className="w-full flex gap-2 bg-destructive hover:bg-destructive/90 text-white font-bold relative z-10"
                    onClick={async () => {
                      if (!confirm("ALERTA MÁXIMO!\n\nIsso vai apagar literalmente TUDO que você configurou no seu casamento (presentes, convidados, mensagens, finanças, layout).\n\nTem ABSOLUTA CERTEZA que quer fazer isso?")) return;
                      if (!confirm("Último aviso: TEM CERTEZA?\n\nNós NÃO poderemos recuperar seus dados depois disso! O site voltará para as configurações padrão 'Camila & Rafael'.")) return;
                      
                      toast({ title: "Apagando o banco de dados...", description: "Por favor, aguarde." });
                      
                      // Delete the wedding row. ON DELETE CASCADE handles the rest.
                      const { error } = await supabase.from("weddings").delete().eq("id", weddingId);
                      
                      if (error) {
                        toast({ title: "Erro", description: "Falha ao resetar os dados: " + error.message, variant: "destructive" });
                      } else {
                        toast({ title: "Reset Concluído", description: "O seu casamento foi completamente apagado. Reiniciando os dados de fábrica..." });
                        setTimeout(() => window.location.reload(), 2000);
                      }
                    }}
                  >
                    <AlertCircle className="w-5 h-5" />
                    RESETAR MEU CASAMENTO
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Save Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="flex justify-center pt-8 gap-4"
        >
          <Button 
            variant="outline"
            size="lg"
            onClick={() => navigate("/preview")}
          >
            <Eye className="w-5 h-5 mr-3" />
            Visualizar Preview
          </Button>
          <Button 
            size="lg"
            onClick={handleSave}
            disabled={isSaving}
            className="bg-gold hover:bg-gold-light text-background text-lg px-12 py-6"
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 mr-3 animate-spin" />
            ) : (
              <Save className="w-5 h-5 mr-3" />
            )}
            Salvar e Publicar Site
            <ChevronRight className="w-5 h-5 ml-2" />
          </Button>
        </motion.div>
        </>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
