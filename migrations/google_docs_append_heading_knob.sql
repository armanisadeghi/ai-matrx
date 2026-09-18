-- google_docs_append_heading_knob — `google.docs.append_heading`, the one row
-- behind the Append composer's stamp (PLAN §7, google-native; lane U-W1).
--
-- WHY A KNOB (Law 6, `common-docs/policies/limits-are-knobs-agents-set-them.md`):
-- whether a block added to someone's Google Doc wears a dated heading is taste
-- about their document, not logic about ours. A clinic appending visit notes
-- wants the date on every block; a marketing team appending copy into a draft
-- wants their document to read as one voice. Neither is wrong, so neither is
-- ours to decide.
--
-- Starting value `dated`, and why: PLAN §4.1 names it ("stamped with a dated
-- heading by default"). An append is irreversible from our side — we cannot
-- un-append — so the default is the one that leaves an audit trail a person can
-- find and delete in Google, rather than text that silently merges into theirs.
--
-- Overridable by organization AND by user: the person typing the block is the
-- one who knows what the document is for, and their organization may still set
-- the house style. `override_direction` stays `any` — neither value is safer in
-- a compliance sense.
--
-- THE OTHER DOCS KNOB IS NOT HERE. `google.refresh.on_open_min_age_seconds`
-- governs every Google record, not only Docs, and is seeded by
-- `migrations/google_calendar_agenda_knobs.sql` (lane U-W2). Two files seeding
-- one row is exactly the duplicate this comment exists to prevent.
--
-- READ PATH: `features/google-workspace/documents/knobs.ts` →
-- `lib/scoped-config/effectiveKnobs.ts` (`useEffectiveKnob` →
-- `platform.knob_resolve`), the same effective value the settings screen shows.
-- `knob_resolve` RAISES for an unregistered key by design; until this file is
-- applied the composer falls back to `dated` and the console says so once, with
-- this filename as the remedy — never a silent default.
--
-- Filed under integrations → google, where the live Google knobs already sit.
-- `instant`: a change applies to the next block composed, with no reload.
--
-- Idempotent: ON CONFLICT updates the metadata only, never a value a human
-- chose. Reversible: DELETE the row; the composer falls back to `dated` loudly.
-- Review due 2026-10-31.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, label,
   description, set_by, basis, review_due, overridable_by, override_direction,
   ui, taxonomy_node_id, propagation)
select
  'google.docs', 'append_heading', '"dated"'::jsonb, '"dated"'::jsonb, 'enum',
  '["dated", "none"]'::jsonb, 'Heading on text added to a Google Doc',
  'When you add text to the end of a Google Doc from AI Matrx, whether the block starts with a heading naming AI Matrx and the date. You always see the exact block before anything is added.',
  'agent',
  'PLAN §4.1 (google-native): the append is shown before it lands and stamped with a dated heading by default, because an append cannot be undone from our side and a dated heading is what makes it findable in Google.',
  date '2026-10-31', '{organization,user}'::text[], 'any',
  jsonb_build_object(
    'group', 'Google Docs',
    'order', 1,
    'control', 'segmented',
    'help', 'Dated adds a line like "Added from AI Matrx — 18 September 2026" above your text. None adds just your text. Your organization may set a default; your choice applies only to you.'
  ),
  (select n.id
     from platform.taxonomy_node n
     join platform.taxonomy_node d on d.id = n.parent_id
    where n.level = 'feature' and n.slug = 'google'
      and d.level = 'domain'  and d.slug = 'integrations'),
  'instant'
on conflict (feature, key) do update
  set value_type = excluded.value_type,
      allowed_values = excluded.allowed_values,
      label = excluded.label,
      description = excluded.description,
      basis = excluded.basis,
      review_due = excluded.review_due,
      overridable_by = excluded.overridable_by,
      override_direction = excluded.override_direction,
      ui = excluded.ui,
      taxonomy_node_id = excluded.taxonomy_node_id,
      propagation = excluded.propagation,
      updated_at = now();
