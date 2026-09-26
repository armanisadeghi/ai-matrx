-- RC-A5c — platform.relations_from MASKS A SNAPSHOT THE SAME WAY IT MASKS THE TITLE.
-- chair-step: replaces platform.relations_from so its snapshot column follows the target's access (one column expression and two declared variables; every other line unchanged).
-- Design: common-docs/projects/rich-content-unification/ASSOCIATION-VISIBILITY.md §12. Register row RC-A5c.
-- based-on: platform.relations_from(uuid, uuid) 393f43c6c62e26546776390ab59342f1553a0d2fa3304b42faa803fa79863281
--
-- THE DEFECT (read in the live body 2026-09-25; latent — 0 relation_snapshot rows today):
-- relations_from is a SECURITY DEFINER door. It asserts the caller may open the SOURCE record and
-- masks the target's title through platform.relation_label (a reader who may not open the target
-- gets the withheld sentence), but it returned a.payload as `snapshot` unchecked. A snapshot
-- binding (W1-REL / REL-3, payload kind relation_snapshot) is a frozen COPY of the target's values,
-- so a reader who could open the source but not the target read the target's values here while the
-- table itself (RC-A5) and the title (REL-14) both withheld them.
--
-- THE FIX: the snapshot column asks exactly the question relation_label asks about the title —
-- custom.has_visibility for a record target, iam.has_access for any other token — and answers null
-- when the reader may not open the target. Server callers (no principal) and the store owner keep it,
-- as they keep the title. relations_to returns no payload and is untouched.
-- Inverse: migrations/inverse/rca5c_relations_from_masks_the_snapshot_down.sql.

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION platform.relations_from(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(role text, target_type text, target_id uuid, "position" integer, label text, flavor text, binding text, snapshot jsonb, field_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
  v_store_owner boolean := custom.query_is_store_owner();
begin
  perform platform.assert_relations_door(p_organization_id);
  perform custom.assert_client_may_open(p_organization_id, p_record_id, 'platform.relations_from',
                                        'viewer'::public.permission_level, 'record');
  return query
    select a.role, a.target_type, a.target_id, a.position,
           -- REL-14, and masked at the far end: a target this reader may not open answers the
           -- withheld sentence, never its title.
           platform.relation_label(p_organization_id, a.target_type, a.target_id),
           d.declaration ->> 'flavor', d.declaration ->> 'binding',
           -- RC-A5c: a snapshot binding copies the TARGET's values into the payload, so it is masked
           -- by the same test platform.relation_label applies to the title: a reader who may not open
           -- the target gets null, never the frozen copy. Server callers (no principal) and the store
           -- owner see it, exactly as they see the label.
           case
             when v_me is null or v_store_owner then a.payload
             when a.target_type = 'record'
               then case when custom.has_visibility(v_me, 'record', a.target_id, 'viewer'::public.permission_level)
                         then a.payload end
             when iam.has_access(a.target_type, a.target_id, 'viewer'::public.permission_level) then a.payload
           end,
           a.relation_field_id
      from platform.associations a
      cross join lateral (select platform.relation_declaration(p_organization_id, a.relation_field_id) as declaration) d
     where a.organization_id = p_organization_id
       and a.source_type = 'record' and a.source_id = p_record_id
       and a.relation_field_id is not null
       and a.deleted_at is null
       -- An edge whose field is gone or no longer behaves as a relation is not a relation
       -- (REL-10). It used to take this whole read down with a 23514; it is now skipped here
       -- and COUNTED by platform.relation_edges_without_a_live_field().
       and platform.relation_edge_has_a_live_field(p_organization_id, a.relation_field_id)
     order by a.role, a.position nulls last, a.created_at;
end;
$function$
;
