-- chair-step: DOORS-ONLY-3 inverse -- there is nothing to undo here that a person would want.
-- The forward file removed a dead `version = p_expected_version + 1` assignment from
-- `public.checklist_run_save` that the `_touch_row` BEFORE UPDATE trigger overwrote anyway;
-- putting it back restores a second author for a column the trigger owns and changes no
-- observable behaviour. Re-apply
-- migrations/campaign/doorsonly3_batch_a_three_doors_for_three_tables.sql with --reapply if the
-- original body is genuinely wanted back.
select 1;
