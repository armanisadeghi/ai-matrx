-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- RETIRED — 2026-09-22, lane SUITES-TIDY.  THIS FILE ASSERTS NOTHING AND IS NOT A GUARD.
--
-- WHY. All EIGHT of its blocks failed to go red. Every defect it restores is closed by a path
-- its own inverse migrations no longer reach.
--
-- Run against production's own data on the nightly dev clone on 2026-09-22 it answered, in its
-- own words:
--
--   doorfix_red: 8 of 8 blocks are RED (the defect they assert is gone) — RED 1 the door took
--   the contained record with it · RED 2 the winner carries the loser's phone number as an
--   alternate · RED 3 the restored record's own id resolves to itself · RED 4 the record is
--   still writable after the field changed what it holds · RED 5 promotion follows the system
--   switch · RED 6 a new table's first column is reachable · RED 7 the read door shows the
--   retired value with its reason · RED 8 the field door saved `unique`
--
-- A RED TWIN'S ONE JOB IS TO GO RED ON THE INVERSE OF A LIVE FIX. When the inverse no longer
-- removes the behaviour — because later lanes adopted it, moved it, or built it a second time
-- somewhere this file's inverse does not reach — the twin cannot go red, and a guard you cannot
-- demonstrate failing is not a guard. Leaving it in the sweep would have meant a permanent red
-- line that nobody could act on, which is worse than no line at all.
--
-- WHAT GUARDS THE CLASS NOW: scripts/campaign-tests/doorfix_green.sql, which asserts the same eight behaviours forward.
-- THE LANE AND COMMIT THAT FIXED IT: lane DOOR-FIX — 16c9d7d0ff "DOOR-FIX: changing what a Field holds converts the values, or
-- retires them" and the five doorfix_* campaign migrations beside it; the green twin landed in
-- 3437f9802c "DOOR-FIX: the green suite and its red twin, on the main database".
--
-- If the class ever needs a red twin again, write a NEW one against the inverse that exists
-- then. Do not revive this file: its inverse is the one that stopped removing anything.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

\echo 'RETIRED: doorfix_red.sql asserts nothing. all eight of its blocks stopped being able to go red.'
\echo 'RETIRED: this is not a pass and not a failure. The class is guarded by doorfix_green.sql.'
\quit
