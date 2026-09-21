-- GUARD-SWITCH — THE GREEN SUITE. The store's per-object guards follow the organization's
-- switch, the organization wall is live on the association half, and "who could see this on
-- that day" replays the settings of that day.
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   PSQL="$(node node_modules/tsx/dist/cli.mjs scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/guardswitch_green.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/` and is
-- discovered by no sweep.
--
-- WHY REAL TRANSACTIONS AND NOT ONE ROLLED-BACK BLOCK (VIS-2's reason, unchanged): history
-- stamps every row with the TRANSACTION timestamp, so inside one transaction a knob's old
-- value and its new value share a moment to the microsecond and there is no "between" to ask
-- about — which is the whole of PART 3. So this runs REAL transactions against two THROWAWAY
-- organizations with fixed ids and deletes them at the end. Step 0 deletes them FIRST as
-- well, so a run that died half way leaves nothing for the next one, and the last block is a
-- CENSUS that fails unless every trace is gone.
--
-- THE IDENTITIES. `admin@admin.com` owns both throwaway organizations; `test@test.com` (Dana)
-- is a plain MEMBER of the first. Nobody's own records are touched.
--
-- 🚨 THE SEAT (lane SEAT-SUITES, 2026-09-19). Every clause in this suite used to run as the
-- role that OWNS `custom.record` and `platform.associations`. In that seat EXECUTE grants are
-- free, `custom.assert_client_may_reach` returns on its first line, SECURITY INVOKER and
-- SECURITY DEFINER are the same thing, and `custom.record` is directly readable — so "the
-- guards follow the switch" and "the wall is live" were statements about the store's internals
-- and not about what a signed-in person may do. Each asserting transaction now takes the seat
-- `authenticated` and PROVES it holds it before it asserts anything (`set_config('role', …,
-- true)` is transaction-local, so the seat is taken again in every one of them). The knob
-- INSERTs became `platform.knob_override_set`, the settings screen's own door; the records and
-- tables became `custom.table_declare` / `custom.record_write` / `custom.record_update`; the
-- one read that went straight at `custom.record` became `custom.read_records`; and the wall is
-- now asked of `custom.relation_target_card`, which is the door the platform's own
-- `platform.client_callable_door` register says a person reaches the wall through.
--
-- FOUR STEPS HAVE NO CLIENT DOOR, AND EACH ONE STEPS OUT OF THE SEAT AND SAYS WHY:
--   · Step 0 and the teardown — deleting across nine schemas is operator work by definition.
--   · The two Home records — a Home is made by the onboarding path, not by a browser.
--   · The relation FIELD in PART 2 — see the note there. `custom.field_declare` cannot make a
--     column that points at another TABLE at all, which is a REAL finding, reported by this
--     lane and NOT papered over here.
--   · PART 1c (a `pg_proc` census) and PART 3a/3b/3d (`history.capture_window` and
--     `platform.knob_value_as_of`). `platform.client_callable_door` DECLARES
--     `platform.knob_value_as_of` server-only, in those words, and names
--     `custom.visibility_as_of` as the door a person reaches that truth through — so 3e, which
--     IS that door, is asked from the seat and carries the product clause of PART 3.
--
-- ITS RED TWIN is `guardswitch_red.sql`.

\set ON_ERROR_STOP on
\timing off

\set ORG_A '\'9a5d0000-0000-4a00-8a00-000000000a01\''
\set ORG_B '\'9a5d0000-0000-4a00-8a00-000000000b01\''
\set ADMIN '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA  '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''

-- ════════════════════════════════════════════════════ STEP 0 — a clean slate, both ways
-- OUT OF THE SEAT ON PURPOSE, and it asserts nothing. Deleting a run's leftovers out of nine
-- schemas is operator work; no signed-in person may do it and no client door covers it.
begin;
-- SEAT-SUITES 2026-09-19: these two operator transactions carry MINUTES of headroom, not
-- seconds. They take the same rows several other campaign lanes are touching on this live
-- database (one was mid-`drop trigger … on custom.record` when this was measured), so a
-- 20-second lock wait leaves a run's throwaway organizations behind and the NEXT run reads
-- them as real. Nothing here is asserted on time; the assertions are all above.
set local statement_timeout = '900s';
set local lock_timeout = '120s';
select set_config('app.actor_system', 'guardswitch_green_suite', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id in (:ORG_A, :ORG_B));
delete from platform.associations where organization_id in (:ORG_A, :ORG_B);
delete from custom.record where organization_id in (:ORG_A, :ORG_B);
delete from custom.io_outbox where organization_id in (:ORG_A, :ORG_B);
delete from custom.io_comment where organization_id in (:ORG_A, :ORG_B);
delete from custom.record_alias where organization_id in (:ORG_A, :ORG_B);
delete from custom.merge_field_provenance where organization_id in (:ORG_A, :ORG_B);
delete from custom.external_link where organization_id in (:ORG_A, :ORG_B);
delete from custom.external_source where organization_id in (:ORG_A, :ORG_B);
delete from custom.visibility_epoch where organization_id in (:ORG_A, :ORG_B);
delete from custom.organization_visibility_version where organization_id in (:ORG_A, :ORG_B);
delete from history.migration_log where organization_id in (:ORG_A, :ORG_B);
delete from platform.knob_override where organization_id in (:ORG_A, :ORG_B);
delete from iam.memberships where organization_id in (:ORG_A, :ORG_B);
delete from iam.organizations where id in (:ORG_A, :ORG_B);

insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG_A, 'GUARD-SWITCH Throwaway A', 'guardswitch-throwaway-a', 'GSA', :ADMIN),
       (:ORG_B, 'GUARD-SWITCH Throwaway B', 'guardswitch-throwaway-b', 'GSB', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG_A, 'organization', :ORG_A, :ADMIN, 'owner',  'active'),
       (:ORG_A, 'organization', :ORG_A, :DANA,  'member', 'active'),
       (:ORG_B, 'organization', :ORG_B, :ADMIN, 'owner',  'active');

-- 🚨 RED-SUITES 2026-09-21 — "FRESH" NO LONGER MEANS "OFF", SO THE FIXTURE SAYS OFF OUT LOUD.
-- The ruling that changed the promise: `limitsfix_a_new_organization_has_the_store_on.sql`,
-- corrected the same day by `limitsfix_the_store_default_is_a_read_not_a_row.sql` — an
-- organization born after 2026-09-21 01:30:44+00 with no override of its own now reads the
-- store as ON, deliberately, because 515 of 588 organizations resolved to the platform default
-- of false and every organization the real-data crews made was dead on arrival. A suite that
-- makes two throwaway organizations therefore makes two organizations whose store is ON, and
-- PART 1's claim — "with the store OFF, nothing moved" — became untestable by accident rather
-- than false. So the OFF state is now a written row and not an absence: the clauses below are
-- unchanged and still assert exactly what they always asserted.
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom','system_enabled','organization', :ORG_A, :ORG_A, 'false'::jsonb, 'guardswitch_green step 0 — the OFF state PART 1 is about'),
       ('custom','system_enabled','organization', :ORG_B, :ORG_B, 'false'::jsonb, 'guardswitch_green step 0 — the OFF state PART 1 is about');
commit;


-- ═════════════ PART 1 — EVERY PER-OBJECT GUARD IN THE STORE FOLLOWS THE ORGANIZATION'S SWITCH
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'guardswitch_green_suite', true);
do $t$
declare
  v_a constant uuid := '9a5d0000-0000-4a00-8a00-000000000a01';
  v_b constant uuid := '9a5d0000-0000-4a00-8a00-000000000b01';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_keys constant text[] := array['associations_guard', 'entity_custom_fields_guard',
                                  'row_versions_guard', 'field_index_guard'];
  v_k text;
  v_n integer;
  v_left text;
  v_res jsonb;
  v_boss text := current_user;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT. Everything below this line runs as a signed-in person.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASSED — the seat is `authenticated`, the ladder sees a client, and custom.record is not readable from it.';

  -- 1a — WITH THE STORE OFF, NOTHING MOVED. This is the whole safety claim of the change, and
  -- it is asked of the two doors a client has for it: `custom.store_is_open` (declared
  -- client-callable by lane W6-EXT) and `platform.relations_are_on`.
  -- (RED-SUITES 2026-09-21: step 0 now WRITES the off state — see the note there. Before the
  --  LIMITS-FIX birth default this organization was off by saying nothing.)
  if custom.store_is_open(v_a) then
    raise exception '1a FAILED — an organization whose switch says off reads as on the store.'; end if;
  if platform.relations_are_on(v_a) then
    raise exception '1a FAILED — relations read ON for an organization whose store is off.'; end if;

  -- 1b — THE SWITCH, AND IT IS THE ONLY ONE. Before this lane, no rung anywhere could make
  -- platform.relations_are_on answer true: custom/associations_guard was false platform-wide
  -- with overridable_by = {}, which is an outage with a name rather than a switch.
  -- THROUGH THE DOOR: the settings screen writes an override with
  -- `platform.knob_override_set`. This suite used to INSERT the row into
  -- `platform.knob_override`, on which a signed-in person holds SELECT and nothing else — so
  -- the "switch" it was testing was one no person could ever have thrown.
  v_res := platform.knob_override_set('custom', 'system_enabled', 'organization', v_a, v_a,
                                      'true'::jsonb, 'guardswitch_green 1b');
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception '1b FAILED — the settings door refused an OWNER of this organization its own store switch: %', v_res; end if;
  if not custom.store_is_open(v_a) then
    raise exception '1b FAILED — the store switch did not take for organization A.'; end if;
  if not platform.relations_are_on(v_a) then
    raise exception '1b FAILED — the store is on for A and relations still read off.'; end if;
  if platform.relations_are_on(v_b) then
    raise exception '1b FAILED — turning A on turned B on as well; the rung is not per organization.'; end if;
  -- and the door that stands in front of the surface agrees, asked as a person
  perform platform.assert_relations_door(v_a);
  -- 1b, THE SECOND INPUT WITH A DIFFERENT EXPECTED ANSWER: B's store is off, and from a
  -- CLIENT seat the same door REFUSES rather than returning. The old seat could not ask this
  -- at all — it owned `platform.associations`, so the door's last arm let it through for every
  -- organization on the database and the clause could only ever read the knob.
  declare
    v_caught text := null;
  begin
    begin
      perform platform.assert_relations_door(v_b);
    exception when others then
      v_caught := sqlerrm;
    end;
    if v_caught is null then
      raise exception '1b FAILED — the relations door let a client into an organization whose store is switched off.'; end if;
    if v_caught not ilike '%switched off%' then
      raise exception '1b FAILED — the refusal does not say relations are switched off: %', v_caught; end if;
  end;

  -- 1c — THE CLASS, NOT THE INSTANCE. Every knob this lane retired is read by NOTHING. A
  -- catalogue query, so a body that quietly kept its old read cannot pass.
  -- IT STEPS OUT OF THE SEAT AND SAYS SO: reading every function body on the database out of
  -- `pg_proc` is not a product question, no screen asks it and no client door covers it. It
  -- asserts nothing a person may do; the seat is taken again the moment it is done.
  perform set_config('role', v_boss, true);
  foreach v_k in array v_keys loop
    select count(*) into v_n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.prosrc like '%knob_resolve(''custom'', ''' || v_k || '''%'
        or p.prosrc like '%knob_resolve(''custom'',''' || v_k || '''%';
    if v_n > 0 then
      select string_agg(n.nspname || '.' || p.proname, ', ') into v_left
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosrc like '%knob_resolve(''custom'', ''' || v_k || '''%'
          or p.prosrc like '%knob_resolve(''custom'',''' || v_k || '''%';
      raise exception '1c FAILED — custom/% is retired and % function(s) still read it: %', v_k, v_n, v_left;
    end if;
  end loop;
  perform set_config('role', 'authenticated', true);

  -- 1d — and the retired rows SAY they are retired, so the settings screen does not lie. This
  -- one is back IN the seat: `platform.feature_knob` is the settings registry and a signed-in
  -- person holds SELECT on it, because the screen that shows a person their settings reads it.
  select count(*) into v_n from platform.feature_knob
   where feature = 'custom' and key = any (v_keys) and label like 'Retired:%';
  if v_n <> array_length(v_keys, 1) then
    raise exception '1d FAILED — % of % retired guard knobs carry a Retired label, as a signed-in person reads them.', v_n, array_length(v_keys, 1); end if;

  -- 1e — THE CENSUS OF WHAT IS LEFT, and it is a fixed list with a reason each (see
  -- guardswitch_the_store_switch_is_the_only_switch.sql). A NEW platform-wide custom/*_guard
  -- appearing with no organization rung is a defect this assertion catches on the next run.
  select string_agg(key, ', ' order by key) , count(*) into v_left, v_n
    from platform.feature_knob
   where feature = 'custom' and key like '%\_guard' and overridable_by = '{}'::text[]
     and not (key = any (v_keys));
  if coalesce(v_left, '') <> 'accessible_entity_ids_guard, emergency_door_guard, entity_types_guard, signup_provisioning_guard' then
    raise exception '1e FAILED — the census of platform-wide guards that stay platform-wide has changed: %', coalesce(v_left, '(none)'); end if;

  raise notice 'PART 1 PASSED (1a off is off, 1b the store switch is the only switch and the door refuses a client where it is off, 1c nothing reads the four retired guards, 1d they say so, 1e the four that stay are the four declared) — from the seat `authenticated`.';
end $t$;
commit;


-- ═════════════════ PART 2 — THE ASSOCIATION HALF OF THE ORGANIZATION WALL IS LIVE (VIS-34)
--
-- VIS-2 proved the wall on the RELATION RECORD (`custom.assert_organization_wall`, always
-- live) and recorded that the ASSOCIATION half — `platform.enforce_relation_edge` on
-- `platform.associations` — was dark for every organization, because it is gated on
-- `platform.relations_are_on` and that read `custom/associations_guard`. It follows the
-- organization's own store switch now, so this part asks that half directly, in an
-- organization whose store is ON — and it asks it AS A SIGNED-IN PERSON, which is the only
-- seat in which the question means anything: `authenticated` holds INSERT on
-- `platform.associations` and reaches the trigger exactly as a browser does.
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'guardswitch_green_suite', true);
do $t$
declare
  v_a constant uuid := '9a5d0000-0000-4a00-8a00-000000000a01';
  v_b constant uuid := '9a5d0000-0000-4a00-8a00-000000000b01';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_korg constant uuid := '11111111-0000-4000-8000-000000000004';
  v_tbl_a uuid; v_tbl_b uuid;
  v_rec_a uuid; v_rec_b uuid; v_fld uuid;
  v_hq_a uuid; v_hq_b uuid;
  v_boss text := current_user;
  v_seen boolean;
  v_why text;
  v_foreign boolean;
  v_masked boolean;
  v_card jsonb;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- REC-1: a Table lives somewhere, so each organization gets its Home first. A Home record is
  -- made by the onboarding path and has no client door of its own, so it is made here, BEFORE
  -- the seat is taken, and nothing is asserted while this is true.
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_a, v_korg, 'record', jsonb_build_object('name', 'GUARD-SWITCH HQ A'), v_admin)
  returning id into v_hq_a;
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_b, v_korg, 'record', jsonb_build_object('name', 'GUARD-SWITCH HQ B'), v_admin)
  returning id into v_hq_b;

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT, taken again: `set_config('role', …, true)` is transaction-local.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;

  -- Both organizations are switched on, through the settings door.
  perform platform.knob_override_set('custom', 'system_enabled', 'organization', v_a, v_a,
                                     'true'::jsonb, 'guardswitch_green part 2');
  perform platform.knob_override_set('custom', 'system_enabled', 'organization', v_b, v_b,
                                     'true'::jsonb, 'guardswitch_green part 2');

  v_tbl_a := custom.table_declare(v_a, jsonb_build_object(
    'name', 'Case', 'slug', 'gs_case', 'label_singular', 'Case', 'label_plural', 'Cases',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text'),
                                jsonb_build_object('name', 'supplier', 'kind', 'relation')),
    'title_field', 'title', 'parent_id', v_hq_a::text));
  v_tbl_b := custom.table_declare(v_b, jsonb_build_object(
    'name', 'Supplier', 'slug', 'gs_supplier', 'label_singular', 'Supplier', 'label_plural', 'Suppliers',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_hq_b::text));

  v_rec_a := custom.record_write(v_a, v_tbl_a, jsonb_build_object('title', 'GS Case 1'));
  v_rec_b := custom.record_write(v_b, v_tbl_b, jsonb_build_object('title', 'Redwood Print and Supply'));

  -- ── THE ONE FIXTURE WITH NO CLIENT DOOR, AND THE FINDING IT NAMES ──────────────────────
  -- The relation FIELD in A. SEAT-SUITES, 2026-09-19: `custom.field_declare` CANNOT declare a
  -- column that points at another TABLE. Measured on the main database: `{"type":"relation"}`
  -- is refused by name — "A column that points at other records is a Person column or a File
  -- column, and 'relation' does not say which" — and the only two relation arms
  -- `custom._field_document_for` has, `member` and `attachment`, OVERWRITE `relation_target`
  -- with the Person kernel and the File kernel. So through the doors alone a person cannot
  -- build a Case that points at a Supplier at all, and the whole cross-organization wall this
  -- part tests stands behind a field no client can make. That is a REAL finding of this lane,
  -- reported and NOT papered over: it is a new field type in the FLD-11 vocabulary, which is
  -- not a test suite's to coin.
  -- So this ONE fixture row steps out of the seat, says why, and asserts nothing while it is
  -- out. Every clause below it is back in the seat.
  -- `target_mode: any` on purpose: REL-8 is not what this part is about, and a polymorphic
  -- relation is the widest possible declaration — so anything that refuses below is the WALL
  -- refusing, never the target list.
  perform set_config('role', v_boss, true);
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_a, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'supplier', 'label', 'Supplier', 'sort', 10, 'type', 'relation',
    'multi', false, 'dated', false, 'required', false, 'source', 'manual',
    'config', jsonb_build_object('target_mode', 'any'),
    -- FLD-13's shape guard wants the declared target whatever the mode says; `target_mode: any`
    -- is what platform.relation_declaration actually reads, and it makes REL-8 not a question.
    'relation_target', v_tbl_a::text, 'relation_max', 5, 'on_target_delete', 'set_null',
    'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb, 'source_config', '{}'::jsonb,
    'sensitivity', 'internal', 'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', false, 'entity_definition_id', v_tbl_a::text), v_admin)
  returning id into v_fld;
  perform set_config('role', 'authenticated', true);

  -- 2a — THE EDGE THE SWITCH USED TO WAVE THROUGH. Nothing has opened the wall, so it is
  -- refused. Before GUARD-SWITCH this insert SUCCEEDED for every organization on earth,
  -- because gate two of platform.enforce_relation_edge returned NEW untouched.
  begin
    insert into platform.associations
      (source_type, source_id, target_type, target_id, organization_id, role, relation_field_id, origin, created_by)
    values ('record', v_rec_a, 'record', v_rec_b, v_a, 'supplier', v_fld, 'campaign', v_admin);
    raise exception '2a FAILED — a relation edge into another organization was accepted with nothing allowing it.';
  exception when foreign_key_violation then null;
  end;

  -- 2b — the Table the relation STARTS at allows it, and it is STILL refused: one
  --      organization's flag is not consent from the other (VIS-34).
  --      THROUGH THE DOOR: `custom.record_update` on the Table record, which is how a person
  --      changes a table's settings. This suite used to UPDATE `custom.record` directly.
  perform custom.record_update(v_a, v_tbl_a, jsonb_build_object('cross_organization_relations', true));
  begin
    insert into platform.associations
      (source_type, source_id, target_type, target_id, organization_id, role, relation_field_id, origin, created_by)
    values ('record', v_rec_a, 'record', v_rec_b, v_a, 'supplier', v_fld, 'campaign', v_admin);
    raise exception '2b FAILED — the source Table''s flag alone opened the wall; the other organization was never asked.';
  exception when foreign_key_violation then null;
  end;

  -- 2c — A says yes. B has not been asked. Still refused. The knob goes on through the
  --      settings door, and the ANSWER is read where a person reads it: at the edge itself.
  --      (`custom.cross_organization_links_open` is DECLARED server-only in
  --      `platform.client_callable_door` — "it is a predicate over two knob values … read by
  --      custom.assert_organization_wall, platform.enforce_relation_edge and
  --      custom.relation_target_card, all of which are already reached through their own
  --      doors" — so this clause asks one of those doors instead of the predicate.)
  perform platform.knob_override_set('custom', 'cross_organization_links', 'organization',
                                     v_a, v_a, 'true'::jsonb, 'guardswitch_green 2c');
  begin
    insert into platform.associations
      (source_type, source_id, target_type, target_id, organization_id, role, relation_field_id, origin, created_by)
    values ('record', v_rec_a, 'record', v_rec_b, v_a, 'supplier', v_fld, 'campaign', v_admin);
    raise exception '2c FAILED — one organization''s knob alone let the link through.';
  exception when foreign_key_violation then null;
  end;

  -- 2d — BOTH organizations opted in, and the link is made.
  perform platform.knob_override_set('custom', 'cross_organization_links', 'organization',
                                     v_b, v_b, 'true'::jsonb, 'guardswitch_green 2d');
  insert into platform.associations
    (source_type, source_id, target_type, target_id, organization_id, role, relation_field_id, origin, created_by)
  values ('record', v_rec_a, 'record', v_rec_b, v_a, 'supplier', v_fld, 'campaign', v_admin);

  -- 2d (the door's own answer) — and the person who owns the Case now SEES the foreign target
  --     through `custom.relation_target_card`, which is the declared client door onto the
  --     wall, with the sentence that says which of its three answers this is. A wall that let
  --     the row in and showed the person nothing would pass the insert above and fail here.
  v_seen := false;
  select true, c.why, c.is_foreign, c.masked, c.card
    into v_seen, v_why, v_foreign, v_masked, v_card
    from custom.relation_target_card(v_a, v_rec_a, 'supplier') c
   where c.target_id = v_rec_b limit 1;
  if not coalesce(v_seen, false) then
    raise exception '2d FAILED — both organizations opted in, the edge is in the table, and the door a person follows relations by does not report the target at all.'; end if;
  if not coalesce(v_foreign, false) then
    raise exception '2d FAILED — the door does not say the target it just handed back belongs to another organization.'; end if;
  if coalesce(v_masked, true) then
    raise exception '2d FAILED — both organizations said yes and the door still masks the target, so the wall it reports is not the wall the edge went through.'; end if;
  if (v_card ->> 'title') is distinct from 'Redwood Print and Supply' then
    raise exception '2d FAILED — the person is shown a foreign target with no card to read: %', coalesce(v_card::text, 'nothing'); end if;
  if v_why ilike '%wall is shut%' then
    raise exception '2d FAILED — both organizations said yes and the door still tells the person the wall is shut: %', v_why; end if;

  -- 2e — AND THE REST OF THE CONTRACT CAME ALIVE WITH IT, which is how we know gate two is
  --      really open rather than the wall being enforced somewhere else. REL-10: the edge's
  --      `role` IS the field's key or the edge belongs to no field.
  begin
    insert into platform.associations
      (source_type, source_id, target_type, target_id, organization_id, role, relation_field_id, origin, created_by)
    values ('record', v_rec_a, 'record', v_rec_b, v_a, 'vendor', v_fld, 'campaign', v_admin);
    raise exception '2e FAILED — an edge whose role does not match its field was accepted (REL-10 is not running).';
  exception when check_violation then null;
  end;

  -- 2f — THE SWITCH IS THE SWITCH. Turn A's store off and the same wrong-role edge is waved
  --      through untouched: that is the state every organization was in before this lane, and
  --      it is now reachable only by switching the store off on purpose.
  perform platform.knob_override_set('custom', 'system_enabled', 'organization', v_a, v_a,
                                     'false'::jsonb, 'guardswitch_green 2f');
  if platform.relations_are_on(v_a) then
    raise exception '2f FAILED — the store was switched off and relations still read on.'; end if;
  insert into platform.associations
    (source_type, source_id, target_type, target_id, organization_id, role, relation_field_id, origin, created_by)
  values ('record', v_rec_a, 'record', v_rec_b, v_a, 'vendor', v_fld, 'campaign', v_admin);
  delete from platform.associations where organization_id = v_a and role = 'vendor';
  perform platform.knob_override_set('custom', 'system_enabled', 'organization', v_a, v_a,
                                     'true'::jsonb, 'guardswitch_green 2f control');

  raise notice 'PART 2 PASSED (2a refused, 2b the table alone is not enough, 2c one side is not both, 2d both opted in, the link was made and the person is shown it, 2e the rest of the relation contract is live too, 2f and it all goes dark again when the store is switched off) — every clause from the seat `authenticated`.';
end $t$;
commit;


-- ═══════════════ PART 3 — THE KNOB REGISTRY KEEPS HISTORY, AND THE AS-OF DOOR READS IT
-- Separate transactions on purpose: history stamps the TRANSACTION timestamp, so the "before"
-- and the "after" of a knob change have to be in two of them or there is no between.
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'guardswitch_green_suite', true);
do $t$
declare
  v_a constant uuid := '9a5d0000-0000-4a00-8a00-000000000a01';
  v_open timestamptz;
  v_val jsonb; v_rep boolean;
begin
  -- 3a AND 3b ARE OPERATOR CLAUSES AND THEY SAY SO. `history.capture_window` carries no client
  -- grant of any kind, and `platform.knob_value_as_of` is DECLARED server-only in
  -- `platform.client_callable_door`, in these words: "it reports any organization's settings
  -- history with no access decision of its own, by design — it is the replay primitive the
  -- membership arm of custom.visibility_as_of walks with, and that door is where the
  -- organization wall and the owner/admin test live. A client door onto it would hand any
  -- signed-in person any organization's settings history." This lane does not overturn that
  -- ruling to make a test convenient. So these two clauses are asked as the connected role and
  -- the PRODUCT clause of this part is 3e, which asks `custom.visibility_as_of` — the door the
  -- register names — from the seat.
  if current_user = 'authenticated' then
    raise exception '3a/3b are operator clauses and must not pretend to be a person''s';
  end if;

  -- 3a — the two windows are open, so a replay can tell "it did not change" from "nobody was
  --      watching". Before this lane neither existed.
  select w.opened_at into v_open from history.capture_window w where w.entity_type = 'platform.feature_knob';
  if v_open is null then raise exception '3a FAILED — no capture window for platform.feature_knob.'; end if;
  if not exists (select 1 from history.capture_window where entity_type = 'platform.knob_override') then
    raise exception '3a FAILED — no capture window for platform.knob_override.'; end if;

  -- 3b — the BACKFILL claims only today. A moment before the window answers today's value and
  --      says replayed = false rather than inventing what the knob used to say.
  select k.value, k.replayed into v_val, v_rep
    from platform.knob_value_as_of('custom', 'member_default_visibility', v_a, v_open - interval '1 day') k;
  if v_rep then raise exception '3b FAILED — a moment before the settings history began came back as a replay.'; end if;
  if v_val #>> '{}' is distinct from 'all_records' then
    raise exception '3b FAILED — the un-replayed answer is not the live one (%).', v_val; end if;
  raise notice 'PART 3a/3b PASSED (both windows open; before the window it says replayed = false and hands back today''s value) — asked as the connected role, because the register says this primitive is not a person''s.';
end $t$;
commit;

begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'guardswitch_green_suite', true);
-- THE CHANGE: this organization decides that membership alone shows nothing (VIS-33) — and an
-- ORGANIZATION decides that on its settings screen, so it goes through the settings door from
-- the seat, not as an INSERT into a table no person may write.
do $t$
declare
  v_a constant uuid := '9a5d0000-0000-4a00-8a00-000000000a01';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
begin
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'the settings change did not take the seat — current_user is %', current_user;
  end if;
  perform platform.knob_override_set('custom', 'member_default_visibility', 'organization',
                                     v_a, v_a, '"shared_only"'::jsonb, 'GUARD-SWITCH green suite');
end $t$;
commit;

begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'guardswitch_green_suite', true);
do $t$
declare
  v_a constant uuid := '9a5d0000-0000-4a00-8a00-000000000a01';
  v_dana constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_changed timestamptz;
  v_before  timestamptz;
  v_val jsonb; v_rep boolean;
  v_rec uuid;
  v_tbl uuid;
  r record;
  v_seen_before boolean := false;
  v_seen_after  boolean := false;
  v_rep_before  boolean;
  v_caught text;
  v_n integer;
  v_res jsonb;
  v_boss text := current_user;
begin
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ════════════════════════════════════════════════════════════════════════════
  -- PART 0 — THE SEAT, taken again for this transaction.
  -- ════════════════════════════════════════════════════════════════════════════
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;

  -- 3c — THE CHANGE IS ON THE RECORD, in history, written in the same transaction as the knob.
  --      `history.row_versions` is row-level-secured and a signed-in person reads their own
  --      organization's rows out of it, so this is asked from the seat.
  select h.occurred_at into v_changed
    from history.row_versions h
   where h.entity_type = 'platform.knob_override'
     and h.row_id = platform.knob_history_row_id('custom', 'member_default_visibility', 'organization', v_a)
   order by h.occurred_at desc, h.id desc limit 1;
  if v_changed is null then
    raise exception '3c FAILED — the knob was written through the settings door and the settings history has no row for it that this organization''s own member can read.'; end if;
  v_before := v_changed - interval '1 millisecond';

  -- 3d — ASKED BEFORE THE CHANGE, IT ANSWERS WHAT THE KNOB SAID THEN — replayed, not today's.
  --      The replay PRIMITIVE is server-only (see 3a/3b), so this steps out for the two reads
  --      and asserts nothing about what a person may do while it is out.
  perform set_config('role', v_boss, true);
  select k.value, k.replayed into v_val, v_rep
    from platform.knob_value_as_of('custom', 'member_default_visibility', v_a, v_before) k;
  if not v_rep then raise exception '3d FAILED — the moment before the change was not a replay.'; end if;
  if v_val #>> '{}' is distinct from 'all_records' then
    raise exception '3d FAILED — before the change this organization read %, not all_records.', v_val; end if;

  select k.value, k.replayed into v_val, v_rep
    from platform.knob_value_as_of('custom', 'member_default_visibility', v_a, v_changed) k;
  if not v_rep then raise exception '3d FAILED — the moment of the change was not a replay.'; end if;
  if v_val #>> '{}' is distinct from 'shared_only' then
    raise exception '3d FAILED — after the change this organization reads %, not shared_only.', v_val; end if;
  perform set_config('role', 'authenticated', true);

  -- 3e — AND THE AUDIT DOOR READS IT, FROM THE SEAT. "Who could see this on that day" answers
  --      Dana for the moment BEFORE the change and not for the moment after, and marks the row
  --      REPLAYED — which VIS-2 recorded it could not do, because the registry kept no history.
  --      `custom.visibility_as_of` is declared client-callable; this is the product clause of
  --      PART 3 and it is asked exactly as a person's screen asks it.
  --      THE RECORD IS FOUND THROUGH `custom.read_records`, not by reading `custom.record` —
  --      which this seat cannot do at all.
  -- 🚨 RED-SUITES 2026-09-21 — `p_by_id => false`, BECAUSE THIS CLAUSE LOOKS A RECORD UP BY ITS
  -- COLUMN NAME. `custom.read_records`' third argument is `p_by_id`, and `true` asks for a
  -- document keyed by FIELD ID. Both lines passed `true` and then read `document ->> 'slug'` /
  -- `->> 'title'`, which worked only because neither key had a Field record behind it. Lane
  -- FIELD-TRUTH's ruling changed that on purpose — an undeclared key a record carries BECOMES a
  -- real Field (`limitsfix_backfill_declared_fields.sql`; 310 declared names rebuilt across 103
  -- Tables) — so `title` now has a Field and the by-id document comes back keyed
  -- `de798d51-…`. The door was right both times; the clause was asking the wrong question.
  select r2.id into v_tbl from custom.read_records(v_a, custom.table_kernel_id(), false, 200, 0) r2
   where r2.document ->> 'slug' = 'gs_case' limit 1;
  if v_tbl is null then raise exception '3e FAILED — the fixture table is not in the list this person reads.'; end if;
  select r2.id into v_rec from custom.read_records(v_a, v_tbl, false, 200, 0) r2
   where r2.document ->> 'title' = 'GS Case 1' limit 1;
  if v_rec is null then raise exception '3e FAILED — the fixture record is gone.'; end if;

  for r in select * from custom.visibility_as_of(v_a, v_rec, v_before) loop
    if r.principal_kind = 'user' and r.principal_id = v_dana and r.through_kind = 'organization' then
      v_seen_before := true; v_rep_before := r.replayed;
    end if;
  end loop;
  if not v_seen_before then
    raise exception '3e FAILED — before the change, membership alone reached every record and Dana is not in the answer.'; end if;
  if not v_rep_before then
    raise exception '3e FAILED — the membership row still says replayed = false; the door is not reading the settings history.'; end if;

  for r in select * from custom.visibility_as_of(v_a, v_rec, v_changed) loop
    if r.principal_kind = 'user' and r.principal_id = v_dana and r.through_kind = 'organization' then
      v_seen_after := true;
    end if;
  end loop;
  if v_seen_after then
    raise exception '3e FAILED — after the organization said "only what is shared", Dana is still listed by membership.'; end if;

  -- ══ PART 4 — THE NEGATIVE CLAUSE, AS A REAL SECOND PERSON ═══════════════════════════════
  -- Dana is a member of organization A and was shared nothing, and A has just said that
  -- membership alone shows nothing. Every refusal above is a STORE rule; this is the ACCESS
  -- question, which the old seat could not ask at all: as the owner of `custom.record`,
  -- `custom.assert_client_may_reach` returned true on its first line for every organization on
  -- this database, and `custom.assert_client_may_open` with it.
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- 4a. She cannot read a record nobody gave her.
  v_caught := null;
  begin
    perform custom.read_record(v_a, v_rec, true);
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '4a FAILED — test@test.com read a record nobody shared with her in an organization that says members see only what is shared.'; end if;

  -- 4b. Nor may she change what the organization shows its members. A settings screen that
  --     took a plain member's word for this would be the whole wall, undone from the inside.
  --     The settings door answers with a verdict object rather than raising, so the clause
  --     reads the verdict — and it also requires the refusal to SAY why, because a door that
  --     returns {ok:false} and no sentence is a screen that goes dead with no remedy.
  v_res := platform.knob_override_set('custom', 'member_default_visibility', 'organization',
                                      v_a, v_a, '"all_records"'::jsonb, 'guardswitch_green 4b');
  if coalesce((v_res ->> 'ok')::boolean, false) then
    raise exception '4b FAILED — test@test.com, a plain member, turned this organization''s "what members can see" setting back on: %', v_res; end if;
  if nullif(btrim(coalesce(v_res ->> 'detail', '')), '') is null then
    raise exception '4b FAILED — the settings door refused a plain member and told her nothing: %', v_res; end if;

  -- 4b (the same wall on the audit door): nor may she ask WHO COULD SEE a record. 3e asked
  --     that question as an owner and was answered; the same door, the same record, the same
  --     moment, asked by a plain member, is refused.
  v_caught := null;
  begin
    perform 1 from custom.visibility_as_of(v_a, v_rec, v_changed);
  exception when others then
    v_caught := sqlerrm;
  end;
  if v_caught is null then
    raise exception '4b FAILED — test@test.com read the whole visibility audit of a record nobody shared with her.'; end if;
  if platform.knob_resolve('custom', 'member_default_visibility', v_a) #>> '{}' is distinct from 'shared_only' then
    raise exception '4b FAILED — the door said no and the setting moved anyway: %',
      platform.knob_resolve('custom', 'member_default_visibility', v_a); end if;

  -- 4c. THE CONTROL, so 4a and 4b are not a door that refuses her everything: the record she
  --     IS given, she reads, and she reads the switch that governs it.
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform custom.share_grant(v_a, v_rec, 'user', v_dana, 'viewer'::public.permission_level);
  perform set_config('request.jwt.claims', c_dana_j, true);
  if (custom.read_record(v_a, v_rec, false) ->> 'title') <> 'GS Case 1' then   -- by NAME, see 3e
    raise exception '4c FAILED — the record shared with test@test.com at viewer does not read back for her.'; end if;
  if not custom.store_is_open(v_a) then
    raise exception '4c FAILED — a member of this organization cannot read the switch that governs every door she uses.'; end if;
  perform set_config('request.jwt.claims', c_admin_j, true);

  raise notice 'PART 3 PASSED (3c the knob write recorded itself, 3d the value before and after replayed, 3e the audit door answers with the settings OF THAT DAY and marks the row replayed, from the seat)';
  raise notice 'PART 4 PASSED (4a a member reads nothing she was not given, 4b nor rewrites what the organization shows its members, 4c and is refused neither the record she WAS given nor the switch that governs it)';
end $t$;
commit;


-- ════════════════════════════════ TEARDOWN — and a CENSUS that fails unless it is complete
-- OUT OF THE SEAT ON PURPOSE, like step 0, and asserting nothing about what a person may do.
begin;
-- SEAT-SUITES 2026-09-19: these two operator transactions carry MINUTES of headroom, not
-- seconds. They take the same rows several other campaign lanes are touching on this live
-- database (one was mid-`drop trigger … on custom.record` when this was measured), so a
-- 20-second lock wait leaves a run's throwaway organizations behind and the NEXT run reads
-- them as real. Nothing here is asserted on time; the assertions are all above.
set local statement_timeout = '900s';
set local lock_timeout = '120s';
select set_config('app.actor_system', 'guardswitch_green_suite', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id in (:ORG_A, :ORG_B));
delete from platform.associations where organization_id in (:ORG_A, :ORG_B);
delete from custom.record where organization_id in (:ORG_A, :ORG_B);
delete from custom.io_outbox where organization_id in (:ORG_A, :ORG_B);
delete from custom.io_comment where organization_id in (:ORG_A, :ORG_B);
delete from custom.record_alias where organization_id in (:ORG_A, :ORG_B);
delete from custom.merge_field_provenance where organization_id in (:ORG_A, :ORG_B);
delete from custom.external_link where organization_id in (:ORG_A, :ORG_B);
delete from custom.external_source where organization_id in (:ORG_A, :ORG_B);
delete from custom.visibility_epoch where organization_id in (:ORG_A, :ORG_B);
delete from custom.organization_visibility_version where organization_id in (:ORG_A, :ORG_B);
delete from history.migration_log where organization_id in (:ORG_A, :ORG_B);
-- The history this run wrote, including the knob history this lane added: a suite that leaves
-- rows behind in the store it is testing is a suite that changes the next run's answer.
delete from history.row_versions where organization_id in (:ORG_A, :ORG_B);
delete from platform.knob_override where organization_id in (:ORG_A, :ORG_B);
delete from platform.knob_override_audit where organization_id in (:ORG_A, :ORG_B);
delete from iam.memberships where organization_id in (:ORG_A, :ORG_B);
delete from iam.organizations where id in (:ORG_A, :ORG_B);
commit;

-- A SECOND PASS, IN ITS OWN TRANSACTION, and it is not belt-and-braces. The deletes above are
-- themselves recorded: `platform._version_capture` writes a DELETE version for every record
-- and membership removed, and this lane's own `platform._knob_history_capture` writes one for
-- every override cleared. Those rows are written INSIDE the transaction that did the deleting,
-- so a history delete in that same transaction cannot see them. Census zero means zero.
begin;
set local statement_timeout = '900s';
set local lock_timeout = '120s';
delete from history.row_versions where organization_id in (:ORG_A, :ORG_B);
commit;

do $t$
declare
  v_a constant uuid := '9a5d0000-0000-4a00-8a00-000000000a01';
  v_b constant uuid := '9a5d0000-0000-4a00-8a00-000000000b01';
  v_n bigint;
begin
  select (select count(*) from iam.organizations where id in (v_a, v_b))
       + (select count(*) from iam.memberships where organization_id in (v_a, v_b))
       + (select count(*) from custom.record where organization_id in (v_a, v_b))
       + (select count(*) from platform.associations where organization_id in (v_a, v_b))
       + (select count(*) from platform.knob_override where organization_id in (v_a, v_b))
       + (select count(*) from history.row_versions where organization_id in (v_a, v_b))
    into v_n;
  if v_n <> 0 then
    raise exception 'TEARDOWN FAILED — % row(s) of this suite''s throwaway organizations are still here.', v_n; end if;
  raise notice 'TEARDOWN PASSED — census zero';
  raise notice 'ALL PARTS PASSED';
end $t$;
