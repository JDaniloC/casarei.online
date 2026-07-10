import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";
import { securityHeaders } from "../_shared/security-headers.ts";

// Público intencional — busca o convidado pelo token do convite (o token é o segredo
// que só o destinatário do link possui). Usa service role para retornar APENAS o
// convidado correspondente ao token, sem permitir enumerar a tabela guests.
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  ...securityHeaders(),
};

const RequestSchema = z.object({
  token: z.string().min(1).max(100),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    const validationResult = RequestSchema.safeParse({ token });
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: guest, error } = await supabase
      .from("guests")
      .select("id, name, phone, wedding_id, status, passcode")
      .eq("token", validationResult.data.token)
      .maybeSingle();

    if (error || !guest) {
      return new Response(
        JSON.stringify({ error: "Guest not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Nunca enviar o VALOR da senha ao cliente — apenas se ela existe.
    // A validação é feita server-side pela função verify-passcode.
    const { passcode, ...guestSafe } = guest;

    return new Response(
      JSON.stringify({ guest: { ...guestSafe, has_passcode: Boolean(passcode) } }),
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
