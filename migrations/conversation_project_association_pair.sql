-- Register conversation -> project so a conversation can be filed DIRECTLY under
-- a project, not only through one of the project's tasks.
--
-- Arman's ruling 2026-08-16 (FOUND_DEFECTS D202). Direction/hierarchy/conveyance
-- is a product-semantics call: the answer is that a project is a first-class home
-- for a conversation. container_side='target' + conveys_max='editor' matches every
-- other * -> project pair already registered (task, note, file, agent, party,
-- working_document, research_topic, processed_document, data_store, ...).
--
-- Applied live via Supabase MCP on 2026-08-16.
insert into platform.association_types (source_type, target_type, container_side, conveys_max, is_active, notes)
values ('conversation', 'project', 'target', 'editor'::permission_level, true,
        'project conveys editor to conversations filed directly under it. Arman ruling 2026-08-16 (FOUND_DEFECTS D202): a conversation MAY belong directly to a project, not only through one of its tasks.')
on conflict (source_type, target_type) do update
  set container_side = excluded.container_side,
      conveys_max = excluded.conveys_max,
      is_active = true,
      notes = excluded.notes,
      updated_at = now();
