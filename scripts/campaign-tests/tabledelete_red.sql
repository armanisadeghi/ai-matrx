-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- RETIRED — 2026-09-22, lane SUITES-TIDY.  THIS FILE ASSERTS NOTHING AND IS NOT A GUARD.
--
-- WHY. All FOUR of its blocks failed to go red. Deleting a table takes its fields, views, rules and
-- records with it on every path this file's inverse can reach.
--
-- Run against production's own data on the nightly dev clone on 2026-09-22 it answered, in its
-- own words:
--
--   tabledelete_red: 4 of 4 blocks are RED (the defect they assert is gone) — RED 1 deleting the
--   table took its fields and its records with it · RED 2 the stranded field was deleted through
--   the door · RED 3 migrate_delete took 1 record with the table · RED 4 the door refused the
--   table and named what reads its field
--
-- A RED TWIN'S ONE JOB IS TO GO RED ON THE INVERSE OF A LIVE FIX. When the inverse no longer
-- removes the behaviour — because later lanes adopted it, moved it, or built it a second time
-- somewhere this file's inverse does not reach — the twin cannot go red, and a guard you cannot
-- demonstrate failing is not a guard. Leaving it in the sweep would have meant a permanent red
-- line that nobody could act on, which is worse than no line at all.
--
-- WHAT GUARDS THE CLASS NOW: scripts/campaign-tests/tabledelete_green.sql.
-- THE LANE AND COMMIT THAT FIXED IT: lane TABLE-DELETE — e6df9cf9ca "fix(store): a table takes its fields, saved views, rules and
-- records with it"; the green twin landed in f9d4f17295 "test(store): the table-delete green
-- suite and its red twin".
--
-- If the class ever needs a red twin again, write a NEW one against the inverse that exists
-- then. Do not revive this file: its inverse is the one that stopped removing anything.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

\echo 'RETIRED: tabledelete_red.sql asserts nothing. all four of its blocks stopped being able to go red.'
\echo 'RETIRED: this is not a pass and not a failure. The class is guarded by tabledelete_green.sql.'
\quit
