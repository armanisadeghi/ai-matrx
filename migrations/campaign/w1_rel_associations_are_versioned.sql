-- target: branch,production
-- additive: yes
-- guard: custom/associations_guard
--
-- W1-REL, FILE 4 — REL-13 AND REL-16: ASSOCIATIONS ARE VERSIONED, SO RELATION HISTORY EXISTS.
--
-- REL-16 is an ORDER, and this file is the second half of it: *`platform.associations` gains
-- `version` and `updated_at` BEFORE `_touch_row` and `_version_capture` are attached.* File 1
-- added the columns. This file attaches the two triggers, and the order matters for a reason
-- that is in `platform._touch_row`'s own body rather than in anybody's opinion: it asks
-- `to_jsonb(NEW) ? 'updated_at'` and `? 'version'` and does NOTHING when the keys are absent.
-- Attached first, it would have been a silent no-op on every write - a versioning system that
-- reports success and records nothing, which is precisely the failure this campaign's fourth law
-- exists to refuse.
--
-- THE TWO FUNCTIONS ARE THE PLATFORM'S OWN AND THIS FILE DOES NOT TOUCH THEIR BODIES.
-- `platform._touch_row()` and `platform._version_capture()` are live, used by the 241 tables that
-- already version, and rule 4 keeps a lane's hands off a live body. There is no `-- based-on:`
-- line here because nothing here replaces a function. What this file adds is three TRIGGERS.
--
-- HOW THE GUARD HOLDS A TRIGGER OFF WITHOUT TOUCHING THE FUNCTION IT CALLS: THE `WHEN` CLAUSE.
-- Each trigger carries `WHEN (platform.relations_are_on(<row>.organization_id))`. PostgreSQL
-- evaluates it per row BEFORE the function runs, so while `custom/associations_guard` resolves
-- false the two live bodies are never entered at all, no `history.row_versions` row is written,
-- `version` and `updated_at` stay NULL on every row, and every existing read returns the values
-- it returned against the go-signal capture. The OFF proof is answer identity, and here it is
-- structural: the function does not execute. This is also why the guard is not written INSIDE a
-- wrapper function - a wrapper would be a second copy of a live body, which is the thing rule 4
-- forbids, and the `WHEN` clause achieves the same OFF with no copy at all.
--
-- WHY THREE TRIGGERS AND NOT TWO. `_version_capture` handles INSERT, UPDATE and DELETE, but a
-- `WHEN` clause may not read `NEW` on DELETE and may not read `OLD` on INSERT. So the capture is
-- split: INSERT OR UPDATE reading `NEW.organization_id`, DELETE reading `OLD.organization_id`.
-- One trigger with one clause would have raised at creation; two with the wrong clause would
-- have raised at the first delete, in production, unattended.
--
-- THE ENTITY TOKEN IS `agent_surface_binding`, AND THAT IS NOT A TYPO.
-- `_version_capture` files its history rows under `TG_ARGV[0]`, the registered token of the table
-- it guards. The live registry row for `platform.associations` is `agent_surface_binding` - read
-- back from `platform.entity_types` before this line was written, `type = 'system'`,
-- `version_store = 'history'`, which is REL-16's "registered as a System token" already true and
-- verified rather than re-landed (rule 19). The token reads oddly for a general edge table and
-- IS the live name; the campaign does not rename on sight, and `_gc_assoc_harddelete`,
-- `_gc_assoc_softdelete` and `_guard_governance` already pass the same string. Renaming it is a
-- registry convergence, not this lane's, and writing a DIFFERENT string here would have filed
-- this table's history under a token the registry does not connect to it.
--
-- WHAT IS DELIBERATELY NOT DONE, SO NOBODY READS THE GAP AS AN OVERSIGHT.
-- `platform.entity_types.is_versioned` for that row stays FALSE. While the guard is OFF these
-- triggers write nothing, so flipping the flag would declare a versioning that does not happen -
-- declared state lying about observed state, which is its own defect. The flag belongs to the
-- switch step that turns `custom/associations_guard` on, and it is named in this lane's report
-- rather than left for someone to discover.
--
-- AND `version` CARRIES NO DEFAULT, ON PURPOSE. A `default 1` would make all 34,216 existing
-- rows read `1` where they read nothing before, and this lane's exit clause is that every new
-- key is NULL on every row against the go-signal capture. So an edge's first version number is
-- written by `_touch_row` on its first UPDATE (`coalesce(OLD.version,0)+1` = 1), and the INSERT
-- history row records version 1 through `_version_capture`'s own `coalesce(...,1)`. The two
-- agree; neither invents a number for a row nobody has written yet.
--
-- THE INVERSE: `migrations/inverse/w1_rel_associations_are_versioned_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '300s';

-- `custom/associations_guard` - named here as a statement and not only in the header, because
-- §6b.2 requires the guard's feature and key to APPEAR in any file that creates a trigger on a
-- table outside schema `custom`, and `platform.associations` is very much outside it.
comment on trigger trg_associations_reachability on platform.associations is
  'Live platform trigger, untouched by W1-REL. Recorded here only so this file states, beside the three triggers it adds, which trigger on this table it does not change. The campaign knob that holds W1-REL''s additions off is custom/associations_guard.';

create or replace trigger trg_associations_zzz_touch_row
  before insert or update on platform.associations
  for each row
  when (platform.relations_are_on(new.organization_id))
  execute function platform._touch_row();

create or replace trigger trg_associations_zzz_version_capture
  after insert or update on platform.associations
  for each row
  when (platform.relations_are_on(new.organization_id))
  execute function platform._version_capture('agent_surface_binding');

create or replace trigger trg_associations_zzz_version_capture_delete
  after delete on platform.associations
  for each row
  when (platform.relations_are_on(old.organization_id))
  execute function platform._version_capture('agent_surface_binding');

-- REL-13's read: the history of one relation, from the rows the capture writes. It is a function
-- and not a view so the door applies to it like everything else this lane built - a relation's
-- history is as dark as the relation while the switch is off.
create or replace function platform.relation_history(p_organization_id uuid, p_association_id uuid)
returns table(version integer, operation text, at_time timestamp with time zone,
              actor_id uuid, role text, target_type text, target_id uuid)
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
begin
  perform platform.assert_relations_door(p_organization_id);
  return query
    select v.version, v.operation, v.created_at, v.actor_id,
           v.row_data ->> 'role',
           v.row_data ->> 'target_type',
           nullif(v.row_data ->> 'target_id', '')::uuid
      from history.row_versions v
     where v.entity_type = 'agent_surface_binding'
       and v.row_id = p_association_id
       and v.organization_id = p_organization_id
     order by v.version, v.created_at;
end;
$fn$;

comment on function platform.relation_history(uuid, uuid) is
  'W1-REL / REL-13: relation history, read from history.row_versions where platform._version_capture files it under the live registered token for platform.associations. There is no second history store for relations and no copy of one.';
