-- iam_bespoke_policies_of_record_dd172 — EVERY LIVE POLICY HAS A MIGRATION OF RECORD
-- (DD-172, closing the census B-54 left behind. db-rules §6d.)
--
-- ═══ THE FACT THIS CLOSES ═════════════════════════════════════════════════════════════════════
-- DD-147 taught `iam.apply_rls` to keep what it did not author and gave the ONE deliberate way a
-- bespoke policy goes (`iam.supersede_bespoke_policies`, reason ≥ 60 characters, recorded in
-- `iam.superseded_policy`). Its census then found the other half of the problem: policies that are
-- LIVE on this database and appear in NO migration file in either repository. They were created
-- off the migration path — hand-applied through a tool, the DD-113 class — so nothing anywhere
-- says what they are for. A door with no record is a door nobody can reason about: the next lane
-- that meets it can only guess whether removing it is a cleanup or an outage.
--
-- Re-measured on the live database 2026-09-13 (B-54's 101 minus the 20 that later lanes superseded
-- or recorded): **81 policy names on 39 relations appear in no `migrations/*.sql` in matrx-frontend
-- and no `db/migrations/*.sql` in aidream.** Seven of them are superseded in the companion file
-- `iam_bespoke_policies_superseded_dd172.sql` (five redundant, two live write holes). The other
-- **74 are real, load-bearing doors** and this file is their record.
--
-- ═══ WHY THIS FILE RECORDS RATHER THAN RE-CREATES ═════════════════════════════════════════════
-- A record that DROPS and re-CREATEs each policy would take 74 live doors down and put them back,
-- inside one transaction, for no gain. What is actually needed is that the bytes exist in a
-- migration and that the live policy IS those bytes. So each row below carries the policy's exact
-- command, permissive flag, role list, USING expression and WITH CHECK expression as Postgres
-- itself renders them, and the block:
--
--   1. CREATEs the policy from the recorded bytes if it is missing (so this file can rebuild the
--      door on a fresh database, which is what "migration of record" has to mean), and
--   2. otherwise ASSERTs that the live policy matches the recorded bytes exactly, and RAISES
--      naming the drift if it does not.
--
-- So it is a record and a guard at once: after this file, changing one of these 74 policies without
-- changing this file makes the next run of it fail and say which policy moved.
--
-- 🚨 TWO ROWS ARE ASSERT-ONLY. `cron.job` and `cron.job_run_details` belong to the pg_cron
-- extension, which creates their policies itself at install time. Re-creating one would detach it
-- from the extension, so those two are recorded and asserted and never created. The block refuses
-- to create anything in the `cron` schema, and says why.
--
-- 🚨 THIS FILE CHANGES NO LIVE POLICY. On this database all 74 already exist, so every row takes
-- the assert path. It is verified below: the block counts what it created and what it verified and
-- raises if a single row was created here.
set local lock_timeout = '4s';

do $$
declare
  r record;
  v_live record;
  v_created integer := 0;
  v_verified integer := 0;
  v_roles text;
  v_cmd text;
  v_sql text;
  v_live_roles text[];
begin
  for r in
    select * from (values
    ('admin','admin_email_logs','Admins can insert email logs','a',true,null,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (EXISTS ( SELECT 1
   FROM admin.admins
  WHERE (admins.user_id = ( SELECT auth.uid() AS uid)))))',
     'KEEP (b). Narrower than the ledger class: the insert lane is restricted to platform admins and rows of admin.admins, where the class regime would emit no client insert lane at all for a confidential ledger. It is the only door the admin email tooling writes through; platform_admin_all beside it covers staff. Recorded here so a regeneration that ever reaches this table cannot lose it without a person saying so.'),
    ('admin','admin_email_logs','Admins can view email logs','r',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (EXISTS ( SELECT 1
   FROM admin.admins
  WHERE (admins.user_id = ( SELECT auth.uid() AS uid)))))',null,
     'KEEP (b). Narrower than the ledger class: reading the admin email log requires being a platform admin or sitting in admin.admins. Confidential ledger data, no owner column to build an owner lane from, so this hand-written staff read is the whole read surface and must survive regeneration.'),
    ('admin','admin_markdown_samples','admin_markdown_samples_super_admin_all','*',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR ( SELECT is_super_admin() AS is_super_admin))','(( SELECT is_platform_admin() AS is_platform_admin) OR ( SELECT is_super_admin() AS is_super_admin))',
     'KEEP (b). Narrower than platform_admin_all beside it: it additionally admits is_super_admin(). The table is a staff-only sample store (class confidential, variant system) and this is the super-admin lane the system variant does not emit. Recorded rather than removed because removing it would take the super-admin door away without anyone deciding to.'),
    ('billing','capability_limit','capability_limit_read','r',true,'{"anon","authenticated"}','true',null,
     'KEEP (b). The published price-book read. billing.capability_limit is class public reference data and this signed-out + signed-in read is what the pricing page renders from; the write axis is already walled by the RESTRICTIVE platform_admin_insert/update/delete_only policies, so the door is read-only by construction.'),
    ('billing','price','price_read','r',true,'{"anon","authenticated"}','true',null,
     'KEEP (b). The published price-book read. billing.price is class public reference data and this signed-out + signed-in read is what the pricing page renders from; the write axis is already walled by the RESTRICTIVE platform_admin_insert/update/delete_only policies, so the door is read-only by construction.'),
    ('billing','product','product_read','r',true,'{"anon","authenticated"}','true',null,
     'KEEP (b). The published price-book read. billing.product is class public reference data and this signed-out + signed-in read is what the pricing page renders from; the write axis is already walled by the RESTRICTIVE platform_admin_insert/update/delete_only policies, so the door is read-only by construction.'),
    ('communication','emails','form_insert','a',true,'{"anon","authenticated"}',null,'true',
     'KEEP (d), AND FLAGGED. communication.emails is registered in no class, and this is a deliberate signed-out door of the same family as the anon invitation and share-link lanes: the public contact form posts here with WITH CHECK (true) and no read lane beside it. It is recorded, not removed, because removing it silently breaks the live contact form. The unbounded anonymous INSERT is a real abuse surface and is named as a finding in the B-66 report rather than closed on this lane''s own authority.'),
    ('context','context_access_log','context_access_log_insert','a',true,null,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (( SELECT auth.uid() AS uid) IS NOT NULL))',
     'KEEP (b). The ledger''s own write lane: any signed-in principal may append their own access record, which is what an access log is for, and the class regime emits no insert lane for a confidential ledger. Without this policy the context access log stops being written at all.'),
    ('context','context_access_log','context_access_log_select','r',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (user_id = ( SELECT auth.uid() AS uid)))',null,
     'KEEP (b). Narrower than the ledger class: a principal reads only their own access-log rows (user_id = auth.uid()), staff read through platform_admin_all. This is the whole read surface of the log.'),
    ('context','context_items','context_items_delete','d',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_org_admin(( SELECT st.organization_id
   FROM context.scope_types st
  WHERE (st.id = context_items.scope_type_id))))',null,
     'KEEP (b). Narrower than the entity class would emit: writes require org ADMIN on the owning scope type (iam.has_org_admin via context.scope_types), where the generated entity lanes admit any member. A regeneration that replaced this with the standard member lane would hand ordinary members the org''s scope definitions, so it is recorded as a deliberate wall.'),
    ('context','context_items','context_items_insert','a',true,'{"authenticated"}',null,'(( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_org_admin(( SELECT st.organization_id
   FROM context.scope_types st
  WHERE (st.id = context_items.scope_type_id))))',
     'KEEP (b). Narrower than the entity class would emit: writes require org ADMIN on the owning scope type (iam.has_org_admin via context.scope_types), where the generated entity lanes admit any member. A regeneration that replaced this with the standard member lane would hand ordinary members the org''s scope definitions, so it is recorded as a deliberate wall.'),
    ('context','context_items','context_items_update','w',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_org_admin(( SELECT st.organization_id
   FROM context.scope_types st
  WHERE (st.id = context_items.scope_type_id))))',null,
     'KEEP (b). Narrower than the entity class would emit: writes require org ADMIN on the owning scope type (iam.has_org_admin via context.scope_types), where the generated entity lanes admit any member. A regeneration that replaced this with the standard member lane would hand ordinary members the org''s scope definitions, so it is recorded as a deliberate wall.'),
    ('context','scope_types','scope_types_delete','d',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_org_admin(organization_id))',null,
     'KEEP (b). Narrower than the entity class would emit: writes require org ADMIN on organization_id, where the generated entity lanes admit any member. Scope types are the organization''s data shape; a regeneration that widened this to members would be a real widening, so the wall is recorded.'),
    ('context','scope_types','scope_types_insert','a',true,'{"authenticated"}',null,'(( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_org_admin(organization_id))',
     'KEEP (b). Narrower than the entity class would emit: writes require org ADMIN on organization_id, where the generated entity lanes admit any member. Scope types are the organization''s data shape; a regeneration that widened this to members would be a real widening, so the wall is recorded.'),
    ('context','scope_types','scope_types_update','w',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_org_admin(organization_id))',null,
     'KEEP (b). Narrower than the entity class would emit: writes require org ADMIN on organization_id, where the generated entity lanes admit any member. Scope types are the organization''s data shape; a regeneration that widened this to members would be a real widening, so the wall is recorded.'),
    ('context','template_context_items','template_ci_select','r',true,'{"authenticated"}','true',null,
     'KEEP (d). context.template_context_items is registered in no class. It is a platform-owned template catalogue and this is its signed-in read; there is no write lane beside it, so the whole client surface is read-only. Recorded so the catalogue read cannot vanish in a later registration.'),
    ('context','template_scope_types','template_st_select','r',true,'{"authenticated"}','true',null,
     'KEEP (d). context.template_scope_types is registered in no class. It is a platform-owned template catalogue and this is its signed-in read; there is no write lane beside it, so the whole client surface is read-only. Recorded so the catalogue read cannot vanish in a later registration.'),
    ('cron','job','cron_job_policy','*',true,null,'(username = CURRENT_USER)',null,
     'KEEP (d) — EXTENSION-OWNED. cron.job belongs to the pg_cron extension; the extension creates this policy (username = CURRENT_USER) itself at install time. It cannot be authored or re-created by us without detaching it from the extension, so this file records it and ASSERTS it, and never creates it.'),
    ('cron','job_run_details','cron_job_run_details_policy','*',true,null,'(username = CURRENT_USER)',null,
     'KEEP (d) — EXTENSION-OWNED. cron.job_run_details belongs to the pg_cron extension; the extension creates this policy (username = CURRENT_USER) itself at install time. It cannot be authored or re-created by us without detaching it from the extension, so this file records it and ASSERTS it, and never creates it.'),
    ('education','math_course_structure','Public can view course structure','r',true,null,'true',null,
     'KEEP (d). education.math_course_structure is registered in no class. This is the signed-out read of a published course outline — the same shape as the anon published read the entity class emits as pub_read — and the sibling write hole on this table is superseded in the companion DD-172 migration, so after that this read is the table''s whole client surface.'),
    ('extend','wbx_demo','wbx_demo_owner_delete','d',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (created_by = ( SELECT auth.uid() AS uid)))',null,
     'KEEP (b). Narrower than the entity class would emit for a class-organization token: access is the ROW OWNER only (created_by = auth.uid()), with no org-member lane at all. The generated entity lanes would open every row to every member of the owning organization, so replacing this by regeneration would be a widening; it is recorded as a deliberate owner-only wall.'),
    ('extend','wbx_demo','wbx_demo_owner_insert','a',true,null,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (created_by = ( SELECT auth.uid() AS uid)))',
     'KEEP (b). Narrower than the entity class would emit for a class-organization token: access is the ROW OWNER only (created_by = auth.uid()), with no org-member lane at all. The generated entity lanes would open every row to every member of the owning organization, so replacing this by regeneration would be a widening; it is recorded as a deliberate owner-only wall.'),
    ('extend','wbx_demo','wbx_demo_owner_select','r',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (created_by = ( SELECT auth.uid() AS uid)))',null,
     'KEEP (b). Narrower than the entity class would emit for a class-organization token: access is the ROW OWNER only (created_by = auth.uid()), with no org-member lane at all. The generated entity lanes would open every row to every member of the owning organization, so replacing this by regeneration would be a widening; it is recorded as a deliberate owner-only wall.'),
    ('extend','wbx_demo','wbx_demo_owner_update','w',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (created_by = ( SELECT auth.uid() AS uid)))','(( SELECT is_platform_admin() AS is_platform_admin) OR (created_by = ( SELECT auth.uid() AS uid)))',
     'KEEP (b). Narrower than the entity class would emit for a class-organization token: access is the ROW OWNER only (created_by = auth.uid()), with no org-member lane at all. The generated entity lanes would open every row to every member of the owning organization, so replacing this by regeneration would be a widening; it is recorded as a deliberate owner-only wall.'),
    ('extend','wbx_guidance','wbx_guidance_owner_delete','d',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (created_by = ( SELECT auth.uid() AS uid)))',null,
     'KEEP (b). Narrower than the entity class would emit: access is the ROW OWNER only (created_by = auth.uid()) on a class-private token, and there is no member or org lane. Recorded as a deliberate owner-only wall so a regeneration cannot quietly replace it.'),
    ('extend','wbx_guidance','wbx_guidance_owner_insert','a',true,null,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (created_by = ( SELECT auth.uid() AS uid)))',
     'KEEP (b). Narrower than the entity class would emit: access is the ROW OWNER only (created_by = auth.uid()) on a class-private token, and there is no member or org lane. Recorded as a deliberate owner-only wall so a regeneration cannot quietly replace it.'),
    ('extend','wbx_guidance','wbx_guidance_owner_select','r',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (created_by = ( SELECT auth.uid() AS uid)))',null,
     'KEEP (b). Narrower than the entity class would emit: access is the ROW OWNER only (created_by = auth.uid()) on a class-private token, and there is no member or org lane. Recorded as a deliberate owner-only wall so a regeneration cannot quietly replace it.'),
    ('extend','wbx_guidance','wbx_guidance_svc','*',true,'{"service_role"}','true','true',
     'KEEP (b). This is the service-role lane this table has instead of the generated svc_all — identical in effect (service_role, USING true, WITH CHECK true), and the only thing the extension''s server writes through. Removing it before the table is generated would take the server''s own write path away, so it is recorded and will be replaced by svc_all when iam.apply_rls first runs here.'),
    ('files','idempotency','cld_idempotency_owner_select','r',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (owner_id = ( SELECT auth.uid() AS uid)))',null,
     'KEEP (d). files.idempotency is registered in no class. The policy is an owner-only read (owner_id = auth.uid()) over idempotency keys, which is as narrow as any class would make it, and it is the table''s only client read lane.'),
    ('iam','organizations','org_insert_policy','a',true,'{"authenticated"}',null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (created_by = ( SELECT auth.uid() AS uid)))',
     'KEEP (b). The signed-in create-an-organization lane (WITH CHECK created_by = auth.uid()). It sits under the RESTRICTIVE platform_admin_insert_only wall, so it currently grants nothing on its own, but it is the permissive half the wall is written against and removing it would leave organization creation with no permissive lane to re-open at all.'),
    ('iam','permissions','Users can create permissions for own resources','a',true,'{"authenticated"}',null,'(( SELECT is_platform_admin() AS is_platform_admin) OR is_resource_owner(resource_type, resource_id))',
     'KEEP (b). Narrower than the system class: a principal may grant access only on resources they already own (is_resource_owner(resource_type, resource_id)). The system variant emits no client write lane, so this is the entire sharing door the product''s share dialog writes through.'),
    ('iam','permissions','Users can delete permissions for own resources','d',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR is_resource_owner(resource_type, resource_id))',null,
     'KEEP (b). Narrower than the system class: a principal may revoke access only on resources they already own. This is the entire revoke door the product''s share dialog uses.'),
    ('iam','permissions','Users can update permissions for own resources','w',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR is_resource_owner(resource_type, resource_id))',null,
     'KEEP (b). Narrower than the system class: a principal may change a grant only on resources they already own. This is the entire change-a-grant door the product''s share dialog uses.'),
    ('platform','entity_grants','entity_grants_select_entitled','r',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR ((audience = ''global''::text) OR ((audience = ''organization''::text) AND is_member_of_organization(organization_id)) OR ((audience = ''industry''::text) AND (EXISTS ( SELECT 1
   FROM iam.org_industries oi
  WHERE ((oi.industry_id = entity_grants.industry_id) AND is_member_of_organization(oi.organization_id))))) OR ( SELECT is_super_admin() AS is_super_admin)))',null,
     'KEEP (b). Narrower than a plain system read: it admits a row only when the grant is global, or the grant''s organization is one the reader belongs to, or the grant''s industry matches an organization they belong to, or they are a super admin. Writes are walled RESTRICTIVELY to platform admins. This is the entitlement fan-out the client reads and no generated lane reproduces it.'),
    ('platform','repo','repo_read','r',true,'{"authenticated"}','true',null,
     'KEEP (b). Signed-in read of the platform repository catalogue, with the write axis already walled RESTRICTIVELY to platform admins. Reference data whose read the admin surfaces depend on; recorded so it cannot disappear in a regeneration.'),
    ('platform','taxonomy_node','taxonomy_node_read','r',true,'{"authenticated"}','true',null,
     'KEEP (b). Signed-in read of the platform taxonomy, with the write axis already walled RESTRICTIVELY to platform admins. The taxonomy is the registry''s own shape and every picker reads it; recorded so it cannot disappear in a regeneration.'),
    ('rag','embeddings_google_gemini_2_1536','embeddings_google_gemini_2_cld_share_select','r',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_google_gemini_2_1536.chunk_id) AND (c.valid_to IS NULL) AND (c.source_kind = ''cld_file''::text) AND iam.has_access(''file''::text, (c.source_id)::uuid, ''viewer''::permission_level)))))',null,
     'KEEP (d). rag.embeddings_google_gemini_2_1536 is registered in no class. This read admits an embedding only when the chunk behind it is a live cld_file the reader holds at least viewer access to, through iam.has_access. That is a per-row access join no generated lane expresses; it is one of five narrow read lanes that together are this table''s whole client read surface.'),
    ('rag','embeddings_google_gemini_2_1536','embeddings_google_gemini_2_library_grant_select','r',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR ((( SELECT auth.role() AS role) = ''authenticated''::text) AND (EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_google_gemini_2_1536.chunk_id) AND (c.valid_to IS NULL) AND rag_source_has_library_grant(c.source_kind, c.source_id, NULL::uuid))))))',null,
     'KEEP (d). Registered in no class. This read admits an embedding only when the chunk behind it is live and its source carries a library grant for the signed-in reader. A per-row grant join no generated lane expresses.'),
    ('rag','embeddings_google_gemini_2_1536','embeddings_google_gemini_2_note_share_select','r',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (EXISTS ( SELECT 1
   FROM rag.kg_chunks c
  WHERE ((c.id = embeddings_google_gemini_2_1536.chunk_id) AND (c.valid_to IS NULL) AND (c.source_kind = ''note''::text) AND rag_user_can_see_note((c.source_id)::uuid)))))',null,
     'KEEP (d). Registered in no class. This read admits an embedding only when the chunk behind it is a live note the reader is allowed to see. A per-row share join no generated lane expresses.'),
    ('rag','embeddings_google_gemini_2_1536','embeddings_google_gemini_2_org_select','r',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR ((organization_id IS NOT NULL) AND is_member_of_organization(organization_id)))',null,
     'KEEP (d). Registered in no class. The organization lane of this embedding table: a row is readable when it carries an organization the reader belongs to. Equivalent to the org lane a generated entity would emit, kept because the table is not generated and dropping it would take the org read away entirely.'),
    ('rag','embeddings_google_gemini_2_1536','embeddings_google_gemini_2_owner_select','r',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (owner_id = ( SELECT auth.uid() AS uid)))',null,
     'KEEP (d). Registered in no class. The owner lane of this embedding table (owner_id = auth.uid()). Equivalent to the owner lane a generated entity would emit, kept because the table is not generated.'),
    ('tool','binding','j_delete','d',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_access(''tool''::text, tool_id, ''editor''::permission_level))',null,
     'KEEP (b). Narrower than the system class: only someone holding EDITOR access on the parent tool may remove a binding (iam.has_access(''tool'', tool_id, ''editor'')). The system variant emits no client write lane at all, so this parent-access wall is the entire write door and is deliberately tighter than a bare member lane.'),
    ('tool','binding','j_insert','a',true,'{"authenticated"}',null,'(( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_access(''tool''::text, tool_id, ''editor''::permission_level))',
     'KEEP (b). Narrower than the system class: only someone holding EDITOR access on the parent tool may create a binding (iam.has_access(''tool'', tool_id, ''editor'')). The system variant emits no client write lane at all, so this parent-access wall is the entire write door and is deliberately tighter than a bare member lane.'),
    ('tool','binding','j_select','r',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_access(''tool''::text, tool_id, ''viewer''::permission_level))',null,
     'KEEP (b). Narrower than the system class: a binding is readable only by someone holding at least viewer access on its parent tool (iam.has_access(''tool'', tool_id, ''viewer'')). The parent-access join is exactly the component rule and no generated lane on this table reproduces it.'),
    ('tool','binding','j_update','w',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_access(''tool''::text, tool_id, ''editor''::permission_level))','(( SELECT is_platform_admin() AS is_platform_admin) OR iam.has_access(''tool''::text, tool_id, ''editor''::permission_level))',
     'KEEP (b). Narrower than the system class: only someone holding EDITOR access on the parent tool may change a binding (iam.has_access(''tool'', tool_id, ''editor'')). The system variant emits no client write lane at all, so this parent-access wall is the entire write door and is deliberately tighter than a bare member lane.'),
    ('tool','executor','ref_admin','*',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR ( SELECT is_admin() AS is_admin))','(( SELECT is_platform_admin() AS is_platform_admin) OR ( SELECT is_admin() AS is_admin))',
     'KEEP (b), AND NAMED. The staff write lane for tool.executor: is_platform_admin() OR is_admin(), where is_admin() means a row in admin.admins. It is marginally wider than platform_admin_all beside it — the admin.admins roster rather than the platform-admin view — over class-public reference data. Recorded rather than removed because removing it would take the tool-catalogue editing door away from the staff who use it; the two-roster question is named as a finding in the B-66 report.'),
    ('tool','executor','ref_select','r',true,'{"anon","authenticated"}','true',null,
     'KEEP (b). tool.executor is class public reference data and this is its catalogue read, signed-in and signed-out. Equivalent to the pub_read lane the class regime emits for public reference tables, kept because the table is not generated yet.'),
    ('tool','mcp_config','ref_admin','*',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR ( SELECT is_admin() AS is_admin))','(( SELECT is_platform_admin() AS is_platform_admin) OR ( SELECT is_admin() AS is_admin))',
     'KEEP (b), AND NAMED. The staff write lane for tool.mcp_config: is_platform_admin() OR is_admin(), where is_admin() means a row in admin.admins. It is marginally wider than platform_admin_all beside it — the admin.admins roster rather than the platform-admin view — over class-public reference data. Recorded rather than removed because removing it would take the tool-catalogue editing door away from the staff who use it; the two-roster question is named as a finding in the B-66 report.'),
    ('tool','mcp_config','ref_select','r',true,'{"anon","authenticated"}','true',null,
     'KEEP (b). tool.mcp_config is class public reference data and this is its catalogue read, signed-in and signed-out. Equivalent to the pub_read lane the class regime emits for public reference tables, kept because the table is not generated yet.'),
    ('tool','mcp_server','ref_admin','*',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR ( SELECT is_admin() AS is_admin))','(( SELECT is_platform_admin() AS is_platform_admin) OR ( SELECT is_admin() AS is_admin))',
     'KEEP (b), AND NAMED. The staff write lane for tool.mcp_server: is_platform_admin() OR is_admin(), where is_admin() means a row in admin.admins. It is marginally wider than platform_admin_all beside it — the admin.admins roster rather than the platform-admin view — over class-public reference data. Recorded rather than removed because removing it would take the tool-catalogue editing door away from the staff who use it; the two-roster question is named as a finding in the B-66 report.'),
    ('tool','mcp_server','ref_select','r',true,'{"anon","authenticated"}','true',null,
     'KEEP (b). tool.mcp_server is class public reference data and this is its catalogue read, signed-in and signed-out. Equivalent to the pub_read lane the class regime emits for public reference tables, kept because the table is not generated yet.'),
    ('tool','surface_defaults','ref_admin','*',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR ( SELECT is_admin() AS is_admin))','(( SELECT is_platform_admin() AS is_platform_admin) OR ( SELECT is_admin() AS is_admin))',
     'KEEP (b), AND NAMED. The staff write lane for tool.surface_defaults: is_platform_admin() OR is_admin(), where is_admin() means a row in admin.admins. It is marginally wider than platform_admin_all beside it — the admin.admins roster rather than the platform-admin view — over class-public reference data. Recorded rather than removed because removing it would take the tool-catalogue editing door away from the staff who use it; the two-roster question is named as a finding in the B-66 report.'),
    ('tool','surface_defaults','ref_select','r',true,'{"anon","authenticated"}','true',null,
     'KEEP (b). tool.surface_defaults is class public reference data and this is its catalogue read, signed-in and signed-out. Equivalent to the pub_read lane the class regime emits for public reference tables, kept because the table is not generated yet.'),
    ('users','feedback_comments','Users can comment on own feedback','a',true,null,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR ((author_type = ''user''::text) AND (feedback_id IN ( SELECT user_feedback.id
   FROM users.user_feedback
  WHERE (user_feedback.user_id = ( SELECT auth.uid() AS uid))))))',
     'KEEP (d). users.feedback_comments is registered in no class. A person may add a comment only on their own feedback item and only as author_type ''user''. Writes are otherwise walled RESTRICTIVELY to platform admins, so this is the narrowest possible door for the feature to work at all.'),
    ('users','feedback_comments','Users can view comments on own feedback','r',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (feedback_id IN ( SELECT user_feedback.id
   FROM users.user_feedback
  WHERE (user_feedback.user_id = ( SELECT auth.uid() AS uid)))))',null,
     'KEEP (d). Registered in no class. A person reads comments only on feedback items they filed. This is the whole client read surface of the thread.'),
    ('users','guest_execution_log','Allow guest execution inserts','a',true,null,null,'true',
     'KEEP (d), AND FLAGGED. users.guest_execution_log is registered in no class. This is a deliberate signed-out door — the guest-execution feature records an attempt before anyone has an account — with WITH CHECK (true) and no read lane beside it for anon. Recorded, not removed, because removing it breaks guest execution; the unbounded anonymous INSERT is named as a finding in the B-66 report.'),
    ('users','guest_execution_log','Only service role can read guest executions','r',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (( SELECT auth.role() AS role) = ''service_role''::text))',null,
     'KEEP (d). Registered in no class. Reads are confined to the service role (and platform admins). As narrow as this table gets; it is the reason guest rows are not readable by clients.'),
    ('users','guest_execution_log','admin_all_guest_logs','*',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR (EXISTS ( SELECT 1
   FROM auth.users
  WHERE ((users.id = ( SELECT auth.uid() AS uid)) AND ((users.email)::text ~~ ''%@aimatrx.com''::text)))))',null,
     'KEEP (d), AND FLAGGED. Registered in no class. A staff lane keyed on an ''%@aimatrx.com'' email rather than on the platform-admin roster, FOR ALL, so it is wider than platform_admin_all beside it. Its exact twin on users.guest_executions (admin_all_guest_executions) DOES have a migration of record and is outside DD-172''s remit; superseding one twin and leaving the other would be a safe path beside an unsafe one, so both are named together as a finding in the B-66 report and neither is closed on this lane''s authority.'),
    ('users','guest_execution_log','service_can_manage_logs','*',true,'{"service_role"}','true','true',
     'KEEP (d). Registered in no class. The service-role lane this table has instead of the generated svc_all — identical in effect — and the only path the server writes guest logs through.'),
    ('users','guest_executions','Allow guest execution inserts','a',true,null,null,'true',
     'KEEP (d), AND FLAGGED. users.guest_executions is registered in no class. A deliberate signed-out door: the guest-execution feature records the execution before anyone has an account. Recorded, not removed, because removing it breaks guest execution; the unbounded anonymous INSERT is named as a finding in the B-66 report.'),
    ('users','guest_executions','Only service role can read guest executions','r',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (( SELECT auth.role() AS role) = ''service_role''::text))',null,
     'KEEP (d). Registered in no class. Reads are confined to the service role (and platform admins), which is why guest rows are not readable by clients.'),
    ('users','system_announcements','Authenticated users can view all announcements','r',true,'{"authenticated"}','true',null,
     'KEEP (b). The signed-in read of a class-public system table. The sibling FOR ALL write hole on this table is superseded in the companion DD-172 migration; this read and ''Users can view active announcements'' are what survive, and they move no rows.'),
    ('users','system_announcements','Users can view active announcements','r',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR (is_active = true))',null,
     'KEEP (b). Narrower than the system class read: only announcements with is_active = true, plus the platform-admin lane. Kept beside the all-announcements read because it is the lane the product''s banner component is written against.'),
    ('users','user_follows','Users can follow others','a',true,null,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (( SELECT auth.uid() AS uid) = follower_id))',
     'KEEP (d). users.user_follows is registered in no class. A person may create only their OWN follow edge (auth.uid() = follower_id) — the narrowest possible insert lane for the feature.'),
    ('users','user_follows','Users can unfollow','d',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (( SELECT auth.uid() AS uid) = follower_id))',null,
     'KEEP (d). Registered in no class. A person may delete only their OWN follow edge (auth.uid() = follower_id) — the narrowest possible delete lane for the feature.'),
    ('users','user_form_profile','user_form_profile_delete','d',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (user_id = ( SELECT auth.uid() AS uid)))',null,
     'KEEP (b). The owner lane of a class-private token: user_id = auth.uid(), no org or member lane at all. This is exactly what the entity variant would emit for a private, list-scope-mine token, and it is the table''s ONLY client door — the table is not generated yet, so removing it would take every person''s own form profile away from them.'),
    ('users','user_form_profile','user_form_profile_insert','a',true,null,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (user_id = ( SELECT auth.uid() AS uid)))',
     'KEEP (b). The owner lane of a class-private token: user_id = auth.uid(), no org or member lane at all. This is exactly what the entity variant would emit for a private, list-scope-mine token, and it is the table''s ONLY client door — the table is not generated yet, so removing it would take every person''s own form profile away from them.'),
    ('users','user_form_profile','user_form_profile_select','r',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (user_id = ( SELECT auth.uid() AS uid)))',null,
     'KEEP (b). The owner lane of a class-private token: user_id = auth.uid(), no org or member lane at all. This is exactly what the entity variant would emit for a private, list-scope-mine token, and it is the table''s ONLY client door — the table is not generated yet, so removing it would take every person''s own form profile away from them.'),
    ('users','user_form_profile','user_form_profile_update','w',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (user_id = ( SELECT auth.uid() AS uid)))',null,
     'KEEP (b). The owner lane of a class-private token: user_id = auth.uid(), no org or member lane at all. This is exactly what the entity variant would emit for a private, list-scope-mine token, and it is the table''s ONLY client door — the table is not generated yet, so removing it would take every person''s own form profile away from them.'),
    ('users','user_preferences','user_preferences_delete','d',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR (user_id = ( SELECT auth.uid() AS uid)))',null,
     'KEEP (b). The owner lane of a class-private token: user_id = auth.uid(), no org or member lane at all. This is exactly what the entity variant would emit for a private, list-scope-mine token, and it is the table''s ONLY client door — users.user_preferences holds every person''s default organization and settings, so removing it before the table is generated would sign the whole product out of its own preferences.'),
    ('users','user_preferences','user_preferences_insert','a',true,'{"authenticated"}',null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (user_id = ( SELECT auth.uid() AS uid)))',
     'KEEP (b). The owner lane of a class-private token: user_id = auth.uid(), no org or member lane at all. This is exactly what the entity variant would emit for a private, list-scope-mine token, and it is the table''s ONLY client door — users.user_preferences holds every person''s default organization and settings, so removing it before the table is generated would sign the whole product out of its own preferences.'),
    ('users','user_preferences','user_preferences_select','r',true,'{"authenticated"}','(( SELECT is_platform_admin() AS is_platform_admin) OR (user_id = ( SELECT auth.uid() AS uid)))',null,
     'KEEP (b). The owner lane of a class-private token: user_id = auth.uid(), no org or member lane at all. This is exactly what the entity variant would emit for a private, list-scope-mine token, and it is the table''s ONLY client door — users.user_preferences holds every person''s default organization and settings, so removing it before the table is generated would sign the whole product out of its own preferences.'),
    ('workflow','trigger_event','wf_trigger_event_parent_select','r',true,null,'(EXISTS ( SELECT 1
   FROM workflow.trigger t
  WHERE ((t.id = trigger_event.trigger_id) AND (t.created_by = auth.uid()))))',null,
     'KEEP (d). workflow.trigger_event is registered in no class and this is its ONLY policy: a component read through the parent trigger''s creator (workflow.trigger.created_by = auth.uid()). Narrower than anything a class would emit — there is no platform-admin lane at all here — and it is the whole client surface of the table.'),
    ('workflow','work_item','wf_work_item_parent_select','r',true,null,'(( SELECT is_platform_admin() AS is_platform_admin) OR (EXISTS ( SELECT 1
   FROM workflow.run r
  WHERE ((r.id = work_item.run_id) AND (r.created_by = ( SELECT auth.uid() AS uid))))))',null,
     'KEEP (d). workflow.work_item is registered in no class. A component read through the parent run''s creator (workflow.run.created_by = auth.uid()), plus the platform-admin lane. Narrower than any generated lane and the table''s whole client read surface.')
    ) as t(sch, tbl, pol, cmd, perm, roles, using_expr, check_expr, reason)
    order by sch, tbl, pol
  loop
    if length(btrim(r.reason)) < 60 then
      raise exception 'DD-172: %.% policy % carries a reason of % character(s). A door of record without a sentence saying what it is for is exactly the thing this file exists to end.',
        r.sch, r.tbl, r.pol, length(btrim(r.reason));
    end if;
    if to_regclass(format('%I.%I', r.sch, r.tbl)) is null then
      raise exception 'DD-172: %.% does not exist, so the policy % recorded against it cannot be verified. The record is stale and must be corrected before this file is applied.',
        r.sch, r.tbl, r.pol;
    end if;

    select p.polcmd::text as cmd,
           p.polpermissive as perm,
           (select array_agg(ro.rolname::text order by ro.rolname) from pg_roles ro where ro.oid = any(p.polroles)) as roles,
           pg_get_expr(p.polqual, p.polrelid) as using_expr,
           pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
      into v_live
      from pg_policy p
     where p.polrelid = format('%I.%I', r.sch, r.tbl)::regclass
       and p.polname = r.pol;

    if not found then
      if r.sch = 'cron' then
        raise exception 'DD-172: %.% has no policy named % and this file must NOT create it — cron policies belong to the pg_cron extension, which authors them at install time. Re-creating one here would detach it from the extension. Reinstall or repair pg_cron instead.',
          r.sch, r.tbl, r.pol;
      end if;
      v_cmd := case r.cmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' when '*' then 'all' end;
      if v_cmd is null then
        raise exception 'DD-172: recorded command % for %.% policy % is not one of r/a/w/d/*.', r.cmd, r.sch, r.tbl, r.pol;
      end if;
      if r.roles::text[] is null then
        v_roles := 'public';
      else
        select string_agg(quote_ident(x), ', ' order by x) into v_roles from unnest(r.roles::text[]) as x;
      end if;
      v_sql := format('create policy %I on %I.%I as %s for %s to %s',
                      r.pol, r.sch, r.tbl,
                      case when r.perm then 'permissive' else 'restrictive' end,
                      v_cmd, v_roles);
      if r.using_expr is not null then v_sql := v_sql || format(' using (%s)', r.using_expr); end if;
      if r.check_expr is not null then v_sql := v_sql || format(' with check (%s)', r.check_expr); end if;
      execute v_sql;
      v_created := v_created + 1;
      raise notice 'DD-172 CREATED %.% policy % from the recorded bytes — % ', r.sch, r.tbl, r.pol, r.reason;
    else
      v_live_roles := v_live.roles;
      if v_live.cmd is distinct from r.cmd
         or v_live.perm is distinct from r.perm
         or v_live_roles is distinct from r.roles::text[]
         or v_live.using_expr is distinct from r.using_expr
         or v_live.check_expr is distinct from r.check_expr then
        raise exception E'DD-172 DRIFT — the live policy % on %.% is NOT the policy this migration records.\nrecorded: cmd=% permissive=% roles=%\n          USING %\n          CHECK %\nlive:     cmd=% permissive=% roles=%\n          USING %\n          CHECK %\nSomething changed this door after it was recorded, off the migration path again. Update this file to the new bytes WITH a reason, or put the door back.',
          r.pol, r.sch, r.tbl,
          r.cmd, r.perm, r.roles::text[], coalesce(r.using_expr,'(none)'), coalesce(r.check_expr,'(none)'),
          v_live.cmd, v_live.perm, v_live_roles, coalesce(v_live.using_expr,'(none)'), coalesce(v_live.check_expr,'(none)');
      end if;
      v_verified := v_verified + 1;
    end if;
  end loop;

  if v_created <> 0 then
    raise exception 'DD-172: this file CREATED % policy/policies on this database. It was written as a record of doors that are already live here, so a creation means the live set has changed since 2026-09-13 and the change was never read. Re-run the census before applying.', v_created;
  end if;
  raise notice 'DD-172 — % bespoke policies verified byte-for-byte against their record; 0 created, 0 changed.', v_verified;
end $$;

-- ═══ THE PROOF ════════════════════════════════════════════════════════════════════════════════
-- After this file and its companion, no policy on this database carries a name that appears in no
-- migration file. This block re-runs that census against the live catalogue and the two migration
-- directories are checked from the shell by the B-66 report's census script; what CAN be asserted
-- in SQL is the half that lives in the database: every one of the 81 names DD-172 censused is now
-- either recorded above, or recorded in iam.superseded_policy as deliberately removed.
do $$
declare
  v_names text[] := array[
    'admin|admin_email_logs|Admins can insert email logs',
    'admin|admin_email_logs|Admins can view email logs',
    'admin|admin_markdown_samples|admin_markdown_samples_super_admin_all',
    'admin|admins|admin_access_policy',
    'billing|capability|capability_no_write',
    'billing|capability_limit|capability_limit_no_write',
    'billing|capability_limit|capability_limit_read',
    'billing|price|price_no_write',
    'billing|price|price_read',
    'billing|product|product_no_write',
    'billing|product|product_read',
    'communication|emails|form_insert',
    'context|context_access_log|context_access_log_insert',
    'context|context_access_log|context_access_log_select',
    'context|context_items|context_items_delete',
    'context|context_items|context_items_insert',
    'context|context_items|context_items_update',
    'context|scope_types|scope_types_delete',
    'context|scope_types|scope_types_insert',
    'context|scope_types|scope_types_update',
    'context|template_context_items|template_ci_select',
    'context|template_scope_types|template_st_select',
    'cron|job|cron_job_policy',
    'cron|job_run_details|cron_job_run_details_policy',
    'education|math_course_structure|Authenticated users can manage course structure',
    'education|math_course_structure|Public can view course structure',
    'extend|wbx_demo|wbx_demo_owner_delete',
    'extend|wbx_demo|wbx_demo_owner_insert',
    'extend|wbx_demo|wbx_demo_owner_select',
    'extend|wbx_demo|wbx_demo_owner_update',
    'extend|wbx_guidance|wbx_guidance_owner_delete',
    'extend|wbx_guidance|wbx_guidance_owner_insert',
    'extend|wbx_guidance|wbx_guidance_owner_select',
    'extend|wbx_guidance|wbx_guidance_svc',
    'files|idempotency|cld_idempotency_owner_select',
    'iam|organizations|org_insert_policy',
    'iam|permissions|Users can create permissions for own resources',
    'iam|permissions|Users can delete permissions for own resources',
    'iam|permissions|Users can update permissions for own resources',
    'platform|entity_grants|entity_grants_select_entitled',
    'platform|repo|repo_read',
    'platform|taxonomy_node|taxonomy_node_read',
    'rag|embeddings_google_gemini_2_1536|embeddings_google_gemini_2_cld_share_select',
    'rag|embeddings_google_gemini_2_1536|embeddings_google_gemini_2_library_grant_select',
    'rag|embeddings_google_gemini_2_1536|embeddings_google_gemini_2_note_share_select',
    'rag|embeddings_google_gemini_2_1536|embeddings_google_gemini_2_org_select',
    'rag|embeddings_google_gemini_2_1536|embeddings_google_gemini_2_owner_select',
    'tool|binding|j_delete',
    'tool|binding|j_insert',
    'tool|binding|j_select',
    'tool|binding|j_update',
    'tool|executor|ref_admin',
    'tool|executor|ref_select',
    'tool|mcp_config|ref_admin',
    'tool|mcp_config|ref_select',
    'tool|mcp_server|ref_admin',
    'tool|mcp_server|ref_select',
    'tool|surface_defaults|ref_admin',
    'tool|surface_defaults|ref_select',
    'users|feedback_comments|Users can comment on own feedback',
    'users|feedback_comments|Users can view comments on own feedback',
    'users|guest_execution_log|Allow guest execution inserts',
    'users|guest_execution_log|Only service role can read guest executions',
    'users|guest_execution_log|admin_all_guest_logs',
    'users|guest_execution_log|service_can_manage_logs',
    'users|guest_executions|Allow guest execution inserts',
    'users|guest_executions|Only service role can read guest executions',
    'users|system_announcements|Authenticated users can manage announcements',
    'users|system_announcements|Authenticated users can view all announcements',
    'users|system_announcements|Users can view active announcements',
    'users|user_follows|Users can follow others',
    'users|user_follows|Users can unfollow',
    'users|user_form_profile|user_form_profile_delete',
    'users|user_form_profile|user_form_profile_insert',
    'users|user_form_profile|user_form_profile_select',
    'users|user_form_profile|user_form_profile_update',
    'users|user_preferences|user_preferences_delete',
    'users|user_preferences|user_preferences_insert',
    'users|user_preferences|user_preferences_select',
    'workflow|trigger_event|wf_trigger_event_parent_select',
    'workflow|work_item|wf_work_item_parent_select'  ];
  v_entry text;
  v_parts text[];
  v_live boolean;
  v_gone boolean;
  v_recorded integer := 0;
  v_superseded integer := 0;
begin
  foreach v_entry in array v_names loop
    v_parts := string_to_array(v_entry, '|');
    v_live := to_regclass(format('%I.%I', v_parts[1], v_parts[2])) is not null
              and exists (select 1 from pg_policy p
                           where p.polrelid = format('%I.%I', v_parts[1], v_parts[2])::regclass
                             and p.polname = v_parts[3]);
    v_gone := exists (select 1 from iam.superseded_policy s
                       where s.schema_name = v_parts[1] and s.table_name = v_parts[2] and s.policy_name = v_parts[3]);
    if v_live and v_gone then
      raise exception 'DD-172: % is BOTH live and recorded as superseded. One of the two records is a lie and the door must be read again before either is trusted.', v_entry;
    end if;
    if not v_live and not v_gone then
      raise exception 'DD-172: % is neither live nor recorded in iam.superseded_policy. It left this database without anyone saying why — which is the whole defect DD-172 closes.', v_entry;
    end if;
    if v_live then v_recorded := v_recorded + 1; else v_superseded := v_superseded + 1; end if;
  end loop;
  raise notice 'DD-172 CLOSURE — % of the 81 censused policies are live and recorded by this file; % are recorded in iam.superseded_policy with a reason. None is unaccounted for.', v_recorded, v_superseded;
end $$;
