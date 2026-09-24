-- chair-step: it WRITES ROWS — the store's existing flag `kept_by_the_app: true` onto the document of every live Table the older facts already say a feature or the app keeps but which does not carry the flag yet, with `kept_for` beside it naming the feature those facts name (app, checklists, bookings, workflow, context, choices), so a reader of the document alone reads the same answer as custom.table_placement. An UPDATE of custom.record is in no enumerated additive shape, so the allow-list refuses it by name, correctly: this rewrites live Table records (measured on the clone 2026-09-23: 77 across 44 organizations — the app's saved views, comments, forms and dashboards tables, checklist steps, booking holds, workflow states, and the choice lists made before HUB-FIX stamped the flag). NOTHING IS REMOVED OR CHANGED: each document gains the key(s) custom.table_placement already answers for it, so every reader that asks the store reads the same placement before and after; this only writes the fact down for the readers that read the document itself (the records-ui table list, the agent tool, the mover). A table a person made for themselves, with no column using it as choices, is never touched. Idempotent: a second run changes nothing. Runs AFTER sc1p_each_table_says_who_keeps_it.sql.
-- lane: SC-1 PLACEMENT — the classification of the tables the store already keeps for its features and itself
-- lock: custom
--
-- THE USE CASE. Rincon Plumbing Co's hub counts 29 tables the app keeps — 13 "Crew choices",
-- 14 "Status choices" and its saved views — because the hub reads `kept_by_the_app` AND a slug
-- prefix. Every other reader (the table list in @ai-matrx/records-ui, the records agent tool, the
-- pickers) reads the flag alone, so a saved-views table or a checklist's steps sat among the
-- crew's own spreadsheets there. With this file the flag is on every table the app keeps.
--
-- WHAT IT DOES NOT TOUCH: kernel rows (placed by data_class, never by a key), any Table that
-- already carries the flag, and every Table the older facts do not say is kept.
--
-- The inverse is `migrations/inverse/sc1p_every_table_a_feature_made_says_so_down.sql`.

set local lock_timeout = '10s';
set local statement_timeout = '300s';

update custom.record r
   set data = r.data
              || jsonb_build_object('kept_by_the_app', true,
                                    'kept_for', custom.table_kept_for_derived(r.data, false,
                                      coalesce(custom.table_is_options_table(r.organization_id, r.id), false)))
 where r.table_id = custom.table_kernel_id()
   and r.data_class = 'table'
   and r.deleted_at is null
   and r.data ->> 'kept_by_the_app' is distinct from 'true'
   and not (r.data ? 'kept_for')
   and custom.table_kept_for_derived(r.data, false,
         coalesce(custom.table_is_options_table(r.organization_id, r.id), false)) is not null;
