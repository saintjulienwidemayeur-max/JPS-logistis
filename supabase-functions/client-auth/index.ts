// Supabase Edge Function: client-auth
// Sends OTP e-mails through Brevo and performs the sensitive account actions
// (signup, password reset) only after the e-mailed code has been verified.
//
// Secrets required (Edge Functions > Secrets):
//   BREVO_API_KEY   = your Brevo API key (xkeysib-...)  — NEVER put it in the website
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically)
//
// Actions (POST JSON, header "apikey: <publishable key>"):
//   { action: "send_otp", purpose: "signup" | "reset", email, phone? }
//   { action: "signup", name, email, phone, address, password, code }
//   { action: "reset_password", email, code, new_password }

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const brevoKey = Deno.env.get("BREVO_API_KEY")!;

const SENDER = { name: "JP's Logistics & More LLC", email: "contact@jpslogistics.me" };
const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const hashCode = (email: string, purpose: string, code: string) => sha256(`${email}|${purpose}|${code}`);

function newCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0];
  return String(100000 + (n % 900000));
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

async function sendMail(to: { email: string; name?: string }, subject: string, html: string) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": brevoKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: SENDER, to: [to], subject, htmlContent: html }),
  });
  if (!res.ok) {
    console.error("Brevo error", res.status, await res.text());
    throw new Error("SEND_FAILED");
  }
}

const normPhone = (p: string) => String(p ?? "").replace(/\D/g, "");

async function verifyOtp(email: string, purpose: string, code: string) {
  const { data: row } = await supabase
    .from("email_otps").select("*")
    .eq("email", email).eq("purpose", purpose).eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row) return "INVALID_CODE";
  if (row.attempts >= MAX_ATTEMPTS) return "TOO_MANY_ATTEMPTS";
  await supabase.from("email_otps").update({ attempts: row.attempts + 1 }).eq("id", row.id);
  if (row.code_hash !== (await hashCode(email, purpose, String(code ?? "").trim()))) return "INVALID_CODE";
  await supabase.from("email_otps").update({ used: true }).eq("id", row.id);
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  let body: any;
  try { body = await req.json(); } catch (_e) { return json({ error: "BAD_REQUEST" }, 400); }
  const action = body?.action;
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "INVALID_EMAIL" }, 400);

  try {
    // ---------------------------------------------------------- send_otp
    if (action === "send_otp") {
      const purpose = body.purpose;
      if (purpose !== "signup" && purpose !== "reset") return json({ error: "BAD_REQUEST" }, 400);

      const { data: existing } = await supabase.from("clients").select("id, name").eq("email", email).maybeSingle();

      if (purpose === "signup") {
        if (existing) return json({ error: "EMAIL_TAKEN" }, 409);
        const phone = normPhone(body.phone);
        if (phone) {
          const { data: taken } = await supabase.rpc("phone_in_use", { p_phone: phone });
          if (taken) return json({ error: "PHONE_TAKEN" }, 409);
        }
      } else if (!existing) {
        return json({ ok: true }); // don't reveal whether the account exists
      }

      // Rate limit: 1 per 60s, 5 per hour
      const { data: recent } = await supabase.from("email_otps").select("created_at")
        .eq("email", email).eq("purpose", purpose)
        .gt("created_at", new Date(Date.now() - 3600_000).toISOString())
        .order("created_at", { ascending: false });
      if (recent && recent.length >= 5) return json({ error: "RATE_LIMIT" }, 429);
      if (recent && recent[0] && Date.now() - new Date(recent[0].created_at).getTime() < 60_000) {
        return json({ error: "RATE_LIMIT" }, 429);
      }

      const code = newCode();
      await supabase.from("email_otps").insert({
        email, purpose,
        code_hash: await hashCode(email, purpose, code),
        expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString(),
      });

      const isSignup = purpose === "signup";
      const codeBox = `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:18px auto;"><tr>
          <td style="background:#EEF3FF;border:2px dashed #0D2B80;border-radius:14px;padding:14px 26px;font-size:34px;letter-spacing:10px;font-weight:bold;color:#0D2B80;font-family:'Courier New',monospace;">${code}</td>
        </tr></table>`;
      await sendMail(
        { email, name: existing?.name },
        isSignup ? "Votre code de vérification — JP's Logistics & More LLC" : "Réinitialisation de votre mot de passe — JP's Logistics & More LLC",
        layout(
          isSignup ? "Vérifiez votre e-mail" : "Mot de passe oublié ?",
          `<p style="margin:0 0 6px;">${isSignup
              ? "Merci de vous inscrire chez JP's Logistics &amp; More LLC. Entrez ce code pour finaliser la création de votre compte :"
              : "Pas de souci. Entrez ce code pour choisir un nouveau mot de passe :"}</p>
           ${codeBox}
           <p style="margin:0;color:#6B7490;font-size:13px;text-align:center;">Ce code expire dans ${OTP_TTL_MINUTES} minutes.<br>Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet e-mail.</p>`,
          undefined,
          `Votre code : ${code}`,
        ),
      );
      return json({ ok: true });
    }

    // ------------------------------------------------------------ signup
    if (action === "signup") {
      const { name, phone, address, password, code } = body;
      if (!name || !phone || !address || !password || String(password).length < 6) return json({ error: "BAD_REQUEST" }, 400);

      const bad = await verifyOtp(email, "signup", code);
      if (bad) return json({ error: bad }, 400);

      const { data, error } = await supabase.rpc("client_signup", {
        p_name: String(name).trim(), p_email: email, p_phone: String(phone).trim(),
        p_address: String(address).trim(), p_password: String(password),
      });
      if (error) {
        const m = error.message || "";
        if (m.includes("EMAIL_TAKEN")) return json({ error: "EMAIL_TAKEN" }, 409);
        if (m.includes("PHONE_TAKEN")) return json({ error: "PHONE_TAKEN" }, 409);
        console.error("client_signup error", m);
        return json({ error: "SIGNUP_FAILED" }, 500);
      }
      const profile = data && data[0];
      if (!profile) return json({ error: "SIGNUP_FAILED" }, 500);

      // Welcome e-mail (best effort)
      try {
        await sendMail(
          { email, name: profile.name },
          "Bienvenue chez JP's Logistics & More LLC",
          layout(
            `Bienvenue, ${String(profile.name).split(" ")[0]} !`,
            `<p style="margin:0 0 14px;">Votre compte est prêt. Voici votre adresse à Miami pour tous vos achats :</p>
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FF;border-radius:14px;"><tr><td style="padding:16px 18px;">
               <div style="font-size:12px;color:#6B7490;text-transform:uppercase;letter-spacing:1px;">Votre numéro de boîte</div>
               <div style="font-size:24px;font-weight:bold;color:#0D2B80;margin:2px 0 10px;">${profile.box_number}</div>
               <div style="font-size:14px;color:#1B2540;">${profile.name}<br>${profile.box_number}<br>8125 NW 67th St<br>Miami, FL 33166</div>
             </td></tr></table>
             <p style="margin:14px 0 0;">Dès que vos colis arrivent, nous vous prévenons par e-mail et par notification.</p>`,
            { label: "Accéder à mon espace", url: SITE_URL },
            "Votre compte JP's Logistics est prêt.",
          ),
        );
      } catch (_e) { /* ignore */ }

      return json({ ok: true, profile });
    }

    // ---------------------------------------------------- reset_password
    if (action === "reset_password") {
      const { code, new_password } = body;
      if (!new_password || String(new_password).length < 6) return json({ error: "BAD_REQUEST" }, 400);
      const bad = await verifyOtp(email, "reset", code);
      if (bad) return json({ error: bad }, 400);
      const { data: ok, error } = await supabase.rpc("client_reset_password", {
        p_email: email, p_new_password: String(new_password),
      });
      if (error || !ok) return json({ error: "RESET_FAILED" }, 500);
      try {
        await sendMail(
          { email },
          "Votre mot de passe a été modifié — JP's Logistics & More LLC",
          layout(
            "Mot de passe modifié",
            `<p style="margin:0 0 10px;">Le mot de passe de votre compte vient d'être modifié.</p>
             <p style="margin:0;color:#6B7490;font-size:13px;">Si ce n'était pas vous, contactez-nous immédiatement à contact@jpslogistics.me.</p>`,
            { label: "Me connecter", url: SITE_URL },
            "Votre mot de passe a été modifié.",
          ),
        );
      } catch (_e) { /* ignore */ }
      return json({ ok: true });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (e) {
    const msg = (e as Error)?.message === "SEND_FAILED" ? "SEND_FAILED" : "SERVER_ERROR";
    if (msg === "SERVER_ERROR") console.error(e);
    return json({ error: msg }, 500);
  }
});
