-- expect: branch=refuse:guard-unread production=refuse:guard-unread
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: platform.zz_live_body(uuid) 0000000000000000000000000000000000000000000000000000000000000000
--
-- W1-VAL, 2026-09-17. The BOUND of a6-15, in the same file pair: the exemption is schema
-- `custom` and nothing else. A replacement of a body OUTSIDE `custom` still has to name the
-- knob that is supposed to hold it OFF. This is the shape ATTACK-6 finding 2 planted.
--
create or replace function platform.zz_live_body(p_organization_id uuid) returns jsonb
  language sql stable as $$ select '{}'::jsonb $$;
