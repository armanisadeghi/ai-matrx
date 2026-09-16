-- expect: branch=refuse:trigger-guard-unnamed production=refuse:trigger-guard-unnamed
-- target: branch,production
-- additive: yes
-- seeds-guards: yes
--
-- A register file may not bind behaviour to a live table either — the `-- seeds-guards:` arm of
-- ATTACK-7 finding 3.
--
create function custom.zz_seed_hook() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger zz_seed_trg before insert on platform.feature_knob for each row execute function custom.zz_seed_hook();
