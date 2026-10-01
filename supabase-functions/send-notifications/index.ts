// Supabase Edge Function: send-notifications
// Deploy with the Supabase CLI:
//   supabase functions deploy send-notifications
//
// Required secrets (set with `supabase secrets set NAME=value`):
//   VAPID_PUBLIC_KEY   = BHO2p5gF1IfCgCPul-3P-tAW146h4D8aryRfqHqeU6g5JkK6o6jf9uS0DqMu9B6q8M9r3pn10hszx-_KMRyPCtE
//   VAPID_PRIVATE_KEY  = (the private key generated alongside it — keep this OUT of the website)
//   SUPABASE_URL       = your project URL (already available by default in Edge Functions)
//   SUPABASE_SERVICE_ROLE_KEY = your service_role key (already available by default — never put this in the site)
//
// Two ways this function is called:
//   1) Daily greeting — called once a day by pg_cron (see schedule.sql), no body needed.
//   2) Status-change alert — called by a Database Webhook on the shipments table
//      (Dashboard > Database > Webhooks), which POSTs the changed row automatically.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
const brevoKey = Deno.env.get("BREVO_API_KEY"); // optional: enables e-mail alerts
const SENDER = { name: "JP's Logistics & More LLC", email: "contact@jpslogistics.me" };

webpush.setVapidDetails("mailto:jpslogisticsmiami@gmail.com", vapidPublic, vapidPrivate);

const statusLabels: Record<number, string> = {
  0: "reçu au dépôt de Miami",
  1: "en transit / en douane",
  2: "arrivé en Haïti",
  3: "prêt pour retrait",
};

Deno.serve(async (req) => {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let payload: any = {};
  try { payload = await req.json(); } catch (_e) { payload = {}; }

  // ---- Case 1: a shipment status changed (Database Webhook payload) ----
  if (payload?.table === "shipments" && payload?.record) {
    const record = payload.record;
    const old = payload.old_record;
    if (old && old.status === record.status) {
      return new Response(JSON.stringify({ skipped: "status unchanged" }), { status: 200 });
    }

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("subscription")
      .eq("client_id", record.client_id);

    const label = statusLabels[record.status] ?? "mis à jour";
    const body = `Votre colis ${record.tracking_number} est maintenant : ${label}.`;

    await sendToAll(subs ?? [], "JP's Logistics & More", body);
    const emailed = await emailClient(supabase, record, label, !old);
    return new Response(JSON.stringify({ sent: (subs ?? []).length, emailed }), { status: 200 });
  }

  // ---- Case 2: daily morning greeting (called by pg_cron, no matching body) ----
  const { data: subs } = await supabase.from("push_subscriptions").select("subscription");
  await sendToAll(
    subs ?? [],
    "JP's Logistics & More",
    "Bonjour ! Merci pour votre confiance. Nous sommes là pour vos colis aujourd'hui."
  );
  return new Response(JSON.stringify({ sent: (subs ?? []).length }), { status: 200 });
});

async function sendToAll(rows: { subscription: any }[], title: string, body: string) {
  const message = JSON.stringify({ title, body });
  await Promise.allSettled(
    rows.map((r) => webpush.sendNotification(r.subscription, message))
  );
}

const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// E-mail the client through Brevo when a shipment is added or its status changes.
async function emailClient(supabase: any, record: any, label: string, isNew: boolean): Promise<boolean> {
  if (!brevoKey) return false;
  try {
    const { data: client } = await supabase.from("clients").select("name,email").eq("id", record.client_id).maybeSingle();
    if (!client?.email) return false;

    const lbs = parseFloat(String(record.weight ?? "").replace(",", ".")) || 0;
    let priceHtml = "";
    if (record.price_per_lb !== null && record.price_per_lb !== undefined) {
      const total = lbs * Number(record.price_per_lb) + Number(record.logistics_fee ?? 0);
      priceHtml = `<p style="color:#6b7490;font-size:13px;margin:12px 0 0;">${lbs} lbs × ${usd(Number(record.price_per_lb))} + frais de logistique ${usd(Number(record.logistics_fee ?? 0))}</p>
        <p style="font-size:18px;font-weight:bold;color:#0D2B80;margin:4px 0 0;">Total à payer : ${usd(total)}</p>`;
    }
    const first = String(client.name ?? "").split(" ")[0];
    const subject = isNew
      ? `Nouveau colis enregistré ${record.tracking_number} — JP's Logistics & More LLC`
      : `Mise à jour de votre colis ${record.tracking_number} — JP's Logistics & More LLC`;
    const html = `<!doctype html><html><body style="margin:0;background:#f3f5fa;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:520px;margin:0 auto;padding:24px;">
        <div style="background:#0D2B80;border-radius:16px 16px 0 0;padding:20px 24px;color:#fff;font-size:18px;font-weight:bold;">JP's Logistics &amp; More LLC</div>
        <div style="background:#fff;border-radius:0 0 16px 16px;padding:28px 24px;color:#1b2540;font-size:15px;line-height:1.6;">
          <p>Bonjour ${first},</p>
          <p>${isNew ? "Un nouveau colis a été enregistré pour vous." : "Le statut de votre colis a changé."}</p>
          <p style="margin:0;"><b>N° de suivi :</b> ${record.tracking_number}</p>
          <p style="margin:0;"><b>Statut :</b> ${label}</p>
          ${priceHtml}
          <p style="margin-top:20px;">Merci pour votre confiance.</p>
        </div>
        <p style="text-align:center;color:#8a93a8;font-size:12px;margin-top:16px;">JP's Logistics &amp; More LLC · Miami, FL · contact@jpslogistics.me</p>
      </div></body></html>`;

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: SENDER, to: [{ email: client.email, name: client.name }], subject, htmlContent: html }),
    });
    if (!res.ok) console.error("Brevo error", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("emailClient failed", e);
    return false;
  }
}
