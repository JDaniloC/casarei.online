import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { securityHeaders } from "../_shared/security-headers.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "contato@seu-dominio.com.br";

interface EmailPayload {
  to: string;
  template: "purchase_approved_couple" | "reservation_couple" | "cancellation_couple" | "purchase_confirmed_guest" | "cancellation_guest";
  data: Record<string, string | number>;
}

function buildEmail(payload: EmailPayload): { subject: string; html: string } {
  switch (payload.template) {
    case "purchase_approved_couple":
      return {
        subject: `Presente comprado: ${payload.data.giftName}`,
        html: `<p><strong>${payload.data.guestName}</strong> comprou <strong>${payload.data.giftName}</strong> por R$ ${payload.data.amount}.</p>`,
      };
    case "reservation_couple":
      return {
        subject: `Nova reserva: ${payload.data.giftName}`,
        html: `<p><strong>${payload.data.guestName}</strong> reservou <strong>${payload.data.giftName}</strong>. Entre em contato para confirmar o pagamento.</p>`,
      };
    case "cancellation_couple":
      return {
        subject: `Reserva cancelada: ${payload.data.giftName}`,
        html: `<p>A reserva de <strong>${payload.data.giftName}</strong> por <strong>${payload.data.guestName}</strong> foi cancelada. O presente voltou a estar disponível.</p>`,
      };
    case "purchase_confirmed_guest":
      return {
        subject: `Confirmação: ${payload.data.giftName}`,
        html: `<p>Obrigado pela compra de <strong>${payload.data.giftName}</strong> no valor de R$ ${payload.data.amount}. Os noivos foram notificados!</p>`,
      };
    case "cancellation_guest":
      return {
        subject: `Reserva cancelada`,
        html: `<p>Sua reserva de <strong>${payload.data.giftName}</strong> foi cancelada pelos noivos. O presente voltou a estar disponível.</p>`,
      };
  }
}

serve(async (req) => {
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500, headers: { ...securityHeaders(), "Content-Type": "application/json" },
    });
  }

  const payload: EmailPayload = await req.json();
  const { subject, html } = buildEmail(payload);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: payload.to, subject, html }),
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: "Failed to send email" }), {
      status: 500, headers: { ...securityHeaders(), "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ sent: true }), {
    headers: { ...securityHeaders(), "Content-Type": "application/json" },
  });
});
