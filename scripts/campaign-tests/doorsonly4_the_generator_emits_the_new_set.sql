-- DOORS-ONLY-4 — THE GENERATOR PROOF, ON A FIXTURE TABLE, ENDING IN ROLLBACK.
--
-- THE USE CASE (OWNER LAW 2026-09-21, no fake test data). Harborline Freight Brokerage is a
-- Long Beach reefer broker — the same real business DOORS-ONLY-3's proof used, so the two
-- read as one campaign. This fixture is the platform-side registry a broker's dispatcher
-- reads: the lane corridors the brokerage quotes on ("Long Beach, CA → Nogales, AZ"), which
-- live in `platform` because they are platform machinery a dispatcher reads and a door writes.
--
-- WHAT IT PROVES, in order:
--   1  provision into a doors-only schema emits EXACTLY the new set: svc_all, std_select,
--      platform_admin_select — and NO std_insert / std_update / std_delete and NO
--      platform_admin_all.
--   2  the client grant is SELECT only: no table and no COLUMN write privilege for
--      public / anon / authenticated.
--   3  re-running iam.apply_rls is IDEMPOTENT — the policy set and the grants do not move.
--      (This is the whole point: hand-written DROP POLICY files do not survive this step.)
--   4  iam.verify_canonical reports NO drift: zero FAILs, and `platform_admin_select` is not
--      reported as unexpected/legacy by policies_canonical.
--   5  the platform-admin READ lane answers — the predicate of platform_admin_select is
--      byte-identical to the USING half of the platform_admin_all it replaced.
--   6  a plain member's DIRECT write is refused, and by 42501 rather than a constraint code.
--
-- Run: psql <main db> -f scripts/campaign-tests/doorsonly4_the_generator_emits_the_new_set.sql
\set ON_ERROR_STOP on
begin;
set local lock_timeout = '5s';

create temporary table _t(k text primary key, ok boolean, detail text) on commit drop;

select platform.provision($spec$
{
  "schema": "platform",
  "table": "doorsonly4_lane_corridor",
  "token": "doorsonly4_lane_corridor",
  "label": "Lane corridor",
  "description": "DOORS-ONLY-4 fixture: the reefer corridors Harborline Freight Brokerage quotes on. Created only inside a rolled-back proof transaction.",
  "type": "entity",
  "origin": "standard",
  "sharing": false,
  "taxonomy_node_id": "210ab588-6285-461a-bcfe-f1e9ac97351e",
  "category_label": "Platform",
  "access": {
    "data_class": "organization",
    "data_class_reason": "A corridor belongs to the brokerage that quotes it, visible inside the organization by its access grants.",
    "default_list_scope": "organization",
    "visibility": "internal",
    "key_column": "created_by"
  },
  "fields": [
    { "name": "corridor_name", "type": "text", "not_null": true, "description": "Long Beach, CA to Nogales, AZ" },
    { "name": "equipment", "type": "text", "description": "reefer | dry van | flatbed" },
    { "name": "target_rate_per_mile_usd", "type": "numeric", "description": "The brokerage's own target buy rate." }
  ]
}
$spec$);

-- 1 — the emitted policy set
insert into _t
select 'policy_set_is_the_new_one',
       coalesce(array_agg(polname::text order by polname), '{}'::text[])
         = array['platform_admin_select','std_select','svc_all']::text[],
       'emitted: ' || coalesce(array_to_string(array_agg(polname::text order by polname), ', '), '(none)')
  from pg_policy where polrelid = 'platform.doorsonly4_lane_corridor'::regclass;

-- 2 — the client grant is SELECT only, at table AND column level
insert into _t
select 'client_grant_is_read_only',
       not bool_or(w),
       'writable role/privilege pairs: ' || coalesce(string_agg(r || ' ' || p, ', ') filter (where w), 'none')
  from (
    select r, p,
           case when p = 'DELETE'
                then has_table_privilege(r, 'platform.doorsonly4_lane_corridor'::regclass, 'DELETE')
                else has_any_column_privilege(r, 'platform.doorsonly4_lane_corridor'::regclass, p) end as w
      from unnest(array['public','anon','authenticated']) r
     cross join unnest(array['INSERT','UPDATE','DELETE']) p
  ) x;

-- 3 — regeneration is idempotent
create temporary table _before on commit drop as
  select polname::text pn, pg_get_expr(polqual, polrelid) q, pg_get_expr(polwithcheck, polrelid) w, polcmd::text pc
    from pg_policy where polrelid = 'platform.doorsonly4_lane_corridor'::regclass;

select iam.apply_rls('platform', 'doorsonly4_lane_corridor', 'doorsonly4_lane_corridor', 'entity');

create temporary table _after on commit drop as
  select polname::text pn, pg_get_expr(polqual, polrelid) q, pg_get_expr(polwithcheck, polrelid) w, polcmd::text pc
    from pg_policy where polrelid = 'platform.doorsonly4_lane_corridor'::regclass;

insert into _t
select 'regeneration_is_idempotent',
       (select count(*) from ((table _before except table _after) union all (table _after except table _before)) d) = 0,
       'rows differing after a second iam.apply_rls: ' ||
       (select count(*)::text from ((table _before except table _after) union all (table _after except table _before)) d)
       || '; after = ' || (select string_agg(pn, ', ' order by pn) from _after);

-- 4 — the verifier reports no drift
insert into _t
select 'verifier_reports_no_drift',
       count(*) filter (where status = 'FAIL') = 0,
       'FAILs: ' || coalesce(string_agg(check_name || ' (' || coalesce(detail,'') || ')', '; ')
                             filter (where status = 'FAIL'), 'none')
  from iam.verify_canonical('platform', 'doorsonly4_lane_corridor', 'doorsonly4_lane_corridor', 'entity')
 -- THE THREE BASE-CONTRACT FOREIGN KEYS ARE DEFERRED BY platform.provision ITSELF, and its
 -- own result says so: creating them here would hold SHARE ROW EXCLUSIVE on auth.users and
 -- iam.organizations for the length of the build (measured 2026-09-21: 298s, 22 sessions
 -- queued, sign-in included), which is exactly the write-freeze rule. They are settled by
 -- platform.provision_attach_base_contract in its own short transaction, which a proof that
 -- ends in ROLLBACK cannot run. Excluded BY NAME, never by a blanket filter.
 where check_name not in ('base_org_fk','base_created_by_fk','base_updated_by_fk');

-- 5 — the platform-admin READ predicate is byte-identical to the FOR ALL policy's USING half
insert into _t
select 'admin_read_predicate_unchanged',
       (select pg_get_expr(polqual, polrelid) from pg_policy
         where polrelid = 'platform.doorsonly4_lane_corridor'::regclass
           and polname = 'platform_admin_select')
       -- The DD-165 walled form, because this fixture carries a typed `visibility` column:
       -- byte-for-byte the USING half `platform_admin_all` would have carried here.
       = '((visibility >= ''internal''::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin))',
       'platform_admin_select USING = ' ||
       coalesce((select pg_get_expr(polqual, polrelid) from pg_policy
                  where polrelid = 'platform.doorsonly4_lane_corridor'::regclass
                    and polname = 'platform_admin_select'), '(absent)');

insert into _t
select 'admin_select_is_select_only',
       (select polcmd from pg_policy
         where polrelid = 'platform.doorsonly4_lane_corridor'::regclass
           and polname = 'platform_admin_select') = 'r',
       'polcmd = ' || coalesce((select polcmd::text from pg_policy
                                 where polrelid = 'platform.doorsonly4_lane_corridor'::regclass
                                   and polname = 'platform_admin_select'), '(absent)');

-- 6 — a plain member's DIRECT write is refused, by 42501 and not a constraint code
do $probe$
declare v_state text := 'NO ERROR — THE WRITE SUCCEEDED';
begin
  set local role authenticated;
  begin
    execute 'insert into platform.doorsonly4_lane_corridor (corridor_name) values (''Long Beach, CA to Nogales, AZ'')';
  exception when others then v_state := sqlstate;
  end;
  reset role;
  insert into _t values ('member_direct_write_refused_42501', v_state = '42501', 'sqlstate ' || v_state);
end
$probe$;

select case when ok then 'ok  ' else 'FAIL' end || '  ' || k || '  —  ' || detail as result from _t order by k;
select count(*) filter (where ok) || '/' || count(*) || ' green' as score from _t;

rollback;
