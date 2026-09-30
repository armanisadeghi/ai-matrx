-- MERGE-8 — THE MERGED GRID IS ON BY DEFAULT.
--
-- One-grid merge, step 8 (lane data-tables-grid-overhaul, 2026-09-30). The merged grid replaces
-- records-ui's classic grid for everyone on the record store (independent review 3,
-- common-docs projects/data-doctrine-adoption/v5/v2-readiness-audit/GRIDS-REVIEW-3.md: the classic
-- grid has every shared defect the merged one has, plus no undo, no add-row and no column menu).
-- On production the platform VALUE was switched On through the admin Feature Knobs screen
-- (knob_override_audit 375354, admin@admin.com, door 'ui'); this file makes the knob's DECLARED
-- default say the same, so any environment seeded from merge7 lands On.
--
-- It changes one register row and nothing else: `default_value` becomes true, and `value` becomes
-- true only where nobody chose a value yet (still the agent-seeded false). A value a person set in
-- the dashboard is never overwritten. Organization and person overrides are untouched.
--
-- Inverse: migrations/inverse/merge8_the_merged_grid_is_on_by_default_down.sql. Idempotent.

set lock_timeout = '3s';
set statement_timeout = '60s';

update platform.feature_knob
   set default_value = 'true'::jsonb,
       value = case when set_by = 'agent' and value = 'false'::jsonb then 'true'::jsonb else value end,
       description = replace(description, 'Off, the simpler grid draws.',
                             'Off, the simpler grid draws; on is the default.'),
       basis = 'One-grid merge step 8 (lane data-tables-grid-overhaul, 2026-09-30): the merged grid is '
               || 'the default grid everywhere a record-store table opens (GRIDS-REVIEW-3). Off keeps '
               || 'records-ui RecordsUiHost.grid "classic" as an explicit override until merge step 9 '
               || 'retires the switch. Read by matrx-frontend '
               || 'features/data-tables/records-ui-host/mergedGridKnob.ts through useEffectiveKnob.'
 where feature = 'data_tables' and key = 'merged_grid'
   and default_value is distinct from 'true'::jsonb;

do $$
begin
  if not exists (
    select 1 from platform.feature_knob
     where feature = 'data_tables' and key = 'merged_grid'
       and default_value = 'true'::jsonb and 'user' = any (overridable_by)
  ) then
    raise exception 'merge8: data_tables.merged_grid did not land as a user-overridable, default-on knob';
  end if;
end $$;
