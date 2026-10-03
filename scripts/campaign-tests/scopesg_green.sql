-- SCOPES-G — THE AGENT HAND-OFF: SAME ANSWER FOR EVERY SEAT, AND A FIELD AN AGENT MAY NEVER SEE IS ABSENT
-- (lane 9 SCOPES-ON-THE-STORE, sublane G, 2026-10-03). Dev clone only. Read-only for live rows: every
-- write is the fixture's, inside this one transaction, rolled back at the end.
--
-- What it proves:
--   1  IDENTICAL OUTPUT. custom.resolve_context is asked, for EVERY person holding an active
--      membership in a live organization with a live scope type, for every such type of theirs with
--      every live scope of it (the parity sweep's turn: the scopes as the selection, the type as the
--      active Table, no System item) — and, for admin@admin.com and test@test.com, the fixture's turns
--      in every argument shape the body branches on (a tagged conversation; the selection with the
--      platform's default System items (NULL); named System items and an active Table; an EMPTY list
--      of active Tables and of System items, the shape aidream sends; active Tables alone) — first
--      under the body the file replaced (the inverse, \i'd), then under the file's, over the same rows
--      (REPEATABLE READ). Every answer, less its clock (`resolved_at`), must be byte-identical.
--   2  NEVER MEANS NEVER. A Field whose context policy is `exclude` (the store's word for the scope
--      screens' "never", custom._ctx_word) is absent from the whole answer — its key, its Field id and
--      its value — while the same record's other Field arrives (the clause is not vacuous), and the
--      store refuses the literal word `never` on a Field so nothing can be kept under a word the
--      hand-off does not read. Over every seat's live answers: no cell is a cell of an `exclude`
--      Field, and the count of (admitted record, `exclude` Field holding a value) pairs it checked is
--      printed (> 0 or the census is NOT MEASURED).
--
-- PLANT (each must be seen failing): `-v plant=never` — the file's body with the policy filter
-- deleted (an agent is handed what the policy says it never sees): clause 2 RED. `-v plant=order` —
-- the file's body reading each Field's records in reverse name order: clause 1 RED. No plant: every clause GREEN.
--
-- THE USE CASE (owner law, 2026-09-21: no fake test data): a physical-therapy clinic's treatment
-- plans. A plan carries its goal and visits per week for the agent that drafts the patient's home
-- exercise sheet; the clinic's billing note on the same plan is set so no agent ever reads it.
--
-- Run (from matrx-frontend): psql -f scripts/campaign-tests/scopesg_green.sql [-v plant=never|order]   (dev clone, ~15 min)
-- The budget is timed apart, one statement per call: scripts/campaign-tests/scopesg_timing.ts.
\set ON_ERROR_STOP on
\set suite 'scopesg_green.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
\if :{?plant}
\else
\set plant none
\endif
begin isolation level repeatable read;
set local statement_timeout = 0;
set local transaction_timeout = 0;
set local lock_timeout = '10s';
select set_config('sg.plant', :'plant', true) as plant;

create temp table sg (k text primary key, v uuid) on commit drop;
create temp table sg_out (tag text, seat uuid, turn text, digest text, admitted uuid[], cell_items text[], answer text) on commit drop;
grant select on sg to authenticated;

-- ══ THE FIXTURE ══════════════════════════════════════════════════════════════════════════════
do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_member  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  v_org uuid := gen_random_uuid();
  v_home uuid; v_plans uuid; v_id uuid; v_def jsonb; v_conv uuid := gen_random_uuid(); v_refused text;
begin
  perform set_config('app.actor_system', 'campaign-test/scopesg', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Cedar Ridge Physical Therapy ' || substr(v_org::text, 1, 8),
            'cedar-ridge-pt-sg-' || substr(v_org::text, 1, 8), 'CRPT', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin,  'owner',  'active'),
    (v_org, 'organization', v_org, c_member, 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'scopesg fixture');

  v_def := jsonb_build_object('type', 'entity', 'display', 'list', 'weight', 'light', 'ordered', true,
    'row_order', 'sorted', 'default_sort', jsonb_build_array(jsonb_build_object('field', 'created_at', 'direction', 'asc')),
    'agent_writable', true, 'retention_days', 3650);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;
  v_plans := custom.table_declare(v_org, v_def || jsonb_build_object(
    'name', 'Treatment plans', 'slug', 'treatment_plans', 'label_singular', 'Treatment plan', 'label_plural', 'Treatment plans',
    'title_field', 'plan', 'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'plan'))));
  perform custom.field_declare(v_org, v_plans, jsonb_build_object('key', 'plan', 'label', 'Plan', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_plans, jsonb_build_object('key', 'goal', 'label', 'Goal', 'type', 'text', 'sort', 20));
  perform custom.field_declare(v_org, v_plans, jsonb_build_object('key', 'visits_per_week', 'label', 'Visits per week', 'type', 'number', 'sort', 20));
  perform custom.field_declare(v_org, v_plans, jsonb_build_object('key', 'billing_note', 'label', 'Billing note', 'type', 'text', 'sort', 30,
                                                                 'context_policy', 'exclude'));
  -- the literal word "never" is refused on a Field (the copy folds it to `exclude`, custom._ctx_word)
  begin
    perform custom.field_declare(v_org, v_plans, jsonb_build_object('key', 'insurance_member_id', 'label', 'Insurance member ID',
                                                                   'type', 'text', 'sort', 40, 'context_policy', 'never'));
    v_refused := null;
  exception when others then
    v_refused := sqlstate;
  end;
  if v_refused is null then
    raise exception 'clause 2 RED: a Field was kept with context_policy "never", a word custom.resolve_context does not read';
  end if;

  v_id := custom.record_write(v_org, v_plans, jsonb_build_object('plan', 'Post-op ACL rehab, phase 2',
            'goal', 'Full knee extension and single-leg squat to 60 degrees by week 8', 'visits_per_week', 2,
            'billing_note', 'Workers comp claim 44-1187 pending adjuster approval; do not bill patient'));
  insert into sg values ('plan_acl', v_id);
  v_id := custom.record_write(v_org, v_plans, jsonb_build_object('plan', 'Rotator cuff strengthening',
            'goal', 'Overhead reach without pain, 4 of 5 strength in external rotation', 'visits_per_week', 3,
            'billing_note', 'Self-pay at the clinic rate; 12-visit package prepaid'));
  insert into sg values ('plan_cuff', v_id);
  -- the member therapist is shared the ACL plan by name
  perform custom.share_grant(v_org, (select v from sg where k = 'plan_acl'), 'person', c_member, 'viewer'::public.permission_level);
  insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, role, created_by)
  values ('conversation', v_conv, 'record', (select v from sg where k = 'plan_acl'), v_org, 'context_tag', c_admin),
         ('conversation', v_conv, 'record', (select v from sg where k = 'plan_cuff'), v_org, 'context_tag', c_admin);
  insert into sg values ('org', v_org), ('plans', v_plans), ('conv', v_conv),
    ('billing_note', (select r.id from custom.record r where r.organization_id = v_org and r.table_id = custom.field_kernel_id()
                        and r.data ->> 'entity_definition_id' = v_plans::text and r.data ->> 'key' = 'billing_note')),
    ('goal', (select r.id from custom.record r where r.organization_id = v_org and r.table_id = custom.field_kernel_id()
                and r.data ->> 'entity_definition_id' = v_plans::text and r.data ->> 'key' = 'goal'));
  if (select v from sg where k = 'billing_note') is null then
    raise exception 'fixture: the billing note Field was not declared';
  end if;
end
$fixture$;

-- ══ EVERY SEAT WITH SCOPES, AND EVERY TYPE OF THEIRS (the parity sweep's turn) ═════════════════
create temp table sg_turns on commit drop as
select m.user_id as seat, st.id as type_id,
       coalesce(array_agg(s.id order by s.name, s.id) filter (where s.id is not null), '{}') as scope_ids
  from iam.memberships m
  join context.scope_types st on st.organization_id = m.organization_id and st.deleted_at is null
  join iam.organizations o on o.id = st.organization_id and o.archived_at is null
  left join context.scopes s on s.scope_type_id = st.id and s.deleted_at is null
 where m.container_type = 'organization' and m.status = 'active'
 group by 1, 2;
grant select on sg_turns to authenticated;
select count(distinct seat) as seats, count(*) as seat_types, sum(cardinality(scope_ids)) as seat_scopes from sg_turns;

create function pg_temp.sg_try(p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  execute p_sql into v;
  return v - 'resolved_at';
exception when others then
  return jsonb_build_object('refused', sqlstate, 'says', sqlerrm);
end $$;
grant execute on function pg_temp.sg_try(text) to authenticated;

create function pg_temp.sg_keep(p_tag text, p_seat uuid, p_turn text, p_j jsonb, p_whole boolean) returns void language sql as $$
  insert into sg_out values (p_tag, p_seat, p_turn, md5(p_j::text),
    array(select (x ->> 'record_id')::uuid from jsonb_array_elements(coalesce(p_j -> 'checks', '[]'::jsonb)) x where (x ->> 'admitted')::boolean),
    array(select jsonb_object_keys(coalesce(p_j -> 'cell_values', '{}'::jsonb))),
    case when p_whole then p_j::text end);
$$;

create function pg_temp.sg_dump(p_tag text) returns int language plpgsql as $dump$
declare
  c_ctx  constant uuid := '00000000-0000-4000-8000-0000000c0de3';
  c_test constant uuid[] := array['87a6e699-3622-4869-8843-d0867456c0dd', '4060701e-706a-4c76-b3ca-0bbc69fa5a14']::uuid[];
  v_boss text := current_user;
  v_fix uuid[]; v_plans uuid; v_conv uuid; v_refs text[]; v_uid uuid; t record; v_j jsonb; v_n int := 0; v_turn text;
begin
  select array[(select v from sg where k = 'plan_acl'), (select v from sg where k = 'plan_cuff')] into v_fix;
  v_plans := (select v from sg where k = 'plans');
  v_conv := (select v from sg where k = 'conv');
  select array_agg(key order by sort_order, key) into v_refs
    from (select key, sort_order from context.system_context_item where is_active and deleted_at is null order by sort_order, key limit 3) k;

  -- the fixture's turns, both test seats, every argument shape the body branches on
  foreach v_uid in array c_test loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    for v_turn, v_j in
      select 'tagged conversation, nothing named', pg_temp.sg_try(format('select custom.resolve_context(%L, %L::uuid, null, %L::uuid[], %L::text[])', 'conversation', v_conv, '{}', '{}'))
      union all select 'selection, default System items', pg_temp.sg_try(format('select custom.resolve_context(%L, %L::uuid, %L::uuid[], null, null)', 'conversation', c_ctx, v_fix))
      union all select 'selection, named System items, active Table', pg_temp.sg_try(format('select custom.resolve_context(%L, %L::uuid, %L::uuid[], %L::uuid[], %L::text[])', 'conversation', c_ctx, v_fix, array[v_plans], v_refs))
      union all select 'selection, empty lists (aidream''s shape)', pg_temp.sg_try(format('select custom.resolve_context(%L, %L::uuid, %L::uuid[], %L::uuid[], %L::text[])', 'conversation', c_ctx, v_fix, '{}', '{}'))
      union all select 'active Table only', pg_temp.sg_try(format('select custom.resolve_context(%L, %L::uuid, null, %L::uuid[], %L::text[])', 'conversation', c_ctx, array[v_plans], '{}'))
    loop
      perform set_config('role', v_boss, true);
      perform pg_temp.sg_keep(p_tag, v_uid, 'fixture/' || v_turn, v_j, true);
      perform set_config('role', 'authenticated', true);
      v_n := v_n + 1;
    end loop;
    perform set_config('role', v_boss, true);
  end loop;

  -- every seat with scopes, every type of theirs
  for t in select * from sg_turns order by seat, cardinality(scope_ids), type_id loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', t.seat, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_j := pg_temp.sg_try(format('select custom.resolve_context(%L, %L::uuid, %L::uuid[], %L::uuid[], %L::text[])',
                                 'conversation', c_ctx, t.scope_ids, array[t.type_id], '{}'));
    perform set_config('role', v_boss, true);
    perform pg_temp.sg_keep(p_tag, t.seat, 'type/' || t.type_id, v_j, false);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $dump$;

-- ══ THE BODY THE FILE REPLACED, THEN THE FILE'S ═════════════════════════════════════════════
select position('SCOPES-G:' in prosrc) > 0 as up_is_live
  from pg_proc where oid = 'custom.resolve_context(text, uuid, uuid[], uuid[], text[])'::regprocedure \gset
\if :up_is_live
\echo 'the up is live on this database: the inverse is \\i''d first, so "old" is the body the file replaced'
\i migrations/inverse/scopesg_the_agent_handoff_reads_each_tables_fields_by_its_own_key_down.sql
\endif
select 'dumped (the body the file replaced)' as step, pg_temp.sg_dump('old') as answers;
\i migrations/campaign/scopesg_the_agent_handoff_reads_each_tables_fields_by_its_own_key.sql

do $plant$
declare
  v text := pg_get_functiondef('custom.resolve_context(text, uuid, uuid[], uuid[], text[])'::regprocedure);
  c_policy constant text := E'\n       and coalesce(fr.data ->> ''context_policy'', ''include'') <> ''exclude'';';
  c_order  constant text := 'e.value ->> ''name'', e.value ->> ''record_id''';
begin
  if current_setting('sg.plant') = 'never' then
    if position(c_policy in v) = 0 then raise exception 'plant never: the line it removes is not in the body'; end if;
    execute replace(v, c_policy, ';');
    raise notice 'PLANT never: the hand-off ignores the Field context policy';
  elsif current_setting('sg.plant') = 'order' then
    if position(c_order in v) = 0 then raise exception 'plant order: the line it changes is not in the body'; end if;
    execute replace(v, c_order, 'e.value ->> ''name'' desc, e.value ->> ''record_id''');
    raise notice 'PLANT order: the hand-off reads a Field''s records in the reverse order';
  end if;
end $plant$;

select 'dumped (the file''s body)' as step, pg_temp.sg_dump('new') as answers;

-- ── clause 1 ──
select o.seat, o.turn, o.digest as old_digest, n.digest as new_digest
  from sg_out o join sg_out n on n.tag = 'new' and n.seat = o.seat and n.turn = o.turn
 where o.tag = 'old' and o.digest <> n.digest
 order by 1, 2 limit 20;
do $c1$
declare v_diff int; v_all int; v_seats int;
begin
  select count(*) filter (where o.digest <> n.digest), count(*), count(distinct o.seat) into v_diff, v_all, v_seats
    from sg_out o join sg_out n on n.tag = 'new' and n.seat = o.seat and n.turn = o.turn
   where o.tag = 'old';
  if v_all = 0 or v_all <> (select count(*) from sg_out where tag = 'old') or v_seats < 3 then
    raise exception 'clause 1 NOT MEASURED: % answers paired of % dumped over % seats', v_all, (select count(*) from sg_out where tag = 'old'), v_seats;
  end if;
  if v_diff > 0 then
    raise notice 'clause 1 RED: % of % answers moved between the body the file replaced and the file''s', v_diff, v_all;
    perform set_config('sg.red', coalesce(nullif(current_setting('sg.red', true), ''), '') || ' 1', true);
  else
    raise notice 'clause 1 GREEN: % answers byte-identical over % seats (every seat with scopes x every type of theirs, and the fixture''s 5 turn shapes x 2 test seats)', v_all, v_seats;
  end if;
end $c1$;

-- ── clause 2 ──
do $c2$
declare
  v_field uuid := (select v from sg where k = 'billing_note');
  v_goal  uuid := (select v from sg where k = 'goal');
  v_bad int; v_seen int; v_live_bad int; v_live_pairs int; v_first text;
begin
  -- the fixture: absent by key, by id and by value from every answer that admits a plan; the goal arrives
  select count(*) filter (where o.answer like '%billing_note%' or o.answer like '%' || v_field::text || '%'
                             or o.answer like '%Workers comp claim 44-1187%' or o.answer like '%12-visit package prepaid%'),
         count(*) filter (where o.answer like '%' || v_goal::text || '%' and o.answer like '%single-leg squat%')
    into v_bad, v_seen
    from sg_out o where o.tag = 'new' and o.turn like 'fixture/%' and cardinality(o.admitted) > 0;
  -- every seat's live answers: no cell of an `exclude` Field
  with ex as (select f.id::text as id from custom.record f where f.table_id = custom.field_kernel_id() and f.deleted_at is null
                and f.data ->> 'context_policy' = 'exclude')
  select count(*) into v_live_bad
    from sg_out o, unnest(o.cell_items) c(item) where o.tag = 'new' and c.item in (select id from ex);
  select min(o.seat || ' ' || o.turn) into v_first
    from sg_out o, unnest(o.cell_items) c(item)
   where o.tag = 'new' and c.item in (select f.id::text from custom.record f where f.table_id = custom.field_kernel_id()
                                        and f.deleted_at is null and f.data ->> 'context_policy' = 'exclude');
  -- the pairs that census checked: an admitted record and an `exclude` Field of its Table holding a value on it
  select count(*) into v_live_pairs
    from (select distinct a.id from sg_out o, unnest(o.admitted) a(id) where o.tag = 'new' and o.turn like 'type/%') a
    join custom.record r on r.id = a.id and r.deleted_at is null
    join custom.record f on f.organization_id = r.organization_id and f.table_id = custom.field_kernel_id() and f.deleted_at is null
                        and f.data ->> 'entity_definition_id' = r.table_id::text and f.data ->> 'context_policy' = 'exclude'
   where jsonb_typeof(r.data -> (f.data ->> 'key')) is not null and jsonb_typeof(r.data -> (f.data ->> 'key')) <> 'null';
  raise notice 'clause 2: fixture answers naming the never Field % (must be 0), naming the Goal % (must be > 0); live cells of an exclude Field % (must be 0) over % (admitted record, exclude Field with a value) pairs',
    v_bad, v_seen, v_live_bad, v_live_pairs;
  if v_seen = 0 or v_live_pairs = 0 then
    raise exception 'clause 2 NOT MEASURED: the fixture delivered no Goal (%), or no live record holds a value in an exclude Field (%)', v_seen, v_live_pairs;
  end if;
  if v_bad > 0 or v_live_bad > 0 then
    raise notice 'clause 2 RED: an agent is handed a Field whose policy says it never is (fixture %, live %; first live: %)', v_bad, v_live_bad, v_first;
    perform set_config('sg.red', coalesce(nullif(current_setting('sg.red', true), ''), '') || ' 2', true);
  else
    raise notice 'clause 2 GREEN: the never Field is absent by key, id and value; no live cell of any exclude Field';
  end if;
end $c2$;

do $verdict$
begin
  if coalesce(current_setting('sg.red', true), '') <> '' then
    raise exception 'scopesg_green: RED in clause(s)%', current_setting('sg.red');
  end if;
  raise notice 'scopesg_green: ALL GREEN';
end $verdict$;
rollback;
