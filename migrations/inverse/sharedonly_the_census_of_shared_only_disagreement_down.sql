-- SHARED-ONLY, the inverse: the three-answer census goes, and nothing compares the one
-- ladder, the read door and the RLS mirror on the same row again.

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'shared_only_disagreements';
drop function if exists custom.shared_only_disagreements(text);
