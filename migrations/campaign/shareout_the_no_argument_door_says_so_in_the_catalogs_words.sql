-- SHARE-OUT item 1 — A DOOR WITH NO ARGUMENTS WRITES THE CATALOG'S OWN EMPTY STRING.
--
-- `pnpm check:store-doors-decide` caught it immediately:
--
--   [FAIL] door rows whose stored signature is not what the catalog renders - 1:
--          custom.table_share_outside_for_me((none)) - the row stores '(none)'
--          and the catalog renders ''
--
-- `custom.table_share_outside_for_me()` takes no argument at all — the identity is
-- `auth.uid()` and the email on that account, and nothing else selects a row. The
-- declaration wrote the human word "(none)" where the rule is that `identity_args` is
-- EXACTLY what `pg_get_function_identity_arguments` renders, which for a function with no
-- arguments is the empty string. The guard is right: a stored signature that does not
-- match the catalog is a declaration that could silently come to describe a different
-- function.

update platform.client_callable_door
   set identity_args = ''
 where schema_name = 'custom'
   and function_name = 'table_share_outside_for_me'
   and identity_args = '(none)';
