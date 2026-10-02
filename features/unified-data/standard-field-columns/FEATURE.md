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
   in the order. Group-by: `grouping` over `custom.groupableColumnIds`, `readCell` through
   `custom.labelOf`, true counts from `useServerGroupCounts` with the list's own count query.

Consumers: `/crm` (`party`), `/crm/deals` (`crm_deal`). Guard:
`__tests__/standard-lists-use-the-column-source.test.ts` (the list registry G1 will replace).

## Rules

- Definitions come only through the store door `custom.entity_fields` (one call per organization
  the list spans, as the person). `confidential` / `restricted` fields, relation and formula fields
  are never columns.
- Every filter, sort and search is a PostgREST predicate on `custom_fields` — never a client pass
  over the loaded page. A Choice filter matches the option key or its label (cells hold either).
- The organizations are the list's (the person's memberships), never the active organization.
- Export is the table's own toolbar export of the columns on screen.

## Not here yet

- RPC-backed standard lists (HR directory `hr_directory_list`) need a `p_custom` filter parameter in
  their RPC before they can mount the source.
- Column visibility does not persist across reloads on lists that do not persist table columns.

## Change log

- 2026-10-02 — created (lane 7 W2): source, server group counts, CRM people + deals wired.
