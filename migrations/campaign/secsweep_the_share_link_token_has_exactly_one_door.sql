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

create policy share_links_client_insert_refused on platform.share_links
  as restrictive for insert to authenticated, anon with check (false);
create policy share_links_client_update_refused on platform.share_links
  as restrictive for update to authenticated, anon using (false) with check (false);
create policy share_links_client_delete_refused on platform.share_links
  as restrictive for delete to authenticated, anon using (false);

comment on policy share_links_client_insert_refused on platform.share_links is
  'SECURITY-SWEEP 2026-09-21, chair ruling 1. A client never writes a share-link row. `token` IS the authorization for a no-login viewer and `permission_level` is what it grants, and the std_insert policy pinned neither. Minting is public.create_share_link (SECURITY DEFINER, owner-gated, token minted server-side); retiring is public.revoke_share_link. RESTRICTIVE so no permissive policy can re-open it; bespoke on purpose, so iam.apply_rls preserves it.';
comment on policy share_links_client_update_refused on platform.share_links is
  'SECURITY-SWEEP 2026-09-21: a client never edits a share-link row either — token, permission_level, expires_at, max_uses and is_active are all authorization. Retiring goes through public.revoke_share_link.';
comment on policy share_links_client_delete_refused on platform.share_links is
  'SECURITY-SWEEP 2026-09-21: a share link is revoked, never deleted by a client.';

comment on column platform.share_links.token is
  'THE CREDENTIAL. The string in /s/<token>; presenting it grants this row''s permission_level with no sign-in (public.share_link_authorizes). Minted only by public.create_share_link. Never written by a client — refused at the row level since 2026-09-21. Not to be confused with short_token, which is a URL alias and carries no authorization.';
comment on column platform.share_links.permission_level is
  'What presenting this link''s token grants. Decided by public.create_share_link from the caller''s own access, never chosen by a client. SECURITY-SWEEP, 2026-09-21.';
