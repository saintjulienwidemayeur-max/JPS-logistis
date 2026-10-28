// Supabase Edge Function: pay-proxy
// The website's pay page (pay.html) calls this function; it forwards the call to the billing app, which talks to Stripe and records the payment.
// The browser never sees the billing app's address and never holds a Stripe key.
//
// Secret: BILLING_URL = the public address of the billing app (for example https://jps-billing.onrender.com), no trailing slash.
// Deploy with "Verify JWT" OFF (like the other functions): the signed token in every call is the key.
//
// POST JSON (header "apikey: <publishable key>"):
//   { action: "info",     t }                 what is owed on the receipt / invoice, the payments, the PDFs
//   { action: "checkout", t }                 opens the Stripe payment page: answers { url }
//   { action: "confirm",  t, session_id }     after Stripe sent the customer back: records the payment

const BILLING = (Deno.env.get("BILLING_URL") ?? "").replace(/\/$/, "");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!BILLING) return json({ error: "off" }, 503);
  let b: any;
  try { b = await req.json(); } catch (_e) { return json({ error: "bad" }, 400); }
  const action = String(b?.action ?? ""), t = String(b?.t ?? ""), sid = String(b?.session_id ?? "");
  if (!["info", "checkout", "confirm"].includes(action) || !/^[A-Za-z0-9_.%-]{10,200}$/.test(t) || (sid && !/^cs_[A-Za-z0-9_]+$/.test(sid))) return json({ error: "bad" }, 400);
  try {
    const r = await fetch(`${BILLING}/api/pay/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t, ...(sid && { session_id: sid }) }), signal: AbortSignal.timeout(55000) });
    const text = await r.text();
    // The billing app answers JSON; anything else (a login page, an error page: wrong BILLING_URL, app not redeployed) is reported as "upstream".
    try { JSON.parse(text); } catch (_e) { return json({ error: "upstream", message: `billing answered ${r.status} (not JSON): check BILLING_URL and redeploy the billing app` }, 502); }
    return new Response(text, { status: r.status, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (_e) { return json({ error: "unreachable" }, 502); }
});
