-- SCOPES-HANDOFF-BUDGET — THE GREEN SUITE AND THE TIMING GATE (lane SCOPES-HANDOFF-BUDGET, 2026-09-28).
--
-- What it proves, in the order it proves it:
--   1  IDENTICAL OUTPUT. custom.resolve_context is asked, for admin@admin.com and test@test.com, for
--      EVERY live scope type of EVERY organization with every live scope of it (the parity sweep's
--      own selection, aidream matrx_records.movers.context_follow.every_scope_type, handed exactly as
--      the sweep hands it: the scopes as the selection, the type as the active Table, no System
--      item) plus the fixture's turns (a conversation TAGGED with a record, a selection that mixes
--      the fixture with one live id of every other kind where_id_opens knows, the active Tables
--      alone, the platform's default System items) — first with the bodies live before the file
--      (the inverse, \i'd, when the up is already live), then with the file's, in one transaction
--      over the same rows. Every (seat, turn) answer, less its clock (`resolved_at`), must be
--      byte-identical. So must custom.read_record (both key shapes, both seats) on every record that
--      keeps merge alternates or retired values, every merged id and 300 live records; and
--      custom.visibility_ancestors (the carrying walk) on 300 live records and every fixture record.
--   2  THE ORACLE, id by id: custom.levels_of(person, ids) under the file's body equals
--      {l: custom.effective_level, s: custom.has_visibility at viewer} asked of every id on its own,
--      for both seats, over every live scope record, the fixture and 400 live records drawn from
--      every organization. This is the clause that guards the one narrowed rule (an association
--      that TARGETS a record names it only when it is a carrying arm read from that side).
--   3  THE BUDGET (the plan's step 0.4): over the parity sweep's scope set, as admin@admin.com, the
--      warm time of custom.resolve_context summed over every type is at most 1.5 x the warm time of
--      public.resolve_full_context for the same scopes — AND the bodies live before the file miss
--      it (the gate is seen failing at today's bodies in the same run). "Warm" = the second of two
--      calls in the transaction, so neither side pays its plan-cache compile.
--
-- PLANT (the guard must be seen failing): `-v plant=named` — levels_of forgets that a carrying
-- association TARGETING a record names it (every targeting association is ignored), so a record
-- carried by a `references` edge from a record shared by name is answered with its class — goes red
-- at clause 2 (clause 1 reports its own red and goes on: the leasing agent's turn loses the cage). `-v plant=budget`
-- runs clause 3 against a budget of 0.1 x, which the file's bodies cannot meet. With no plant every
-- clause is green.
--
-- THE USE CASE (owner law, 2026-09-21: no fake test data): a property manager's unit book. Units
-- carry a restricted Gate code; the leasing agent (test@test.com) is shared ONE unit by name, and the
-- unit's storage cage is carried to her by the unit's `references` edge (the cage record is
-- referenced from the unit); a second storage cage nobody references stays closed to her. An agent
-- working a conversation tagged with the cage is handed its context.
--
-- Run (from matrx-frontend): psql -f scripts/campaign-tests/scopeshandoffbudget_green.sql   (dev clone)
--   about 10 minutes: clause 3 times the pre-lane bodies too, and they are the slow ones.
\set ON_ERROR_STOP on
\set suite 'scopeshandoffbudget_green.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\if :{?plant}
\else
\set plant none
\endif
-- REPEATABLE READ: the dev clone is shared with other lanes (a copy may land while this runs), and
-- the old bodies and the file's must be asked about the same rows.
begin isolation level repeatable read;
set local statement_timeout = 0;
-- the clone's 10-minute transaction_timeout would end this run midway (the old bodies alone take ~5).
set local transaction_timeout = 0;
set local lock_timeout = '10s';

create temp table shb (k text primary key, v uuid) on commit drop;
create temp table shb_out (tag text, seat text, turn text, digest text, len int, admitted int) on commit drop;
create temp table shb_time (tag text, type_id uuid, n int, old_ms numeric, new_ms numeric) on commit drop;
grant select on shb to authenticated;
grant select, insert on shb_out, shb_time to authenticated;

-- ══ THE FIXTURE ══════════════════════════════════════════════════════════════════════════════
do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_agent   constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org uuid := gen_random_uuid();
  v_home uuid; v_units uuid; v_cages uuid; v_id uuid; v_def jsonb; v_conv uuid := gen_random_uuid();
begin
  perform set_config('app.actor_system', 'campaign-test/scopeshandoffbudget', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Harborview Property Management ' || substr(v_org::text, 1, 8),
            'harborview-shb-' || substr(v_org::text, 1, 8), 'HPM', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_agent, 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',            'organization', v_org, v_org, 'true'::jsonb, 'scopeshandoffbudget fixture'),
    ('custom', 'member_default_visibility', 'organization', v_org, v_org, '"shared_only"'::jsonb, 'scopeshandoffbudget fixture: the leasing agent sees what she is shared');

  v_def := jsonb_build_object('type', 'entity', 'display', 'list', 'weight', 'light', 'ordered', true,
    'row_order', 'sorted', 'default_sort', jsonb_build_array(jsonb_build_object('field', 'created_at', 'direction', 'asc')),
    'agent_writable', true, 'retention_days', 3650);

  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;
  v_units := custom.table_declare(v_org, v_def || jsonb_build_object(
    'name', 'Units', 'slug', 'units', 'label_singular', 'Unit', 'label_plural', 'Units',
    'title_field', 'unit', 'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'unit'))));
  v_cages := custom.table_declare(v_org, v_def || jsonb_build_object(
    'name', 'Storage cages', 'slug', 'storage_cages', 'label_singular', 'Storage cage', 'label_plural', 'Storage cages',
    'title_field', 'cage', 'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'cage'))));
  perform custom.field_declare(v_org, v_units, jsonb_build_object('key', 'unit', 'label', 'Unit', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_units, jsonb_build_object('key', 'bedrooms', 'label', 'Bedrooms', 'type', 'number', 'sort', 20));
  perform custom.field_declare(v_org, v_units, jsonb_build_object('key', 'gate_code', 'label', 'Gate code', 'type', 'text', 'sort', 30, 'sensitivity', 'restricted'));
  perform custom.field_declare(v_org, v_cages, jsonb_build_object('key', 'cage', 'label', 'Cage', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_cages, jsonb_build_object('key', 'size', 'label', 'Size', 'type', 'text', 'sort', 20));

  v_id := custom.record_write(v_org, v_units, jsonb_build_object('unit', 'Unit 4B', 'bedrooms', 2, 'gate_code', '4417#'));
  insert into shb values ('unit_4b', v_id);
  v_id := custom.record_write(v_org, v_units, jsonb_build_object('unit', 'Unit 7A', 'bedrooms', 3, 'gate_code', '9020#'));
  insert into shb values ('unit_7a', v_id);
  v_id := custom.record_write(v_org, v_cages, jsonb_build_object('cage', 'Cage 12', 'size', '5 x 8 ft'));
  insert into shb values ('cage_12', v_id);
  v_id := custom.record_write(v_org, v_cages, jsonb_build_object('cage', 'Cage 19', 'size', '5 x 5 ft'));
  insert into shb values ('cage_19', v_id);

  -- the leasing agent is shared Unit 4B by name; Unit 4B references Cage 12, which carries it to her
  perform custom.share_grant(v_org, (select v from shb where k = 'unit_4b'), 'person', c_agent, 'viewer'::public.permission_level);
  insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, role, created_by)
  values ('record', (select v from shb where k = 'unit_4b'), 'record', (select v from shb where k = 'cage_12'), v_org, 'references', c_admin);
  -- a conversation tagged with Cage 12 and with Cage 19 (a context tag: the scope is the container)
  insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, role, created_by)
  values ('conversation', v_conv, 'record', (select v from shb where k = 'cage_12'), v_org, 'context_tag', c_admin),
         ('conversation', v_conv, 'record', (select v from shb where k = 'cage_19'), v_org, 'context_tag', c_admin);

  insert into shb values ('org', v_org), ('units', v_units), ('cages', v_cages), ('conv', v_conv);
end
$fixture$;

-- ══ THE PARITY SWEEP'S SELECTION (every_scope_type, verbatim) ═══════════════════════════════
create temp table shb_types on commit drop as
select st.organization_id as org, o.name as org_name, st.id as type_id, st.label_plural as type_name,
       coalesce(array_agg(s.id order by s.name, s.id) filter (where s.id is not null), '{}') as scope_ids
  from context.scope_types st
  join iam.organizations o on o.id = st.organization_id
  left join context.scopes s on s.scope_type_id = st.id and s.deleted_at is null
 where st.deleted_at is null
 group by 1, 2, 3, 4;
grant select on shb_types to authenticated;
select count(*) as scope_types, sum(cardinality(scope_ids)) as scopes, max(cardinality(scope_ids)) as largest from shb_types;

-- ══ ONE LIVE ID OF EVERY OTHER KIND custom.where_id_opens KNOWS ═════════════════════════════
create temp table shb_kinds (kind text, id uuid) on commit drop;
insert into shb_kinds
select 'merged', (select a.old_id from custom.record_alias a where a.revoked_at is null order by a.old_id limit 1)
union all select 'form', (select f.id from custom.anon_form f where not coalesce(f.presentation ? 'booking', false) order by f.id limit 1)
union all select 'booking', (select f.id from custom.anon_form f where coalesce(f.presentation ? 'booking', false) order by f.id limit 1)
union all select 'portal', (select p.id from custom.portal p order by p.id limit 1)
union all select 'rendered_document', (select d.id from custom.doc_render d order by d.id limit 1)
union all select 'dashboard', (select r.id from custom.record r where r.table_id = custom.presentation_kernel_id() and r.data_class = custom.dashboard_class() order by r.id limit 1)
union all select 'digest', (select r.id from custom.record r where r.data_class = 'rule' and r.data ? 'subscription' order by r.id limit 1)
union all select 'field', (select r.id from custom.record r where r.table_id = custom.field_kernel_id() and r.organization_id = (select v from shb where k = 'org') order by r.id limit 1)
union all select 'no_table', (select r.id from custom.record r where r.table_id is null and r.organization_id = (select v from shb where k = 'org') order by r.id limit 1)
union all select 'nobody', '00000000-0000-4000-8000-0000000fee02'::uuid;
grant select on shb_kinds to authenticated;

-- ══ THE READ DOOR'S AND THE WALK'S SAMPLE ═══════════════════════════════════════════════════
create temp table shb_reads (org uuid, id uuid) on commit drop;
insert into shb_reads
select x.organization_id, x.id from custom.record x
 where x.deleted_at is null and x.data_class = 'record'
   and (x.data ? '_retired' or x.data -> '_values' @? '$.*.alternates')
union
select a.organization_id, a.old_id from custom.record_alias a where a.revoked_at is null
union
select y.organization_id, y.id from (select r.organization_id, r.id from custom.record r tablesample system (2)
                                      where r.data_class = 'record' and r.deleted_at is null limit 300) y
union
select (select v from shb where k = 'org'), v from shb where k in ('unit_4b', 'unit_7a', 'cage_12', 'cage_19');
grant select on shb_reads to authenticated;
create temp table shb_walk on commit drop as
select y.id from (select r.id from custom.record r tablesample system (2)
                   where r.deleted_at is null limit 300) y
union select v from shb where k in ('unit_4b', 'unit_7a', 'cage_12', 'cage_19', 'units', 'cages');
select (select count(*) from shb_reads) as read_door_sample, (select count(*) from shb_walk) as walk_sample;

create function pg_temp.shb_try(p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  execute p_sql into v;
  return v - 'resolved_at';
exception when others then
  return jsonb_build_object('refused', sqlstate, 'says', sqlerrm);
end $$;
grant execute on function pg_temp.shb_try(text) to authenticated;

-- ══ THE DUMP (clause 1) AND THE CLOCK (clause 3), under a tag ═══════════════════════════════
create function pg_temp.shb_dump(p_tag text) returns int language plpgsql as $dump$
declare
  c_seats constant jsonb := jsonb_build_object(
    'admin', '87a6e699-3622-4869-8843-d0867456c0dd',
    'member', '4060701e-706a-4c76-b3ca-0bbc69fa5a14');
  c_ctx constant uuid := '00000000-0000-4000-8000-0000000c0de2';
  v_boss text := current_user;
  v_seat text; v_uid uuid; t record; v_j jsonb; v_n int := 0;
  v_fix uuid[]; v_kinds uuid[]; v_tables uuid[];
  v_t0 timestamptz; v_old numeric; v_new numeric; i int;
  procedure_note text;
begin
  select array_agg(v order by k) into v_fix from shb where k in ('unit_4b', 'unit_7a', 'cage_12', 'cage_19');
  select array_agg(id order by kind) into v_kinds from shb_kinds where id is not null;
  v_tables := array[(select v from shb where k = 'units'), (select v from shb where k = 'cages')] || v_kinds;

  for v_seat in select * from jsonb_object_keys(c_seats) order by 1 loop
    v_uid := (c_seats ->> v_seat)::uuid;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

    -- the fixture's turns
    perform set_config('role', 'authenticated', true);
    for procedure_note, v_j in
      select 'tagged conversation', pg_temp.shb_try(format('select custom.resolve_context(%L, %L::uuid, null, null, %L::text[])', 'conversation', (select v from shb where k = 'conv'), '{}'))
      union all select 'fixture + every other kind + active Tables', pg_temp.shb_try(format('select custom.resolve_context(%L, %L::uuid, %L::uuid[], %L::uuid[], %L::text[])', 'conversation', c_ctx, v_fix || v_kinds || v_fix, v_tables, '{}'))
      union all select 'active Tables only', pg_temp.shb_try(format('select custom.resolve_context(%L, %L::uuid, null, %L::uuid[], %L::text[])', 'conversation', c_ctx, v_tables, '{}'))
      union all select 'fixture, the default System items', pg_temp.shb_try(format('select custom.resolve_context(%L, %L::uuid, %L::uuid[], null, null)', 'conversation', c_ctx, v_fix))
    loop
      insert into shb_out values (p_tag, v_seat, procedure_note, md5(v_j::text), length(v_j::text),
        (select count(*) from jsonb_array_elements(coalesce(v_j -> 'checks', '[]'::jsonb)) x where (x ->> 'admitted')::boolean));
      v_n := v_n + 1;
    end loop;

    -- the read door, both key shapes
    for t in select * from shb_reads order by id loop
      for i in 0..1 loop
        v_j := pg_temp.shb_try(format('select custom.read_record(%L::uuid, %L::uuid, %L::boolean)', t.org, t.id, i = 1));
        insert into shb_out values (p_tag, v_seat, 'read_record/' || t.id || '/' || i, md5(coalesce(v_j::text, '<null>')), length(v_j::text), 0);
        v_n := v_n + 1;
      end loop;
    end loop;

    -- the sweep: every type, the second (warm) call timed on both sides
    for t in select * from shb_types order by cardinality(scope_ids), type_id loop
      for i in 1..2 loop
        perform set_config('role', v_boss, true);
        v_t0 := clock_timestamp();
        perform public.resolve_full_context(v_uid, 'conversation', c_ctx, t.scope_ids, '{}'::text[]);
        v_old := extract(epoch from clock_timestamp() - v_t0) * 1000;
        perform set_config('role', 'authenticated', true);
        v_t0 := clock_timestamp();
        v_j := pg_temp.shb_try(format('select custom.resolve_context(%L, %L::uuid, %L::uuid[], %L::uuid[], %L::text[])',
                                      'conversation', c_ctx, t.scope_ids, array[t.type_id], '{}'));
        v_new := extract(epoch from clock_timestamp() - v_t0) * 1000;
      end loop;
      perform set_config('role', v_boss, true);
      insert into shb_out values (p_tag, v_seat, 'type/' || t.type_id, md5(v_j::text), length(v_j::text),
        (select count(*) from jsonb_array_elements(coalesce(v_j -> 'checks', '[]'::jsonb)) x where (x ->> 'admitted')::boolean));
      if v_seat = 'admin' then
        insert into shb_time values (p_tag, t.type_id, cardinality(t.scope_ids), v_old, v_new);
      end if;
      v_n := v_n + 1;
    end loop;
    perform set_config('role', v_boss, true);
  end loop;

  -- the carrying walk (seat-free)
  for t in select * from shb_walk order by id loop
    insert into shb_out
    select p_tag, '-', 'visibility_ancestors/' || t.id,
           md5(coalesce(string_agg(a.container_type || ':' || a.container_id || ':' || a.depth || ':' || a.max_level, ','
                                   order by a.container_type, a.container_id), '<none>')), 0, 0
      from custom.visibility_ancestors('record', t.id) a;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $dump$;

-- ══ 1. THE BODIES LIVE BEFORE THE FILE, THEN THE FILE'S ═════════════════════════════════════
select position('SCOPES-HANDOFF-BUDGET' in prosrc) > 0 as up_is_live
  from pg_proc where oid = 'custom.resolve_context(text, uuid, uuid[], uuid[], text[])'::regprocedure \gset
\if :up_is_live
\echo 'the up is live on this database: the inverse is \\i''d first, so "old" is the body the file replaced'
\i migrations/inverse/scopeshandoffbudget_the_agent_handoff_reads_a_scope_type_in_one_pass_down.sql
\endif
select 'dumped and timed (old bodies)' as step, pg_temp.shb_dump('old') as answers;
\i migrations/campaign/scopeshandoffbudget_the_agent_handoff_reads_a_scope_type_in_one_pass.sql

select :'plant' = 'named' as plant_named, set_config('shb.plant', :'plant', true) as plant \gset
\if :plant_named
-- PLANT: every association that targets a record is ignored by the naming test.
do $plant$
declare
  v text := pg_get_functiondef('custom.levels_of(uuid, uuid[])'::regprocedure);
  c_arm constant text := 'where a.deleted_at is null and a.target_type = ''record'' and a.target_id = u.id';
begin
  if position(c_arm in v) = 0 then
    raise exception 'plant: the line it replaces is not in the body';
  end if;
  execute replace(v, c_arm, c_arm || ' and false');
end $plant$;
\echo 'PLANT named: levels_of ignores every association that targets a record'
\endif

select 'dumped and timed (the file''s bodies)' as step, pg_temp.shb_dump('new') as answers;

-- ── clause 1 ──
select o.seat, o.turn, o.digest as old_digest, n.digest as new_digest, o.admitted as old_admitted, n.admitted as new_admitted
  from shb_out o join shb_out n on n.tag = 'new' and n.seat = o.seat and n.turn = o.turn
 where o.tag = 'old' and o.digest <> n.digest
 order by 1, 2 limit 20;
do $c1$
declare v_diff int; v_all int;
begin
  select count(*) filter (where o.digest <> n.digest), count(*) into v_diff, v_all
    from shb_out o join shb_out n on n.tag = 'new' and n.seat = o.seat and n.turn = o.turn
   where o.tag = 'old';
  if v_all = 0 or v_all <> (select count(*) from shb_out where tag = 'old') then
    raise exception 'clause 1 RED: % answers paired of % dumped', v_all, (select count(*) from shb_out where tag = 'old');
  end if;
  if v_diff > 0 and current_setting('shb.plant') = 'named' then
    raise notice 'clause 1 RED (planted): % of % answers moved — going on to clause 2, which must refuse too', v_diff, v_all;
  elsif v_diff > 0 then
    raise exception 'clause 1 RED: % of % answers moved between the old bodies and the file''s', v_diff, v_all;
  else
    raise notice 'clause 1 GREEN: % answers byte-identical (2 seats: % scope types, the fixture''s turns, % read_record pairs; % carrying walks)', v_all,
      (select count(*) from shb_types), (select count(*) from shb_reads), (select count(*) from shb_walk);
  end if;
end $c1$;

-- ══ 2. THE ORACLE: levels_of against the ladder asked id by id ══════════════════════════════
create temp table shb_ids on commit drop as
select s.id from context.scopes s where s.deleted_at is null
union select v from shb where k in ('unit_4b', 'unit_7a', 'cage_12', 'cage_19')
union select x.id from (select r.id from custom.record r tablesample system (1)
                         where r.data_class = 'record' and r.deleted_at is null limit 400) x;
select count(*) as oracle_ids from shb_ids;
do $c2$
declare
  c_seats constant uuid[] := array['87a6e699-3622-4869-8843-d0867456c0dd', '4060701e-706a-4c76-b3ca-0bbc69fa5a14']::uuid[];
  v_uid uuid; v_set jsonb; v_bad int := 0; v_n int := 0; v_first text; r record;
begin
  foreach v_uid in array c_seats loop
    v_set := custom.levels_of(v_uid, (select array_agg(id) from shb_ids));
    for r in select i.id, x.organization_id from shb_ids i left join custom.record x on x.id = i.id loop
      v_n := v_n + 1;
      if (v_set -> r.id::text) is distinct from jsonb_build_object(
            'l', custom.effective_level(v_uid, r.organization_id, r.id),
            's', custom.has_visibility(v_uid, 'record', r.id, 'viewer'::public.permission_level)) then
        v_bad := v_bad + 1;
        v_first := coalesce(v_first, v_uid || ' / ' || r.id || ': set ' || coalesce((v_set -> r.id::text)::text, 'absent'));
      end if;
    end loop;
  end loop;
  if v_bad > 0 then
    raise exception 'clause 2 RED: levels_of differs from the ladder on % of % (seat, id) pairs; first: %', v_bad, v_n, v_first;
  end if;
  raise notice 'clause 2 GREEN: levels_of = the ladder id by id on % (seat, id) pairs', v_n;
end $c2$;

-- ══ 3. THE BUDGET ═══════════════════════════════════════════════════════════════════════════
select tag, count(*) as types, round(sum(old_ms)) as resolve_full_context_ms, round(sum(new_ms)) as resolve_context_ms,
       round(sum(new_ms) / nullif(sum(old_ms), 0), 2) as ratio,
       round(percentile_cont(0.5) within group (order by new_ms / nullif(old_ms, 0))::numeric, 2) as median_type_ratio
  from shb_time group by tag order by tag desc;
select t.n as scopes, round(t.old_ms, 1) as old_ms, round(t.new_ms, 1) as new_ms, round(t.new_ms / nullif(t.old_ms, 0), 2) as ratio,
       y.org_name, y.type_name
  from shb_time t join shb_types y using (type_id)
 where t.tag = 'new' order by t.n desc limit 12;
select set_config('shb.budget', case when :'plant' = 'budget' then '0.1' else '1.5' end, true) as budget;
do $c3$
declare
  c_budget constant numeric := current_setting('shb.budget')::numeric;
  v_new numeric; v_old numeric;
begin
  select sum(new_ms) / nullif(sum(old_ms), 0) into v_new from shb_time where tag = 'new';
  select sum(new_ms) / nullif(sum(old_ms), 0) into v_old from shb_time where tag = 'old';
  if v_old is null or v_new is null then
    raise exception 'clause 3 NOT MEASURED: no timings were taken';
  end if;
  if v_old <= c_budget then
    raise exception 'clause 3 RED: the bodies live before the file already meet % x (% x) — the gate proves nothing', c_budget, round(v_old, 2);
  end if;
  if v_new > c_budget then
    raise exception 'clause 3 RED: custom.resolve_context takes % x public.resolve_full_context over the sweep''s scope set; the budget is % x', round(v_new, 2), c_budget;
  end if;
  raise notice 'clause 3 GREEN: % x with the file''s bodies (budget % x); the bodies before it take % x', round(v_new, 2), c_budget, round(v_old, 2);
end $c3$;

\echo 'scopeshandoffbudget_green: ALL GREEN'
rollback;
