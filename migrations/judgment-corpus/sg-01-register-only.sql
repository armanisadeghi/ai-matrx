-- expect: branch=accept production=accept
-- target: branch,production
-- additive: yes
-- seeds-guards: yes
--
-- The ONE exemption from the guard requirement: the file that SEEDS the knobs cannot name one
-- that already resolves. Bounded to the knob register itself.
--
insert into platform.feature_knob (feature, key, value, default_value, value_type, label, description)
  values ('custom', 'zz_seed', 'false'::jsonb, 'false'::jsonb, 'boolean', 'seed', 'a corpus fixture')
  on conflict (feature, key) do nothing;
