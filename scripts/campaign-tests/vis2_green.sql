-- VIS-2 — THE GREEN SUITE. What an organization can now decide, asked out loud.
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/vis2_green.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/` and is
-- discovered by no sweep.
--
-- WHY IT IS NOT ONE ROLLED-BACK TRANSACTION, unlike its neighbours. Part 3 asks "who could
-- see this on a date", and history stamps every row with `now()` — the TRANSACTION timestamp.
-- Inside one transaction a grant and its revocation share a timestamp to the microsecond and
-- there is no "between" to ask about, so the whole point of the door could not be tested. So
-- this suite runs REAL transactions against two THROWAWAY organizations with fixed ids, and
-- deletes them at the end. Step 0 deletes them FIRST as well, so a run that died half way
-- through leaves nothing behind for the next one, and the last block is a CENSUS that fails
-- unless every trace is gone.
--
-- THE IDENTITIES. `admin@admin.com` owns both throwaway organizations; `test@test.com` (Dana)
-- is a plain MEMBER of the first and belongs to the second not at all. Nobody's own records
-- are touched: everything under test is created by this file inside organizations this file
-- created. It signs nobody in and reads no credential.
--
-- ITS RED TWIN is `vis2_red.sql`, which puts the pre-VIS-2 bodies back inside a rolled-back
-- transaction and proves each of these answers was unaskable or wrong before.

\set ON_ERROR_STOP on
\timing off

\set ORG_A '\'2f5e0000-0000-4a00-8a00-000000000a01\''
\set ORG_B '\'2f5e0000-0000-4a00-8a00-000000000b01\''
\set ADMIN '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA  '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''
\set GRANT   '\'2f5e0000-0000-4a00-8a00-000000009901\''

-- NO TEMP TABLE CARRIES STATE BETWEEN THESE TRANSACTIONS, and that is not a style choice:
-- this database is reached through the transaction-mode pooler, where every transaction may
-- land on a different backend and a session temp table is gone by the next BEGIN. So every
-- fixture id is FIXED below, and the moments Part 3 asks about are read back out of history
-- itself — which is more honest anyway, because they are then the database's own timestamps
-- rather than the suite's.

-- ════════════════════════════════════════════════════ STEP 0 — a clean slate, both ways
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'vis2_green_suite', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id in (:ORG_A, :ORG_B));
delete from iam.permissions where id = :GRANT;
-- every fixture id is fixed, so an orphaned grant from an aborted run would name the record
-- this run is about to recreate. The grants go first, on purpose.
delete from platform.associations where organization_id in (:ORG_A, :ORG_B);
delete from custom.record where organization_id in (:ORG_A, :ORG_B);
delete from custom.io_outbox where organization_id in (:ORG_A, :ORG_B);
delete from custom.io_comment where organization_id in (:ORG_A, :ORG_B);
delete from custom.record_alias where organization_id in (:ORG_A, :ORG_B);
delete from custom.merge_field_provenance where organization_id in (:ORG_A, :ORG_B);
delete from custom.visibility_epoch where organization_id in (:ORG_A, :ORG_B);
delete from custom.organization_visibility_version where organization_id in (:ORG_A, :ORG_B);
delete from custom.external_link where organization_id in (:ORG_A, :ORG_B);
delete from custom.external_source where organization_id in (:ORG_A, :ORG_B);

delete from history.migration_log where organization_id in (:ORG_A, :ORG_B);
delete from platform.knob_override where organization_id in (:ORG_A, :ORG_B);
delete from iam.memberships where organization_id in (:ORG_A, :ORG_B);
delete from iam.organizations where id in (:ORG_A, :ORG_B);

insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG_A, 'VIS-2 Throwaway A', 'vis2-throwaway-a', 'VAA', :ADMIN),
       (:ORG_B, 'VIS-2 Throwaway B', 'vis2-throwaway-b', 'VBB', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG_A, 'organization', :ORG_A, :ADMIN, 'owner',  'active'),
       (:ORG_A, 'organization', :ORG_A, :DANA,  'member', 'active'),
       (:ORG_B, 'organization', :ORG_B, :ADMIN, 'owner',  'active');
commit;

-- ═══════════════════════════ STEP 1 — the fixtures, in both organizations
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'vis2_green_suite', true);
do $t$
declare
  v_a constant uuid := '2f5e0000-0000-4a00-8a00-000000000a01';
  v_b constant uuid := '2f5e0000-0000-4a00-8a00-000000000b01';
  v_korg constant uuid := '11111111-0000-4000-8000-000000000004';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_hq      constant uuid := '2f5e0000-0000-4a00-8a00-000000000101';
  v_tbl_a   constant uuid := '2f5e0000-0000-4a00-8a00-000000000201';
  v_rec_a   constant uuid := '2f5e0000-0000-4a00-8a00-000000000301';
  v_child_a constant uuid := '2f5e0000-0000-4a00-8a00-000000000401';
  v_rec_b   constant uuid := '2f5e0000-0000-4a00-8a00-000000000601';
  v_hq_b    constant uuid := '2f5e0000-0000-4a00-8a00-000000000501';
  v_fld_rel constant uuid := '2f5e0000-0000-4a00-8a00-000000000701';
  v_fld_sev constant uuid := '2f5e0000-0000-4a00-8a00-000000000801';
  v_tbl uuid; v_btbl uuid;
begin
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_hq, v_a, v_korg, 'record', jsonb_build_object('name', 'VIS-2 HQ'), v_admin);

  v_tbl := custom.table_declare(v_a, jsonb_build_object(
    'name', 'Case', 'slug', 'vis2_case', 'label_singular', 'Case', 'label_plural', 'Cases',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text'),
                                jsonb_build_object('name', 'severity', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_hq::text));

  -- The Table gets a FIXED id so the later transactions need no lookup (the pooler gives this
  -- suite no session state to carry one in). Its Field records point at the old id by
  -- `entity_definition_id`, so they move with it.
  if v_tbl is distinct from v_tbl_a then
    update custom.record set id = v_tbl_a where organization_id = v_a and id = v_tbl;
    update custom.record
       set data = data || jsonb_build_object('entity_definition_id', v_tbl_a::text)
     where organization_id = v_a
       and table_id = custom.field_kernel_id()
       and (data ->> 'entity_definition_id')::uuid = v_tbl;
  end if;

  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_rec_a, v_a, v_tbl_a, 'record', jsonb_build_object('title', 'Patient 7', 'severity', '3'), v_admin);
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_child_a, v_a, v_tbl_a, 'record', jsonb_build_object('title', 'Inside Patient 7', 'parent_id', v_rec_a::text), v_admin);

  -- organization B: one Table, one record, nobody from A in it
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_hq_b, v_b, v_korg, 'record', jsonb_build_object('name', 'VIS-2 B HQ'), v_admin);
  v_btbl := custom.table_declare(v_b, jsonb_build_object(
    'name', 'Supplier', 'slug', 'vis2_supplier', 'label_singular', 'Supplier', 'label_plural', 'Suppliers',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'name', 'kind', 'text')),
    'title_field', 'name', 'parent_id', v_hq_b::text));
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values (v_rec_b, v_b, v_btbl, 'record', jsonb_build_object('name', 'Fairmont Office Supply'), v_admin);

  -- Part 4's Field: an ordinary text field, retyped later through the ordinary write door.
  insert into custom.field (id, organization_id, entity_definition_id, key, name, label, type,
                            relation_target, relation_max, on_target_delete, config,
                            source, source_config, sensitivity, context_policy,
                            rules, depends_on, applies_to_types, multi, dated, required, sort)
  values (v_fld_sev, v_a, v_tbl_a, 'severity', 'Severity', 'Severity', 'text',
          null, null, null, '{}'::jsonb,
          'manual', '{}'::jsonb, 'internal', 'include',
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, false, false, false, 10);

  -- THE RELATION Part 2 pushes across the wall: declared on A's Table, pointing at anything.
  update custom.record
     set data = jsonb_set(data, '{fields}',
                  coalesce(data -> 'fields', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('name', 'supplier')))
   where organization_id = v_a and id = v_tbl_a
     and not exists (select 1 from jsonb_array_elements(coalesce(data -> 'fields', '[]'::jsonb)) e
                      where e ->> 'name' = 'supplier');
  insert into custom.field (id, organization_id, entity_definition_id, key, name, label, type,
                            relation_target, relation_max, on_target_delete, config,
                            source, source_config, sensitivity, context_policy,
                            rules, depends_on, applies_to_types, multi, dated, required, sort)
  values (v_fld_rel, v_a, v_tbl_a, 'supplier', 'Supplier', 'Supplier', 'relation',
          v_tbl_a, 5, 'set_null',
          jsonb_build_object('target_mode', 'any', 'ordered', false, 'carries', false, 'loops', true),
          'manual', '{}'::jsonb, 'internal', 'include',
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, true, false, false, 20);
end $t$;
commit;

-- ════════════════════════════ PART 1 — MEMBER DEFAULT VISIBILITY IS THE ORGANIZATION'S
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'vis2_green_suite', true);
do $t$
declare
  v_a constant uuid := '2f5e0000-0000-4a00-8a00-000000000a01';
  v_dana constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_rec   constant uuid := '2f5e0000-0000-4a00-8a00-000000000301';
  v_child constant uuid := '2f5e0000-0000-4a00-8a00-000000000401';
  v_hq    constant uuid := '2f5e0000-0000-4a00-8a00-000000000101';
  v_ok boolean;
begin

  -- 1a — the default is today's behaviour, unchanged: a plain member sees a record
  --      somebody else created, through membership and nothing else.
  v_ok := custom.has_visibility(v_dana, 'record', v_rec, 'viewer');
  if not v_ok then raise exception '1a FAILED — with the knob unset, a member does not see the record. The default is not the old behaviour.'; end if;
  if not iam.member_lane_open(v_a) then raise exception '1a FAILED — the member lane reads shut with no override set.'; end if;

  -- 1b — the organization says "only what is shared", and the SAME reader loses it.
  --      No rebuild, no invalidation: the next read is the new answer.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom', 'member_default_visibility', 'organization', v_a, v_a, '"shared_only"'::jsonb);
  if iam.member_lane_open(v_a) then raise exception '1b FAILED — the knob is shared_only and the member lane still reads open.'; end if;
  if custom.has_visibility(v_dana, 'record', v_rec, 'viewer') then
    raise exception '1b FAILED — the organization set shared_only and the member still sees a record nobody shared with her.'; end if;
  if iam.member_default_level(v_a, null) is not null then
    raise exception '1b FAILED — membership still confers a level under shared_only.'; end if;

  -- 1c — and the arms that are NOT membership are untouched. The owner still owns it.
  if not custom.has_visibility(v_admin, 'record', v_rec, 'viewer') then
    raise exception '1c FAILED — shared_only took the record away from the person who created it.'; end if;

  -- 1d — a grant still reaches, and containment still carries from the granted record down.
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by)
  values ('record', v_rec, v_dana, 'viewer', v_admin);
  if not custom.has_visibility(v_dana, 'record', v_rec, 'viewer') then
    raise exception '1d FAILED — a direct grant does not reach under shared_only.'; end if;
  if not custom.has_visibility(v_dana, 'record', v_child, 'viewer') then
    raise exception '1d FAILED — containment does not carry under shared_only.'; end if;

  -- 1e — and a record she was NOT given stays out of reach, so 1d proved the grant and not the org.
  if custom.has_visibility(v_dana, 'record', v_hq, 'viewer') then
    raise exception '1e FAILED — a record with no grant is still reachable under shared_only.'; end if;

  -- 1f — the reverse of 1b, in the same session: the organization changes its mind and the
  --      same reader gets it back, with nothing rebuilt in between.
  delete from iam.permissions where resource_type = 'record' and resource_id = v_rec and granted_to_user_id = v_dana;
  update platform.knob_override set value = '"all_records"'::jsonb
   where feature = 'custom' and key = 'member_default_visibility' and organization_id = v_a;
  if not custom.has_visibility(v_dana, 'record', v_rec, 'viewer') then
    raise exception '1f FAILED — back on all_records, the member does not see the record again.'; end if;

  raise notice 'PART 1 PASSED (1a default, 1b shared_only, 1c owner, 1d grant+containment, 1e no free ride, 1f reversible)';
end $t$;
commit;

-- ═══════════════════════ PART 2 — A LINK ACROSS THE WALL TAKES BOTH ORGANIZATIONS (T15)
--
-- The subject is a RELATION RECORD — `data_class = 'relation'` with its `from` and `to` — which
-- is REC-26's own shape and the one `custom.assert_organization_wall` judges on every write,
-- switch or no switch. (`platform.enforce_relation_edge`, the association-edge half, carries the
-- identical rule in the identical words; it is gated behind `custom/associations_guard`, which
-- is off platform-wide today and is not this lane's to flip.)
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'vis2_green_suite', true);

create or replace function pg_temp.vis2_link(p_org uuid, p_from uuid, p_to uuid) returns void
language sql as $f$
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (p_org, '2f5e0000-0000-4a00-8a00-000000000201', 'relation',
          jsonb_build_object('from', p_from::text, 'to', p_to::text,
                             'role', 'supplier', 'kind', 'referenced', 'carrying', false),
          '87a6e699-3622-4869-8843-d0867456c0dd');
$f$;

do $t$
declare
  v_a constant uuid := '2f5e0000-0000-4a00-8a00-000000000a01';
  v_b constant uuid := '2f5e0000-0000-4a00-8a00-000000000b01';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_dana constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_tbl  constant uuid := '2f5e0000-0000-4a00-8a00-000000000201';
  v_rec  constant uuid := '2f5e0000-0000-4a00-8a00-000000000301';
  v_brec constant uuid := '2f5e0000-0000-4a00-8a00-000000000601';
  v_fld  constant uuid := '2f5e0000-0000-4a00-8a00-000000000701';
  v_card record;
begin

  -- 2a — T15 clause one, as it stands today: refused, and the Table has not allowed it.
  begin
    perform pg_temp.vis2_link(v_a, v_rec, v_brec);
    raise exception '2a FAILED — a link to another organization''s record was accepted with nothing allowing it.';
  exception when foreign_key_violation then null;
  end;

  -- 2b — the Table allows it, and it is STILL refused, because the other organization has
  --      not been asked. This is the arm that did not exist before VIS-2.
  update custom.record set data = data || jsonb_build_object('cross_organization_relations', true)
   where organization_id = v_a and id = v_tbl;
  if custom.cross_organization_links_open(v_a, v_b) then
    raise exception '2b FAILED — the wall reads open with neither organization''s knob on.'; end if;
  begin
    perform pg_temp.vis2_link(v_a, v_rec, v_brec);
    raise exception '2b FAILED — the source Table''s flag alone opened the wall; the other organization was never asked.';
  exception when foreign_key_violation then null;
  end;

  -- 2c — one side is not both sides.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom', 'cross_organization_links', 'organization', v_a, v_a, 'true'::jsonb);
  if custom.cross_organization_links_open(v_a, v_b) then
    raise exception '2c FAILED — one organization''s knob opened the wall on its own.'; end if;
  begin
    perform pg_temp.vis2_link(v_a, v_rec, v_brec);
    raise exception '2c FAILED — one organization''s knob alone let the link through.';
  exception when foreign_key_violation then null;
  end;

  -- 2d — both organizations agree, and the link is made.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom', 'cross_organization_links', 'organization', v_b, v_b, 'true'::jsonb);
  if not custom.cross_organization_links_open(v_a, v_b) then
    raise exception '2d FAILED — both organizations said yes and the wall still reads shut.'; end if;
  perform pg_temp.vis2_link(v_a, v_rec, v_brec);

  -- 2e — THE READ MASKS. Dana is a member of A and of nothing else. She may open the record
  --      in A; the foreign target comes back as existing and nothing more.
  -- Dana, read the one way the store reads a principal: the PostgREST claim.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dana)::text, true);
  select * into v_card from custom.relation_target_card(v_a, v_rec, 'supplier');
  if v_card.target_id is distinct from v_brec then
    raise exception '2e FAILED — the card did not name the foreign target (%).', v_card.target_id; end if;
  if not v_card.is_foreign then raise exception '2e FAILED — the foreign target was not reported as foreign.'; end if;
  if not v_card.masked then raise exception '2e FAILED — a foreign record nobody shared with her came back UNMASKED.'; end if;
  if v_card.card is not null then raise exception '2e FAILED — a masked card still carried the record''s values.'; end if;
  if v_card.why is null then raise exception '2e FAILED — a masked card said nothing about why.'; end if;

  -- 2f — and a real grant across the wall (VIS-23) unmasks it, to what HER membership allows.
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by)
  values ('record', v_brec, v_dana, 'viewer', v_admin);
  select * into v_card from custom.relation_target_card(v_a, v_rec, 'supplier');
  if v_card.masked then raise exception '2f FAILED — a grant across the wall did not unmask the record.'; end if;
  if v_card.card ->> 'name' is distinct from 'Fairmont Office Supply' then
    raise exception '2f FAILED — the unmasked card did not carry the record''s values (%).', v_card.card; end if;
  if v_card.reader_level is distinct from 'viewer'::public.permission_level then
    raise exception '2f FAILED — the level on the card is %, not the viewer she was granted.', v_card.reader_level; end if;

  -- 2g — shut the wall again and the same grant shows her nothing: consent is the gate, not
  --      the grant. (The grant is left in place; only the knob moves.)
  update platform.knob_override set value = 'false'::jsonb
   where feature = 'custom' and key = 'cross_organization_links' and organization_id = v_b;
  select * into v_card from custom.relation_target_card(v_a, v_rec, 'supplier');
  if not v_card.masked then raise exception '2g FAILED — the other organization withdrew and the record is still shown.'; end if;
  if v_card.target_organization_id is not null then
    raise exception '2g FAILED — with the wall shut the card still named which organization owns it.'; end if;
  update platform.knob_override set value = 'true'::jsonb
   where feature = 'custom' and key = 'cross_organization_links' and organization_id = v_b;
  perform set_config('request.jwt.claims', '', true);

  raise notice 'PART 2 PASSED (2a refused, 2b table alone is not enough, 2c one side is not both, 2d both agree, 2e masked, 2f granted, 2g withdrawn)';
end $t$;
commit;

-- ═════════════════════════════ PART 3 — WHO COULD SEE THIS ON A DATE (VIS-16 / T15)
-- Two real transactions, because history stamps a row with the TRANSACTION timestamp: the
-- grant is made in one and revoked in another, so "while it was held" is a real interval and
-- the moments come back out of history rather than being asserted by this file.
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'vis2_green_suite', true);
insert into iam.permissions (id, resource_type, resource_id, granted_to_user_id, permission_level, created_by)
values (:GRANT, 'record', '2f5e0000-0000-4a00-8a00-000000000301',
        :DANA, 'editor', :ADMIN);
commit;

begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'vis2_green_suite', true);
delete from iam.permissions where id = :GRANT;
commit;

begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'vis2_green_suite', true);
do $t$
declare
  v_a constant uuid := '2f5e0000-0000-4a00-8a00-000000000a01';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_dana constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_rec   constant uuid := '2f5e0000-0000-4a00-8a00-000000000301';
  v_grant constant uuid := '2f5e0000-0000-4a00-8a00-000000009901';
  v_t0 timestamptz; v_t1 timestamptz; v_t2 timestamptz;
  v_n integer; v_lvl public.permission_level; v_msg text;
begin
  -- the three moments, read out of history itself
  select h.occurred_at into v_t1 from history.row_versions h
   where h.entity_type = 'iam.permissions' and h.row_id = v_grant and h.operation = 'INSERT'
   order by h.id desc limit 1;
  select h.occurred_at into v_t2 from history.row_versions h
   where h.entity_type = 'iam.permissions' and h.row_id = v_grant and h.operation = 'DELETE'
   order by h.id desc limit 1;
  if v_t1 is null or v_t2 is null then
    raise exception '3 SETUP FAILED — history did not capture the grant''s insert (%) and delete (%).', v_t1, v_t2; end if;
  if v_t2 <= v_t1 then
    raise exception '3 SETUP FAILED — the two events share a timestamp, so there is no interval to ask about.'; end if;
  v_t0 := v_t1 - interval '1 second';

  -- 3a — the door exists and answers. Before VIS-2 no function in schema custom took a
  --      moment in time and returned a principal at all.
  select count(*) into v_n from custom.visibility_as_of(v_a, v_rec, v_t1);
  if v_n = 0 then raise exception '3a FAILED — the as-of door returned nobody at all for a record with an owner and a grant.'; end if;

  -- 3b — the OWNER is named at the top rung, replayed from the record as it stood.
  select level into v_lvl from custom.visibility_as_of(v_a, v_rec, v_t1)
   where principal_kind = 'user' and principal_id = v_admin and through_kind = 'ownership';
  if v_lvl is distinct from iam.top_content_level() then
    raise exception '3b FAILED — the person who created the record is not named as its owner at the top rung (got %).', v_lvl; end if;

  -- 3c — THE CLAUSE THE VERIFIER COULD NOT ASK. Dana's grant is gone from the live table;
  --      asked about the moment it was live, she is named, at the level she held.
  if exists (select 1 from iam.permissions
              where resource_type = 'record' and resource_id = v_rec
                and granted_to_user_id = v_dana and permission_level = 'editor') then
    raise exception '3c FAILED — the grant was not actually revoked, so the question is not the one being asked.'; end if;
  select level into v_lvl from custom.visibility_as_of(v_a, v_rec, v_t1)
   where principal_kind = 'user' and principal_id = v_dana and through_kind = 'grant';
  if v_lvl is distinct from 'editor'::public.permission_level then
    raise exception '3c FAILED — a principal who has SINCE LOST access is not named for the moment she held it (got %).', v_lvl; end if;

  -- 3d — and she is NOT named before it was made, nor after it was taken away.
  if exists (select 1 from custom.visibility_as_of(v_a, v_rec, v_t0)
              where principal_id = v_dana and through_kind = 'grant') then
    raise exception '3d FAILED — the grant is reported for a moment before it existed.'; end if;
  if exists (select 1 from custom.visibility_as_of(v_a, v_rec, v_t2)
              where principal_id = v_dana and through_kind = 'grant') then
    raise exception '3d FAILED — the grant is reported for a moment after it was revoked.'; end if;

  -- 3e — before history begins it REFUSES, naming the date, rather than reading the live
  --      tables and reporting today's grants as that day's.
  begin
    perform custom.visibility_as_of(v_a, v_rec, '2026-03-03 00:00:00+00'::timestamptz);
    raise exception '3e FAILED — a date before the capture window was answered instead of refused.';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    if v_msg !~ 'History for this store starts at' then
      raise exception '3e FAILED — it refused, but not with the date history starts: %', v_msg; end if;
  end;

  -- 3f — it is an ADMIN's question. Dana is a member of this organization, which gets her
  --      past the wall and no further. Asked as the role a signed-in person actually holds,
  --      because the connected role owns the store and every door lets its owner through.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dana)::text, true);
  set local role authenticated;
  begin
    perform custom.visibility_as_of(v_a, v_rec, v_t1);
    reset role;
    raise exception '3f FAILED — a plain member was allowed to ask who else could see a record.';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  raise notice 'PART 3 PASSED (3a answers, 3b owner, 3c a principal who has since lost access, 3d not before and not after, 3e refuses before history, 3f admin only)';
end $t$;
commit;

-- ═══════════════ PART 4 — A FIELD TYPE CHANGE LEAVES A MIGRATION ROW WHICHEVER DOOR IT CAME THROUGH
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'vis2_green_suite', true);
do $t$
declare
  v_a constant uuid := '2f5e0000-0000-4a00-8a00-000000000a01';
  v_tbl constant uuid := '2f5e0000-0000-4a00-8a00-000000000201';
  v_fld uuid; v_n integer; v_inv jsonb;
begin
  v_fld := '2f5e0000-0000-4a00-8a00-000000000801';
  if not exists (select 1 from custom.record where organization_id = v_a and id = v_fld) then
    raise exception '4 FAILED — the fixture Field was not found.'; end if;

  select count(*) into v_n from history.migration_log
   where organization_id = v_a and verb = 'retype' and target_kind = 'field' and target_id = v_fld;
  if v_n <> 0 then raise exception '4a FAILED — the fixture already carried a retype row.'; end if;

  -- The ORDINARY write door, not custom.migrate_retype: this is what a screen, an import and
  -- an agent all do.
  update custom.record
     set data = data || jsonb_build_object('type', 'range',
                                           'config', jsonb_build_object('kind', 'number'))
   where organization_id = v_a and id = v_fld;

  select count(*) into v_n from history.migration_log
   where organization_id = v_a and verb = 'retype' and target_kind = 'field' and target_id = v_fld;
  select m.inverse into v_inv from history.migration_log m
   where m.organization_id = v_a and m.verb = 'retype' and m.target_kind = 'field' and m.target_id = v_fld
   order by m.applied_at desc limit 1;
  if v_n <> 1 then raise exception '4b FAILED — a field type change through the ordinary write door wrote % migration row(s), not 1.', v_n; end if;
  if v_inv ->> 'kind' is distinct from 'patch' then raise exception '4b FAILED — the row carries no patch inverse (%).', v_inv; end if;
  if v_inv -> 'patch' ->> 'type' is distinct from 'text' then
    raise exception '4b FAILED — the inverse does not put the old type back (%).', v_inv; end if;

  -- and ONE row, not two, when the verb records its own first.
  perform custom.migrate_retype(v_a, v_fld, 'text', 'vis2 green suite');
  select count(*) into v_n from history.migration_log
   where organization_id = v_a and verb = 'retype' and target_kind = 'field' and target_id = v_fld;
  if v_n <> 2 then raise exception '4c FAILED — custom.migrate_retype produced % rows in total, not the 1 it records plus the 1 already there.', v_n; end if;

  raise notice 'PART 4 PASSED (4a clean, 4b the ordinary door records the retype with its inverse, 4c the verb still records exactly one)';
end $t$;
commit;

-- ════════════════════════════════════════ TEARDOWN, AND THE CENSUS THAT PROVES IT
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'vis2_green_suite', true);
delete from iam.permissions where id = :GRANT;
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id in (:ORG_A, :ORG_B));
delete from platform.associations where organization_id in (:ORG_A, :ORG_B);
delete from custom.record where organization_id in (:ORG_A, :ORG_B);
delete from custom.io_outbox where organization_id in (:ORG_A, :ORG_B);
delete from custom.io_comment where organization_id in (:ORG_A, :ORG_B);
delete from custom.record_alias where organization_id in (:ORG_A, :ORG_B);
delete from custom.merge_field_provenance where organization_id in (:ORG_A, :ORG_B);
delete from custom.visibility_epoch where organization_id in (:ORG_A, :ORG_B);
delete from custom.organization_visibility_version where organization_id in (:ORG_A, :ORG_B);
delete from custom.external_link where organization_id in (:ORG_A, :ORG_B);
delete from custom.external_source where organization_id in (:ORG_A, :ORG_B);

delete from history.migration_log where organization_id in (:ORG_A, :ORG_B);
delete from platform.knob_override where organization_id in (:ORG_A, :ORG_B);
delete from iam.memberships where organization_id in (:ORG_A, :ORG_B);
delete from iam.organizations where id in (:ORG_A, :ORG_B);
commit;

do $t$
declare v_n integer;
begin
  select (select count(*) from iam.organizations where id in ('2f5e0000-0000-4a00-8a00-000000000a01','2f5e0000-0000-4a00-8a00-000000000b01'))
       + (select count(*) from custom.record where organization_id in ('2f5e0000-0000-4a00-8a00-000000000a01','2f5e0000-0000-4a00-8a00-000000000b01'))
       + (select count(*) from platform.associations where organization_id in ('2f5e0000-0000-4a00-8a00-000000000a01','2f5e0000-0000-4a00-8a00-000000000b01'))
       + (select count(*) from platform.knob_override where organization_id in ('2f5e0000-0000-4a00-8a00-000000000a01','2f5e0000-0000-4a00-8a00-000000000b01'))
       + (select count(*) from iam.memberships where organization_id in ('2f5e0000-0000-4a00-8a00-000000000a01','2f5e0000-0000-4a00-8a00-000000000b01'))
       + (select count(*) from history.migration_log where organization_id in ('2f5e0000-0000-4a00-8a00-000000000a01','2f5e0000-0000-4a00-8a00-000000000b01'))
       + (select count(*) from custom.io_outbox where organization_id in ('2f5e0000-0000-4a00-8a00-000000000a01','2f5e0000-0000-4a00-8a00-000000000b01'))
       + (select count(*) from custom.visibility_epoch where organization_id in ('2f5e0000-0000-4a00-8a00-000000000a01','2f5e0000-0000-4a00-8a00-000000000b01'))
       + (select count(*) from iam.permissions where id = '2f5e0000-0000-4a00-8a00-000000009901')
    into v_n;
  if v_n <> 0 then raise exception 'TEARDOWN FAILED — % row(s) of the throwaway organizations survive. Census is not zero.', v_n; end if;
  raise notice 'TEARDOWN PASSED — census zero: nothing of the two throwaway organizations remains.';
  raise notice 'ALL PARTS PASSED (1 member default visibility, 2 cross-organization links + masked read, 3 who could see this on a date, 4 the field-type migration row)';
end $t$;
