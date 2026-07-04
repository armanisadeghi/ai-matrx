-- threads_active_tab_entity_tabs.sql
-- Widen `workspace.threads.active_tab` for DERIVED entity tabs.
--
-- The war-room thread tab set is now open-vocabulary: one `entity:<token>` tab
-- appears per attached entity type the core tabs don't cover (dataset,
-- flashcard_set, data_store, agent, …), and the active tab persists like any
-- other. The legacy CHECK (`wr_threads_active_tab_chk`, carried over from
-- ctx_war_room_tiles) hard-coded the six core values, so persisting an entity
-- tab failed with 23514 — caught live by the Error Inspector.
--
-- New CHECK: the core set OR an `entity:<token>` value. The FE validates the
-- token against `platform.entity_types` on read (`normalizeThreadTab` falls
-- back to 'task' for anything unregistered), so the DB only guards shape.
--
-- Idempotent: drop-if-exists + re-add.

alter table workspace.threads
  drop constraint if exists wr_threads_active_tab_chk;

alter table workspace.threads
  add constraint wr_threads_active_tab_chk check (
    active_tab = any (array[
      'all'::text, 'task'::text, 'notes'::text, 'audio'::text,
      'combined'::text, 'files'::text, 'agent'::text
    ])
    or active_tab like 'entity:%'
  );
