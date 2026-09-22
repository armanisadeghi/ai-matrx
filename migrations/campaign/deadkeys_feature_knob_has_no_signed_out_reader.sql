-- lane: DEAD-KEYS
-- chair-step: THIS FILE HAS NOT BEEN APPLIED TO ANY DATABASE. It DROPS a live policy
-- (`feature_knob_read_anon`) and REVOKES a live grant on a table in the protected `platform`
-- schema. A lane may not do either on its own authority; it is written, judged and handed over.
-- To run it:
--   pnpm db:apply migrations/campaign/deadkeys_feature_knob_has_no_signed_out_reader.sql \
--     --source campaign --lane DEAD-KEYS --target production \
--     --confirm-chair-step migrations/campaign/deadkeys_feature_knob_has_no_signed_out_reader.sql
-- Rehearse it on the branch first and run its inverse there (rule 27).
--
-- DD-249 / R12 — THE TENTH TOKEN ANON-LANES HANDED ON UNDECIDED, RULED: NOBODY READS IT SIGNED OUT.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHAT WAS UNDECIDED
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- `platform.feature_knob` is a `private`-class `system` table carrying a HAND-WRITTEN anonymous
-- lane: `feature_knob_read_anon` with `using (public_read)`, plus an `anon` SELECT grant on three
-- columns (feature, key, value). It is not the visibility-gated `pub_read` shape the R12 opt-in
-- emits, so ANON-LANES could neither declare it nor delete it, and parked it in
-- `platform.entity_types.anon_lane_pending_withdrawal_reason` — the one row there — on the strength
-- of DD-230's "194 anonymous 200s in 24 h".
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 🚨 THAT NUMBER WAS NOT ANONYMOUS TRAFFIC. IT WAS CORS PREFLIGHTS.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- DD-230 counted "anonymous" by grouping edge_logs on
-- `request.sb.jwt.authorization.payload.role = ''`. That field is empty on an OPTIONS preflight,
-- which carries no apikey and no user, and PostgREST answers every preflight 200. Re-measured on
-- the main database on 2026-09-22 over the same 24 h, split by `request.method`,
-- `request.sb.apikey.apikey.prefix` and `request.sb.auth_user`:
--
--   2432  GET     sb_publishable_…  auth_user present   200   <- the whole real readership
--    828  OPTIONS (no apikey)       (no user)           200   <- what DD-230 was counting
--      1  GET     sb_publishable_…  NO auth_user        200   <- see below
--     97  GET                       auth_user present   503
--
-- ONE tokenless GET in 24 h, from https://www.aimatrx.com/, `supabase-ssr createBrowserClient`,
-- with byte-identical query text to the 2432 authenticated ones. That is a session-hydration race
-- on an authenticated route — the same tab, a beat before its JWT attached — not a guest.
--
-- THE CODE CENSUS AGREES, INDEPENDENTLY (matrx-frontend, aidream, matrx-extend, matrx-local):
-- every `.from("feature_knob")` call site is lib/knobs/featureKnobs.ts#loadAll or an admin service,
-- and every importer of the knob helpers sits under `(core)` or `(admin)`. Nothing in
-- `app/(public)/**` reads a knob. The one knob-aware component mounted for EVERY visitor,
-- components/client-directives/PlatformDirectiveSubscriber.tsx, only calls
-- `invalidateFeatureKnobs()` — a cache clear, never a query — and its channel subscription passes
-- null when there is no userId, so a signed-out tab never joins the room that could fire it.
-- `custom.records_tool_default`, the single `public_read = true` row, is consumed only by
-- lib/knobs/toolKnobGating.ts, which returns EARLY when there is no organizationId and never
-- resolves the knob at all.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- AND THE LANE IS NOT MERELY USELESS — IT POISONS A CACHE
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- `loadAll` reads the knob catalogue as a LIST IT TREATS AS COMPLETE and caches it for 60 s;
-- `readKnob` THROWS `Missing feature knob "<feature>.<key>"` on any address the cached map lacks.
-- Because `feature_knob_read_anon` admits exactly the rows with `public_read`, and exactly ONE of
-- 953 rows has it, a read that lands during that hydration race succeeds with a ONE-ROW CATALOGUE
-- and caches it. For the next minute, in that tab, every knob but one reports missing — a
-- successful-looking answer that is wrong, which is the one failure mode `loadAll`'s own comment
-- says it exists to prevent. With the grant gone the same read fails loudly (42501), nothing is
-- cached (`cache` is assigned only on success and `inFlight` clears in `finally`), and the next
-- call retries with the token attached.
--
-- So the ruling is (3) of iam.apply_table_grants' own remedies: the anonymous lane is over.
-- Withdraw the rule and the key; `feature_knob_read_authenticated` (using true) keeps every
-- signed-in reader exactly as it is, and `public_read` stays on the table as the column that would
-- gate the lane if one is ever wanted again.
--
-- WHAT THIS IS NOT. It does not reclassify the table, touch `public_read`, touch any other policy,
-- or change one row of data. After it, `anon` holds nothing on `platform.feature_knob` and the
-- generator's pending-withdrawal notice stops firing.
--
-- Inverse: migrations/inverse/deadkeys_feature_knob_has_no_signed_out_reader.inverse.sql
-- Proof:   a signed-out probe on `select=feature,key,value` answers 42501 where it answered 200
--          with one row; an authenticated probe still answers 200 with the full catalogue.

set local lock_timeout = '5s';

revoke select on platform.feature_knob from anon;
revoke select (feature) on platform.feature_knob from anon;
revoke select (key)     on platform.feature_knob from anon;
revoke select (value)   on platform.feature_knob from anon;

drop policy if exists feature_knob_read_anon on platform.feature_knob;

update platform.entity_types
   set anon_lane_pending_withdrawal_reason = null
 where schema_name = 'platform' and table_name = 'feature_knob';

do $$
begin
  if has_table_privilege('anon', 'platform.feature_knob'::regclass, 'SELECT')
     or has_any_column_privilege('anon', 'platform.feature_knob'::regclass, 'SELECT') then
    raise exception 'DEAD-KEYS: platform.feature_knob still hands `anon` a SELECT key after the withdrawal.';
  end if;
  raise notice 'DEAD-KEYS: platform.feature_knob has no anonymous lane; feature_knob_read_authenticated is untouched.';
end $$;
