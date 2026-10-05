-- FTS-1e (lane FINISH-THE-SWITCH) — THE SCOPES UNDER A SCOPE ARE ARCHIVED AND RESTORED WITH IT IN THE STORE, without the
-- old rows; measured RED then GREEN on live, rolled back
-- (migrations/campaign/scopesfts1e_scope_archive_and_restore_carry_the_scopes_under_it.sql).
--
-- THE USE CASE. Cedar Ridge Physical Therapy closes its "Downtown" site: the "Sports Rehab Wing" under it and the
-- "Aquatic Therapy Pool" under that close with it; the "Billing Office" someone closed last month stays closed when the
-- site reopens.
--
-- WHAT MUST HOLD, as admin@admin.com in Cedar Ridge and test@test.com in its own organization, the scopes under the site
-- held by the store alone (as every scope will be once the old rows stop): C1 archiving the site through
-- custom.context_scope_archive archives the wing and the pool at the site's exact time and leaves the office's own
-- time; C2 restoring it brings back the wing and the pool and leaves the office archived.
-- RED before the file (the cascade rode the old rows); GREEN after. Run inside begin; …; rollback.

do $suite$
declare
  r record; t1 uuid; site uuid; wing uuid := gen_random_uuid(); pool uuid := gen_random_uuid(); office uuid := gen_random_uuid();
  a jsonb; red text[] := '{}'; t_site timestamptz; got text; t_office timestamptz := now() - interval '30 days';
begin
  for r in select * from (values ('admin', '87a6e699-3622-4869-8843-d0867456c0dd'::uuid, '0a54df90-eab8-4d07-ab29-81a45fb41e04'::uuid),
                                 ('test',  '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid, '989f2800-74c8-4408-9161-53ac8feb133a'::uuid)) v(who, uid, org) loop
    wing := gen_random_uuid(); pool := gen_random_uuid(); office := gen_random_uuid();
    perform set_config('request.jwt.claims', jsonb_build_object('sub', r.uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    t1 := (custom.context_type_write(r.org, null, '{"label_singular":"Clinic Site","label_plural":"Clinic Sites"}') -> 'row' ->> 'id')::uuid;
    site := (custom.context_scope_write(r.org, null, t1, '{"name":"Downtown"}') -> 'row' ->> 'id')::uuid;
    perform set_config('role', 'none', true);
    perform custom._ctx_store_scope(r.org, t1, wing, jsonb_build_object('name', 'Sports Rehab Wing', 'parent_scope_id', site,
              'slug', 'sports_rehab_wing', 'sort_order', 1, 'created_by', r.uid));
    perform custom._ctx_store_scope(r.org, t1, pool, jsonb_build_object('name', 'Aquatic Therapy Pool', 'parent_scope_id', wing,
              'slug', 'aquatic_therapy_pool', 'sort_order', 1, 'created_by', r.uid));
    perform custom._ctx_store_scope(r.org, t1, office, jsonb_build_object('name', 'Billing Office', 'parent_scope_id', site,
              'slug', 'billing_office', 'sort_order', 2, 'created_by', r.uid, 'deleted_at', t_office));
    perform set_config('role', 'authenticated', true);

    a := custom.context_scope_archive(site);
    perform set_config('role', 'none', true);
    select deleted_at into t_site from custom.record where id = site;
    select string_agg(x.data ->> 'name' || '=' || coalesce(case when x.deleted_at = t_site then 'site' when x.deleted_at = t_office then 'own'
                                                                 when x.deleted_at is null then 'live' else 'other' end, '?'), ',' order by x.data ->> 'name')
      into got from custom.record x where x.id in (wing, pool, office);
    if t_site is null or got is distinct from 'Aquatic Therapy Pool=site,Billing Office=own,Sports Rehab Wing=site' then
      red := red || (r.who || ' C1: ' || coalesce(got, '<none>'));
    end if;
    perform set_config('role', 'authenticated', true);
    a := custom.context_scope_restore(site);
    perform set_config('role', 'none', true);
    select string_agg(x.data ->> 'name' || '=' || case when x.deleted_at is null then 'live' when x.deleted_at = t_office then 'own' else 'other' end,
                      ',' order by x.data ->> 'name')
      into got from custom.record x where x.id in (site, wing, pool, office);
    if got is distinct from 'Aquatic Therapy Pool=live,Billing Office=own,Downtown=live,Sports Rehab Wing=live' then
      red := red || (r.who || ' C2: ' || coalesce(got, '<none>'));
    end if;
  end loop;
  if cardinality(red) > 0 then raise exception 'RED: %', array_to_string(red, ' | '); end if;
  raise notice 'GREEN: C1-C2 for admin and test@test.com';
end $suite$;
