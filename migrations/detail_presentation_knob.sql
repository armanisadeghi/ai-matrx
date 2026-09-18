-- detail_presentation_knob — `ui.detail.default_presentation`, the ONE setting
-- behind how a record's detail opens on the platform (the Detail primitive,
-- matrx-frontend `lib/detail`): `window` (default), `docked` (a resizable
-- side panel), or `page` (a full route).
--
-- WHY A KNOB (law 6 — opinions become knobs). How a record opens is taste, not
-- logic. Notion carries it as a per-database "Open pages in" setting (side
-- peek / center peek / full page) and Linear as a per-person preference; here
-- the organization sets the default and a person may choose for themselves.
-- Arman, 2026-09-17: "a core component that then shows up as a Page, a
-- flexible drawer, and a window panel. The default is the window."
--
-- READ PATH. `lib/detail/useOpenDetail.ts` resolves this key through the ONE
-- ladder-resolved client read (`lib/scoped-config/sessionKnob.ts` →
-- `platform.knob_resolve`, organization → user → device, nearest wins).
-- `knob_resolve` RAISES for an unregistered key by design; until this file is
-- applied every opener falls back to `window` and SAYS SO in a toast naming
-- this key — never a silent default.
--
-- PER RECORD TYPE. The brief asked for a per-record-type override. The
-- platform's rung for that is `table` (DD-131, precedence 50, keyed by a
-- `platform.entity_types` row id), but the client cannot address it yet: the
-- published entity metadata (`@ai-matrx/associations` ENTITY_TYPE_METADATA)
-- carries no row id, so a `table` rung declared here would be a setting the
-- screen offers and the reader never honours — the exact silent-setting class
-- law 4 forbids. `overridable_by` therefore names organization and user only;
-- add `table` in the same change that teaches the reader the entity id.
--
-- Filed under platform → surfaces, beside `tables.density.mode` (the same
-- "how a shared surface presents" family; taxonomy resolved by slug, never a
-- pasted uuid). `instant`: a change applies to the next record opened, with
-- no reload.
--
-- Idempotent: ON CONFLICT updates the metadata, never a value a human chose.
-- Reversible: DELETE the row; openers then fall back to `window` loudly.
-- Review due 2026-10-31. Applied by the google-native chair through the
-- Supabase MCP and captured in public._schema_migrations (source
-- 'matrx-frontend').

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, label,
   description, set_by, basis, review_due, overridable_by, override_direction,
   ui, taxonomy_node_id, propagation)
select
  'ui.detail', 'default_presentation', '"window"'::jsonb, '"window"'::jsonb, 'enum',
  '["window", "docked", "page"]'::jsonb, 'Open record details as',
  'How a record''s details open when you click it anywhere on the platform: a floating window you can move and dock to the tray, a panel docked to the side of what you are working on, or a full page. The same content shows in all three, and every one offers the other two.',
  'agent',
  'Notion''s per-database "Open pages in" setting (side peek / center peek / full page) and Linear''s peek are the reference; Arman 2026-09-17: "The default is the window."',
  date '2026-10-31', '{organization,user}'::text[], 'any',
  jsonb_build_object(
    'group', 'Record details',
    'order', 1,
    'control', 'segmented',
    'help', 'Window keeps you where you are and can be minimized to the tray. Docked sits beside your work and resizes. Page takes the whole screen. Your organization may set a default; your choice applies only to you.'
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
