-- detail_list_context_max_knob — `ui.detail.list_context_max_ids`, the ceiling on
-- how many records of the list a detail was opened FROM may ride the page
-- presentation's URL (the Detail primitive, matrx-frontend `lib/detail`).
--
-- WHY IT EXISTS. The page presentation carries its list context in the query
-- string (`/detail/<type>/<id>?l=type.id,…&i=<n>`) so the arrows and `[` / `]`
-- keep moving between records after a record is opened as a page. That list was
-- UNCAPPED: a 500-row list produced a >20 KB href, past every practical
-- request-line limit, so the very link the primitive built could not be loaded
-- (VERIFY-U-P1-R2, NEW-7, reproduced against `encodeListQuery`). Beyond the cap
-- the URL now carries the WINDOW around the current record — the neighbours the
-- arrows can actually reach — and the detail SAYS the list was trimmed
-- (`?lt=<total>` → the line under the record's id), rather than presenting the
-- window as the whole list.
--
-- WHY A KNOB AND NOT A CONSTANT. It is a ceiling, and every ceiling on this
-- platform is a row an admin owns, with an agent-chosen starting value and a
-- dated review (`common-docs/policies/limits-are-knobs-agents-set-them.md`).
--
-- THE STARTING VALUE, 200, AND ITS BUDGET. Each entry is `type.id` — about 41
-- characters for a uuid — so 200 entries is ~8.4 KB of query string, and the
-- whole URL stays inside the ~16 KB request line the platform's edge accepts
-- while leaving an order of magnitude of headroom against the uncapped case. It
-- is also far more neighbours than a person steps through in one sitting. An
-- organization that ships longer working lists raises it; one behind a stricter
-- proxy lowers it. Review due 2026-10-31.
--
-- READ PATH. `features/window-panels/detail/DetailHost.tsx` (`detailPageHref`)
-- reads the cached session value through `lib/scoped-config/sessionKnob.ts` →
-- `platform.knob_resolve`, so building a href stays synchronous; the key is
-- warmed beside the two presentation keys. Until this file is applied
-- `knob_resolve` raises for the unregistered key, `getSessionKnob` logs that and
-- answers `undefined`, and `detailListContextMax` uses the module default of 200
-- — the cap is never absent, only unconfigurable.
--
-- Organization-overridable, not per user: a URL length limit is a property of the
-- deployment and its proxies, not a personal taste.
--
-- Filed under platform → surfaces beside `ui.detail.default_presentation` and
-- `ui.detail.presentation_by_type`. `instant`: the next href built uses the new
-- value. Idempotent: ON CONFLICT updates the metadata, never a value a human
-- chose. Reversible: DELETE the row; the client default answers.

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, min_value, max_value, label,
   description, set_by, basis, review_due, overridable_by, override_direction,
   ui, taxonomy_node_id, propagation)
select
  'ui.detail', 'list_context_max_ids', '200'::jsonb, '200'::jsonb, 'integer',
  10, 2000, 'Records carried in a detail link',
  'How many of the records from a list a shared or bookmarked record link can step through. Beyond this the link carries the records either side of the one it points at, and the record says the rest are not reachable from that link.',
  'agent',
  'A uuid entry costs ~41 characters of URL, so 200 entries is ~8.4 KB of query string — inside the request line every proxy in front of this platform accepts, with room for the rest of the URL. An uncapped 500-record list produced a >20 KB href no server would load (VERIFY-U-P1-R2, NEW-7). 200 is also far more neighbours than a person arrows through in one sitting.',
  date '2026-10-31', '{organization}'::text[], 'any',
  jsonb_build_object(
    'group', 'Record details',
    'order', 3,
    'control', 'number',
    'help', 'Lower this if a proxy in front of your deployment rejects long URLs; raise it if your people work from very long lists and step through them from shared links.'
  ),
  (select n.id
     from platform.taxonomy_node n
     join platform.taxonomy_node d on d.id = n.parent_id
    where n.level = 'feature' and n.slug = 'surfaces'
      and d.level = 'domain'  and d.slug = 'platform'),
  'instant'
on conflict (feature, key) do update
  set value_type = excluded.value_type,
      min_value = excluded.min_value,
      max_value = excluded.max_value,
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
