-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.checklist_start(uuid, uuid, uuid, jsonb, timestamp with time zone) 697ea253d6fd05afbff2c99cbadfcf0de891888ed5e33c0380d77d0a1828dda4
--
-- The inverse of `checklists_the_start_door_names_the_wall.sql`: it puts the hole back, so the
-- red twin can prove the refusal it fixed was real. Nothing else changes.
--
-- 🚨 ONE OF THE TWO RUNS, AND IF BOTH RUN, THIS ONE FIRST (lane INVERSE-GUARD, 2026-09-21).
-- The body below calls `custom._checklist_instantiate`, and the sibling inverse
-- `checklists_a_checklist_is_a_template_of_work_down.sql` takes that function away — because
-- it inverts the WHOLE checklist lane, while this file inverts only the later start-door fix
-- that landed on top of it. They invert in the reverse of the order they landed: this file
-- first, the template teardown second, and the template teardown drops
-- `custom.checklist_start` itself, so after both have run nothing is left calling a function
-- that is not there. The template teardown first and this file second is the one order that
-- leaves a live body reaching a dropped one, and it is the order an inverse pair is never run
-- in: an inverse undoes the last thing that landed, not the first.
-- ground-standing-ok: b

set lock_timeout = '5s';

create or replace function custom.checklist_start(p_organization_id uuid, p_template_id uuid,
                                                  p_about_record_id uuid default null,
                                                  p_roles jsonb default '{}'::jsonb,
                                                  p_starting_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.checklist_start');
  perform custom.assert_client_may_open(p_organization_id, p_template_id,
                                        'custom.checklist_start',
                                        'viewer'::public.permission_level, 'checklist');
  return custom._checklist_instantiate(p_organization_id, p_template_id, p_about_record_id,
                                       p_roles, p_starting_at, 'person');
end
$$;
