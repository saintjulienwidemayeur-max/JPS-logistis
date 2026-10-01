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

function layout(title: string, inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#f3f5fa;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <div style="background:#0D2B80;border-radius:16px 16px 0 0;padding:20px 24px;color:#fff;font-size:18px;font-weight:bold;">JP's Logistics &amp; More LLC</div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:28px 24px;color:#1b2540;font-size:15px;line-height:1.6;">
      <h1 style="margin:0 0 12px;font-size:20px;">${title}</h1>
      ${inner}
    </div>
    <p style="text-align:center;color:#8a93a8;font-size:12px;margin-top:16px;">JP's Logistics &amp; More LLC · Miami, FL · contact@jpslogistics.me</p>
  </div></body></html>`;
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
      await sendMail(
        { email, name: existing?.name },
        isSignup ? "Votre code de vérification — JP's Logistics & More LLC" : "Réinitialisation de votre mot de passe — JP's Logistics & More LLC",
        layout(
          isSignup ? "Vérifiez votre e-mail" : "Mot de passe oublié",
          `<p>${isSignup ? "Voici votre code pour créer votre compte :" : "Voici votre code pour réinitialiser votre mot de passe :"}</p>
           <p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#0D2B80;margin:16px 0;">${code}</p>
           <p style="color:#6b7490;font-size:13px;">Ce code expire dans ${OTP_TTL_MINUTES} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>`,
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
            `<p>Votre compte est prêt. Voici votre numéro de boîte à Miami :</p>
             <p style="font-size:22px;font-weight:bold;color:#0D2B80;">${profile.box_number}</p>
             <p>Adresse : 8125 NW 67th St, Miami, FL 33166</p>`,
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
      return json({ ok: true });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (e) {
    const msg = (e as Error)?.message === "SEND_FAILED" ? "SEND_FAILED" : "SERVER_ERROR";
    if (msg === "SERVER_ERROR") console.error(e);
    return json({ error: msg }, 500);
  }
});
