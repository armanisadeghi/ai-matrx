-- expect: branch=accept production=accept
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- The registry INSERT that IS allowed on both: the knob register the campaign seeds and reads.
--
insert into platform.feature_knob (feature, key, value, default_value, value_type, label, description)
  values ('custom', 'zz_probe', 'false'::jsonb, 'false'::jsonb, 'boolean', 'probe', 'a corpus fixture')
  on conflict (feature, key) do nothing;
