-- expect: branch=refuse:trigger-guard-unnamed production=refuse:trigger-guard-unnamed
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- ATTACK-7 finding 3, first half — THE EXACT PROBE. A new function bound to a LIVE table by a
-- new trigger: two allow-listed statements that together stop every write to
-- platform.associations, while the additive scan, the guard header and
-- assert_guard_resolves_off all read green.
--
create function custom.zz_hook() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$;
create trigger zz_hook_trg before insert on platform.associations for each row execute function custom.zz_hook();
