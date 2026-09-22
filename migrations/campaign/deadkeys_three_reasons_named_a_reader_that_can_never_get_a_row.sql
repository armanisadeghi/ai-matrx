-- lane: DEAD-KEYS
-- chair-step: this file calls `iam.apply_table_grants(...)`, a spec-driven builder whose statements
-- the additive allow-list cannot read ahead of time, and the builder's symmetric half REVOKES. The
-- revoke is the point of the file and every one of its three targets was proven, live, to be
-- unreachable by any anonymous reader before it was written.
-- DD-249 / R12 — ANON-LANES' OTHER THREE DEAD KEYS: THE REASONS WERE STALE.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHAT WAS ASKED, AND WHAT THE MEASUREMENT SAID
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ANON-LANES (2026-09-22) left four tables holding an `anon` SELECT column grant with NO
-- SELECT-capable policy reaching `anon` — a KEY WITH NO DOOR — while
-- `lib/security/public-exposure.ts#ANON_COLUMN_SURFACE` still named a signed-out reader for each,
-- and said: "Either those pages are already broken or the reasons are stale."
--
-- `workbench.heatmap_saves` was the BROKEN one and is fixed in
-- `deadkeys_the_public_heatmap_link_gets_its_rule.sql`. These three are the STALE ones. Measured on
-- the main database on 2026-09-22 — a SELECT-only census, a live signed-out probe on the
-- publishable key, and 24 h of edge_logs read by request METHOD (which is what settles it):
--
--   extend.wbx_capture — the reader is REAL and the answer it gets is CORRECT.
--     matrx-extend's `lookupCapturedByUrl` runs on every side-panel tab change whether or not the
--     device holds a token; 14 tokenless lookups in 24 h, every one `200 []`. A capture belongs to
--     an organization, so a device with no account can have no capture: "no record" IS the answer.
--     The grant bought nothing and made the table read as world-readable in every audit.
--     matrx-extend now returns before the round trip (`hasSupabaseAccessToken()`, commit 772fb00).
--
--   ui.ui_surface_agent_pref + ui.ui_surface_config — the reader is REAL and could never be served.
--     Real signed-out browsers on www.appmatrx.com and demos.aimatrx.com issue the DD-230 guest
--     read; it answers `200 []`. It always will: the two tables hold ZERO rows with `user_id IS
--     NULL AND organization_id IS NULL`, every row is `visibility = 'internal'`, and
--     `scopeInsertColumns` in features/surfaces/services/surface-config.service.ts stamps an owning
--     `organization_id` on EVERY write path, so a global guest-visible row cannot be created by any
--     code we ship. The comment beside that read promised "a genuine guest still receives the
--     public surface config"; it never could. The guest branch now returns the empty tier without
--     asking, and a guest's defaults come from the surface MANIFEST, which is code.
--
-- 🚨 AND A CORRECTION WORTH MORE THAN THESE THREE REVOKES. DD-230 measured "anonymous 200s" by
-- grouping edge_logs on `request.sb.jwt.authorization.payload.role = ''`. That field is EMPTY ON A
-- CORS PREFLIGHT, which carries no apikey and no user, and PostgREST answers every preflight 200.
-- On these five tables the "anonymous" traffic was 828 + 230 + 229 OPTIONS requests paired 1:1 with
-- authenticated GETs. The discriminators that actually work are `request.method`,
-- `request.sb.apikey.apikey.prefix` and `request.sb.auth_user`. Any older count of "anonymous 200s"
-- taken the DD-230 way is an upper bound on preflights, not a reader.
--
-- WHY THE GENERATOR AND NOT A HAND-WRITTEN REVOKE: `iam.apply_table_grants` already owns this
-- decision — ANON-LANES taught it to revoke a key that no door matches, table-level and every
-- column, and to REFUSE (42501) rather than touch a lane that is live. Calling it here is how the
-- withdrawal happens exactly once, by the rule, with the refusal still armed if any of these three
-- turns out to have a door after all.
--
-- ADDITIVE except the three revokes it exists to perform; nothing is dropped, renamed or rewritten.
-- Inverse: migrations/inverse/deadkeys_three_reasons_named_a_reader_that_can_never_get_a_row.inverse.sql
-- Proof:   a signed-out probe on each of the three answers 42501 where it answered `200 []`, and
--          `pnpm check:anon-column-surface` is green with their ANON_COLUMN_SURFACE rows deleted.

set local lock_timeout = '5s';

do $$
declare
  r record;
begin
  for r in
    select et.schema_name, et.table_name, et.rls_variant
      from platform.entity_types et
     where et.is_active
       and (et.schema_name, et.table_name) in
           (('extend','wbx_capture'),('ui','ui_surface_agent_pref'),('ui','ui_surface_config'))
  loop
    -- Refuses rather than revokes if a SELECT-capable policy reaches `anon` on any of them.
    perform iam.apply_table_grants(r.schema_name, r.table_name, r.rls_variant);
  end loop;
end $$;

do $$
declare
  v_rel regclass;
  v_left text[] := '{}';
begin
  foreach v_rel in array array['extend.wbx_capture'::regclass,
                               'ui.ui_surface_agent_pref'::regclass,
                               'ui.ui_surface_config'::regclass]
  loop
    if has_table_privilege('anon', v_rel, 'SELECT')
       or has_any_column_privilege('anon', v_rel, 'SELECT') then
      v_left := array_append(v_left, v_rel::text);
    end if;
  end loop;
  if cardinality(v_left) > 0 then
    raise exception
      'DEAD-KEYS: % still holds an anon SELECT key after the generation — the withdrawal did not happen and the register must not be edited.',
      array_to_string(v_left, ', ');
  end if;
  raise notice 'DEAD-KEYS: all three dead anonymous keys withdrawn; `anon` now holds nothing on extend.wbx_capture, ui.ui_surface_agent_pref, ui.ui_surface_config.';
end $$;
