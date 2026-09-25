-- INVERSE of migrations/campaign/trashcoverage_every_archived_kind_is_restorable_from_trash.sql
-- Clears the 33 kinds it registered and puts the one code folder back in its old shape.
-- lane: TRASH-COVERAGE

set local lock_timeout = '2s';

update platform.entity_types
   set user_artifact_kind = null
 where token in (
   'pc_show','pc_episode','pc_studio_run','research_template','tool','assessment','study_goal',
   'study_media','study_plan','study_session','code_file','code_folder','user_markdown_sample',
   'agent_run','web_brand','web_site','commerce_certified_printer','comparison_set','crm_deal',
   'crm_outreach_list','party','document','seo_engine_schedule','seo_gsc_dig_rule',
   'seo_keyword_class_rule','plan_entity','plan_node','fc_card','content_ir_kind_instance',
   'skill_render_definition','interview_session','billing_spend_guardrail','studio_session');

update code.code_file_folders
   set is_active = false, deleted_at = null
 where id = '6d97f7ee-6e2d-446a-a40b-d518c66c06d1'
   and deleted_at is not null;
