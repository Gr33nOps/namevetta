-- Shared reports are fetched only from server-side code using service_role.
-- The token remains the capability, but the SECURITY DEFINER function must not
-- also be callable through the public Data API by arbitrary anon/user roles.
revoke execute on function public.get_shared_report(text) from public, anon, authenticated;
grant execute on function public.get_shared_report(text) to service_role;

-- The history and trademark screens filter through these columns. The indexes
-- are partial where null rows cannot participate, keeping write overhead low.
create index if not exists share_links_created_by_idx
  on public.share_links (created_by)
  where created_by is not null;

create index if not exists trademark_imported_matches_screening_id_idx
  on public.trademark_imported_matches (screening_id);
