-- HRB-003 D15 follow-up — isolate the hot hr.job_title privacy-wall rewrite.
--
-- hr_p3d originally regenerated RLS for all nine remaining pay-bearing tables
-- in one transaction. Live traffic prevented hr.job_title from acquiring its
-- ALTER TABLE lock within the migration runner's 15-second safety limit, which
-- rolled back every otherwise-ready table. Keeping this table in its own
-- migration transaction bounds the lock scope and lets the other privacy walls
-- apply independently. The policy change is identical to hr_p3d.
--
-- Idempotent: the flag is set true and RLS is regenerated deterministically.

update platform.entity_types
   set suppress_platform_admin_lane = true
 where token = 'hr_job_title';

do $regen$
declare r record;
begin
  select token, schema_name, table_name, rls_variant
    into r
    from platform.entity_types
   where token = 'hr_job_title';

  if r.token is null then
    raise exception 'HRB-003 D15: hr_job_title is not registered';
  end if;

  perform iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
end
$regen$;

do $wall$
declare
  r record;
  v_bad integer;
begin
  select token, schema_name, table_name
    into r
    from platform.entity_types
   where token = 'hr_job_title';

  if exists (select 1 from pg_policies
              where schemaname=r.schema_name and tablename=r.table_name
                and policyname='platform_admin_all') then
    raise exception 'HRB-003 D15: platform_admin_all still present on %.%', r.schema_name, r.table_name;
  end if;

  select count(*) into v_bad from pg_policies
   where schemaname=r.schema_name and tablename=r.table_name
     and (coalesce(qual,'')       ilike '%is_platform_admin%'
       or coalesce(qual,'')       ilike '%is_super_admin%'
       or coalesce(with_check,'') ilike '%is_platform_admin%'
       or coalesce(with_check,'') ilike '%is_super_admin%');
  if v_bad > 0 then
    raise exception 'HRB-003 D15: %.% still has % policies carrying a platform-staff arm',
      r.schema_name, r.table_name, v_bad;
  end if;

  select count(*) into v_bad
    from iam.verify_canonical(r.schema_name, r.table_name, r.token, null)
   where status in ('FAIL','WARN');
  if v_bad > 0 then
    raise exception 'HRB-003 D15: %.% does not certify (% FAIL/WARN)', r.schema_name, r.table_name, v_bad;
  end if;

  if not exists (select 1 from iam.verify_canonical(r.schema_name, r.table_name, r.token, null)
                  where check_name='privacy_wall' and status='PASS') then
    raise exception 'HRB-003 D15: %.% has no passing privacy_wall check', r.schema_name, r.table_name;
  end if;
end
$wall$;
