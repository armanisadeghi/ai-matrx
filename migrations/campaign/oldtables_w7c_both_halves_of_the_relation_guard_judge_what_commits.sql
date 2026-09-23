-- additive: yes — ONE `create or replace function` of a trigger FUNCTION BODY,
--   custom._relation_halves_agree(). No trigger is created, dropped or altered; no table,
--   policy, grant or row is touched. DDL-LOCK census: ACCESS SHARE on no table.
-- based-on: custom._relation_halves_agree() 0d2c64a59554fb4b641deaad68d51ad16be911458676d56a5760c64082699842
-- lock: platform
-- lane: OLD-TABLES-4
--
-- OLD-TABLES-CUTOVER rev 2 W7 — THE VALUE HALF OF THE RELATION GUARD JUDGES THE COMMITTED ROW.
--
-- W0 (OLD-TABLES-1) made the two halves of a relation unable to disagree: DEFERRED constraint
-- triggers that run at COMMIT. Its EDGE half re-reads the record; its VALUE half read the
-- trigger's NEW, which for a deferred row trigger is the state as of the statement that
-- queued the event. So a transaction that moved a relation value A -> B -> A was refused on
-- B ("a relation landed its VALUE with no association beside it"), although what commits is
-- A with A's edge. Found moving Rincon Plumbing — Service Calls on the dev clone: service
-- call cfc72430's customer went 771155c3 -> dc112062 -> 771155c3 in its real history.
-- The EDGE half had the same shape (it judged the association's NEW, so A -> B -> A's
-- withdrawal of A was refused) and now asks whether a LIVE edge exists as the transaction
-- commits. The guard's intent is unchanged: a value that COMMITS with no edge is refused exactly as
-- before. Inverse: the previous body, byte for byte.

CREATE OR REPLACE FUNCTION custom._relation_halves_agree()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rec       custom.record%rowtype;
  v_missing   text;
  v_implied   boolean;
  v_org       uuid;
  v_source    uuid;
  v_target    uuid;
  v_role      text;
  v_going     boolean;   -- is this edge on its way OUT (hard delete or soft delete)?
  v_live      boolean;   -- does a LIVE edge for this pair exist as the transaction commits?
begin
  -- ── THE VALUE HALF ────────────────────────────────────────────────────────────────────
  -- Every edge this record's document implies must have a live association by COMMIT.
  if tg_table_schema = 'custom' then
    -- JUDGE THE ROW AS IT COMMITS, NOT AS IT WAS WHEN THIS EVENT WAS QUEUED. A deferred
    -- row trigger is handed the NEW of the statement that queued it, so a record whose
    -- relation changed twice in one transaction (771155c3 -> dc112062 -> 771155c3) was
    -- judged on the middle value, whose edge the second update had already withdrawn:
    -- a refusal of a transaction whose committed halves agree. The EDGE half below
    -- already re-reads the record; the value half now does the same, so both halves
    -- judge the one state that commits. Found by lane OLD-TABLES-4 on the clone.
    select r.* into v_rec
      from custom.record r
     where r.organization_id = new.organization_id
       and r.id = new.id;
    if not found or v_rec.data_class <> 'record' or v_rec.deleted_at is not null then
      return null;
    end if;
    select string_agg(format('%L → %s', e.edge_role, e.target_id), ', ' order by e.edge_role)
      into v_missing
      from custom.record_relation_edges(v_rec.organization_id, v_rec.id, v_rec.table_id,
                                        v_rec.data_class, v_rec.data, v_rec.deleted_at) e
     where not exists (
             select 1
               from platform.associations a
              where a.source_type = 'record'
                and a.source_id   = v_rec.id
                and a.target_type = 'record'
                and a.target_id   = e.target_id
                and a.role        = e.edge_role
                and a.deleted_at is null);

    if v_missing is not null then
      raise exception
        using errcode = '23514',
              message = format(
                'a relation landed its VALUE with no association beside it — record %s names %s',
                new.id, v_missing),
              detail  = 'REL-11, corrected under DD-023: a relation''s value is the target''s id and the '
                     || 'edge is an association written in the same transaction. Neither is derived from '
                     || 'the other, and neither may land alone.',
              hint    = 'Write the edge in the same transaction, or let the store''s own '
                     || 'zz_w2a_relation_association_s_* triggers write it — do not disable them.';
    end if;
    return null;
  end if;

  -- ── THE EDGE HALF ─────────────────────────────────────────────────────────────────────
  -- Only a RELATION edge is ours: one that names the field it came from. Every other kind of
  -- association on this table (containment, surface bindings, lineage) is somebody else's law.
  if coalesce(new.relation_field_id, old.relation_field_id) is null then
    return null;
  end if;

  v_org    := coalesce(new.organization_id, old.organization_id);
  v_source := coalesce(new.source_id, old.source_id);
  v_target := coalesce(new.target_id, old.target_id);
  v_role   := coalesce(new.role, old.role);
  v_going  := (tg_op = 'DELETE') or (new.deleted_at is not null);

  if coalesce(new.source_type, old.source_type) <> 'record'
     or coalesce(new.target_type, old.target_type) <> 'record' then
    return null;
  end if;

  select r.* into v_rec
    from custom.record r
   where r.organization_id = v_org
     and r.id = v_source;

  v_implied := found and exists (
    select 1
      from custom.record_relation_edges(v_rec.organization_id, v_rec.id, v_rec.table_id,
                                        v_rec.data_class, v_rec.data, v_rec.deleted_at) e
     where e.target_id = v_target
       and e.edge_role = v_role);

  -- THE EDGE HALF JUDGES THE COMMITTED STATE TOO. The event's NEW/OLD is the association as
  -- the queuing statement left it; a value moved A -> B -> A withdraws A's edge and then writes
  -- A's edge again, and the withdrawal's event would refuse a transaction that commits with A
  -- and a live edge for A. So the question is asked of what is there NOW: a live edge for this
  -- (source, target, role) with no value behind it, or a value with no live edge.
  v_live := exists (
    select 1
      from platform.associations a
     where a.source_type = 'record'
       and a.source_id   = v_source
       and a.target_type = 'record'
       and a.target_id   = v_target
       and a.role        = v_role
       and a.relation_field_id is not null
       and a.deleted_at is null);
  v_going := not v_live;

  if not v_going and not v_implied then
    raise exception
      using errcode = '23514',
            message = format(
              'a relation''s ASSOCIATION landed with no value beside it — record %s has no %L holding %s',
              v_source, v_role, v_target),
            detail  = 'REL-11, corrected under DD-023: the value and the edge are two halves of one fact '
                   || 'and can never disagree. An edge with no cell behind it is an index of something '
                   || 'nobody wrote.',
            hint    = 'Write the id into the record''s own document under the field''s key in the same '
                   || 'transaction, and the store''s triggers will write this edge for you.';
  end if;

  if v_going and v_implied then
    raise exception
      using errcode = '23514',
            message = format(
              'a relation''s ASSOCIATION was removed while its VALUE still names the record — record %s '
              || 'still holds %s under %L',
              v_source, v_target, v_role),
            detail  = 'REL-11, corrected under DD-023: neither half is derived from the other, so removing '
                   || 'the edge alone leaves a cell the index cannot find.',
            hint    = 'Clear the id from the record''s document in the same transaction.';
  end if;

  return null;
end;
$function$;
