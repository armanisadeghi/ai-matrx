-- ext_06_validate_custom_values.sql
--
-- 🚨 THIS FILE IS DELIBERATELY A NO-OP, AND SAYING SO IS THE POINT.
--
-- The migration applied live under this name created the first cut of
-- platform.validate_custom_values. Its whitespace-class constant did not survive
-- transcription (the \u escapes that make the email/url dialects match every twin
-- were mangled), which ext_06a and ext_06b corrected within the same session,
-- before anything consumed the function. Reproducing the mangled body here would
-- put a KNOWN-WRONG dialect in a replayable file, so it is not reproduced.
--
-- The replayable definition of the function is ext_06b (and ext_06c's fix on top).
-- CREATE OR REPLACE is idempotent and both run after this file, so a replay that
-- skips this body reaches a byte-identical end state -- proven by the 64-case
-- fixture in features/platform/custom-fields/custom-field-validation-rules.json.
DO $mig$ BEGIN
  RAISE NOTICE 'ext_06 is a deliberate no-op; see ext_06a / ext_06b / ext_06c.';
END $mig$;
