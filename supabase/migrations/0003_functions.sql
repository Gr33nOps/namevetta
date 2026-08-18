-- Server-side functions.
--
-- Two jobs live here because neither can be done correctly from application
-- code: quota consumption must be atomic against concurrent scans, and shared
-- report access must bypass RLS in a tightly controlled way.

-- ────────────────────────────────────────────────────────────────── quotas ──

-- Atomically consume one unit of a user's or guest's daily allowance.
--
-- The check and the increment happen in a single statement. Doing this as
-- SELECT-then-UPDATE from the application would let two concurrent scans both
-- read "4 used of 5" and both proceed — the classic way free-tier limits get
-- quietly exceeded under exactly the traffic they exist to bound.
--
-- Returns the remaining allowance, or -1 when the request is refused.
create or replace function public.consume_quota(
  p_subject_type text,
  p_subject_id   text,
  p_scan_type    text,
  p_limit        int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int;
begin
  if p_scan_type not in ('quick', 'deep') then
    raise exception 'invalid scan_type: %', p_scan_type;
  end if;
  if p_subject_type not in ('user', 'guest') then
    raise exception 'invalid subject_type: %', p_subject_type;
  end if;

  insert into public.daily_usage (subject_type, subject_id, day, quick_used, deep_used)
  values (p_subject_type, p_subject_id, current_date, 0, 0)
  on conflict (subject_type, subject_id, day) do nothing;

  -- The row lock is what makes the read-modify-write safe under concurrency.
  if p_scan_type = 'quick' then
    select quick_used into v_used
    from public.daily_usage
    where subject_type = p_subject_type and subject_id = p_subject_id and day = current_date
    for update;

    if v_used >= p_limit then
      return -1;
    end if;

    update public.daily_usage set quick_used = quick_used + 1
    where subject_type = p_subject_type and subject_id = p_subject_id and day = current_date;
  else
    select deep_used into v_used
    from public.daily_usage
    where subject_type = p_subject_type and subject_id = p_subject_id and day = current_date
    for update;

    if v_used >= p_limit then
      return -1;
    end if;

    update public.daily_usage set deep_used = deep_used + 1
    where subject_type = p_subject_type and subject_id = p_subject_id and day = current_date;
  end if;

  return p_limit - v_used - 1;
end;
$$;

revoke all on function public.consume_quota(text, text, text, int) from public, anon, authenticated;

-- Read remaining allowance without consuming it, for showing "3 of 5 left".
create or replace function public.remaining_quota(
  p_subject_type text,
  p_subject_id   text,
  p_quick_limit  int,
  p_deep_limit   int
) returns table (quick_remaining int, deep_remaining int)
language sql
security definer
set search_path = public
as $$
  select
    greatest(0, p_quick_limit - coalesce(u.quick_used, 0)),
    greatest(0, p_deep_limit  - coalesce(u.deep_used, 0))
  from (select 1) dummy
  left join public.daily_usage u
    on u.subject_type = p_subject_type
   and u.subject_id = p_subject_id
   and u.day = current_date;
$$;

revoke all on function public.remaining_quota(text, text, int, int) from public, anon, authenticated;

-- ───────────────────────────────────────────────────── metered provider budget ──

-- Consume one unit of a metered provider's monthly budget, atomically.
-- Returns remaining, or -1 when the budget is exhausted. This is the hard stop
-- that keeps "free" from silently becoming "billed".
create or replace function public.consume_provider_budget(
  p_provider text,
  p_limit    int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int;
  v_month date := date_trunc('month', current_date)::date;
begin
  insert into public.provider_budget (provider, month, used, limit_value)
  values (p_provider, v_month, 0, p_limit)
  on conflict (provider, month) do nothing;

  select used into v_used
  from public.provider_budget
  where provider = p_provider and month = v_month
  for update;

  if v_used >= p_limit then
    return -1;
  end if;

  update public.provider_budget
  set used = used + 1, limit_value = p_limit
  where provider = p_provider and month = v_month;

  return p_limit - v_used - 1;
end;
$$;

revoke all on function public.consume_provider_budget(text, int) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────── shared reports ──

-- Fetch a shared report by its opaque token.
--
-- SECURITY DEFINER so it can read past RLS, but the only way in is a token the
-- owner generated and has not revoked. This is why share access is a function
-- rather than a relaxed table policy: a policy like "reports are readable if a
-- share link exists" would expose every shared report to anyone who could guess
-- a report id. Here the token *is* the capability.
create or replace function public.get_shared_report(p_token text)
returns table (
  report_id       uuid,
  scan_name       text,
  scan_category   text,
  scan_description text,
  scan_type       text,
  digital_score   int,
  raw_score       int,
  coverage        int,
  verdict         text,
  scoring_version int,
  created_at      timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    rep.id, s.name, s.category, s.description, s.scan_type,
    rep.digital_score, rep.raw_score, rep.coverage, rep.verdict,
    rep.scoring_version, rep.created_at
  from public.share_links sl
  join public.reports rep on rep.id = sl.report_id
  join public.scans s on s.id = rep.scan_id
  where sl.token = p_token
    and sl.revoked_at is null;
$$;

-- Anonymous visitors need this one — that is the point of a share link.
grant execute on function public.get_shared_report(text) to anon, authenticated;

-- ───────────────────────────────────────────────────────────── maintenance ──

-- Drop expired cache rows. Called on a schedule; safe to run at any time.
create or replace function public.prune_source_cache()
returns int
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.source_cache where expires_at < now() returning 1
  )
  select count(*)::int from deleted;
$$;

revoke all on function public.prune_source_cache() from public, anon, authenticated;

-- ────────────────────────────────────────────────────── profile bootstrap ──

-- Create a profile row whenever a user signs up, so application code never has
-- to handle "authenticated but no profile".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Applied 2026-08-18 after a Supabase security-advisor warning.
--
-- `handle_new_user` is a trigger function. It runs as SECURITY DEFINER so it can
-- write to `profiles`, but it has no business being reachable through
-- /rest/v1/rpc. Calling it directly would fail (trigger functions require a
-- trigger context), but exposing a definer function at all is needless surface.
revoke all on function public.handle_new_user() from public, anon, authenticated;
