-- chair-step: the inverse of w7_off_the_ramp_doors_are_reachable.sql — take service_role's EXECUTE on the three unified-data ramp doors back, and its USAGE on campaign_watch with it. After this the admin ramp screen returns 42501 and no role but postgres can reach the switch, which is the intended end state if the ramp is abandoned.

set lock_timeout = '3s';
set statement_timeout = '2min';

revoke execute on function platform.unified_data_ramp_set(text, uuid, boolean, uuid, text) from service_role;
revoke execute on function platform.unified_data_ramp_gate(text, uuid) from service_role;
revoke execute on function platform.unified_data_ramp_state(uuid) from service_role;

revoke usage on schema campaign_watch from service_role;
