-- lock: platform
-- lane: INTEGRATION
-- chair-step: the inverse of `migrations/campaign/w22_a_reference_can_point_at_a_meeting_a_mandate_and_a_form.sql`.
--   It withdraws (soft, REL-13) every live record → meet_meeting | mandate | anon_form edge an
--   entity-reference Field wrote, deletes the three `record → <token>` registry rows the up
--   inserted (found by the note it wrote on them), and puts the three platform.entity_types rows
--   back to no title column and not reference-pickable. WHAT IT DOES NOT UNDO: a Field that
--   allowed one of these kinds keeps its document and its {token, id} values; the next save of
--   such a record is refused as pointing at a kind a record may not point at, which is exactly
--   what running this brings back. Row locks on registry rows only.

set local statement_timeout = '120s';

update platform.associations
   set deleted_at = now()
 where source_type = 'record'
   and target_type in ('meet_meeting', 'mandate', 'anon_form')
   and relation_field_id is not null
   and deleted_at is null;

delete from platform.association_types
 where source_type = 'record'
   and target_type in ('meet_meeting', 'mandate', 'anon_form')
   and notes like 'W2.2 (2026-10-02):%';

update platform.entity_types
   set title_column = null,
       reference_pickable = false
 where token in ('meet_meeting', 'mandate', 'anon_form');
