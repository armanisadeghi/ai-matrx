-- expect: branch=refuse:seeds-guards-with-guard production=refuse:seeds-guards-with-guard
-- target: branch,production
-- additive: yes
-- seeds-guards: yes
-- guard: custom/system_enabled
--
-- A register file seeds the guards; it is not itself guarded. Keep one.
--
insert into platform.feature_knob (feature, key, value, default_value, value_type, label, description)
  values ('custom', 'zz_seed', 'false'::jsonb, 'false'::jsonb, 'boolean', 'seed', 'a corpus fixture');
