-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.checklist_start(uuid, uuid, uuid, jsonb, timestamp with time zone) 697ea253d6fd05afbff2c99cbadfcf0de891888ed5e33c0380d77d0a1828dda4
--
-- The inverse of `checklists_the_start_door_names_the_wall.sql`: it puts the hole back, so the
-- red twin can prove the refusal it fixed was real. Nothing else changes.

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
