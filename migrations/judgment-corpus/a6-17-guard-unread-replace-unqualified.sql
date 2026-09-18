-- expect: branch=refuse:guard-unread production=refuse:guard-unread
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: zz_unqualified(uuid) 0000000000000000000000000000000000000000000000000000000000000000
--
-- W1-VAL, 2026-09-17. An UNQUALIFIED name is treated as OUTSIDE `custom`: `search_path`
-- decides where it lands at execution time, so nothing static can prove it is the campaign's
-- own namespace. Same honesty as `triggerOnLiveTableUnguardedBy`'s unqualified-table rule.
--
create or replace function zz_unqualified(p_organization_id uuid) returns jsonb
  language sql stable as $$ select '{}'::jsonb $$;
