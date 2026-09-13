-- platform_feature_knob_anon_contract_dd168 — DD-168.
--
-- `platform.feature_knob` — the whole settings registry: every key, its current value, default,
-- override rules, label and description, across 608 rows spanning HR pay/leave rules, sandbox
-- credentials shape, spend guardrails and everything else the platform tunes — carried a
-- `feature_knob_read` policy of `USING (true)` for BOTH `anon` and `authenticated`. A signed-out
-- HTTP request with only the public anon key read all 608 rows (proven live below, before this
-- file ran). Arman's ruling (register DD-168, 2026-09-12): a signed-out client needs at most the
-- public-feature defaults, never the registry itself.
--
-- CENSUS (this migration's other half — "which knob keys does a signed-out client actually read"):
-- grepped `matrx-frontend` for every consumer of the three client paths to a knob —
--   1. `platform.knob_resolve` (RPC, INVOKER rights, EXECUTE granted to anon: the one RPC that
--      genuinely runs under the caller's own RLS) — the only frontend caller is
--      `lib/scoped-config/effectiveKnobs.ts`, and every one of its three real consumers
--      (`features/audio/service/listeningConfig.ts`, the chat/agent-authoring model-preference
--      thunks) requires a live `organizationId`, which requires organization membership, which
--      requires a signed-in session. `peekEffectiveKnob`/`ensureEffectiveKnob` both return
--      `undefined` with no organization id, and the file's own comment records "the registry
--      ignores a signed-out tab".
--   2. `platform.knob_index` (RPC, DEFINER rights) — EXECUTE is granted to `authenticated` only,
--      not `anon`; a signed-out call 42501s before it ever reaches this table.
--   3. The raw table (`lib/knobs/featureKnobs.ts`'s `.from("feature_knob").select(...)`, THE
--      actual direct-table exposure this migration closes) — every caller found
--      (`features/organizations/awaitWorkspace.ts`, `UniversalSettingsContext`,
--      `useSpendPopoverKnobs`/`useSpendExplorerKnobs`/`SpendDashboard`, HR/education/commerce
--      admin surfaces, `PlatformDirectiveSubscriber`) runs inside `(core)`/`(admin)` routes behind
--      `proxy.ts`'s protected-route gate, or requires an organization/admin context to render at
--      all. `app/(kiosk)` (device-paired, no user session, `proxy.ts` deliberately does not gate
--      it) and `app/(public)` (marketing/legal/share) were grepped by name for every one of these
--      three call shapes and every consumer file above: zero hits in either route group, and zero
--      hits in `app/(auth-pages)/login`.
--
-- CONCLUSION: no signed-out screen reads any `feature_knob` key today, directly or through
-- `knob_resolve`. The anon contract this migration installs is therefore the honest one for the
-- CURRENT frontend — zero keys flagged `public_read` — rather than a guess at which keys "should"
-- be public. `public_read` is a real per-row column (not a hardcoded allowlist) so the day a
-- pre-auth surface needs one signed-out-readable setting, flipping this flag is the whole change;
-- until then anon gets nothing, matching Arman's ruling exactly ("at most the public-feature
-- defaults" — today that set is empty, not assumed).
--
-- THE FIX: `public_read boolean not null default false` on the row; the single `USING (true)`
-- policy for `anon,authenticated` split into two — `authenticated` keeps `USING (true)` (every
-- existing signed-in consumer, admin surfaces included, is unaffected), `anon` gets
-- `USING (public_read)`. Nothing else in the table's policy set (write policies, `platform_admin_all`,
-- the three restrictive platform-admin-only write walls) is touched.
--
-- RED (proven live, before this file ran): `SET LOCAL role = anon; SELECT count(*) FROM
-- platform.feature_knob;` → 608 of 608. GREEN is asserted at the end of this migration.

ALTER TABLE platform.feature_knob
  ADD COLUMN IF NOT EXISTS public_read boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN platform.feature_knob.public_read IS
  'DD-168 (2026-09-12): true only for a knob a signed-out client is deliberately allowed to read '
  '(the anon RLS lane). Default false — a signed-out client reads nothing from this table until a '
  'real pre-auth consumer names the key it needs and this is flipped for that row.';

DROP POLICY IF EXISTS feature_knob_read ON platform.feature_knob;

CREATE POLICY feature_knob_read_authenticated ON platform.feature_knob
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY feature_knob_read_anon ON platform.feature_knob
  FOR SELECT TO anon
  USING (public_read);

-- ============================== GREEN, PROVEN, NOT ASSUMED ==============================
DO $green$
DECLARE
  v_anon_count int;
  v_auth_count int;
  v_flagged_count int;
BEGIN
  SELECT count(*) INTO v_flagged_count FROM platform.feature_knob WHERE public_read;
  IF v_flagged_count <> 0 THEN
    RAISE EXCEPTION 'dd168: expected 0 knobs flagged public_read (the census found no pre-auth '
      'consumer of any key) — found %. If a real signed-out consumer was just added, this '
      'migration''s census comment needs updating alongside the flag, not silently.', v_flagged_count;
  END IF;

  SET LOCAL role = anon;
  SELECT count(*) INTO v_anon_count FROM platform.feature_knob;
  RESET role;
  IF v_anon_count <> v_flagged_count THEN
    RAISE EXCEPTION 'dd168: GREEN failed — anon reads % of % feature_knob rows, expected exactly % '
      '(the public_read count)', v_anon_count, (SELECT count(*) FROM platform.feature_knob), v_flagged_count;
  END IF;

  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claim.sub = '87a6e699-3622-4869-8843-d0867456c0dd';
  SELECT count(*) INTO v_auth_count FROM platform.feature_knob;
  RESET role;
  IF v_auth_count <> (SELECT count(*) FROM platform.feature_knob) THEN
    RAISE EXCEPTION 'dd168: GREEN failed — a signed-in read narrowed from % to % rows; only the '
      'anon lane was meant to change', (SELECT count(*) FROM platform.feature_knob), v_auth_count;
  END IF;

  RAISE NOTICE 'dd168 GREEN: anon reads % of % feature_knob rows (was %/%); authenticated still reads all %',
    v_anon_count, (SELECT count(*) FROM platform.feature_knob), 608,
    (SELECT count(*) FROM platform.feature_knob), v_auth_count;
END
$green$;
