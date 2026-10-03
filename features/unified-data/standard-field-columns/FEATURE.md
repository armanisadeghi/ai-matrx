# Standard-field columns — custom fields as list columns on any standard table

One generic source makes an organization's custom fields on a standard table (`custom.field` by
registry token, values in each row's `custom_fields`) into list columns that show, filter, sort,
group, search and export. Lane 7 STANDARD-TABLES wave 2 (T2.1/T2.2). Champion: HubSpot (a property
is a column and a filter at once, on every object); Salesforce list views.

## Wiring a standard list (three lines of intent)

1. Page: `const custom = useStandardFieldColumns<Row>("<token>", ctx.orgIds)`; spread
   `...custom.columns` into the `MatrxDataTable` columns; pass `custom.fields` back into the list's
   query hook (one render behind — the source needs the list's organizations first).
2. Filter bag: route `cf:<key>` column filters through `splitCustomFilters` /
   `customFiltersToTable` into `filters.custom`; saved views parse it with `parseCustomFieldFilters`.
3. Service: `applyCustomFieldFilters(q, f.custom, fields)` in the predicate builder,
   `customFieldSearchClauses(fields, term)` in the search `or()`, `customFieldOrderColumn(sort)`
   in the order. Group-by: `useStandardFieldGrouping({ source, rows, queryKey, countWith })` gives
   the table's `grouping` prop (groups read the RAW cell; counts are the whole result's).
   Columns: `columnState={standardColumnState(declaredIds, custom.columnIds, prefs, setPrefs)}` —
   kept in the list's own `useListViewPrefs` blob; custom columns start hidden.

Consumers: `/crm` (`party`), `/crm/deals` (`crm_deal`). Guard (behaviour, renders the real page):
`features/crm/components/__tests__/crm-list-offers-custom-fields.test.tsx`, red on a planted copy
with the source given no organizations.

## Rules

- Definitions come only through the store door `custom.entity_fields` (one call per organization
  the list spans, as the person). `confidential` / `restricted` fields, relation and formula fields
  are never columns.
- Every filter, sort and search is a PostgREST predicate on `custom_fields` — never a client pass
  over the loaded page. A Choice cell holds the option KEY (the store resolves every write to it —
  `custom._entity_choice_keys` from `custom._entity_custom_fields_guard`), and the Choice picker
  filters on keys, exactly.
- A group count that could not be read is said on its header; the page's number is never passed off
  as the group's.
- The organizations are the list's (the person's memberships), never the active organization.
- Export is the table's own toolbar export of the columns on screen.

## Not here yet

- RPC-backed standard lists (HR directory `hr_directory_list`) need a `p_custom` filter parameter in
  their RPC before they can mount the source.

## Change log

- 2026-10-02 — fix round 1: keys not spellings; grouping on raw cells (yes/no counted `true`);
  failed counts said; column choices persisted; options from the Field's own column; behaviour
  guard.
- 2026-10-02 — created (lane 7 W2): source, server group counts, CRM people + deals wired.
