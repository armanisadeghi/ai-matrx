-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- RETIRED — 2026-09-22, lane SUITES-TIDY.  THIS FILE ASSERTS NOTHING AND IS NOT A GUARD.
--
-- WHY. All SIX clauses across its five blocks failed to go red. Every one of the V1 findings it
-- restores is closed, and closed in a place this file's inverse does not reach — the store
-- switch now holds through custom.record_write, the store stamps an author, the agent-write
-- forward arm is built, the value ceiling is published and enforced, and the door asks the
-- access question.
--
-- Run against production's own data on the nightly dev clone on 2026-09-22 it answered, in its
-- own words:
--
--   v1_fixes_red: 6 of the 6 clauses across its 5 blocks are RED (the defect they assert is gone)
--
-- A RED TWIN'S ONE JOB IS TO GO RED ON THE INVERSE OF A LIVE FIX. When the inverse no longer
-- removes the behaviour — because later lanes adopted it, moved it, or built it a second time
-- somewhere this file's inverse does not reach — the twin cannot go red, and a guard you cannot
-- demonstrate failing is not a guard. Leaving it in the sweep would have meant a permanent red
-- line that nobody could act on, which is worse than no line at all.
--
-- WHAT GUARDS THE CLASS NOW: scripts/campaign-tests/v1_fixes_green.sql.
-- THE LANE AND COMMIT THAT FIXED IT: lane V1-FIXES — 9b7b951c28 "W1-V1-FIXES: the GREEN twin of the RED, findings 1 to 4", and
-- for the store switch specifically the STORE-OFF / FIX-11A work that made custom.system_enabled
-- an opt-in per organization.
--
-- If the class ever needs a red twin again, write a NEW one against the inverse that exists
-- then. Do not revive this file: its inverse is the one that stopped removing anything.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

\echo 'RETIRED: v1_fixes_red.sql asserts nothing. all six of its clauses stopped being able to go red.'
\echo 'RETIRED: this is not a pass and not a failure. The class is guarded by v1_fixes_green.sql.'
\quit
