-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.checklist_start(uuid, uuid, uuid, jsonb, timestamp with time zone) 697ea253d6fd05afbff2c99cbadfcf0de891888ed5e33c0380d77d0a1828dda4
--
-- CHECKLISTS — census 1, found by `pnpm check:store-doors-decide` one minute after this lane's
-- first landing, and it is a REAL refusal defect, not a lint.
--
-- `custom.checklist_start` asked `custom.assert_client_may_open` and nothing else.
-- That function DOES ask the organization wall on its own first line, so nobody in the wrong
-- organization ever got in — but what they were TOLD was "you do not have access to this
-- checklist", when the true answer is that the checklist is in an organization they are not a
-- member of. WORK-DOORS paid for this exact sentence on four doors on 2026-09-20 and fixed it
-- the same way: the door states its own wall by name, so a person is told the thing that is
-- actually wrong. Census 1 reads for that name, which is why it is the census that caught it.
--
-- The inverse is `migrations/inverse/checklists_the_start_door_names_the_wall_down.sql`.

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
  -- THE WALL, BY NAME, FIRST. Somebody in another organization is told THAT, not that they
  -- cannot open a checklist they were never allowed to know exists.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.checklist_start');
  perform custom.assert_client_may_open(p_organization_id, p_template_id,
                                        'custom.checklist_start',
                                        'viewer'::public.permission_level, 'checklist');
  return custom._checklist_instantiate(p_organization_id, p_template_id, p_about_record_id,
                                       p_roles, p_starting_at, 'person');
end
$$;
