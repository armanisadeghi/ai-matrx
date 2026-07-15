---
status: active
updated: 2026-07-13
repos: [matrx-frontend, aidream]
---

# Dimensional reference values — datasets & structured lists as containers with a settable dimension

A context-item (or agent-variable) value can reference a **container** and set a
**dimension** within it. Datasets and Structured Lists are the same shape. Backend
reference resolution for the static dataset dimensions already exists; the work is
frontend authoring, the net-new **dynamic filter**, agent **writeback**, and
reconciling the `feed_type='dataset'` naming collision.

## Vision — Arman's words

> "right now, we say that the VALUE is going to be a table. that means the entire table IS the value. But then, we might say, we have a table and a row (id) is the value. In this case, we DEFINE the exact table and when you set the value, you choose a row."

> "Or (similar to above) we pick the table and you set the filter, such as 'category' or type."

Two shapes he gave for the dynamic case:
```
{ "dataset_id": "<performance_review_table>",
  "filter": { "column": "employee_id", "op": "=", "value": "$scope.id" } }
```
```
{ "matrx_version": 1, "kind": "reference", "type": "table_row",
  "items": [ { "table_id": "<performance_review_table>", "row_id": "$scope.id" } ] }
```

On dataset scope (his answer):
> "Anything the actions already offer plus the Dynamic. remember that actions allow selection of the entire table, a row, a column or a cell. Let's not go away from the core but we will add the static column/enum, and the dynamic filter as you said."

On what "$scope.id resolution time" means:
> "be careful when we say 'At agent resolution time' -- what we mean is... anywhere the value is shown or needed, including agent resolution."

> "remember that agents need to be able to write to all of these as well so we'll have to do that as well."

On Structured Lists (his answer — the load-bearing reframe):
> "we are using one feature for two completely different things in this case. The way you have seen lists used is actually not the way they were originally created. A Structured list has two flavors.. a list of things such as a Grocery list or a list of employees. Alternatively, it can take on one more dimension and be a list of employees grouped by department or a list of things to buy from target and costco. It just so happens that structured lists also make good readonly dropdowns but they are not read only and before they were used for picking things, they were lists."

> "Naming: User Lists -> Picklist (horrible decision) -> Structured Lists"

> "the 'REAL' Way we use lists is the same [way] as any other reference. You can have a list as the value. The list could be grouped or not. Or you could specify a list and then have the group dimension be the element that is set, just like we said with category for a dataset. If you do this, you must have a grouped list and the group name would be the [filter]. And we will still retain the 'trick' we use to populate dynamic dropdowns from a list the user creates."

### The model (inferred, from the above)

A reference value has a **container** (dataset/table OR structured list) fixed on the
item **definition**, and a **dimension** set per scope (or dynamically):

| Container | Whole | Static sub-element | Dynamic |
|---|---|---|---|
| Dataset/table | whole table | row · column · cell | filter (`col op $token`) → row/cell |
| Structured List | whole list | group | grouped-list, group as filter |
| (retain) | | | list → read-only dropdown ("picklist" trick) |

- **Container is bound on the definition** ("we DEFINE the exact table"); the per-scope
  value picks the sub-element. Dynamic filter lives on the definition (no per-scope value).
- **Resolution runs everywhere the value is shown or needed** — UI display AND agent
  context (`resolve_full_context`), not only at agent time.
- **Agents must be able to write** every dimension (writeback path).

## Resources

- **System map (verified 2026-07-13):** reference/envelope + dataset + picklist — this handoff's tables came from it; re-verify before trusting.
- Reference cell system: `features/scopes/FEATURE.md` §"Context reference cells"; `features/scopes/utils/referenceCell.ts` (`CONTEXT_REFERENCE_TYPE_OPTIONS` = the authorable subset, currently EXCLUDES table/list dimensions), `features/scopes/components/reference/ReferenceValuePicker.tsx` (per-type sub-pickers: file/url/scope/RecordTypeAdder — no table/list-dimension picker), `ReferenceConfigFields.tsx`.
- Envelope taxonomy: `features/matrx-envelope/envelope.ts` — `REFERENCE_TYPES` already includes `table, table_schema, table_column, table_row, table_cell`, `structured_list, structured_list_group, structured_list_item` (+ legacy `picklist*` aliases). `TableRowRefItem {table_id, row_id}` at ~line 240.
- Datasets (udt tables, `table_id`): `features/data-tables/**` (service.ts, types.ts). Distinct from RAG data-stores (`data_store_id`, `features/rag/**`).
- Picklist binding today (context items already bind): `ContextItemSettingsForm` → `CustomComponentConfigurator` → `PicklistBindingEditor` (direct-entry mode; stores `custom_component.picklist`; filled value = `structured_list_item` fence via `VariableInputComponent`/`buildPicklistItemFence`).
- aidream reference system (STATIC dataset dims already done): `aidream/services/references/__init__.py` (ShapeSpecs for table/table_row/table_column/table_cell/table_schema, structured_list*), `items.py` (`TableRowRef`; `_ID_ALIASES={dataset_id→table_id, field_name→column_name}`), `resolvers.py` (`resolve_table_row` etc., RLS-gated), `user_data/dataset_reference_fetch.py` (`fetch_table_row`, `fetch_from_table_reference` dispatch), `services/action_catalog/catalog.py` (Tables: dataset/table_column/table_row/table_cell/table_schema).
- aidream dataset filter REST (exists, NOT wired to references): `aidream/api/routers/datasets.py:208` `POST /{dataset_id}/filter` → `services/datasets/service.py:537` `filter_rows(FilterRequest)`. Candidate engine for the dynamic filter.
- Agent writeback: `aidream/services/conversation_context/context_writeback.py` (`_CTX_ITEM_VALUE_COLUMN`, `_ctx_item_value_payload`).
- The value read path (must gain resolution): `resolve_full_context` (live DB fn; `feed_type='dataset'` branch reads `feed_config->>'data_store_id'` — a RAG store, the naming collision to reconcile).
- Test: `/organizations/<org>/scopes/<typeId>/<scopeId>` (scope detail — add/edit context items); login `admin@admin.com` / `Password1234#`.

## Remaining work

Ordered. Each item names its surface.

1. **Item-definition "bound source" config.** Decide storage (see Decisions) and add: `container_type` (dataset|structured_list), `container_id` (fixed table/list id), `dimension` (whole|row|column|cell|group), plus a `filter` predicate `{column, op, value}` for the dynamic case (value may be a `$scope.id`-style token). Whichever store, add to the item editor.
2. **Frontend authoring — static.** Add table/list dimensions to `CONTEXT_REFERENCE_TYPE_OPTIONS`; build the sub-pickers in `ReferenceValuePicker`: a **table picker** + **row / column / cell** selector, and a **list picker** + **group** selector. Container is fixed on the definition, so the value picker only chooses the sub-element. Emit the canonical fence (`table_row {table_id,row_id}`, etc.).
3. **Dynamic filter (net-new).** Definition-level `{container_id, filter:{column, op, value:"$scope.id"}}`. No per-scope value. A resolver substitutes the token and resolves the matching row/cell **wherever the value is shown or needed** — UI display component + `resolve_full_context`. Backend: likely a new reference type (e.g. `table_query`/`dataset_filter`) or a feed-config resolver reusing `datasets_service.filter_rows`.
4. **Structured-list parallel.** Whole-list-as-value + group-as-dimension (grouped list; group name is the filter), reusing the same authoring/resolution built for datasets. Keep the existing dropdown ("picklist") trick working.
5. **Agent writeback.** Extend `context_writeback.py` so an agent can write each dimension (set a row_id, a cell, a group) — validate against the bound container + dimension.
6. **Reconcile `feed_type='dataset'`.** Today it points at a RAG **data-store**, not a udt **table** — confusing given this feature. Decide whether the new table binding absorbs/renames it or they coexist with distinct names.
7. **Naming sweep (independent, low-risk):** UI "picklist" → "Structured List" wording (`PicklistBindingEditor`, labels). Product renamed User Lists → Structured Lists.

## Decisions needed

**Situation.** Reference *values* are stored as `matrx` fences in `value_text` (the envelope system, where `table_row` etc. already live). But this feature needs a *definition-level* binding — a fixed container id + dimension + (for dynamic) a filter predicate — that isn't a per-scope value. Two homes exist: the reference-config columns on the item (`allowed_reference_types`/`max_items`/`allowed_scope_type_ids`, extend with a new `reference_source` JSONB), OR the existing `feed_type`/`feed_config` columns (already carry a `'dataset'` feed type, but currently meaning a RAG data-store).
**Decide.** Store the bound-source config as (a) a new `reference_source` JSONB in the reference-config family (keeps values + binding in the envelope system; recommended), or (b) an extension of `feed_type='dataset'` + `feed_config` (requires resolving the RAG-store meaning first). This choice sets the DB + resolver shape for the whole feature.
