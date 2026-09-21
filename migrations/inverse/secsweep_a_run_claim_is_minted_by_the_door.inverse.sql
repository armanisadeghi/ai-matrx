-- lane: SECURITY-SWEEP — the inverse of
-- migrations/campaign/secsweep_a_run_claim_is_minted_by_the_door.sql
-- Removes the claim door and the trigger, which lets a browser mint its own run lease token
-- again — the defect the up-migration closed. Run only to prove the pair reverses (rule 27);
-- run it while the callers point at the door and every claim stops working.
drop trigger if exists sch_run_claim_token_is_minted on scheduler.sch_run;
drop function if exists scheduler._claim_token_is_minted_by_the_door();
drop function if exists scheduler.sch_run_claim(uuid, text, uuid, text, integer);
delete from platform.client_callable_door
 where schema_name = 'scheduler' and function_name = 'sch_run_claim';
