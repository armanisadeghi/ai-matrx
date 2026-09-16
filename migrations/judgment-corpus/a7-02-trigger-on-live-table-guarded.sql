-- expect: branch=accept production=accept
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- The positive control: the same trigger whose function READS the knob and returns early when
-- it is false. This is what a guarded trigger looks like.
--
create function custom.zz_hook() returns trigger language plpgsql as $$
begin
  if not platform.knob_resolve('custom', 'system_enabled', null)::boolean then return new; end if;
  return new;
end $$;
create trigger zz_hook_trg before insert on platform.associations for each row execute function custom.zz_hook();
