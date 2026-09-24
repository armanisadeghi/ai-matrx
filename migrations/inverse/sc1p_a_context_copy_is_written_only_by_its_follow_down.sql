-- chair-step: the inverse of sc1p_a_context_copy_is_written_only_by_its_follow.sql. It DROPS the trigger _ab_context_copy_fence on custom.record and the function custom._context_copy_fence(), and deletes the knob custom/context_copy_following with any organization override of it. Nothing else existed before it and nothing else is touched; afterwards a context copy takes writes from every door again, as it did before SC-1'.
-- lane: SC-1
-- lock: custom
-- window-class: DROP TRIGGER on the partitioned custom.record takes ACCESS EXCLUSIVE on the parent, its 16 partitions and the 23 auth/storage/realtime relations Supabase's hook adds, for the length of this transaction; 01:00–04:00 Pacific at production.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop trigger if exists _ab_context_copy_fence on custom.record;
drop function if exists custom._context_copy_fence();
delete from platform.knob_override where feature = 'custom' and key = 'context_copy_following';
delete from platform.feature_knob where feature = 'custom' and key = 'context_copy_following';
