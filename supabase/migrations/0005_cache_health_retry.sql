-- Wire up the shared response cache and health tracking that already exist in
-- the schema (`source_cache`, `source_health` from 0001) but had no functions
-- reading or writing them. Without this, `healthMultiplier` in
-- src/lib/scoring/confidence.ts needs 20 samples inside one process's memory,
-- which a serverless instance rarely accumulates before it recycles — and the
-- response cache in src/lib/sources/rate-limit.ts is per-instance, so every
-- cold start re-spends rate-limit budget and Tavily credits a warm instance
-- would have avoided.
--
-- Both tables are service-role-only (RLS on, no policies, per 0002). Cache
-- reads/writes go straight through the service client from src/lib/db/cache.ts
-- — a plain upsert is enough, because a repeat write racing another instance
-- just overwrites with an equivalent value. Health increments need to be
-- atomic across concurrent instances, so that one goes through a function.

-- ─────────────────────────────────────────────────────────────── health ──

-- Atomically bump one hourly bucket for one source. A single upsert statement
-- with arithmetic in the conflict clause is already atomic in Postgres; no
-- explicit row locking is needed.
create or replace function public.record_source_outcome(
  p_source  text,
  p_outcome text  -- 'success' | 'failure' | 'rate_limited' | 'timeout'
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.source_health
    (source, window_start, requests, successes, failures, rate_limited, timeouts)
  values (
    p_source, date_trunc('hour', now()), 1,
    (p_outcome = 'success')::int,
    (p_outcome = 'failure')::int,
    (p_outcome = 'rate_limited')::int,
    (p_outcome = 'timeout')::int
  )
  on conflict (source, window_start) do update set
    requests     = source_health.requests + 1,
    successes    = source_health.successes + (p_outcome = 'success')::int,
    failures     = source_health.failures + (p_outcome = 'failure')::int,
    rate_limited = source_health.rate_limited + (p_outcome = 'rate_limited')::int,
    timeouts     = source_health.timeouts + (p_outcome = 'timeout')::int;
$$;

revoke all on function public.record_source_outcome(text, text) from public, anon, authenticated;

-- Trailing 24-hour success rate per source, summed across the hourly buckets.
-- Read once per scan (see loadHealthSnapshot in src/lib/sources/health.ts) so
-- confidence reflects cross-instance reliability rather than only what this
-- one process has personally seen.
create or replace function public.get_source_health_snapshot()
returns table (source text, requests bigint, successes bigint)
language sql
security definer
set search_path = public
stable
as $$
  select source, sum(requests)::bigint, sum(successes)::bigint
  from public.source_health
  where window_start > now() - interval '24 hours'
  group by source;
$$;

revoke all on function public.get_source_health_snapshot() from public, anon, authenticated;

-- No pg_cron on the free tier, so old buckets are swept opportunistically from
-- the application (a small random chance per write) rather than on a schedule.
create or replace function public.sweep_source_health()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.source_health where window_start < now() - interval '7 days';
$$;

revoke all on function public.sweep_source_health() from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────── cache ──

-- Same opportunistic-sweep approach for the cache table; expired rows are also
-- skipped on read (see getCachedResult), so a slightly late sweep never
-- surfaces stale data, only wastes a little storage until it runs.
create or replace function public.sweep_source_cache()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.source_cache where expires_at < now();
$$;

revoke all on function public.sweep_source_cache() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────── retries ──

-- Per-source retry (roadmap: "retry a failed source without spending quota")
-- needs a bounded counter so it cannot become a way to bypass daily quota by
-- repeatedly re-running the same source.
alter table public.scans add column if not exists retries_used int not null default 0;

-- Atomically check ownership and bump the retry counter in one round trip, so
-- two concurrent retry clicks cannot both read "2 of 3 used" and both proceed.
-- Returns true when the retry is allowed (and was counted), false when the
-- scan is not owned by this subject, does not exist, or is already at the cap.
create or replace function public.increment_scan_retry(
  p_scan_id     uuid,
  p_subject_type text,  -- 'user' | 'guest'
  p_subject_id   text,
  p_max_retries  int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_user  uuid;
  v_owner_guest text;
  v_used        int;
begin
  select user_id, guest_hash, retries_used
    into v_owner_user, v_owner_guest, v_used
    from public.scans
   where id = p_scan_id
     for update;

  if not found then
    return false;
  end if;

  if p_subject_type = 'user' then
    if v_owner_user is null or v_owner_user::text <> p_subject_id then
      return false;
    end if;
  else
    if v_owner_guest is null or v_owner_guest <> p_subject_id then
      return false;
    end if;
  end if;

  if v_used >= p_max_retries then
    return false;
  end if;

  update public.scans set retries_used = retries_used + 1 where id = p_scan_id;
  return true;
end;
$$;

revoke all on function public.increment_scan_retry(uuid, text, text, int) from public, anon, authenticated;
