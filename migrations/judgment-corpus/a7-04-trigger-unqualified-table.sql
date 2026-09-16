-- expect: branch=refuse:trigger-guard-unnamed production=refuse:trigger-guard-unnamed
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- An UNQUALIFIED table resolves through search_path at execution time, so nothing static can
-- prove where it lands. It is treated as outside `custom`.
--
create function custom.zz_hook() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger zz_hook_trg before insert on associations for each row execute function custom.zz_hook();
