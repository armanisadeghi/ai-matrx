-- Source Control AI attachment limits (feature `code.source_control`).
--
-- AGENT-SET LIMIT (2026-09-12, blind approval): a snapshot may include both
-- index and working-tree diffs, plus untracked text. 100k characters per diff
-- preserves a substantial review while preventing one accidental generated
-- file from monopolising context; 20 untracked files / 100k total keeps an
-- attachment interactive. These are platform blast-radius controls, never
-- tenant preference, and must be reviewed after real Code-chat usage.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit,
   min_value, max_value, label, description, set_by, basis, review_due,
   overridable_by, override_direction)
values
  ('code.source_control', 'attachment_diff_characters',
   '100000'::jsonb, '100000'::jsonb, 'integer', 'characters', 1000, 1000000,
   'Maximum characters per Git diff attachment',
   'The maximum staged or unstaged diff text attached to one Code chat snapshot. Omitted tail content is reported explicitly.',
   'agent',
   'A 100k-character diff is about 25k tokens and covers a substantial code review; larger generated or vendored changes must be inspected by path instead of consuming one chat attachment.',
   current_date + 45, '{}', 'any'),
  ('code.source_control', 'attachment_untracked_file_characters',
   '25000'::jsonb, '25000'::jsonb, 'integer', 'characters', 1000, 250000,
   'Maximum characters per untracked file attachment',
   'The maximum text from any one untracked file included in a Code chat Git snapshot.',
   'agent',
   'A 25k-character file is enough for a typical source module while avoiding a single lockfile or generated artifact using the entire untracked budget.',
   current_date + 45, '{}', 'any'),
  ('code.source_control', 'attachment_untracked_total_characters',
   '100000'::jsonb, '100000'::jsonb, 'integer', 'characters', 1000, 1000000,
   'Maximum total untracked attachment characters',
   'The combined untracked text budget for one Code chat Git snapshot. Files outside it are named as omitted before content is read.',
   'agent',
   '100k characters is a generous review-sized total while keeping the snapshot bounded even when a repository has many new files.',
   current_date + 45, '{}', 'any'),
  ('code.source_control', 'attachment_untracked_file_count',
   '20'::jsonb, '20'::jsonb, 'integer', 'files', 1, 200,
   'Maximum untracked files read for a Git attachment',
   'The number of untracked files Source Control may inspect for one Code chat Git snapshot. Remaining paths are attached as documented omissions.',
   'agent',
   'Twenty source files is enough for a normal feature-sized working set; the cap prevents an untracked dependency tree from turning one attach action into an unbounded read fan-out.',
   current_date + 45, '{}', 'any')
on conflict (feature, key) do update set
  default_value = excluded.default_value,
  value_type = excluded.value_type,
  unit = excluded.unit,
  min_value = excluded.min_value,
  max_value = excluded.max_value,
  label = excluded.label,
  description = excluded.description,
  basis = excluded.basis,
  overridable_by = excluded.overridable_by,
  override_direction = excluded.override_direction,
  value = case when platform.feature_knob.set_by = 'human'
    then platform.feature_knob.value else excluded.value end,
  review_due = case when platform.feature_knob.set_by = 'human'
    then platform.feature_knob.review_due else excluded.review_due end;
