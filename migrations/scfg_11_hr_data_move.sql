-- scfg_11: move HR org overrides from iam.organizations.settings->'hr' jsonb
-- into platform.knob_override rows. Census scfg_00: exactly ONE real override
-- exists platform-wide (kiosk_enabled=true on one sandbox org); everything else
-- under settings->'hr' is module_enabled, which is NOT a knob and is untouched.
-- Sub-org tables carry zero knob overrides. Idempotent; blobs are NOT deleted
-- here (scfg_13 strips them only after the body rewrite parity check).
do $$
declare v_moved int := 0; v_unmatched int := 0; r record;
begin
  for r in
    select o.id as org_id,
           'hr.' || slug.key as feature,
           kv.key as knob_key,
           kv.value as knob_value,
           (k.feature is not null) as registered
      from iam.organizations o
      cross join lateral jsonb_each(o.settings -> 'hr') slug
      cross join lateral jsonb_each(slug.value) kv
      left join platform.feature_knob k
        on k.feature = 'hr.' || slug.key and k.key = kv.key
     where o.settings ? 'hr'
       and jsonb_typeof(slug.value) = 'object'   -- skips scalar module_enabled
  loop
    if not r.registered then
      v_unmatched := v_unmatched + 1;
      raise notice 'scfg_11 UNMATCHED (left in place): org % %.%', r.org_id, r.feature, r.knob_key;
      continue;
    end if;
    insert into platform.knob_override
      (feature, key, scope_kind, scope_id, organization_id, value, set_note)
    values
      (r.feature, r.knob_key, 'organization', r.org_id, r.org_id, r.knob_value,
       'migrated from iam.organizations.settings hr jsonb (scfg_11)')
    on conflict (feature, key, scope_kind, scope_id, organization_id) do nothing;
    v_moved := v_moved + 1;
  end loop;
  raise notice 'scfg_11: % override(s) moved, % unmatched', v_moved, v_unmatched;
end $$;
