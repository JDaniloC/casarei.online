import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GIFT_IMAGES_BUCKET = "wedding-assets";

/**
 * Baixa a imagem extraída da página do produto e re-hospeda no nosso Storage.
 * Lojas como o Mercado Livre bloqueiam hotlink de terceiros (a página pública
 * do casamento recebia 503 ao tentar carregar direto do CDN deles) — buscando
 * aqui no servidor a imagem nunca sofre esse bloqueio, e o link salvo no banco
 * nunca mais depende da loja original continuar servindo aquele arquivo.
 * Se o download ou upload falhar por qualquer motivo, devolve a URL original
 * (mercadinho pior é um link frágil do que nenhuma imagem).
 */
async function rehostImage(imageUrl: string, weddingId?: string): Promise<string> {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      console.error(`rehostImage: download falhou (HTTP ${res.status}) para ${imageUrl}`);
      return imageUrl;
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      console.error(`rehostImage: content-type inesperado "${contentType}" para ${imageUrl}`);
      return imageUrl;
    }

    const buffer = new Uint8Array(await res.arrayBuffer());
    const ext = contentType.includes("webp") ? "webp" : contentType.includes("png") ? "png" : "jpg";
    const folder = weddingId || "unlinked";
    const filePath = `${folder}/gift-images/${crypto.randomUUID()}.${ext}`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: uploadError } = await supabase.storage
      .from(GIFT_IMAGES_BUCKET)
      .upload(filePath, buffer, { contentType, upsert: true });

    if (uploadError) {
      console.error("rehostImage: upload falhou:", uploadError.message);
      return imageUrl;
    }

    const { data: publicUrlData } = supabase.storage.from(GIFT_IMAGES_BUCKET).getPublicUrl(filePath);
    return publicUrlData.publicUrl;
  } catch (err) {
    console.error("rehostImage: erro inesperado:", err);
    return imageUrl;
  }
}

serve(async (req) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url, weddingId } = await req.json();

    if (!url) {
      throw new Error("URL is required");
    }

    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlKey) {
      throw new Error("FIRECRAWL_API_KEY is not configured");
    }

    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: url,
        formats: ["extract"],
        extract: {
          schema: {
            type: "object",
            properties: {
              title: { type: "string", description: "O título ou nome do produto/presente" },
              price: { type: "number", description: "O preço do produto (apenas o valor numérico)" },
              imageUrl: { type: "string", description: "A URL completa da imagem principal do produto" }
            },
            required: ["title"]
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Firecrawl error:", errorText);
      throw new Error(`Firecrawl API error: ${response.status}`);
    }

    const data = await response.json();
    const extract = data?.data?.extract || {};

    if (extract.imageUrl) {
      extract.imageUrl = await rehostImage(extract.imageUrl, weddingId);
    }

    return new Response(JSON.stringify(extract), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
