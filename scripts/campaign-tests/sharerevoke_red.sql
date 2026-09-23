-- SHARE-REVOKE — THE RED TWIN OF `sharerevoke_green.sql`. EACH CLAUSE PLANTS THE DEFECT AND
-- REQUIRES THE GREEN SUITE'S OWN CHECK TO SEE IT. A green check that cannot go red proves nothing.
--
--   RED 1  the one-statement probe from CLAUSE 1, with the write to `iam.permissions` made
--          as if its memo-clearing triggers had not fired (the memo generation `mx_memo.g` is put
--          back to its pre-revoke value, inside a rolled-back transaction — no DDL). The read
--          after the revoke MUST still open the table: that is exactly the state production was
--          in before sharerevoke_every_table_the_ladder_reads_empties_the_memo.sql.
--   RED 2  CLAUSE 4's derived census, handed the declared list with `iam.permissions` taken out.
--          It MUST name `iam.permissions`.
--
-- RUN IT exactly like the green suite. It is not a migration.

\set ON_ERROR_STOP on
\timing off

\set suite 'sharerevoke_red.sql'
\set requires 'function:platform.memo_reach_unguarded|function:custom.assert_may_know_table'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\set ORG   '\'5ae70000-0000-4a00-8b00-000000000001\''
\set ADMIN '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA  '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''

-- ══════════════════════════════════════ STEP 0 — a clean slate, and the fixture
begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'campaign-test/sharerevoke', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from iam.content_lane where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from platform.associations where organization_id = :ORG;
delete from custom.record where organization_id = :ORG;
delete from custom.field  where organization_id = :ORG;
delete from custom.io_outbox where organization_id = :ORG;
delete from custom.io_comment where organization_id = :ORG;
delete from custom.record_alias where organization_id = :ORG;
delete from custom.visibility_epoch where organization_id = :ORG;
delete from custom.organization_visibility_version where organization_id = :ORG;
delete from history.row_versions where organization_id = :ORG;
delete from history.migration_log where organization_id = :ORG;
delete from platform.knob_override where organization_id = :ORG;
delete from iam.memberships where organization_id = :ORG;
delete from iam.organizations where id = :ORG;

insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG, 'Mesa Verde Dental Group', 'mesa-verde-dental-sharerevoke-red', 'MVD', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG, 'organization', :ORG, :ADMIN, 'owner',  'active'),
       (:ORG, 'organization', :ORG, :DANA,  'member', 'active');
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'system_enabled',            'organization', :ORG, :ORG, 'true'::jsonb,          'SHARE-REVOKE red suite'),
       ('custom', 'member_default_visibility', 'organization', :ORG, :ORG, '"shared_only"'::jsonb, 'SHARE-REVOKE red suite');
commit;

begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'campaign-test/sharerevoke', true);
do $t$
declare
  v_org   constant uuid := '5ae70000-0000-4a00-8b00-000000000001';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_hq    constant uuid := '5ae70000-0000-4a00-8b00-000000000011';
  v_a     constant uuid := '5ae70000-0000-4a00-8b00-000000000021';
  v_b     constant uuid := '5ae70000-0000-4a00-8b00-000000000022';
  t uuid;
begin
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_hq, v_org, null, 'record', jsonb_build_object('name', 'Mesa Verde Front Office'), v_admin);

  t := custom.table_declare(v_org, jsonb_build_object(
    'name','Patient','slug','mvd_patient','label_singular','Patient','label_plural','Patients',
    'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
    'title_field','title','parent_id', v_hq::text));
  update custom.record set id = v_a where organization_id = v_org and id = t;
  update custom.record set data = data || jsonb_build_object('entity_definition_id', v_a::text)
   where organization_id = v_org and table_id = custom.field_kernel_id()
     and (data ->> 'entity_definition_id')::uuid = t;
  update custom.field set entity_definition_id = v_a where organization_id = v_org and entity_definition_id = t;

  t := custom.table_declare(v_org, jsonb_build_object(
    'name','Treatment Plan','slug','mvd_plan','label_singular','Treatment Plan','label_plural','Treatment Plans',
    'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
    'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
    'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
    'title_field','title','parent_id', v_hq::text));
  update custom.record set id = v_b where organization_id = v_org and id = t;
  update custom.record set data = data || jsonb_build_object('entity_definition_id', v_b::text)
   where organization_id = v_org and table_id = custom.field_kernel_id()
     and (data ->> 'entity_definition_id')::uuid = t;
  update custom.field set entity_definition_id = v_b where organization_id = v_org and entity_definition_id = t;

  insert into custom.record (id, organization_id, table_id, data_class, data, created_by) values
    ('5ae70000-0000-4a00-8b00-000000000031', v_org, v_a, 'record', jsonb_build_object('title','Maria Delgado'), v_admin),
    ('5ae70000-0000-4a00-8b00-000000000032', v_org, v_a, 'record', jsonb_build_object('title','Tom Okafor'),    v_admin),
    ('5ae70000-0000-4a00-8b00-000000000033', v_org, v_a, 'record', jsonb_build_object('title','Priya Raman'),   v_admin),
    ('5ae70000-0000-4a00-8b00-000000000041', v_org, v_b, 'record', jsonb_build_object('title','Crown and bridge, upper left'), v_admin);

  -- `Priya Raman` is put INSIDE the treatment plan, through the store's own reparent door.
  perform custom.record_reparent(v_org, '5ae70000-0000-4a00-8b00-000000000033',
                                 '5ae70000-0000-4a00-8b00-000000000041');
end $t$;
commit;

-- ══════════════════════════════════════ RED 1 — THE PROBE GOES RED WHEN THE WRITE FORGETS NOTHING
begin;
set local statement_timeout = '60s';
select set_config('app.actor_system', 'campaign-test/sharerevoke', true);
set local role authenticated;
do $t$
declare
  v_org   constant uuid := '5ae70000-0000-4a00-8b00-000000000001';
  v_admin constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_dana  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_dana_id constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_a     constant uuid := '5ae70000-0000-4a00-8b00-000000000021';
  v_rec1  constant uuid := '5ae70000-0000-4a00-8b00-000000000031';
  v_n     integer;
  v_caught text;
  v_gen   text;
begin
  perform set_config('request.jwt.claims', v_admin, true);
  perform custom.share_grant(v_org, v_rec1, 'user', v_dana_id, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', v_dana, true);
  select count(*) into v_n from custom.read_records(v_org, v_a, false, 50, 0);
  if v_n <> 1 then
    raise exception 'RED 1 BROKEN: the fixture did not open for her after the share (% rows), so this clause measures nothing', v_n;
  end if;

  -- THE PLANT: the revoke lands with no trigger firing on iam.permissions.
  -- The memo's per-key answers are invalidated by ONE thing: the generation `mx_memo.g`, which
  -- `platform.memo_clear()` replaces. Putting the generation back to what it was before the
  -- revoke is exactly "the write to iam.permissions emptied nothing" — no DDL, no privilege.
  perform set_config('request.jwt.claims', v_admin, true);
  v_gen := current_setting('mx_memo.g', true);
  perform custom.share_revoke(v_org, v_rec1, 'user', v_dana_id);
  perform set_config('mx_memo.g', coalesce(v_gen, ''), true);

  perform set_config('request.jwt.claims', v_dana, true);
  v_caught := null;
  begin
    perform count(*) from custom.read_records(v_org, v_a, false, 50, 0);
  exception when others then v_caught := sqlstate;
  end;
  if v_caught is not distinct from '42501' then
    raise exception 'RED 1 FAILED TO GO RED: with the revoke landing unseen by the memo triggers the table was still refused — then CLAUSE 1''s refusal does not prove the triggers do anything.';
  end if;
  raise notice 'RED 1 RED AS REQUIRED — a revoke that empties nothing leaves the table open for the rest of the statement (sqlstate %).', coalesce(v_caught, 'none');
end $t$;
rollback;

-- ══════════════════════════════════════ RED 2 — THE CENSUS NAMES A TABLE TAKEN OFF THE LIST
begin;
set local statement_timeout = '60s';
do $t$
declare
  v_declared text[] := array_remove(platform.memo_reach_tables(), 'iam.permissions');
  v_missing  text[];
begin
  -- THE DERIVED CENSUS. Every base table named anywhere in the callee closure of the three
  -- ladder entry points (string literals included: the predicate is dynamic SQL; views expanded
  -- to the tables under them) must be DECLARED in platform.memo_reach_tables(), or already carry
  -- the knob memo's own platform.memo_bump trigger, or be one of the NAMED exclusions below.
  with recursive walk(fn) as (
    select unnest(array['custom.has_visibility(uuid,text,uuid,public.permission_level)'::regprocedure,
                        'custom.visible_predicate_sql(uuid,uuid,uuid,public.permission_level,text)'::regprocedure,
                        'custom.assert_client_may_reach(uuid,text)'::regprocedure])::oid
    union
    select p2.oid
      from walk w join pg_proc p on p.oid = w.fn
      cross join lateral regexp_matches(regexp_replace(p.prosrc, '''[^'']*''|--[^\n]*', '', 'g'),
                                        '\m(custom|iam|platform)\.([a-z_][a-z0-9_]*)\s*\(', 'g') m
      join pg_namespace ns on ns.nspname = m[1]
      join pg_proc p2 on p2.pronamespace = ns.oid and p2.proname = m[2]
     where p2.proname !~ '^(memo_|knob_)'
  ), named(rel) as (
    select distinct c.oid
      from walk w join pg_proc p on p.oid = w.fn
      cross join lateral regexp_matches(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'),
                                        '\m(custom|iam|platform)\.([a-z_][a-z0-9_]*)\M(?!\s*\()', 'g') m
      join pg_namespace ns on ns.nspname = m[1]
      join pg_class c on c.relnamespace = ns.oid and c.relname = m[2] and c.relkind in ('r','p','v')
  ), base(rel) as (
    select rel from named
    union
    select d.refobjid from base b
      join pg_class v on v.oid = b.rel and v.relkind = 'v'
      join pg_rewrite rw on rw.ev_class = v.oid
      join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = rw.oid
                      and d.refclassid = 'pg_class'::regclass and d.refobjid <> v.oid
      join pg_class t on t.oid = d.refobjid and t.relkind in ('r','p','v')
      join pg_namespace tn on tn.oid = t.relnamespace and tn.nspname in ('custom','iam','platform')
  )
  select array_agg(c.oid::regclass::text order by 1) into v_missing
    from base b join pg_class c on c.oid = b.rel
   where c.relkind in ('r','p')
     and not (c.oid::regclass::text = any (v_declared))
     and not exists (select 1 from pg_trigger t join pg_proc f on f.oid = t.tgfoid
                      where t.tgrelid = c.oid and f.proname = 'memo_bump')
     and c.oid::regclass::text <> all (array[
       -- derived, never the authority: written only from platform.associations (whose writes
       -- already empty the memo) and served only when its epoch stamp is current.
       'custom.visibility_cache'
     ]);

  if not ('iam.permissions' = any (coalesce(v_missing, '{}'))) then
    raise exception 'RED 2 FAILED TO GO RED: with iam.permissions taken off the declared list the derived census named %', coalesce(v_missing::text, 'nothing');
  end if;
  raise notice 'RED 2 RED AS REQUIRED — the derived census names %', v_missing;
end $t$;
rollback;

-- ══════════════════════════════════════ TEARDOWN
begin;
set local statement_timeout = '60s';
set local lock_timeout = '10s';
select set_config('app.actor_system', 'campaign-test/sharerevoke', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from iam.content_lane where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id = :ORG);
delete from platform.associations where organization_id = :ORG;
delete from custom.record where organization_id = :ORG;
delete from custom.field  where organization_id = :ORG;
delete from custom.io_outbox where organization_id = :ORG;
delete from custom.io_comment where organization_id = :ORG;
delete from custom.record_alias where organization_id = :ORG;
delete from custom.visibility_epoch where organization_id = :ORG;
delete from custom.organization_visibility_version where organization_id = :ORG;
delete from history.row_versions where organization_id = :ORG;
delete from history.migration_log where organization_id = :ORG;
delete from platform.knob_override where organization_id = :ORG;
delete from iam.memberships where organization_id = :ORG;
delete from iam.organizations where id = :ORG;
commit;

do $t$
declare v_n integer;
begin
  select count(*) into v_n from custom.record where organization_id = '5ae70000-0000-4a00-8b00-000000000001';
  if v_n <> 0 then raise exception 'TEARDOWN FAILED: % record(s) left behind', v_n; end if;
  raise notice 'TEARDOWN PASSED — nothing left behind.';
  raise notice 'ALL RED CLAUSES RED AS REQUIRED';
end $t$;
