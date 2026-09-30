-- chair-step: inverse of tableapi1_the_self_registered_apps_switch_says_how_to_turn_it_off.sql — puts back the knob's earlier label and description; its value is untouched.
--
-- inverse of tableapi1_the_self_registered_apps_switch_says_how_to_turn_it_off.sql

set local lock_timeout = '3s';

update platform.feature_knob
   set label = 'Apps that registered themselves may reach AI Matrx',
       description = 'When on, an app that registered itself through our OAuth server (Claude, Cursor, ChatGPT and other MCP clients) can use the sign-in a person gave it on the AI Dream MCP and the table API. When off, those sign-ins are refused there at once; apps we registered ourselves keep working. Registration itself is the Supabase OAuth server''s own switch.',
       updated_at = now()
 where feature = 'mcp' and key = 'oauth_dynamic_clients_enabled';
