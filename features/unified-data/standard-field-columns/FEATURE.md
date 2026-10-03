# Standard-field columns — custom fields as list columns on any standard table

One generic source makes an organization's custom fields on a standard table (`custom.field` by
registry token, values in each row's `custom_fields`) into list columns that show, filter, sort,
group, search and export. Lane 7 STANDARD-TABLES wave 2 (T2.1/T2.2). Champion: HubSpot (a property
is a column and a filter at once, on every object); Salesforce list views.

## Wiring a standard list

1. Page: `const custom = useStandardFieldColumns<Row>("<token>", ctx.orgIds)`; spread
   `...custom.columns` into the `MatrxDataTable` columns; pass `custom.fields` back into the list's
   query hook (one render behind — the source needs the list's organizations first).
2. Filter bag: route `cf:<key>` column filters through `splitCustomFilters` /
   `customFiltersToTable` into `filters.custom`; saved views parse it with `parseCustomFieldFilters`.
3. Service: `applyCustomFieldFilters(q, f.custom, fields)` in the predicate builder,
   `customFieldSearchClauses(fields, term)` in the search `or()`, `customFieldOrderColumn(sort)`
   in the order; a `fetch<X>WholeResult` over the same range reader (`readWholeResult`).
4. Group-by: `standardFieldGrouping({ source, columnId, onColumnIdChange })` gives the table's
   `grouping` prop; while a column is grouped the list reads its WHOLE result (one page), so which
   groups appear and their counts are the whole result's. Columns:
   `columnState={standardColumnState(declaredIds, custom.columnIds, prefs, setPrefs)}` — kept in the
   list's own `useListViewPrefs` blob; custom columns start hidden. Export:
   `copy.export = standardWholeResultExport({ columns, hidden, order, read })` — the table's one
   export menu, over the whole result.

Consumers: `/crm` (`party`), `/crm/deals` (`crm_deal`). Guard (behaviour, renders the real page):
`features/crm/components/__tests__/crm-list-offers-custom-fields.test.tsx`, red on a planted copy
with the source given no organizations.

## Rules

- Definitions come only through the store: `custom.entity_fields_across` (ONE call for every
  organization the list spans, Fields + choices, refusing organizations named under `unavailable`).
  Until that door is on a database (`lane7w2_b_*.sql`, chair's apply) the client answers
  `door_absent` and the source reads once per organization, saying so in the console.
  `confidential` / `restricted` fields, relation and formula fields are never columns.
- Every filter, sort and search is a PostgREST predicate on `custom_fields` — never a client pass
  over the loaded page. A Choice cell holds the option KEY (the store resolves every write to it —
  `custom._entity_choice_keys` from `custom._entity_custom_fields_guard`), and the Choice picker
  filters on keys, exactly.
- Grouping, export and the scope tabs never speak for one page: grouped and exported rows are the
  whole result (`readWholeResult`, ceiling = the store's knob `custom.export_rows_ceiling`; hitting it
  is said — "Grouped over the first N of M", "Exported the first N of M"). The CRM tabs count each
  lane with the list's own predicates whenever the query narrows by something
  `crm_list_scope_counts` cannot see (any column filter, custom filter, or a search reaching a
  custom field); per-organization counts are then absent, never another question's numbers.
- The organizations are the list's (the person's memberships), never the active organization.
- Export is the table's ONE toolbar export (design-system ≥ 0.55.0 async `sheetRows`): every row the
  current filters, search and sort select, projected onto the columns shown, in their order.

## Not here yet

- RPC-backed standard lists (HR directory `hr_directory_list`) need a `p_custom` filter parameter in
  their RPC before they can mount the source.

## Change log

- 2026-10-02 — fix round 2: export and grouping over the whole result (ceiling knob, said when hit);
  scope tabs count with the list's predicates; one fields read across organizations
  (`entity_fields_across`); SQL reads the options id from the Field's own key first.
- 2026-10-02 — fix round 1: keys not spellings; grouping on raw cells (yes/no counted `true`);
  failed counts said; column choices persisted; options from the Field's own column; behaviour
  guard.
- 2026-10-02 — created (lane 7 W2): source, server group counts, CRM people + deals wired.
