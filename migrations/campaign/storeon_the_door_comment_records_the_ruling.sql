-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- STORE-ON — THE DOOR'S OWN COMMENT RECORDS THE RULING, AND THIS FILE IS THE LIVE PROOF THAT
-- A GUARDED CAMPAIGN FILE STILL LANDS NOW THAT THE SWITCH IS ON.
--
-- Two jobs, and the second is the reason it is a file at all.
--
-- 1. `custom.assert_store_door` is the door every write in the store passes. Its refusal now
--    says the organization TURNED THE STORE OFF rather than never turned it on, and the
--    reason lives in a migration header nobody reads at 3 a.m. This puts it on the object.
--
-- 2. 🚨 IT IS THE FORCING FUNCTION FOR THE GATE STORE-ON HAD TO CHANGE. Both migration
--    runners refuse a `-- target: branch,production` file whose `-- guard:` knob does not
--    resolve FALSE — "a guarded file lands on production only while its knob is OFF, so the
--    old path is untouched until the switch". The owner threw that switch on 2026-09-23, so
--    from that moment EVERY campaign file headed `-- guard: custom/system_enabled` — which is
--    most of them — was refused, with no remedy a lane could apply except undoing the ruling.
--    `KNOBS_THE_OWNER_TURNED_ON` (scripts/lib/migration-target.ts and aidream's
--    db/migration_target.py) is the bounded exception: a knob the OWNER threw is ANNOUNCED
--    as live rather than refused, and every other knob keeps the refusal untouched.
--    This file carries that exact header, so applying it IS the proof the class is open
--    again — and the runner prints the "this is LIVE the moment it commits" banner above it.
--
-- It changes no behaviour whatever: one COMMENT ON, which the allow-list enumerates.

COMMENT ON FUNCTION custom.assert_store_door(uuid, text) IS
  'The door every write in the record store passes. It returns when custom.store_is_open resolves true for this organization, or when the caller owns custom.record; otherwise it raises 42501. STORE-ON 2026-09-23 (owner ruling, Arman): the record store''s platform default is ON — custom/system_enabled and custom/code_paths_enabled both resolve true — and every active organization was switched on through platform.unified_data_store_set. So this refusal now says the organization HAS TURNED THE STORE OFF, which is the only way it can be off, and the hint says how to turn it back on. Guarded by scripts/campaign-tests/storeon_green.sql (release gate pnpm check:store-on-by-default) with its red twin storeon_red.sql.';
