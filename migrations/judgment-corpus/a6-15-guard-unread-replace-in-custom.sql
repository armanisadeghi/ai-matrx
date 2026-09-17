-- expect: branch=accept production=accept
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.zz_projection(uuid) 0000000000000000000000000000000000000000000000000000000000000000
--
-- W1-VAL, 2026-09-17. A `CREATE OR REPLACE FUNCTION` of a body in schema `custom` — one
-- wave-1 lane extending an earlier wave-1 lane's function — is EXEMPT from the
-- guard-must-be-read rule, exactly as `triggerOnLiveTableUnguardedBy` already exempts a
-- trigger on a `custom` table, and for the same stated reason: schema `custom` is revoked
-- from every client role, absent from `pgrst.db_schemas` and absent from the ORM, so
-- nothing reads it until the switch and there is no live path whose body this could
-- replace. The defect `guardUnreadBy` closes is the replacement of
-- `public._provision_new_user_personal_org()`, which every signup executes. Requiring a
-- knob read inside a pure projection function in `custom` buys nothing and teaches the next
-- author that the guard line is a formality.
--
create or replace function custom.zz_projection(p_organization_id uuid) returns jsonb
  language sql stable as $$ select '{}'::jsonb $$;
