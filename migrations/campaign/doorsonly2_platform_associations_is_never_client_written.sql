-- lane: DOORS-ONLY-2
-- `platform` AND `iam` ARE NOT CLIENT-WRITABLE THROUGH PostgREST. (Chair ruling; VERIFIER-8
-- HIGH-3, 2026-09-21.)
--
-- platform.associations -- ASSOCIATION SEMANTICS. THE BIG ONE: 84,566 rows, the single table
-- every M2M relationship in the platform lives in, and the first table this lane's guard used
-- as its "an open table is reported" self-test fixture.
--
-- WHY IT MATTERS: an edge is a claim that two things belong together. A member who writes the
-- association table directly can attach anything to anything -- a tool into somebody else's
-- bundle, a file onto somebody else's conversation, a record onto somebody else's message --
-- and every "what is attached to X" list in the product then repeats the claim as fact.
--
-- THIS ONE IS NOT A CENSUS RESULT. It has FOUR real client writers, and all four were MOVED TO
-- THE DOOR in the same commit as this file:
--
--   app/api/agent-shortcuts/route.ts              insert  -> public.assoc_add
--   app/api/admin/bundles/[id]/members/route.ts   insert  -> public.assoc_add
--   app/api/admin/bundles/[id]/members/[toolId]/route.ts
--                                                 update  -> public.assoc_add (it upserts)
--                                                 delete  -> public.assoc_remove
--   features/content-ir/studio/store-kind-record.ts
--                                                 insert  -> public.assoc_add
--
-- A fifth writer, features/surfaces/services/manifest-sync.service.ts, is handed a
-- `createAdminClient()` instance by every one of its call sites -- `service_role`, which this
-- closure does not touch. That was read from the call sites, not assumed from the `.update(`.
--
-- NO NEW DOOR WAS BUILT, and that is the point. The canonical association doors already
-- existed and are already declared in `platform.client_callable_door`: `assoc_add`,
-- `assoc_link`, `assoc_remove`, `assoc_unlink`, `assoc_set_targets`,
-- `assoc_remove_for_entity`, plus the read side (`assoc_list`, `assoc_for_entity`,
-- `assoc_for_sources`, `assoc_for_targets`, `assoc_members_visible`). The ruling's first
-- instruction is to reuse every door that already exists before writing one, and for the
-- largest table in the census the answer was that the whole door set was already there and
-- four call sites had simply gone round it.
--
-- WHAT THE DOOR DECIDES THAT THE BASE TABLE DID NOT. `assoc_add` requires `auth.uid()`, then
-- checks `iam.has_access` at EDITOR and VIEWER on BOTH ends of the edge, resolves the
-- container side from `platform.association_types`, and refuses with 42501 when the resolved
-- organization is one the caller has no access to. It stamps `created_by` from `auth.uid()`
-- itself, so a caller can no longer name somebody else as the author of an edge. And it
-- upserts on (source_type, source_id, target_type, target_id, role) -- which is why the bundle
-- member PATCH is now the same call as the POST, and why a retried create writes one edge
-- rather than two. That is strictly more decision than the base table's RLS made, which is the
-- ruling working rather than a side effect of it.
--
-- THE DOOR IS UNAFFECTED BY THIS FILE. `platform.associations` is owned by `postgres` and does
-- NOT carry FORCE ROW LEVEL SECURITY, and every door is a SECURITY DEFINER function owned by
-- `postgres`; the owner is not subject to these policies. `service_role` is untouched. SELECT
-- is untouched -- this constrains INSERT, UPDATE and DELETE only -- and `platform_admin_all`
-- is NOT dropped, because it is a FOR ALL policy and therefore the SELECT policy too.
--
-- RESTRICTIVE, so it ANDs with every permissive policy present or future, and bespoke so
-- `iam.apply_rls` preserves it across every regeneration (DD-147).
--
-- ADDITIVE. Nothing is dropped, renamed or revoked. The dead GRANT is a chair step
-- (migrations/campaign/chairstep_doorsonly2_revoke_client_writes_batch3.sql).
-- Inverse: migrations/inverse/doorsonly2_platform_associations_is_never_client_written.inverse.sql
-- Guard: `pnpm check:doors-only-schemas` -- these three triples move from OPEN to RESIDUAL.

set local lock_timeout = '2s';

create policy "associations_client_insert_refused" on platform.associations
  as restrictive for insert to authenticated, anon
  with check (false);

create policy "associations_client_update_refused" on platform.associations
  as restrictive for update to authenticated, anon
  using (false) with check (false);

create policy "associations_client_delete_refused" on platform.associations
  as restrictive for delete to authenticated, anon
  using (false);

comment on policy "associations_client_insert_refused" on platform.associations is
  'DOORS-ONLY-2 2026-09-21: platform and iam are not client-writable through PostgREST (VERIFIER-8 HIGH-3). ASSOCIATION semantics: an edge is a claim that two things belong together, and a member who writes this table directly can attach anything to anything. Unlike the rest of this lane, this table HAD four real client writers; all four were moved to the canonical doors that already existed -- assoc_add (which upserts, so it is both the insert and the metadata update) and assoc_remove -- in the same commit as this policy. assoc_add checks iam.has_access at editor and viewer on BOTH ends, resolves the container organization, and stamps created_by from auth.uid(), so it decides strictly more than this table''s RLS did. The fifth writer, manifest-sync.service.ts, is service_role and untouched. RESTRICTIVE so it ANDs with every permissive policy present or future, bespoke so iam.apply_rls preserves it (DD-147); the table is owned by postgres with no FORCE RLS, so every door is unaffected; service_role, SELECT and platform_admin_all are untouched.';

comment on policy "associations_client_update_refused" on platform.associations is
  'DOORS-ONLY-2 2026-09-21: see associations_client_insert_refused. The bundle-member alias UPDATE that used to run here now calls public.assoc_add, whose ON CONFLICT arm IS the update; metadata is merged by the caller first, exactly as the direct UPDATE did, and position and label are left out so the door coalesces them and the member keeps its sort order.';

comment on policy "associations_client_delete_refused" on platform.associations is
  'DOORS-ONLY-2 2026-09-21: see associations_client_insert_refused. The bundle-member DELETE that used to run here now calls public.assoc_remove, which decides through the one ladder rather than this table''s RLS.';
