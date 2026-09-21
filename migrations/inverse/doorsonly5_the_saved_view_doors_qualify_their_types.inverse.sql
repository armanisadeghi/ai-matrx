-- chair-step: DOORS-ONLY-5 inverse — puts the UNQUALIFIED `permission_level` back into the
-- three platform.saved_view doors. Running this makes all three answer
-- `type "permission_level" does not exist` to every signed-in caller, which is the defect the
-- forward file fixed and which `pnpm check:door-names-resolve` reports. There is no reason to
-- run it except to demonstrate the guard going red; say so if you do.
--
-- It is deliberately a POINTER rather than a copy of the three bodies: a copy would be a second
-- author for the same 400 lines and would drift the moment the ladder changes. To reproduce the
-- broken state, re-apply migrations/campaign/doorsonly5_saved_view_gets_its_doors.sql with
-- `--reapply`, which carries the unqualified casts.

do $$
begin
  raise exception 'doorsonly5 inverse: re-apply migrations/campaign/doorsonly5_saved_view_gets_its_doors.sql with --reapply to restore the unqualified bodies. This file refuses rather than keeping a second copy of three door bodies that would drift.';
end $$;
