-- `FOR ALL` also creates a SELECT policy. The dedicated read policy already
-- covers reads, so split writes by operation to avoid evaluating the same
-- ownership predicate twice on every select.
drop policy if exists "tm_jurisdiction_checks: write own"
  on public.trademark_jurisdiction_checks;

create policy "tm_jurisdiction_checks: insert own"
  on public.trademark_jurisdiction_checks for insert
  with check (exists (
    select 1
    from public.trademark_screenings ts
    join public.scans s on s.id = ts.scan_id
    where ts.id = trademark_jurisdiction_checks.screening_id
      and s.user_id = (select auth.uid())
  ));

create policy "tm_jurisdiction_checks: update own"
  on public.trademark_jurisdiction_checks for update
  using (exists (
    select 1
    from public.trademark_screenings ts
    join public.scans s on s.id = ts.scan_id
    where ts.id = trademark_jurisdiction_checks.screening_id
      and s.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1
    from public.trademark_screenings ts
    join public.scans s on s.id = ts.scan_id
    where ts.id = trademark_jurisdiction_checks.screening_id
      and s.user_id = (select auth.uid())
  ));

create policy "tm_jurisdiction_checks: delete own"
  on public.trademark_jurisdiction_checks for delete
  using (exists (
    select 1
    from public.trademark_screenings ts
    join public.scans s on s.id = ts.scan_id
    where ts.id = trademark_jurisdiction_checks.screening_id
      and s.user_id = (select auth.uid())
  ));
