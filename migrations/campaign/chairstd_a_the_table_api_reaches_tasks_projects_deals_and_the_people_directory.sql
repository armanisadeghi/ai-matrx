-- additive: yes
-- lane: CHAIR-STANDARD-SOURCES
--
-- table_api/standard_tables gains four tokens, so the ONE Table API core (REST v1, MCP `tables`)
-- serves them as entity:<token>: task, project, crm_deal, hr_employee. Facts only — every row is
-- still read and written AS the person through platform.drill_rows / custom.entity_row_write, so the
-- tables' own row rules decide. No DDL, no grant, no policy, nothing tightened.
--   task         read_write: the columns the task screen writes (UpdateTaskInput)
--   project      read_write: the columns the project screen writes (updateProject)
--   crm_deal     read_write: the columns the deal board and record page write (moveDealToStage,
--                updateDeal); the stage reads, filters and is changed as its name (a labelled
--                choice over its pipeline's stages); status is derived by crm._deal_stage_shape
--   hr_employee  read: a people directory. show_columns is a FILTER of the columns this source
--                shows (name, title, department, manager, work email/phone, photo, start date),
--                never a permission; default_list_where hides people who opted out of the
--                directory, as a directory does.
-- New facts (read by aidream table_api/standard.py): show_columns, choices, lookups.
-- Inverse: migrations/inverse/chairstd_a_the_table_api_reaches_tasks_projects_deals_and_the_people_directory_down.sql.

update platform.feature_knob
   set value = value || $facts$
{
  "task": {
    "reach": "read_write",
    "reason": "CHAIR-STANDARD-SOURCES: tasks as a data source; the columns the task screen writes",
    "create_via": "refuse",
    "search_columns": ["title", "description"],
    "writable_columns": ["title", "description", "status", "priority", "due_date", "start_date", "due_time",
                         "timezone", "recurrence_rule", "assignee_id", "project_id", "parent_task_id", "completed_at"],
    "default_list_where": {},
    "choices": {"status": ["inbox", "planned", "active", "incomplete", "completed", "cancelled", "dismissed"]},
    "lookups": [
      {"via": "project_id", "token": "project", "column": "name", "name": "Project"}
    ]
  },
  "project": {
    "reach": "read_write",
    "reason": "CHAIR-STANDARD-SOURCES: projects as a data source; the columns the project screen writes",
    "create_via": "refuse",
    "search_columns": ["name", "description"],
    "writable_columns": ["name", "description", "status", "priority", "start_date", "target_date"],
    "default_list_where": {},
    "choices": {"status": ["planning", "active", "paused", "completed", "archived"]}
  },
  "crm_deal": {
    "reach": "read_write",
    "reason": "CHAIR-STANDARD-SOURCES: CRM deals with their pipeline stage; the columns the deal board and record page write",
    "create_via": "refuse",
    "search_columns": ["name", "description"],
    "writable_columns": ["stage_id", "sort_order", "amount", "expected_close_date", "lost_reason_id"],
    "default_list_where": {},
    "choices": {"status": ["open", "won", "lost"]},
    "lookups": [
      {"via": "stage_id", "token": "category", "column": "name", "name": "Stage", "choice": true,
       "choices_where": {"dimension": "deal_pipeline", "parent_id": {"empty": false}}, "choices_sort": "position"},
      {"via": "pipeline_id", "token": "category", "column": "name", "name": "Pipeline"},
      {"via": "lost_reason_id", "token": "category", "column": "name", "name": "Lost reason", "choice": true,
       "choices_where": {"dimension": "deal_lost_reason"}, "choices_sort": "position"},
      {"via": "primary_party_id", "token": "party", "column": "display_name", "name": "Contact"}
    ]
  },
  "hr_employee": {
    "reach": "read",
    "reason": "CHAIR-STANDARD-SOURCES: a people directory over HR employees; directory columns only (a filter, not a permission)",
    "create_via": "refuse",
    "search_columns": ["display_name", "work_email"],
    "writable_columns": [],
    "default_list_where": {"directory_opt_out": false},
    "show_columns": ["display_name", "current_job_title_id", "current_department_id", "current_manager_employee_id",
                     "work_email", "work_phone", "photo_file_id", "start_date"],
    "lookups": [
      {"via": "current_job_title_id", "token": "hr_job_title", "column": "title", "name": "Title"},
      {"via": "current_department_id", "token": "hr_department", "column": "name", "name": "Department"},
      {"via": "current_manager_employee_id", "token": "hr_employee", "column": "display_name", "name": "Manager"},
      {"api_name": "start_date", "via": "current_employment_id", "token": "hr_employment", "column": "hire_date",
       "name": "Start date", "type": "date"}
    ]
  }
}
$facts$::jsonb,
       updated_at = now()
 where feature = 'table_api' and key = 'standard_tables';

do $$
declare v jsonb;
begin
  select value into v from platform.feature_knob where feature = 'table_api' and key = 'standard_tables';
  if v -> 'party' is null or v #>> '{task,reach}' is distinct from 'read_write'
     or v #>> '{project,reach}' is distinct from 'read_write' or v #>> '{crm_deal,reach}' is distinct from 'read_write'
     or v #>> '{hr_employee,reach}' is distinct from 'read' then
    raise exception 'table_api/standard_tables does not carry party plus the four new tokens';
  end if;
end $$;
