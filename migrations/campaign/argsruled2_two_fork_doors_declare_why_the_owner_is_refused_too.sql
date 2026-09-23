-- chair-step: two UPDATEs on our own door register (platform.client_callable_door.argument_rules).
--   NON-ADDITIVE BY CONSTRUCTION. Nothing is created, dropped or granted, no function body is
--   touched, and no row of anybody's data is read, written or moved. Inverse:
--   migrations/inverse/argsruled2_two_fork_doors_declare_why_the_owner_is_refused_too_down.sql removes the one key again.
-- lock: platform
-- lane: ARGS-RULED-2
--
-- ARGS-RULED-2 — THE CONTRACT SAYS WHAT IS TRUE TODAY ABOUT TWO SHUT FORK DOORS.
--
-- public.fork_shared_conversation and public.fork_shared_quiz can never succeed for anybody: the
-- shareable-types registry cannot mark conversation (class private) or quiz_session (class
-- confidential) link-shareable, because platform._share_registry_class_interlock refuses it by
-- VISIBILITY-BY-CLASS §3.4 and its remedy is a reclassification with an access delta (DD-137b) —
-- a Data Doctrine change, which is Arman's. Until he rules, the generated door contract executes
-- the true claim — owner and stranger both get not_available — through a named token,
-- `foreign.owner_refused_too`, whose text says why. The moment the door opens, that test goes red
-- and names the token to remove. Coordinator ruling, 2026-09-23.

set lock_timeout = '4s';

update platform.client_callable_door
   set argument_rules = jsonb_set(argument_rules, '{arguments,p_conversation_id,foreign,owner_refused_too}', '"DD-137b, PENDING ARMAN''S RULING (2026-09-23): conversation is classed private, and platform.entity_link_shareable refuses link sharing for a private class, so platform.shareable_resource_registry cannot mark it link-shareable and this door refuses EVERY caller, the owner included, with the same not_available answer a stranger gets. Recommended ruling: an owner-issued share link on private types (ChatGPT''s shared conversation link). When he rules, remove this token and the contract demands the owner succeed."'::jsonb, true)
 where schema_name = 'public' and function_name = 'fork_shared_conversation' and identity_args = 'p_conversation_id uuid, p_organization_id uuid, p_token text'
   and argument_rules #> '{arguments,p_conversation_id,foreign}' is not null;

update platform.client_callable_door
   set argument_rules = jsonb_set(argument_rules, '{arguments,p_quiz_id,foreign,owner_refused_too}', '"DD-137b, PENDING ARMAN''S RULING (2026-09-23): quiz_session is classed confidential, and platform.entity_link_shareable refuses link sharing for a confidential class, so platform.shareable_resource_registry cannot mark it link-shareable and this door refuses EVERY caller, the owner included, with the same not_available answer a stranger gets. Recommended ruling: an owner-issued share link on private types (ChatGPT''s shared conversation link). When he rules, remove this token and the contract demands the owner succeed."'::jsonb, true)
 where schema_name = 'public' and function_name = 'fork_shared_quiz' and identity_args = 'p_quiz_id uuid, p_organization_id uuid, p_token text'
   and argument_rules #> '{arguments,p_quiz_id,foreign}' is not null;
