-- staff_door_rag_embeddings_dd137b_2026_09_22
--
-- THE FINDING, continued. Third file of the DD-137b staff-door sweep (GATES-3, 2026-09-22), after
-- the 26 purely-generated confidential tokens and the six knowledge-graph tokens. This one takes
-- the four RAG EMBEDDING tables — the vector store behind every retrieval the platform performs.
--
-- THE MECHANISM. Identical to the knowledge-graph file, and for the identical reason: these four
-- carry bespoke read policies beside the generated set, so `iam.apply_rls` would ADD generated
-- policies they never had and WIDEN access. All twenty-four of their permissive read policies have
-- the same shape —
--
--     ((select is_platform_admin()) OR <the real arm>)
--
-- — six per table: the owner, the organization, a note share, a CLD file share, a library grant
-- and the globally readable library. Each is superseded through
-- `iam.supersede_bespoke_policies` and re-created with `<the real arm>` VERBATIM, byte for byte
-- as `pg_get_expr` returned it. Nothing is narrowed and nothing is invented.
--
-- `platform_admin_all` is then dropped on each — a permissive FOR ALL policy whose whole predicate
-- is `is_platform_admin()`, which grants the lane on its own whatever the read arms say — and the
-- registry declares the lane closed so a future regeneration cannot put it back.
--
-- WHO LOSES WHAT. A platform admin browsing with their own session loses a standing read of every
-- organization's embeddings. Writes are unaffected: the `platform_admin_insert_only`,
-- `_update_only` and `_delete_only` policies are RESTRICTIVE and stay exactly as they are, and
-- every embedding is written by a server-side worker running as the service role, which RLS does
-- not apply to at all.

-- chair-step: closes the platform-admin read lane on the four rag embedding tables; the staff lane is an OR arm inside twenty-four bespoke read policies, superseded and re-created with the real arm verbatim

set local lock_timeout = '30s';

update platform.entity_types
   set suppress_platform_admin_lane = true
 where token in ('embeddings_google_gemini_2_1536', 'embeddings_oai_3_small_1536',
                 'embeddings_voyage_4_large_1024', 'embeddings_voyage_code_3_1024')
   and not suppress_platform_admin_lane;

select iam.supersede_bespoke_policies('rag', 'embeddings_google_gemini_2_1536', array['embeddings_google_gemini_2_cld_share_select', 'embeddings_google_gemini_2_global_library_select', 'embeddings_google_gemini_2_library_grant_select', 'embeddings_google_gemini_2_note_share_select', 'embeddings_google_gemini_2_org_select', 'embeddings_google_gemini_2_owner_select'],
  'DD-137b staff door (2026-09-22, GATES-3): each of these bespoke read lanes opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim and no staff arm.');
create policy embeddings_google_gemini_2_cld_share_select on rag.embeddings_google_gemini_2_1536
  for select
  using ((EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_google_gemini_2_1536.chunk_id) AND (c.valid_to IS NULL) AND (c.source_kind = 'cld_file'::text) AND iam.has_access('file'::text, (c.source_id)::uuid, 'viewer'::permission_level)))));
create policy embeddings_google_gemini_2_global_library_select on rag.embeddings_google_gemini_2_1536
  for select
  using (((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND (( SELECT auth.role() AS role) = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_google_gemini_2_1536.chunk_id) AND (c.source_kind = 'library_doc'::text) AND (c.organization_id IN ( SELECT system_orgs.organization_id
           FROM iam.system_orgs
          WHERE system_orgs.global_readable)))))));
create policy embeddings_google_gemini_2_library_grant_select on rag.embeddings_google_gemini_2_1536
  for select
  using (((( SELECT auth.role() AS role) = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_google_gemini_2_1536.chunk_id) AND (c.valid_to IS NULL) AND rag_source_has_library_grant(c.source_kind, c.source_id, NULL::uuid))))));
create policy embeddings_google_gemini_2_note_share_select on rag.embeddings_google_gemini_2_1536
  for select
  using ((EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_google_gemini_2_1536.chunk_id) AND (c.valid_to IS NULL) AND (c.source_kind = 'note'::text) AND rag_user_can_see_note((c.source_id)::uuid)))));
create policy embeddings_google_gemini_2_org_select on rag.embeddings_google_gemini_2_1536
  for select
  using (((organization_id IS NOT NULL) AND is_member_of_organization(organization_id)));
create policy embeddings_google_gemini_2_owner_select on rag.embeddings_google_gemini_2_1536
  for select
  using ((owner_id = ( SELECT auth.uid() AS uid)));
drop policy platform_admin_all on rag.embeddings_google_gemini_2_1536;

select iam.supersede_bespoke_policies('rag', 'embeddings_oai_3_small_1536', array['embeddings_oai_cld_share_select', 'embeddings_oai_global_library_select', 'embeddings_oai_library_grant_select', 'embeddings_oai_note_share_select', 'embeddings_oai_org_select', 'embeddings_oai_owner_select'],
  'DD-137b staff door (2026-09-22, GATES-3): each of these bespoke read lanes opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim and no staff arm.');
create policy embeddings_oai_cld_share_select on rag.embeddings_oai_3_small_1536
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_oai_3_small_1536.chunk_id) AND (c.valid_to IS NULL) AND (c.source_kind = 'cld_file'::text) AND iam.has_access('file'::text, (c.source_id)::uuid, 'viewer'::permission_level)))));
create policy embeddings_oai_global_library_select on rag.embeddings_oai_3_small_1536
  for select
  using (((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND (( SELECT auth.role() AS role) = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_oai_3_small_1536.chunk_id) AND (c.source_kind = 'library_doc'::text) AND (c.organization_id IN ( SELECT system_orgs.organization_id
           FROM iam.system_orgs
          WHERE system_orgs.global_readable)))))));
create policy embeddings_oai_library_grant_select on rag.embeddings_oai_3_small_1536
  for select
  using (((( SELECT auth.role() AS role) = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_oai_3_small_1536.chunk_id) AND (c.valid_to IS NULL) AND rag_source_has_library_grant(c.source_kind, c.source_id, NULL::uuid))))));
create policy embeddings_oai_note_share_select on rag.embeddings_oai_3_small_1536
  for select
  using ((EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_oai_3_small_1536.chunk_id) AND (c.valid_to IS NULL) AND (c.source_kind = 'note'::text) AND rag_user_can_see_note((c.source_id)::uuid)))));
create policy embeddings_oai_org_select on rag.embeddings_oai_3_small_1536
  for select
  using (((organization_id IS NOT NULL) AND is_member_of_organization(organization_id)));
create policy embeddings_oai_owner_select on rag.embeddings_oai_3_small_1536
  for select
  using ((owner_id = ( SELECT auth.uid() AS uid)));
drop policy platform_admin_all on rag.embeddings_oai_3_small_1536;

select iam.supersede_bespoke_policies('rag', 'embeddings_voyage_4_large_1024', array['embeddings_voyage4_cld_share_select', 'embeddings_voyage4_global_library_select', 'embeddings_voyage4_library_grant_select', 'embeddings_voyage4_note_share_select', 'embeddings_voyage4_org_select', 'embeddings_voyage4_owner_select'],
  'DD-137b staff door (2026-09-22, GATES-3): each of these bespoke read lanes opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim and no staff arm.');
create policy embeddings_voyage4_cld_share_select on rag.embeddings_voyage_4_large_1024
  for select
  using ((EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_voyage_4_large_1024.chunk_id) AND (c.valid_to IS NULL) AND (c.source_kind = 'cld_file'::text) AND iam.has_access('file'::text, (c.source_id)::uuid, 'viewer'::permission_level)))));
create policy embeddings_voyage4_global_library_select on rag.embeddings_voyage_4_large_1024
  for select
  using (((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND (( SELECT auth.role() AS role) = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_voyage_4_large_1024.chunk_id) AND (c.source_kind = 'library_doc'::text) AND (c.organization_id IN ( SELECT system_orgs.organization_id
           FROM iam.system_orgs
          WHERE system_orgs.global_readable)))))));
create policy embeddings_voyage4_library_grant_select on rag.embeddings_voyage_4_large_1024
  for select
  using (((( SELECT auth.role() AS role) = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_voyage_4_large_1024.chunk_id) AND (c.valid_to IS NULL) AND rag_source_has_library_grant(c.source_kind, c.source_id, NULL::uuid))))));
create policy embeddings_voyage4_note_share_select on rag.embeddings_voyage_4_large_1024
  for select
  using ((EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_voyage_4_large_1024.chunk_id) AND (c.valid_to IS NULL) AND (c.source_kind = 'note'::text) AND rag_user_can_see_note((c.source_id)::uuid)))));
create policy embeddings_voyage4_org_select on rag.embeddings_voyage_4_large_1024
  for select
  using (((organization_id IS NOT NULL) AND is_member_of_organization(organization_id)));
create policy embeddings_voyage4_owner_select on rag.embeddings_voyage_4_large_1024
  for select
  using ((owner_id = ( SELECT auth.uid() AS uid)));
drop policy platform_admin_all on rag.embeddings_voyage_4_large_1024;

select iam.supersede_bespoke_policies('rag', 'embeddings_voyage_code_3_1024', array['embeddings_voyage_code_cld_share_select', 'embeddings_voyage_code_global_library_select', 'embeddings_voyage_code_note_share_select', 'embeddings_voyage_code_org_select', 'embeddings_voyage_code_owner_select', 'embeddings_voyage_library_grant_select'],
  'DD-137b staff door (2026-09-22, GATES-3): each of these bespoke read lanes opened with an is_platform_admin() OR arm on a private component; re-created with the real arm verbatim and no staff arm.');
create policy embeddings_voyage_code_cld_share_select on rag.embeddings_voyage_code_3_1024
  for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_voyage_code_3_1024.chunk_id) AND (c.valid_to IS NULL) AND (c.source_kind = 'cld_file'::text) AND iam.has_access('file'::text, (c.source_id)::uuid, 'viewer'::permission_level)))));
create policy embeddings_voyage_code_global_library_select on rag.embeddings_voyage_code_3_1024
  for select
  using (((organization_id IN ( SELECT system_orgs.organization_id
   FROM iam.system_orgs
  WHERE system_orgs.global_readable)) AND (( SELECT auth.role() AS role) = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_voyage_code_3_1024.chunk_id) AND (c.source_kind = 'library_doc'::text) AND (c.organization_id IN ( SELECT system_orgs.organization_id
           FROM iam.system_orgs
          WHERE system_orgs.global_readable)))))));
create policy embeddings_voyage_code_note_share_select on rag.embeddings_voyage_code_3_1024
  for select
  using ((EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_voyage_code_3_1024.chunk_id) AND (c.valid_to IS NULL) AND (c.source_kind = 'note'::text) AND rag_user_can_see_note((c.source_id)::uuid)))));
create policy embeddings_voyage_code_org_select on rag.embeddings_voyage_code_3_1024
  for select
  using (((organization_id IS NOT NULL) AND is_member_of_organization(organization_id)));
create policy embeddings_voyage_code_owner_select on rag.embeddings_voyage_code_3_1024
  for select
  using ((owner_id = ( SELECT auth.uid() AS uid)));
create policy embeddings_voyage_library_grant_select on rag.embeddings_voyage_code_3_1024
  for select
  using (((( SELECT auth.role() AS role) = 'authenticated'::text) AND (EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_voyage_code_3_1024.chunk_id) AND (c.valid_to IS NULL) AND rag_source_has_library_grant(c.source_kind, c.source_id, NULL::uuid))))));
drop policy platform_admin_all on rag.embeddings_voyage_code_3_1024;
