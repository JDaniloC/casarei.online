import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";
import { securityHeaders } from "../_shared/security-headers.ts";

// Público intencional — valida a senha de acesso ao convite server-side.
// O valor da senha nunca é enviado ao cliente; esta função compara e devolve
// apenas { authorized: boolean }.
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  ...securityHeaders(),
};

const RequestSchema = z.object({
  passcode: z.string().min(1).max(100),
  token: z.string().min(1).max(100).optional(),
  wedding_id: z.string().uuid().optional(),
}).refine((v) => v.token || v.wedding_id, {
  message: "token or wedding_id required",
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    const validationResult = RequestSchema.safeParse(rawBody);
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({ error: "Invalid input" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { passcode, token, wedding_id } = validationResult.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Rate limit por IP (10/min) — dificulta força bruta na senha
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabase
      .from("rate_limit_log")
      .select("id", { count: "exact", head: true })
      .eq("identifier", ip)
      .eq("action", "verify_passcode")
      .gte("created_at", oneMinuteAgo);

    if ((count ?? 0) >= 10) {
      return new Response(
        JSON.stringify({ error: "Muitas tentativas. Aguarde 1 minuto." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    await supabase.from("rate_limit_log").insert({ identifier: ip, action: "verify_passcode" });

    let expected: string | null = null;

    if (token) {
      // Senha individual do convidado (convite com token)
      const { data: guest } = await supabase
        .from("guests")
        .select("passcode")
        .eq("token", token)
        .maybeSingle();

      if (!guest) {
        return new Response(
          JSON.stringify({ error: "Guest not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      expected = guest.passcode;
    } else {
      // Senha global do casamento (link genérico /convite)
      const { data: wedding } = await supabase
        .from("weddings")
        .select("global_passcode")
        .eq("id", wedding_id!)
        .maybeSingle();

      if (!wedding) {
        return new Response(
          JSON.stringify({ error: "Wedding not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      expected = wedding.global_passcode;
    }

    // Sem senha configurada => acesso liberado
    const authorized = !expected || expected === passcode;

    return new Response(
      JSON.stringify({ authorized }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
