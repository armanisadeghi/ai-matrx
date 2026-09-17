-- expect: branch=refuse:guard-unread production=refuse:guard-unread
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.zz_hook() 0000000000000000000000000000000000000000000000000000000000000000
--
-- The exemption `a6-15` proves for schema `custom` does NOT cover a function that
-- `RETURNS TRIGGER` (or `RETURNS EVENT_TRIGGER`). Postgres resolves a trigger's function by
-- OID at fire time, not by schema privilege, so `custom.zz_hook()` bound with `CREATE
-- TRIGGER … ON platform.associations … EXECUTE FUNCTION custom.zz_hook()` (a7-02) is a live
-- path the moment that trigger exists — revoking schema `custom` stops nothing, because
-- nothing reads the schema to fire the trigger. This file replaces that function's body and
-- never reads its guard: exactly the class of defect `guard-unread` exists to catch, and
-- schema `custom` buys it nothing once the function returns a trigger.
--
create or replace function custom.zz_hook() returns trigger
  language plpgsql as $$ begin return new; end $$;
