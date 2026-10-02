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
