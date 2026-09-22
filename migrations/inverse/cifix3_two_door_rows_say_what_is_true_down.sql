-- chair-step: the inverse of
--   `migrations/campaign/cifix3_two_door_rows_say_what_is_true.sql`. It puts the two sentences on
--   `platform.client_callable_door` for `platform.entity_organization_id` back to the exact bytes
--   they held before that file ran, and hands `workbench._udt_display_spec(jsonb)` its
--   `authenticated` EXECUTE back. Nothing is created and nothing is dropped in either direction;
--   no function body is touched; no row of anybody's data is read or written.
--
--   WHAT IT RESTORES IS A DEFECT, DELIBERATELY. The reason string it puts back claims "Every
--   caller is a door that checks iam.has_org_access on the answer", which was measured FALSE on
--   2026-09-22 (`public.access_request_create` gates on `iam.has_access`), and the grant it puts
--   back is the undeclared client EXECUTE the door row says must not exist. That is what an
--   inverse is for: the world as it was, not the world as it should be. `pnpm check:impl-doors
--   --strict` goes red on D11 and D16a again the moment this runs, which is the proof it worked.
--
--   THE LOCK: an UPDATE of two text columns on one row of our own register, and one REVOKE's
--   mirror image. `grant` is ACCESS SHARE with ZERO relations from the `supautils.policy_grants`
--   hook set and zero ACCESS EXCLUSIVE (the DDL-LOCK-CENSUS measurement,
--   `scripts/lib/ddl-lock-footprint.json`), and an UPDATE of one row takes ROW EXCLUSIVE. Neither
--   direction of this pair is window-class and either may be run at any hour.

update platform.client_callable_door
   set reason =
         'Reads one column of one row of a registered table as the definer, so it bypasses RLS: '
         'given an entity id it answers which organization owns it. NEVER client-callable -- a '
         'direct caller could use it as an oracle mapping any record id to its tenant. Every '
         'caller is a door that checks iam.has_org_access on the answer before doing anything '
         'with it.',
       non_client_lane =
         'server_only: called from inside SECURITY DEFINER doors that need the organization a '
         'record belongs to (public.cmt_add today).'
 where schema_name = 'platform'
   and function_name = 'entity_organization_id'
   and identity_args = 'p_token text, p_id uuid';

grant execute on function workbench._udt_display_spec(jsonb) to authenticated;
