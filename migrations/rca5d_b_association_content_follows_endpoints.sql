-- RC-A5d(b) — AN EDGE WHOSE LABEL OR METADATA CARRIES AN ENDPOINT'S CONTENT FOLLOWS BOTH ENDS,
-- EXACTLY AS A CONTENT PAYLOAD DOES (RC-A5).
-- chair-step: widens the RC-A5 restrictive SELECT policy on platform.associations (assoc_payload_follows_endpoints; the name is kept so every record of it stays true) from content payloads to content labels and metadata; takes the supautils 23-relation policy lock; applied only when named, right after rca5d_a.
-- Design: common-docs/projects/rich-content-unification/ASSOCIATION-VISIBILITY.md §10. Register row RC-A5d.
--
-- A row is STRUCTURE-ONLY — and keeps today's organization rule — when all three hold:
--   * no payload, or a payload kind not declared payload_follows_endpoints (RC-A5);
--   * no label, or the pair's own label (platform.edge_structural_labels(), rca5d_a);
--   * every metadata key on platform.edge_structural_metadata_keys() (rca5d_a).
-- Otherwise it is readable only by a platform admin (admin lane) or by an organization member who
-- can open BOTH ends (iam.has_access viewer on each — DD-205's door rule). Restrictive, so it only
-- ever narrows. Both declarations are InitPlans: computed once per query.
--
-- window-class: ALTER POLICY on platform.associations takes the supautils ACCESS EXCLUSIVE on the
-- 23 auth/storage/realtime relations until COMMIT, so it is the ONLY statement in this file.
-- lock_timeout 2s: the queued lock blocks new readers of this table while it waits, so it gives up
-- fast and is re-run. Requires rca5d_a. Inverse: migrations/inverse/rca5d_b_association_content_follows_endpoints_down.sql.

set local lock_timeout = '2s';

alter policy assoc_payload_follows_endpoints on platform.associations
  using (
    (select public.is_platform_admin())
    or (
          (payload_kind is null
           or payload_kind <> all (array(select k.kind from platform.edge_payload_kind k
                                          where k.payload_follows_endpoints)))
      and (label is null or label = ''
           or label = ((select platform.edge_structural_labels()) ->> (source_type || '>' || target_type)))
      and (metadata - (select platform.edge_structural_metadata_keys())) = '{}'::jsonb
    )
    -- has_org_access first: assoc_select already requires it, so it changes nothing about WHO reads,
    -- and it keeps a scan across other organizations' content rows from paying two kernel calls each.
    or (iam.has_org_access(organization_id)
        and iam.has_access(source_type, source_id, 'viewer'::public.permission_level)
        and iam.has_access(target_type, target_id, 'viewer'::public.permission_level))
  );
