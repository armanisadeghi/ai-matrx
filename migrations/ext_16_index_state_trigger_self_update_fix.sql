-- ext_16_index_state_trigger_self_update_fix.sql
--
-- 🚨 DEFECT FOUND BY THE ISOLATION SUITE, NOT BY READING -- and this file is a DELIBERATE
-- NO-OP because ext_17 supersedes its fix in full.
--
-- platform._custom_field_index_state is a BEFORE trigger and it called
-- platform.demote_custom_field_index(OLD.id), which UPDATEs the very row being updated.
-- Postgres refuses that with 27000 "tuple to be updated was already modified by an
-- operation triggered by the current command" -- so ARCHIVING a definition that carried a
-- promoted index RAISED instead of dropping it.
--
-- The fix applied here (drop the index inside the BEFORE trigger, set NEW's own columns)
-- was then found to be still wrong in a second way: the DROP was UNQUALIFIED, and the
-- index lives in the TARGET TABLE's schema, so `IF EXISTS` silently matched nothing.
-- Isolation assertion B7c caught that too (state=none, indexes=1). ext_17 carries the
-- corrected, replayable definitions.
DO $mig$ BEGIN
  RAISE NOTICE 'ext_16 is a deliberate no-op; the replayable definitions live in ext_17.';
END $mig$;
