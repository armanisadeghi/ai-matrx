-- chair-step: DOORS-ONLY-5 inverse — puts the UNQUALIFIED `is_platform_admin()` /
-- `is_super_admin()` back into the five platform.rulebook doors, which makes every one of them
-- answer `function ... does not exist` to the first signed-in caller. There is no reason to run
-- it except to demonstrate `pnpm check:door-names-resolve` going red; say so if you do.
--
-- It is a POINTER rather than a copy: re-apply
-- migrations/campaign/doorsonly5_rulebook_gets_its_doors.sql with `--reapply`, which carries the
-- unqualified names. Keeping a second copy of five door bodies here would be a second author
-- for them and would drift the moment a ladder changes.

do $$
begin
  raise exception 'doorsonly5 inverse: re-apply migrations/campaign/doorsonly5_rulebook_gets_its_doors.sql with --reapply to restore the unqualified bodies. This file refuses rather than keeping a second copy of five door bodies that would drift.';
end $$;
