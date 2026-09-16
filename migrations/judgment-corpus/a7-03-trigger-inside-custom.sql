-- expect: branch=accept production=accept
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- Schema `custom` is this campaign's own new namespace — nothing reads it until the switch — so
-- a trigger there cannot change a live path and needs no guard reference.
--
create function custom.zz_own_hook() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger zz_own_trg before insert on custom.zz_thing for each row execute function custom.zz_own_hook();
