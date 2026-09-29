-- The second half of guests_read_model_details_from_model_public.sql (2026-09-29).
--
-- ai.model_public now carries `controls` / `constraints`, computed by the SECURITY DEFINER
-- ai.resolve_model_config. A function called inside a view is privilege-checked as the CALLER
-- (only relation access uses the view owner), so an `anon` reader of those columns — and of
-- `select *`, which the model catalog issues — was refused 42501 on the function. `anon` is
-- given EXECUTE on it, declared on its existing door: it answers one model's resolved
-- controls/constraints — the public, non-sensitive settings every signed-in person already
-- reads — and nothing else.

update platform.client_callable_door
   set anonymous_callers = true,
       anonymous_purpose = 'A signed-out guest (a public app at /p/<slug>, signed-out chat) reads a model''s resolved controls/constraints through ai.model_public; the function is called inside that view and privilege-checked as the caller.'
 where schema_name = 'ai'
   and function_name = 'resolve_model_config'
   and identity_args = 'p_model_id uuid';

grant execute on function ai.resolve_model_config(uuid) to anon;
