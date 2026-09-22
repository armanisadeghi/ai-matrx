-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- RETIRED — 2026-09-22, lane SUITES-TIDY.  THIS FILE ASSERTS NOTHING AND IS NOT A GUARD.
--
-- WHY. All NINE clauses across its four blocks failed to go red: the organization wall, the delete
-- triggers, the promotion door and the access ladder are all live, and none of them comes back
-- when this file's inverse runs.
--
-- Run against production's own data on the nightly dev clone on 2026-09-22 it answered, in its
-- own words:
--
--   v1store_fixes_red: 9 of the 9 clauses across its 4 blocks are RED (the defect they assert is
--   gone)
--
-- A RED TWIN'S ONE JOB IS TO GO RED ON THE INVERSE OF A LIVE FIX. When the inverse no longer
-- removes the behaviour — because later lanes adopted it, moved it, or built it a second time
-- somewhere this file's inverse does not reach — the twin cannot go red, and a guard you cannot
-- demonstrate failing is not a guard. Leaving it in the sweep would have meant a permanent red
-- line that nobody could act on, which is worse than no line at all.
--
-- WHAT GUARDS THE CLASS NOW: scripts/campaign-tests/v1store_fixes_green.sql.
-- THE LANE AND COMMIT THAT FIXED IT: lane V1-STORE-FIXES — 694a883877 "V1-STORE-FIXES: the GREEN, and the row-count law over the
-- whole schema".
--
-- If the class ever needs a red twin again, write a NEW one against the inverse that exists
-- then. Do not revive this file: its inverse is the one that stopped removing anything.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

\echo 'RETIRED: v1store_fixes_red.sql asserts nothing. all nine of its clauses stopped being able to go red.'
\echo 'RETIRED: this is not a pass and not a failure. The class is guarded by v1store_fixes_green.sql.'
\quit
