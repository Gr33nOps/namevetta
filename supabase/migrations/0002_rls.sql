-- Row Level Security.
--
-- Posture: **default deny everywhere**. RLS is enabled on every table, and a
-- table with no policy is unreadable rather than open.
--
-- The operational tables (`source_cache`, `daily_usage`, `source_health`,
-- `provider_budget`) get RLS enabled and *no* policies at all. That is
-- deliberate: they are service-role-only, and the service role bypasses RLS.
-- Enabling RLS without policies is what makes them invisible to the anon and
-- authenticated keys, which is exactly what we want.
--
-- Shared reports are read through a SECURITY DEFINER function keyed on the
-- share token (see 0003), **not** by loosening a table policy. Loosening the
-- policy is the usual way this gets got wrong: it exposes every report to
-- anyone who can guess an id.

alter table public.profiles                    enable row level security;
alter table public.scans                       enable row level security;
alter table public.source_results              enable row level security;
alter table public.source_evidence             enable row level security;
alter table public.similar_matches             enable row level security;
alter table public.name_variants               enable row level security;
alter table public.trademark_screenings        enable row level security;
alter table public.trademark_jurisdiction_checks enable row level security;
alter table public.trademark_imported_matches  enable row level security;
alter table public.reports                     enable row level security;
alter table public.report_group_scores         enable row level security;
alter table public.report_caps                 enable row level security;
alter table public.ai_summaries                enable row level security;
alter table public.saved_names                 enable row level security;
alter table public.share_links                 enable row level security;

-- Service-role-only. RLS on, no policies: nothing reaches these via a user key.
alter table public.source_cache     enable row level security;
alter table public.daily_usage      enable row level security;
alter table public.source_health    enable row level security;
alter table public.provider_budget  enable row level security;

-- ─────────────────────────────────────────────────────────────── profiles ──

create policy "profiles: read own"
  on public.profiles for select
  using (id = (select auth.uid()));

create policy "profiles: update own"
  on public.profiles for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ────────────────────────────────────────────────────────────────── scans ──
--
-- Guest scans are intentionally NOT readable through these policies. A guest
-- has no authenticated identity, so there is no safe way to prove ownership of
-- a `guest_hash` from the client. Guest access goes through server routes using
-- the service role, which check the hash themselves.

create policy "scans: read own"
  on public.scans for select
  using (user_id = (select auth.uid()));

create policy "scans: delete own"
  on public.scans for delete
  using (user_id = (select auth.uid()));

-- ───────────────────────────────────────────── scan children, by ownership ──
--
-- Every child table traces ownership back to `scans.user_id`. Written as EXISTS
-- subqueries rather than joins so the planner can use the primary-key index.

create policy "source_results: read own"
  on public.source_results for select
  using (exists (
    select 1 from public.scans s
    where s.id = source_results.scan_id and s.user_id = (select auth.uid())
  ));

create policy "source_evidence: read own"
  on public.source_evidence for select
  using (exists (
    select 1
    from public.source_results r
    join public.scans s on s.id = r.scan_id
    where r.id = source_evidence.source_result_id and s.user_id = (select auth.uid())
  ));

create policy "similar_matches: read own"
  on public.similar_matches for select
  using (exists (
    select 1
    from public.source_results r
    join public.scans s on s.id = r.scan_id
    where r.id = similar_matches.source_result_id and s.user_id = (select auth.uid())
  ));

create policy "name_variants: read own"
  on public.name_variants for select
  using (exists (
    select 1 from public.scans s
    where s.id = name_variants.scan_id and s.user_id = (select auth.uid())
  ));

-- ──────────────────────────────────────────────────── trademark screening ──
--
-- Screening is the user's own record of work they did. They may write it.

create policy "trademark_screenings: read own"
  on public.trademark_screenings for select
  using (exists (
    select 1 from public.scans s
    where s.id = trademark_screenings.scan_id and s.user_id = (select auth.uid())
  ));

create policy "trademark_screenings: write own"
  on public.trademark_screenings for update
  using (exists (
    select 1 from public.scans s
    where s.id = trademark_screenings.scan_id and s.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.scans s
    where s.id = trademark_screenings.scan_id and s.user_id = (select auth.uid())
  ));

create policy "tm_jurisdiction_checks: read own"
  on public.trademark_jurisdiction_checks for select
  using (exists (
    select 1
    from public.trademark_screenings ts
    join public.scans s on s.id = ts.scan_id
    where ts.id = trademark_jurisdiction_checks.screening_id and s.user_id = (select auth.uid())
  ));

create policy "tm_jurisdiction_checks: write own"
  on public.trademark_jurisdiction_checks for all
  using (exists (
    select 1
    from public.trademark_screenings ts
    join public.scans s on s.id = ts.scan_id
    where ts.id = trademark_jurisdiction_checks.screening_id and s.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1
    from public.trademark_screenings ts
    join public.scans s on s.id = ts.scan_id
    where ts.id = trademark_jurisdiction_checks.screening_id and s.user_id = (select auth.uid())
  ));

create policy "tm_imported_matches: read own"
  on public.trademark_imported_matches for select
  using (exists (
    select 1
    from public.trademark_screenings ts
    join public.scans s on s.id = ts.scan_id
    where ts.id = trademark_imported_matches.screening_id and s.user_id = (select auth.uid())
  ));

-- ──────────────────────────────────────────────────────────────── reports ──

create policy "reports: read own"
  on public.reports for select
  using (exists (
    select 1 from public.scans s
    where s.id = reports.scan_id and s.user_id = (select auth.uid())
  ));

create policy "report_group_scores: read own"
  on public.report_group_scores for select
  using (exists (
    select 1
    from public.reports rep
    join public.scans s on s.id = rep.scan_id
    where rep.id = report_group_scores.report_id and s.user_id = (select auth.uid())
  ));

create policy "report_caps: read own"
  on public.report_caps for select
  using (exists (
    select 1
    from public.reports rep
    join public.scans s on s.id = rep.scan_id
    where rep.id = report_caps.report_id and s.user_id = (select auth.uid())
  ));

create policy "ai_summaries: read own"
  on public.ai_summaries for select
  using (exists (
    select 1
    from public.reports rep
    join public.scans s on s.id = rep.scan_id
    where rep.id = ai_summaries.report_id and s.user_id = (select auth.uid())
  ));

-- ──────────────────────────────────────────────────────────── saved names ──

create policy "saved_names: all own"
  on public.saved_names for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ──────────────────────────────────────────────────────────── share links ──
--
-- Owners manage their own links. Nobody reads a report *through* this table —
-- that is what the SECURITY DEFINER function in 0003 is for.

create policy "share_links: all own"
  on public.share_links for all
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));
