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
