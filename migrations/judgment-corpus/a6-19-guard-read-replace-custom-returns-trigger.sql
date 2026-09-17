-- expect: branch=accept production=accept
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.zz_hook() 0000000000000000000000000000000000000000000000000000000000000000
--
-- The positive control paired with `a6-18`: the same `custom.*` RETURNS TRIGGER
-- replacement, but its body reads the knob and returns early when it is false — what a
-- guarded trigger-returning function in `custom` looks like once it is judged exactly as it
-- would be outside `custom`.
--
create or replace function custom.zz_hook() returns trigger
  language plpgsql as $$
begin
  if not platform.knob_resolve('custom', 'system_enabled', null)::boolean then return new; end if;
  return new;
end $$;
