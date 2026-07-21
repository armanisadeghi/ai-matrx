-- Arman ruling 2026-07-21 (final form): web.* is scraped public data.
--
-- 1. READS: any authenticated user, constant-time. The old std_select called
--    iam.has_access() PER ROW — on All Green's ~5k pages that is ~5k function
--    invocations per query and produced live "canceling statement due to
--    statement timeout" (09:19–09:21Z). Security stays (anon gets nothing;
--    the role gate remains); the per-row function work goes.
-- 2. WRITES: keep the existing owner/org gates but add a super-admin
--    override so a platform admin is never locked out of marketing rows.
-- 3. Kill the remaining anon read channels in web (analysis_item, provider).
--
-- Idempotent: policies already containing is_super_admin are skipped; the
-- SELECT rewrite is naturally re-runnable.

do $$
declare pol record;
begin
  for pol in
    select * from pg_policies
    where schemaname = 'web'
      and policyname in ('std_select', 'std_insert', 'std_update', 'std_delete')
  loop
    if pol.cmd = 'SELECT' then
      execute format('drop policy %I on web.%I', pol.policyname, pol.tablename);
      execute format(
        'create policy std_select on web.%I for select to authenticated using (true)',
        pol.tablename);
    elsif pol.cmd = 'INSERT' then
      if pol.with_check is not null
         and position('is_super_admin' in pol.with_check) = 0 then
        execute format(
          'alter policy %I on web.%I with check ((%s) or public.is_super_admin())',
          pol.policyname, pol.tablename, pol.with_check);
      end if;
    elsif pol.cmd = 'UPDATE' then
      if pol.qual is not null and position('is_super_admin' in pol.qual) = 0 then
        if pol.with_check is not null then
          execute format(
            'alter policy %I on web.%I using ((%s) or public.is_super_admin()) with check ((%s) or public.is_super_admin())',
            pol.policyname, pol.tablename, pol.qual, pol.with_check);
        else
          execute format(
            'alter policy %I on web.%I using ((%s) or public.is_super_admin())',
            pol.policyname, pol.tablename, pol.qual);
        end if;
      end if;
    elsif pol.cmd = 'DELETE' then
      if pol.qual is not null and position('is_super_admin' in pol.qual) = 0 then
        execute format(
          'alter policy %I on web.%I using ((%s) or public.is_super_admin())',
          pol.policyname, pol.tablename, pol.qual);
      end if;
    end if;
  end loop;
end$$;

-- Anon keeps zero read paths into web.
drop policy if exists pub_read on web.analysis_item;
drop policy if exists pub_read on web.provider;
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'web' loop
    execute format('revoke select on web.%I from anon', t.tablename);
  end loop;
end$$;
