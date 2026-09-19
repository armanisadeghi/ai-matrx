-- chair-step: four platform.client_callable_door rows name a signature no function has, so every registry guard has been silently skipping them; this corrects the four identity_args strings and touches nothing else
--
-- W4-DOOR-RECORD — FOUR DECLARED DOORS NAMED A SIGNATURE NO FUNCTION HAS.
--
-- `platform.client_callable_door` is joined to `pg_proc` on the EXACT text of
-- `pg_get_function_identity_arguments`. Four rows for schema `custom` have never matched
-- anything: three write `public.permission_level` where the catalogue writes
-- `permission_level`, and one writes `p_organization_id` with no type at all. The join
-- silently drops them, so every guard that asks "is this declared door still granted?"
-- has been answering that question about 21 doors while believing it asked about 25 — the
-- worst failure shape a registry can have, because it is invisible and it reads green.
--
-- Found by `pnpm check:store-doors-decide`, which fails on a declared row that matches no
-- live function precisely so this cannot happen again quietly. This file is the data
-- correction: same rows, same doors, the signature the catalogue actually reports.

update platform.client_callable_door d
   set identity_args = 'p_user_id uuid, p_type text, p_id uuid, p_required permission_level'
 where d.schema_name = 'custom' and d.function_name = 'has_visibility'
   and d.identity_args = 'p_user_id uuid, p_type text, p_id uuid, p_required public.permission_level';

update platform.client_callable_door d
   set identity_args = 'p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_organization_id uuid, p_min_version bigint'
 where d.schema_name = 'custom' and d.function_name = 'has_visibility_at'
   and d.identity_args = 'p_user_id uuid, p_type text, p_id uuid, p_required public.permission_level, p_organization_id uuid, p_min_version bigint';

update platform.client_callable_door d
   set identity_args = 'p_organization_id uuid'
 where d.schema_name = 'custom' and d.function_name = 'store_is_open'
   and d.identity_args = 'p_organization_id';

update platform.client_callable_door d
   set identity_args = 'p_user_id uuid, p_required permission_level'
 where d.schema_name = 'custom' and d.function_name = 'visible_record_ids'
   and d.identity_args = 'p_user_id uuid, p_required public.permission_level';
