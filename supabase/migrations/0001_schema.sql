-- NameVetta core schema.
--
-- Design notes that matter:
--
--  * `digital_score` is named explicitly, never `score`. A column called `score`
--    would invite a future reader to assume it covers trademarks, which it does
--    not and must not.
--  * Several numeric columns are deliberately NULLABLE — `sim_industry`,
--    `subscore`. A missing signal must stay missing; defaulting it to 0 or 50
--    would fabricate the exact judgement the product refuses to guess at.
--  * There is no trademark corpus. V1 stores the user's own screening progress,
--    not registry contents.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────── identity ──

create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────────── scans ──

create table public.scans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete cascade,
  -- Salted hash of the client IP. Guests get history and quotas without us
  -- storing anything that identifies them.
  guest_hash   text,
  name         text not null,
  normalized   text not null,
  category     text not null,
  description  text,
  scan_type    text not null check (scan_type in ('quick', 'deep')),
  status       text not null default 'running'
               check (status in ('running', 'complete', 'failed')),
  created_at   timestamptz not null default now(),
  completed_at timestamptz,

  -- Every scan belongs to exactly one subject: a user or a guest, never both
  -- and never neither. Without this, an orphaned row would be readable by
  -- nobody and countable against nobody.
  constraint scans_has_subject check (
    (user_id is not null and guest_hash is null) or
    (user_id is null and guest_hash is not null)
  )
);

create index scans_user_created on public.scans (user_id, created_at desc);
create index scans_guest_created on public.scans (guest_hash, created_at desc);
create index scans_normalized on public.scans (normalized);

create table public.source_results (
  id            bigserial primary key,
  scan_id       uuid not null references public.scans(id) on delete cascade,
  source        text not null,
  status        text not null check (status in (
                  'no_conflict', 'similar_found', 'confirmed_conflict',
                  'unable_to_verify', 'manual_check_recommended')),
  confidence    int not null check (confidence between 0 and 100),
  error_code    text,
  error_message text,
  error_retryable boolean,
  from_cache    boolean not null default false,
  meta          jsonb,
  checked_at    timestamptz not null,
  expires_at    timestamptz not null,

  unique (scan_id, source),

  -- The honesty invariants from `SourceResultSchema`, enforced again at the
  -- database boundary. Application code is not the only thing that writes here.
  constraint source_results_failure_explained check (
    status <> 'unable_to_verify' or error_code is not null
  ),
  constraint source_results_zero_confidence_unverified check (
    confidence > 0 or status in ('unable_to_verify', 'manual_check_recommended')
  )
);

create index source_results_scan on public.source_results (scan_id);

create table public.source_evidence (
  id               bigserial primary key,
  source_result_id bigint not null references public.source_results(id) on delete cascade,
  label            text not null,
  url              text,
  snippet          text,
  observed_at      timestamptz not null
);

create index source_evidence_result on public.source_evidence (source_result_id);

-- ─────────────────────────────────────────────────────────────── matching ──

create table public.similar_matches (
  id               bigserial primary key,
  source_result_id bigint not null references public.source_results(id) on delete cascade,
  external_id      text not null,
  name             text not null,
  owner            text,
  description      text,
  categories       text[] not null default '{}',
  active           boolean,
  url              text,
  is_exact         boolean not null default false,
  sim_text         int not null check (sim_text between 0 and 100),
  sim_phonetic     int not null check (sim_phonetic between 0 and 100),
  sim_visual       int not null check (sim_visual between 0 and 100),
  -- Nullable on purpose: unknown industry must stay unknown.
  sim_industry     int check (sim_industry between 0 and 100),
  sim_overall      int not null check (sim_overall between 0 and 100),
  severity         text not null check (severity in ('none','low','medium','high','critical'))
);

create index similar_matches_result on public.similar_matches (source_result_id);

create table public.name_variants (
  scan_id uuid not null references public.scans(id) on delete cascade,
  value   text not null,
  kind    text not null,
  weight  real not null,
  primary key (scan_id, value)
);

-- ──────────────────────────────────────────────────── trademark screening ──

create table public.trademark_screenings (
  id         uuid primary key default gen_random_uuid(),
  scan_id    uuid not null unique references public.scans(id) on delete cascade,
  status     text not null default 'not_started'
             check (status in ('not_started','in_progress','completed','unable_to_verify')),
  updated_at timestamptz not null default now()
);

create table public.trademark_jurisdiction_checks (
  id           bigserial primary key,
  screening_id uuid not null references public.trademark_screenings(id) on delete cascade,
  jurisdiction text not null check (jurisdiction in ('us','eu','international')),
  status       text not null default 'not_started'
               check (status in ('not_started','in_progress','completed','unable_to_verify')),
  outcome      text check (outcome in ('no_obvious_conflict','possible_conflict','unclear')),
  note         text,
  completed_at timestamptz,

  unique (screening_id, jurisdiction),

  -- An outcome is only meaningful once the check is actually complete.
  constraint tm_outcome_requires_completion check (
    outcome is null or status = 'completed'
  )
);

-- Only populated when a user imports their own registry export. Optional
-- feature; V1 does not depend on it.
create table public.trademark_imported_matches (
  id              bigserial primary key,
  screening_id    uuid not null references public.trademark_screenings(id) on delete cascade,
  mark            text not null,
  owner           text,
  registry_status text,
  classes         text[],
  goods_services  text,
  reference       text,
  url             text,
  sim_text        int,
  sim_phonetic    int,
  sim_overall     int,
  severity        text,
  imported_at     timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────── reports ──

create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  scan_id         uuid not null unique references public.scans(id) on delete cascade,
  digital_score   int not null check (digital_score between 0 and 100),
  raw_score       int not null check (raw_score between 0 and 100),
  coverage        int not null check (coverage between 0 and 100),
  verdict         text not null,
  scoring_version int not null,
  created_at      timestamptz not null default now()
);

create table public.report_group_scores (
  report_id  uuid not null references public.reports(id) on delete cascade,
  group_name text not null,
  -- Nullable: a group that produced no usable answer is absent, not zero.
  subscore   int check (subscore between 0 and 100),
  weight     int not null,
  primary key (report_id, group_name)
);

create table public.report_caps (
  report_id uuid not null references public.reports(id) on delete cascade,
  reason    text not null,
  maximum   int not null,
  primary key (report_id, reason)
);

create table public.ai_summaries (
  report_id  uuid primary key references public.reports(id) on delete cascade,
  summary    text not null,
  model      text not null,
  grounded   boolean not null,
  created_at timestamptz not null default now()
);

create table public.saved_names (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  category   text not null,
  note       text,
  created_at timestamptz not null default now(),
  unique (user_id, name, category)
);

create table public.share_links (
  token      text primary key,
  report_id  uuid not null references public.reports(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index share_links_report on public.share_links (report_id);

-- ───────────────────────────────────────────────────────────── operations ──

-- Per-source caching. Deliberately keyed and expired per source: a domain
-- lookup and a web-search result do not go stale at the same rate.
create table public.source_cache (
  source     text not null,
  cache_key  text not null,
  payload    jsonb not null,
  expires_at timestamptz not null,
  primary key (source, cache_key)
);

create index source_cache_expiry on public.source_cache (expires_at);

create table public.daily_usage (
  subject_type text not null check (subject_type in ('user','guest')),
  subject_id   text not null,
  day          date not null,
  quick_used   int not null default 0,
  deep_used    int not null default 0,
  primary key (subject_type, subject_id, day)
);

create table public.source_health (
  source       text not null,
  window_start timestamptz not null,
  requests     int not null default 0,
  successes    int not null default 0,
  failures     int not null default 0,
  rate_limited int not null default 0,
  timeouts     int not null default 0,
  primary key (source, window_start)
);

-- The hard stop that keeps a free tier free. Exhausting the budget degrades the
-- product; it must never produce a bill.
create table public.provider_budget (
  provider    text not null,
  month       date not null,
  used        int not null default 0,
  limit_value int not null,
  primary key (provider, month)
);
