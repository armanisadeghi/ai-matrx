-- chair-step: inverse of perf_watch2_doors_b_settings_nav_hr_bell_search.sql — archives (soft-deletes, deactivates) the 12 door watches and 5 statement watches that file declared (owner PERF-WATCH-2, features settings/organizations/hr/notifications/search); their samples stay as history. Re-declaring a slug revives it.
update ops.proof_check set is_active = false, deleted_at = now()
 where kind = 'perf' and owner = 'PERF-WATCH-2'
   and slug in ('door:public.get_scope_trees','door:public.get_scope_trees@member','door:public.hr_my_context',
                'door:platform.knob_snapshot','door:platform.knob_snapshot@member','door:platform.knob_index',
                'door:custom.my_levels','door:custom.my_levels@member','door:platform.search_item_sections',
                'door:platform.search_item_sections@member','door:communication.my_notification_unread_count',
                'door:communication.my_notification_unread_count@member','stmt:public.get_scope_trees',
                'stmt:public.hr_my_context','stmt:platform.knob_snapshot','stmt:custom.effective_level_many','stmt:custom.my_levels');
