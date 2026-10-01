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

// ---------- E-mail design (shared look for every e-mail) ----------
// The logo is loaded from your website: SITE_URL/logo.png (set the SITE_URL
// secret if your site is not at https://jpslogistics.me).
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://jpslogistics.me").replace(/\/$/, "");
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function layout(title: string, inner: string, cta?: { label: string; url: string }, preheader = ""): string {
  const button = cta
    ? `<tr><td align="center" style="background:#ffffff;padding:6px 28px 30px;">
         <a href="${cta.url}" style="display:inline-block;background:#FF5500;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 32px;border-radius:999px;font-family:${FONT};">${cta.label}</a>
       </td></tr>`
    : `<tr><td style="background:#ffffff;height:22px;line-height:22px;font-size:0;">&nbsp;</td></tr>`;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#EEF1F8;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F8;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
    <tr><td align="center" style="background:#ffffff;border-radius:18px 18px 0 0;padding:28px 28px 20px;border-bottom:4px solid #FF5500;">
      <img src="${SITE_URL}/logo.png" alt="JP's Logistics &amp; More" width="150" style="display:block;width:150px;max-width:60%;height:auto;border:0;outline:none;">
    </td></tr>
    <tr><td style="background:#ffffff;padding:28px 28px 8px;font-family:${FONT};color:#1B2540;font-size:15px;line-height:1.65;">
      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#0D2B80;font-family:${FONT};">${title}</h1>
      ${inner}
    </td></tr>
    ${button}
    <tr><td align="center" style="background:#0D2B80;border-radius:0 0 18px 18px;padding:20px 24px;font-family:${FONT};color:#C9D4F5;font-size:12px;line-height:1.7;">
      <b style="color:#ffffff;">JP's Logistics &amp; More LLC</b><br>
      8125 NW 67th St, Miami, FL 33166 &middot; +1 (786) 424-8025<br>
      <a href="mailto:contact@jpslogistics.me" style="color:#C9D4F5;">contact@jpslogistics.me</a>
    </td></tr>
    <tr><td align="center" style="padding:14px;font-family:${FONT};color:#8A93A8;font-size:11px;">Vous recevez cet e-mail car vous avez un compte chez JP's Logistics &amp; More LLC.</td></tr>
  </table>
</td></tr></table></body></html>`;
}

const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STEP_NAMES = ["Reçu à Miami", "En transit / douane", "Arrivé en Haïti", "Prêt pour retrait"];
const STATUS_COPY: Record<number, { title: string; text: string }> = {
  0: { title: "Votre colis est arrivé à Miami", text: "Nous avons bien reçu votre colis à notre dépôt de Miami. Il sera bientôt préparé pour l'expédition." },
  1: { title: "Votre colis est en route", text: "Votre colis est en transit et passe par la douane. Nous vous prévenons dès son arrivée en Haïti." },
  2: { title: "Votre colis est arrivé en Haïti", text: "Bonne nouvelle : votre colis est arrivé en Haïti. Il sera bientôt prêt pour le retrait ou la livraison." },
  3: { title: "Votre colis est prêt !", text: "Votre colis est prêt pour le retrait / la livraison. Contactez-nous pour organiser la remise." },
};

function progressBar(current: number): string {
  const cells = STEP_NAMES.map((name, i) => {
    const done = i <= current;
    return `<td width="25%" align="center" style="padding:0 3px;font-family:${FONT};">
      <div style="height:6px;border-radius:3px;background:${done ? "#FF5500" : "#DDE3F0"};"></div>
      <div style="margin-top:8px;font-size:11px;line-height:1.3;color:${done ? "#0D2B80" : "#9AA3B8"};font-weight:${i === current ? "bold" : "normal"};">${name}</div>
    </td>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 6px;"><tr>${cells}</tr></table>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid #E6EAF4;color:#6B7490;font-size:13px;font-family:${FONT};">${label}</td>
    <td align="right" style="padding:9px 0;border-bottom:1px solid #E6EAF4;color:#1B2540;font-size:14px;font-weight:bold;font-family:${FONT};">${value}</td>
  </tr>`;
}

// E-mail the client through Brevo when a shipment is added or its status changes.
async function emailClient(supabase: any, record: any, label: string, isNew: boolean): Promise<boolean> {
  if (!brevoKey) return false;
  try {
    const { data: client } = await supabase.from("clients").select("name,email").eq("id", record.client_id).maybeSingle();
    if (!client?.email) return false;

    const status = Math.min(Math.max(Number(record.status) || 0, 0), 3);
    const copy = STATUS_COPY[status];
    const first = String(client.name ?? "").split(" ")[0];
    const lbs = parseFloat(String(record.weight ?? "").replace(",", ".")) || 0;

    let rows = detailRow("N° de suivi", `<span style="font-family:'Courier New',monospace;">${record.tracking_number}</span>`);
    if (record.description) rows += detailRow("Description", String(record.description));
    if (record.type) rows += detailRow("Type", String(record.type));
    if (record.weight) rows += detailRow("Poids", String(record.weight));
    rows += detailRow("Statut", `<span style="color:#FF5500;">${label}</span>`);

    let priceHtml = "";
    if (record.price_per_lb !== null && record.price_per_lb !== undefined) {
      const fee = Number(record.logistics_fee ?? 0);
      const total = lbs * Number(record.price_per_lb) + fee;
      priceHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:#F4F7FF;border-radius:14px;"><tr><td style="padding:16px 18px;font-family:${FONT};">
          <div style="font-size:13px;color:#6B7490;">${lbs} lbs × ${usd(Number(record.price_per_lb))} + frais de logistique ${usd(fee)}</div>
          <div style="font-size:20px;font-weight:bold;color:#0D2B80;margin-top:4px;">Total à payer : ${usd(total)}</div>
        </td></tr></table>`;
    }

    const title = isNew ? "Nouveau colis enregistré" : copy.title;
    const intro = isNew
      ? `Un nouveau colis vient d'être enregistré à votre nom. ${copy.text}`
      : copy.text;
    const html = layout(
      title,
      `<p style="margin:0 0 4px;">Bonjour ${first},</p>
       <p style="margin:0;">${intro}</p>
       ${progressBar(status)}
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">${rows}</table>
       ${priceHtml}`,
      { label: "Suivre mon colis", url: `${SITE_URL}/#suivi` },
      `${record.tracking_number} : ${label}`,
    );
    const subject = isNew
      ? `Nouveau colis ${record.tracking_number} — JP's Logistics & More LLC`
      : `${copy.title} (${record.tracking_number}) — JP's Logistics & More LLC`;

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
