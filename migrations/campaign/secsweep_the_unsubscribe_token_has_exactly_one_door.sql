-- lane: SECURITY-SWEEP
-- Chair ruling 1: `platform` and `iam` are NOT client-writable through PostgREST — every write
-- goes through a SECURITY DEFINER door, reads stay under RLS. Plus the three bearer-credential
-- tables the guard could not see until this lane made a bare `token` prove itself.
--
-- WHAT THE GUARD WAS BLIND TO. `check:unpinned-security-columns` exempted every column
-- literally named `token` as "vocabulary", because in this codebase a token is usually a
-- registry key. Three of them are not:
--
--   platform.share_links.token   366 distinct 64-character strings. THE string in `/s/<token>`.
--       Presenting it grants whatever `permission_level` the same row names, to anybody, with
--       no sign-in — `public.share_link_authorizes(token, …)` is the whole check. The same row's
--       `permission_level` was ALSO unpinned, so a signed-in person could POST a link row
--       naming a resource, a token of her choosing and `full`, and hand the URL to anyone.
--   iam.invitations.token        33 distinct uuids — the invitation a stranger presents to join
--       an organization.
--   crm.unsubscribe_token.token  the one-click unsubscribe proof.
--
-- All three had `insert/update/delete = true` for `authenticated`.
--
-- THE DOORS ALREADY EXIST AND THE APP ALREADY USES THEM — this file removes a second path that
-- no code walks, it does not move any caller:
--   `public.create_share_link` / `public.revoke_share_link` / `public.list_share_links`, and
--       `utils/permissions/shareLinks.ts` says it in its own header: "Every write routes
--       through a SECURITY DEFINER RPC — never touch `platform.share_links` directly from the
--       client." There is no `.from("share_links")` on the platform table anywhere in
--       matrx-frontend (the `files.share_links` mentions are a DIFFERENT, legacy table in
--       another schema and are untouched here).
--   the `inv_*` family. `features/organizations/FEATURE.md` already asserts "`iam.invitations`
--       has NO direct client grant. … Direct `.from("invitations")` is a bug (42501)" — the
--       declared contract was right and the DATABASE disagreed with it. No caller exists.
--   `crm.issue_unsubscribe_token(...)`, called by `features/crm/compliance/service.ts:222`
--       through `.rpc(...)`, and `public.outreach_unsubscribe(p_token, …)` for the consume
--       side. No `.from("unsubscribe_token")` exists.
--
-- RESTRICTIVE policies, exactly the shape `seckeys_api_keys_have_exactly_one_door.sql` used:
-- they AND with the permissive ones, so no permissive policy — present or future, generated or
-- hand-written — can re-open the write, and their bespoke names are deliberately NOT in
-- `iam.generated_policy_names()`, which is what makes `iam.apply_rls` preserve them across
-- every regeneration (DD-147).
--
-- READS ARE UNTOUCHED, which is ruling 1's other half: `service_role` (the `svc_all` policy),
-- `postgres`, and every SECURITY DEFINER door run as the table owner are not subject to these
-- policies, and the client's SELECT lane is exactly what it was.
--
-- ADDITIVE. Nothing is dropped, renamed or revoked.
-- Inverse: migrations/inverse/secsweep_three_bearer_tokens_have_exactly_one_door.inverse.sql
-- Guard: `pnpm check:unpinned-security-columns` — a table closed by a restrictive refusal
-- yields no findings at all, so all four `share_links` entries and both `token` entries go.

-- SPLIT FROM secsweep_three_bearer_tokens_have_exactly_one_door.sql: CREATE POLICY takes an
-- ACCESS EXCLUSIVE lock, and one transaction over three busy tables timed out twice against
-- peer lanes. One table per file, so a cut loses nothing.

-- SPLIT, one table per file: CREATE POLICY takes an ACCESS EXCLUSIVE lock, and one
-- transaction over all three tables timed out twice (55P03) against peer lanes holding
-- them. Applying and committing per table means a cut loses nothing.

create policy unsubscribe_token_client_insert_refused on crm.unsubscribe_token
  as restrictive for insert to authenticated, anon with check (false);
create policy unsubscribe_token_client_update_refused on crm.unsubscribe_token
  as restrictive for update to authenticated, anon using (false) with check (false);
create policy unsubscribe_token_client_delete_refused on crm.unsubscribe_token
  as restrictive for delete to authenticated, anon using (false);

comment on policy unsubscribe_token_client_insert_refused on crm.unsubscribe_token is
  'SECURITY-SWEEP 2026-09-21. The one-click unsubscribe proof. Issued by crm.issue_unsubscribe_token and consumed by public.outreach_unsubscribe, both SECURITY DEFINER; a client that could mint one could unsubscribe anybody, and one that could edit one could keep a person on a list they left.';
comment on policy unsubscribe_token_client_update_refused on crm.unsubscribe_token is
  'SECURITY-SWEEP 2026-09-21: the consume side is public.outreach_unsubscribe, never a client UPDATE.';
comment on policy unsubscribe_token_client_delete_refused on crm.unsubscribe_token is
  'SECURITY-SWEEP 2026-09-21: an unsubscribe record is the compliance evidence — a client never deletes it.';
