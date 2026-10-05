-- Inverse of chairstd_a_the_table_api_reaches_tasks_projects_deals_and_the_people_directory.sql: the four tokens leave the knob.
update platform.feature_knob
   set value = value - 'task' - 'project' - 'crm_deal' - 'hr_employee',
       updated_at = now()
 where feature = 'table_api' and key = 'standard_tables';
