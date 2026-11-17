-- Shake Shake: complete database setup in ONE paste (Supabase → SQL Editor → New query → paste → Run).
-- GENERATED from supabase/migrations/0001–0004 by scripts/gen-setup.mjs. Do not edit by hand. Safe to run once on an empty project.

-- ===================== supabase/migrations/0001_schema.sql =====================
-- Shake Shake — initial schema (ARCHITECTURE §5) with Row Level Security on EVERY table, deny-by-default.
-- Changes vs ARCHITECTURE §5 are recorded in DECISIONS (D-023: birth_year/sex/height moved to the
-- owner-only health_profile so friends who can read a profile never see body data).

-- ───────────────────────────── helpers ─────────────────────────────
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

-- ───────────────────────────── identity & profile ─────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_path text,
  avatar_preset text,
  city text check (char_length(city) <= 60),
  timezone text not null default 'Asia/Kolkata',
  diet_type text not null default 'nonveg' check (diet_type in ('nonveg', 'egg', 'veg')),
  spice_level text not null default 'medium' check (spice_level in ('mild', 'medium', 'hot')),
  max_cook_minutes int not null default 45 check (max_cook_minutes between 10 and 240),
  regions text[] not null default '{mixed}',
  lunch_time time not null default '13:00',
  dinner_time time not null default '20:00',
  muted_categories text[] not null default '{}',
  friend_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  onboarded boolean not null default false,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid())
$$;

-- Sensitive health data: owner-only, never shared (D-013, C4).
create table public.health_profile (
  user_id uuid primary key references auth.users (id) on delete cascade,
  birth_year int check (birth_year between 1900 and 2010),
  sex text check (sex in ('female', 'male')),
  height_cm numeric(5, 1) check (height_cm between 120 and 230),
  weight_kg numeric(5, 1) check (weight_kg between 30 and 250),
  activity_level text check (activity_level in ('sedentary', 'light', 'moderate', 'very_active', 'extra_active')),
  goal text check (goal in ('lose', 'maintain', 'gain', 'recomposition')),
  allergies text[] not null default '{}',
  dislikes text[] not null default '{}',
  medical_flag boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  effective_from date not null default current_date,
  kcal_min int not null check (kcal_min between 800 and 6000),
  kcal_max int not null check (kcal_max between 800 and 6000),
  protein_g_min int check (protein_g_min between 10 and 400),
  protein_g_max int check (protein_g_max between 10 and 400),
  active_kcal_goal int not null default 400 check (active_kcal_goal between 50 and 3000),
  bmr int,
  method text not null,
  source_note text not null,
  user_overridden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, effective_from),
  check (kcal_min <= kcal_max),
  check (protein_g_min is null or protein_g_max is null or protein_g_min <= protein_g_max)
);

-- Consent records are append-only history; the latest row per purpose is the current state.
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('health_data', 'ai_processing', 'social_sharing', 'marketing_push')),
  granted boolean not null,
  version text not null,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index consents_user_purpose on public.consents (user_id, purpose, created_at desc);

create or replace function public.has_consent(p_user uuid, p_purpose text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select granted from public.consents
    where user_id = p_user and purpose = p_purpose
    order by created_at desc limit 1
  ), false)
$$;

-- ───────────────────────────── social graph ─────────────────────────────
create table public.friendships (
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and a <> b
    and exists (select 1 from public.friendships f
                where f.status = 'accepted'
                  and ((f.user_id = a and f.friend_id = b) or (f.user_id = b and f.friend_id = a)))
    and not exists (select 1 from public.friendships f
                where f.status = 'blocked'
                  and ((f.user_id = a and f.friend_id = b) or (f.user_id = b and f.friend_id = a)))
$$;

create table public.invites (
  code text primary key check (code ~ '^[A-Z0-9]{6,16}$'),
  inviter_id uuid references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  max_uses int not null default 1 check (max_uses between 1 and 50),
  uses int not null default 0,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── nutrition reference ─────────────────────────────
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  fdc_id int,
  name text not null,
  fdc_description text,
  aliases text[] not null default '{}',
  aisle text not null default 'other',
  is_staple boolean not null default false,
  kcal_per_100g numeric(7, 2) not null,
  protein_g numeric(6, 2) not null,
  fat_g numeric(6, 2) not null,
  carb_g numeric(6, 2) not null,
  fibre_g numeric(6, 2),
  source text not null default 'USDA FDC',
  source_release text not null,
  reviewed boolean not null default false
);

-- ───────────────────────────── recipes & plans ─────────────────────────────
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cuisine_region text not null,
  meal_type text not null check (meal_type in ('lunch', 'dinner')),
  diet_type text not null check (diet_type in ('nonveg', 'egg', 'veg')),
  servings int not null check (servings between 1 and 8),
  cook_minutes int not null,
  steps jsonb not null,
  protein_tip text,
  why text,
  ai_model text,
  prompt_version text not null,
  created_by uuid references auth.users (id) on delete set null,
  nutrition_status text not null check (nutrition_status in ('computed', 'partial', 'ai_estimate')),
  per_serving_kcal int not null,
  per_serving_protein_g numeric(6, 1) not null,
  per_serving_fat_g numeric(6, 1),
  per_serving_carb_g numeric(6, 1),
  matched_mass_pct numeric(4, 3),
  oil_added boolean not null default false,
  unmatched text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index recipes_lookup on public.recipes (meal_type, diet_type, created_at desc);

create table public.recipe_ingredients (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position int not null,
  food_id uuid references public.foods (id) on delete set null,
  raw_name text not null,
  grams numeric(7, 1) not null,
  matched boolean not null,
  added boolean not null default false,
  primary key (recipe_id, position)
);

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  unique (user_id, week_start)
);

create table public.meal_plan_slots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.meal_plans (id) on delete cascade,
  date date not null,
  meal_type text not null check (meal_type in ('lunch', 'dinner')),
  recipe_id uuid references public.recipes (id) on delete set null,
  status text not null default 'planned' check (status in ('planned', 'chosen', 'swapped', 'skipped')),
  servings int not null default 1 check (servings between 1 and 8),
  remind_at timestamptz,
  reminded_at timestamptz,
  unique (plan_id, date, meal_type)
);

-- ───────────────────────────── logging ─────────────────────────────
create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id uuid references public.recipes (id) on delete set null,
  dish text not null check (char_length(dish) between 1 and 80),
  photo_path text,
  ai_estimate jsonb,
  portion_factor numeric(3, 2),
  kcal int not null check (kcal between 0 and 5000),
  protein_g numeric(6, 1) not null check (protein_g between 0 and 400),
  source text not null check (source in ('ai', 'ai_corrected', 'manual', 'recipe')),
  visibility text not null default 'friends' check (visibility in ('friends', 'private')),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index meal_logs_user_date on public.meal_logs (user_id, date desc);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  active_kcal int not null check (active_kcal between 0 and 6000),
  total_kcal int check (total_kcal between 0 and 10000),
  source text not null default 'manual' check (source in ('manual', 'oura')),
  flagged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date, source)
);

-- Edit history for burn entries (M3-05).
create table public.activity_log_edits (
  id bigint generated always as identity primary key,
  log_id uuid not null references public.activity_logs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  old_active_kcal int,
  new_active_kcal int,
  edited_at timestamptz not null default now()
);

create or replace function public.track_activity_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.active_kcal is distinct from old.active_kcal then
    insert into public.activity_log_edits (log_id, user_id, old_active_kcal, new_active_kcal)
    values (old.id, old.user_id, old.active_kcal, new.active_kcal);
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger activity_logs_edit before update on public.activity_logs
  for each row execute function public.track_activity_edit();

-- ───────────────────────────── groceries ─────────────────────────────
create table public.grocery_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);
create table public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.grocery_lists (id) on delete cascade,
  food_key text,
  name text not null,
  grams int not null default 0,
  qty numeric(8, 2) not null,
  unit text not null,
  aisle text not null,
  is_staple boolean not null default false,
  checked boolean not null default false
);

-- ───────────────────────────── feed interactions & moderation ─────────────────────────────
create table public.reactions (
  log_id uuid not null references public.meal_logs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '🔥', '💪', '😋')),
  created_at timestamptz not null default now(),
  primary key (log_id, user_id, emoji)
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.meal_logs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('meal_log', 'comment', 'profile')),
  target_id uuid not null,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 300),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);

-- ───────────────────────────── leaderboard ─────────────────────────────
-- Goals locked per competition week (PRODUCT_BRIEF §7). Written by the server (service role) only.
create table public.weekly_goals (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  active_kcal_goal int not null,
  protein_target_g int not null,
  primary key (user_id, week_start)
);
create table public.leaderboard_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  move_pts int not null default 0,
  protein_pts int not null default 0,
  logging_pts int not null default 0,
  total int not null default 0 check (total between 0 and 350),
  flagged boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- ───────────────────────────── messages & push ─────────────────────────────
create table public.messages (
  id text primary key,
  category text not null,
  trigger text,
  text text not null,
  tone_tags text[] not null default '{}',
  active boolean not null default true
);
create table public.message_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  message_id text not null references public.messages (id),
  category text not null,
  channel text not null check (channel in ('push', 'inbox')),
  slot_key text not null,
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, slot_key)
);
create index message_sends_user_time on public.message_sends (user_id, sent_at desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ───────────────────────────── AI usage & quota ─────────────────────────────
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('suggest', 'swap', 'plan', 'plate')),
  calls int not null default 0,
  primary key (user_id, date, kind)
);

-- Atomically consume one AI call. Returns 'ok' | 'user_limit' | 'global_limit'. Date is IST (D-006).
create or replace function public.consume_ai_quota(p_kind text, p_user_limit int, p_global_limit int)
returns text language plpgsql security definer set search_path = public as $$
declare
  d date := (now() at time zone 'Asia/Kolkata')::date;
  mine int;
  total int;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'not a member' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('ai_quota:' || d::text));
  select coalesce(sum(calls), 0) into mine from public.ai_usage where user_id = auth.uid() and date = d;
  if mine >= p_user_limit then return 'user_limit'; end if;
  select coalesce(sum(calls), 0) into total from public.ai_usage where date = d;
  if total >= p_global_limit then return 'global_limit'; end if;
  insert into public.ai_usage (user_id, date, kind, calls) values (auth.uid(), d, p_kind, 1)
  on conflict (user_id, date, kind) do update set calls = public.ai_usage.calls + 1;
  return 'ok';
end $$;

-- ───────────────────────────── invites & friends RPCs ─────────────────────────────
-- Redeem an invite for the signed-in (auth) user: creates the profile, befriends the inviter.
create or replace function public.redeem_invite(p_code text, p_display_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  inv public.invites%rowtype;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then return; end if;
  select * into inv from public.invites where code = upper(trim(p_code)) for update;
  if not found or inv.expires_at < now() or inv.uses >= inv.max_uses then
    raise exception 'invalid or expired invite' using errcode = '22023';
  end if;
  update public.invites set uses = uses + 1 where code = inv.code;
  insert into public.profiles (id, display_name, invited_by) values (auth.uid(), left(trim(p_display_name), 40), inv.inviter_id);
  if inv.inviter_id is not null then
    insert into public.friendships (user_id, friend_id, status) values (inv.inviter_id, auth.uid(), 'accepted')
    on conflict do nothing;
  end if;
end $$;

-- Pre-check used by the sign-in screen before an OTP is sent (no auth required, reveals only validity).
create or replace function public.invite_is_valid(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.invites where code = upper(trim(p_code)) and expires_at > now() and uses < max_uses)
$$;

create or replace function public.send_friend_request(p_friend_code text) returns text
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  select id into target from public.profiles where friend_code = upper(trim(p_friend_code));
  if target is null or target = auth.uid() then return 'not_found'; end if;
  if exists (select 1 from public.friendships where status = 'blocked'
             and ((user_id = auth.uid() and friend_id = target) or (user_id = target and friend_id = auth.uid()))) then
    return 'not_found'; -- don't reveal blocks
  end if;
  if exists (select 1 from public.friendships where user_id = target and friend_id = auth.uid() and status = 'pending') then
    update public.friendships set status = 'accepted' where user_id = target and friend_id = auth.uid();
    return 'accepted';
  end if;
  insert into public.friendships (user_id, friend_id, status) values (auth.uid(), target, 'pending')
  on conflict do nothing;
  return 'requested';
end $$;

-- Block: removes any friendship either way and records a block by the caller.
create or replace function public.block_user(p_other uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  delete from public.friendships where (user_id = auth.uid() and friend_id = p_other) or (user_id = p_other and friend_id = auth.uid());
  insert into public.friendships (user_id, friend_id, status) values (auth.uid(), p_other, 'blocked');
end $$;

-- ───────────────────────────── grants (deny anon; RLS decides for authenticated) ─────────────────────────────
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on function public.invite_is_valid(text) to anon;
-- Column-level limits
revoke update on public.message_sends from authenticated;
grant update (read_at) on public.message_sends to authenticated;
revoke insert, update, delete on public.leaderboard_daily, public.weekly_goals, public.ai_usage, public.messages, public.foods, public.message_sends from authenticated;
revoke update, delete on public.consents from authenticated;
revoke insert, delete on public.invites from authenticated;
grant insert on public.invites to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_path, avatar_preset, city, timezone, diet_type, spice_level, max_cook_minutes, regions,
              lunch_time, dinner_time, muted_categories, onboarded) on public.profiles to authenticated;

-- ───────────────────────────── RLS ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['profiles','health_profile','targets','consents','friendships','invites','foods','recipes',
    'recipe_ingredients','meal_plans','meal_plan_slots','meal_logs','activity_logs','activity_log_edits','grocery_lists',
    'grocery_items','reactions','comments','reports','weekly_goals','leaderboard_daily','messages','message_sends',
    'push_subscriptions','ai_usage']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- profiles: self, friends, pending-request counterparts, admin. Insert only via redeem_invite().
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or public.are_friends(auth.uid(), id) or public.is_admin()
  or exists (select 1 from public.friendships f where f.status = 'pending'
             and ((f.user_id = auth.uid() and f.friend_id = profiles.id) or (f.friend_id = auth.uid() and f.user_id = profiles.id)))
);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- owner-only sensitive tables; writes require health_data consent
create policy hp_select on public.health_profile for select to authenticated using (user_id = auth.uid());
create policy hp_insert on public.health_profile for insert to authenticated with check (user_id = auth.uid() and public.is_member() and public.has_consent(auth.uid(), 'health_data'));
create policy hp_update on public.health_profile for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.has_consent(auth.uid(), 'health_data'));
create policy hp_delete on public.health_profile for delete to authenticated using (user_id = auth.uid());

create policy targets_select on public.targets for select to authenticated using (user_id = auth.uid());
create policy targets_insert on public.targets for insert to authenticated with check (user_id = auth.uid() and public.is_member());
create policy targets_update on public.targets for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy targets_delete on public.targets for delete to authenticated using (user_id = auth.uid());

create policy consents_select on public.consents for select to authenticated using (user_id = auth.uid());
create policy consents_insert on public.consents for insert to authenticated with check (user_id = auth.uid() and public.is_member());

-- friendships: see rows you're part of; accept a request addressed to you; delete your own rows
create policy fr_select on public.friendships for select to authenticated using (user_id = auth.uid() or (friend_id = auth.uid() and status <> 'blocked'));
create policy fr_accept on public.friendships for update to authenticated
  using (friend_id = auth.uid() and status = 'pending') with check (friend_id = auth.uid() and status = 'accepted');
create policy fr_delete on public.friendships for delete to authenticated using (user_id = auth.uid() or (friend_id = auth.uid() and status <> 'blocked'));

-- invites: members create limited invites for themselves; inviter/admin can see them
create policy inv_select on public.invites for select to authenticated using (inviter_id = auth.uid() or public.is_admin());
create policy inv_insert on public.invites for insert to authenticated with check (
  inviter_id = auth.uid() and public.is_member() and uses = 0
  and (public.is_admin() or (max_uses <= 5 and expires_at <= now() + interval '30 days'))
);

-- reference data
create policy foods_select on public.foods for select to authenticated using (true);
create policy messages_select on public.messages for select to authenticated using (true);

-- recipes: generic (no personal data); readable by members, written by their creator
create policy recipes_select on public.recipes for select to authenticated using (public.is_member());
create policy recipes_insert on public.recipes for insert to authenticated with check (created_by = auth.uid() and public.is_member());
create policy ri_select on public.recipe_ingredients for select to authenticated using (public.is_member());
create policy ri_insert on public.recipe_ingredients for insert to authenticated
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.created_by = auth.uid()));

-- plans
create policy mp_all on public.meal_plans for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member());
create policy mps_all on public.meal_plan_slots for all to authenticated
  using (exists (select 1 from public.meal_plans p where p.id = plan_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.meal_plans p where p.id = plan_id and p.user_id = auth.uid()));

-- meal logs: owner; friends (accepted, not blocked) if visibility=friends AND owner consented to social sharing; admin for reported
create policy ml_select on public.meal_logs for select to authenticated using (
  user_id = auth.uid()
  or (visibility = 'friends' and not hidden and public.is_member() and public.are_friends(auth.uid(), user_id)
      and public.has_consent(user_id, 'social_sharing'))
  or (public.is_admin() and exists (select 1 from public.reports r where r.target_type = 'meal_log' and r.target_id = meal_logs.id))
);
create policy ml_insert on public.meal_logs for insert to authenticated with check (user_id = auth.uid() and public.is_member() and hidden = false);
create policy ml_update on public.meal_logs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ml_admin_hide on public.meal_logs for update to authenticated
  using (public.is_admin() and exists (select 1 from public.reports r where r.target_type = 'meal_log' and r.target_id = meal_logs.id))
  with check (public.is_admin());
create policy ml_delete on public.meal_logs for delete to authenticated using (user_id = auth.uid());

create policy al_all on public.activity_logs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member());
create policy ale_select on public.activity_log_edits for select to authenticated using (user_id = auth.uid());

create policy gl_all on public.grocery_lists for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member());
create policy gi_all on public.grocery_items for all to authenticated
  using (exists (select 1 from public.grocery_lists l where l.id = list_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.grocery_lists l where l.id = list_id and l.user_id = auth.uid()));

-- reactions/comments: visible & writable only where the meal log itself is visible (RLS applies in the subquery)
create policy re_select on public.reactions for select to authenticated using (exists (select 1 from public.meal_logs m where m.id = log_id));
create policy re_insert on public.reactions for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.meal_logs m where m.id = log_id));
create policy re_delete on public.reactions for delete to authenticated using (user_id = auth.uid());

create policy co_select on public.comments for select to authenticated using (
  (exists (select 1 from public.meal_logs m where m.id = log_id) and (not hidden or user_id = auth.uid()))
  or (public.is_admin() and exists (select 1 from public.reports r where r.target_type = 'comment' and r.target_id = comments.id))
);
create policy co_insert on public.comments for insert to authenticated with check (user_id = auth.uid() and hidden = false and exists (select 1 from public.meal_logs m where m.id = log_id));
create policy co_delete on public.comments for delete to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.meal_logs m where m.id = log_id and m.user_id = auth.uid())
);
create policy co_admin_hide on public.comments for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy rp_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid() and public.is_member() and status = 'open');
create policy rp_select on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy rp_update on public.reports for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- leaderboard: self + friends read; service role writes (bypasses RLS)
create policy lb_select on public.leaderboard_daily for select to authenticated using (user_id = auth.uid() or public.are_friends(auth.uid(), user_id));
create policy wg_select on public.weekly_goals for select to authenticated using (user_id = auth.uid());

create policy ms_select on public.message_sends for select to authenticated using (user_id = auth.uid());
create policy ms_update on public.message_sends for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy ps_all on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member());

create policy au_select on public.ai_usage for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- ===================== supabase/migrations/0002_storage.sql =====================
-- Private buckets + policies (ARCHITECTURE §3, CLAUDE.md rule 6). Paths are "<user_id>/<file>".
-- Size limits keep us inside the 1 GB Free-plan storage (VERIFIED: supabase.com/pricing, 2026-11-17).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('meal-photos', 'meal-photos', false, 300000, array['image/jpeg', 'image/webp']),
  ('avatars', 'avatars', false, 150000, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Owner can write/read/delete inside their own folder.
create policy "own files: insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('meal-photos', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text and public.is_member());
create policy "own files: select" on storage.objects for select to authenticated
  using (bucket_id in ('meal-photos', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files: update" on storage.objects for update to authenticated
  using (bucket_id in ('meal-photos', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own files: delete" on storage.objects for delete to authenticated
  using (bucket_id in ('meal-photos', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text);

-- Friends may read a meal photo only if they can see the meal log that references it
-- (meal_logs RLS is applied inside the subquery: visibility, consent, blocks, hidden).
create policy "friends: meal photos" on storage.objects for select to authenticated
  using (bucket_id = 'meal-photos' and exists (select 1 from public.meal_logs m where m.photo_path = storage.objects.name));

-- Friends may read avatars.
create policy "friends: avatars" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.are_friends(auth.uid(), ((storage.foldername(name))[1])::uuid));

-- ===================== supabase/migrations/0003_seed_messages.sql =====================
-- GENERATED by scripts/gen-messages.mjs from docs/TONE_AND_COPY.md — do not edit by hand.
insert into public.messages (id, category, text, active) values
  ('e291e7803522', 'morning', 'Good morning, gorgeous. Your muscles had a dream about chicken chettinad. Let''s make it come true. 💪', true),
  ('a22c0a6a0d41', 'morning', 'Rise and shine! Today''s plan: be amazing, eat protein, repeat.', true),
  ('e56c8ea407d5', 'morning', 'Coffee first. Then we conquer the day — and lunch.', true),
  ('f9f925857623', 'morning', 'The sun is up, and so are your gains. Let''s go!', true),
  ('4da011dc9fc4', 'morning', 'New day, new dosa… a protein-packed one, obviously.', true),
  ('0ddfc69cec27', 'suggestion_ready', 'Lunch idea is ready and honestly? It''s flirting with you. 😋', true),
  ('2a29c06d6fcc', 'suggestion_ready', 'Tonight''s dinner has 35 g of protein and zero protein shakes. Just saying.', true),
  ('07078276b73e', 'suggestion_ready', 'Your lunch suggestion just walked in looking delicious.', true),
  ('ed9993cac4fb', 'suggestion_ready', 'Plot twist: dinner is healthy AND tasty. Tap to see.', true),
  ('b9e825f8f125', 'swap', 'Not feeling it? No heartbreak here — let''s find you a better match.', true),
  ('277bf923224f', 'swap', 'Swapped! The new one tried harder.', true),
  ('4a0ffc0eb7bd', 'swap', 'Fussy? We love that. Here are three more options.', true),
  ('0381bdb4556a', 'plate_reminder', 'Show me your plate! 📸 Your lunch deserves a photoshoot.', true),
  ('9f2b1ac3add4', 'plate_reminder', 'Psst… the meen kuzhambu wants its close-up.', true),
  ('8a72934eaa94', 'plate_reminder', 'Before you dig in — one quick pic, then enjoy every bite.', true),
  ('78d527b6eab9', 'plate_reminder', 'Camera eats first. (It''s a Chennai rule now.)', true),
  ('c6d2e3d04809', 'logged_thanks', 'Logged! You''re officially more organised than my kitchen.', true),
  ('3ec41a5f001a', 'logged_thanks', 'Saved. That plate looked like it had a great personality.', true),
  ('88a12439940a', 'logged_thanks', 'Done! Data never tasted this good.', true),
  ('09dd80417dc5', 'protein_hit', 'Protein goal: CRUSHED. Your muscles are writing you a thank-you letter. 💌', true),
  ('96e09ec7c26f', 'protein_hit', '100 % protein today. Someone call the newspapers.', true),
  ('85e487bd4fb8', 'protein_hit', 'Goal hit! The protein shake industry is shaking. 🥤😱', true),
  ('dcac1a36d26c', 'protein_hit', 'You did it — real food, real protein, really proud of you.', true),
  ('e1008c50fb3a', 'protein_close', 'Just a few grams away — a bowl of thayir or a boiled egg would close the deal.', true),
  ('a4f0dda62ef0', 'protein_close', 'So close! One sundal snack and you''re there.', true),
  ('f20e1bc8fb1c', 'streak', '3 days in a row! You''re on fire (the good, tadka kind). 🔥', true),
  ('55bfc8a641ee', 'streak', '7-day streak! A full week of showing up for yourself. Beautiful.', true),
  ('3a203c32c706', 'streak', '14 days. At this point, consistency should be paying you rent.', true),
  ('9280ebfc376f', 'streak', '30-day streak! Framing this. Hanging it in my heart.', true),
  ('026ed1911a59', 'missed_day', 'We missed you yesterday! No stress — today''s a fresh plate.', true),
  ('245115c7309b', 'missed_day', 'Life happened? Totally fine. Let''s pick one easy win today.', true),
  ('ba3f6e5e4440', 'missed_day', 'The app was lonely without you. Lunch idea''s waiting whenever you are.', true),
  ('6ea2776d9f46', 'burn_logged', 'Burn logged. Your Oura ring is proud. So am I.', true),
  ('c8b4dbcad9a7', 'burn_logged', 'Calories out: noted. Snack respectfully. 😄', true),
  ('542c79d3a12e', 'burn_logged', 'You moved, you grooved, you logged it. Love that for you.', true),
  ('ee35c26a6164', 'leaderboard_up', 'You just climbed the leaderboard. Friends, take notes.', true),
  ('c43dc182d376', 'leaderboard_up', 'Up you go! Somebody''s friends are getting nervous.', true),
  ('9ff30765d7fd', 'leaderboard_week_won', 'Champion of the week! 👑 Your crown is made of paneer.', true),
  ('d611328dc1ef', 'leaderboard_week_won', 'Weekly winner! Victory tastes like pepper chicken.', true),
  ('04862710942b', 'weekly_plan', 'Sunday planning time! 7 days of protein, zero "what should I cook?"', true),
  ('e2dc791cadfc', 'weekly_plan', 'Your week, sorted. Future-you says thank you.', true),
  ('bb080370e9c1', 'grocery_ready', 'Grocery list ready. The vegetable vendor won''t know what hit him.', true),
  ('0d0962d902b1', 'grocery_ready', 'Shopping list done — don''t forget the curry leaves, they''re the real MVP.', true),
  ('c98e994e3576', 'love_note', 'Reminder: you''re strong, you''re lovely, and your sambar is legendary.', true),
  ('2cb6656e5ad6', 'love_note', 'Somewhere, a protein shake is crying because you chose real food. Proud of you.', true),
  ('02eecb452492', 'love_note', 'You make healthy look like an art form.', true),
  ('66c34cbe1cdb', 'love_note', 'If dedication were a dish, you''d be a full South Indian thali.', true),
  ('42280248a9c9', 'empty_state', 'No meals logged yet — the plate is clean and full of possibility.', true),
  ('1871014dc0b5', 'empty_state', 'No friends here yet. Invite someone to share the snacks (and the leaderboard).', true),
  ('8a559bcb0c65', 'error_friendly', 'Our AI chef dropped the ladle. Try again, or log it manually.', true),
  ('bcbd4c4cad50', 'error_friendly', 'The kitchen''s a bit busy right now — manual entry works perfectly meanwhile.', true),
  ('315753b4bd73', 'error_friendly', 'Too many recipe requests today! We''ll be back tomorrow, fresher than idli batter.', true),
  ('e91f064abab9', 'caring', 'We''ve noticed some very light days. Your body deserves fuel — if things feel hard, talking to a doctor or dietitian can really help. 💛', true)
on conflict (id) do update set category = excluded.category, text = excluded.text, active = true;

-- ===================== supabase/migrations/0004_seed_foods.sql =====================
-- GENERATED by scripts/build-foods.ts from USDA FoodData Central (CC0 1.0). Do not edit by hand.
-- Review docs/FOODS_IMPORT_REPORT.md, then set reviewed = true for checked rows.
insert into public.foods (key, fdc_id, name, fdc_description, aliases, aisle, is_staple, kcal_per_100g, protein_g, fat_g, carb_g, fibre_g, source, source_release, reviewed) values
  ('chicken_breast', 171077, 'Chicken breast', 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw', '{"chicken breast boneless","kozhi breast"}', 'meat_fish', false, 120, 22.5, 2.62, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('chicken_thigh', 172859, 'Chicken thigh', 'Chicken, dark meat, thigh, meat only, with added solution, raw', '{"chicken leg","kozhi"}', 'meat_fish', false, 110, 19.1, 3.69, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('chicken', 171052, 'Chicken (curry cut)', 'Chicken, broilers or fryers, meat only, raw', '{"chicken curry cut","kozhi","koli","kodi","murgh"}', 'meat_fish', false, 119, 21.4, 3.08, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('chicken_mince', 171116, 'Chicken mince', 'Chicken, ground, raw', '{"chicken keema","minced chicken"}', 'meat_fish', false, 143, 17.4, 8.1, 0.04, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('mutton', 175303, 'Mutton (goat)', 'Game meat, goat, raw', '{"goat meat","aattu kari","mamsam","gosht","lamb"}', 'meat_fish', false, 109, 20.6, 2.31, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('mutton_mince', 174370, 'Mutton mince', 'Lamb, ground, raw', '{"keema","kheema","minced mutton","kothu kari"}', 'meat_fish', false, 282, 16.6, 23.4, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('seer_fish', 175122, 'Seer fish', 'Fish, mackerel, king, raw', '{"vanjaram","king mackerel","neymeen","surmai","anjal"}', 'meat_fish', false, 105, 20.3, 2, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('mackerel', 175119, 'Indian mackerel', 'Fish, mackerel, Atlantic, raw', '{"ayala","ayila","bangda","kanangeluthi"}', 'meat_fish', false, 205, 18.6, 13.9, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('anchovy', 174182, 'Anchovy', 'Fish, anchovy, european, raw', '{"nethili","natholi","kozhuva","anchovies"}', 'meat_fish', false, 131, 20.4, 4.84, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('pomfret', 173682, 'Pomfret', 'Fish, pompano, florida, raw', '{"vavval","avoli","paplet"}', 'meat_fish', false, 164, 18.5, 9.47, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('tuna', 175159, 'Tuna', 'Fish, tuna, fresh, yellowfin, raw', '{"choora","soorai","kera"}', 'meat_fish', false, 109, 24.4, 0.49, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('salmon', 173686, 'Indian salmon', 'Fish, salmon, Atlantic, wild, raw', '{"kaala","rawas","salmon"}', 'meat_fish', false, 142, 19.8, 6.34, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('tilapia', 175176, 'Tilapia', 'Fish, tilapia, raw', '{"jilebi meen","tilapia fish"}', 'meat_fish', false, 96, 20.1, 1.7, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('rohu', 171952, 'Rohu / carp', 'Fish, carp, raw', '{"rohu","carp","kendai"}', 'meat_fish', false, 127, 17.8, 5.6, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('prawn', 175179, 'Prawns', 'Crustaceans, shrimp, raw', '{"prawn","shrimp","eral","chemmeen","royyalu","jhinga"}', 'meat_fish', false, 85, 20.1, 0.51, 0, null, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('crab', 174204, 'Crab', 'Crustaceans, crab, blue, raw', '{"nandu","njandu","peetha","crab meat"}', 'meat_fish', false, 87, 18.1, 1.08, 0.04, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('squid', 174223, 'Squid', 'Mollusks, squid, mixed species, raw', '{"kanava","koonthal","calamari"}', 'meat_fish', false, 92, 15.6, 1.38, 3.08, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('mussel', 174216, 'Mussels', 'Mollusks, mussel, blue, raw', '{"kallummakkaya","kadal kai"}', 'meat_fish', false, 86, 11.9, 2.24, 3.69, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('clam', 174214, 'Clams', 'Mollusks, clam, mixed species, raw', '{"kakka","matti"}', 'meat_fish', false, 86, 14.7, 0.96, 3.57, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('chicken_liver', 171060, 'Chicken liver', 'Chicken, liver, all classes, raw', '{"kozhi eeral"}', 'meat_fish', false, 119, 16.9, 4.83, 0.73, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('egg', 171287, 'Egg (whole)', 'Egg, whole, raw, fresh', '{"eggs","muttai","mutta","guddu","motte","anda"}', 'eggs_dairy', false, 143, 12.6, 9.51, 0.72, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('egg_white', 172183, 'Egg white', 'Egg, white, raw, fresh', '{"egg whites","muttai vellai"}', 'eggs_dairy', false, 52, 10.9, 0.17, 0.73, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('milk', 746778, 'Milk (toned)', 'Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D', '{"paal","palu","haalu","doodh","toned milk"}', 'eggs_dairy', false, 50, 3.36, 1.9, 4.9, null, 'USDA FDC', 'Foundation 2026-10-29', false),
  ('whole_milk', 746782, 'Whole milk', 'Milk, whole, 3.25% milkfat, with added vitamin D', '{"full cream milk"}', 'eggs_dairy', false, 60, 3.27, 3.2, 4.63, null, 'USDA FDC', 'Foundation 2026-10-29', false),
  ('curd', 171284, 'Curd / plain yoghurt', 'Yogurt, plain, whole milk', '{"thayir","thairu","perugu","mosaru","dahi","yogurt","yoghurt"}', 'eggs_dairy', false, 61, 3.47, 3.25, 4.66, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('greek_yogurt', 330137, 'Greek yoghurt / hung curd', 'Yogurt, Greek, plain, nonfat', '{"hung curd","greek yogurt"}', 'eggs_dairy', false, 61, 10.3, 0.37, 3.64, null, 'USDA FDC', 'Foundation 2026-10-29', false),
  ('buttermilk', 170874, 'Buttermilk', 'Milk, buttermilk, fluid, cultured, lowfat', '{"mor","moru","majjiga","majjige","chaas"}', 'eggs_dairy', false, 40, 3.31, 1.07, 4.79, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('cheese', 328637, 'Cheese', 'Cheese, cheddar', '{"processed cheese","cheddar"}', 'eggs_dairy', false, 408, 23.3, 34, 2.44, null, 'USDA FDC', 'Foundation 2026-10-29', false),
  ('ghee', 173412, 'Ghee', 'Butter oil, anhydrous', '{"nei","neyyi","tuppa","clarified butter"}', 'oils', true, 876, 0.28, 99.5, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('butter', 173410, 'Butter', 'Butter, salted', '{"vennai","venna","benne","makhan"}', 'eggs_dairy', false, 717, 0.85, 81.1, 0.06, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('cream', 170859, 'Fresh cream', 'Cream, fluid, heavy whipping', '{"malai","cream"}', 'eggs_dairy', false, 340, 2.84, 36.1, 2.84, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('whey', 173177, 'Whey protein (unflavoured)', 'Beverages, Whey protein powder isolate', '{"whey protein"}', 'eggs_dairy', false, 359, 58.1, 1.16, 29.1, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('toor_dal', 172436, 'Toor dal', 'Pigeon peas (red gram), mature seeds, raw', '{"tuvaram paruppu","thuvaram paruppu","kandi pappu","togari bele","arhar","pigeon pea"}', 'pulses', false, 343, 21.7, 1.49, 62.8, 15, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('moong_dal', 174256, 'Moong dal (split)', 'Mung beans, mature seeds, raw', '{"pasi paruppu","payatham parippu","pesara pappu","hesaru bele","split green gram"}', 'pulses', false, 347, 23.9, 1.15, 62.6, 16.3, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('green_gram', 174256, 'Green gram (whole)', 'Mung beans, mature seeds, raw', '{"pachai payaru","cherupayar","pesalu","hesaru kalu","whole moong","mung bean"}', 'pulses', false, 347, 23.9, 1.15, 62.6, 16.3, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('urad_dal', 174259, 'Urad dal', 'Mungo beans, mature seeds, raw', '{"ulundu","uzhunnu","minapa pappu","uddina bele","black gram"}', 'pulses', false, 341, 25.2, 1.64, 59, 18.3, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('chana_dal', 173756, 'Chana dal', 'Chickpeas (garbanzo beans, bengal gram), mature seeds, raw', '{"kadalai paruppu","kadala parippu","senaga pappu","kadale bele","bengal gram"}', 'pulses', false, 378, 20.5, 6.04, 63, 12.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('chickpea', 173756, 'Chickpeas (kabuli)', 'Chickpeas (garbanzo beans, bengal gram), mature seeds, raw', '{"vellai kondakadalai","kabuli chana","garbanzo","chole"}', 'pulses', false, 378, 20.5, 6.04, 63, 12.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('black_chana', 173756, 'Black chana', 'Chickpeas (garbanzo beans, bengal gram), mature seeds, raw', '{"karuppu kondakadalai","kala chana","kadala"}', 'pulses', false, 378, 20.5, 6.04, 63, 12.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('masoor_dal', 174284, 'Masoor dal', 'Lentils, pink or red, raw', '{"red lentil","mysore paruppu","masoor"}', 'pulses', false, 358, 23.9, 2.17, 63.1, 10.8, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('rajma', 173744, 'Rajma (kidney beans)', 'Beans, kidney, red, mature seeds, raw', '{"kidney beans","rajmah"}', 'pulses', false, 337, 22.5, 1.06, 61.3, 15.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('cowpea', 173758, 'Cowpea / lobia', 'Cowpeas, common (blackeyes, crowder, southern), mature seeds, raw', '{"karamani","vanpayar","alasandalu","alasande","black eyed peas"}', 'pulses', false, 336, 23.5, 1.26, 60, 10.6, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('peas_dried', 172428, 'Dried peas', 'Peas, green, split, mature seeds, raw', '{"pattani","dried green peas","white peas"}', 'pulses', false, 364, 23.1, 3.89, 61.6, 22.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('soy_chunks', 1104705, 'Soya chunks', 'Flour, soy, defatted', '{"meal maker","soya chunks","nutrela","soy chunks"}', 'pulses', false, 366, 51.1, 3.33, 32.9, null, 'USDA FDC', 'Foundation 2026-10-29', false),
  ('tofu', 172475, 'Tofu', 'Tofu, raw, firm, prepared with calcium sulfate', '{"soya paneer","bean curd"}', 'pulses', false, 144, 17.3, 8.72, 2.78, 2.3, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('edamame', 168411, 'Edamame', 'Edamame, frozen, prepared', '{"green soybeans"}', 'pulses', false, 121, 11.9, 5.2, 8.91, 5.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('sprouts', 169957, 'Mung sprouts', 'Mung beans, mature seeds, sprouted, raw', '{"mulai payaru","sprouted moong","bean sprouts"}', 'pulses', false, 30, 3.04, 0.18, 5.94, 1.8, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('rice_raw', 169756, 'Rice (white, raw)', 'Rice, white, long-grain, regular, raw, unenriched', '{"arisi","ari","biyyam","akki","chawal","white rice","sona masoori","ponni rice"}', 'grains', true, 365, 7.13, 0.66, 80, 1.3, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('rice_brown', 169703, 'Brown rice', 'Rice, brown, long-grain, raw (Includes foods for USDA''s Food Distribution Program)', '{"brown rice","kaikuthal arisi"}', 'grains', false, 367, 7.54, 3.2, 76.2, 3.6, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('rice_red', 169706, 'Red rice (matta)', 'Rice, brown, medium-grain, raw (Includes foods for USDA''s Food Distribution Program)', '{"matta rice","rosematta","kerala red rice","sigappu arisi"}', 'grains', false, 362, 7.5, 2.68, 76.2, 3.4, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('idli_rice', 169707, 'Idli rice (parboiled)', 'Rice, white, long-grain, parboiled, enriched, dry', '{"puzhungal arisi","parboiled rice","idli arisi"}', 'grains', false, 374, 7.51, 1.03, 80.9, 1.8, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('ragi', 172023, 'Ragi flour', 'Millet flour', '{"kezhvaragu","keppai","ragi","finger millet","nachni","ragulu"}', 'grains', false, 382, 10.8, 4.25, 75.1, 3.5, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('foxtail_millet', 169702, 'Foxtail millet', 'Millet, raw', '{"thinai","kangni","korra","navane"}', 'grains', false, 378, 11, 4.22, 72.8, 8.5, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('little_millet', 169702, 'Little millet', 'Millet, raw', '{"samai","sama","saame","kutki"}', 'grains', false, 378, 11, 4.22, 72.8, 8.5, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('kodo_millet', 169702, 'Kodo millet', 'Millet, raw', '{"varagu","arikelu","harka"}', 'grains', false, 378, 11, 4.22, 72.8, 8.5, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('barnyard_millet', 169702, 'Barnyard millet', 'Millet, raw', '{"kuthiraivali","udalu","oodalu","sanwa"}', 'grains', false, 378, 11, 4.22, 72.8, 8.5, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('jowar', 169716, 'Jowar (sorghum)', 'Sorghum grain', '{"cholam","jonna","jola","sorghum"}', 'grains', false, 329, 10.6, 3.46, 72.1, 6.7, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('bajra', 169702, 'Bajra (pearl millet)', 'Millet, raw', '{"kambu","sajjalu","sajje","pearl millet"}', 'grains', false, 378, 11, 4.22, 72.8, 8.5, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('oats', 173904, 'Rolled oats', 'Cereals, oats, regular and quick, not fortified, dry', '{"oats","oatmeal"}', 'grains', false, 379, 13.2, 6.52, 67.7, 10.1, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('wheat_flour', 168944, 'Wheat flour (atta)', 'Wheat flour, whole-grain, soft wheat', '{"atta","godhumai maavu","whole wheat flour","chapati flour"}', 'grains', false, 332, 9.61, 1.95, 74.5, 13.1, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('maida', 169761, 'Maida (refined flour)', 'Wheat flour, white, all-purpose, unenriched', '{"all purpose flour","maida maavu"}', 'grains', false, 364, 10.3, 0.98, 76.3, 2.7, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('rava', 168933, 'Rava / sooji', 'Semolina, unenriched', '{"sooji","semolina","ravai","upma rava","bombay rava"}', 'grains', false, 360, 12.7, 1.05, 72.8, 3.9, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('broken_wheat', 170688, 'Broken wheat', 'Bulgur, dry', '{"godhumai ravai","dalia","cracked wheat"}', 'grains', false, 342, 12.3, 1.33, 75.9, 12.5, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('vermicelli', 168927, 'Vermicelli', 'Pasta, dry, unenriched', '{"semiya","sevai","shavige"}', 'grains', false, 371, 13, 1.51, 74.7, 3.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('quinoa', 168874, 'Quinoa', 'Quinoa, uncooked', '{"quinoa"}', 'grains', false, 368, 14.1, 6.07, 64.2, 7, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('rice_flour', 790214, 'Rice flour', 'Flour, rice, white, unenriched', '{"arisi maavu","ari podi","biyyam pindi"}', 'grains', false, 359, 6.94, 1.3, 79.8, 0.5, 'USDA FDC', 'Foundation 2026-10-29', false),
  ('besan', 174288, 'Besan (gram flour)', 'Chickpea flour (besan)', '{"kadalai maavu","chickpea flour","gram flour","senaga pindi"}', 'grains', false, 387, 22.4, 6.69, 57.8, 10.8, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('onion', 170000, 'Onion', 'Onions, raw', '{"vengayam","ulli","ullipaya","eerulli","pyaz","big onion"}', 'vegetables', true, 40, 1.1, 0.1, 9.34, 1.7, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('shallot', 170499, 'Shallots (small onion)', 'Shallots, raw', '{"chinna vengayam","sambar onion","kunjulli","small onion"}', 'vegetables', false, 72, 2.5, 0.1, 16.8, 3.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('tomato', 170457, 'Tomato', 'Tomatoes, red, ripe, raw, year round average', '{"thakkali","thakkali pazham","tamata","tomatoes"}', 'vegetables', false, 18, 0.88, 0.2, 3.89, 1.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('potato', 170026, 'Potato', 'Potatoes, flesh and skin, raw', '{"urulai kizhangu","urulakizhangu","bangaladumpa","aloo","potatoes"}', 'vegetables', false, 77, 2.05, 0.09, 17.5, 2.1, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('sweet_potato', 168482, 'Sweet potato', 'Sweet potato, raw, unprepared (Includes foods for USDA''s Food Distribution Program)', '{"sakkaraivalli kizhangu","madhura kizhangu","shakarkand"}', 'vegetables', false, 86, 1.57, 0.05, 20.1, 3, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('carrot', 170393, 'Carrot', 'Carrots, raw', '{"carrot","gajar"}', 'vegetables', false, 41, 0.93, 0.24, 9.58, 2.8, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('beans', 169961, 'French beans', 'Beans, snap, green, raw', '{"beans","green beans","payaru","beans kai"}', 'vegetables', false, 31, 1.83, 0.22, 6.97, 2.7, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('cabbage', 169975, 'Cabbage', 'Cabbage, raw', '{"muttaikose","cabbage","kosu","patta gobhi"}', 'vegetables', false, 25, 1.28, 0.1, 5.8, 2.5, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('cauliflower', 169986, 'Cauliflower', 'Cauliflower, raw', '{"gobi","phool gobhi","cauliflower"}', 'vegetables', false, 25, 1.92, 0.28, 4.97, 2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('broccoli', 747447, 'Broccoli', 'Broccoli, raw', '{"broccoli"}', 'vegetables', false, 31, 2.57, 0.34, 6.27, 2.4, 'USDA FDC', 'Foundation 2026-10-29', false),
  ('capsicum', 170427, 'Capsicum', 'Peppers, sweet, green, raw', '{"kudai milagai","bell pepper","shimla mirch"}', 'vegetables', false, 20, 0.86, 0.17, 4.64, 1.7, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('brinjal', 169228, 'Brinjal', 'Eggplant, raw', '{"kathirikai","vazhuthananga","vankaya","badanekayi","eggplant","baingan"}', 'vegetables', false, 25, 0.98, 0.18, 5.88, 3, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('okra', 169260, 'Okra / ladies finger', 'Okra, raw', '{"vendakkai","venda","bendakaya","bende","bhindi","ladies finger"}', 'vegetables', false, 33, 1.93, 0.19, 7.45, 3.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('drumstick', 170483, 'Drumstick', 'Drumstick pods, raw', '{"murungakkai","muringakka","munagakaya","nugge","moringa pods"}', 'vegetables', false, 37, 2.1, 0.2, 8.53, 3.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('bottle_gourd', 169232, 'Bottle gourd', 'Gourd, white-flowered (calabash), raw', '{"suraikkai","churakka","sorakaya","sorekai","lauki"}', 'vegetables', false, 14, 0.62, 0.02, 3.39, 0.5, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('ridge_gourd', 168414, 'Ridge gourd', 'Gourd, dishcloth (towelgourd), raw', '{"peerkangai","peechinga","beerakaya","heerekai","turai"}', 'vegetables', false, 20, 1.2, 0.2, 4.35, 1.1, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('bitter_gourd', 168393, 'Bitter gourd', 'Balsam-pear (bitter gourd), pods, raw', '{"pavakkai","kaypakka","kakarakaya","hagalakai","karela"}', 'vegetables', false, 17, 1, 0.17, 3.7, 2.8, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('ash_gourd', 170069, 'Ash gourd', 'Waxgourd, (chinese preserving melon), raw', '{"poosanikai","kumbalanga","boodida gummadi","white pumpkin"}', 'vegetables', false, 13, 0.4, 0.2, 3, 2.9, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('pumpkin', 168448, 'Pumpkin (yellow)', 'Pumpkin, raw', '{"parangikai","mathanga","gummadikaya","kumbalakayi"}', 'vegetables', false, 26, 1, 0.1, 6.5, 0.5, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('chow_chow', 170402, 'Chayote (chow chow)', 'Chayote, fruit, raw', '{"chow chow","seemai kathirikai","bangalore kathirikai"}', 'vegetables', false, 19, 0.82, 0.13, 4.51, 1.7, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('raw_banana', 168215, 'Raw banana (plantain)', 'Plantains, green, raw', '{"vazhakkai","pachakaya","aratikaya","baale kayi","plantain"}', 'vegetables', false, 152, 1.25, 0.07, 36.7, 2.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('yam', 170071, 'Elephant yam', 'Yam, raw', '{"senai kizhangu","chena","kanda gadda","suran"}', 'vegetables', false, 118, 1.53, 0.17, 27.9, 4.1, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('colocasia', 169308, 'Colocasia (arbi)', 'Taro, raw', '{"seppankizhangu","chembu","chamadumpa","arbi","taro"}', 'vegetables', false, 112, 1.5, 0.2, 26.5, 4.1, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('beetroot', 169145, 'Beetroot', 'Beets, raw', '{"beetroot","beets","chukandar"}', 'vegetables', false, 43, 1.61, 0.17, 9.56, 2.8, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('radish', 168451, 'Radish', 'Radishes, oriental, raw', '{"mullangi","mullangi","moolangi","mooli"}', 'vegetables', false, 18, 0.6, 0.1, 4.1, 1.6, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('cucumber', 168409, 'Cucumber', 'Cucumber, with peel, raw', '{"vellarikkai","kakkiri","dosakaya","southekayi","kheera"}', 'vegetables', false, 15, 0.65, 0.11, 3.63, 0.5, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('green_peas', 170419, 'Green peas (fresh/frozen)', 'Peas, green, raw', '{"pachai pattani","matar","green peas"}', 'vegetables', false, 81, 5.42, 0.4, 14.4, 5.7, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('mushroom', 169251, 'Mushroom', 'Mushrooms, white, raw', '{"kaalan","koon","puttagodugulu","mushrooms"}', 'vegetables', false, 22, 3.09, 0.34, 3.26, 1, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('corn', 169998, 'Sweet corn', 'Corn, sweet, yellow, raw', '{"makka cholam","sweet corn","bhutta"}', 'vegetables', false, 86, 3.27, 1.35, 18.7, 2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('baby_corn', 169998, 'Baby corn', 'Corn, sweet, yellow, raw', '{"baby corn"}', 'vegetables', false, 86, 3.27, 1.35, 18.7, 2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('avarakkai', 169234, 'Broad beans (avarai)', 'Hyacinth-beans, immature seeds, raw', '{"avarakkai","amarakka","chikkudukaya","avarekai","flat beans","sem"}', 'vegetables', false, 46, 2.1, 0.2, 9.19, 3.3, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('raw_mango', 169910, 'Raw mango', 'Mangos, raw', '{"mangai","pacha manga","mamidikaya","kairi"}', 'vegetables', false, 60, 0.82, 0.38, 15, 1.6, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('lemon', 167747, 'Lemon', 'Lemon juice, raw', '{"elumichai","cherunaranga","nimmakaya","nimbe","nimbu"}', 'vegetables', true, 22, 0.35, 0.24, 6.9, 0.3, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('green_chilli', 170497, 'Green chilli', 'Peppers, hot chili, green, raw', '{"pachai milagai","pacha mulaku","pachi mirchi","hasi menasinakai","hari mirch"}', 'vegetables', true, 40, 2, 0.2, 9.46, 1.5, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('ginger', 169231, 'Ginger', 'Ginger root, raw', '{"inji","inchi","allam","shunti","adrak"}', 'vegetables', true, 80, 1.82, 0.75, 17.8, 2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('garlic', 1104647, 'Garlic', 'Garlic, raw', '{"poondu","veluthulli","vellulli","bellulli","lahsun"}', 'vegetables', true, 143, 6.62, 0.38, 28.2, 2.7, 'USDA FDC', 'Foundation 2026-10-29', false),
  ('coconut', 170169, 'Coconut (fresh, grated)', 'Nuts, coconut meat, raw', '{"thengai","thenga","kobbari","tenginakayi","nariyal","grated coconut"}', 'vegetables', false, 354, 3.33, 33.5, 15.2, 9, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('coconut_milk', 170172, 'Coconut milk', 'Nuts, coconut milk, raw (liquid expressed from grated meat and water)', '{"thengai paal","thenga paal","kobbari palu"}', 'vegetables', false, 230, 2.29, 23.8, 5.54, 2.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('desiccated_coconut', 170170, 'Desiccated coconut', 'Nuts, coconut meat, dried (desiccated), not sweetened', '{"copra","dry coconut","kopra"}', 'vegetables', false, 660, 6.88, 64.5, 23.6, 16.3, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('spinach', 168462, 'Spinach / palak', 'Spinach, raw', '{"pasalai keerai","palak","cheera","palakura","spinach"}', 'greens_herbs', false, 23, 2.86, 0.39, 3.63, 2.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('amaranth', 168385, 'Amaranth leaves', 'Amaranth leaves, raw', '{"mulai keerai","arai keerai","cheera","thotakura","harive soppu","chaulai"}', 'greens_herbs', false, 23, 2.46, 0.33, 4.02, null, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('moringa_leaves', 168416, 'Drumstick leaves', 'Drumstick leaves, raw', '{"murungai keerai","muringayila","munaga aaku","nugge soppu","moringa leaves"}', 'greens_herbs', false, 64, 9.4, 1.4, 8.28, 2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('gongura', 168170, 'Gongura (sorrel leaves)', 'Roselle, raw', '{"pulicha keerai","gongura","pundi soppu"}', 'greens_herbs', false, 49, 0.96, 0.64, 11.3, null, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('coriander_leaves', 169997, 'Coriander leaves', 'Coriander (cilantro) leaves, raw', '{"kothamalli","malli ila","kothimeera","kottambari soppu","dhania patta","cilantro"}', 'greens_herbs', true, 23, 2.13, 0.52, 3.67, 2.8, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('mint', 173475, 'Mint', 'Spearmint, fresh', '{"pudina","puthina","mint leaves"}', 'greens_herbs', false, 44, 3.29, 0.73, 8.41, 6.8, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('spring_onion', 170005, 'Spring onion', 'Onions, spring or scallions (includes tops and bulb), raw', '{"spring onion","scallion","green onion"}', 'greens_herbs', false, 32, 1.83, 0.19, 7.34, 2.6, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('lettuce', 169249, 'Lettuce', 'Lettuce, green leaf, raw', '{"lettuce"}', 'greens_herbs', false, 15, 1.36, 0.15, 2.87, 1.3, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('banana', 173944, 'Banana', 'Bananas, raw', '{"vazhaipazham","pazham","aratipandu","baale hannu","kela"}', 'fruit', false, 89, 1.09, 0.33, 22.8, 2.6, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('apple', 171689, 'Apple', 'Apples, raw, without skin', '{"apple","seb"}', 'fruit', false, 48, 0.27, 0.13, 12.8, 1.3, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('guava', 173044, 'Guava', 'Guavas, common, raw', '{"koyya","pera","jama","seebe","amrood"}', 'fruit', false, 68, 2.55, 0.95, 14.3, 5.4, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('papaya', 169926, 'Papaya', 'Papayas, raw', '{"pappali","omakka","boppayi","parangi"}', 'fruit', false, 43, 0.47, 0.26, 10.8, 1.7, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('mango', 169910, 'Mango (ripe)', 'Mangos, raw', '{"maambazham","manga","mamidi pandu","aam"}', 'fruit', false, 60, 0.82, 0.38, 15, 1.6, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('pomegranate', 169134, 'Pomegranate', 'Pomegranates, raw', '{"maadhulai","mathalam","danimma","anar"}', 'fruit', false, 83, 1.67, 1.17, 18.7, 4, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('orange', 169097, 'Orange', 'Oranges, raw, all commercial varieties', '{"orange","santra","kamala"}', 'fruit', false, 47, 0.94, 0.12, 11.8, 2.4, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('tamarind', 167763, 'Tamarind', 'Tamarinds, raw', '{"puli","chintapandu","hunase","imli"}', 'fruit', true, 239, 2.8, 0.6, 62.5, 5.1, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('dates', 168191, 'Dates', 'Dates, medjool', '{"pericham pazham","eenthapazham","kharjura"}', 'fruit', false, 277, 1.81, 0.15, 75, 6.7, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('peanut', 172430, 'Peanuts', 'Peanuts, all types, raw', '{"verkadalai","nilakadala","kappalandi","palli","shenga","kadalekai","groundnut","moongphali"}', 'nuts_seeds', false, 567, 25.8, 49.2, 16.1, 8.5, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('cashew', 170162, 'Cashew', 'Nuts, cashew nuts, raw', '{"mundhiri","andiparippu","jeedipappu","godambi","kaju"}', 'nuts_seeds', false, 553, 18.2, 43.8, 30.2, 3.3, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('almond', 170567, 'Almonds', 'Nuts, almonds', '{"badam","almond"}', 'nuts_seeds', false, 579, 21.2, 49.9, 21.6, 12.5, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('walnut', 170187, 'Walnuts', 'Nuts, walnuts, english', '{"akhrot","walnut"}', 'nuts_seeds', false, 654, 15.2, 65.2, 13.7, 6.7, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('sesame', 170150, 'Sesame seeds', 'Seeds, sesame seeds, whole, dried', '{"ellu","ellu vithu","nuvvulu","yellu","til","gingelly seeds"}', 'nuts_seeds', false, 573, 17.7, 49.7, 23.4, 11.8, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('flaxseed', 169414, 'Flaxseed', 'Seeds, flaxseed', '{"ali vithai","cheruchana vithu","avise ginjalu","agase","alsi","flax seeds","linseed"}', 'nuts_seeds', false, 534, 18.3, 42.2, 28.9, 27.3, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('chia', 170554, 'Chia seeds', 'Seeds, chia seeds, dried', '{"chia"}', 'nuts_seeds', false, 486, 16.5, 30.7, 42.1, 34.4, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('pumpkin_seeds', 170556, 'Pumpkin seeds', 'Seeds, pumpkin and squash seed kernels, dried', '{"pumpkin seeds","pepitas"}', 'nuts_seeds', false, 559, 30.2, 49, 10.7, 6, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('sunflower_seeds', 170562, 'Sunflower seeds', 'Seeds, sunflower seed kernels, dried', '{"sunflower seeds"}', 'nuts_seeds', false, 584, 20.8, 51.5, 20, 8.6, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('roasted_gram', 173756, 'Roasted gram (pottukadalai)', 'Chickpeas (garbanzo beans, bengal gram), mature seeds, raw', '{"pottukadalai","pottukadala","putnalu","hurigadale","dalia","roasted chana"}', 'nuts_seeds', false, 378, 20.5, 6.04, 63, 12.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('salt', 173468, 'Salt', 'Salt, table', '{"uppu","uppu podi","namak"}', 'spices', true, 0, 0, 0, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('turmeric', 172231, 'Turmeric powder', 'Spices, turmeric, ground', '{"manjal","manjal podi","pasupu","arishina","haldi"}', 'spices', true, 312, 9.68, 3.25, 67.1, 22.7, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('chilli_powder', 171319, 'Red chilli powder', 'Spices, chili powder', '{"milagai thool","mulaku podi","karam","menasina pudi","lal mirch"}', 'spices', true, 282, 13.5, 14.3, 49.7, 34.8, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('dry_red_chilli', 168570, 'Dry red chilli', 'Peppers, hot chile, sun-dried', '{"vara milagai","kanthari","endu mirapakaya","byadagi","kashmiri chilli"}', 'spices', true, 324, 10.6, 5.81, 69.9, 28.7, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('coriander_powder', 170922, 'Coriander powder', 'Spices, coriander seed', '{"malli thool","malli podi","dhaniyalu podi","dhania powder"}', 'spices', true, 298, 12.4, 17.8, 55, 41.9, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('cumin', 170923, 'Cumin seeds', 'Spices, cumin seed', '{"jeeragam","jeerakam","jeelakarra","jeerige","jeera"}', 'spices', true, 375, 17.8, 22.3, 44.2, 10.5, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('mustard_seeds', 170929, 'Mustard seeds', 'Spices, mustard seed, ground', '{"kadugu","kaduku","aavalu","sasive","rai"}', 'spices', true, 508, 26.1, 36.2, 28.1, 12.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('fenugreek_seeds', 171324, 'Fenugreek seeds', 'Spices, fenugreek seed', '{"vendhayam","uluva","menthulu","menthya","methi seeds"}', 'spices', true, 323, 23, 6.41, 58.4, 24.6, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('black_pepper', 170931, 'Black pepper', 'Spices, pepper, black', '{"milagu","kurumulaku","miriyalu","menasu","kali mirch","pepper"}', 'spices', true, 251, 10.4, 3.26, 64, 25.3, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('fennel', 171323, 'Fennel seeds', 'Spices, fennel seed', '{"sombu","perumjeerakam","sompu","saunf"}', 'spices', true, 345, 15.8, 14.9, 52.3, 39.8, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('cinnamon', 171320, 'Cinnamon', 'Spices, cinnamon, ground', '{"pattai","karuvapatta","dalchini"}', 'spices', true, 247, 3.99, 1.24, 80.6, 53.1, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('cardamom', 170919, 'Cardamom', 'Spices, cardamom', '{"elakkai","elakka","yalakulu","elaichi"}', 'spices', true, 311, 10.8, 6.7, 68.5, 28, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('clove', 171321, 'Cloves', 'Spices, cloves, ground', '{"kirambu","grambu","lavangalu","lavanga","laung"}', 'spices', true, 274, 5.97, 13, 65.5, 33.9, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('star_anise', 171316, 'Star anise', 'Spices, anise seed', '{"annasi poo","thakkolam","chakri phool"}', 'spices', true, 337, 17.6, 15.9, 50, 14.6, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('bay_leaf', 170917, 'Bay leaf', 'Spices, bay leaf', '{"brinji ilai","tej patta","bay leaves"}', 'spices', true, 313, 7.61, 8.36, 75, 26.3, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('garam_masala', 170924, 'Garam masala', 'Spices, curry powder', '{"garam masala"}', 'spices', true, 325, 14.3, 14, 55.8, 53.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('sambar_powder', 170924, 'Sambar powder', 'Spices, curry powder', '{"sambar podi","sambar masala"}', 'spices', true, 325, 14.3, 14, 55.8, 53.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('rasam_powder', 170924, 'Rasam powder', 'Spices, curry powder', '{"rasam podi"}', 'spices', true, 325, 14.3, 14, 55.8, 53.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('chettinad_masala', 170924, 'Chettinad masala', 'Spices, curry powder', '{"chettinad masala"}', 'spices', true, 325, 14.3, 14, 55.8, 53.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('jaggery', 168833, 'Jaggery', 'Sugars, brown', '{"vellam","sharkara","bellam","bella","gur"}', 'spices', true, 380, 0.12, 0, 98.1, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('sugar', 746784, 'Sugar', 'Sugars, granulated', '{"sakkarai","panchasara","chini"}', 'spices', true, 385, 0, 0.32, 99.6, null, 'USDA FDC', 'Foundation 2026-10-29', false),
  ('soy_sauce', 174277, 'Soy sauce', 'Soy sauce made from soy and wheat (shoyu)', '{"soya sauce"}', 'spices', false, 53, 8.14, 0.57, 4.93, 0.8, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('vinegar', 172237, 'Vinegar', 'Vinegar, distilled', '{"vinegar","sirka"}', 'spices', true, 18, 0, 0, 0.04, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('honey', 169640, 'Honey', 'Honey', '{"then","thaen","madhu","tene","shahad"}', 'spices', false, 304, 0.3, 0, 82.4, 0.2, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('oil', 171025, 'Cooking oil', 'Oil, sunflower, linoleic, (approx. 65%)', '{"oil","cooking oil","refined oil","sunflower oil","ennai","enna","nune","enne","tel"}', 'oils', true, 884, 0, 100, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('coconut_oil', 330458, 'Coconut oil', 'Oil, coconut', '{"thengai ennai","velichenna","kobbari nune","kobbari enne"}', 'oils', true, 833, 0, 99.1, 0.84, null, 'USDA FDC', 'Foundation 2026-10-29', false),
  ('gingelly_oil', 171016, 'Gingelly (sesame) oil', 'Oil, sesame, salad or cooking', '{"nallennai","ellenna","nuvvula nune","sesame oil","til oil"}', 'oils', true, 884, 0, 100, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('groundnut_oil', 171410, 'Groundnut oil', 'Oil, peanut, salad or cooking', '{"kadalai ennai","kadala enna","verusenaga nune","peanut oil"}', 'oils', true, 884, 0, 100, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('mustard_oil', 172337, 'Mustard oil', 'Oil, mustard', '{"kadugu ennai","sarson tel"}', 'oils', true, 884, 0, 100, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false),
  ('olive_oil', 171413, 'Olive oil', 'Oil, olive, salad or cooking', '{"olive oil"}', 'oils', true, 884, 0, 100, 0, 0, 'USDA FDC', 'SR Legacy 2018-04', false)
on conflict (key) do update set fdc_id = excluded.fdc_id, fdc_description = excluded.fdc_description, aliases = excluded.aliases, aisle = excluded.aisle,
  is_staple = excluded.is_staple, kcal_per_100g = excluded.kcal_per_100g, protein_g = excluded.protein_g, fat_g = excluded.fat_g, carb_g = excluded.carb_g,
  fibre_g = excluded.fibre_g, source_release = excluded.source_release, reviewed = false;
