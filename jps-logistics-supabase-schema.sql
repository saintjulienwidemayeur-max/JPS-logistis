-- ============================================================
-- JP's Logistics & More — Supabase schema v2
-- Run this in: Supabase Dashboard > SQL Editor > New query
--
-- CHANGE FROM v1: authentication no longer depends on Supabase Auth
-- email delivery (no Brevo / no confirmed working auth email yet).
-- Customers sign up and log in with email + password now. The
-- "forgot password" flow still shows a code directly in the browser
-- instead of emailing it — same phase-1 placeholder as before, just
-- narrowed down to that one flow (see client_reset_password below).
-- Staff accounts (owner/agent/comptable) use their own email+password,
-- checked only through the RPC functions below — their table is never
-- directly readable through the API, so the anon key alone cannot list
-- staff or read password hashes.
-- ============================================================

-- Clean slate for the tables this version replaces (safe to run once)
-- (removed) drop table if exists public.shipments cascade;  <- this used to wipe all data when the file was re-run
-- (removed) drop table if exists public.client_auth cascade;  <- this used to wipe all data when the file was re-run
-- (removed) drop table if exists public.clients cascade;  <- this used to wipe all data when the file was re-run

-- 1) CLIENTS ---------------------------------------------------
-- NOTE: kept broadly readable/writable by the anon key for now, since
-- there is no real per-visitor session to scope access to. This means
-- anyone who inspects the site and calls the Supabase REST API directly
-- (not just people using the admin panel) could read client name/phone/
-- address/email. Tighten this once real auth (Brevo-verified OTP, or
-- Supabase Auth) is wired up — see the note at the bottom of this file.
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null unique,
  phone       text,
  address     text,
  city        text,
  country     text,
  box_number  text unique,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

alter table public.clients enable row level security;

drop policy if exists "clients open read"   on public.clients;
drop policy if exists "clients open insert" on public.clients;
drop policy if exists "clients open update" on public.clients;

create policy "clients open read"   on public.clients for select using ( true );
create policy "clients open update" on public.clients for update using ( true );
-- No open insert policy: new client rows are only ever created through the
-- client_signup() function below (it runs as security definer), so a
-- password can be set atomically at the same time as the profile.

-- 1a) Simple password hashing helper (used by everything below) -------
-- Supabase installs pgcrypto into the "extensions" schema by default, not
-- "public" — the function's search_path includes both so digest() resolves
-- either way.
create extension if not exists pgcrypto;

create or replace function public.jps_hash(p_password text)
returns text language sql immutable
set search_path = public, extensions
as $$
  select encode(digest(p_password, 'sha256'), 'hex');
$$;

-- 1b) CLIENT AUTH — password hashes, never directly readable -----------
create table if not exists public.client_auth (
  client_id     uuid primary key references public.clients(id) on delete cascade,
  password_hash text not null
);
alter table public.client_auth enable row level security;
-- Intentionally no policies here either — same reasoning as public.admins
-- above: everything goes through the security-definer functions below.

-- 1c) client_signup: create profile + password together -----------------
create or replace function public.client_signup(
  p_name text, p_email text, p_phone text, p_address text, p_password text
) returns table(id uuid, name text, email text, phone text, address text, box_number text)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_box text;
begin
  if exists (select 1 from public.clients c0 where c0.email = lower(p_email)) then
    raise exception 'EMAIL_TAKEN';
  end if;

  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) > 0 and exists (
    select 1 from public.clients c1
    where regexp_replace(coalesce(c1.phone, ''), '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
  ) then
    raise exception 'PHONE_TAKEN';
  end if;

  v_box := 'JPS-' || floor(1000 + random() * 9000)::int;

  insert into public.clients (name, email, phone, address, box_number)
  values (p_name, lower(p_email), p_phone, p_address, v_box)
  returning clients.id into v_id;

  insert into public.client_auth (client_id, password_hash)
  values (v_id, public.jps_hash(p_password));

  return query select c.id, c.name, c.email, c.phone, c.address, c.box_number
    from public.clients c where c.id = v_id;
end;
$$;

-- 1d) client_login: verify email+password, return the profile -----------
create or replace function public.client_login(p_email text, p_password text)
returns table(id uuid, name text, email text, phone text, address text, city text, country text, box_number text, avatar_url text)
language plpgsql security definer set search_path = public as $$
begin
  return query
    select c.id, c.name, c.email, c.phone, c.address, c.city, c.country, c.box_number, c.avatar_url
    from public.clients c
    join public.client_auth a on a.client_id = c.id
    where c.email = lower(p_email) and a.password_hash = public.jps_hash(p_password);
end;
$$;

-- 1e) client_reset_password: set a new password for an email --------------
-- NOTE: same phase-1 limitation as the rest of customer auth — since there
-- is no real email sending (Brevo) yet, this only checks that the email
-- exists, not that the requester actually owns that inbox. The on-screen
-- code shown in the browser during "Mot de passe oublié" is a placeholder
-- UI step, not real proof of identity. Tighten this once Brevo (or another
-- real email flow) sends the reset code instead of displaying it locally.
create or replace function public.client_reset_password(p_email text, p_new_password text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from public.clients where email = lower(p_email);
  if v_id is null then
    return false;
  end if;

  insert into public.client_auth (client_id, password_hash)
  values (v_id, public.jps_hash(p_new_password))
  on conflict (client_id) do update set password_hash = excluded.password_hash;

  return true;
end;
$$;

-- 2) SHIPMENTS ---------------------------------------------------
create table if not exists public.shipments (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients(id) on delete cascade,
  tracking_number  text not null,
  type             text,
  description      text,
  weight           text,
  status           int  not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.shipments enable row level security;

drop policy if exists "shipments open read"   on public.shipments;
drop policy if exists "shipments open insert" on public.shipments;
drop policy if exists "shipments open update" on public.shipments;

create policy "shipments open read"   on public.shipments for select using ( true );
create policy "shipments open insert" on public.shipments for insert with check ( true );
create policy "shipments open update" on public.shipments for update using ( true );

-- 2b) PRICING on shipments: USD per lb + logistics fee ---------------
alter table public.shipments add column if not exists price_per_lb   numeric(10,2);
alter table public.shipments add column if not exists logistics_fee  numeric(10,2) not null default 0;

-- 3) STAFF (owner / agent / comptable) — never directly readable ---
create table if not exists public.admins (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null unique,
  role        text not null default 'agent',  -- 'owner' | 'agent' | 'comptable'
  password_hash text not null,
  created_at  timestamptz not null default now()
);

alter table public.admins enable row level security;
-- Intentionally NO select/insert/update policy for anon/authenticated here.
-- RLS with no matching policy = default deny. All access goes through the
-- security-definer functions below, which run with elevated rights and
-- decide for themselves what to reveal or change.

-- 5) admin_login: verify email+password, return profile (no hash) ----
create or replace function public.admin_login(p_email text, p_password text)
returns table(id uuid, name text, email text, role text)
language plpgsql security definer set search_path = public as $$
begin
  return query
    select a.id, a.name, a.email, a.role
    from public.admins a
    where a.email = lower(p_email)
      and a.password_hash = public.jps_hash(p_password);
end;
$$;

-- 6) create_staff: only an existing 'owner' can create new staff -----
create or replace function public.create_staff(
  p_owner_email text, p_owner_password text,
  p_name text, p_email text, p_password text, p_role text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_owner record;
begin
  select * into v_owner from public.admins
    where email = lower(p_owner_email)
      and password_hash = public.jps_hash(p_owner_password)
      and role = 'owner';

  if v_owner.id is null then
    raise exception 'Not authorized';
  end if;

  insert into public.admins (name, email, role, password_hash)
  values (p_name, lower(p_email), coalesce(p_role, 'agent'), public.jps_hash(p_password));

  return true;
end;
$$;

-- 7) list_staff: any valid staff member can see the team list --------
create or replace function public.list_staff(p_email text, p_password text)
returns table(id uuid, name text, email text, role text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.admins a0
    where a0.email = lower(p_email) and a0.password_hash = public.jps_hash(p_password)
  ) then
    raise exception 'Not authorized';
  end if;

  return query select a.id, a.name, a.email, a.role, a.created_at from public.admins a order by a.created_at;
end;
$$;

-- 8) update_admin_profile: change your own name/email/password -------
create or replace function public.update_admin_profile(
  p_email text, p_current_password text,
  p_new_name text, p_new_email text, p_new_password text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from public.admins
    where email = lower(p_email) and password_hash = public.jps_hash(p_current_password);

  if v_id is null then
    raise exception 'Not authorized';
  end if;

  update public.admins set
    name = coalesce(nullif(p_new_name,''), name),
    email = coalesce(nullif(lower(p_new_email),''), email),
    password_hash = case when p_new_password is not null and p_new_password <> ''
                          then public.jps_hash(p_new_password) else password_hash end
  where id = v_id;

  return true;
end;
$$;

-- 9) PUSH SUBSCRIPTIONS (for the daily greeting + status-change alerts) --
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  subscription jsonb not null,
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push open insert" on public.push_subscriptions;
create policy "push open insert" on public.push_subscriptions for insert with check ( true );
-- No select policy: subscriptions (which are effectively sensitive tokens)
-- are only ever read by the Edge Function, using the service_role key
-- there (server-side only — never in this website's code).

-- ============================================================
-- ONE-TIME STEP — create your first "owner" account (yourself):
--
--   insert into public.admins (name, email, role, password_hash)
--   values ('Widemayeur', 'admin@jps.com', 'owner', public.jps_hash('48881894'));
--
-- Only an 'owner' can create new agent/comptable accounts from the
-- admin panel afterwards — agents/comptables cannot create more staff.
-- ============================================================

-- ============================================================
-- SECURITY NOTE — read this before real customers use the site:
-- clients/shipments are wide open to the anon key right now (see the
-- comment on the clients table above). This was requested as an interim
-- step while email sending (Brevo) isn't wired up. Once it is, the plan
-- is to move customer auth to real verified email (Brevo-sent OTP or
-- Supabase Auth) and lock clients/shipments down the same way admins/
-- staff already are in this file (RPC-only access, no open policies).
-- ============================================================

-- ============================================================
-- OPTIONAL — daily "good morning" notification schedule.
-- Only run this AFTER you have deployed the send-notifications
-- Edge Function (see supabase-functions/README.md, steps 1-3).
-- ============================================================

-- Enable the extensions this needs (Database > Extensions, or here):
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'jps-daily-greeting',
  '0 12 * * *',  -- 12:00 UTC ≈ 7-8 AM in Haiti depending on DST — adjust as you like
  $$
  select net.http_post(
    url := 'https://wzlwnhmboqunflqzvlcb.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- To change the time later:
--   select cron.unschedule('jps-daily-greeting');
--   then re-run the cron.schedule(...) call above with a new time.

-- The status-change alert is NOT a cron job — it's set up separately as a
-- Database Webhook (Dashboard > Database > Webhooks, table: shipments,
-- event: Update, target: the send-notifications Edge Function). No SQL
-- needed for that part.


-- ============================================================
-- 10) E-MAIL OTP + locked-down signup / password reset
-- Signup and password reset are now done by the `client-auth` Edge
-- Function (service_role) AFTER it verified a code e-mailed through
-- Brevo. The browser can no longer call those two RPCs directly.
-- ============================================================
create table if not exists public.email_otps (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  purpose     text not null check (purpose in ('signup','reset')),
  code_hash   text not null,
  attempts    int  not null default 0,
  used        boolean not null default false,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists email_otps_lookup on public.email_otps (email, purpose, created_at desc);
alter table public.email_otps enable row level security;
-- No policies on purpose: only the service_role (Edge Function) can touch it.

-- One account per phone number (digits only)
create or replace function public.phone_in_use(p_phone text)
returns boolean
language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.clients c
    where length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) > 0
      and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
  );
$$;

revoke execute on function public.client_signup(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.client_reset_password(text, text)           from public, anon, authenticated;
revoke execute on function public.phone_in_use(text)                          from public, anon, authenticated;
grant  execute on function public.client_signup(text, text, text, text, text) to service_role;
grant  execute on function public.client_reset_password(text, text)           to service_role;
grant  execute on function public.phone_in_use(text)                          to service_role;

-- 11) Preferred language of each client (fr / en / es): used for e-mails and push
alter table public.clients add column if not exists lang text not null default 'fr';

-- 12) delete_shipment: staff-only (owner / agent), checked with the staff e-mail + password
create or replace function public.delete_shipment(p_email text, p_password text, p_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.admins a0
    where a0.email = lower(p_email)
      and a0.password_hash = public.jps_hash(p_password)
      and a0.role in ('owner', 'agent')
  ) then
    raise exception 'Not authorized';
  end if;
  delete from public.shipments where id = p_id;
  return true;
end;
$$;
revoke execute on function public.delete_shipment(text, text, uuid) from public;
grant  execute on function public.delete_shipment(text, text, uuid) to anon, authenticated;


-- ============================================================
-- 13) PRE-ALERTS ("annoncer un colis")
-- The customer announces an online order BEFORE it reaches the Miami
-- warehouse: only the minimum JP's needs (carrier, final tracking number,
-- store, what is inside, value, Air or Sea). The warehouse app reads this
-- table with the service_role key; when the parcel is scanned, the tracking
-- number matches the customer at once. Run this block once in the SQL Editor.
-- Same trust model as the rest of the customer area (the client id is the
-- key) but stricter: the table itself has NO policy, everything goes
-- through the functions below.
-- ============================================================
create table if not exists public.prealerts (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  carrier         text not null,
  tracking_number text not null,
  store           text not null,
  contents        text not null,
  declared_value  numeric(10,2) not null check (declared_value > 0),
  ship_choice     text check (ship_choice in ('Air','Ocean')),
  wait            boolean not null default false,   -- "wait for my other orders" (held up to 3 shipments)
  restricted      boolean not null default false,   -- battery, liquid, aerosol, perfume...
  status          text not null default 'expected' check (status in ('expected','received','cancelled')),
  affirmed_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists prealerts_tracking_active on public.prealerts (tracking_number) where status <> 'cancelled';
create index if not exists prealerts_client on public.prealerts (client_id, created_at desc);
alter table public.prealerts enable row level security;
-- No policies on purpose: only the functions below and the service_role can touch it.

create or replace function public.client_add_prealert(
  p_client_id uuid, p_carrier text, p_tracking text, p_store text, p_contents text,
  p_value numeric, p_ship text, p_wait boolean, p_restricted boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_track text := upper(regexp_replace(coalesce(p_tracking, ''), '[\s-]', '', 'g'));
  v_id uuid;
begin
  if not exists (select 1 from public.clients c where c.id = p_client_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if v_track !~ '^[A-Z0-9]{8,40}$' then raise exception 'BAD_TRACKING'; end if;
  if length(btrim(coalesce(p_carrier, ''))) = 0 or length(btrim(coalesce(p_store, ''))) = 0 or length(btrim(coalesce(p_contents, ''))) = 0 then raise exception 'MISSING_FIELDS'; end if;
  if p_value is null or p_value <= 0 or p_value > 1000000 then raise exception 'BAD_VALUE'; end if;
  if p_ship is not null and p_ship not in ('Air','Ocean') then raise exception 'BAD_SHIP'; end if;
  begin
    insert into public.prealerts (client_id, carrier, tracking_number, store, contents, declared_value, ship_choice, wait, restricted)
    values (p_client_id, left(btrim(p_carrier), 40), v_track, left(btrim(p_store), 80), left(btrim(p_contents), 160), round(p_value, 2), p_ship, coalesce(p_wait, false), coalesce(p_restricted, false))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'TRACKING_TAKEN';
  end;
  return v_id;
end;
$$;

create or replace function public.client_list_prealerts(p_client_id uuid)
returns table(id uuid, carrier text, tracking_number text, store text, contents text, declared_value numeric, ship_choice text, wait boolean, restricted boolean, status text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select p.id, p.carrier, p.tracking_number, p.store, p.contents, p.declared_value, p.ship_choice, p.wait, p.restricted, p.status, p.created_at
  from public.prealerts p where p.client_id = p_client_id and p.status <> 'cancelled' order by p.created_at desc limit 100;
$$;

-- Change the shipping choice (Air / Sea / wait) while the parcel has not arrived.
create or replace function public.client_update_prealert(p_client_id uuid, p_id uuid, p_ship text, p_wait boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_ship is not null and p_ship not in ('Air','Ocean') then raise exception 'BAD_SHIP'; end if;
  update public.prealerts set ship_choice = p_ship, wait = coalesce(p_wait, false), updated_at = now()
  where id = p_id and client_id = p_client_id and status = 'expected';
  return found;
end;
$$;

create or replace function public.client_cancel_prealert(p_client_id uuid, p_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.prealerts set status = 'cancelled', updated_at = now()
  where id = p_id and client_id = p_client_id and status = 'expected';
  return found;
end;
$$;

revoke execute on function public.client_add_prealert(uuid, text, text, text, text, numeric, text, boolean, boolean) from public;
revoke execute on function public.client_list_prealerts(uuid)                  from public;
revoke execute on function public.client_update_prealert(uuid, uuid, text, boolean) from public;
revoke execute on function public.client_cancel_prealert(uuid, uuid)           from public;
grant  execute on function public.client_add_prealert(uuid, text, text, text, text, numeric, text, boolean, boolean) to anon, authenticated;
grant  execute on function public.client_list_prealerts(uuid)                  to anon, authenticated;
grant  execute on function public.client_update_prealert(uuid, uuid, text, boolean) to anon, authenticated;
grant  execute on function public.client_cancel_prealert(uuid, uuid)           to anon, authenticated;


-- ============================================================
-- 14) INVITATIONS FROM THE WAREHOUSE APP: who signed in + change my password
-- Run this block once in the SQL Editor.
-- ============================================================
-- When a customer last signed in (the warehouse app counts who accepted the invitation).
alter table public.clients add column if not exists last_login_at timestamptz;

-- client_login now also stamps the sign-in time (same result columns as before).
create or replace function public.client_login(p_email text, p_password text)
returns table(id uuid, name text, email text, phone text, address text, city text, country text, box_number text, avatar_url text)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select c.id into v_id
    from public.clients c
    join public.client_auth a on a.client_id = c.id
    where c.email = lower(p_email) and a.password_hash = public.jps_hash(p_password);
  if v_id is null then return; end if;
  update public.clients set last_login_at = now() where clients.id = v_id;
  return query
    select c.id, c.name, c.email, c.phone, c.address, c.city, c.country, c.box_number, c.avatar_url
    from public.clients c where c.id = v_id;
end;
$$;

-- A customer changes their own password (the current one is checked). Used by "Changer mon mot de passe" in the customer area.
create or replace function public.client_change_password(p_email text, p_current text, p_new text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if length(coalesce(p_new, '')) < 8 then raise exception 'WEAK_PASSWORD'; end if;
  select c.id into v_id
    from public.clients c
    join public.client_auth a on a.client_id = c.id
    where c.email = lower(p_email) and a.password_hash = public.jps_hash(p_current);
  if v_id is null then return false; end if;
  update public.client_auth set password_hash = public.jps_hash(p_new) where client_id = v_id;
  return true;
end;
$$;
revoke execute on function public.client_change_password(text, text, text) from public;
grant  execute on function public.client_change_password(text, text, text) to anon, authenticated;


-- ============================================================
-- 15) ESTIMATE REQUESTS: a customer asks JP's to price some boxes
-- The customer types the boxes (size, weight, contents) on the website; the warehouse app reads the requests (service_role) on its
-- Estimate page, prices them, and answers by e-mail. The table has NO policy: only the functions below and the service_role touch it.
-- Run this block once in the SQL Editor.
-- ============================================================
create table if not exists public.estimate_requests (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  boxes           jsonb not null,                    -- [{ "qty": 1, "l": 20, "w": 16, "h": 12, "lbs": 25, "contents": "shoes" }, ...]
  ship_choice     text check (ship_choice in ('Air','Ocean')),
  declared_value  numeric(10,2),
  note            text,
  status          text not null default 'new' check (status in ('new','answered')),
  created_at      timestamptz not null default now(),
  answered_at     timestamptz
);
create index if not exists estimate_requests_client on public.estimate_requests (client_id, created_at desc);
alter table public.estimate_requests enable row level security;

create or replace function public.client_add_estimate(
  p_client_id uuid, p_boxes jsonb, p_ship text, p_declared numeric, p_note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; b jsonb;
begin
  if not exists (select 1 from public.clients c where c.id = p_client_id) then raise exception 'NOT_AUTHORIZED'; end if;
  if p_boxes is null or jsonb_typeof(p_boxes) <> 'array' or jsonb_array_length(p_boxes) = 0 or jsonb_array_length(p_boxes) > 10 then raise exception 'BAD_BOXES'; end if;
  for b in select * from jsonb_array_elements(p_boxes) loop
    if coalesce((b->>'l')::numeric, 0) <= 0 or coalesce((b->>'w')::numeric, 0) <= 0 or coalesce((b->>'h')::numeric, 0) <= 0
       or coalesce((b->>'lbs')::numeric, 0) <= 0 or coalesce((b->>'qty')::numeric, 0) < 1
       or (b->>'l')::numeric > 200 or (b->>'w')::numeric > 200 or (b->>'h')::numeric > 200 or (b->>'lbs')::numeric > 2000 or (b->>'qty')::numeric > 500 then
      raise exception 'BAD_BOXES';
    end if;
  end loop;
  if p_ship is not null and p_ship not in ('Air','Ocean') then raise exception 'BAD_SHIP'; end if;
  if (select count(*) from public.estimate_requests r where r.client_id = p_client_id and r.created_at > now() - interval '1 day') >= 10 then raise exception 'TOO_MANY'; end if;
  insert into public.estimate_requests (client_id, boxes, ship_choice, declared_value, note)
  values (p_client_id, p_boxes, p_ship, case when p_declared > 0 then round(p_declared, 2) end, left(btrim(coalesce(p_note, '')), 500))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.client_list_estimates(p_client_id uuid)
returns table(id uuid, boxes jsonb, ship_choice text, declared_value numeric, note text, status text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select r.id, r.boxes, r.ship_choice, r.declared_value, r.note, r.status, r.created_at
  from public.estimate_requests r where r.client_id = p_client_id order by r.created_at desc limit 20;
$$;

-- Same trust model as pre-alerts: the browser only calls the functions, with the customer's id.
revoke all on table public.estimate_requests from anon, authenticated;
grant execute on function public.client_add_estimate(uuid, jsonb, text, numeric, text) to anon, authenticated;
grant execute on function public.client_list_estimates(uuid) to anon, authenticated;


-- ============================================================
-- 16. Direction of a parcel: 'HT' = Miami -> Haiti (the default, every parcel so far),
--     'US' = Haiti -> Miami. The warehouse app writes 'US' for parcels sent from Haiti to Miami
--     (only after the box "The website knows the Haiti -> Miami direction" is ticked in its Fees & rates page).
-- ============================================================
alter table public.shipments add column if not exists direction text not null default 'HT';


-- ============================================================
-- 17. Receipts (WR), invoices and payments in the customer's space (online payment).
--     The warehouse and billing apps write these tables with the service_role key: a receipt appears here once it was sent to the customer,
--     and is updated with its invoice and every payment. The customer only reads them through the two functions below
--     (same trust model as pre-alerts: the client id is the key). "pay_url" opens the secure payment page (Stripe);
--     "wr_pdf_url" / "invoice_pdf_url" open the PDFs; "receipt_url" opens the PDF receipt of one payment.
--     Safe to run again (and after the first version of this section).
-- ============================================================
create table if not exists public.client_receipts (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  wr_id           text not null unique,
  receipt_code    text,
  receipt_date    text,
  ship            text,
  pieces          integer not null default 0,
  weight          numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  paid            numeric(12,2) not null default 0,
  balance         numeric(12,2) not null default 0,
  status          text not null default 'unpaid' check (status in ('unpaid','partial','paid')),
  invoice_no      text,
  pay_url         text,
  wr_pdf_url      text,
  invoice_pdf_url text,
  updated_at      timestamptz not null default now()
);
create index if not exists client_receipts_client on public.client_receipts (client_id, updated_at desc);
create table if not exists public.client_payments (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  wr_id       text,
  invoice_no  text,
  paid_on     text,
  amount      numeric(12,2) not null,
  method      text,
  reference   text,
  receipt_url text,
  created_at  timestamptz not null default now()
);
alter table public.client_payments add column if not exists wr_id text;
alter table public.client_payments alter column invoice_no drop not null;
create index if not exists client_payments_client on public.client_payments (client_id, created_at desc);
create index if not exists client_payments_wr on public.client_payments (wr_id);
alter table public.client_receipts enable row level security;
alter table public.client_payments enable row level security;
-- No policies on purpose: only the functions below and the service_role can touch these tables.

drop function if exists public.client_list_invoices(uuid);
drop function if exists public.client_list_payments(uuid);
create or replace function public.client_list_receipts(p_client_id uuid)
returns table(wr_id text, receipt_code text, receipt_date text, ship text, pieces integer, weight numeric, total numeric, paid numeric, balance numeric, status text, invoice_no text, pay_url text, wr_pdf_url text, invoice_pdf_url text)
language sql security definer set search_path = public as $$
  select r.wr_id, r.receipt_code, r.receipt_date, r.ship, r.pieces, r.weight, r.total, r.paid, r.balance, r.status, r.invoice_no, r.pay_url, r.wr_pdf_url, r.invoice_pdf_url
  from public.client_receipts r where r.client_id = p_client_id order by r.updated_at desc limit 100;
$$;
create or replace function public.client_list_payments(p_client_id uuid)
returns table(wr_id text, invoice_no text, paid_on text, amount numeric, method text, reference text, receipt_url text)
language sql security definer set search_path = public as $$
  select p.wr_id, p.invoice_no, p.paid_on, p.amount, p.method, p.reference, p.receipt_url
  from public.client_payments p where p.client_id = p_client_id order by p.created_at desc, p.paid_on desc limit 300;
$$;
revoke all on table public.client_receipts from anon, authenticated;
revoke all on table public.client_payments from anon, authenticated;
grant execute on function public.client_list_receipts(uuid) to anon, authenticated;
grant execute on function public.client_list_payments(uuid) to anon, authenticated;
