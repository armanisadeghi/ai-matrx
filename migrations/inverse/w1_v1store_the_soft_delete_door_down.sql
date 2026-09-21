-- chair-step: the inverse of V1-STORE-FIXES finding 2 - it removes the delete door from
-- schema `custom` and restores `custom._store_door` to the INSERT-OR-UPDATE-only body it had
-- before, which is a DROP and a live-body replacement and therefore never an unattended step.
-- Header-less on purpose (§4.9): a file naming production in a `-- target:` header PLUS
-- `-- chair-step:` is refused by both runners as `chair-step-names-production`, and these
-- same bytes rehearse on the branch with `--target branch`.
--
-- The restored body is byte-for-byte the one
-- `migrations/campaign/w1_v1store_the_soft_delete_door.sql` declares in its `-- based-on:` line
-- (sha256 7d1c5574f2d8fd556c5e14da5a2cf5a8911991e58826e002f5d25942eb842efc), so the loop
-- up -> inverse -> up returns the catalogue to where it started and a verifier can check that
-- by hashing it.
--
-- `-- based-on:` declares the body this file OVERWRITES - the delete-aware one this lane
-- landed - so the runner refuses to replay it over anybody else's later change (DD-220).
--
-- It is written to run twice with the same result: every statement carries IF EXISTS or is a
-- CREATE OR REPLACE.

-- based-on: custom._store_door() 769a9d4287dbb212fe9864601b8539d98e9a58142128156936948534a44b485d

drop trigger if exists custom_record_store_door on custom.record;
drop trigger if exists custom_external_link_store_door_delete on custom.external_link;
drop trigger if exists custom_external_source_store_door_delete on custom.external_source;

-- 🚨 `custom.record_delete` AND `custom.record_restore` STAY STANDING (lane INVERSE-GUARD, 2026-09-21). This file
-- used to drop both here. `custom.work_approval_decide` in
-- `apprvtail_the_queue_holds_a_delete_and_a_new_table.sql` — a lane outside V1-STORE-FIXES —
-- has since adopted them and calls both on the live path, so dropping them would not restore
-- finding 2's defect, it would break the approval queue's decide door. THE DEFECT IS THE DOOR
-- PREDICATE, and this file still takes it back in full: `custom._store_door` is replaced below
-- with the INSERT-OR-UPDATE-only body (sha256 7d1c5574…), the three delete-side triggers are
-- detached above, and the two client-door register rows go below — so no client can reach
-- either verb and no DELETE on the store is judged at all, which is exactly the state finding
-- 2 found. Two bodies standing for one in-database caller do not put the predicate back.

-- A DOOR FOLLOWS ITS FUNCTION. `platform._provision_shape_settled` refuses at COMMIT when a
-- row in `platform.client_callable_door` outlives the function it describes, and it is right
-- to: a door row nobody can call is a promise nobody can verify.
delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('record_delete', 'record_restore')
   and identity_args = 'p_organization_id uuid, p_record_id uuid';

CREATE OR REPLACE FUNCTION custom._store_door()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  -- One line, because there is one predicate. `TG_TABLE_SCHEMA.TG_TABLE_NAME` is what the
  -- refusal names, so a caller is told WHICH door said no rather than that "something" did.
  perform custom.assert_store_door(new.organization_id,
                                   format('%I.%I', tg_table_schema, tg_table_name));
  return new;
end;
$function$;
