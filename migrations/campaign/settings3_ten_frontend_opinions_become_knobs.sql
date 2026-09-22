-- SETTINGS-3 — TEN FRONTEND OPINIONS BECOME KNOBS.
--
-- UP MIGRATION. (The inverse that deletes exactly these ten rows is
-- `migrations/inverse/settings3_ten_frontend_opinions_become_knobs_down.sql`.)
--
-- `check:settings-hardcoded` found ten module-level CAPS constants in
-- matrx-frontend that are not engineering values but OPINIONS: how many of an
-- organization's own rows one page shows, and how complex one of their own row
-- actions may be. Law 6 — "opinions become knobs; organizations decide, never
-- agents, and never hardcoded taste." Every row below carries as its DEFAULT the
-- exact number the code shipped with, so this migration changes no behaviour by
-- itself; what it changes is who may change it.
--
-- HOW THE CODE READS THEM. Eight of the ten are gone from the source and read
-- live through the canonical client read (`ensureEffectiveKnob` /
-- `useEffectiveKnob`, `lib/scoped-config/effectiveKnobs.ts`, which resolves the
-- whole register in ONE cached fetch) or, for the three topical-map rows,
-- through `features/marketing/seo/topical-map/knobs.ts`, the one reader that
-- feature declares. TWO are KNOB MIRRORs — `data_tables.row_actions.max_actions`
-- and `.max_steps` are read by `readRowActions` / `validateRowActions`, two
-- synchronous pure functions with a unit-test contract on the values and no
-- async seam; the constant stays beside a `KNOB MIRROR of platform.feature_knob`
-- comment naming its row, and a change to the row takes effect on the next
-- deploy that re-mirrors it. The `basis` of each row says which it is.
--
-- overridable_by: `{organization}` everywhere (a per-organization data-volume
-- choice), plus `user` on the rows that decide how much of a LIST one person
-- sees at a time, because that is honestly a personal preference. The three
-- `seo.topical_map` rows take that feature's own established rung set
-- (`{organization,brand,site,user}`) so the topical map's settings stay one
-- ladder rather than two.
--
-- Agent-set values under blind approval (limits-are-knobs policy): set by Claude
-- Opus 5 (agent session, lane SETTINGS-3) on 2026-09-22. Arman has NOT reviewed
-- these rows. Review due 2026-10-22. Idempotent.

set lock_timeout = '3s';
set statement_timeout = '120s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   label, description, set_by, basis, review_due,
   overridable_by, override_direction, propagation, taxonomy_node_id)
values
  ('agents.samples', 'library_page_size',
   '200'::jsonb, '200'::jsonb, 'integer', 'items', 10, 2000,
   'Library items offered at once when teaching an agent',
   'When you pick catalogued library material to make an agent''s test cases from, this is how '
   'many of the ready items the picker lists in one go. The dialog names the number out loud, so '
   'nobody is left wondering what happened to the rest. Raise it if your libraries are large and '
   'you routinely want to see everything at once.',
   'agent',
   'Replaces ITEM_PAGE_SIZE = 200 in matrx-frontend features/agents/components/samples/'
   'LoadFromLibraryDialog.tsx; read live through useEffectiveKnob.',
   date '2026-10-22', array['organization','user']::text[], 'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'agent-samples' and level = 'feature')),

  ('agents.conversations', 'trash_page_size',
   '50'::jsonb, '50'::jsonb, 'integer', 'conversations', 5, 500,
   'Deleted conversations shown in the trash',
   'How many of your recently deleted conversations the trash lists at once, newest deletion '
   'first. Fifty is about a screen and a half of scanning; an organization that deletes heavily '
   'and restores often may want more.',
   'agent',
   'Replaces CONVERSATION_TRASH_PAGE_SIZE = 50 in matrx-frontend features/agents/redux/'
   'conversation-list/conversation-trash.thunks.ts; read live through ensureEffectiveKnob.',
   date '2026-10-22', array['organization','user']::text[], 'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'chat' and level = 'feature')),

  ('approvals', 'queue_page_size',
   '50'::jsonb, '50'::jsonb, 'integer', 'proposals', 5, 500,
   'Proposals each approval section shows',
   'The approvals queue reads one page per kind of proposal. This is how big that page is, and '
   'the screen says so when a linked item sits beyond it. Raise it in an organization where a lot '
   'is waiting on one reviewer, so fewer things are reached only through a section''s own link.',
   'agent',
   'Replaces APPROVAL_PAGE_SIZE = 50 in matrx-frontend features/approvals/data.ts; read live '
   'through ensureEffectiveKnob (the reader) and useEffectiveKnob (the sentence on screen).',
   date '2026-10-22', array['organization','user']::text[], 'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'assists' and level = 'feature')),

  ('data_tables.row_actions', 'max_actions',
   '24'::jsonb, '24'::jsonb, 'integer', 'actions', 1, 200,
   'Row action buttons one table may have',
   'How many one-click row actions a single data table can carry. Twenty-four is roughly what a '
   'row menu can offer before finding the right one costs more than doing the change by hand; a '
   'team that runs a table as an operations console may genuinely want more.',
   'agent',
   'Replaces MAX_ROW_ACTIONS = 24 in matrx-frontend features/data-tables/row-actions.ts '
   '(KNOB MIRROR: readRowActions is a synchronous pure function with a unit-test contract on the '
   'cap, called from render paths that cannot await). This row is the authority.',
   date '2026-10-22', array['organization']::text[], 'any', 'next_load',
   (select id from platform.taxonomy_node where slug = 'custom-data' and level = 'feature')),

  ('data_tables.row_actions', 'max_steps',
   '60'::jsonb, '60'::jsonb, 'integer', 'columns', 1, 500,
   'Columns one row action may change',
   'A row action is a recipe: press it and it sets several columns at once. This is how many '
   'columns one recipe may set. Sixty covers every column of a wide table; a lower number keeps '
   'an action small enough that a person can still predict what pressing it does.',
   'agent',
   'Replaces MAX_ROW_ACTION_STEPS = 60 in matrx-frontend features/data-tables/row-actions.ts '
   '(KNOB MIRROR: validateRowActions is a synchronous pure function that runs on every keystroke '
   'of the editor and cannot await). This row is the authority.',
   date '2026-10-22', array['organization']::text[], 'any', 'next_load',
   (select id from platform.taxonomy_node where slug = 'custom-data' and level = 'feature')),

  ('files.storage_sources', 'browse_page_size',
   '50'::jsonb, '50'::jsonb, 'integer', 'items', 10, 500,
   'Files listed per page when browsing connected storage',
   'When you browse a connected Drive, Dropbox, OneDrive or Box folder to import from, this is '
   'how many files and folders one page asks the provider for — and the number the "Load more" '
   'button promises. Organizations with very large folders usually want this higher; providers '
   'get slower per request as it grows.',
   'agent',
   'Replaces STORAGE_BROWSE_PAGE_SIZE = 50 in matrx-frontend features/files/storage-sources/'
   'service.ts; read live through ensureEffectiveKnob / useEffectiveKnob in the picker.',
   date '2026-10-22', array['organization','user']::text[], 'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'file-service' and level = 'feature')),

  ('seo.topical_map', 'history_page_size',
   '200'::jsonb, '200'::jsonb, 'integer', 'entries', 10, 1000,
   'History entries per page',
   'How many entries of a topical map''s change history one page shows, and the size of the step '
   'the Previous and Next buttons take. Two hundred is a long scroll on purpose: the history is '
   'read to find when something changed, which is faster in one page than in ten.',
   'agent',
   'Replaces PAGE_SIZE = 200 in matrx-frontend features/marketing/seo/topical-map/views/'
   'HistoryView.tsx; read live through useTopicalMapKnobs (the feature''s one knob reader).',
   date '2026-10-22', array['organization','brand','site','user']::text[], 'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'seo' and level = 'feature')),

  ('seo.topical_map', 'wanted_topic_limit',
   '20'::jsonb, '20'::jsonb, 'integer', 'topics', 1, 200,
   'Wanted topics listed per backlog',
   'After a mapping run, two short lists show the topics your pages asked for that the map does '
   'not have yet — the wanted ones and the ones held back. This is how many rows each list shows. '
   'Twenty is a glanceable backlog; the server will return up to two hundred.',
   'agent',
   'Replaces WANTED_TOPIC_LIMIT = 20 in matrx-frontend features/marketing/seo/topical-map/views/'
   'pages/runs/WantedTopicsPanel.tsx; read live through useTopicalMapKnobs.',
   date '2026-10-22', array['organization','brand','site','user']::text[], 'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'seo' and level = 'feature')),

  ('seo.topical_map', 'table_page_size',
   '100'::jsonb, '100'::jsonb, 'integer', 'rows', 10, 1000,
   'Topic table rows per page',
   'How many topics the table view of a map shows per page. A hundred fills a tall screen and '
   'still sorts and filters instantly; a very large map is easier to work through in bigger '
   'pages, a small one in smaller.',
   'agent',
   'Replaces PAGE_SIZE = 100 in matrx-frontend features/marketing/seo/topical-map/views/table/'
   'TopicTable.tsx; read live through useTopicalMapKnobs.',
   date '2026-10-22', array['organization','brand','site','user']::text[], 'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'seo' and level = 'feature')),

  ('surfaces.conversations', 'all_page_size',
   '30'::jsonb, '30'::jsonb, 'integer', 'conversations', 5, 200,
   'Past conversations listed on a surface',
   'Every screen that an agent can work on keeps a list of the conversations held there. This is '
   'how many the "All" tab loads at once. Thirty is a few weeks of ordinary use; somewhere busy '
   'may want more before the list has to be searched.',
   'agent',
   'Replaces ALL_PAGE_SIZE = 30 in matrx-frontend features/surfaces/components/chrome/'
   'SurfaceConversationsSection.tsx; read live through useEffectiveKnob.',
   date '2026-10-22', array['organization','user']::text[], 'any', 'instant',
   (select id from platform.taxonomy_node where slug = 'surfaces' and level = 'feature'))
on conflict (feature, key) do nothing;


-- EVERY ROW IS FILED. An unfiled knob lands in a bucket of the settings UI that
-- nobody navigates to on purpose, which is `check:settings-ladder-ui`'s FILED
-- check — so the migration refuses itself here rather than leaving ten
-- unreachable rows behind a green apply.
do $$
declare
  v_unfiled text;
begin
  select string_agg(feature || '.' || key, ', ' order by feature, key)
    into v_unfiled
  from platform.feature_knob
  where taxonomy_node_id is null
    and (feature, key) in (
      ('agents.samples', 'library_page_size'),
      ('agents.conversations', 'trash_page_size'),
      ('approvals', 'queue_page_size'),
      ('data_tables.row_actions', 'max_actions'),
      ('data_tables.row_actions', 'max_steps'),
      ('files.storage_sources', 'browse_page_size'),
      ('seo.topical_map', 'history_page_size'),
      ('seo.topical_map', 'wanted_topic_limit'),
      ('seo.topical_map', 'table_page_size'),
      ('surfaces.conversations', 'all_page_size')
    );
  if v_unfiled is not null then
    raise exception
      'SETTINGS-3: these knobs landed with no taxonomy node and would be unreachable in the settings UI: %',
      v_unfiled;
  end if;
end $$;
