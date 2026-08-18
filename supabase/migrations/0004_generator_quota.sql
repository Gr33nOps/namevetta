-- Pre-screened name generator quota (§12).
--
-- A generator run researches ~30 candidates with a Quick Check each, which is
-- roughly six times a guest's entire daily Quick Check allowance. Charging it
-- against the existing quick/deep counters would make the feature either
-- unusable (a guest can't afford one run) or a loophole (a low quick-check
-- price for thirty checks). It needs its own counter, so this adds one rather
-- than overloading the columns `consume_quota` already understands.

alter table public.daily_usage
  add column generate_used int not null default 0;

-- Reissued to accept 'generate' alongside 'quick' and 'deep'. Same
-- atomic-under-concurrency shape as before: the check and the increment
-- happen in one statement, under a row lock taken by the SELECT ... FOR UPDATE.
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
  if p_scan_type not in ('quick', 'deep', 'generate') then
    raise exception 'invalid scan_type: %', p_scan_type;
  end if;
  if p_subject_type not in ('user', 'guest') then
    raise exception 'invalid subject_type: %', p_subject_type;
  end if;

  insert into public.daily_usage (subject_type, subject_id, day, quick_used, deep_used, generate_used)
  values (p_subject_type, p_subject_id, current_date, 0, 0, 0)
  on conflict (subject_type, subject_id, day) do nothing;

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
  elsif p_scan_type = 'deep' then
    select deep_used into v_used
    from public.daily_usage
    where subject_type = p_subject_type and subject_id = p_subject_id and day = current_date
    for update;

    if v_used >= p_limit then
      return -1;
    end if;

    update public.daily_usage set deep_used = deep_used + 1
    where subject_type = p_subject_type and subject_id = p_subject_id and day = current_date;
  else
    select generate_used into v_used
    from public.daily_usage
    where subject_type = p_subject_type and subject_id = p_subject_id and day = current_date
    for update;

    if v_used >= p_limit then
      return -1;
    end if;

    update public.daily_usage set generate_used = generate_used + 1
    where subject_type = p_subject_type and subject_id = p_subject_id and day = current_date;
  end if;

  return p_limit - v_used - 1;
end;
$$;

revoke all on function public.consume_quota(text, text, text, int) from public, anon, authenticated;

-- The return shape gains a column, so the old function must be dropped first —
-- `create or replace` cannot change a function's output columns in place.
drop function if exists public.remaining_quota(text, text, int, int);

create or replace function public.remaining_quota(
  p_subject_type   text,
  p_subject_id     text,
  p_quick_limit    int,
  p_deep_limit     int,
  p_generate_limit int default 0
) returns table (quick_remaining int, deep_remaining int, generate_remaining int)
language sql
security definer
set search_path = public
as $$
  select
    greatest(0, p_quick_limit - coalesce(u.quick_used, 0)),
    greatest(0, p_deep_limit  - coalesce(u.deep_used, 0)),
    greatest(0, p_generate_limit - coalesce(u.generate_used, 0))
  from (select 1) dummy
  left join public.daily_usage u
    on u.subject_type = p_subject_type
   and u.subject_id = p_subject_id
   and u.day = current_date;
$$;

revoke all on function public.remaining_quota(text, text, int, int, int) from public, anon, authenticated;
