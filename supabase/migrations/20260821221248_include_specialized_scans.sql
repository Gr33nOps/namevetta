alter table public.scans
  add column if not exists include_specialized boolean not null default false;
