-- reference_picker_common_types_knob — which kinds of thing the "Add a
-- reference" picker offers FIRST, and in what order.
--
-- WHY (Arman, 2026-09-11, on the system-wide reference inserter): "for users,
-- we'll need to split it up if it's gonna be a bunch of weird random things…
-- for the normal parts, things like chat or project or task or note or things
-- that users are used to, we'll need to make sure regardless of what they're
-- called, we go by that sort of name that they know. And then we can always
-- have, like, an advanced see more that gets… lets you get to all the rest."
--
-- "The normal parts" is a judgement about a given organization's work, not a
-- property of the platform: a law firm's normal is not a podcast studio's. Law
-- 6 (opinions become knobs) and
-- `common-docs/policies/limits-are-knobs-agents-set-them.md`: the curated tier
-- is a row here with an agent-chosen starting value and a dated review, never a
-- literal in the client. The "see more" half is NOT configurable — it always
-- lists every reference-pickable type from `platform.entity_types`, so no
-- setting of this knob can hide a type from a user who goes looking.
--
-- Starting value, and why: the eleven types a general AI Matrx user actually
-- names in their own sentences, ordered by how often a reference to one shows
-- up in text. Chat, Note, Task and Project lead because they are the four
-- things the product is used to make; File and Document follow because they are
-- what gets attached to those; Agent, Table, Workbook and Transcript close the
-- tier as the heavier artifacts; Web link is last because it needs no search.
-- Tokens are `platform.entity_types` tokens, not display labels — the picker
-- renames them for humans (`conversation` shows as "Chat", `udt_document` as
-- "Document", `dataset` as "Table") so the wire name can change without
-- touching what a user reads.
--
-- A token here that is not reference-pickable is skipped by the picker rather
-- than drawn broken, so pruning an entity type cannot break this list.
--
-- Idempotent (ON CONFLICT DO UPDATE on the metadata, never on `value`, so an
-- org's own curation in /administration/users/limits survives re-application).
-- Reversible: DELETE the row; the picker then shows every type grouped by
-- family with nothing collapsed, and says in the console why the curated tier
-- is absent (`lib/knobs/featureKnobs.ts` raises on a missing knob — no silent
-- code fallback).
--
-- Ledger: public._schema_migrations (source 'matrx-frontend').

INSERT INTO platform.feature_knob (
  feature, key, value, default_value, value_type, unit,
  label, description, set_by, basis, review_due,
  overridable_by, override_direction
) VALUES
(
  'platform.reference_picker', 'common_types',
  '["conversation","note","task","project","file","udt_document","agent","dataset","workbook","transcript","url"]'::jsonb,
  '["conversation","note","task","project","file","udt_document","agent","dataset","workbook","transcript","url"]'::jsonb,
  'json', NULL,
  'Add a reference — types offered first',
  'The kinds of thing the "Add a reference" picker shows up front, in this order, when someone inserts a reference from the right-click menu. Everything else stays one click away under "All types", which always lists every reference-pickable entity — this setting curates the shortcut, it never hides anything. Values are entity type tokens (for example "conversation", which people see as "Chat").',
  'agent',
  'Arman 2026-09-11 asked for the common things "regardless of what they''re called… by that sort of name that they know", with an advanced "see more" for the rest. The eleven starting tokens are the entity types a general user names in their own sentences; ordered by how often a reference to one appears in written text, with the four things the product is used to make first.',
  (current_date + 60),
  ARRAY['organization'], 'any'
)
ON CONFLICT (feature, key) DO UPDATE SET
  default_value      = EXCLUDED.default_value,
  value_type         = EXCLUDED.value_type,
  unit               = EXCLUDED.unit,
  label              = EXCLUDED.label,
  description        = EXCLUDED.description,
  basis              = EXCLUDED.basis,
  review_due         = EXCLUDED.review_due,
  overridable_by     = EXCLUDED.overridable_by,
  override_direction = EXCLUDED.override_direction,
  updated_at         = now();
