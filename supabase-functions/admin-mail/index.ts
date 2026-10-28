// Supabase Edge Function: admin-mail
// Lets staff (owner / agent) write an e-mail from the admin panel and send it
// to one client or to ALL clients, through Brevo. Staff credentials are
// verified server-side (admin_login), so the function is useless without them.
//
// Secrets: BREVO_API_KEY (and optionally SITE_URL). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided automatically.
//
// POST JSON (header "apikey: <publishable key>"):
//   { action: "send",      staff_email, staff_password, client_id, subject, message, attachments?, cta_label?, cta_url?, cta_methods? }
//        attachments: up to 3 files [{ name, content }], content = the file in base64 (a PDF, at most 3 MB each): used by the warehouse
//        and billing apps to send the receipt / the invoice as a PDF.
//   { action: "send_to",   staff_email, staff_password, to_email, to_name?, lang?, subject, message, attachments?, cta_label?, cta_url?, cta_methods? }
//        to a customer who has no account on the website (the warehouse app sends receipts / invoices to the e-mail it has on file)
//   { action: "broadcast", staff_email, staff_password, subject, message }

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const brevoKey = Deno.env.get("BREVO_API_KEY")!;
const SENDER = { name: "JP's Logistics & More LLC", email: "contact@jpslogistics.me" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

// ---------- E-mail design (shared look for every e-mail) ----------
// The logo is loaded from your website: SITE_URL/logo.png (set the SITE_URL
// secret if your site is not at https://jpslogistics.me).
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://jpslogistics.me").replace(/\/$/, "");
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

type Lang = "fr" | "en" | "es";
const asLang = (l: unknown): Lang => (l === "en" || l === "es" ? l : "fr");
const FOOTNOTE: Record<Lang, string> = {
  fr: "Vous recevez cet e-mail car vous avez un compte chez JP's Logistics &amp; More LLC.",
  en: "You are receiving this email because you have an account with JP's Logistics &amp; More LLC.",
  es: "Usted recibe este correo porque tiene una cuenta en JP's Logistics &amp; More LLC.",
};

// The payment methods shown, very small, inside the "Pay online" button (plain text badges: e-mail apps do not show SVG).
const METHODS = ["VISA", "Mastercard", "AMEX", "Apple Pay", "Google Pay", "Link"];
const methodBadges = () => `<span style="display:block;margin-top:8px;line-height:1;font-size:0;">${METHODS.map((m) => `<span style="display:inline-block;background:#ffffff;color:#0D2B80;border-radius:4px;padding:3px 6px;margin:2px 2px 0;font-size:9px;line-height:11px;font-weight:800;font-family:${FONT};">${m}</span>`).join("")}</span>`;

function layout(title: string, inner: string, cta?: { label: string; url: string; methods?: boolean }, preheader = "", lang: Lang = "fr"): string {
  const button = cta
    ? `<tr><td align="center" style="background:#ffffff;padding:6px 28px 30px;">
         <a href="${cta.url}" style="display:inline-block;background:#FF5500;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 32px;border-radius:999px;font-family:${FONT};">${cta.label}${cta.methods ? methodBadges() : ""}</a>
       </td></tr>`
    : `<tr><td style="background:#ffffff;height:22px;line-height:22px;font-size:0;">&nbsp;</td></tr>`;
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
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
    <tr><td align="center" style="padding:14px;font-family:${FONT};color:#8A93A8;font-size:11px;">${FOOTNOTE[lang]}</td></tr>
  </table>
</td></tr></table></body></html>`;
}


const T = {
  fr: { hello: "Bonjour {first},", team: "L'équipe JP's Logistics &amp; More LLC", support: "Service client sur WhatsApp" },
  en: { hello: "Hello {first},", team: "The JP's Logistics &amp; More LLC team", support: "Customer service on WhatsApp" },
  es: { hello: "Hola {first},", team: "El equipo de JP's Logistics &amp; More LLC", support: "Servicio al cliente por WhatsApp" },
};

const escapeHtml = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The message as clean paragraphs: a first line that only greets the customer by name is dropped (the design already greets with the full name),
// blank lines separate paragraphs, **bold** works, "• " lines stay as a list.
function formatMessage(message: string, name: string): string {
  const lines = message.replace(/\r/g, "").split("\n");
  if (name && /^(dear|bonjour|hello|hola|estimad[oa](\/a)?)\b/i.test(lines[0] ?? "") && /,\s*$/.test(lines[0]) && lines[0].toLowerCase().includes(name.toLowerCase())) {
    lines.shift(); while (lines.length && lines[0].trim() === "") lines.shift();
  }
  return lines.join("\n").split(/\n{2,}/).map((b) => `<p style="margin:0 0 14px;">${escapeHtml(b).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>")}</p>`).join("");
}

// The "Pay online" button (with the payment methods, very small, inside it): right under the text, before "other ways to pay".
const payButton = (cta: { label: string; url: string; methods?: boolean }) =>
  `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:6px auto 22px;"><tr><td align="center" style="background:#FF5500;border-radius:18px;">
     <a href="${escapeHtml(cta.url)}" style="display:block;padding:14px 30px 12px;text-decoration:none;color:#ffffff;font-weight:bold;font-size:16px;text-align:center;font-family:${FONT};">${escapeHtml(cta.label)}${cta.methods ? methodBadges() : ""}</a>
   </td></tr></table>`;

function buildEmail(client: { name?: string; email: string; lang?: string }, subject: string, message: string, cta?: { label: string; url: string; methods?: boolean }) {
  const lang = asLang(client.lang);
  const tx = T[lang];
  const first = escapeHtml(String(client.name ?? "").trim()), name = String(client.name ?? "").trim();
  // The button goes before the "other ways to pay" part when the message has one, else at the end of the message.
  const cut = cta ? message.search(/\*\*(Autres moyens de paiement|Other ways to pay|Otras formas de pago)\*\*/) : -1;
  const body = !cta ? formatMessage(message, name) : cut > 0 ? formatMessage(message.slice(0, cut).trimEnd(), name) + payButton(cta) + formatMessage(message.slice(cut), "") : formatMessage(message, name) + payButton(cta);
  const html = layout(
    escapeHtml(subject),
    `<p style="margin:0 0 12px;">${tx.hello.replace("{first}", first)}</p>
     ${body}
     <p style="margin:20px 0 0;color:#6B7490;">${tx.team}</p>
     <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:22px auto 4px;"><tr><td style="background:#25D366;border-radius:999px;">
       <a href="https://wa.me/17864248025" style="display:block;padding:10px 22px 10px 14px;text-decoration:none;color:#ffffff;font-weight:bold;font-size:14px;font-family:${FONT};"><img src="${SITE_URL}/whatsapp.png" width="24" height="24" alt="WhatsApp" style="vertical-align:middle;border:0;margin-right:8px;"><span style="vertical-align:middle;">${tx.support}</span></a>
     </td></tr></table>`,
    undefined,
    escapeHtml(message).slice(0, 90),
    lang,
  );
  return html;
}

type Attachment = { name: string; content: string };
// An optional button under the message (the "Pay online" button): https only.
const ctaOf = (body: any): { label: string; url: string; methods?: boolean } | undefined => {
  const url = String(body?.cta_url ?? "").trim(), label = String(body?.cta_label ?? "").trim().slice(0, 40);
  return label && /^https:\/\/[^\s"<>]{4,480}$/.test(url) ? { label, url, methods: body?.cta_methods === true } : undefined;
};
async function sendMail(client: { name?: string; email: string; lang?: string }, subject: string, message: string, attachments: Attachment[] = [], cta?: { label: string; url: string; methods?: boolean }) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": brevoKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      replyTo: { email: SENDER.email, name: SENDER.name },
      to: [{ email: client.email, name: client.name }],
      subject,
      htmlContent: buildEmail(client, subject, message, cta),
      ...(attachments.length ? { attachment: attachments } : {}),
    }),
  });
  if (!res.ok) {
    console.error("Brevo error", res.status, await res.text());
    throw new Error("SEND_FAILED");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  let body: any;
  try { body = await req.json(); } catch (_e) { return json({ error: "BAD_REQUEST" }, 400); }

  // ---- staff check (owner / agent only) ----
  const { data: staff } = await supabase.rpc("admin_login", {
    p_email: String(body?.staff_email ?? ""), p_password: String(body?.staff_password ?? ""),
  });
  const me = Array.isArray(staff) ? staff[0] : null;
  if (!me || (me.role !== "owner" && me.role !== "agent")) return json({ error: "NOT_AUTHORIZED" }, 403);

  const subject = String(body?.subject ?? "").trim();
  const message = String(body?.message ?? "").trim();
  if (!subject || !message || subject.length > 150 || message.length > 5000) return json({ error: "BAD_REQUEST" }, 400);

  const getClients = async (filter?: { id: string }) => {
    let q = supabase.from("clients").select("name,email,lang");
    if (filter) q = q.eq("id", filter.id);
    let r = await q;
    if (r.error) { // `lang` column not created yet
      let q2 = supabase.from("clients").select("name,email");
      if (filter) q2 = q2.eq("id", filter.id);
      r = await q2;
    }
    return (r.data ?? []).filter((c: any) => c.email);
  };

  try {
    if (body?.action === "send") {
      const list = await getClients({ id: String(body.client_id ?? "") });
      if (!list.length) return json({ error: "CLIENT_NOT_FOUND" }, 404);
      // Optional files (base64): at most 3, each at most 3 MB, a plain file name.
      const files: Attachment[] = (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 3)
        .map((a: any) => ({ name: String(a?.name ?? "").replace(/[^\w.\- ]+/g, "_").slice(0, 80), content: String(a?.content ?? "") }))
        .filter((a: Attachment) => a.name && a.content && a.content.length <= 4_200_000 && /^[A-Za-z0-9+/=\s]+$/.test(a.content));
      await sendMail(list[0], subject, message, files, ctaOf(body));
      return json({ ok: true, sent: 1, total: 1, attached: files.length });
    }

    if (body?.action === "send_to") {
      const to = String(body.to_email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 120) return json({ error: "BAD_REQUEST" }, 400);
      const files: Attachment[] = (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 3)
        .map((a: any) => ({ name: String(a?.name ?? "").replace(/[^\w.\- ]+/g, "_").slice(0, 80), content: String(a?.content ?? "") }))
        .filter((a: Attachment) => a.name && a.content && a.content.length <= 4_200_000 && /^[A-Za-z0-9+/=\s]+$/.test(a.content));
      await sendMail({ name: String(body.to_name ?? "").slice(0, 80), email: to, lang: String(body.lang ?? "fr") }, subject, message, files, ctaOf(body));
      return json({ ok: true, sent: 1, total: 1, attached: files.length });
    }

    if (body?.action === "send_many") {
      // A list of client ids, the same message (the warehouse app sends 100 at a time).
      const ids = Array.isArray(body.client_ids) ? body.client_ids.map(String).slice(0, 200) : [];
      if (!ids.length) return json({ error: "BAD_REQUEST" }, 400);
      let q = supabase.from("clients").select("name,email,lang").in("id", ids);
      let r = await q;
      if (r.error) r = await supabase.from("clients").select("name,email").in("id", ids); // `lang` column not created yet
      const list = (r.data ?? []).filter((c: any) => c.email);
      let sent = 0;
      for (let i = 0; i < list.length; i += 10) {
        const results = await Promise.allSettled(list.slice(i, i + 10).map((c: any) => sendMail(c, subject, message)));
        sent += results.filter((x) => x.status === "fulfilled").length;
      }
      return json({ ok: true, sent, total: list.length });
    }

    if (body?.action === "broadcast") {
      const list = await getClients();
      let sent = 0;
      for (let i = 0; i < list.length; i += 10) {
        const chunk = list.slice(i, i + 10);
        const results = await Promise.allSettled(chunk.map((c: any) => sendMail(c, subject, message)));
        sent += results.filter((r) => r.status === "fulfilled").length;
      }
      return json({ ok: true, sent, total: list.length });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (e) {
    const code = (e as Error)?.message === "SEND_FAILED" ? "SEND_FAILED" : "SERVER_ERROR";
    if (code === "SERVER_ERROR") console.error(e);
    return json({ error: code }, 500);
  }
});
