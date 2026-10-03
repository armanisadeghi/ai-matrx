-- lock: platform
-- lane: INTEGRATION
-- chair-step: the inverse of `migrations/campaign/w14_a_message_can_be_linked_to_a_record.sql`.
--   It withdraws (soft: deleted_at) every live record ↔ dm_message edge, then deletes the two
--   registry rows the up inserted (found by the note it wrote on them). Row locks on registry
--   rows and those edges only.

set local statement_timeout = '120s';

update platform.associations
   set deleted_at = now()
 where ((source_type = 'record' and target_type = 'dm_message')
     or (source_type = 'dm_message' and target_type = 'record'))
   and deleted_at is null;

delete from platform.association_types
 where ((source_type = 'record' and target_type = 'dm_message')
     or (source_type = 'dm_message' and target_type = 'record'))
   and notes like 'W1.4 (2026-10-03):%';
