-- chair-step: inverse of tableapi1_self_registered_apps_off_for_the_switch_proof.sql — turns mcp/oauth_dynamic_clients_enabled back ON (its platform default), so self-registered apps sign people in again.
--
-- inverse of tableapi1_self_registered_apps_off_for_the_switch_proof.sql

set local lock_timeout = '3s';

update platform.feature_knob
   set value = 'true'::jsonb, updated_at = now()
 where feature = 'mcp' and key = 'oauth_dynamic_clients_enabled';
