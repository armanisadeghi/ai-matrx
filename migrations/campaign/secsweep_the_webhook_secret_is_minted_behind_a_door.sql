-- lane: SECURITY-SWEEP
-- allows: revoke files
-- based-on: files.webhook_create(text, uuid, text, text[], text[]) 9a62fcbcffe562307b2944758b561b4e5d575e1b8af05f474531afa5ca34ffe9
-- based-on: files.webhook_rotate_secret(uuid) 6d63c9874d5db2bebfe5e9ef318a8d5f634d568f131f95e7e9b9bc3a1a7df0f5
-- Chair ruling 2, the half that needed a DOOR rather than a policy edit: a signing secret the
-- BROWSER generates is a secret the browser chooses.
--
-- WHAT IT IS TODAY. `features/files/webhooks/service.ts` carries
-- `generateWebhookSecret()` — 24 bytes of `crypto.getRandomValues` in the page — and POSTs the
-- result straight into `files.webhooks.secret` over PostgREST, both at create
-- (`createWebhook`) and at rotate (`rotateWebhookSecret`, a bare
-- `.update({ secret })`). `files.webhook_sign(w.secret, body)` is what the dispatcher then
-- signs every outbound delivery with, and what the receiving system verifies. So the value the
-- server will later prove itself with is chosen client-side, by whatever is running in the tab.
-- The row policy scopes it to the owner, so this is not somebody else's webhook — it is the
-- shape of the defect, and the fix is the same one CRITICAL-1 needed: the credential is minted
-- where it is verified.
--
-- THE TWO DOORS. Same shape as the two that already exist on this table
-- (`files.webhook_send_test`, `files.webhook_redeliver`): SECURITY DEFINER, the caller resolved
-- inside the body by `auth.uid()`, owner-checked, `search_path` pinned.
--
--   files.webhook_create(target_url, description, organization_id, event_types, resource_types)
--       Mints `whsec_` + 48 hex characters from `gen_random_bytes(24)` — the SAME shape and
--       the same 24 bytes the browser was producing, so nothing downstream changes — stamps
--       `owner_id = auth.uid()`, and returns the whole row INCLUDING the secret ONCE. That
--       single return is the only time a client ever sees it, exactly as the UI already
--       behaves ("shown once at creation").
--   files.webhook_rotate_secret(webhook_id)
--       Owner-checked, mints a new one, returns it once.
--
-- Both refuse an unsafe target through the SAME `files.is_safe_webhook_url` the table's own
-- SSRF guard uses, rather than growing a second opinion about what a safe URL is.
--
-- 🚨 `gen_random_bytes` IS SCHEMA-QUALIFIED, and the end-to-end proof is what found that. On
-- this database pgcrypto lives in `extensions`, not `public`, so a door with
-- `search_path = pg_catalog, public` answered every real caller `42883 function
-- gen_random_bytes(integer) does not exist` — a Create button that refuses everybody. The
-- pinned search_path names `extensions` AND the call is written `extensions.gen_random_bytes`,
-- because a door that mints a credential should not depend on a resolution order to find its
-- randomness. Applying the file and calling the door over HTTP is what a syntax check would
-- never have told us.
--
-- THE GRANT IS NOT WITHDRAWN IN THIS FILE. `secret` stops being client-writable in
-- `secsweep_the_webhook_secret_leaves_the_client_grant.sql`, which lands only after the
-- callers move — a door nobody calls plus a withdrawn grant is a broken Create button. This
-- file is additive and safe on its own: the doors exist beside the old path until it is gone.
--
-- Inverse: migrations/inverse/secsweep_the_webhook_secret_is_minted_behind_a_door.inverse.sql
-- `-- allows: revoke files` covers the two REVOKEs below: a brand-new SECURITY DEFINER
-- function is created with EXECUTE to PUBLIC, so withholding it from `public`/`anon` before
-- granting `authenticated` is what makes the door signed-in-only. Both stay inside `files`.
-- Guard: `pnpm check:unpinned-security-columns` (after the grant file), and
-- `platform.client_callable_door` rows are declared here BEFORE the GRANT, as db-rules §6d-4
-- requires — without them the DDL guard revokes the client EXECUTE inside the GRANT itself.

create or replace function files.webhook_create(
  p_target_url       text,
  p_organization_id  uuid,
  p_description      text default null,
  p_event_types      text[] default null,
  p_resource_types   text[] default null
) returns files.webhooks
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_row files.webhooks;
begin
  if v_uid is null then
    raise exception 'You must be signed in to create a webhook.' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'A webhook is filed in an organization. Choose one.' using errcode = '23514';
  end if;
  if not iam.has_org_access(p_organization_id) then
    raise exception 'You are not a member of that organization.' using errcode = '42501';
  end if;
  -- The table's own SSRF guard is the enforcement; asking it here means the refusal arrives
  -- with a sentence instead of a constraint name, and the two can never disagree.
  if not files.is_safe_webhook_url(p_target_url) then
    raise exception 'A webhook target must be a safe https endpoint. % is not one.', p_target_url
      using errcode = '23514';
  end if;

  insert into files.webhooks (
    owner_id, target_url, secret, description, organization_id,
    event_types, resource_types, is_active
  ) values (
    v_uid,
    p_target_url,
    -- THE MINT. 24 random bytes, hex, `whsec_`-prefixed: byte-for-byte the shape the browser
    -- was producing, so every receiver that already verifies these signatures is unaffected.
    'whsec_' || encode(extensions.gen_random_bytes(24), 'hex'),
    p_description,
    p_organization_id,
    p_event_types,
    p_resource_types,
    true
  ) returning * into v_row;

  -- The secret rides back exactly once, which is what the screen already promises.
  return v_row;
end;
$fn$;

create or replace function files.webhook_rotate_secret(p_webhook_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_secret text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to rotate a webhook secret.' using errcode = '42501';
  end if;
  select owner_id into v_owner from files.webhooks where id = p_webhook_id;
  if v_owner is null then
    raise exception 'That webhook no longer exists.' using errcode = 'P0002';
  end if;
  if v_owner is distinct from v_uid then
    raise exception 'That webhook is not yours to rotate.' using errcode = '42501';
  end if;

  v_secret := 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');
  update files.webhooks
     set secret = v_secret, updated_at = now()
   where id = p_webhook_id;
  return v_secret;
end;
$fn$;

comment on function files.webhook_create(text, uuid, text, text[], text[]) is
  'Creates an outbound webhook and MINTS its signing secret server-side, returning it exactly once. SECURITY-SWEEP 2026-09-21: the browser used to generate the secret (features/files/webhooks/service.ts generateWebhookSecret) and POST it, so the value files.webhook_sign later proves every delivery with was chosen in the tab. A credential is minted where it is verified.';
comment on function files.webhook_rotate_secret(uuid) is
  'Rotates an outbound webhook''s signing secret, owner-checked, returning the new one exactly once. SECURITY-SWEEP 2026-09-21; replaces a bare client UPDATE of files.webhooks.secret.';

-- db-rules §6d-4: the register row comes BEFORE the GRANT, or the DB-wide guard revokes the
-- client EXECUTE inside the GRANT and leaves a platform.ddl_guard_log row behind.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   gate_predicate, anonymous_callers, signed_in_callers)
values
  ('files', 'webhook_create',
   'p_target_url text, p_organization_id uuid, p_description text, p_event_types text[], p_resource_types text[]',
   'SECURITY-SWEEP',
   'Signed-in door. SECURITY DEFINER; mints the webhook signing secret server-side and returns it once, replacing a browser-generated secret POSTed over PostgREST. The caller is resolved inside the body by auth.uid() and must be a member of the named organization; anon holds no EXECUTE.',
   'auth.uid()', false, true),
  ('files', 'webhook_rotate_secret', 'p_webhook_id uuid',
   'SECURITY-SWEEP',
   'Signed-in door. SECURITY DEFINER; owner-checked rotation of the webhook signing secret, returned once. Replaces a bare client UPDATE of files.webhooks.secret. anon holds no EXECUTE.',
   'auth.uid()', false, true)
on conflict do nothing;

revoke all on function files.webhook_create(text, uuid, text, text[], text[]) from public, anon;
revoke all on function files.webhook_rotate_secret(uuid) from public, anon;
grant execute on function files.webhook_create(text, uuid, text, text[], text[]) to authenticated;
grant execute on function files.webhook_rotate_secret(uuid) to authenticated;
