-- detail_presentation_by_type_knob — `ui.detail.presentation_by_type`, THE
-- per-record-type override of how a record's detail opens (the Detail
-- primitive, matrx-frontend `lib/detail`). A json object keyed by record type
-- token: {"file": "docked", "task": "page"}. Nearest rung wins, exactly like
-- its sibling `ui.detail.default_presentation`, and the map is read BEFORE the
-- default for the type being opened.
--
-- WHY IT EXISTS. PLAN §5.1 and Arman (2026-09-17) both ask for a per-record-
-- type override of the presentation setting, and Notion carries the same thing
-- per database ("Open pages in"). The `detail_presentation_knob.sql` header
-- explains why the platform's `table` rung (DD-131, precedence 50) could not
-- carry it: that rung is keyed by a `platform.entity_types` ROW ID, and
-- `platform.entity_types` is admin-only by a RESTRICTIVE policy, so a browser
-- cannot resolve the id — the rung would be a setting the screen offers and
-- the reader never honours (law 4's silent-setting class). One json key on the
-- ladder the client already reads is the override the settings platform
-- supports TODAY, with the same organization → user rungs.
--
-- READ PATH. `features/window-panels/detail/DetailHost.tsx` resolves this key
-- beside the default through `lib/scoped-config/sessionKnob.ts` →
-- `platform.knob_resolve`. Until this file is applied, `knob_resolve` RAISES
-- for the unregistered key by design; the host CATCHES that raise, warns once
-- per tab naming this file as the remedy, and the platform default answers —
-- never a silent loss of the override.
--
-- WRITE PATH. `lib/detail/core/DetailPresentationPane.tsx` (the foot of every
-- record detail) writes it at the person's own rung through
-- `platform.knob_override_set`, the platform door — `ui.` declares no door of
-- its own in `platform.knob_write_door`.
--
-- Filed under platform → surfaces beside `ui.detail.default_presentation`.
-- `instant`: a change applies to the next record opened, with no reload.
-- Idempotent: ON CONFLICT updates the metadata, never a value a human chose.
-- Reversible: DELETE the row; the per-type override then stops resolving and
-- every type opens as `default_presentation` says, loudly (see READ PATH).
-- Review due 2026-10-31.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, label,
   description, set_by, basis, review_due, overridable_by, override_direction,
   ui, taxonomy_node_id, propagation)
select
  'ui.detail', 'presentation_by_type', '{}'::jsonb, '{}'::jsonb, 'json',
  null::jsonb, 'Open specific record types as',
  'An exception to "Open record details as", one record type at a time: contracts as a full page, files in a docked panel, everything else the way you normally open records. Written from the record itself — open any record, then "How record details open" at the foot of it.',
  'agent',
  'Notion''s per-database "Open pages in" setting is the reference: the person sets a default once and overrides it for the kinds of record that deserve a different treatment. Arman 2026-09-17 asked for a per-record-type override of the presentation setting; PLAN §5.1 requires it.',
  date '2026-10-31', '{organization,user}'::text[], 'any',
  jsonb_build_object(
    'group', 'Record details',
    'order', 2,
    'control', 'json',
    'help', 'Keys are record types (file, task, project); values are window, docked or page. A type with no entry here opens the way "Open record details as" says.'
  ),
  (select n.id
     from platform.taxonomy_node n
     join platform.taxonomy_node d on d.id = n.parent_id
    where n.level = 'feature' and n.slug = 'surfaces'
      and d.level = 'domain'  and d.slug = 'platform'),
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
