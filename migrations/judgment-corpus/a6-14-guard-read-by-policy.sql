-- expect: branch=accept production=accept
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- The positive control: the same policy, reading the knob.
--
create policy zz_judgment_scoped on custom.zz_thing for select
  using (platform.knob_resolve('custom', 'system_enabled', null)::boolean and organization_id = iam.current_org());
