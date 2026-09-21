-- lane: SECURITY-SWEEP
-- Chair ruling 2 (2026-09-21): "credential/secret/token-hash columns never client-writable at
-- all." The burn-down of the 233-row `check:unpinned-security-columns` baseline that
-- SECURITY-KEYS installed, sharpest subset first.
--
-- SIX CREDENTIAL COLUMNS THAT NO CLIENT CODE HAS EVER WRITTEN, AND EVERY CLIENT CAN.
-- Each of these is served over PostgREST to `authenticated` with a TABLE-level
-- INSERT/UPDATE grant, so a signed-in person may choose its value on any row her row policy
-- admits. Not one of them is written by a browser anywhere in the platform — the census is
-- recorded per column below, and the legitimate writer is named:
--
--   platform.egress_device.token_hash          the home-relay device's credential digest.
--       The browser writes exactly two columns (`enabled`, `display_name`,
--       `features/residential-egress/service.ts`) and reads a named column list
--       (`EGRESS_DEVICE_COLUMNS`) that already excludes this one and `token_prefix`.
--       The gateway mints and rotates the token.
--   platform.action_request.token_hash         the approval-link digest. ZERO frontend
--       callers: no `.from("action_request")` exists in matrx-frontend at all; the row and
--       its token are minted server-side.
--   crm.sending_identity.domain_verification_token   the proof a domain is yours. ZERO
--       frontend callers. A client that could write it could claim any sender domain.
--   workflow.trigger.webhook_secret            the inbound webhook's shared secret. The UI
--       sends it to aidream's `POST /triggers` door
--       (`features/workflow-runtime/triggers/useWorkflowTriggers.ts`), never to PostgREST;
--       `triggers/types.ts` says out loud that the column is "deliberately absent" from the
--       client row type because the server marks it `exclude=True`.
--   web.crawl_schedule.claim_token             the crawl lease's fencing token. The service
--       file's own header says "server writes EXECUTION — claim_token, claim_expires_at …"
--       and "a browser cannot clear a live claim_token mid-lease"; its reads use the named
--       `CRAWL_SCHEDULE_COLUMNS`, which excludes it. Until now the browser could.
--   browser.login_attempt.credential_item_id   which saved credential a login attempt used.
--       ZERO frontend callers; the cloud-browser writes it through aidream. Choosing it
--       client-side is choosing somebody else's saved login.
--
-- THE MECHANISM IS THE PLATFORM'S OWN, NOT A BESPOKE POLICY. `iam.apply_table_grants` already
-- issues a COLUMN-level grant, omitting every name in `platform.entity_types
-- .client_excluded_columns` (db-rules §6d-2). That is how `esign.signing_key.secret_key`,
-- `hr.kiosk_device.device_secret_hash`, `hr.kiosk_session.session_token_hash`,
-- `hr.provider_binding.credential_ref` and `users.integration_connections.credential_item_id`
-- are ALREADY closed on this database. Declaring it is what makes it survive: the declaration
-- is re-read by every future `iam.apply_rls` / `iam.apply_table_grants` run, so a regeneration
-- cannot quietly re-open the column — which a hand-issued REVOKE would not survive.
--
-- The withheld column loses client SELECT as well as INSERT/UPDATE, which is correct for a
-- credential and is why this file takes only the six columns whose readers were checked one by
-- one: every caller above reads a NAMED column list, or does not exist. Tables in the same
-- baseline whose app code does `select("*")` (`research.rs_topic`, `seo.collection_run`,
-- `browser.action_event`, `browser.account_binding`) are deliberately NOT in this file —
-- excluding a column there would 42501 a live read. They need a write-only exclusion or a
-- door, and they stay in the baseline until one lands. UNMEASURED IS NOT CLOSED.
--
-- ADDITIVE for the app: nothing is dropped or renamed; one array column gains six values and
-- the grants are re-derived from it.
-- Inverse: migrations/inverse/secsweep_a_credential_column_is_never_client_writable.inverse.sql
-- Guard: `pnpm check:unpinned-security-columns` — these twelve baseline entries
-- (six columns × INSERT and UPDATE policies) disappear, and the shrink-only ratchet fails
-- until the baseline records the win.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('platform','egress_device',    'token_hash',                'entity'),
      ('platform','action_request',   'token_hash',                'entity'),
      ('crm',     'sending_identity', 'domain_verification_token', 'entity'),
      ('workflow','trigger',          'webhook_secret',            'entity'),
      ('web',     'crawl_schedule',   'claim_token',               'component'),
      ('browser', 'login_attempt',    'credential_item_id',        'component')
    ) as t(schema_name, table_name, column_name, variant)
  loop
    -- The column must exist, or the declaration is stale the moment it is written and
    -- apply_table_grants will refuse on the next run rather than here, where it is readable.
    if not exists (
      select 1 from information_schema.columns
       where table_schema = r.schema_name and table_name = r.table_name
         and column_name = r.column_name
    ) then
      raise exception 'secsweep: %.% has no column % — the census is stale, stopping',
        r.schema_name, r.table_name, r.column_name;
    end if;

    -- The registry row must exist and must agree about the variant, so this file cannot
    -- silently re-grant a table under the wrong lane set.
    if not exists (
      select 1 from platform.entity_types
       where schema_name = r.schema_name and table_name = r.table_name
         and rls_variant = r.variant
    ) then
      raise exception
        'secsweep: %.% has no platform.entity_types row with rls_variant % — refusing to re-grant',
        r.schema_name, r.table_name, r.variant;
    end if;

    -- APPEND, never replace: another lane's exclusions on the same table stay.
    update platform.entity_types
       set client_excluded_columns = (
             select array_agg(distinct x order by x)
               from unnest(coalesce(client_excluded_columns, '{}'::text[])
                           || array[r.column_name]) x)
     where schema_name = r.schema_name and table_name = r.table_name
       and not (r.column_name = any (coalesce(client_excluded_columns, '{}'::text[])));

    -- The declaration is the intent; the ACLs are its artifact. Re-derive them.
    perform iam.apply_table_grants(r.schema_name, r.table_name, r.variant);

    if has_column_privilege('authenticated',
         format('%I.%I', r.schema_name, r.table_name)::regclass, r.column_name, 'INSERT')
       or has_column_privilege('authenticated',
         format('%I.%I', r.schema_name, r.table_name)::regclass, r.column_name, 'UPDATE') then
      raise exception
        'secsweep: %.%.% is STILL client-writable after the exclusion — refusing to report a fix that did not happen',
        r.schema_name, r.table_name, r.column_name;
    end if;

    raise notice 'secsweep: %.%.% is no longer writable or readable by a client role',
      r.schema_name, r.table_name, r.column_name;
  end loop;
end $$;

comment on column platform.egress_device.token_hash is
  'The relay device''s credential digest. Minted and rotated by the gateway; withheld from every client role by platform.entity_types.client_excluded_columns. SECURITY-SWEEP, 2026-09-21.';
comment on column platform.action_request.token_hash is
  'The approval link''s credential digest. Minted server-side; withheld from every client role. SECURITY-SWEEP, 2026-09-21.';
comment on column crm.sending_identity.domain_verification_token is
  'The proof a sending domain is yours. Issued server-side; a client that could write it could claim any domain. Withheld from every client role. SECURITY-SWEEP, 2026-09-21.';
comment on column workflow.trigger.webhook_secret is
  'The inbound webhook''s shared secret. Set through aidream POST /triggers, never over PostgREST. Withheld from every client role. SECURITY-SWEEP, 2026-09-21.';
comment on column web.crawl_schedule.claim_token is
  'The crawl lease''s fencing token. The server owns the execution columns; a browser must never be able to clear a live lease. Withheld from every client role. SECURITY-SWEEP, 2026-09-21.';
comment on column browser.login_attempt.credential_item_id is
  'Which saved credential this attempt used. Written by the cloud browser through aidream; choosing it client-side is choosing somebody else''s saved login. Withheld from every client role. SECURITY-SWEEP, 2026-09-21.';
