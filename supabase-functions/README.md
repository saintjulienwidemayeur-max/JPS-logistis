# Deployment steps (do this yourself; Claude cannot reach your Supabase project or your domain)

## 0. Installable PWA (Add to Home Screen)
`manifest.json`, `sw.js`, `icon-192.png` and `icon-512.png` in this folder
need to sit at the **root** of your real domain, next to your `index.html`
(e.g. `https://jpslogisticsmiami.com/manifest.json`). A single HTML file
opened locally, or the claude.ai preview link, can't host these — that's
also why the "Activer les notifications" button in the client dashboard
won't do anything until this step is done. Once these four files are at
your domain's root, phones will offer to install the site and push
notifications become possible.

## 0.1 SEO — logo indexing
`logo.png` (white background) also needs to sit at your domain's root
(`https://yourdomain.com/logo.png`). The HTML's SEO tags (Open Graph,
Twitter card, and the JSON-LD Organization schema) already point to that
path — they currently use the placeholder domain
`https://www.jpslogisticsmore.com`, so find-and-replace that with your
real domain once you have one, in `index.html`. Until
both the domain and this file are real and live, Google can't index the
logo or generate link previews — none of this works from the claude.ai
preview link or a locally opened file.

## 1. Notifications (daily greeting + status-change alerts) — optional
This wires up two things: a daily "good morning" push notification to clients,
and an automatic push when a shipment's status changes. Both are optional —
the website works fully without them.

### 1.1 Install the Supabase CLI and log in
    npm install -g supabase
    supabase login
    supabase link --project-ref wzlwnhmboqunflqzvlcb

### 1.2 Set the required secrets
    supabase secrets set VAPID_PUBLIC_KEY=BHO2p5gF1IfCgCPul-3P-tAW146h4D8aryRfqHqeU6g5JkK6o6jf9uS0DqMu9B6q8M9r3pn10hszx-_KMRyPCtE
    supabase secrets set VAPID_PRIVATE_KEY=slkGijVWOlsol6Ak2uS5eoam_hF6GY10ngWpgIie_Z4

(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically to
every Edge Function — you do not need to set those two yourself.)

⚠️ The private key above was generated for you in this conversation. Treat it
like the Supabase secret keys — it belongs only in this secret, never in the
website's code.

### 1.3 Deploy the function
    supabase functions deploy send-notifications

### 1.4 Schedule the daily morning greeting (run in SQL Editor)
```sql
select cron.schedule(
  'jps-daily-greeting',
  '0 12 * * *',  -- 12:00 UTC = 7:00/8:00 AM in Haiti depending on DST — adjust as you like
  $$
  select net.http_post(
    url := 'https://wzlwnhmboqunflqzvlcb.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  );
  $$
);
```
(Requires the `pg_cron` and `pg_net` extensions — enable both under
Database > Extensions if they aren't already on.)

### 1.5 Trigger the status-change alert automatically
Dashboard > Database > Webhooks > Create a new webhook
  - Table: shipments
  - Events: Update
  - Type: Supabase Edge Function
  - Function: send-notifications

That's it — from then on, whenever an admin changes a shipment's status,
subscribed clients get a push notification automatically, and everyone
subscribed gets the daily greeting at the scheduled time.

## How clients subscribe
The website already asks clients for notification permission from their
dashboard ("Activer les notifications") and stores their subscription in
the `push_subscriptions` table — nothing else to do for that part.
