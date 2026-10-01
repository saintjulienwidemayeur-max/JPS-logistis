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
    return new Response(JSON.stringify({ sent: (subs ?? []).length }), { status: 200 });
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
