-- SETTINGS-3 — INVERSE (the DOWN migration) of
-- `migrations/campaign/settings3_ten_frontend_opinions_become_knobs.sql`.
--
-- WHICH IS WHICH: the file above (`migrations/campaign/…`) is the UP — it INSERTS
-- the ten `platform.feature_knob` rows. THIS file is the DOWN — it DELETES
-- exactly those ten rows and nothing else.
--
-- It puts a DEFECT back on purpose: with these rows gone, the ten values in
-- matrx-frontend are once again one engineer's opinion frozen into a deploy, and
-- the eight readers that resolve them live will report by name that the knob is
-- not seeded (`lib/scoped-config/effectiveKnobs.ts` and
-- `lib/knobs/featureKnobs.ts` both refuse to invent a number). That is the
-- correct behaviour for an inverse: it restores the previous state loudly, it
-- does not leave a quiet substitute behind.
--
-- It breaks nothing else doing it. No database function reads any of these ten
-- rows — they are read only from TypeScript — so
-- `platform.knob_delete_refuses_a_live_reader` has nothing to refuse, and every
-- other knob, override and taxonomy node is untouched. The overrides an
-- organization may have written against these keys go with them, by the
-- registry's own foreign key; re-applying the up restores the rows at their
-- platform defaults, not those overrides.

set lock_timeout = '3s';
set statement_timeout = '120s';

delete from platform.feature_knob
where (feature, key) in (
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
