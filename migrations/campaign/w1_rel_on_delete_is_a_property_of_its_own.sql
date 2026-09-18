-- target: branch,production
-- additive: yes
-- guard: custom/associations_guard
--
-- W1-REL, FILE 6 — REL-2 AND T7: WHAT HAPPENS TO A RELATION WHEN THE THING IT POINTS AT GOES.
--
-- REL-2: *`on_delete` is `cascade`, `set_null`, or `restrict`, A PROPERTY SEPARATE FROM FLAVOR.*
-- Separate is the load-bearing word and it is enforced in file 2's declaration: the Field's own
-- `on_target_delete` wins outright, and flavor only supplies a DEFAULT when the Field says
-- nothing. An owned relation may `restrict`; a referenced one may `cascade`.
--
-- T7, WHICH OF ITS FIVE SENTENCES ARE THIS LANE'S AND WHICH ARE NOT - SAID PLAINLY.
--   THIS LANE'S, and built here:
--     · "Deleting Widget takes its 500 serial-number contained records"  -> `cascade`
--     · "Deleting a Supplier with purchase orders is refused, naming them" -> `restrict`, and
--       the refusal NAMES them, which is why `platform.relation_delete_effects` returns the
--       labels rather than a count. A count is not a name.
--     · "Deleting a Tag detaches from everything it touched"            -> `set_null`
--   NOT THIS LANE'S, and named rather than quietly claimed:
--     · "Deleting Project Y, Home to Incident with 50 records, is refused by default" is the
--       HOME's refusal - `W1-TABLE`'s, REC-11 / REC-14.
--     · "Deleting a Field that a Formula depends on is refused, naming the Formula" is
--       `W3-MIG`'s, stated as a required input of that lane's exit in BUILD-BOOK §1.
--     · "One delete verb throughout" is `W1-STORE`'s `custom.record_delete`.
--
-- WHY THIS IS A CALLABLE FUNCTION AND NOT A TRIGGER ON `custom.record`.
-- Two reasons, and neither is convenience. First, the LOCK: `custom.record` and every trigger on
-- it live under `LOCK:custom`, whose fourteen-hold chain does not include this lane (§4.1); this
-- lane holds `LOCK:platform`, and a lane that writes DDL outside its lock is the collision the
-- lock exists to prevent. Second, the OWNER: BUILD-BOOK §1 gives `W3-MIG` "the ten Migration
-- verbs, their inverse payloads, `on_delete` handling" in its own `builds` cell - so the WIRING
-- of these three outcomes into the one delete verb is that lane's by the book, and what is
-- missing until it lands is the CALL, never the meaning. This file is the meaning, complete,
-- callable and proven; `W3-MIG` adds one line to `custom.record_delete`.
-- Recorded in this lane's report so it is a handover and not a hole.
--
-- EXTERNAL TARGETS ARE READ-ONLY IN V1 (the REL-8 ruling, BUILD-LOG 01:45 UTC), and THIS is the
-- file where that has teeth: a `cascade` or `set_null` that would travel down a relation into a
-- row behind a connection is REFUSED BY NAME, with the remedy - the external source's own
-- write-through, which is not a relation's route. A silent skip there would be a deletion the
-- caller believes happened.
--
-- THE INVERSE: `migrations/inverse/w1_rel_on_delete_is_a_property_of_its_own_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '300s';

create or replace function platform.relation_delete_effects(p_organization_id uuid, p_record_id uuid)
returns table(action text, role text, other_type text, other_id uuid, label text)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
begin
  perform platform.assert_relations_door(p_organization_id);
  -- Every LIVE relation POINTING AT this record, read from the reverse end (REL-9) - because
  -- what happens when a record is deleted is decided by the relations that point AT it, never by
  -- the ones it points FROM. Reading it any other way answers the wrong question confidently.
  return query
    select platform.relation_declaration(p_organization_id, a.relation_field_id) ->> 'on_delete',
           a.role, a.source_type, a.source_id,
           platform.relation_label(p_organization_id, a.source_type, a.source_id)
      from platform.associations a
     where a.organization_id = p_organization_id
       and a.target_id = p_record_id
       and a.relation_field_id is not null
       and a.deleted_at is null
     order by a.role, a.created_at;
end;
$fn$;

create or replace function platform.relation_on_delete(p_organization_id uuid, p_record_id uuid)
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  e         record;
  v_names   text;
  v_cascade uuid[] := '{}';
  v_detach  integer := 0;
  v_ext     text;
begin
  perform platform.assert_relations_door(p_organization_id);

  -- RESTRICT FIRST, AND IT NAMES THEM. T7's own sentence is "refused, NAMING them", so the
  -- refusal carries the labels `platform.relation_label` hydrates at read - never a count, and
  -- never the ids, which tell the person nothing about what is in their way.
  select string_agg(distinct coalesce(x.label, x.other_id::text), ', ') into v_names
    from platform.relation_delete_effects(p_organization_id, p_record_id) x
   where x.action = 'restrict';
  if v_names is not null then
    raise exception 'this is still used by %, so it was not deleted', v_names
      using errcode = '23503',
            hint = 'REL-2 / T7: this relation is set to refuse the delete while anything still points at it. Remove those first, or change what the field does when the thing it points at is deleted.';
  end if;

  -- CASCADE. An external row is not ours to delete - the REL-8 ruling makes external targets
  -- read-only in v1 - and a cascade that quietly skipped one would be a deletion the caller
  -- believes happened.
  select string_agg(distinct x.other_type, ', ') into v_ext
    from platform.relation_delete_effects(p_organization_id, p_record_id) x
   where x.action in ('cascade', 'set_null') and x.other_type <> 'record';
  if v_ext is not null then
    raise exception 'something outside this system (%) is attached to this, and nothing here can change it', v_ext
      using errcode = '0A000',
            hint = 'REL-N-1 / the REL-8 ruling: a relation may POINT at a row behind a connection, and in this version nothing writes back down it. Detach it in the system it lives in, or use that source''s own write-through - a relation is not a route into somebody else''s database.';
  end if;

  for e in select * from platform.relation_delete_effects(p_organization_id, p_record_id) loop
    if e.action = 'cascade' then
      v_cascade := v_cascade || e.other_id;
    elsif e.action = 'set_null' then
      update platform.associations a
         set deleted_at = now()
       where a.organization_id = p_organization_id
         and a.source_id = e.other_id and a.role = e.role
         and a.target_id = p_record_id and a.deleted_at is null;
      v_detach := v_detach + 1;
    end if;
  end loop;

  -- The cascade DELETES nothing here: it RETURNS the records the delete has to take with it, so
  -- the one delete verb (`custom.record_delete`, W1-STORE's) stays the only thing that deletes a
  -- record - T7's "one delete verb throughout" survives this file rather than being quietly
  -- forked by it. `W3-MIG` wires the returned list into that verb.
  return jsonb_build_object(
    'restricted_by', '[]'::jsonb,
    'detached',      v_detach,
    'cascade_to',    to_jsonb(v_cascade));
end;
$fn$;

comment on function platform.relation_on_delete(uuid, uuid) is
  'W1-REL / REL-2 / T7: the three outcomes a relation declares for the deletion of what it points at. restrict RAISES naming the records in the way; set_null soft-detaches the edges here; cascade RETURNS the records the one delete verb must take with it, so this function never becomes a second delete path. W3-MIG wires it into custom.record_delete.';
