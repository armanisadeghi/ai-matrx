-- chair-step: RC-A5c inverse — restores platform.relations_from returning the snapshot payload unmasked (a reader who may open the source but not the target reads the target's frozen values).
-- based-on: platform.relations_from(uuid, uuid) bca25292c3fa8f8a74f3b33d5db2656056f709eb774482bd9d0d13e68db092df

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION platform.relations_from(p_organization_id uuid, p_record_id uuid)
 RETURNS TABLE(role text, target_type text, target_id uuid, "position" integer, label text, flavor text, binding text, snapshot jsonb, field_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
           a.payload, a.relation_field_id
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
