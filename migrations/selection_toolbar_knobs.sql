-- The ONE selection toolbar (matrx-frontend components/selection-toolbar): which passage actions show
-- while someone is EDITING text versus READING it is registry data (SELECTION_ACTION_MODES); the one
-- taste call in that table is a knob.
--
-- Knob (organization, then person):
--   highlight_while_editing — show the five highlight colours in the toolbar while editing   default OFF
--
-- Default OFF: while writing, a selection is almost always about to be formatted or rewritten, and
-- Google Docs and Notion both keep highlighting out of their editing bubble (it lives in the reading /
-- comment surface). An organization that reviews by marking up drafts can turn it on.

insert into platform.feature_knob
 (feature, key, value, default_value, value_type, label, description, set_by, basis, review_due,
  overridable_by, override_direction)
values
 ('selection_toolbar', 'highlight_while_editing', 'false', 'false', 'boolean',
  'Show highlight colours while editing',
  'When you select text you are editing, the selection toolbar also offers the five highlight colours. Off: highlighting is offered while reading.',
  'agent', 'Google Docs and Notion keep highlighting out of the editing bubble: a selection made while writing is usually about to be formatted or rewritten.',
  current_date + 90, '{organization,user}', 'any')
on conflict (feature, key) do nothing;
