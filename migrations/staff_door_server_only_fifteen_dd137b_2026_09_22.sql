-- staff_door_server_only_fifteen_dd137b_2026_09_22
-- chair-step: closes the platform-admin read lane on fifteen tables NO browser code reads plus education.deck_suggestion's trailing super-admin arm; every one is reached by the server as the service role, which RLS does not apply to
--
-- THE FINDING. Sixth file of the DD-137b staff-door sweep (GATES-3, 2026-09-22). The sweep opened
-- at 99 tokens / 50 components and stands at 18 / 7. Sixteen of the eighteen were held back because
-- removing the staff lane would leave NO permissive read policy at all — the staff lane IS the
-- table's only client read — and a table nobody can read from a browser is only correct if nobody
-- reads it from a browser.
--
-- SO THAT WAS MEASURED, not assumed. A `.from("<table>")` census across app/, features/, lib/ and
-- components/ (2026-09-22) finds ZERO browser or server-component reads of fifteen of them:
-- assignment.attempt, assignment.item, legal.citations, legal.courts, legal.dockets,
-- legal.ingest_runs, legal.opinion_clusters, legal.opinions, billing.class_purchase,
-- seo.classifier_revision_ledger, seo.keyword_classification_queue, seo.topic_placement_queue,
-- context.context_value_refs, content_ir.io_contract, web.endpoint_family_sweep_state. Every one
-- is written and read by a server path running as the SERVICE ROLE — billing.class_purchase says
-- so in its own file header ("runs with the admin (service_role) client, which is the ONLY writer
-- … both are RLS deny-by-default") — and RLS does not apply to that role at all. Their
-- `platform_admin_all` is dead weight that grants our own staff a standing read of data no screen
-- asks for, which is exactly what DD-137b §3.5 forbids. The RESTRICTIVE `platform_admin_only`
-- policy on each is left exactly where it is: it narrows, it never widens.
--
-- `seo.classifier_revision_ledger` carries no policy at all; all it owed was the registry
-- declaration, so that is all it gets.
--
-- ALSO HERE, one arm the earlier files left behind. `education.deck_suggestion`'s `ds_read` was
-- superseded by staff_door_forty_tokens to drop its `is_platform_admin()` prefix, and a SECOND
-- staff arm survived inside what was left: `OR (select is_super_admin())`. A super admin is our own
-- staff and this guard measures `is_super_admin` exactly as it measures `is_platform_admin`, so it
-- goes too — the suggester and the owner keep their read, verbatim, and the service role keeps
-- `ds_service_all`.
--
-- 🚨 NOT HERE, and why — the two the sweep cannot close without a decision:
--   · billing.account_addon — features/admin/limits/service.ts reads it from the BROWSER with the
--     signed-in admin's own session and the platform-admin lane is its only read. Closing it means
--     moving that read to the admin client first, the way
--     features/admin/shared-knowledge/server.ts already does and explains in its own header. That
--     is a code change, not a policy change.
--   · platform.outcome_event — its staff arm lives inside `std_select`, a GENERATED name that
--     `iam.supersede_bespoke_policies` refuses by design (DD-204), while `iam.apply_rls` cannot be
--     used because the table carries bespoke `outcome_event_client_*_refused` policies it would not
--     re-emit.
-- Both are named in the GATES-3 report and excused nowhere: the guard keeps reporting them.

set local lock_timeout = '30s';

update platform.entity_types
   set suppress_platform_admin_lane = true
 where token in ('attempt', 'citations', 'class_purchase', 'classifier_revision_ledger',
                 'context_value_refs', 'courts', 'dockets', 'endpoint_family_sweep_state',
                 'ingest_runs', 'io_contract', 'item', 'keyword_classification_queue',
                 'opinion_clusters', 'opinions', 'topic_placement_queue', 'deck_suggestion')
   and not suppress_platform_admin_lane;

drop policy platform_admin_all on assignment.attempt;
drop policy platform_admin_all on assignment.item;
drop policy platform_admin_all on billing.class_purchase;
drop policy platform_admin_all on content_ir.io_contract;
drop policy platform_admin_all on context.context_value_refs;
drop policy platform_admin_all on legal.citations;
drop policy platform_admin_all on legal.courts;
drop policy platform_admin_all on legal.dockets;
drop policy platform_admin_all on legal.ingest_runs;
drop policy platform_admin_all on legal.opinion_clusters;
drop policy platform_admin_all on legal.opinions;
drop policy platform_admin_all on seo.keyword_classification_queue;
drop policy platform_admin_all on seo.topic_placement_queue;
drop policy platform_admin_all on web.endpoint_family_sweep_state;

select iam.supersede_bespoke_policies('education', 'deck_suggestion', array['ds_read'],
  'DD-137b staff door (2026-09-22, GATES-3): a second staff arm, OR (select is_super_admin()), survived the first supersede; re-created with the suggester and owner arms verbatim and no staff arm.');
create policy ds_read on education.deck_suggestion
  for select to authenticated
  using ((suggested_by = ( SELECT auth.uid() AS uid)) OR (owner_id = ( SELECT auth.uid() AS uid)));
