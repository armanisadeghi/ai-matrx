-- ext_13_reference_resolution.sql
--
-- 🚨 DELIBERATE NO-OP -- the whole of this migration was superseded by ext_17 within the
-- same session, before anything consumed it.
--
-- The applied body created platform.resolve_custom_references (2.6), its
-- custom_reference_validity projection, and platform.find_custom_references_to. The
-- isolation suite then proved the resolver redacted EVERYTHING -- including rows the
-- caller could plainly read -- because it is SECURITY INVOKER (correctly, so the ROW read
-- happens under the caller's RLS) but was ALSO resolving the token through
-- platform.entity_types and information_schema under the caller's privileges. Those are
-- public registry facts, not tenant data.
--
-- ext_17 carries the corrected, replayable definitions of all three functions plus the
-- definer metadata helper. Reproducing the leaking form here would put a known-wrong
-- redaction path in a replayable file, so it is not reproduced.
DO $mig$ BEGIN
  RAISE NOTICE 'ext_13 is a deliberate no-op; the replayable definitions live in ext_17.';
END $mig$;
