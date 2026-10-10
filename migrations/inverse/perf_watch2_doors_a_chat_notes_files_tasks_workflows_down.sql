-- chair-step: inverse of perf_watch2_doors_a_chat_notes_files_tasks_workflows.sql — archives (soft-deletes, deactivates) the door watches that file declared (owner PERF-WATCH-2, slugs door:public.agx_*, get_cx_conversation_*, get_note_versions, note_folder_counts, create_note_version_manual, get_user_file_tree, get_org_file_list, get_project_references_detailed, get_task_associations, create_tasks_bulk, wfx_list_*, with their @member twins). Samples stay as history.
update ops.proof_check set is_active = false, deleted_at = now()
 where kind = 'perf' and owner = 'PERF-WATCH-2'
   and regexp_replace(slug, '@member$', '') in (
     'door:public.agx_list_scoped','door:public.agx_list_scope_counts','door:public.agx_get_version_history',
     'door:public.get_cx_conversation_lane_facets','door:public.get_cx_conversation_bundle','door:public.get_note_versions',
     'door:workbench.note_folder_counts','door:public.create_note_version_manual','door:public.get_user_file_tree',
     'door:public.get_org_file_list','door:public.get_project_references_detailed','door:public.get_task_associations',
     'door:public.create_tasks_bulk','door:public.wfx_list_scoped','door:public.wfx_list_scope_counts');
