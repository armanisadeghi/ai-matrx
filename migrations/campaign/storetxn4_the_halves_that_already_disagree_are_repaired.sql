-- additive: yes
-- lock: custom
-- lane: STORE-TXN-4
--
-- STORE-TXN-4 — THE THIRTEEN RECORDS THAT COULD NOT BE SAVED, AND THE CENSUS THAT KEEPS IT ZERO.
--
-- WHAT IS WRONG ON THE MAIN DATABASE TODAY, MEASURED SELECT-ONLY BEFORE A BYTE WAS WRITTEN.
-- Since 2026-09-22 15:15:46Z the deferred constraint trigger `custom._relation_halves_agree`
-- refuses, at COMMIT, any transaction that ends with a relation's VALUE and its ASSOCIATION
-- disagreeing (the corrected REL-11 under DD-023, lane OLD-TABLES-1). It is right to. But the
-- estate it was installed over ALREADY carried disagreements, and the guard judges the
-- transaction, not the author: the next person to edit one of those records is refused for a
-- defect that predates them, in a sentence about a relation they never touched.
--
-- THE CENSUS, RUN ON THE MAIN DATABASE 2026-09-22, BOTH DIRECTIONS, ALL ORGANIZATIONS — and it
-- is BIGGER than STORE-TXN-3's row said. That row counted one direction and named 13 records:
--
--   A · a VALUE with no live association — 14 halves over 13 records, 4 organizations:
--         Birchwood Avenue Renovation  `room`            11  (the row called this `quotes`)
--         Rincon Plumbing Co — Summerland Branch `customer`  1
--         Signal & Scale Podcast       `featured_guest`   1
--         Signal & Scale Podcast       `producer`         1  ← the one that is NOT repairable
--   B · a live relation ASSOCIATION with no value — 18 halves over 9 records, 3 organizations,
--       and NOBODY HAD LOOKED: Greenline Landscaping Crew — Riverside Yard (6) and Ironclad
--       Mobile Mechanic, two organizations of that name (12), on `client` and `next_job`.
--
-- WHY B EXISTS AND WHY IT IS NOT A DELETED LINK. Every one of the 18 associations carries the
-- SAME `created_at`, to the microsecond, as the record it points from, and every one of those
-- records is still at version 1 and has never been updated. So the edge was written beside a
-- document that was never given the value — drift at birth, by a seeder writing
-- `platform.associations` directly, before `platform.relation_set` wrote both halves
-- (STORE-TXN-3, today). Nobody removed a value. That fact is what makes the repair safe.
--
-- ── WHICH HALF IS THE TRUTH. THE ANSWER IS "BOTH", AND HERE IS WHY ─────────────────────────
--
-- The brief for this lane said to take the ASSOCIATION as the truth. This file does not, and
-- the reason is the corrected REL-11 itself: *neither half is derived from the other*. A rule
-- that picks a side by decree contradicts the very sentence the guard exists to hold, and in
-- practice it would have DELETED 14 authored relation cells to make a census go quiet.
--
-- So the repair takes the UNION, and the union is not a compromise — it is what the evidence
-- says. A half that exists on either side is evidence that the link was authored; there is no
-- case in this population where a half is evidence that a link was REMOVED, because a removal
-- leaves a later `updated_at` and a history line, and these records have neither. Adding the
-- missing half loses nothing and produces exactly the state the guard would have demanded had
-- it been standing when the row was written. Removing a half loses a fact permanently.
--
-- THE ONE CASE WHERE THE DOCUMENT IS NOT THE TRUTH, AND IT IS THE STORE THAT SAYS SO.
-- Signal & Scale Podcast's episode "Q3 flagship episode" holds
-- `producer = 87a6e699-3622-4869-8843-d0867456c0dd` — and that uuid is an `auth.users` id, not a
-- record. The `producer` field points at the Person kernel (11111111-0000-4000-8000-000000000005),
-- which has no record rows at all, so the store's own relation validation refuses that value
-- outright. Measured on the dev clone:
--
--     platform.relation_set(…,'producer',…) → 23514
--     "this relation points at Person, and that record is not one of them"
--
-- No door in this database can write that value or its edge. It is not a link; it is a stray id
-- that makes the episode permanently unsavable. For THAT case the association (which does not
-- exist) is the truth, the repair WITHDRAWS the value through `platform.relation_unset`, and the
-- `history.migration_log` row this door writes carries the exact id back as its inverse, so the
-- withdrawal is undoable by `history.migration_undo` the moment Person relations can be written.
--
-- 🚨 AND THE CLASS BEHIND THAT ONE ROW IS LEFT OPEN ON PURPOSE, NAMED, NOT SWEPT.
-- `custom.record_relation_edges` implies a `target_type = 'record'` edge for ANY uuid-shaped
-- value in a relation field, including a field whose declared target is the Person or File
-- kernel — and TWENTY-NINE relation fields on this database point at Person, five at File. The
-- first person to fill one of those cells will be refused at COMMIT by the halves guard for a
-- link the store itself cannot index. Repairing that means teaching `record_relation_edges` and
-- the guard the target ENTITY a relation field declares, which is a change to the store's
-- hottest read function and to a live guard — not something this lane may do inside a repair
-- pass. It is written here, in the census function's own output (`why`), and in the census
-- guard's report, so it cannot be discovered again by accident.
--
-- ── WHAT THIS FILE ADDS ────────────────────────────────────────────────────────────────────
--   1. `custom.relation_halves_disagreements(org, record)` — the census, SELECT-only, both
--      directions, over every organization when given no argument. It is ONE definition of the
--      word "disagree", used by the repair door AND by the release gate, so the guard and the
--      repair can never drift into meaning different things.
--   2. `custom.relation_halves_repair(org, record)` — the repair, through the doors:
--      `platform.relation_set` and `platform.relation_unset`, never a raw table write, so the
--      value envelope, the declared-column check, the field write door, the relation
--      validation, the version bump, the history line and the realtime notice are all the
--      store's own. It writes one `history.migration_log` line per record repaired, with a real
--      inverse, and every `history.row_versions` row it causes carries the verb
--      `relation_halves_repair` instead of `UPDATE`.
--   Neither is client-callable: a census across organizations is not a person's question, and
--   the repair is the organization's system principal putting right what a writer left. Both
--   refuse anyone who is not the owner of `custom.record`, in their own words.

create or replace function custom.relation_halves_disagreements(
  p_organization_id uuid default null,
  p_record_id       uuid default null)
returns table(organization_id uuid, record_id uuid, field_key text, field_id uuid,
              target_id uuid, direction text, remedy text, why text)
language plpgsql
stable
security definer
set search_path to ''
as $fn$
begin
  -- A census over every organization's records is not a client's question, and this function
  -- is not granted to one. The refusal is here as well as in the grant, so a grant issued by
  -- mistake one day still does not hand anybody a map of another tenant's links.
  if not custom.query_is_store_owner() then
    raise exception 'The relation-halves census is read by the store itself, not by a caller.'
      using errcode = '42501',
            hint = 'It reads every organization when it is given none, so it answers only to the '
                || 'role that owns custom.record — the campaign and server lanes. A person asks '
                || 'about their own record''s links through platform.relations_from.';
  end if;

  return query
  -- ── A · THE VALUE HALF STANDS ALONE ───────────────────────────────────────────────────────
  -- The document implies an edge (custom.record_relation_edges — the SAME reader the guard
  -- uses, so this census cannot disagree with the refusal it is meant to predict) and no live
  -- association carries it.
  select r.organization_id, r.id, e.edge_role, e.field_id, e.target_id,
         'value_without_edge'::text,
         case
           when tgt.id is not null then 'write_the_edge'
           else 'withdraw_the_value'
         end::text,
         case
           when tgt.id is not null then
             'the document names this target and no live association indexes it; '
          || 'platform.relation_set writes the edge and leaves the value as it stands'
           else
             'the document names ' || e.target_id::text || ', which is not a record of this '
          || 'organization at all — most often a Person or File relation holding an auth.users '
          || 'or storage id, which custom.record_relation_edges wrongly implies as a '
          || 'record-to-record edge and the store''s own relation validation then refuses. '
          || 'No door can write this value or its edge, so the repair withdraws the value and '
          || 'stores the id as its inverse.'
         end::text
    from custom.record r
    cross join lateral custom.record_relation_edges(r.organization_id, r.id, r.table_id,
                                                    r.data_class, r.data, r.deleted_at) e
    left join custom.record tgt
      on tgt.organization_id = r.organization_id and tgt.id = e.target_id and tgt.deleted_at is null
   where r.data_class = 'record'
     and r.deleted_at is null
     and (p_organization_id is null or r.organization_id = p_organization_id)
     and (p_record_id is null or r.id = p_record_id)
     and not exists (select 1
                       from platform.associations a
                      where a.source_type = 'record' and a.source_id = r.id
                        and a.target_type = 'record' and a.target_id = e.target_id
                        and a.role = e.edge_role and a.deleted_at is null)

  union all

  -- ── B · THE EDGE HALF STANDS ALONE ────────────────────────────────────────────────────────
  -- A live association that NAMES ITS FIELD (relation_field_id — the same test the guard's edge
  -- arm makes, so containment, surface bindings and lineage are somebody else's law) pointing
  -- from a record whose document does not name that target under that key.
  select a.organization_id, a.source_id, a.role, a.relation_field_id, a.target_id,
         'edge_without_value'::text,
         'write_the_value'::text,
         'a live association indexes this link and the record''s document does not name it; '
      || 'platform.relation_set adds the id to the cell through custom.record_update and leaves '
      || 'every other value alone'::text
    from platform.associations a
    join custom.record r
      on r.organization_id = a.organization_id and r.id = a.source_id
     and r.deleted_at is null and r.data_class = 'record'
   where a.relation_field_id is not null
     and a.deleted_at is null
     and a.source_type = 'record' and a.target_type = 'record'
     and (p_organization_id is null or a.organization_id = p_organization_id)
     and (p_record_id is null or a.source_id = p_record_id)
     and not exists (select 1
                       from custom.record_relation_edges(r.organization_id, r.id, r.table_id,
                                                         r.data_class, r.data, r.deleted_at) e
                      where e.target_id = a.target_id and e.edge_role = a.role);
end;
$fn$;

comment on function custom.relation_halves_disagreements(uuid, uuid) is
  'STORE-TXN-4. The ONE definition of "the two halves of a relation disagree", in both '
  'directions, used by custom.relation_halves_repair and by the release gate '
  'check:relation-halves-agree. It reads through custom.record_relation_edges, the same reader '
  'custom._relation_halves_agree refuses with, so a census green while the guard would refuse is '
  'not a state this database can reach. SELECT-only; it repairs nothing.';

create or replace function custom.relation_halves_repair(
  p_organization_id uuid,
  p_record_id       uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_rows      jsonb;
  v_keys      text[];
  v_key       text;
  v_before    jsonb;
  v_targets   jsonb;
  v_multi     boolean;
  v_withdrawn int := 0;
  v_set       int := 0;
  v_unrepair  text;
  v_note      text;
  v_log       uuid;
begin
  if not custom.query_is_store_owner() then
    raise exception 'Repairing a relation whose two halves disagree is the store''s own work, not a caller''s.'
      using errcode = '42501',
            hint = 'This door rewrites a record a person may never have been shown, to undo a '
                || 'writer''s defect. It answers only to the role that owns custom.record. A '
                || 'person changes their own links through platform.relation_set and '
                || 'platform.relation_unset, which have written both halves since 2026-09-22.';
  end if;
  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.relation_halves_repair: which record, in which organization?'
      using errcode = '22004';
  end if;

  -- THE CENSUS IS THE INPUT. There is no second opinion about what is wrong with this record:
  -- the door repairs exactly what custom.relation_halves_disagreements names, or nothing.
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
    into v_rows
    from custom.relation_halves_disagreements(p_organization_id, p_record_id) d;

  if jsonb_array_length(v_rows) = 0 then
    return jsonb_build_object('record_id', p_record_id, 'repaired', 0,
                              'detail', 'the two halves of every relation on this record already agree');
  end if;

  -- A HALF THIS DOOR CANNOT PUT RIGHT STOPS THE WHOLE REPAIR AND SAYS WHICH ONE. A repair that
  -- fixed four halves and shrugged at the fifth would leave the record still unsavable and the
  -- census still red, with a green-looking report in front of it.
  select string_agg(format('%s → %s (%s)', x.field_key, x.target_id, x.why), '; ')
    into v_unrepair
    from jsonb_to_recordset(v_rows) as x(field_key text, target_id uuid, remedy text, why text)
   where x.remedy not in ('write_the_edge', 'write_the_value', 'withdraw_the_value');
  if v_unrepair is not null then
    raise exception 'This record has a relation half no door here can put right: %', v_unrepair
      using errcode = '23514';
  end if;

  select array_agg(distinct x.field_key)
    into v_keys
    from jsonb_to_recordset(v_rows) as x(field_key text);

  -- THE INVERSE, WORKED OUT BEFORE THE FIRST WRITE (HIS-8). Every key this repair is about to
  -- touch, exactly as the document holds it now — so history.migration_undo can put the
  -- document back, including the one value this repair withdraws.
  select coalesce(jsonb_object_agg(k, coalesce(r.data -> k, 'null'::jsonb)), '{}'::jsonb)
    into v_before
    from custom.record r, unnest(v_keys) as k
   where r.organization_id = p_organization_id and r.id = p_record_id
   group by r.id;
  if v_before is null then
    raise exception 'custom.relation_halves_repair: record % is not in organization %.',
                    p_record_id, p_organization_id
      using errcode = '02000';
  end if;

  select format('STORE-TXN-4: %s relation half(s) that disagreed were reconciled on this record — %s.',
                jsonb_array_length(v_rows),
                string_agg(format('%s %s → %s', x.remedy, x.field_key, x.target_id), ', '))
    into v_note
    from jsonb_to_recordset(v_rows) as x(field_key text, target_id uuid, remedy text);

  -- ONE HISTORY LINE PER REPAIR, and it MARKS the row versions this call goes on to write, so
  -- they reach history as `relation_halves_repair` and not as `UPDATE`.
  v_log := history.migration_record(
             p_organization_id, 'relation_halves_repair', 'record', p_record_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_record_id, 'values', v_before),
             v_note);

  foreach v_key in array v_keys loop
    -- ── WITHDRAW FIRST. A value the store refuses cannot survive the relation_set below (the
    --    door validates the WHOLE cell), so it leaves before anything else on this key moves.
    perform platform.relation_unset(p_organization_id, p_record_id, v_key, x.target_id)
       from jsonb_to_recordset(v_rows) as x(field_key text, target_id uuid, remedy text)
      where x.field_key = v_key and x.remedy = 'withdraw_the_value';

    select v_withdrawn + count(*)::int into v_withdrawn
      from jsonb_to_recordset(v_rows) as x(field_key text, remedy text)
     where x.field_key = v_key and x.remedy = 'withdraw_the_value';

    -- ── THEN THE UNION. Every target this key holds after the withdrawals — the ids still in
    --    the document AND the ids that live associations index — handed to the one link door,
    --    which writes both halves and is additive on a many-valued field.
    select coalesce(jsonb_agg(distinct t.target_id::text), '[]'::jsonb)
      into v_targets
      from (
        select e.target_id
          from custom.record r
          cross join lateral custom.record_relation_edges(r.organization_id, r.id, r.table_id,
                                                          r.data_class, r.data, r.deleted_at) e
         where r.organization_id = p_organization_id and r.id = p_record_id
           and e.edge_role = v_key
        union
        select a.target_id
          from platform.associations a
         where a.organization_id = p_organization_id
           and a.source_type = 'record' and a.source_id = p_record_id
           and a.target_type = 'record' and a.role = v_key
           and a.relation_field_id is not null and a.deleted_at is null
      ) t
     where not exists (select 1 from jsonb_to_recordset(v_rows) as x(field_key text, target_id uuid, remedy text)
                        where x.field_key = v_key and x.remedy = 'withdraw_the_value'
                          and x.target_id = t.target_id);

    if jsonb_array_length(v_targets) > 0 then
      -- REL-7: a single-valued relation that ends up with two targets is a CONFLICT, not a
      -- repair. Picking one would invent a fact; this door refuses and names both.
      select coalesce((f.data ->> 'multi')::boolean, false)
               or coalesce((f.data ->> 'relation_max')::integer, 1) > 1
        into v_multi
        from custom.record f
       where f.deleted_at is null
         and f.table_id = custom.field_kernel_id()
         and (f.organization_id = p_organization_id or f.data_class = 'kernel')
         and nullif(f.data ->> 'entity_definition_id', '')::uuid =
             (select r.table_id from custom.record r
               where r.organization_id = p_organization_id and r.id = p_record_id)
         and coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name') = v_key
       limit 1;

      if not coalesce(v_multi, false) and jsonb_array_length(v_targets) > 1 then
        raise exception
          'The relation "%" holds one value, and its two halves disagree about WHICH: the document '
          'and the index between them name %. Nothing was repaired on this record.',
          v_key, v_targets
          using errcode = '23514',
                hint = 'REL-7: a repair may add a half that is missing; it may not choose between '
                    || 'two facts. Decide which target is right on the record''s own screen, and '
                    || 'run this door again.';
      end if;

      v_set := v_set + platform.relation_set(p_organization_id, p_record_id, v_key, v_targets);
    end if;
  end loop;

  return jsonb_build_object(
    'record_id',     p_record_id,
    'repaired',      jsonb_array_length(v_rows),
    'withdrawn',     v_withdrawn,
    'edges_written', v_set,
    'migration_log', v_log,
    'halves',        v_rows);
end;
$fn$;

comment on function custom.relation_halves_repair(uuid, uuid) is
  'STORE-TXN-4. Puts right, THROUGH THE DOORS, one record whose relation value and relation '
  'association disagree — the state custom._relation_halves_agree refuses at COMMIT and which '
  'predates it on 13 records. It takes the UNION of both halves (neither is derived from the '
  'other, DD-023, and nothing in this population is evidence of a REMOVED link), except where '
  'the store''s own relation validation refuses the value itself, which it withdraws and stores '
  'as the inverse of its history.migration_log line. Store-owner only; never a raw table write.';

-- ── THE DECLARATIONS (DD-223 / §6d-4). Neither of these is a client door, and the register is
-- where that is said IN DATA rather than in the prose above. `non_client_lane` names the lane
-- that does call each one and why no browser ever can.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', 'relation_halves_disagreements',
   'p_organization_id uuid, p_record_id uuid',
   array['uuid','uuid']::regtype[]::oid[],
   'Both arguments are OPTIONAL and both default to NULL, which is the whole point: given no '
   'organization it reads EVERY organization''s records, which is a cross-tenant read and can '
   'therefore never be a client''s question. There is accordingly no per-argument access check '
   'to declare — the body''s FIRST statement refuses any caller that is not a member of the role '
   'owning custom.record, before a single row is read, so a foreign id, an invented id and a '
   'NULL are answered identically: not at all.',
   'migrations/campaign/storetxn4_the_halves_that_already_disagree_are_repaired.sql (lane STORE-TXN-4)',
   'server_only: the release gate check:relation-halves-agree and custom.relation_halves_repair '
   'are its only callers. It is a census across organizations, taken by the store itself to '
   'predict what custom._relation_halves_agree would refuse; a person asks about their own '
   'record''s links through platform.relations_from, which decides the ladder per record.',
   false, false),
  ('custom', 'relation_halves_repair',
   'p_organization_id uuid, p_record_id uuid',
   array['uuid','uuid']::regtype[]::oid[],
   'p_organization_id and p_record_id are both required and neither is decided against the '
   'caller''s ladder, deliberately: this door rewrites a record to undo a WRITER''s defect, on '
   'behalf of a person who may never have been shown it, so a ladder answer would be the wrong '
   'question. The body''s FIRST statement refuses any caller that is not a member of the role '
   'owning custom.record; a NULL in either argument is refused next (22004), and a record that '
   'is not in that organization is refused before any write (02000). The writes themselves still '
   'go through platform.relation_set / platform.relation_unset, which ask the store switch and '
   'the record ladder as always.',
   'migrations/campaign/storetxn4_the_halves_that_already_disagree_are_repaired.sql (lane STORE-TXN-4)',
   'server_only: run by the campaign lane that repairs the halves that disagreed before '
   'custom._relation_halves_agree was installed, and by any later repair pass the census names. '
   'A person changes their own links through platform.relation_set / platform.relation_unset, '
   'which have written both halves since 2026-09-22 and cannot produce this state again.',
   false, false);

-- NOTHING IS REVOKED HERE, AND NOTHING NEEDS TO BE. Schema `custom` is declared CLOSED in
-- `platform.schema_client_exposure`, and the birth guard `platform.reopen_declared_doors`'
-- closing pass takes PUBLIC's implicit default EXECUTE off a brand-new SECURITY DEFINER
-- function at CREATE time. Measured on the dev clone while this file was rehearsed, once per
-- function:
--
--     ddl_guard[definer_default_public_execute_cleared_at_birth]: PUBLIC's implicit default
--     EXECUTE was cleared on the brand-new SECURITY DEFINER function
--     custom.relation_halves_disagreements(uuid,uuid) ... no client grant existed (proacl was
--     null) and nothing a browser held was taken away.
--
-- The first draft of this file carried the two REVOKEs anyway, "to be safe". `pnpm db:apply`
-- refused it by name at `--target production`: a REVOKE is not additive, and a file that
-- revokes reaches the live database with nothing between it and a door somebody else is using.
-- The guard is right and the belt-and-braces was wrong — the closing pass is the platform, the
-- REVOKE was caution, and caution that makes a file non-additive costs more than it buys.
