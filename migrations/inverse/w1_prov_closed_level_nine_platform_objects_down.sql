-- THE INVERSE of `migrations/campaign/w1_prov_closed_level_nine_platform_objects.sql`
-- (§4.13), lane W1-PROV-CLOSED, 2026-09-17.
--
-- It refuses on PRODUCTION, where these nine objects are the ORIGINALS and this file
-- would be a deletion rather than an undo. On the rehearsal branch it returns the
-- branch to the state `pnpm -s check:branch-schema-drift` found on 2026-09-17: the
-- nine `platform` objects absent, and the gate red again naming all nine. That is
-- rule 27's whole point — an inverse nobody has RUN is a paragraph, not an inverse.
--
-- Undone in reverse order of the up file: the view first (it reads
-- `client_callable_door.argument_rules`), then the eight functions, then the four
-- door rows the up file's section 1b wrote, then the column those rows live in.
-- `platform.door_arg_rule_findings` calls `platform.is_sqlstate` from a plpgsql body,
-- which PostgreSQL does not record as a dependency, so the order among the functions
-- is alphabetical rather than load-bearing. The four door rows are deleted BEFORE the
-- column is dropped only for readability — dropping the column would take their
-- `argument_rules` value with it either way — and AFTER the functions, because a door
-- row for a function that still exists is exactly what `provision_shape_guard` wants
-- to see while the transaction is open.
--
-- NOT DROPPED: nothing else. `contract_probe` was never added by the up file (it is
-- named there as drift left behind), and `platform.client_callable_door` itself
-- predates this lane on both servers.

set lock_timeout = '5s';
set statement_timeout = '300s';

do $$
begin
  if (pg_control_system()).system_identifier = 7642734024280108049 then
    raise exception
      'REFUSING: this is PRODUCTION (system_identifier %). These nine objects are '
      'production''s originals — dropping them here would destroy the source this '
      'campaign levels the rehearsal branch against.',
      (pg_control_system()).system_identifier;
  end if;
end
$$;

drop view if exists platform.door_argument_rule;

drop function if exists platform.door_arg_rule_findings(p_field text, p_arg text, p_type text, p_entry jsonb);
drop function if exists platform.door_rules_normalize(p_args text, p_arg_checks jsonb);
drop function if exists platform.door_split_args(p_args text);
drop function if exists platform.is_sqlstate(p_code text);
drop function if exists platform.provision_grant_close(p_organization_id uuid, p_schema_name text, p_reason text);
drop function if exists platform.provision_grant_list(p_organization_id uuid);
drop function if exists platform.provision_grant_open(p_organization_id uuid, p_schema_name text, p_reason text);
drop function if exists platform.provision_grant_assert_operator(p_verb text);

delete from platform.client_callable_door
 where schema_name = 'platform'
   and function_name in ('provision_grant_assert_operator', 'provision_grant_close',
                         'provision_grant_list', 'provision_grant_open');

-- 🚨 `platform.client_callable_door.argument_rules` STAYS STANDING, AND IS EMPTIED INSTEAD
-- (lane INVERSE-GUARD, 2026-09-21). W1-PROV-CLOSED added the column, and
-- `platform._provision_shape_settled`
-- (`w2_pred_a_declared_door_is_honoured_in_either_spelling.sql`, a later lane on the live
-- provisioning path) has since READ it by name. Dropping it took that body's ground away, and
-- an inverse that breaks the provisioner is not the drift state this file exists to reproduce.
-- So the column stays and carries nothing: every row's `argument_rules` goes back to NULL,
-- which — with the view, the eight functions and this lane's four door rows all gone above —
-- is exactly the state `pnpm -s check:branch-schema-drift` found on 2026-09-17 for the eight
-- objects that are this file's to remove, and the ninth is a column nothing declares any more.
update platform.client_callable_door
   set argument_rules = null
 where argument_rules is not null;
