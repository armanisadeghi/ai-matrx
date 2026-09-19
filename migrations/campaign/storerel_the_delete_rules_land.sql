-- chair-step: it replaces two GUARDS that run on every write - custom._record_field_validation on
--   custom.record and platform.relation_on_delete under the delete door - and neither body names
--   `custom/system_enabled` as a literal string, which is what the static guard check looks for.
--   Both DO reach that knob: the first through `custom.assert_store_door`, the second through
--   `platform.assert_relations_door` -> `platform.relations_are_on` -> `custom.store_is_open`, and
--   the check cannot follow a call. Writing a second, redundant knob read into a trigger that
--   already asks the one door predicate would be a mention rather than a switch, and would teach
--   the next author that the guard line is a formality. Both replacements are otherwise additive
--   in effect: each carries its `-- based-on:` line, nothing is dropped, nothing is granted or
--   revoked, and no row of any feature is deleted or rewritten.
-- based-on: custom._record_field_validation() 090f5e8b95ac780b068e3754eb4c3be017e33821329e1a2a2688c511f58ad115
-- based-on: platform.relation_on_delete(uuid, uuid) 10ab12458303b4fb0a7abf2d7196edb44184c83191c64d4df4ffd8fc1bff9867
--
-- STORE-REL 7 — T7, THE OTHER HALF OF THE DELETE. THE RULES FIRE, AND NOW THEY LAND.
--
-- STORE-REL 1 made the delete rules VISIBLE: every relation edge names its field, so
-- `platform.relation_delete_effects` finds them and restrict, set_null and cascade all resolve.
-- Running T7 end to end then found the two places where the resolved rule could not be CARRIED
-- OUT, and both are the same class of mistake:
--
--   1. `custom._record_field_validation` judges a SOFT DELETE as a write. REC-51 refuses a
--      relation field pointing at a record that is not live, and a cascade deletes the target
--      FIRST — so the record the cascade is taking with it could never be deleted at all
--      ("Supplier points at something that is not there", measured on the main database while
--      T7 clause 1d ran). This is the same defect lane TABLE-DELETE found in
--      `custom._field_shape_guard` and fixed with the same sentence: a retirement is not a
--      change of shape. Here it is in the other guard.
--
--   2. `platform.relation_on_delete`'s set_null arm withdrew the EDGE and left the target's id
--      in the relating record's DOCUMENT — the fourth pass's *"detach-everywhere left the
--      pointer dangling at a record that no longer exists"*. Detaching now takes the value,
--      through the ordinary document write, so the edge is withdrawn by the one trigger that
--      withdraws edges rather than by a second path that can disagree with it.
--
-- Nothing else is waived. A write that changes the document, the table or the data class is
-- validated exactly as before, a RESTORE is validated exactly as before, and restrict and
-- cascade are untouched.
--
-- INVERSE: migrations/inverse/storerel_the_delete_rules_land_down.sql

set lock_timeout = '3s';
set statement_timeout = '2min';

CREATE OR REPLACE FUNCTION custom._record_field_validation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_type_field text;
  v_rtype      text;
  v_fields     custom.record[];
  v_gone       custom.record[];
  g            custom.record;
  v_retired    jsonb;
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');
  -- THE SWITCH, by name: custom.assert_store_door resolves custom/system_enabled through
  -- custom.store_is_open, and while it is off this store takes writes only from the role
  -- that owns custom.record.

  -- The kernel is defined in code, the Tables and the Fields and the merge fields have their
  -- own shape guards, and a relation row carries an edge rather than a document.
  if new.data_class in ('kernel', 'relation')
     or new.table_id is null
     or new.table_id = custom.table_kernel_id()
     or new.table_id = custom.field_kernel_id() then
    return new;
  end if;

  -- A RETIREMENT IS NOT A CHANGE OF SHAPE. The same sentence `custom._field_shape_guard`
  -- already carries (lane TABLE-DELETE, 2026-09-19), in the other guard that judges a soft
  -- delete as a write. An update whose ONLY change is `deleted_at` going from nothing to a
  -- time is a record leaving, and re-validating its values refuses the delete for something
  -- the delete ITSELF is causing: REC-51 says a relation field points at a LIVE record, and a
  -- cascade deletes the target FIRST — so the record going with it could never be deleted at
  -- all, and T7's `cascade` and `set_null` arms both died here. Nothing else is waived: a
  -- write that changes the document, the table or the data class is validated exactly as
  -- before, and so is a restore (deleted_at going back to nothing).
  if tg_op = 'UPDATE'
     and old.deleted_at is null and new.deleted_at is not null
     and old.data       is not distinct from new.data
     and old.table_id   is not distinct from new.table_id
     and old.data_class is not distinct from new.data_class then
    return new;
  end if;

  v_type_field := custom.table_type_field(new.organization_id, new.table_id);
  if v_type_field is not null then
    v_rtype := new.data ->> v_type_field;
  end if;

  select array_agg(f) into v_fields
    from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) f;
  if v_fields is null then
    return new;               -- a Table that declared no definitions validates nothing.
  end if;

  -- T8's retype: a Value that stops applying is neither coerced nor deleted. It is moved,
  -- WITH ITS REASON, and the field is then hidden by custom.applicable_fields. This is a
  -- STAND-IN for History and says so: W3-HIST (HIS-*) owns the real store, and when it
  -- lands this block writes there instead. Until then the value is in the document, not gone.
  if tg_op = 'UPDATE' and v_type_field is not null
     and (old.data ->> v_type_field) is distinct from v_rtype then
    select array_agg(f) into v_gone
      from custom.applicable_fields(new.organization_id, new.table_id,
                                    old.data ->> v_type_field) f
     where not exists (select 1
                         from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) a
                        where a.id = f.id);
    v_retired := coalesce(new.data -> '_retired', '[]'::jsonb);
    if v_gone is not null then
      foreach g in array v_gone loop
        if old.data ? (g.data ->> 'key') and jsonb_typeof(old.data -> (g.data ->> 'key')) <> 'null' then
          v_retired := v_retired || jsonb_build_object(
            'key',   g.data ->> 'key',
            'label', g.data ->> 'label',
            'value', old.data -> (g.data ->> 'key'),
            -- W1-VAL (1 of 2): a retired Value takes its ENVELOPE with it. Where a value came
            -- from, who wrote it and its other candidates are facts about that value, so they
            -- belong beside it in _retired and not orphaned in _values pointing at nothing.
            'envelope', old.data -> '_values' -> (g.data ->> 'key'),
            'reason', format('this record became a %s, and %s does not apply to a %s',
                             coalesce(v_rtype, 'different kind of thing'),
                             coalesce(nullif(g.data ->> 'label', ''), g.data ->> 'key'),
                             coalesce(v_rtype, 'record of that kind')),
            'at', to_jsonb(now()));
          new.data := new.data - (g.data ->> 'key');
          if jsonb_typeof(new.data -> '_values') = 'object' then
            new.data := jsonb_set(new.data, '{_values}',
                                  (new.data -> '_values') - (g.data ->> 'key'));
          end if;
        end if;
      end loop;
      if jsonb_array_length(v_retired) > 0 then
        new.data := jsonb_set(new.data, '{_retired}', v_retired);
      end if;
    end if;
  end if;

  perform custom.validate_values(new.organization_id, v_fields, new.data, v_rtype);
  -- W1-VAL (2 of 2): the half of the envelope law that needs the definitions.
  perform custom.validate_value_envelope(new.organization_id, v_fields, new.data);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.relation_on_delete(p_organization_id uuid, p_record_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  e         record;
  v_names   text;
  v_cascade uuid[] := '{}';
  v_detach  integer := 0;
  v_ext     text;
begin
  -- THE SWITCH, by name: platform.assert_relations_door resolves custom/system_enabled
  -- through custom.store_is_open, so while that knob is off for an organization this
  -- surface answers only the role that owns platform.associations.
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
      -- THE VALUE GOES TOO, AND IT GOES FIRST. T7's own sentence is "deleting a Tag DETACHES
      -- from everything it touched", and until 2026-09-19 this arm withdrew the EDGE and left
      -- the id sitting in the relating record's document — the fourth pass measured exactly
      -- that: "detach-everywhere left the pointer dangling at a record that no longer exists".
      -- REL-11 says nothing ABOUT a relation is stored in the value; WHICH record it points at
      -- is the value, so detaching has to take it. The document write re-runs
      -- `custom._relation_associations`, which withdraws the edge from the same one place
      -- every other relation write does, and the statement below then finds nothing left to do
      -- — which is the point: there is one withdrawal, not two that can disagree.
      if e.other_type = 'record' then
        update custom.record r
           set data = case
                 when jsonb_typeof(r.data -> e.role) = 'array'
                   then jsonb_set(r.data, array[e.role],
                          coalesce((select jsonb_agg(x)
                                      from jsonb_array_elements(r.data -> e.role) x
                                     where (x #>> '{}') is distinct from p_record_id::text),
                                   '[]'::jsonb))
                 else r.data - e.role
               end
         where r.organization_id = p_organization_id
           and r.id = e.other_id
           and r.deleted_at is null
           and r.data ? e.role;
      end if;
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
$function$;
