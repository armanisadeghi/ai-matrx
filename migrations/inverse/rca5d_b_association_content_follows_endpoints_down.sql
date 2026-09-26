-- chair-step: RC-A5d(b) inverse — narrows the gate on platform.associations back to content payloads only (RC-A5), re-opening edge labels and metadata that copy endpoint content to every member of the edge's organization. Run only to relieve a measured regression.
-- window-class: ALTER POLICY on platform.associations takes the supautils 23-relation lock until COMMIT; run it alone.

set local lock_timeout = '2s';

alter policy assoc_payload_follows_endpoints on platform.associations
  using (
    (select public.is_platform_admin())
    or payload_kind is null
    or payload_kind <> all (array(select k.kind from platform.edge_payload_kind k
                                   where k.payload_follows_endpoints))
    or (iam.has_org_access(organization_id)
        and iam.has_access(source_type, source_id, 'viewer'::public.permission_level)
        and iam.has_access(target_type, target_id, 'viewer'::public.permission_level))
  );
