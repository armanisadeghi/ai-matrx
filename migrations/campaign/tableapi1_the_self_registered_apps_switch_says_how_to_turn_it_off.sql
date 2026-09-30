-- lane: TABLE-API-1
-- lock: platform
--
-- TABLE-API-1 — THE SELF-REGISTERED APPS SWITCH SAYS WHY IT EXISTS AND HOW TO TURN IT OFF.
--
-- The knob mcp/oauth_dynamic_clients_enabled was seeded by tableapi1_a_person_can_hold_a_key_that_is_them.sql
-- (platform default on). Its words named the wrong server (the AI Dream MCP, which never reads it)
-- and did not say how to turn it off. Only the label and description change; the value stays on.

set local lock_timeout = '3s';

update platform.feature_knob
   set label = 'Apps that registered themselves can sign people in',
       description = 'On (the default): an app that registered itself through the AI Matrx OAuth server — Claude, ChatGPT, Cursor and other MCP clients — can use the sign-in a person approved for it, on the person''s AI Matrx MCP server and the table API. Why it exists: self-registration lets anyone create an app with any name and ask people to approve it, so if it is ever abused this turns every self-registered app''s sign-ins off in one move. How to turn it off: set this knob to off here; within a minute those sign-ins are refused with a sentence, while apps AI Matrx registered itself and personal API keys keep working. To stop new apps from registering at all, also turn off dynamic registration in the Supabase OAuth server settings.',
       updated_at = now()
 where feature = 'mcp' and key = 'oauth_dynamic_clients_enabled';
