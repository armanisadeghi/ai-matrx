-- scfg_13: strip register-matching knob paths from iam.organizations.settings->'hr'
-- now that scfg_12 resolves from platform.knob_override. module_enabled and any
-- other non-object / unregistered content survives untouched (F15).
do $$
declare r record; v jsonb; v_stripped int := 0;
begin
  for r in
    select o.id as org_id, 'hr.' || slug.key as feature, slug.key as slug, kv.key as knob_key
      from iam.organizations o
      cross join lateral jsonb_each(o.settings -> 'hr') slug
      cross join lateral jsonb_each(slug.value) kv
      join platform.feature_knob k
        on k.feature = 'hr.' || slug.key and k.key = kv.key
     where o.settings ? 'hr' and jsonb_typeof(slug.value) = 'object'
  loop
    -- Safety: the override row must exist before the blob copy is removed.
    if not exists (select 1 from platform.knob_override ko
                    where ko.feature = r.feature and ko.key = r.knob_key
                      and ko.scope_kind = 'organization'
                      and ko.organization_id = r.org_id) then
      raise exception 'scfg_13: no knob_override row for org % %.% — refusing to strip',
        r.org_id, r.feature, r.knob_key;
    end if;
    update iam.organizations
       set settings = settings #- array['hr', r.slug, r.knob_key]
     where id = r.org_id;
    v_stripped := v_stripped + 1;
  end loop;

  -- Remove now-empty slug objects (never the 'hr' object itself: module_enabled lives there).
  update iam.organizations o
     set settings = o.settings #- array['hr', empties.slug]
    from (
      select o2.id as org_id, slug.key as slug
        from iam.organizations o2
        cross join lateral jsonb_each(o2.settings -> 'hr') slug
       where o2.settings ? 'hr'
         and jsonb_typeof(slug.value) = 'object'
         and slug.value = '{}'::jsonb
    ) empties
   where o.id = empties.org_id;

  raise notice 'scfg_13: stripped % knob path(s)', v_stripped;

  -- Post-check: resolution unchanged after the strip.
  v := hr._hr_knob('hr.time_and_attendance','kiosk_enabled','2643e470-b275-47f3-95f3-ae275ad3ca47',null);
  if v is distinct from 'true'::jsonb then
    raise exception 'scfg_13 post-check: override org expected true, got %', v;
  end if;
end $$;
