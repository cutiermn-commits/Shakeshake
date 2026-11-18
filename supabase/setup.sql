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

-- ===================== supabase/migrations/0005_seed_recipe_library.sql =====================
-- GENERATED by scripts/build-recipe-library.mts from src/lib/data/recipe-library.ts (D-031). Do not edit by hand.
-- Built-in recipes so suggestions work when the AI is busy. Nutrition computed from the USDA FDC foods seed (0004).
-- created_at is fixed in the past so freshly AI-generated recipes always sort first.
insert into public.recipes (id, title, cuisine_region, meal_type, diet_type, servings, cook_minutes, steps, protein_tip, why, ai_model, prompt_version, created_by,
  nutrition_status, per_serving_kcal, per_serving_protein_g, per_serving_fat_g, per_serving_carb_g, matched_mass_pct, oil_added, unmatched, created_at) values
  ('cdc1a260-c89b-5105-aff0-465cb5b58275', 'Chettinad chicken curry with rice', 'tamil', 'lunch', 'nonveg', 2, 45, '["Rinse and cook the rice.","Dry-roast pepper, fennel and coconut; grind to a paste with a little water.","Heat oil, add curry leaves and onion; cook till golden.","Add ginger-garlic, tomato and the powders; cook till soft.","Add chicken and the paste, cover and simmer 20–25 min till cooked."]'::jsonb, 'Add a boiled egg on the side for about 6 g more protein.', 'Chicken carries most of the protein; rice keeps it a proper meal.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 711, 51.6, 20.6, 79.3, 0.998, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('455f36c4-9621-51fd-a5e7-c18b4efb8244', 'Meen kuzhambu (seer fish curry) with rice', 'tamil', 'lunch', 'nonveg', 2, 35, '["Soak tamarind in warm water and squeeze out the juice.","Heat gingelly oil; splutter mustard and fenugreek, add curry leaves, shallots and garlic.","Add tomato and the powders; cook 3 min.","Pour in tamarind water, simmer 8 min.","Slide in the fish and simmer gently 6–8 min. Serve with rice."]'::jsonb, 'Keep the fish pieces large so they stay juicy.', 'Seer fish is lean and very high in protein.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 632, 44.7, 13.3, 83.4, 0.997, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('58a5bfc3-516b-5fa2-a90e-f722f26e8e85', 'Pepper chicken with toor dal rice', 'tamil', 'lunch', 'nonveg', 2, 40, '["Pressure-cook rice and toor dal together with turmeric and salt.","Heat oil, add curry leaves and onion; sauté till soft.","Add ginger-garlic and the chicken; cook on high 5 min.","Add crushed pepper and salt, cover and cook till done."]'::jsonb, 'Dal in the rice adds plant protein on top of the chicken.', 'Two protein sources on one plate.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 627, 50.6, 13.1, 74.2, 0.997, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('4a3b0226-3af8-51f2-a322-810c6af23afd', 'Prawn thokku with rice', 'tamil', 'lunch', 'nonveg', 2, 30, '["Cook the rice.","Heat oil, add curry leaves and onion; sauté till golden.","Add ginger-garlic, tomato and powders; mash into a thick masala.","Add prawns and cook 5–6 min till curled and pink. Don''t overcook."]'::jsonb, 'Swap half the rice for extra prawns on training days.', 'Prawns are almost pure protein.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 533, 38, 9.9, 73.9, 0.997, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('c295a185-2704-5335-a31b-c554e2c51a46', 'Kerala fish curry (meen curry) with red rice', 'kerala', 'lunch', 'nonveg', 2, 35, '["Cook the red rice.","Heat coconut oil; sauté shallots, ginger, garlic, green chilli and curry leaves.","Add tomato and powders; cook soft.","Pour in coconut milk and bring to a gentle simmer.","Add fish and cook 6–8 min without stirring hard."]'::jsonb, 'Red rice adds fibre; keep the coconut milk to one cup for balance.', 'Fish plus red rice: protein and slow carbs.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 739, 52, 28.6, 70.7, 0.998, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('b1dc27ff-abf1-5f0b-aebd-5db64d4d4490', 'Egg curry with rice', 'tamil', 'lunch', 'egg', 2, 30, '["Boil the eggs 9 min, cool and peel.","Heat oil and fry onion till golden.","Add ginger-garlic, tomato and powders; cook into a thick gravy with a little water.","Add the eggs (slit lightly) and simmer 5 min. Serve with rice."]'::jsonb, 'Add 2 extra egg whites to the gravy for a cheap protein boost.', 'Two eggs each, simple and filling.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 585, 23.2, 20.7, 76.5, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('59f269dc-5c97-5b18-a7ee-f46f877bb057', 'Mutton kuzhambu with rice', 'tamil', 'lunch', 'nonveg', 2, 60, '["Pressure-cook mutton with turmeric, salt and water (5–6 whistles).","Grind coconut and fennel to a paste.","Heat oil, cook onion, ginger-garlic and tomato with the powders.","Add mutton with its stock and the paste; simmer 10 min."]'::jsonb, 'Goat meat is lean — keep the oil to one tablespoon.', 'Slow-cooked comfort with solid protein.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 636, 39.7, 18.1, 78.8, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('b2510b31-0e62-551b-af5a-1a958c420fda', 'Chicken keema with chapati', 'mixed', 'lunch', 'nonveg', 2, 30, '["Knead the wheat flour with water and rest 10 min; roll and cook 4 chapatis.","Heat oil, cook onion till soft, add ginger-garlic.","Add mince and break it up; cook till no longer pink.","Add tomato, peas and powders; cook dry. Finish with coriander leaves."]'::jsonb, 'Mince cooks fast and soaks up flavour — great for lunch boxes.', 'Lean chicken mince plus peas.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 555, 36.1, 20.2, 62.4, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('23b3ac85-d4dc-5d4c-a684-66ebae33f045', 'Sambar with drumstick and steamed rice', 'tamil', 'lunch', 'veg', 2, 40, '["Pressure-cook toor dal with turmeric till soft; mash.","Boil the vegetables in tamarind water with sambar powder and salt.","Add the dal and simmer 5 min.","Temper mustard and curry leaves in oil and pour over.","Serve with rice and a bowl of yogurt."]'::jsonb, 'A full cup of dal plus yogurt makes this a proper protein lunch.', 'Dal and yogurt pair for complete protein.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 671, 25.5, 11.2, 120.9, 0.998, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('6978e3f1-0cd7-5df5-a1a3-f34ae9b9ab08', 'Rajma sundal bowl with millet', 'mixed', 'lunch', 'veg', 2, 30, '["Soak rajma overnight and pressure-cook till soft.","Cook the millet like rice (1:2.5 water).","Temper mustard, curry leaves and green chilli in oil; add onion and tomato.","Toss in rajma, coconut and salt; finish with lemon."]'::jsonb, 'Beans plus millet make a complete plant protein.', 'High-fibre, high-protein vegetarian bowl.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 536, 21.5, 12, 87.5, 0.995, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('f3abc10c-ba14-51f0-a3fc-a3facd9b0fd7', 'Andhra chicken curry with rice', 'andhra', 'lunch', 'nonveg', 2, 40, '["Cook the rice.","Heat oil, brown the onion well.","Add ginger-garlic, chilli and coriander powders; fry 1 min.","Add chicken and tomato, cover and cook 20 min, stirring.","Finish with garam masala."]'::jsonb, 'Ask for the spice your way — chilli doesn''t change the protein!', 'Fiery, simple and protein-packed.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 656, 51.1, 15.7, 76.4, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('708998cf-6313-526f-ae74-d5806998ac4c', 'Gongura chicken with rice', 'andhra', 'lunch', 'nonveg', 2, 40, '["Sauté gongura leaves in a little oil till they melt; set aside.","Cook onion, garlic and green chilli in the remaining oil.","Add chicken, powders and salt; cover and cook 20 min.","Stir in the gongura and cook 5 min more."]'::jsonb, 'The tangy leaves mean you need less oil for flavour.', 'Signature Andhra tang with lean chicken.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 639, 49.9, 14.8, 73.5, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('8f337f0e-7297-503b-aa1e-c2484111295a', 'Tofu and green peas kurma with chapati', 'mixed', 'lunch', 'veg', 2, 30, '["Make 4 chapatis.","Grind coconut and cashew into a smooth paste.","Cook onion, ginger-garlic and tomato in oil; add the paste and a cup of water.","Add tofu cubes and peas; simmer 8 min."]'::jsonb, 'Firm tofu is the vegetarian swap for paneer here.', 'Tofu and peas make a high-protein veg kurma.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 596, 33.1, 25.9, 68.5, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('148cfd1d-232d-5a4a-a84b-565bd5059098', 'Mackerel fry with lemon rice', 'kerala', 'lunch', 'nonveg', 2, 30, '["Marinate the fish with chilli, turmeric, ginger-garlic and salt for 15 min.","Shallow-fry in coconut oil, 4 min per side.","Cook the rice; temper mustard, peanuts and curry leaves and toss into the rice with lemon juice."]'::jsonb, 'Mackerel is rich in protein and omega-3 fats.', 'Crisp fish plus a tangy rice.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 778, 41.5, 38.1, 66.5, 0.997, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('59bbcabe-ef7b-5aac-a015-10d2bf0eecaa', 'Chicken pulao with yogurt raita', 'mixed', 'lunch', 'nonveg', 2, 40, '["Brown the onion in ghee and oil; add ginger-garlic and chicken.","Add tomato, garam masala, mint and the rinsed rice.","Pour in water (1:2), cover and cook till done.","Mix yogurt with grated cucumber and salt for raita."]'::jsonb, 'The raita isn''t just a side — it adds about 7 g protein.', 'One-pot, protein-rich and family-friendly.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 630, 42.9, 16.3, 75.8, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('41ab9bf3-65cc-5295-a021-e15e169dc882', 'Moong dal kootu with rice and egg podimas', 'tamil', 'lunch', 'egg', 2, 35, '["Cook moong dal with turmeric till soft; add chopped cabbage and cook 5 min.","Grind coconut and cumin; stir into the dal.","Scramble the eggs with onion and green chilli in a little oil (podimas).","Temper mustard and curry leaves over the kootu. Serve with rice."]'::jsonb, 'Podimas is the fastest protein add-on in a South Indian kitchen.', 'Dal plus eggs, gentle and filling.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 671, 30.1, 19.6, 94.2, 0.997, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('7e5e8291-011f-51c5-ac22-56784539ac4f', 'Crab masala with rice', 'tamil', 'lunch', 'nonveg', 2, 40, '["Clean the crab and crack the claws lightly.","Fry onion, curry leaves and ginger-garlic in oil.","Add tomato and powders; cook down.","Add crab with a little water, cover and cook 15 min. Finish with crushed pepper and fennel."]'::jsonb, 'Weight here is whole crab; the meat is very lean.', 'A weekend treat that''s still high-protein.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 626, 53.2, 12, 74.6, 0.998, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('c8f5ca21-bcc7-5694-afab-d81e8b67b794', 'Chana masala with brown rice', 'mixed', 'lunch', 'veg', 2, 35, '["Soak chickpeas overnight; pressure-cook till soft.","Cook brown rice.","Cook onion, ginger-garlic, tomato and powders in oil.","Add chickpeas with some cooking water; simmer 10 min. Serve with rice and yogurt."]'::jsonb, 'Add yogurt on the side for complete protein.', 'Hearty, fibre-rich and protein-rich.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 647, 23.3, 15.6, 107.5, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('dec6a231-2894-5a78-aa40-621f24dee785', 'Karnataka chicken saaru with ragi mudde', 'karnataka', 'lunch', 'nonveg', 2, 45, '["Cook chicken with onion, ginger-garlic, tomato and powders in oil, then add water for a thin curry (saaru).","Grind coconut with pepper and stir in; simmer 10 min.","For mudde: boil 250 ml water, add ragi flour, stir hard into a firm dough and shape into balls."]'::jsonb, 'Ragi brings calcium and fibre; the saaru brings the protein.', 'Classic Karnataka pairing.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 601, 46.6, 20, 59.7, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('ec6719a2-28cb-5697-aa02-2ea375a2e050', 'Egg and spinach thoran with rice', 'kerala', 'lunch', 'egg', 2, 25, '["Cook the rice.","Temper mustard and curry leaves in coconut oil; add shallots, garlic and chilli.","Add chopped spinach and cook till wilted.","Push aside, scramble in the eggs, then mix with grated coconut."]'::jsonb, 'Greens plus eggs: iron, folate and protein together.', 'Quick Kerala-style stir-fry.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 564, 24.3, 23.6, 64.6, 0.997, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('93a6c280-801d-514a-a2cc-2c11ff672469', 'Grilled chicken with sautéed vegetables', 'mixed', 'dinner', 'nonveg', 2, 30, '["Marinate chicken with lemon, garlic, pepper and salt.","Grill or pan-sear 6–7 min per side.","Sauté the vegetables in the remaining oil with garlic. Slice the chicken over the top."]'::jsonb, 'No rice tonight keeps dinner light but high-protein.', 'Lean, light and very high in protein.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 323, 41.7, 11, 13.8, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('497f9c79-6cd8-5272-a025-8c8640ae8f05', 'Tawa seer fish fry with beans poriyal', 'tamil', 'dinner', 'nonveg', 2, 30, '["Marinate fish with powders, ginger-garlic, lemon and salt for 15 min.","Shallow-fry on a hot tawa, 3–4 min per side.","For poriyal: temper mustard, urad dal and curry leaves; add chopped beans and cook; toss with coconut."]'::jsonb, 'Fish plus a vegetable side makes an easy low-carb dinner.', 'Crisp, lean and protein-rich.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 350, 39.4, 15.5, 14.3, 0.997, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('7b345443-1c07-53ea-add6-0437f732e5b4', 'Pesarattu with ginger chutney', 'andhra', 'dinner', 'veg', 2, 30, '["Soak green gram and rice 4–6 hours; grind with ginger, chilli and cumin to a batter.","Spread thin on a hot tawa, sprinkle onion, drizzle oil and cook till crisp.","For chutney: grind ginger with tamarind, jaggery and salt."]'::jsonb, 'Have 3 pesarattu with a glass of buttermilk for more protein.', 'Whole green gram dosa — protein in every bite.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 420, 19.8, 8.8, 67.8, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('bc037f27-d0bf-57ec-a8d5-94c978cc11f2', 'Adai (mixed dal dosa) with avial', 'tamil', 'dinner', 'veg', 2, 40, '["Soak the dals and rice 3 hours; grind coarsely with chilli and ginger.","Make thick dosas with onion, cooking with a little oil.","For avial: cook carrot and beans, then stir in coconut ground with yogurt."]'::jsonb, 'Four dals together give a fuller amino-acid mix.', 'Multi-dal dosa, the protein star of tiffin.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 596, 24.1, 17.1, 90.1, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('3eae45e7-a064-537a-ac35-679da5580afa', 'Egg podimas with chapati', 'tamil', 'dinner', 'egg', 2, 20, '["Make 3–4 chapatis.","Sauté onion, green chilli and tomato in oil.","Add beaten eggs and whites with turmeric, salt and pepper; scramble softly."]'::jsonb, 'Extra whites raise protein without much fat.', '15-minute dinner with serious protein.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 440, 26.5, 17.7, 45.9, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('12d40572-c2b4-5256-ab92-a1d38dee6002', 'Chicken sukka with cucumber salad', 'karnataka', 'dinner', 'nonveg', 2, 35, '["Dry-roast coconut, red chillies, coriander and pepper; grind coarsely.","Cook onion and garlic in ghee and oil.","Add chicken and cook covered 15 min.","Add the masala and roast dry till coated. Serve with a lemony cucumber salad."]'::jsonb, 'A dry dish means no rice is needed.', 'Mangalorean-style dry chicken, low-carb dinner.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 440, 45.8, 21.2, 17.7, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('3abcfea4-4b0e-52a5-a9cc-1b39cf28112c', 'Prawn and vegetable stir-fry', 'mixed', 'dinner', 'nonveg', 2, 20, '["Heat oil till very hot; add garlic and ginger.","Add prawns and cook 2 min.","Add vegetables and stir-fry 3–4 min.","Finish with soy sauce and pepper."]'::jsonb, 'Ready in 20 minutes with almost 40 g protein each.', 'Fast, fresh and high-protein.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 246, 33.9, 7.3, 13.7, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('eb170ba1-256c-5637-aac1-a0a6518e1483', 'Moong dal cheela with mint chutney', 'mixed', 'dinner', 'veg', 2, 25, '["Soak moong dal 3 hours and grind smooth with ginger and chilli.","Stir in chopped onion and tomato.","Cook thin pancakes on a greased tawa.","Blend mint, coriander and yogurt for the chutney."]'::jsonb, 'Yogurt chutney adds extra protein to every bite.', 'Light dal pancakes for a quick dinner.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 387, 21.8, 9.6, 56.6, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('bb9eb0a2-9888-5bdf-aa2e-7337f73d102f', 'Mutton pepper fry with salad', 'tamil', 'dinner', 'nonveg', 2, 60, '["Pressure-cook mutton with turmeric and salt.","Fry onion, curry leaves and ginger-garlic in oil.","Add mutton and cook till the water dries.","Add crushed pepper and fennel; roast till dark. Serve with a cucumber-tomato salad."]'::jsonb, 'A dry fry needs little or no rice.', 'Rich flavour, lean protein.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 297, 33.4, 11.6, 15, 0.997, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('5d8e1f6c-be3f-549a-ac94-85d31d3158ba', 'Kerala egg roast with appam-style rice pancakes', 'kerala', 'dinner', 'egg', 2, 35, '["Boil and peel the eggs.","Cook onion slowly in coconut oil till deep golden.","Add ginger-garlic, tomato and powders; roast.","Add eggs and coat well.","For quick pancakes: whisk rice flour with coconut milk and water; cook thin on a covered pan."]'::jsonb, 'Have three eggs if it''s a training day.', 'Kerala comfort food built around eggs.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 580, 22.1, 30.1, 59.1, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('86fdc360-a3a1-5a6c-ab87-bc53e24e3d05', 'Chicken soup with millet', 'mixed', 'dinner', 'nonveg', 2, 35, '["Sauté onion, ginger and garlic in ghee.","Add chicken, vegetables, millet and 1 litre water.","Simmer 25 min till the millet is soft. Finish with pepper."]'::jsonb, 'Soup dinners are great after a hard workout.', 'Warm, light and protein-rich.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 377, 37.2, 10.2, 33.4, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('7b3e1b96-f37d-55bc-a815-6882252a17e2', 'Tofu bhurji with chapati', 'mixed', 'dinner', 'veg', 2, 20, '["Make 3–4 chapatis.","Sauté onion, chilli, capsicum and tomato in oil.","Crumble in the tofu with turmeric, garam masala and salt; cook 5 min."]'::jsonb, 'Crumbled firm tofu works like paneer bhurji.', 'Quick vegetarian scramble.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 477, 32.3, 20.4, 50.9, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('f168bf6f-9119-5f44-a041-7b4ac7a116c1', 'Anchovy (nethili) fry with keerai kootu', 'tamil', 'dinner', 'nonveg', 2, 35, '["Coat cleaned anchovies with chilli, turmeric, rice flour and salt; shallow-fry till crisp.","Cook moong dal till soft, add chopped spinach and cook 5 min.","Stir in coconut ground with cumin."]'::jsonb, 'Tiny fish, big protein — and calcium too.', 'Crisp nethili with greens and dal.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 468, 42.2, 19.6, 32.5, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('c0d36c82-4501-5ee9-abcf-d6b871a72b6a', 'Chicken tikka-style skewers with mint yogurt', 'mixed', 'dinner', 'nonveg', 2, 40, '["Marinate chicken in half the yogurt with spices, lemon and salt for 30 min.","Thread with onion and capsicum; grill or pan-roast 12–15 min.","Blend the rest of the yogurt with mint for the dip."]'::jsonb, 'Yogurt marinade keeps lean breast juicy.', 'Restaurant flavour, home-light.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 354, 44.1, 12.8, 15.3, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('35c9de2a-31f7-5bce-aaf2-e1b3dfe4f46e', 'Masoor dal with jeera rice and egg', 'mixed', 'dinner', 'egg', 2, 30, '["Pressure-cook masoor dal with tomato and turmeric.","Temper cumin and garlic in ghee and pour over.","Cook rice with cumin.","Boil the eggs and serve one each on top."]'::jsonb, 'One egg each turns a simple dal into a high-protein dinner.', 'Comforting dal, boosted.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 603, 27.7, 12.9, 94.4, 1, false, '{}', '2026-01-01T00:00:00Z'),
  ('8d334008-58f6-5d18-a62c-23f06a731721', 'Squid (kanava) roast with salad', 'kerala', 'dinner', 'nonveg', 2, 35, '["Cook cleaned squid rings with salt and turmeric for 10 min.","Roast onion, ginger-garlic and curry leaves in coconut oil till brown.","Add tomato and powders, then the squid; roast till dry. Serve with cucumber."]'::jsonb, 'Squid is very lean — this is one of the highest-protein dinners here.', 'Kerala-style roast, low-carb.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 294, 29.9, 10.6, 21.2, 0.997, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('2a277a77-0550-52fa-a79f-2c3b13347c34', 'Sprouts sundal and vegetable soup', 'tamil', 'dinner', 'veg', 2, 20, '["Pressure-cook soaked chickpeas; steam the sprouts 5 min.","Temper mustard, chilli and curry leaves; toss with sprouts, chickpeas, coconut and lemon.","Simmer carrot, cabbage, tomato and garlic in water for a quick soup. Serve with a bowl of yogurt."]'::jsonb, 'Yogurt on the side lifts this to a proper protein dinner.', 'Light, plant-protein dinner.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 453, 21.8, 16.1, 61.5, 0.998, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('556d5b3a-83b0-548c-ad86-f647fd74c226', 'Chicken kothu-style chapati', 'tamil', 'dinner', 'nonveg', 2, 30, '["Make chapatis and shred them into strips.","Cook onion, chilli, curry leaves, tomato and capsicum in oil.","Add diced chicken and cook through; push aside and scramble the eggs.","Toss in the chapati strips with garam masala, chopping with the spatula."]'::jsonb, 'A smart way to turn leftover chapatis into a protein meal.', 'Street-food fun at home.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 540, 42.9, 18, 53.8, 0.997, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('42493d15-ac15-531b-a412-ae1460e0ef4d', 'Telangana egg pulusu with rice', 'telangana', 'dinner', 'egg', 2, 30, '["Boil and peel the eggs; fry them lightly in a little oil.","Cook onion and tomato with the powders.","Add tamarind water and jaggery; simmer 10 min.","Add the eggs and simmer 5 min. Serve with rice."]'::jsonb, 'Eggs soak up the tangy pulusu beautifully.', 'Tangy, spicy and protein-rich.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 533, 21.4, 20.3, 66.6, 0.997, false, '{"curry leaves"}', '2026-01-01T00:00:00Z'),
  ('1692a93d-16b3-5104-aa20-7c544f75db4d', 'Garlic pepper tuna with sautéed greens', 'mixed', 'dinner', 'nonveg', 2, 20, '["Season tuna steaks with pepper, salt and lemon.","Sear in hot oil 2–3 min per side.","Sauté garlic and greens in the same pan till wilted."]'::jsonb, 'About 40 g protein in a 20-minute dinner.', 'Clean, fast and high-protein.', 'built-in library (written by Claude)', 'library-2026-11-18', null, 'computed', 294, 47.4, 7.5, 9.3, 1, false, '{}', '2026-01-01T00:00:00Z')
on conflict (id) do update set title = excluded.title, steps = excluded.steps, protein_tip = excluded.protein_tip, why = excluded.why, nutrition_status = excluded.nutrition_status,
  per_serving_kcal = excluded.per_serving_kcal, per_serving_protein_g = excluded.per_serving_protein_g, per_serving_fat_g = excluded.per_serving_fat_g,
  per_serving_carb_g = excluded.per_serving_carb_g, matched_mass_pct = excluded.matched_mass_pct, oil_added = excluded.oil_added, unmatched = excluded.unmatched;

delete from public.recipe_ingredients where recipe_id in ('cdc1a260-c89b-5105-aff0-465cb5b58275', '455f36c4-9621-51fd-a5e7-c18b4efb8244', '58a5bfc3-516b-5fa2-a90e-f722f26e8e85', '4a3b0226-3af8-51f2-a322-810c6af23afd', 'c295a185-2704-5335-a31b-c554e2c51a46', 'b1dc27ff-abf1-5f0b-aebd-5db64d4d4490', '59f269dc-5c97-5b18-a7ee-f46f877bb057', 'b2510b31-0e62-551b-af5a-1a958c420fda', '23b3ac85-d4dc-5d4c-a684-66ebae33f045', '6978e3f1-0cd7-5df5-a1a3-f34ae9b9ab08', 'f3abc10c-ba14-51f0-a3fc-a3facd9b0fd7', '708998cf-6313-526f-ae74-d5806998ac4c', '8f337f0e-7297-503b-aa1e-c2484111295a', '148cfd1d-232d-5a4a-a84b-565bd5059098', '59bbcabe-ef7b-5aac-a015-10d2bf0eecaa', '41ab9bf3-65cc-5295-a021-e15e169dc882', '7e5e8291-011f-51c5-ac22-56784539ac4f', 'c8f5ca21-bcc7-5694-afab-d81e8b67b794', 'dec6a231-2894-5a78-aa40-621f24dee785', 'ec6719a2-28cb-5697-aa02-2ea375a2e050', '93a6c280-801d-514a-a2cc-2c11ff672469', '497f9c79-6cd8-5272-a025-8c8640ae8f05', '7b345443-1c07-53ea-add6-0437f732e5b4', 'bc037f27-d0bf-57ec-a8d5-94c978cc11f2', '3eae45e7-a064-537a-ac35-679da5580afa', '12d40572-c2b4-5256-ab92-a1d38dee6002', '3abcfea4-4b0e-52a5-a9cc-1b39cf28112c', 'eb170ba1-256c-5637-aac1-a0a6518e1483', 'bb9eb0a2-9888-5bdf-aa2e-7337f73d102f', '5d8e1f6c-be3f-549a-ac94-85d31d3158ba', '86fdc360-a3a1-5a6c-ab87-bc53e24e3d05', '7b3e1b96-f37d-55bc-a815-6882252a17e2', 'f168bf6f-9119-5f44-a041-7b4ac7a116c1', 'c0d36c82-4501-5ee9-abcf-d6b871a72b6a', '35c9de2a-31f7-5bce-aaf2-e1b3dfe4f46e', '8d334008-58f6-5d18-a62c-23f06a731721', '2a277a77-0550-52fa-a79f-2c3b13347c34', '556d5b3a-83b0-548c-ad86-f647fd74c226', '42493d15-ac15-531b-a412-ae1460e0ef4d', '1692a93d-16b3-5104-aa20-7c544f75db4d');
insert into public.recipe_ingredients (recipe_id, position, food_id, raw_name, grams, matched, added) values
  ('cdc1a260-c89b-5105-aff0-465cb5b58275', 0, (select id from public.foods where key = 'chicken'), 'chicken', 400, true, false),
  ('cdc1a260-c89b-5105-aff0-465cb5b58275', 1, (select id from public.foods where key = 'onion'), 'onion', 150, true, false),
  ('cdc1a260-c89b-5105-aff0-465cb5b58275', 2, (select id from public.foods where key = 'tomato'), 'tomato', 120, true, false),
  ('cdc1a260-c89b-5105-aff0-465cb5b58275', 3, (select id from public.foods where key = 'ginger'), 'ginger', 10, true, false),
  ('cdc1a260-c89b-5105-aff0-465cb5b58275', 4, (select id from public.foods where key = 'garlic'), 'garlic', 10, true, false),
  ('cdc1a260-c89b-5105-aff0-465cb5b58275', 5, (select id from public.foods where key = 'black_pepper'), 'black pepper', 4, true, false),
  ('cdc1a260-c89b-5105-aff0-465cb5b58275', 6, (select id from public.foods where key = 'fennel'), 'fennel seeds', 3, true, false),
  ('cdc1a260-c89b-5105-aff0-465cb5b58275', 7, (select id from public.foods where key = 'coriander_powder'), 'coriander powder', 6, true, false),
  ('cdc1a260-c89b-5105-aff0-465cb5b58275', 8, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 4, true, false),
  ('cdc1a260-c89b-5105-aff0-465cb5b58275', 9, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('cdc1a260-c89b-5105-aff0-465cb5b58275', 10, (select id from public.foods where key = 'coconut'), 'coconut', 30, true, false),
  ('cdc1a260-c89b-5105-aff0-465cb5b58275', 11, (select id from public.foods where key = 'oil'), 'oil', 15, true, false),
  ('cdc1a260-c89b-5105-aff0-465cb5b58275', 12, null, 'curry leaves', 2, false, false),
  ('cdc1a260-c89b-5105-aff0-465cb5b58275', 13, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('cdc1a260-c89b-5105-aff0-465cb5b58275', 14, (select id from public.foods where key = 'rice_raw'), 'rice', 150, true, false),
  ('455f36c4-9621-51fd-a5e7-c18b4efb8244', 0, (select id from public.foods where key = 'seer_fish'), 'seer fish', 350, true, false),
  ('455f36c4-9621-51fd-a5e7-c18b4efb8244', 1, (select id from public.foods where key = 'shallot'), 'shallot', 100, true, false),
  ('455f36c4-9621-51fd-a5e7-c18b4efb8244', 2, (select id from public.foods where key = 'tomato'), 'tomato', 120, true, false),
  ('455f36c4-9621-51fd-a5e7-c18b4efb8244', 3, (select id from public.foods where key = 'tamarind'), 'tamarind', 20, true, false),
  ('455f36c4-9621-51fd-a5e7-c18b4efb8244', 4, (select id from public.foods where key = 'garlic'), 'garlic', 10, true, false),
  ('455f36c4-9621-51fd-a5e7-c18b4efb8244', 5, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 5, true, false),
  ('455f36c4-9621-51fd-a5e7-c18b4efb8244', 6, (select id from public.foods where key = 'coriander_powder'), 'coriander powder', 8, true, false),
  ('455f36c4-9621-51fd-a5e7-c18b4efb8244', 7, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('455f36c4-9621-51fd-a5e7-c18b4efb8244', 8, (select id from public.foods where key = 'fenugreek_seeds'), 'fenugreek seeds', 2, true, false),
  ('455f36c4-9621-51fd-a5e7-c18b4efb8244', 9, (select id from public.foods where key = 'mustard_seeds'), 'mustard seeds', 2, true, false),
  ('455f36c4-9621-51fd-a5e7-c18b4efb8244', 10, (select id from public.foods where key = 'gingelly_oil'), 'gingelly oil', 15, true, false),
  ('455f36c4-9621-51fd-a5e7-c18b4efb8244', 11, null, 'curry leaves', 2, false, false),
  ('455f36c4-9621-51fd-a5e7-c18b4efb8244', 12, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('455f36c4-9621-51fd-a5e7-c18b4efb8244', 13, (select id from public.foods where key = 'rice_raw'), 'rice', 150, true, false),
  ('58a5bfc3-516b-5fa2-a90e-f722f26e8e85', 0, (select id from public.foods where key = 'chicken_breast'), 'chicken breast', 350, true, false),
  ('58a5bfc3-516b-5fa2-a90e-f722f26e8e85', 1, (select id from public.foods where key = 'onion'), 'onion', 120, true, false),
  ('58a5bfc3-516b-5fa2-a90e-f722f26e8e85', 2, (select id from public.foods where key = 'black_pepper'), 'black pepper', 6, true, false),
  ('58a5bfc3-516b-5fa2-a90e-f722f26e8e85', 3, (select id from public.foods where key = 'ginger'), 'ginger', 10, true, false),
  ('58a5bfc3-516b-5fa2-a90e-f722f26e8e85', 4, (select id from public.foods where key = 'garlic'), 'garlic', 10, true, false),
  ('58a5bfc3-516b-5fa2-a90e-f722f26e8e85', 5, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('58a5bfc3-516b-5fa2-a90e-f722f26e8e85', 6, (select id from public.foods where key = 'oil'), 'oil', 15, true, false),
  ('58a5bfc3-516b-5fa2-a90e-f722f26e8e85', 7, null, 'curry leaves', 2, false, false),
  ('58a5bfc3-516b-5fa2-a90e-f722f26e8e85', 8, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('58a5bfc3-516b-5fa2-a90e-f722f26e8e85', 9, (select id from public.foods where key = 'rice_raw'), 'rice', 120, true, false),
  ('58a5bfc3-516b-5fa2-a90e-f722f26e8e85', 10, (select id from public.foods where key = 'toor_dal'), 'toor dal', 50, true, false),
  ('4a3b0226-3af8-51f2-a322-810c6af23afd', 0, (select id from public.foods where key = 'prawn'), 'prawn', 300, true, false),
  ('4a3b0226-3af8-51f2-a322-810c6af23afd', 1, (select id from public.foods where key = 'onion'), 'onion', 120, true, false),
  ('4a3b0226-3af8-51f2-a322-810c6af23afd', 2, (select id from public.foods where key = 'tomato'), 'tomato', 150, true, false),
  ('4a3b0226-3af8-51f2-a322-810c6af23afd', 3, (select id from public.foods where key = 'garlic'), 'garlic', 10, true, false),
  ('4a3b0226-3af8-51f2-a322-810c6af23afd', 4, (select id from public.foods where key = 'ginger'), 'ginger', 8, true, false),
  ('4a3b0226-3af8-51f2-a322-810c6af23afd', 5, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 5, true, false),
  ('4a3b0226-3af8-51f2-a322-810c6af23afd', 6, (select id from public.foods where key = 'coriander_powder'), 'coriander powder', 5, true, false),
  ('4a3b0226-3af8-51f2-a322-810c6af23afd', 7, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('4a3b0226-3af8-51f2-a322-810c6af23afd', 8, (select id from public.foods where key = 'oil'), 'oil', 15, true, false),
  ('4a3b0226-3af8-51f2-a322-810c6af23afd', 9, null, 'curry leaves', 2, false, false),
  ('4a3b0226-3af8-51f2-a322-810c6af23afd', 10, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('4a3b0226-3af8-51f2-a322-810c6af23afd', 11, (select id from public.foods where key = 'rice_raw'), 'rice', 150, true, false),
  ('c295a185-2704-5335-a31b-c554e2c51a46', 0, (select id from public.foods where key = 'tuna'), 'tuna', 350, true, false),
  ('c295a185-2704-5335-a31b-c554e2c51a46', 1, (select id from public.foods where key = 'shallot'), 'shallot', 80, true, false),
  ('c295a185-2704-5335-a31b-c554e2c51a46', 2, (select id from public.foods where key = 'tomato'), 'tomato', 100, true, false),
  ('c295a185-2704-5335-a31b-c554e2c51a46', 3, (select id from public.foods where key = 'ginger'), 'ginger', 10, true, false),
  ('c295a185-2704-5335-a31b-c554e2c51a46', 4, (select id from public.foods where key = 'garlic'), 'garlic', 10, true, false),
  ('c295a185-2704-5335-a31b-c554e2c51a46', 5, (select id from public.foods where key = 'green_chilli'), 'green chilli', 6, true, false),
  ('c295a185-2704-5335-a31b-c554e2c51a46', 6, (select id from public.foods where key = 'coconut_milk'), 'coconut milk', 150, true, false),
  ('c295a185-2704-5335-a31b-c554e2c51a46', 7, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 5, true, false),
  ('c295a185-2704-5335-a31b-c554e2c51a46', 8, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('c295a185-2704-5335-a31b-c554e2c51a46', 9, (select id from public.foods where key = 'coconut_oil'), 'coconut oil', 15, true, false),
  ('c295a185-2704-5335-a31b-c554e2c51a46', 10, null, 'curry leaves', 2, false, false),
  ('c295a185-2704-5335-a31b-c554e2c51a46', 11, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('c295a185-2704-5335-a31b-c554e2c51a46', 12, (select id from public.foods where key = 'rice_red'), 'red rice', 140, true, false),
  ('b1dc27ff-abf1-5f0b-aebd-5db64d4d4490', 0, (select id from public.foods where key = 'egg'), 'egg', 240, true, false),
  ('b1dc27ff-abf1-5f0b-aebd-5db64d4d4490', 1, (select id from public.foods where key = 'onion'), 'onion', 150, true, false),
  ('b1dc27ff-abf1-5f0b-aebd-5db64d4d4490', 2, (select id from public.foods where key = 'tomato'), 'tomato', 150, true, false),
  ('b1dc27ff-abf1-5f0b-aebd-5db64d4d4490', 3, (select id from public.foods where key = 'ginger'), 'ginger', 8, true, false),
  ('b1dc27ff-abf1-5f0b-aebd-5db64d4d4490', 4, (select id from public.foods where key = 'garlic'), 'garlic', 8, true, false),
  ('b1dc27ff-abf1-5f0b-aebd-5db64d4d4490', 5, (select id from public.foods where key = 'coriander_powder'), 'coriander powder', 6, true, false),
  ('b1dc27ff-abf1-5f0b-aebd-5db64d4d4490', 6, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 4, true, false),
  ('b1dc27ff-abf1-5f0b-aebd-5db64d4d4490', 7, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('b1dc27ff-abf1-5f0b-aebd-5db64d4d4490', 8, (select id from public.foods where key = 'garam_masala'), 'garam masala', 2, true, false),
  ('b1dc27ff-abf1-5f0b-aebd-5db64d4d4490', 9, (select id from public.foods where key = 'oil'), 'oil', 15, true, false),
  ('b1dc27ff-abf1-5f0b-aebd-5db64d4d4490', 10, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('b1dc27ff-abf1-5f0b-aebd-5db64d4d4490', 11, (select id from public.foods where key = 'rice_raw'), 'rice', 150, true, false),
  ('59f269dc-5c97-5b18-a7ee-f46f877bb057', 0, (select id from public.foods where key = 'mutton'), 'mutton', 300, true, false),
  ('59f269dc-5c97-5b18-a7ee-f46f877bb057', 1, (select id from public.foods where key = 'onion'), 'onion', 150, true, false),
  ('59f269dc-5c97-5b18-a7ee-f46f877bb057', 2, (select id from public.foods where key = 'tomato'), 'tomato', 120, true, false),
  ('59f269dc-5c97-5b18-a7ee-f46f877bb057', 3, (select id from public.foods where key = 'ginger'), 'ginger', 10, true, false),
  ('59f269dc-5c97-5b18-a7ee-f46f877bb057', 4, (select id from public.foods where key = 'garlic'), 'garlic', 10, true, false),
  ('59f269dc-5c97-5b18-a7ee-f46f877bb057', 5, (select id from public.foods where key = 'coriander_powder'), 'coriander powder', 8, true, false),
  ('59f269dc-5c97-5b18-a7ee-f46f877bb057', 6, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 5, true, false),
  ('59f269dc-5c97-5b18-a7ee-f46f877bb057', 7, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('59f269dc-5c97-5b18-a7ee-f46f877bb057', 8, (select id from public.foods where key = 'fennel'), 'fennel seeds', 3, true, false),
  ('59f269dc-5c97-5b18-a7ee-f46f877bb057', 9, (select id from public.foods where key = 'coconut'), 'coconut', 30, true, false),
  ('59f269dc-5c97-5b18-a7ee-f46f877bb057', 10, (select id from public.foods where key = 'oil'), 'oil', 15, true, false),
  ('59f269dc-5c97-5b18-a7ee-f46f877bb057', 11, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('59f269dc-5c97-5b18-a7ee-f46f877bb057', 12, (select id from public.foods where key = 'rice_raw'), 'rice', 150, true, false),
  ('b2510b31-0e62-551b-af5a-1a958c420fda', 0, (select id from public.foods where key = 'chicken_mince'), 'chicken mince', 300, true, false),
  ('b2510b31-0e62-551b-af5a-1a958c420fda', 1, (select id from public.foods where key = 'onion'), 'onion', 120, true, false),
  ('b2510b31-0e62-551b-af5a-1a958c420fda', 2, (select id from public.foods where key = 'tomato'), 'tomato', 100, true, false),
  ('b2510b31-0e62-551b-af5a-1a958c420fda', 3, (select id from public.foods where key = 'green_peas'), 'green peas', 80, true, false),
  ('b2510b31-0e62-551b-af5a-1a958c420fda', 4, (select id from public.foods where key = 'ginger'), 'ginger', 8, true, false),
  ('b2510b31-0e62-551b-af5a-1a958c420fda', 5, (select id from public.foods where key = 'garlic'), 'garlic', 8, true, false),
  ('b2510b31-0e62-551b-af5a-1a958c420fda', 6, (select id from public.foods where key = 'garam_masala'), 'garam masala', 3, true, false),
  ('b2510b31-0e62-551b-af5a-1a958c420fda', 7, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 4, true, false),
  ('b2510b31-0e62-551b-af5a-1a958c420fda', 8, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('b2510b31-0e62-551b-af5a-1a958c420fda', 9, (select id from public.foods where key = 'oil'), 'oil', 12, true, false),
  ('b2510b31-0e62-551b-af5a-1a958c420fda', 10, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('b2510b31-0e62-551b-af5a-1a958c420fda', 11, (select id from public.foods where key = 'wheat_flour'), 'wheat flour', 120, true, false),
  ('23b3ac85-d4dc-5d4c-a684-66ebae33f045', 0, (select id from public.foods where key = 'toor_dal'), 'toor dal', 120, true, false),
  ('23b3ac85-d4dc-5d4c-a684-66ebae33f045', 1, (select id from public.foods where key = 'drumstick'), 'drumstick', 100, true, false),
  ('23b3ac85-d4dc-5d4c-a684-66ebae33f045', 2, (select id from public.foods where key = 'brinjal'), 'brinjal', 80, true, false),
  ('23b3ac85-d4dc-5d4c-a684-66ebae33f045', 3, (select id from public.foods where key = 'shallot'), 'shallot', 60, true, false),
  ('23b3ac85-d4dc-5d4c-a684-66ebae33f045', 4, (select id from public.foods where key = 'tomato'), 'tomato', 100, true, false),
  ('23b3ac85-d4dc-5d4c-a684-66ebae33f045', 5, (select id from public.foods where key = 'tamarind'), 'tamarind', 15, true, false),
  ('23b3ac85-d4dc-5d4c-a684-66ebae33f045', 6, (select id from public.foods where key = 'sambar_powder'), 'sambar powder', 12, true, false),
  ('23b3ac85-d4dc-5d4c-a684-66ebae33f045', 7, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('23b3ac85-d4dc-5d4c-a684-66ebae33f045', 8, (select id from public.foods where key = 'mustard_seeds'), 'mustard seeds', 2, true, false),
  ('23b3ac85-d4dc-5d4c-a684-66ebae33f045', 9, (select id from public.foods where key = 'oil'), 'oil', 10, true, false),
  ('23b3ac85-d4dc-5d4c-a684-66ebae33f045', 10, null, 'curry leaves', 2, false, false),
  ('23b3ac85-d4dc-5d4c-a684-66ebae33f045', 11, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('23b3ac85-d4dc-5d4c-a684-66ebae33f045', 12, (select id from public.foods where key = 'rice_raw'), 'rice', 140, true, false),
  ('23b3ac85-d4dc-5d4c-a684-66ebae33f045', 13, (select id from public.foods where key = 'curd'), 'yogurt', 200, true, false),
  ('6978e3f1-0cd7-5df5-a1a3-f34ae9b9ab08', 0, (select id from public.foods where key = 'rajma'), 'rajma', 120, true, false),
  ('6978e3f1-0cd7-5df5-a1a3-f34ae9b9ab08', 1, (select id from public.foods where key = 'foxtail_millet'), 'foxtail millet', 120, true, false),
  ('6978e3f1-0cd7-5df5-a1a3-f34ae9b9ab08', 2, (select id from public.foods where key = 'onion'), 'onion', 60, true, false),
  ('6978e3f1-0cd7-5df5-a1a3-f34ae9b9ab08', 3, (select id from public.foods where key = 'tomato'), 'tomato', 80, true, false),
  ('6978e3f1-0cd7-5df5-a1a3-f34ae9b9ab08', 4, (select id from public.foods where key = 'coconut'), 'coconut', 20, true, false),
  ('6978e3f1-0cd7-5df5-a1a3-f34ae9b9ab08', 5, (select id from public.foods where key = 'green_chilli'), 'green chilli', 5, true, false),
  ('6978e3f1-0cd7-5df5-a1a3-f34ae9b9ab08', 6, (select id from public.foods where key = 'mustard_seeds'), 'mustard seeds', 2, true, false),
  ('6978e3f1-0cd7-5df5-a1a3-f34ae9b9ab08', 7, (select id from public.foods where key = 'lemon'), 'lemon', 20, true, false),
  ('6978e3f1-0cd7-5df5-a1a3-f34ae9b9ab08', 8, (select id from public.foods where key = 'oil'), 'oil', 10, true, false),
  ('6978e3f1-0cd7-5df5-a1a3-f34ae9b9ab08', 9, null, 'curry leaves', 2, false, false),
  ('6978e3f1-0cd7-5df5-a1a3-f34ae9b9ab08', 10, (select id from public.foods where key = 'salt'), 'salt', 4, true, false),
  ('f3abc10c-ba14-51f0-a3fc-a3facd9b0fd7', 0, (select id from public.foods where key = 'chicken'), 'chicken', 400, true, false),
  ('f3abc10c-ba14-51f0-a3fc-a3facd9b0fd7', 1, (select id from public.foods where key = 'onion'), 'onion', 150, true, false),
  ('f3abc10c-ba14-51f0-a3fc-a3facd9b0fd7', 2, (select id from public.foods where key = 'tomato'), 'tomato', 100, true, false),
  ('f3abc10c-ba14-51f0-a3fc-a3facd9b0fd7', 3, (select id from public.foods where key = 'ginger'), 'ginger', 10, true, false),
  ('f3abc10c-ba14-51f0-a3fc-a3facd9b0fd7', 4, (select id from public.foods where key = 'garlic'), 'garlic', 10, true, false),
  ('f3abc10c-ba14-51f0-a3fc-a3facd9b0fd7', 5, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 8, true, false),
  ('f3abc10c-ba14-51f0-a3fc-a3facd9b0fd7', 6, (select id from public.foods where key = 'coriander_powder'), 'coriander powder', 6, true, false),
  ('f3abc10c-ba14-51f0-a3fc-a3facd9b0fd7', 7, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('f3abc10c-ba14-51f0-a3fc-a3facd9b0fd7', 8, (select id from public.foods where key = 'garam_masala'), 'garam masala', 3, true, false),
  ('f3abc10c-ba14-51f0-a3fc-a3facd9b0fd7', 9, (select id from public.foods where key = 'oil'), 'oil', 15, true, false),
  ('f3abc10c-ba14-51f0-a3fc-a3facd9b0fd7', 10, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('f3abc10c-ba14-51f0-a3fc-a3facd9b0fd7', 11, (select id from public.foods where key = 'rice_raw'), 'rice', 150, true, false),
  ('708998cf-6313-526f-ae74-d5806998ac4c', 0, (select id from public.foods where key = 'chicken'), 'chicken', 400, true, false),
  ('708998cf-6313-526f-ae74-d5806998ac4c', 1, (select id from public.foods where key = 'gongura'), 'gongura', 80, true, false),
  ('708998cf-6313-526f-ae74-d5806998ac4c', 2, (select id from public.foods where key = 'onion'), 'onion', 120, true, false),
  ('708998cf-6313-526f-ae74-d5806998ac4c', 3, (select id from public.foods where key = 'garlic'), 'garlic', 10, true, false),
  ('708998cf-6313-526f-ae74-d5806998ac4c', 4, (select id from public.foods where key = 'green_chilli'), 'green chilli', 6, true, false),
  ('708998cf-6313-526f-ae74-d5806998ac4c', 5, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 4, true, false),
  ('708998cf-6313-526f-ae74-d5806998ac4c', 6, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('708998cf-6313-526f-ae74-d5806998ac4c', 7, (select id from public.foods where key = 'oil'), 'oil', 15, true, false),
  ('708998cf-6313-526f-ae74-d5806998ac4c', 8, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('708998cf-6313-526f-ae74-d5806998ac4c', 9, (select id from public.foods where key = 'rice_raw'), 'rice', 150, true, false),
  ('8f337f0e-7297-503b-aa1e-c2484111295a', 0, (select id from public.foods where key = 'tofu'), 'tofu', 250, true, false),
  ('8f337f0e-7297-503b-aa1e-c2484111295a', 1, (select id from public.foods where key = 'green_peas'), 'green peas', 100, true, false),
  ('8f337f0e-7297-503b-aa1e-c2484111295a', 2, (select id from public.foods where key = 'onion'), 'onion', 100, true, false),
  ('8f337f0e-7297-503b-aa1e-c2484111295a', 3, (select id from public.foods where key = 'tomato'), 'tomato', 100, true, false),
  ('8f337f0e-7297-503b-aa1e-c2484111295a', 4, (select id from public.foods where key = 'coconut'), 'coconut', 30, true, false),
  ('8f337f0e-7297-503b-aa1e-c2484111295a', 5, (select id from public.foods where key = 'cashew'), 'cashew', 10, true, false),
  ('8f337f0e-7297-503b-aa1e-c2484111295a', 6, (select id from public.foods where key = 'ginger'), 'ginger', 8, true, false),
  ('8f337f0e-7297-503b-aa1e-c2484111295a', 7, (select id from public.foods where key = 'garlic'), 'garlic', 8, true, false),
  ('8f337f0e-7297-503b-aa1e-c2484111295a', 8, (select id from public.foods where key = 'garam_masala'), 'garam masala', 3, true, false),
  ('8f337f0e-7297-503b-aa1e-c2484111295a', 9, (select id from public.foods where key = 'oil'), 'oil', 12, true, false),
  ('8f337f0e-7297-503b-aa1e-c2484111295a', 10, (select id from public.foods where key = 'salt'), 'salt', 4, true, false),
  ('8f337f0e-7297-503b-aa1e-c2484111295a', 11, (select id from public.foods where key = 'wheat_flour'), 'wheat flour', 120, true, false),
  ('148cfd1d-232d-5a4a-a84b-565bd5059098', 0, (select id from public.foods where key = 'mackerel'), 'indian mackerel', 350, true, false),
  ('148cfd1d-232d-5a4a-a84b-565bd5059098', 1, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 6, true, false),
  ('148cfd1d-232d-5a4a-a84b-565bd5059098', 2, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('148cfd1d-232d-5a4a-a84b-565bd5059098', 3, (select id from public.foods where key = 'ginger'), 'ginger', 6, true, false),
  ('148cfd1d-232d-5a4a-a84b-565bd5059098', 4, (select id from public.foods where key = 'garlic'), 'garlic', 6, true, false),
  ('148cfd1d-232d-5a4a-a84b-565bd5059098', 5, (select id from public.foods where key = 'coconut_oil'), 'coconut oil', 15, true, false),
  ('148cfd1d-232d-5a4a-a84b-565bd5059098', 6, (select id from public.foods where key = 'rice_raw'), 'rice', 150, true, false),
  ('148cfd1d-232d-5a4a-a84b-565bd5059098', 7, (select id from public.foods where key = 'lemon'), 'lemon', 30, true, false),
  ('148cfd1d-232d-5a4a-a84b-565bd5059098', 8, (select id from public.foods where key = 'peanut'), 'peanuts', 20, true, false),
  ('148cfd1d-232d-5a4a-a84b-565bd5059098', 9, (select id from public.foods where key = 'mustard_seeds'), 'mustard seeds', 2, true, false),
  ('148cfd1d-232d-5a4a-a84b-565bd5059098', 10, null, 'curry leaves', 2, false, false),
  ('148cfd1d-232d-5a4a-a84b-565bd5059098', 11, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('59bbcabe-ef7b-5aac-a015-10d2bf0eecaa', 0, (select id from public.foods where key = 'chicken'), 'chicken', 300, true, false),
  ('59bbcabe-ef7b-5aac-a015-10d2bf0eecaa', 1, (select id from public.foods where key = 'rice_raw'), 'rice', 150, true, false),
  ('59bbcabe-ef7b-5aac-a015-10d2bf0eecaa', 2, (select id from public.foods where key = 'onion'), 'onion', 100, true, false),
  ('59bbcabe-ef7b-5aac-a015-10d2bf0eecaa', 3, (select id from public.foods where key = 'tomato'), 'tomato', 80, true, false),
  ('59bbcabe-ef7b-5aac-a015-10d2bf0eecaa', 4, (select id from public.foods where key = 'ginger'), 'ginger', 8, true, false),
  ('59bbcabe-ef7b-5aac-a015-10d2bf0eecaa', 5, (select id from public.foods where key = 'garlic'), 'garlic', 8, true, false),
  ('59bbcabe-ef7b-5aac-a015-10d2bf0eecaa', 6, (select id from public.foods where key = 'garam_masala'), 'garam masala', 3, true, false),
  ('59bbcabe-ef7b-5aac-a015-10d2bf0eecaa', 7, (select id from public.foods where key = 'mint'), 'mint', 10, true, false),
  ('59bbcabe-ef7b-5aac-a015-10d2bf0eecaa', 8, (select id from public.foods where key = 'ghee'), 'ghee', 10, true, false),
  ('59bbcabe-ef7b-5aac-a015-10d2bf0eecaa', 9, (select id from public.foods where key = 'oil'), 'oil', 5, true, false),
  ('59bbcabe-ef7b-5aac-a015-10d2bf0eecaa', 10, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('59bbcabe-ef7b-5aac-a015-10d2bf0eecaa', 11, (select id from public.foods where key = 'curd'), 'yogurt', 200, true, false),
  ('59bbcabe-ef7b-5aac-a015-10d2bf0eecaa', 12, (select id from public.foods where key = 'cucumber'), 'cucumber', 100, true, false),
  ('41ab9bf3-65cc-5295-a021-e15e169dc882', 0, (select id from public.foods where key = 'moong_dal'), 'moong dal', 100, true, false),
  ('41ab9bf3-65cc-5295-a021-e15e169dc882', 1, (select id from public.foods where key = 'cabbage'), 'cabbage', 150, true, false),
  ('41ab9bf3-65cc-5295-a021-e15e169dc882', 2, (select id from public.foods where key = 'coconut'), 'coconut', 20, true, false),
  ('41ab9bf3-65cc-5295-a021-e15e169dc882', 3, (select id from public.foods where key = 'cumin'), 'cumin seeds', 2, true, false),
  ('41ab9bf3-65cc-5295-a021-e15e169dc882', 4, (select id from public.foods where key = 'egg'), 'egg', 180, true, false),
  ('41ab9bf3-65cc-5295-a021-e15e169dc882', 5, (select id from public.foods where key = 'onion'), 'onion', 60, true, false),
  ('41ab9bf3-65cc-5295-a021-e15e169dc882', 6, (select id from public.foods where key = 'green_chilli'), 'green chilli', 4, true, false),
  ('41ab9bf3-65cc-5295-a021-e15e169dc882', 7, (select id from public.foods where key = 'oil'), 'oil', 12, true, false),
  ('41ab9bf3-65cc-5295-a021-e15e169dc882', 8, (select id from public.foods where key = 'mustard_seeds'), 'mustard seeds', 2, true, false),
  ('41ab9bf3-65cc-5295-a021-e15e169dc882', 9, null, 'curry leaves', 2, false, false),
  ('41ab9bf3-65cc-5295-a021-e15e169dc882', 10, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('41ab9bf3-65cc-5295-a021-e15e169dc882', 11, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('41ab9bf3-65cc-5295-a021-e15e169dc882', 12, (select id from public.foods where key = 'rice_raw'), 'rice', 130, true, false),
  ('7e5e8291-011f-51c5-ac22-56784539ac4f', 0, (select id from public.foods where key = 'crab'), 'crab', 500, true, false),
  ('7e5e8291-011f-51c5-ac22-56784539ac4f', 1, (select id from public.foods where key = 'onion'), 'onion', 120, true, false),
  ('7e5e8291-011f-51c5-ac22-56784539ac4f', 2, (select id from public.foods where key = 'tomato'), 'tomato', 120, true, false),
  ('7e5e8291-011f-51c5-ac22-56784539ac4f', 3, (select id from public.foods where key = 'ginger'), 'ginger', 8, true, false),
  ('7e5e8291-011f-51c5-ac22-56784539ac4f', 4, (select id from public.foods where key = 'garlic'), 'garlic', 10, true, false),
  ('7e5e8291-011f-51c5-ac22-56784539ac4f', 5, (select id from public.foods where key = 'black_pepper'), 'black pepper', 4, true, false),
  ('7e5e8291-011f-51c5-ac22-56784539ac4f', 6, (select id from public.foods where key = 'fennel'), 'fennel seeds', 2, true, false),
  ('7e5e8291-011f-51c5-ac22-56784539ac4f', 7, (select id from public.foods where key = 'coriander_powder'), 'coriander powder', 6, true, false),
  ('7e5e8291-011f-51c5-ac22-56784539ac4f', 8, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 4, true, false),
  ('7e5e8291-011f-51c5-ac22-56784539ac4f', 9, (select id from public.foods where key = 'oil'), 'oil', 15, true, false),
  ('7e5e8291-011f-51c5-ac22-56784539ac4f', 10, null, 'curry leaves', 2, false, false),
  ('7e5e8291-011f-51c5-ac22-56784539ac4f', 11, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('7e5e8291-011f-51c5-ac22-56784539ac4f', 12, (select id from public.foods where key = 'rice_raw'), 'rice', 150, true, false),
  ('c8f5ca21-bcc7-5694-afab-d81e8b67b794', 0, (select id from public.foods where key = 'chickpea'), 'chickpeas', 130, true, false),
  ('c8f5ca21-bcc7-5694-afab-d81e8b67b794', 1, (select id from public.foods where key = 'rice_brown'), 'brown rice', 130, true, false),
  ('c8f5ca21-bcc7-5694-afab-d81e8b67b794', 2, (select id from public.foods where key = 'onion'), 'onion', 120, true, false),
  ('c8f5ca21-bcc7-5694-afab-d81e8b67b794', 3, (select id from public.foods where key = 'tomato'), 'tomato', 150, true, false),
  ('c8f5ca21-bcc7-5694-afab-d81e8b67b794', 4, (select id from public.foods where key = 'ginger'), 'ginger', 8, true, false),
  ('c8f5ca21-bcc7-5694-afab-d81e8b67b794', 5, (select id from public.foods where key = 'garlic'), 'garlic', 8, true, false),
  ('c8f5ca21-bcc7-5694-afab-d81e8b67b794', 6, (select id from public.foods where key = 'coriander_powder'), 'coriander powder', 5, true, false),
  ('c8f5ca21-bcc7-5694-afab-d81e8b67b794', 7, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 4, true, false),
  ('c8f5ca21-bcc7-5694-afab-d81e8b67b794', 8, (select id from public.foods where key = 'garam_masala'), 'garam masala', 3, true, false),
  ('c8f5ca21-bcc7-5694-afab-d81e8b67b794', 9, (select id from public.foods where key = 'oil'), 'oil', 12, true, false),
  ('c8f5ca21-bcc7-5694-afab-d81e8b67b794', 10, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('c8f5ca21-bcc7-5694-afab-d81e8b67b794', 11, (select id from public.foods where key = 'curd'), 'yogurt', 150, true, false),
  ('dec6a231-2894-5a78-aa40-621f24dee785', 0, (select id from public.foods where key = 'chicken'), 'chicken', 350, true, false),
  ('dec6a231-2894-5a78-aa40-621f24dee785', 1, (select id from public.foods where key = 'ragi'), 'ragi flour', 120, true, false),
  ('dec6a231-2894-5a78-aa40-621f24dee785', 2, (select id from public.foods where key = 'onion'), 'onion', 100, true, false),
  ('dec6a231-2894-5a78-aa40-621f24dee785', 3, (select id from public.foods where key = 'tomato'), 'tomato', 100, true, false),
  ('dec6a231-2894-5a78-aa40-621f24dee785', 4, (select id from public.foods where key = 'coconut'), 'coconut', 30, true, false),
  ('dec6a231-2894-5a78-aa40-621f24dee785', 5, (select id from public.foods where key = 'garlic'), 'garlic', 10, true, false),
  ('dec6a231-2894-5a78-aa40-621f24dee785', 6, (select id from public.foods where key = 'ginger'), 'ginger', 8, true, false),
  ('dec6a231-2894-5a78-aa40-621f24dee785', 7, (select id from public.foods where key = 'coriander_powder'), 'coriander powder', 6, true, false),
  ('dec6a231-2894-5a78-aa40-621f24dee785', 8, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 4, true, false),
  ('dec6a231-2894-5a78-aa40-621f24dee785', 9, (select id from public.foods where key = 'black_pepper'), 'black pepper', 3, true, false),
  ('dec6a231-2894-5a78-aa40-621f24dee785', 10, (select id from public.foods where key = 'oil'), 'oil', 12, true, false),
  ('dec6a231-2894-5a78-aa40-621f24dee785', 11, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('ec6719a2-28cb-5697-aa02-2ea375a2e050', 0, (select id from public.foods where key = 'egg'), 'egg', 240, true, false),
  ('ec6719a2-28cb-5697-aa02-2ea375a2e050', 1, (select id from public.foods where key = 'spinach'), 'spinach', 200, true, false),
  ('ec6719a2-28cb-5697-aa02-2ea375a2e050', 2, (select id from public.foods where key = 'coconut'), 'coconut', 30, true, false),
  ('ec6719a2-28cb-5697-aa02-2ea375a2e050', 3, (select id from public.foods where key = 'shallot'), 'shallot', 50, true, false),
  ('ec6719a2-28cb-5697-aa02-2ea375a2e050', 4, (select id from public.foods where key = 'green_chilli'), 'green chilli', 5, true, false),
  ('ec6719a2-28cb-5697-aa02-2ea375a2e050', 5, (select id from public.foods where key = 'garlic'), 'garlic', 5, true, false),
  ('ec6719a2-28cb-5697-aa02-2ea375a2e050', 6, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 1, true, false),
  ('ec6719a2-28cb-5697-aa02-2ea375a2e050', 7, (select id from public.foods where key = 'coconut_oil'), 'coconut oil', 12, true, false),
  ('ec6719a2-28cb-5697-aa02-2ea375a2e050', 8, (select id from public.foods where key = 'mustard_seeds'), 'mustard seeds', 2, true, false),
  ('ec6719a2-28cb-5697-aa02-2ea375a2e050', 9, null, 'curry leaves', 2, false, false),
  ('ec6719a2-28cb-5697-aa02-2ea375a2e050', 10, (select id from public.foods where key = 'salt'), 'salt', 4, true, false),
  ('ec6719a2-28cb-5697-aa02-2ea375a2e050', 11, (select id from public.foods where key = 'rice_raw'), 'rice', 130, true, false),
  ('93a6c280-801d-514a-a2cc-2c11ff672469', 0, (select id from public.foods where key = 'chicken_breast'), 'chicken breast', 350, true, false),
  ('93a6c280-801d-514a-a2cc-2c11ff672469', 1, (select id from public.foods where key = 'capsicum'), 'capsicum', 120, true, false),
  ('93a6c280-801d-514a-a2cc-2c11ff672469', 2, (select id from public.foods where key = 'carrot'), 'carrot', 100, true, false),
  ('93a6c280-801d-514a-a2cc-2c11ff672469', 3, (select id from public.foods where key = 'beans'), 'beans', 100, true, false),
  ('93a6c280-801d-514a-a2cc-2c11ff672469', 4, (select id from public.foods where key = 'garlic'), 'garlic', 8, true, false),
  ('93a6c280-801d-514a-a2cc-2c11ff672469', 5, (select id from public.foods where key = 'black_pepper'), 'black pepper', 3, true, false),
  ('93a6c280-801d-514a-a2cc-2c11ff672469', 6, (select id from public.foods where key = 'lemon'), 'lemon', 20, true, false),
  ('93a6c280-801d-514a-a2cc-2c11ff672469', 7, (select id from public.foods where key = 'olive_oil'), 'olive oil', 12, true, false),
  ('93a6c280-801d-514a-a2cc-2c11ff672469', 8, (select id from public.foods where key = 'salt'), 'salt', 4, true, false),
  ('497f9c79-6cd8-5272-a025-8c8640ae8f05', 0, (select id from public.foods where key = 'seer_fish'), 'seer fish', 350, true, false),
  ('497f9c79-6cd8-5272-a025-8c8640ae8f05', 1, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 6, true, false),
  ('497f9c79-6cd8-5272-a025-8c8640ae8f05', 2, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('497f9c79-6cd8-5272-a025-8c8640ae8f05', 3, (select id from public.foods where key = 'ginger'), 'ginger', 6, true, false),
  ('497f9c79-6cd8-5272-a025-8c8640ae8f05', 4, (select id from public.foods where key = 'garlic'), 'garlic', 6, true, false),
  ('497f9c79-6cd8-5272-a025-8c8640ae8f05', 5, (select id from public.foods where key = 'lemon'), 'lemon', 15, true, false),
  ('497f9c79-6cd8-5272-a025-8c8640ae8f05', 6, (select id from public.foods where key = 'oil'), 'oil', 15, true, false),
  ('497f9c79-6cd8-5272-a025-8c8640ae8f05', 7, (select id from public.foods where key = 'beans'), 'beans', 200, true, false),
  ('497f9c79-6cd8-5272-a025-8c8640ae8f05', 8, (select id from public.foods where key = 'coconut'), 'coconut', 20, true, false),
  ('497f9c79-6cd8-5272-a025-8c8640ae8f05', 9, (select id from public.foods where key = 'mustard_seeds'), 'mustard seeds', 2, true, false),
  ('497f9c79-6cd8-5272-a025-8c8640ae8f05', 10, (select id from public.foods where key = 'urad_dal'), 'urad dal', 5, true, false),
  ('497f9c79-6cd8-5272-a025-8c8640ae8f05', 11, null, 'curry leaves', 2, false, false),
  ('497f9c79-6cd8-5272-a025-8c8640ae8f05', 12, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('7b345443-1c07-53ea-add6-0437f732e5b4', 0, (select id from public.foods where key = 'green_gram'), 'green gram', 150, true, false),
  ('7b345443-1c07-53ea-add6-0437f732e5b4', 1, (select id from public.foods where key = 'rice_raw'), 'rice', 30, true, false),
  ('7b345443-1c07-53ea-add6-0437f732e5b4', 2, (select id from public.foods where key = 'ginger'), 'ginger', 15, true, false),
  ('7b345443-1c07-53ea-add6-0437f732e5b4', 3, (select id from public.foods where key = 'green_chilli'), 'green chilli', 6, true, false),
  ('7b345443-1c07-53ea-add6-0437f732e5b4', 4, (select id from public.foods where key = 'onion'), 'onion', 60, true, false),
  ('7b345443-1c07-53ea-add6-0437f732e5b4', 5, (select id from public.foods where key = 'cumin'), 'cumin seeds', 2, true, false),
  ('7b345443-1c07-53ea-add6-0437f732e5b4', 6, (select id from public.foods where key = 'oil'), 'oil', 15, true, false),
  ('7b345443-1c07-53ea-add6-0437f732e5b4', 7, (select id from public.foods where key = 'tamarind'), 'tamarind', 5, true, false),
  ('7b345443-1c07-53ea-add6-0437f732e5b4', 8, (select id from public.foods where key = 'jaggery'), 'jaggery', 5, true, false),
  ('7b345443-1c07-53ea-add6-0437f732e5b4', 9, (select id from public.foods where key = 'salt'), 'salt', 4, true, false),
  ('bc037f27-d0bf-57ec-a8d5-94c978cc11f2', 0, (select id from public.foods where key = 'chana_dal'), 'chana dal', 50, true, false),
  ('bc037f27-d0bf-57ec-a8d5-94c978cc11f2', 1, (select id from public.foods where key = 'toor_dal'), 'toor dal', 50, true, false),
  ('bc037f27-d0bf-57ec-a8d5-94c978cc11f2', 2, (select id from public.foods where key = 'urad_dal'), 'urad dal', 30, true, false),
  ('bc037f27-d0bf-57ec-a8d5-94c978cc11f2', 3, (select id from public.foods where key = 'moong_dal'), 'moong dal', 30, true, false),
  ('bc037f27-d0bf-57ec-a8d5-94c978cc11f2', 4, (select id from public.foods where key = 'idli_rice'), 'idli rice', 60, true, false),
  ('bc037f27-d0bf-57ec-a8d5-94c978cc11f2', 5, (select id from public.foods where key = 'dry_red_chilli'), 'dry red chilli', 4, true, false),
  ('bc037f27-d0bf-57ec-a8d5-94c978cc11f2', 6, (select id from public.foods where key = 'ginger'), 'ginger', 8, true, false),
  ('bc037f27-d0bf-57ec-a8d5-94c978cc11f2', 7, (select id from public.foods where key = 'onion'), 'onion', 60, true, false),
  ('bc037f27-d0bf-57ec-a8d5-94c978cc11f2', 8, (select id from public.foods where key = 'oil'), 'oil', 15, true, false),
  ('bc037f27-d0bf-57ec-a8d5-94c978cc11f2', 9, (select id from public.foods where key = 'carrot'), 'carrot', 80, true, false),
  ('bc037f27-d0bf-57ec-a8d5-94c978cc11f2', 10, (select id from public.foods where key = 'beans'), 'beans', 80, true, false),
  ('bc037f27-d0bf-57ec-a8d5-94c978cc11f2', 11, (select id from public.foods where key = 'curd'), 'yogurt', 100, true, false),
  ('bc037f27-d0bf-57ec-a8d5-94c978cc11f2', 12, (select id from public.foods where key = 'coconut'), 'coconut', 30, true, false),
  ('bc037f27-d0bf-57ec-a8d5-94c978cc11f2', 13, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('3eae45e7-a064-537a-ac35-679da5580afa', 0, (select id from public.foods where key = 'egg'), 'egg', 240, true, false),
  ('3eae45e7-a064-537a-ac35-679da5580afa', 1, (select id from public.foods where key = 'egg_white'), 'egg white', 100, true, false),
  ('3eae45e7-a064-537a-ac35-679da5580afa', 2, (select id from public.foods where key = 'onion'), 'onion', 100, true, false),
  ('3eae45e7-a064-537a-ac35-679da5580afa', 3, (select id from public.foods where key = 'tomato'), 'tomato', 80, true, false),
  ('3eae45e7-a064-537a-ac35-679da5580afa', 4, (select id from public.foods where key = 'green_chilli'), 'green chilli', 5, true, false),
  ('3eae45e7-a064-537a-ac35-679da5580afa', 5, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 1, true, false),
  ('3eae45e7-a064-537a-ac35-679da5580afa', 6, (select id from public.foods where key = 'black_pepper'), 'black pepper', 2, true, false),
  ('3eae45e7-a064-537a-ac35-679da5580afa', 7, (select id from public.foods where key = 'oil'), 'oil', 10, true, false),
  ('3eae45e7-a064-537a-ac35-679da5580afa', 8, (select id from public.foods where key = 'wheat_flour'), 'wheat flour', 100, true, false),
  ('3eae45e7-a064-537a-ac35-679da5580afa', 9, (select id from public.foods where key = 'salt'), 'salt', 4, true, false),
  ('12d40572-c2b4-5256-ab92-a1d38dee6002', 0, (select id from public.foods where key = 'chicken'), 'chicken', 400, true, false),
  ('12d40572-c2b4-5256-ab92-a1d38dee6002', 1, (select id from public.foods where key = 'onion'), 'onion', 120, true, false),
  ('12d40572-c2b4-5256-ab92-a1d38dee6002', 2, (select id from public.foods where key = 'coconut'), 'coconut', 40, true, false),
  ('12d40572-c2b4-5256-ab92-a1d38dee6002', 3, (select id from public.foods where key = 'dry_red_chilli'), 'dry red chilli', 5, true, false),
  ('12d40572-c2b4-5256-ab92-a1d38dee6002', 4, (select id from public.foods where key = 'coriander_powder'), 'coriander powder', 6, true, false),
  ('12d40572-c2b4-5256-ab92-a1d38dee6002', 5, (select id from public.foods where key = 'black_pepper'), 'black pepper', 3, true, false),
  ('12d40572-c2b4-5256-ab92-a1d38dee6002', 6, (select id from public.foods where key = 'garlic'), 'garlic', 10, true, false),
  ('12d40572-c2b4-5256-ab92-a1d38dee6002', 7, (select id from public.foods where key = 'ghee'), 'ghee', 10, true, false),
  ('12d40572-c2b4-5256-ab92-a1d38dee6002', 8, (select id from public.foods where key = 'oil'), 'oil', 5, true, false),
  ('12d40572-c2b4-5256-ab92-a1d38dee6002', 9, (select id from public.foods where key = 'cucumber'), 'cucumber', 150, true, false),
  ('12d40572-c2b4-5256-ab92-a1d38dee6002', 10, (select id from public.foods where key = 'lemon'), 'lemon', 15, true, false),
  ('12d40572-c2b4-5256-ab92-a1d38dee6002', 11, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('3abcfea4-4b0e-52a5-a9cc-1b39cf28112c', 0, (select id from public.foods where key = 'prawn'), 'prawn', 300, true, false),
  ('3abcfea4-4b0e-52a5-a9cc-1b39cf28112c', 1, (select id from public.foods where key = 'broccoli'), 'broccoli', 150, true, false),
  ('3abcfea4-4b0e-52a5-a9cc-1b39cf28112c', 2, (select id from public.foods where key = 'capsicum'), 'capsicum', 100, true, false),
  ('3abcfea4-4b0e-52a5-a9cc-1b39cf28112c', 3, (select id from public.foods where key = 'carrot'), 'carrot', 80, true, false),
  ('3abcfea4-4b0e-52a5-a9cc-1b39cf28112c', 4, (select id from public.foods where key = 'garlic'), 'garlic', 8, true, false),
  ('3abcfea4-4b0e-52a5-a9cc-1b39cf28112c', 5, (select id from public.foods where key = 'ginger'), 'ginger', 8, true, false),
  ('3abcfea4-4b0e-52a5-a9cc-1b39cf28112c', 6, (select id from public.foods where key = 'soy_sauce'), 'soy sauce', 15, true, false),
  ('3abcfea4-4b0e-52a5-a9cc-1b39cf28112c', 7, (select id from public.foods where key = 'black_pepper'), 'black pepper', 2, true, false),
  ('3abcfea4-4b0e-52a5-a9cc-1b39cf28112c', 8, (select id from public.foods where key = 'oil'), 'oil', 12, true, false),
  ('3abcfea4-4b0e-52a5-a9cc-1b39cf28112c', 9, (select id from public.foods where key = 'salt'), 'salt', 3, true, false),
  ('eb170ba1-256c-5637-aac1-a0a6518e1483', 0, (select id from public.foods where key = 'moong_dal'), 'moong dal', 150, true, false),
  ('eb170ba1-256c-5637-aac1-a0a6518e1483', 1, (select id from public.foods where key = 'onion'), 'onion', 60, true, false),
  ('eb170ba1-256c-5637-aac1-a0a6518e1483', 2, (select id from public.foods where key = 'tomato'), 'tomato', 60, true, false),
  ('eb170ba1-256c-5637-aac1-a0a6518e1483', 3, (select id from public.foods where key = 'green_chilli'), 'green chilli', 5, true, false),
  ('eb170ba1-256c-5637-aac1-a0a6518e1483', 4, (select id from public.foods where key = 'ginger'), 'ginger', 8, true, false),
  ('eb170ba1-256c-5637-aac1-a0a6518e1483', 5, (select id from public.foods where key = 'oil'), 'oil', 12, true, false),
  ('eb170ba1-256c-5637-aac1-a0a6518e1483', 6, (select id from public.foods where key = 'mint'), 'mint', 20, true, false),
  ('eb170ba1-256c-5637-aac1-a0a6518e1483', 7, (select id from public.foods where key = 'coriander_leaves'), 'coriander leaves', 20, true, false),
  ('eb170ba1-256c-5637-aac1-a0a6518e1483', 8, (select id from public.foods where key = 'curd'), 'yogurt', 150, true, false),
  ('eb170ba1-256c-5637-aac1-a0a6518e1483', 9, (select id from public.foods where key = 'salt'), 'salt', 4, true, false),
  ('bb9eb0a2-9888-5bdf-aa2e-7337f73d102f', 0, (select id from public.foods where key = 'mutton'), 'mutton', 300, true, false),
  ('bb9eb0a2-9888-5bdf-aa2e-7337f73d102f', 1, (select id from public.foods where key = 'onion'), 'onion', 120, true, false),
  ('bb9eb0a2-9888-5bdf-aa2e-7337f73d102f', 2, (select id from public.foods where key = 'black_pepper'), 'black pepper', 6, true, false),
  ('bb9eb0a2-9888-5bdf-aa2e-7337f73d102f', 3, (select id from public.foods where key = 'fennel'), 'fennel seeds', 3, true, false),
  ('bb9eb0a2-9888-5bdf-aa2e-7337f73d102f', 4, (select id from public.foods where key = 'ginger'), 'ginger', 10, true, false),
  ('bb9eb0a2-9888-5bdf-aa2e-7337f73d102f', 5, (select id from public.foods where key = 'garlic'), 'garlic', 10, true, false),
  ('bb9eb0a2-9888-5bdf-aa2e-7337f73d102f', 6, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('bb9eb0a2-9888-5bdf-aa2e-7337f73d102f', 7, (select id from public.foods where key = 'oil'), 'oil', 15, true, false),
  ('bb9eb0a2-9888-5bdf-aa2e-7337f73d102f', 8, null, 'curry leaves', 2, false, false),
  ('bb9eb0a2-9888-5bdf-aa2e-7337f73d102f', 9, (select id from public.foods where key = 'cucumber'), 'cucumber', 120, true, false),
  ('bb9eb0a2-9888-5bdf-aa2e-7337f73d102f', 10, (select id from public.foods where key = 'tomato'), 'tomato', 80, true, false),
  ('bb9eb0a2-9888-5bdf-aa2e-7337f73d102f', 11, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('5d8e1f6c-be3f-549a-ac94-85d31d3158ba', 0, (select id from public.foods where key = 'egg'), 'egg', 240, true, false),
  ('5d8e1f6c-be3f-549a-ac94-85d31d3158ba', 1, (select id from public.foods where key = 'onion'), 'onion', 200, true, false),
  ('5d8e1f6c-be3f-549a-ac94-85d31d3158ba', 2, (select id from public.foods where key = 'tomato'), 'tomato', 100, true, false),
  ('5d8e1f6c-be3f-549a-ac94-85d31d3158ba', 3, (select id from public.foods where key = 'ginger'), 'ginger', 8, true, false),
  ('5d8e1f6c-be3f-549a-ac94-85d31d3158ba', 4, (select id from public.foods where key = 'garlic'), 'garlic', 8, true, false),
  ('5d8e1f6c-be3f-549a-ac94-85d31d3158ba', 5, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 5, true, false),
  ('5d8e1f6c-be3f-549a-ac94-85d31d3158ba', 6, (select id from public.foods where key = 'coriander_powder'), 'coriander powder', 4, true, false),
  ('5d8e1f6c-be3f-549a-ac94-85d31d3158ba', 7, (select id from public.foods where key = 'garam_masala'), 'garam masala', 2, true, false),
  ('5d8e1f6c-be3f-549a-ac94-85d31d3158ba', 8, (select id from public.foods where key = 'coconut_oil'), 'coconut oil', 15, true, false),
  ('5d8e1f6c-be3f-549a-ac94-85d31d3158ba', 9, (select id from public.foods where key = 'rice_flour'), 'rice flour', 100, true, false),
  ('5d8e1f6c-be3f-549a-ac94-85d31d3158ba', 10, (select id from public.foods where key = 'coconut_milk'), 'coconut milk', 80, true, false),
  ('5d8e1f6c-be3f-549a-ac94-85d31d3158ba', 11, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('86fdc360-a3a1-5a6c-ab87-bc53e24e3d05', 0, (select id from public.foods where key = 'chicken'), 'chicken', 300, true, false),
  ('86fdc360-a3a1-5a6c-ab87-bc53e24e3d05', 1, (select id from public.foods where key = 'foxtail_millet'), 'foxtail millet', 60, true, false),
  ('86fdc360-a3a1-5a6c-ab87-bc53e24e3d05', 2, (select id from public.foods where key = 'carrot'), 'carrot', 80, true, false),
  ('86fdc360-a3a1-5a6c-ab87-bc53e24e3d05', 3, (select id from public.foods where key = 'beans'), 'beans', 60, true, false),
  ('86fdc360-a3a1-5a6c-ab87-bc53e24e3d05', 4, (select id from public.foods where key = 'onion'), 'onion', 60, true, false),
  ('86fdc360-a3a1-5a6c-ab87-bc53e24e3d05', 5, (select id from public.foods where key = 'garlic'), 'garlic', 8, true, false),
  ('86fdc360-a3a1-5a6c-ab87-bc53e24e3d05', 6, (select id from public.foods where key = 'ginger'), 'ginger', 8, true, false),
  ('86fdc360-a3a1-5a6c-ab87-bc53e24e3d05', 7, (select id from public.foods where key = 'black_pepper'), 'black pepper', 3, true, false),
  ('86fdc360-a3a1-5a6c-ab87-bc53e24e3d05', 8, (select id from public.foods where key = 'ghee'), 'ghee', 8, true, false),
  ('86fdc360-a3a1-5a6c-ab87-bc53e24e3d05', 9, (select id from public.foods where key = 'salt'), 'salt', 4, true, false),
  ('7b3e1b96-f37d-55bc-a815-6882252a17e2', 0, (select id from public.foods where key = 'tofu'), 'tofu', 300, true, false),
  ('7b3e1b96-f37d-55bc-a815-6882252a17e2', 1, (select id from public.foods where key = 'onion'), 'onion', 100, true, false),
  ('7b3e1b96-f37d-55bc-a815-6882252a17e2', 2, (select id from public.foods where key = 'tomato'), 'tomato', 100, true, false),
  ('7b3e1b96-f37d-55bc-a815-6882252a17e2', 3, (select id from public.foods where key = 'capsicum'), 'capsicum', 60, true, false),
  ('7b3e1b96-f37d-55bc-a815-6882252a17e2', 4, (select id from public.foods where key = 'green_chilli'), 'green chilli', 5, true, false),
  ('7b3e1b96-f37d-55bc-a815-6882252a17e2', 5, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('7b3e1b96-f37d-55bc-a815-6882252a17e2', 6, (select id from public.foods where key = 'garam_masala'), 'garam masala', 2, true, false),
  ('7b3e1b96-f37d-55bc-a815-6882252a17e2', 7, (select id from public.foods where key = 'oil'), 'oil', 12, true, false),
  ('7b3e1b96-f37d-55bc-a815-6882252a17e2', 8, (select id from public.foods where key = 'wheat_flour'), 'wheat flour', 100, true, false),
  ('7b3e1b96-f37d-55bc-a815-6882252a17e2', 9, (select id from public.foods where key = 'salt'), 'salt', 4, true, false),
  ('f168bf6f-9119-5f44-a041-7b4ac7a116c1', 0, (select id from public.foods where key = 'anchovy'), 'anchovy', 300, true, false),
  ('f168bf6f-9119-5f44-a041-7b4ac7a116c1', 1, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 6, true, false),
  ('f168bf6f-9119-5f44-a041-7b4ac7a116c1', 2, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('f168bf6f-9119-5f44-a041-7b4ac7a116c1', 3, (select id from public.foods where key = 'rice_flour'), 'rice flour', 15, true, false),
  ('f168bf6f-9119-5f44-a041-7b4ac7a116c1', 4, (select id from public.foods where key = 'oil'), 'oil', 15, true, false),
  ('f168bf6f-9119-5f44-a041-7b4ac7a116c1', 5, (select id from public.foods where key = 'spinach'), 'spinach', 200, true, false),
  ('f168bf6f-9119-5f44-a041-7b4ac7a116c1', 6, (select id from public.foods where key = 'moong_dal'), 'moong dal', 60, true, false),
  ('f168bf6f-9119-5f44-a041-7b4ac7a116c1', 7, (select id from public.foods where key = 'coconut'), 'coconut', 20, true, false),
  ('f168bf6f-9119-5f44-a041-7b4ac7a116c1', 8, (select id from public.foods where key = 'cumin'), 'cumin seeds', 2, true, false),
  ('f168bf6f-9119-5f44-a041-7b4ac7a116c1', 9, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('c0d36c82-4501-5ee9-abcf-d6b871a72b6a', 0, (select id from public.foods where key = 'chicken_breast'), 'chicken breast', 350, true, false),
  ('c0d36c82-4501-5ee9-abcf-d6b871a72b6a', 1, (select id from public.foods where key = 'curd'), 'yogurt', 150, true, false),
  ('c0d36c82-4501-5ee9-abcf-d6b871a72b6a', 2, (select id from public.foods where key = 'ginger'), 'ginger', 8, true, false),
  ('c0d36c82-4501-5ee9-abcf-d6b871a72b6a', 3, (select id from public.foods where key = 'garlic'), 'garlic', 8, true, false),
  ('c0d36c82-4501-5ee9-abcf-d6b871a72b6a', 4, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 4, true, false),
  ('c0d36c82-4501-5ee9-abcf-d6b871a72b6a', 5, (select id from public.foods where key = 'garam_masala'), 'garam masala', 3, true, false),
  ('c0d36c82-4501-5ee9-abcf-d6b871a72b6a', 6, (select id from public.foods where key = 'lemon'), 'lemon', 15, true, false),
  ('c0d36c82-4501-5ee9-abcf-d6b871a72b6a', 7, (select id from public.foods where key = 'onion'), 'onion', 100, true, false),
  ('c0d36c82-4501-5ee9-abcf-d6b871a72b6a', 8, (select id from public.foods where key = 'capsicum'), 'capsicum', 100, true, false),
  ('c0d36c82-4501-5ee9-abcf-d6b871a72b6a', 9, (select id from public.foods where key = 'oil'), 'oil', 10, true, false),
  ('c0d36c82-4501-5ee9-abcf-d6b871a72b6a', 10, (select id from public.foods where key = 'mint'), 'mint', 15, true, false),
  ('c0d36c82-4501-5ee9-abcf-d6b871a72b6a', 11, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('35c9de2a-31f7-5bce-aaf2-e1b3dfe4f46e', 0, (select id from public.foods where key = 'masoor_dal'), 'masoor dal', 120, true, false),
  ('35c9de2a-31f7-5bce-aaf2-e1b3dfe4f46e', 1, (select id from public.foods where key = 'onion'), 'onion', 80, true, false),
  ('35c9de2a-31f7-5bce-aaf2-e1b3dfe4f46e', 2, (select id from public.foods where key = 'tomato'), 'tomato', 100, true, false),
  ('35c9de2a-31f7-5bce-aaf2-e1b3dfe4f46e', 3, (select id from public.foods where key = 'garlic'), 'garlic', 8, true, false),
  ('35c9de2a-31f7-5bce-aaf2-e1b3dfe4f46e', 4, (select id from public.foods where key = 'cumin'), 'cumin seeds', 3, true, false),
  ('35c9de2a-31f7-5bce-aaf2-e1b3dfe4f46e', 5, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('35c9de2a-31f7-5bce-aaf2-e1b3dfe4f46e', 6, (select id from public.foods where key = 'ghee'), 'ghee', 10, true, false),
  ('35c9de2a-31f7-5bce-aaf2-e1b3dfe4f46e', 7, (select id from public.foods where key = 'rice_raw'), 'rice', 120, true, false),
  ('35c9de2a-31f7-5bce-aaf2-e1b3dfe4f46e', 8, (select id from public.foods where key = 'egg'), 'egg', 120, true, false),
  ('35c9de2a-31f7-5bce-aaf2-e1b3dfe4f46e', 9, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('8d334008-58f6-5d18-a62c-23f06a731721', 0, (select id from public.foods where key = 'squid'), 'squid', 350, true, false),
  ('8d334008-58f6-5d18-a62c-23f06a731721', 1, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('8d334008-58f6-5d18-a62c-23f06a731721', 2, (select id from public.foods where key = 'onion'), 'onion', 150, true, false),
  ('8d334008-58f6-5d18-a62c-23f06a731721', 3, (select id from public.foods where key = 'tomato'), 'tomato', 80, true, false),
  ('8d334008-58f6-5d18-a62c-23f06a731721', 4, (select id from public.foods where key = 'ginger'), 'ginger', 8, true, false),
  ('8d334008-58f6-5d18-a62c-23f06a731721', 5, (select id from public.foods where key = 'garlic'), 'garlic', 10, true, false),
  ('8d334008-58f6-5d18-a62c-23f06a731721', 6, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 5, true, false),
  ('8d334008-58f6-5d18-a62c-23f06a731721', 7, (select id from public.foods where key = 'black_pepper'), 'black pepper', 3, true, false),
  ('8d334008-58f6-5d18-a62c-23f06a731721', 8, (select id from public.foods where key = 'coconut_oil'), 'coconut oil', 15, true, false),
  ('8d334008-58f6-5d18-a62c-23f06a731721', 9, null, 'curry leaves', 2, false, false),
  ('8d334008-58f6-5d18-a62c-23f06a731721', 10, (select id from public.foods where key = 'cucumber'), 'cucumber', 120, true, false),
  ('8d334008-58f6-5d18-a62c-23f06a731721', 11, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('2a277a77-0550-52fa-a79f-2c3b13347c34', 0, (select id from public.foods where key = 'sprouts'), 'mung sprouts', 250, true, false),
  ('2a277a77-0550-52fa-a79f-2c3b13347c34', 1, (select id from public.foods where key = 'chickpea'), 'chickpeas', 120, true, false),
  ('2a277a77-0550-52fa-a79f-2c3b13347c34', 2, (select id from public.foods where key = 'curd'), 'yogurt', 200, true, false),
  ('2a277a77-0550-52fa-a79f-2c3b13347c34', 3, (select id from public.foods where key = 'coconut'), 'coconut', 20, true, false),
  ('2a277a77-0550-52fa-a79f-2c3b13347c34', 4, (select id from public.foods where key = 'green_chilli'), 'green chilli', 4, true, false),
  ('2a277a77-0550-52fa-a79f-2c3b13347c34', 5, (select id from public.foods where key = 'mustard_seeds'), 'mustard seeds', 2, true, false),
  ('2a277a77-0550-52fa-a79f-2c3b13347c34', 6, null, 'curry leaves', 2, false, false),
  ('2a277a77-0550-52fa-a79f-2c3b13347c34', 7, (select id from public.foods where key = 'lemon'), 'lemon', 15, true, false),
  ('2a277a77-0550-52fa-a79f-2c3b13347c34', 8, (select id from public.foods where key = 'carrot'), 'carrot', 80, true, false),
  ('2a277a77-0550-52fa-a79f-2c3b13347c34', 9, (select id from public.foods where key = 'cabbage'), 'cabbage', 100, true, false),
  ('2a277a77-0550-52fa-a79f-2c3b13347c34', 10, (select id from public.foods where key = 'tomato'), 'tomato', 80, true, false),
  ('2a277a77-0550-52fa-a79f-2c3b13347c34', 11, (select id from public.foods where key = 'garlic'), 'garlic', 6, true, false),
  ('2a277a77-0550-52fa-a79f-2c3b13347c34', 12, (select id from public.foods where key = 'oil'), 'oil', 10, true, false),
  ('2a277a77-0550-52fa-a79f-2c3b13347c34', 13, (select id from public.foods where key = 'salt'), 'salt', 4, true, false),
  ('556d5b3a-83b0-548c-ad86-f647fd74c226', 0, (select id from public.foods where key = 'chicken_breast'), 'chicken breast', 250, true, false),
  ('556d5b3a-83b0-548c-ad86-f647fd74c226', 1, (select id from public.foods where key = 'egg'), 'egg', 120, true, false),
  ('556d5b3a-83b0-548c-ad86-f647fd74c226', 2, (select id from public.foods where key = 'wheat_flour'), 'wheat flour', 120, true, false),
  ('556d5b3a-83b0-548c-ad86-f647fd74c226', 3, (select id from public.foods where key = 'onion'), 'onion', 100, true, false),
  ('556d5b3a-83b0-548c-ad86-f647fd74c226', 4, (select id from public.foods where key = 'tomato'), 'tomato', 80, true, false),
  ('556d5b3a-83b0-548c-ad86-f647fd74c226', 5, (select id from public.foods where key = 'capsicum'), 'capsicum', 60, true, false),
  ('556d5b3a-83b0-548c-ad86-f647fd74c226', 6, (select id from public.foods where key = 'green_chilli'), 'green chilli', 5, true, false),
  ('556d5b3a-83b0-548c-ad86-f647fd74c226', 7, (select id from public.foods where key = 'garam_masala'), 'garam masala', 3, true, false),
  ('556d5b3a-83b0-548c-ad86-f647fd74c226', 8, (select id from public.foods where key = 'oil'), 'oil', 15, true, false),
  ('556d5b3a-83b0-548c-ad86-f647fd74c226', 9, null, 'curry leaves', 2, false, false),
  ('556d5b3a-83b0-548c-ad86-f647fd74c226', 10, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('42493d15-ac15-531b-a412-ae1460e0ef4d', 0, (select id from public.foods where key = 'egg'), 'egg', 240, true, false),
  ('42493d15-ac15-531b-a412-ae1460e0ef4d', 1, (select id from public.foods where key = 'onion'), 'onion', 120, true, false),
  ('42493d15-ac15-531b-a412-ae1460e0ef4d', 2, (select id from public.foods where key = 'tomato'), 'tomato', 100, true, false),
  ('42493d15-ac15-531b-a412-ae1460e0ef4d', 3, (select id from public.foods where key = 'tamarind'), 'tamarind', 15, true, false),
  ('42493d15-ac15-531b-a412-ae1460e0ef4d', 4, (select id from public.foods where key = 'chilli_powder'), 'red chilli powder', 5, true, false),
  ('42493d15-ac15-531b-a412-ae1460e0ef4d', 5, (select id from public.foods where key = 'coriander_powder'), 'coriander powder', 4, true, false),
  ('42493d15-ac15-531b-a412-ae1460e0ef4d', 6, (select id from public.foods where key = 'turmeric'), 'turmeric powder', 2, true, false),
  ('42493d15-ac15-531b-a412-ae1460e0ef4d', 7, (select id from public.foods where key = 'jaggery'), 'jaggery', 5, true, false),
  ('42493d15-ac15-531b-a412-ae1460e0ef4d', 8, (select id from public.foods where key = 'oil'), 'oil', 15, true, false),
  ('42493d15-ac15-531b-a412-ae1460e0ef4d', 9, null, 'curry leaves', 2, false, false),
  ('42493d15-ac15-531b-a412-ae1460e0ef4d', 10, (select id from public.foods where key = 'salt'), 'salt', 5, true, false),
  ('42493d15-ac15-531b-a412-ae1460e0ef4d', 11, (select id from public.foods where key = 'rice_raw'), 'rice', 120, true, false),
  ('1692a93d-16b3-5104-aa20-7c544f75db4d', 0, (select id from public.foods where key = 'tuna'), 'tuna', 350, true, false),
  ('1692a93d-16b3-5104-aa20-7c544f75db4d', 1, (select id from public.foods where key = 'garlic'), 'garlic', 12, true, false),
  ('1692a93d-16b3-5104-aa20-7c544f75db4d', 2, (select id from public.foods where key = 'black_pepper'), 'black pepper', 4, true, false),
  ('1692a93d-16b3-5104-aa20-7c544f75db4d', 3, (select id from public.foods where key = 'lemon'), 'lemon', 20, true, false),
  ('1692a93d-16b3-5104-aa20-7c544f75db4d', 4, (select id from public.foods where key = 'olive_oil'), 'olive oil', 12, true, false),
  ('1692a93d-16b3-5104-aa20-7c544f75db4d', 5, (select id from public.foods where key = 'spinach'), 'spinach', 200, true, false),
  ('1692a93d-16b3-5104-aa20-7c544f75db4d', 6, (select id from public.foods where key = 'amaranth'), 'amaranth leaves', 100, true, false),
  ('1692a93d-16b3-5104-aa20-7c544f75db4d', 7, (select id from public.foods where key = 'salt'), 'salt', 4, true, false);
