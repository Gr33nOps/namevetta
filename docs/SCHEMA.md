# NameVetta — Database Schema (Phase 4 target)

Supabase Postgres, free tier, RLS on every table, default deny.

**No trademark corpus table exists.** V1 stores no registry data of its own — there is nothing to store, because nothing is ingested. What is stored is the user's own screening progress.

## Identity

```sql
profiles (
  id            uuid primary key references auth.users,
  display_name  text,
  created_at    timestamptz not null default now()
)
```

## Scans

```sql
scans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references profiles(id),      -- null for guests
  guest_hash     text,                              -- salted IP hash, no user linkage
  name           text not null,
  normalized     text not null,                     -- similarity/normalize.ts output
  category       text not null,
  description    text,
  scan_type      text not null check (scan_type in ('quick','deep')),
  status         text not null default 'running',
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
)

source_results (
  id            bigserial primary key,
  scan_id       uuid not null references scans(id) on delete cascade,
  source        text not null,
  status        text not null,                      -- the five SourceStatus values
  confidence    int  not null check (confidence between 0 and 100),
  error_code    text,
  error_message text,
  from_cache    boolean not null default false,
  meta          jsonb,
  checked_at    timestamptz not null,
  expires_at    timestamptz not null,
  unique (scan_id, source)
)

source_evidence (
  id               bigserial primary key,
  source_result_id bigint not null references source_results(id) on delete cascade,
  label            text not null,
  url              text,
  snippet          text,
  observed_at      timestamptz not null
)
```

`source_results` is what Supabase Realtime broadcasts, giving progressive results and survival across a closed tab.

## Matching

```sql
similar_matches (
  id                bigserial primary key,
  source_result_id  bigint not null references source_results(id) on delete cascade,
  external_id       text not null,
  name              text not null,
  owner             text,
  description       text,
  categories        text[] not null default '{}',
  active            boolean,
  url               text,
  is_exact          boolean not null default false,
  sim_text          int not null,
  sim_phonetic      int not null,
  sim_visual        int not null,
  sim_industry      int,                            -- null when unknown; never defaulted
  sim_overall       int not null,
  severity          text not null
)

name_variants (
  scan_id  uuid not null references scans(id) on delete cascade,
  value    text not null,
  kind     text not null,
  weight   real not null,
  primary key (scan_id, value)
)
```

`sim_industry` is nullable on purpose. A missing industry signal must stay missing — defaulting it to 0 or 50 would fabricate the exact judgement that decides whether a match matters.

## Trademark screening

Replaces the trademark corpus tables entirely. This records **what the user did**, not registry contents.

```sql
trademark_screenings (
  id          uuid primary key default gen_random_uuid(),
  scan_id     uuid not null references scans(id) on delete cascade,
  status      text not null default 'not_started'
              check (status in ('not_started','in_progress','completed','unable_to_verify')),
  updated_at  timestamptz not null default now(),
  unique (scan_id)
)

trademark_jurisdiction_checks (
  id             bigserial primary key,
  screening_id   uuid not null references trademark_screenings(id) on delete cascade,
  jurisdiction   text not null check (jurisdiction in ('us','eu','international')),
  status         text not null default 'not_started'
                 check (status in ('not_started','in_progress','completed','unable_to_verify')),
  outcome        text check (outcome in ('no_obvious_conflict','possible_conflict','unclear')),
  note           text,
  completed_at   timestamptz,
  unique (screening_id, jurisdiction)
)

-- Only populated if the user imports their own registry export (optional, not
-- a V1 dependency). Rows are the user's data, deletable with their account.
trademark_imported_matches (
  id             bigserial primary key,
  screening_id   uuid not null references trademark_screenings(id) on delete cascade,
  mark           text not null,
  owner          text,
  registry_status text,
  classes        text[],
  goods_services text,
  reference      text,
  url            text,
  sim_text       int,
  sim_phonetic   int,
  sim_overall    int,
  severity       text,
  imported_at    timestamptz not null default now()
)
```

`outcome` is nullable and only meaningful when `status = 'completed'`. It is self-reported and labelled as such everywhere it is displayed.

## Reports and output

```sql
reports (
  id               uuid primary key default gen_random_uuid(),
  scan_id          uuid not null references scans(id) on delete cascade,
  digital_score    int not null check (digital_score between 0 and 100),
  raw_score        int not null,
  coverage         int not null check (coverage between 0 and 100),
  verdict          text not null,
  scoring_version  int not null,                    -- currently 2
  created_at       timestamptz not null default now()
)

report_group_scores (
  report_id  uuid not null references reports(id) on delete cascade,
  group_name text not null,
  subscore   int,                                   -- null = group produced no usable answer
  weight     int not null,
  primary key (report_id, group_name)
)

report_caps (
  report_id  uuid not null references reports(id) on delete cascade,
  reason     text not null,
  maximum    int not null,
  primary key (report_id, reason)
)

ai_summaries (
  report_id   uuid primary key references reports(id) on delete cascade,
  summary     text not null,
  model       text not null,
  grounded    boolean not null,                     -- passed the grounding validator
  created_at  timestamptz not null default now()
)

saved_names  ( id, user_id, name, category, note, created_at )
comparisons  ( id, user_id, name, category, created_at )
comparison_entries ( comparison_id, scan_id, position )
share_links  ( token text primary key, report_id, created_by, created_at, revoked_at )
```

`digital_score` is named explicitly. A column called `score` would invite a future reader to assume it covers trademarks.

`report_group_scores.subscore` is nullable for the same reason `sim_industry` is: a group that produced no usable answer is *absent*, not zero.

## Operations

```sql
source_cache (
  source        text not null,
  cache_key     text not null,                      -- normalized query key
  payload       jsonb not null,
  expires_at    timestamptz not null,               -- per-source TTL, not one global expiry
  primary key (source, cache_key)
)

daily_usage (
  subject_type  text not null check (subject_type in ('user','guest')),
  subject_id    text not null,                      -- user uuid, or salted IP hash
  day           date not null,
  quick_used    int not null default 0,
  deep_used     int not null default 0,
  primary key (subject_type, subject_id, day)
)

source_health   ( source, window_start, requests, successes, failures, timeouts, p95_latency_ms )
source_failures ( id, source, code, message, occurred_at )
provider_budget ( provider, month, used, limit_value )
```

`provider_budget` is the hard stop that keeps a free tier free — exhausting it degrades the product rather than producing a bill.

## RLS posture

Default deny on every table. A user reads only rows they own, traced through `scans.user_id`.

Guest scans key to `guest_hash` with no user linkage, so guest history is not personally identifiable.

Shared reports are read through a `SECURITY DEFINER` function keyed on the share token — **not** by loosening a table policy, which is the usual way this gets got wrong. A revoked token returns nothing.

Deletion cascades from `scans`, so "delete this search" genuinely removes results, evidence, matches, screening progress and imported rows.
