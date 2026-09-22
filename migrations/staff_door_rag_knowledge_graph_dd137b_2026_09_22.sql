-- staff_door_rag_knowledge_graph_dd137b_2026_09_22
--
-- THE FINDING, continued. After staff_door_generated_confidential_family_dd137b_2026_09_22 closed
-- the 26 purely-generated tokens, `pnpm check:staff-door --strict` names 73 tokens that still let
-- our own staff read with no door, 34 of them components or ledgers under a private parent. This
-- file takes the next UNIFORM family: the six RAG knowledge-graph tokens.
--
-- THE MECHANISM, and why apply_rls cannot be used here. These six carry BESPOKE read policies
-- beside the generated set, so `iam.apply_rls` would ADD generated policies the tables never had
-- and WIDEN access — the opposite of the law. Every one of their eleven permissive read policies
-- has the identical shape:
--
--     ((select is_platform_admin()) OR <the real arm>)
--
-- so the staff lane is not a separate policy that can be dropped; it is an OR arm welded into the
-- customer's own read. Each is superseded through `iam.supersede_bespoke_policies` — the
-- generator's own door for a hand-written policy — and re-created with `<the real arm>` VERBATIM,
-- byte for byte as `pg_get_expr` returned it, and no staff arm. Nothing is narrowed and nothing is
-- invented: an org member, an owner, a note share, a CLD share, a library grant and the global
-- library read exactly what they read before.
--
-- `platform_admin_all` is then dropped on each: a permissive FOR ALL policy whose whole predicate
-- is `is_platform_admin()`, which grants the lane on its own regardless of what the read arms say.
-- It is in `iam.generated_policy_names()` and is emitted "unless the token suppresses the lane",
-- so the registry declaration below is what stops a future regeneration putting it back.
--
-- WHO LOSES WHAT. A platform admin browsing with their own session loses a standing read of every
-- organization's knowledge graph. Writes are unaffected: `platform_admin_insert_only`,
-- `_update_only` and `_delete_only` are RESTRICTIVE and stay exactly as they are, and every
-- server-side ingest runs as the service role, which RLS does not apply to at all.

-- chair-step: closes the platform-admin read lane on the six rag knowledge-graph tokens; the staff lane is an OR arm inside eleven bespoke read policies, superseded and re-created with the real arm verbatim

set local lock_timeout = '30s';

update platform.entity_types
   set suppress_platform_admin_lane = true
 where token in ('kg_chunk_entities', 'kg_chunks', 'kg_clusters', 'kg_edges',
                 'kg_entities', 'kg_entity_aliases')
   and not suppress_platform_admin_lane;

select iam.supersede_bespoke_policies('rag', 'kg_chunk_entities', array['kg_chunk_entities_org_select'],
  'DD-137b staff door (2026-09-22, GATES-3): each of these bespoke read lanes opened with an is_platform_admin() OR arm on a private token; re-created with the real arm verbatim and no staff arm.');
create policy kg_chunk_entities_org_select on rag.kg_chunk_entities
  for select
  using (is_member_of_organization(organization_id));
drop policy platform_admin_all on rag.kg_chunk_entities;

select iam.supersede_bespoke_policies('rag', 'kg_chunks', array['kg_chunks_cld_share_select', 'kg_chunks_global_library_select', 'kg_chunks_library_grant_select', 'kg_chunks_note_share_select', 'kg_chunks_org_member_select', 'kg_chunks_owner_select'],
  'DD-137b staff door (2026-09-22, GATES-3): each of these bespoke read lanes opened with an is_platform_admin() OR arm on a private token; re-created with the real arm verbatim and no staff arm.');
create policy kg_chunks_cld_share_select on rag.kg_chunks
  for select to authenticated
  using (((valid_to IS NULL) AND (deleted_at IS NULL) AND (source_kind = 'cld_file'::text) AND (source_id IN ( SELECT rag.kg_chunk_sources_cld_readable() AS kg_chunk_sources_cld_readable))));
create policy kg_chunks_global_library_select on rag.kg_chunks
  for select
  using (((valid_to IS NULL) AND (deleted_at IS NULL) AND (source_kind = 'library_doc'::text) AND (organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND (( SELECT auth.role() AS role) = 'authenticated'::text)));
create policy kg_chunks_library_grant_select on rag.kg_chunks
  for select
  using (((valid_to IS NULL) AND (deleted_at IS NULL) AND (( SELECT auth.role() AS role) = 'authenticated'::text) AND ((source_kind, source_id) IN ( SELECT kg_chunk_sources_library_granted.source_kind,
    kg_chunk_sources_library_granted.source_id
   FROM rag.kg_chunk_sources_library_granted() kg_chunk_sources_library_granted(source_kind, source_id)))));
create policy kg_chunks_note_share_select on rag.kg_chunks
  for select
  using (((valid_to IS NULL) AND (deleted_at IS NULL) AND (source_kind = 'note'::text) AND (source_id IN ( SELECT rag.kg_chunk_sources_note_visible() AS kg_chunk_sources_note_visible))));
create policy kg_chunks_org_member_select on rag.kg_chunks
  for select
  using (((organization_id IS NOT NULL) AND (organization_id IN ( SELECT iam.my_orgs() AS my_orgs)) AND (valid_to IS NULL) AND (deleted_at IS NULL)));
create policy kg_chunks_owner_select on rag.kg_chunks
  for select
  using (((owner_id = ( SELECT auth.uid() AS uid)) AND (valid_to IS NULL) AND (deleted_at IS NULL)));
drop policy platform_admin_all on rag.kg_chunks;

select iam.supersede_bespoke_policies('rag', 'kg_clusters', array['kg_clusters_org_select'],
  'DD-137b staff door (2026-09-22, GATES-3): each of these bespoke read lanes opened with an is_platform_admin() OR arm on a private token; re-created with the real arm verbatim and no staff arm.');
create policy kg_clusters_org_select on rag.kg_clusters
  for select
  using (((organization_id IS NOT NULL) AND is_member_of_organization(organization_id)));
drop policy platform_admin_all on rag.kg_clusters;

select iam.supersede_bespoke_policies('rag', 'kg_edges', array['kg_edges_org_select'],
  'DD-137b staff door (2026-09-22, GATES-3): each of these bespoke read lanes opened with an is_platform_admin() OR arm on a private token; re-created with the real arm verbatim and no staff arm.');
create policy kg_edges_org_select on rag.kg_edges
  for select
  using (is_member_of_organization(organization_id));
drop policy platform_admin_all on rag.kg_edges;

select iam.supersede_bespoke_policies('rag', 'kg_entities', array['kg_entities_org_select'],
  'DD-137b staff door (2026-09-22, GATES-3): each of these bespoke read lanes opened with an is_platform_admin() OR arm on a private token; re-created with the real arm verbatim and no staff arm.');
create policy kg_entities_org_select on rag.kg_entities
  for select
  using (is_member_of_organization(organization_id));
drop policy platform_admin_all on rag.kg_entities;

select iam.supersede_bespoke_policies('rag', 'kg_entity_aliases', array['kg_entity_aliases_org_select'],
  'DD-137b staff door (2026-09-22, GATES-3): each of these bespoke read lanes opened with an is_platform_admin() OR arm on a private token; re-created with the real arm verbatim and no staff arm.');
create policy kg_entity_aliases_org_select on rag.kg_entity_aliases
  for select
  using (((organization_id IS NOT NULL) AND is_member_of_organization(organization_id)));
drop policy platform_admin_all on rag.kg_entity_aliases;
