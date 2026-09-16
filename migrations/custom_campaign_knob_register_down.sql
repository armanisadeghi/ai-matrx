-- migrate: skip: the inverse of custom_campaign_knob_register.sql — run by hand, never auto-applied
-- target: branch,production
--
-- THE DOWN-MIGRATION for custom_campaign_knob_register.sql.
--
-- It exists in the same commit as its up, because the campaign's branch rollback
-- is NOT `reset_branch` — that resets the whole branch and destroys every other
-- lane's landed work — it is each migration's own inverse.
--
-- It is `-- migrate: skip`, so no runner will ever apply it on its own. To run it
-- deliberately, strip the skip marker in a scratch copy, or execute its body
-- through the same runner with an explicit target.
--
-- WHAT IT UNDOES, AND WHAT IT REFUSES TO
-- --------------------------------------
-- It deletes exactly the ten rows the up seeded, and ONLY while they are still
-- OFF and un-overridden. A knob somebody has since turned ON, or written an
-- override against, is a decision this file must not silently revoke: the delete
-- skips it and the count at the end says so. Removing the register while an
-- object still reads it would make platform.knob_resolve raise P0001 on a live
-- write path — the precise defect the up-migration closed.

delete from platform.feature_knob k
 where k.feature = 'custom'
   and k.key in (
     'system_enabled',
     'code_paths_enabled',
     'associations_guard',
     'entity_types_guard',
     'field_index_guard',
     'accessible_entity_ids_guard',
     'emergency_door_guard',
     'entity_custom_fields_guard',
     'signup_provisioning_guard',
     'row_versions_guard'
   )
   and coalesce(k.value, k.default_value) = 'false'::jsonb
   and not exists (
     select 1 from platform.knob_override o
      where o.feature = k.feature and o.key = k.key
   );

do $$
declare
  n integer;
begin
  select count(*) into n
    from platform.feature_knob
   where feature = 'custom'
     and key in ('system_enabled', 'code_paths_enabled', 'associations_guard',
                 'entity_types_guard', 'field_index_guard', 'accessible_entity_ids_guard',
                 'emergency_door_guard', 'entity_custom_fields_guard',
                 'signup_provisioning_guard', 'row_versions_guard');
  if n > 0 then
    raise warning
      'custom_campaign_knob_register_down: % campaign knob row(s) were KEPT because they are ON '
      'or carry an override. Removing a knob an object still reads makes knob_resolve raise '
      'P0001 on a live write path. Turn them off through the knob door first, then re-run.', n;
  else
    raise notice 'custom_campaign_knob_register_down: all ten campaign knob rows removed.';
  end if;
end $$;
