-- lock: platform
-- lane: ARGS-RULED-2
--
-- INVERSE of migrations/campaign/argsruled2_two_fork_doors_declare_why_the_owner_is_refused_too.sql: the owner_refused_too key comes off both rules. Rule 27 only.

set lock_timeout = '2s';

update platform.client_callable_door
   set argument_rules = argument_rules #- '{arguments,p_conversation_id,foreign,owner_refused_too}'
 where schema_name = 'public' and function_name = 'fork_shared_conversation' and identity_args = 'p_conversation_id uuid, p_organization_id uuid, p_token text';

update platform.client_callable_door
   set argument_rules = argument_rules #- '{arguments,p_quiz_id,foreign,owner_refused_too}'
 where schema_name = 'public' and function_name = 'fork_shared_quiz' and identity_args = 'p_quiz_id uuid, p_organization_id uuid, p_token text';
