-- chair-step: it REPLACES the bodies of `platform.relation_set` and `platform.relation_unset`,
--   two live doors, and a replacement of a live body is outside the additive allow-list by
--   design. Nothing is dropped, no grant is revoked, no row of anybody's data is rewritten, both
--   signatures are BYTE-IDENTICAL and both `platform.client_callable_door` rows keep their
--   identity columns and their EXECUTE grants. The `-- based-on:` lines below pin the exact
--   bodies this was written against. The third statement ADDS one EXECUTE grant
--   (`custom.migrate_purge_hard` to `authenticated`) so that door's own written refusal is what a
--   client hears instead of PostgreSQL's; the body's chair-only check is its first statement and
--   is unchanged, so chair-only stays chair-only.
-- lock: custom,platform
-- lane: STORE-TXN-3
--
-- STORE-TXN-3 — A LINK IS TWO HALVES, AND THE ONE LINK WRITER WRITES BOTH.
--
-- WHAT WAS BROKEN, MEASURED FROM THE SEAT ON THE MAIN DATABASE (VERIFIER-13, item 4, today).
-- `custom.record_write_graph` — the store's all-or-nothing door — could not write a single graph
-- with children. Every call was refused at COMMIT:
--
--     a relation's ASSOCIATION landed with no value beside it — record 6cb0d333-… has no
--     'parts_used' holding f452d0e4-…
--
-- WHY. The door hangs its children on the parent through `platform.relation_set`, and
-- `relation_set`'s WHOLE write was one `insert into platform.associations`. It never wrote the
-- child ids into the parent document under the field's key — which is exactly what the refusal's
-- own hint asks for. Under the corrected REL-11 (DD-023, lane OLD-TABLES-1 this morning) *the
-- value is the target's id, the edge is an association written in the same transaction, and
-- neither is derived from the other*; the deferred constraint trigger
-- `custom._relation_halves_agree` has enforced that on the main database since 15:15:46Z, so a
-- writer that produces one half alone is refused at COMMIT. Two lanes each correct on their own
-- bytes; the pair did not work.
--
-- THE FIX IS AT THE LINK WRITER, NOT AT THE GRAPH DOOR. `custom.record_write_graph` is one of
-- the callers of `platform.relation_set`; a screen, an import, a backfill or a tool that reaches
-- the same door has the same defect, so repairing the graph door would have fixed one instance
-- of a class. `platform.relation_set` now writes BOTH halves of the fact it is asked to record,
-- and `custom.record_write_graph` needs no change at all beyond the call it already makes.
--
-- THE CENSUS OF THE CLASS — every writer that sets or unsets a relation from the store side,
-- asked of `pg_proc` (`prosrc ~* 'relation_field_id'`, 18 functions on production today):
--   · `platform.relation_set`     — the value half was never written.          FIXED HERE.
--   · `platform.relation_unset`   — the value half was never CLEARED, so it hit the guard's
--     mirror clause ("an ASSOCIATION was removed while its VALUE still names the record").
--     The same defect, the same transaction, the other direction.               FIXED HERE.
--   · `custom.relation_edges_withdraw` — withdraws edges when a field STOPS being a relation
--     (`custom.field_update`, `custom.field_retire`). After that change the field is no longer
--     of type `relation`, so `custom.record_relation_edges` reads no edge from the document and
--     the guard's `v_implied` is false: correct as it stands.                   NOT A DEFECT.
--   · `custom._relation_associations_stmt_insert` / `_stmt_update` — the store's own AFTER-
--     STATEMENT triggers, which derive the edge FROM the document. They are the other half of
--     this design and are what makes the write below land its association.      NOT A DEFECT.
--   · `platform.relation_delete_effects`, `platform.relations_from/to`,
--     `custom.query_*`, `custom.carrying_edges_*`, `custom.relation_target_card`,
--     `platform.relation_edges_without_a_live_field` — reads.                   NOT WRITERS.
--
-- HOW THE VALUE IS WRITTEN — THROUGH THE STORE'S OWN DOOR, NEVER A RAW `jsonb_set`.
-- `custom.record_update` is the store's document update path, and it is what is called here: so
-- the write carries `custom._take_op_id`'s envelope handling, `custom.assert_columns_are_defined`,
-- the value envelope, the field write door, the relation validation in `custom.validate_values`
-- (the target must be a live record of the table the field declared, and `relation_max` is
-- enforced), `platform._touch_row`'s version bump, `zzz_history_capture_s_u`'s history line and
-- `io_record_changed_s_u`'s realtime outbox notice. A `jsonb_set` straight into `custom.record`
-- would have skipped every one of them, which is the whole reason that door exists.
--
-- A CONSEQUENCE STATED PLAINLY, BECAUSE IT CHANGES WHAT A SUITE SHOULD ASSERT. Giving a record
-- lines now CHANGES that record — its relation field gains the ids — so the parent's `version`
-- moves from 1 to 2 and its history gains one honest line. STORE-TXN-2's repair clause asserted
-- `version == 1` on the reasoning that "a repair that bumps a version it did not change writes a
-- false line into that record's history". That reasoning was right and its premise is now false:
-- the record IS changed. The suite is corrected in the same push.
--
-- THE SHAPE OF THE VALUE FOLLOWS THE FIELD, NOT THIS FUNCTION'S CONVENIENCE. `custom.validate_values`
-- refuses a list in a single-valued field and a scalar in a multi one (FLD-2), so:
--   · multi  → the ids as a JSON array, the ones already there first and the new ones appended
--              in the order they were handed in, de-duplicated. That keeps `relation_set`'s
--              long-standing ADDITIVE behaviour (its insert has always been an upsert that
--              removes nothing), which the graph door's existing-parent repair arm depends on.
--   · single → the one id as a bare string, REPLACING what was there. The store's own
--              `_relation_associations_stmt_update` trigger then withdraws the superseded edge,
--              so the two halves still agree. Handed more than one target for a single-valued
--              field, the array is written and `custom.validate_values` refuses it by the
--              column's own name — an honest refusal beats a silent truncation.
-- A target that is NOT one of our records (`{"entity": "<token>", "row_id": …}`, W1-TIER's
-- external rows) keeps the edge-only behaviour it has always had: the document is a store
-- document and `custom.record_relation_edges` reads every uuid in a relation field as a RECORD
-- id, so writing an external row's id there would mint an edge pointing at a record that does
-- not exist. The guard is satisfied either way — its edge arm only speaks about record→record.
--
-- AND THE FIELD HAS TO BE A RELATION, SAID BY THIS DOOR'S OWN NAME. `platform.relation_field`
-- resolves a field by key and does not ask what it behaves as; `platform.relation_declaration`
-- does refuse a non-relation, but in its own name and only after two more reads. A caller that
-- hands `relation_set` the key of a text column is now told so by the door it called, before
-- anything is written.
--
-- THE THIRD STATEMENT — THE PURGE DOOR'S REFUSAL REACHES THE PERSON (VERIFIER-13, item 2's nit).
-- `custom.migrate_purge_hard` holds no EXECUTE grant for `authenticated`, so a client calling it
-- gets PostgreSQL's `permission denied for function migrate_purge_hard` and never reads the
-- door's own sentence — a refusal with no remedy, which is the one thing law 4 forbids. The body
-- was BUILT for this ("said twice… so a grant issued by mistake one day still does not open a
-- hard delete"): its FIRST statement refuses anybody who is not a member of the role that owns
-- `custom.record`, with the written sentence and the remedy. Granting EXECUTE therefore makes the
-- door client-callable ONLY in the sense that it can now answer in its own words; the hard delete
-- stays chair-only, proven by the green suite from the seat.
--
-- THE INVERSE: `migrations/inverse/storetxn3_a_link_writes_both_halves_down.sql`.
--
-- based-on: platform.relation_set(uuid, uuid, text, jsonb) 59960c611fa6c311a9ce1333831b27a634a45f28a11e38420224a7db043dae79
-- based-on: platform.relation_unset(uuid, uuid, text, uuid) b33c79acfb440f3e5da565192881d721c48d2c581cc41f39921da8d5ec659b62

set lock_timeout = '5s';
set statement_timeout = '300s';

create or replace function platform.relation_set(
  p_organization_id uuid, p_record_id uuid, p_field_key text, p_targets jsonb)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  d        jsonb;
  v_field  uuid;
  t        jsonb;
  i        integer := 0;
  v_type   text;
  v_id     uuid;
  v_written integer := 0;
  v_tbl    uuid;
  v_ftype  text;
  v_multi  boolean;
  v_rec_ids text[] := '{}'::text[];
  v_one    text;
  v_have   jsonb;
  v_new    jsonb;
  v_value  jsonb;
begin
  perform platform.assert_relations_door(p_organization_id);
  -- BOTH ENDS, BEFORE THE FIRST WRITE. Linking is a change to the SOURCE record, so it asks
  -- editor there; and the TARGET is a record in another table whose title this link then
  -- shows on the source's screen, so it asks viewer there. A link you could make to a record
  -- you may not see would be a way to read one row at a time by guessing ids.
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'platform.relation_set',
                                          'editor'::public.permission_level, 'record');
  v_field := platform.relation_field(p_organization_id, p_record_id, p_field_key);

  -- THE FIELD HAS TO BE A RELATION, AND THIS DOOR SAYS SO IN ITS OWN NAME. `relation_field`
  -- answers for any field of the table; `relation_declaration` refuses a non-relation but in
  -- its own words, after two more reads. A caller that named a text column hears it here.
  select nullif(f.data ->> 'type', ''), coalesce((f.data ->> 'multi')::boolean, false)
    into v_ftype, v_multi
    from custom.record f
   where f.id = v_field
     and (f.organization_id = p_organization_id or f.data_class = 'kernel')
     and f.deleted_at is null;
  if coalesce(v_ftype, '') <> 'relation' then
    raise exception 'platform.relation_set: "%" is not a relation on this record''s table — it behaves as %',
                    p_field_key, coalesce(v_ftype, 'nothing')
      using errcode = '23514',
            hint = 'REL-10 / FLD-1: only a field whose behavior is `relation` carries a link. Nothing was written. Declare the relation field (custom.field_declare) and call this with its key, or write the value through custom.record_update if the column is an ordinary one.';
  end if;

  d := platform.relation_declaration(p_organization_id, v_field);

  if jsonb_typeof(p_targets) <> 'array' then
    raise exception 'the targets of a relation are a list, and this is %', jsonb_typeof(p_targets)
      using errcode = '22023',
            hint = 'REL-7: a relation points at at most one thing, or at many - both are written as a list, so the shape never has to change when the cardinality does. One target is a list of one.';
  end if;

  for t in select * from jsonb_array_elements(p_targets) loop
    i := i + 1;
    if jsonb_typeof(t) = 'string' then
      v_type := 'record'; v_id := (t #>> '{}')::uuid;
    else
      v_type := coalesce(nullif(t ->> 'entity', ''), 'record');
      v_id   := nullif(t ->> 'row_id', '')::uuid;
    end if;
    if v_id is null then
      raise exception 'target % of this relation names no row', i using errcode = '22004';
    end if;

    if v_type = 'record' then
      perform custom.assert_client_may_open(p_organization_id, v_id, 'platform.relation_set',
                                            'viewer'::public.permission_level, 'record');
      select r.table_id into v_tbl
        from custom.record r
       where r.organization_id = p_organization_id and r.id = v_id and r.deleted_at is null;
      if v_tbl is not null then
        perform custom.assert_may_know_table(p_organization_id, v_tbl, 'platform.relation_set');
      end if;
      -- THE VALUE HALF'S TARGETS, in the order they were handed in.
      if not (v_id::text = any (v_rec_ids)) then
        v_rec_ids := v_rec_ids || v_id::text;
      end if;
    end if;

    insert into platform.associations
      (source_type, source_id, target_type, target_id, organization_id, role, position,
       relation_field_id, origin, payload_kind, payload, created_by)
    values
      ('record', p_record_id, v_type, v_id, p_organization_id, p_field_key,
       case when (d ->> 'ordered')::boolean then i else null end,
       v_field, 'campaign',
       case when d ->> 'binding' = 'snapshot' then 'relation_snapshot' else null end,
       case when d ->> 'binding' = 'snapshot'
            then platform.relation_snapshot_of(p_organization_id, v_type, v_id) else null end,
       (select auth.uid()))
    on conflict (source_type, source_id, target_type, target_id, role) do update
      set position          = excluded.position,
          relation_field_id = excluded.relation_field_id,
          origin            = excluded.origin,
          payload_kind      = excluded.payload_kind,
          payload           = excluded.payload,
          deleted_at        = null;
    v_written := v_written + 1;
  end loop;

  -- ── THE VALUE HALF (REL-11 as corrected under DD-023) ──────────────────────────────────
  -- LAST, so the store's own AFTER-STATEMENT trigger has the final word on `position`: it
  -- numbers the edges by their ordinality in the document array, which is the order a screen
  -- reads them in. Two writers numbering the same slots is how two writers come to disagree
  -- about them, so the document's order is the one that stands.
  if array_length(v_rec_ids, 1) is not null then
    select case
             when jsonb_typeof(r.data -> p_field_key) = 'array'  then r.data -> p_field_key
             when jsonb_typeof(r.data -> p_field_key) = 'string' then jsonb_build_array(r.data -> p_field_key)
             else '[]'::jsonb
           end
      into v_have
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
    v_have := coalesce(v_have, '[]'::jsonb);

    if v_multi then
      -- ADDITIVE, which is what this door has always been: its insert removes nothing, and the
      -- graph door's existing-parent repair arm gives a parent the lines it never got without
      -- taking away the ones it has.
      v_new := v_have;
      foreach v_one in array v_rec_ids loop
        if not exists (select 1 from jsonb_array_elements_text(v_new) x(v) where x.v = v_one) then
          v_new := v_new || jsonb_build_array(to_jsonb(v_one));
        end if;
      end loop;
    else
      -- AT MOST ONE (REL-7): setting it REPLACES. The store's own statement trigger withdraws
      -- the edge that is no longer named, so both halves still agree at COMMIT.
      v_new := '[]'::jsonb;
      foreach v_one in array v_rec_ids loop
        v_new := v_new || jsonb_build_array(to_jsonb(v_one));
      end loop;
    end if;

    v_value := case when not v_multi and jsonb_array_length(v_new) = 1
                    then v_new -> 0 else v_new end;

    if v_value is distinct from (case when v_multi then v_have
                                      when jsonb_array_length(v_have) = 1 then v_have -> 0
                                      else v_have end) then
      -- THE STORE'S OWN DOCUMENT DOOR, never a raw jsonb_set: the envelope, the declared-column
      -- check, the field write door, the relation validation, the version bump, the history
      -- line and the realtime notice all come from it.
      perform custom.record_update(p_organization_id, p_record_id,
                                   jsonb_build_object(p_field_key, v_value));
    end if;
  end if;

  return v_written;
end;
$fn$;

comment on function platform.relation_set(uuid, uuid, text, jsonb) is
  'W1-REL / REL-10 / REL-11 as corrected under DD-023: the ONE writer of a link from the store side, and it writes BOTH halves in one transaction — the association row AND the target''s id into the source record''s own document under the field''s key, through custom.record_update so the envelope, the declared-column check, the relation validation, the version, the history line and the realtime notice are the store''s own. RELATION-DECLARE: SECURITY DEFINER, asks editor on the source and viewer on every target. STORE-TXN-3: a field that is not a relation is refused by this door''s own name before anything is written; an external (non-record) target keeps its edge-only shape.';

create or replace function platform.relation_unset(
  p_organization_id uuid, p_record_id uuid, p_field_key text, p_target_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_n     integer;
  v_have  jsonb;
  v_left  jsonb;
  v_multi boolean;
  v_value jsonb;
begin
  perform platform.assert_relations_door(p_organization_id);
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'platform.relation_unset',
                                          'editor'::public.permission_level, 'record');

  -- WHAT THIS CALL UNMAKES, COUNTED BEFORE EITHER HALF MOVES. Clearing the value makes the
  -- store's own statement trigger withdraw the edge, so the UPDATE below would find nothing
  -- left to report and this door would answer 0 for a link it really did unmake.
  select count(*) into v_n
    from platform.associations a
   where a.organization_id = p_organization_id
     and a.source_type = 'record' and a.source_id = p_record_id
     and a.role = p_field_key and a.target_id = p_target_id
     and a.deleted_at is null;

  -- ── THE VALUE HALF. DD-023: neither half is derived from the other, so removing the edge
  --    alone leaves a cell the index cannot find — which is exactly what
  --    `custom._relation_halves_agree` refuses at COMMIT.
  select case
           when jsonb_typeof(r.data -> p_field_key) = 'array'  then r.data -> p_field_key
           when jsonb_typeof(r.data -> p_field_key) = 'string' then jsonb_build_array(r.data -> p_field_key)
           else null
         end
    into v_have
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;

  if v_have is not null
     and exists (select 1 from jsonb_array_elements_text(v_have) x(v) where x.v = p_target_id::text) then
    select coalesce(jsonb_agg(x.v order by x.ord), '[]'::jsonb)
      into v_left
      from jsonb_array_elements(v_have) with ordinality x(v, ord)
     where (x.v #>> '{}') <> p_target_id::text;
    select coalesce((f.data ->> 'multi')::boolean, false) into v_multi
      from custom.record f
     where f.deleted_at is null
       and (f.organization_id = p_organization_id or f.data_class = 'kernel')
       and (f.data ->> 'entity_definition_id')::uuid =
           (select r.table_id from custom.record r
             where r.organization_id = p_organization_id and r.id = p_record_id)
       and coalesce(nullif(f.data ->> 'key', ''), f.data ->> 'name') = p_field_key
     limit 1;
    -- An emptied single-valued cell is JSON null — the store reads null and absence as the
    -- same absence — and an emptied list is an empty list, which is that field's own empty.
    v_value := case
                 when coalesce(v_multi, false) then v_left
                 when jsonb_array_length(v_left) = 1 then v_left -> 0
                 when jsonb_array_length(v_left) = 0 then 'null'::jsonb
                 else v_left end;
    perform custom.record_update(p_organization_id, p_record_id,
                                 jsonb_build_object(p_field_key, v_value));
  end if;

  -- ── THE EDGE HALF. A relation is UNMADE the way every edge in this platform is: soft, so the
  --    reverse end and the history both keep their record of it (REL-13). Idempotent on purpose:
  --    when the value half's trigger has already withdrawn this edge, this changes nothing, and
  --    for an external target (which the document never carries) it is the only writer.
  update platform.associations a
     set deleted_at = now()
   where a.organization_id = p_organization_id
     and a.source_type = 'record' and a.source_id = p_record_id
     and a.role = p_field_key and a.target_id = p_target_id
     and a.deleted_at is null;

  return v_n;
end;
$fn$;

comment on function platform.relation_unset(uuid, uuid, text, uuid) is
  'W1-REL / REL-13 / REL-11 as corrected under DD-023: unmakes a link by BOTH halves in one transaction — the id leaves the source record''s own document through custom.record_update, and the association is soft-deleted so the reverse end and the history keep their record of it. Returns the number of live links this call unmade, counted before either half moved.';

-- ── THE HARD-PURGE DOOR ANSWERS IN ITS OWN WORDS (VERIFIER-13 item 2's nit, law 4) ──────────
-- Without this grant a signed-in caller hears PostgreSQL — `permission denied for function
-- migrate_purge_hard` — and the door's own sentence, which names the remedy (archive through
-- `custom.migrate_purge`, and that this is a compliance erasure run by a person at a terminal),
-- is written, correct and unreachable. A refusal with no remedy is the one thing law 4 forbids.
-- CHAIR-ONLY STAYS CHAIR-ONLY: the body's FIRST statement refuses anyone who is not a member of
-- the role that owns `custom.record`, and it was written for exactly this ("said twice… so a
-- grant issued by mistake one day still does not open a hard delete"). `anon` gets nothing.
-- THE REGISTER FIRST, THEN THE GRANT — the order §6d-4 enforces. `platform.client_callable_door`
-- is the database's own statement of what a browser session reaches, and its event trigger
-- refused this grant while the row still said `signed_in_callers = false`
-- (`ddl_guard[client_grant_on_a_non_client_door]`, measured on the clone 2026-09-22). It was
-- right to: a grant that contradicts the register is a door whose declaration lies. So the row
-- is corrected FIRST and says exactly who the signed-in caller is and what they get — the
-- refusal and nothing else. `door_body_must_decide` is satisfied by the body as it stands
-- (`platform.definer_body_decides_access` answers true), and the chair-only check is that
-- body's first statement.
update platform.client_callable_door
   set signed_in_callers = true,
       non_client_lane   = null,
       reason = 'The hard delete, moved off the path every screen reaches. Under the owner''s law of 2026-09-20 nothing important is deleted and nothing is purged by default: custom.migrate_purge archives, and this door destroys only after every record in scope has been archived for at least thirty days and a written reason of at least forty characters has been given, in chunks, under its own lock_timeout, never touching an id custom.record_alias still resolves to. STORE-TXN-3, 2026-09-22: a signed-in caller may now CALL it, and the only thing a signed-in caller ever gets from it is its own written refusal naming the remedy — the body''s FIRST statement refuses anyone who is not a member of the role that owns custom.record, before the organization, the reason and the retention window are even read. It was opened because without an EXECUTE grant the person heard PostgreSQL''s "permission denied for function migrate_purge_hard" and never the door''s sentence, which is a refusal with no remedy (VERIFIER-13 item 2).'
 where schema_name = 'custom'
   and function_name = 'migrate_purge_hard';

grant execute on function custom.migrate_purge_hard(uuid, uuid, text, integer, boolean)
  to authenticated;
