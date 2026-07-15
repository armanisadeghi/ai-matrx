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

On scope-to-scope references (Team Members reference Departments; self-reference for "Reports To"):
> "the ability for context item values to reference other scopes and possibly scope types, but probably scopes... Departments: Sales/Accounting/Marketing/Legal. Team Members: John/Jane. team members can have an assigned department. Name | Department | pay rate | Reports To -- John | department.sales | $100,000 | employees.jane doe"

**This already works in production** (see Done) — it is the existing `scope` reference
type (`allowed_reference_types:['scope']` + `allowed_scope_type_ids` to constrain to a
target scope type; self-reference = target type is the same type). It is another
container-type in the model below (`scope` / `scope_type`), and it is NOT new work —
only surfacing it as a first-class, discoverable authoring choice is.

On the employee-review use case (the driving example for the dynamic filter):
> "we will have an employee review system where the user gets a row in the reviews each time they get one and their context item for 'reviews' points to the table and with employee id = their id."

On data structure + immediate priority:
> "The concept is correct. The data structure is not but it will be something like this. For now, let's get the core information for the templates done." — i.e. ship the templates' core scope references first (Departments, Team Members: Department + Reports To), then the review-system dynamic filter.

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
| **Scope** (DONE) | a scope instance, constrained to a scope type (`allowed_scope_type_ids`); self-reference allowed; `max_items` for many | — | — |
| Scope type | a scope type as the value (`scope_type` ref; rarely needed) | — | — |
| (retain) | | | list → read-only dropdown ("picklist" trick) |

- **Container is bound on the definition** ("we DEFINE the exact table"); the per-scope
  value picks the sub-element. Dynamic filter lives on the definition (no per-scope value).
- **Resolution runs everywhere the value is shown or needed** — UI display AND agent
  context (`resolve_full_context`), not only at agent time.
- **Agents must be able to write** every dimension (writeback path).

## Reference taxonomy — the COMPLETE wishlist

Every kind of thing a context-item value can reference. `[DONE]` = works today;
`[author]` = backend resolves it, needs FE authoring; `[NEW]` = net-new.

**A. Target kinds**
1. Scope instance — a specific scope, constrained to a scope type; self-reference allowed (Reports To). `[DONE]`
2. Scope type — the dimension itself ("Departments"). `[author]` (backend `scope_type` ref exists)
3. Dataset — whole table. `[author]`
4. Dataset row — a specific row. `[author]` (`table_row`)
5. Dataset column — a column. `[author]` (`table_column`)
6. Dataset cell — one cell. `[author]` (`table_cell`)
7. Structured list — whole list. `[author]`
8. Structured list group — a group in a grouped list. `[author]`
9. Structured list item — pick one item (the dropdown/"picklist" trick). `[DONE]`
10. Other Matrx entity — file, url, note, document, agent, project, task, transcript, workbook, org, … `[DONE]`

**B. Binding mode** (orthogonal to target)
- Static — the value is picked per scope. `[DONE for scope/entity; author for dataset/list]`
- Dynamic — a filter resolves the element wherever the value is shown or needed (the reviews case). `[NEW]`

**C. Dynamic-filter token vocabulary** — the RHS of a filter; the load-bearing new decision. `[NEW]`
- `$scope.id`, `$scope.name`
- `$scope.<field_key>` — another context-item value on the SAME scope (in-place traversal: filter a table by the employee's Department value)
- `$user.id`, `$org.id`, `$project.id`, `$task.id`
- `$parent_scope.id` — nested scope types
- literal constants

**D. Filter operators** `[NEW]` — at least `=`; likely `!=`, `in`, `>`, `<`, `contains`, date-range.

**E. Cardinality** — single | many (`max_items`). `[DONE]`

**F. Advanced (decide in/out; flagged so a later data-model change isn't needed)**
- Cross-scope traversal (graph hop) — reference a FIELD on a referenced scope ("my Department's billing rate" = follow Department ref → read its Billing Rate cell). `[NEW]`
- Reverse references — the computed inverse ("who reports to me"); reverse index exists (`context_value_refs`), surfacing it as a value/display is new. `[NEW]`
- Aggregates over a dynamic filter — count/sum/avg of matching rows ("# of reviews", "avg score"). `[NEW]`

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

Ordered. Each item names its surface. The DB + FE data layer for `reference_source`
is DONE (see Done); everything below is authoring UI, resolution, and writeback.

1. **Authoring UI — the bound source.** In `ContextItemSettingsForm` (and `ContextItemAddForm` — its create path uses the `create_context_item` RPC, which needs a `p_reference_source` param added, unlike the edit path's direct `.update()`): when reference mode, let the author pick `container_type` (dataset/structured_list), pick the specific container (a **dataset/table picker** — see `features/data-tables/**`; a **structured-list picker** — `features/user-lists/**`), pick `dimension`, and for `column`/`cell` pick the column, for dynamic build the `filter`. Write `reference_source` via `updateContextItem` (already wired).
2. **Per-scope value picker — static.** In `ReferenceValuePicker` (or a new sibling), when the item's `reference_source` fixes a container + dimension, show ONLY the sub-element chooser (a **row picker** / **column picker** / **cell picker** for datasets, a **group picker** for grouped lists) scoped to the bound container. Emit the canonical fence: `table_row {table_id,row_id}`, `table_cell {table_id,row_id,column_name}`, `table_column`, `structured_list_group`. `ScopeContextRow.reference_source` already carries the binding to the field.
3. **Dynamic filter (net-new).** `reference_source.filter = {column, op, value:"$scope.id"}` → no per-scope value. A resolver substitutes the token and resolves the matching row/cell **wherever the value is shown or needed** — UI display (`ContextValueDisplay`) AND `resolve_full_context`. Backend likely a new reference type (`table_query`/`dataset_filter`) or a resolver reusing aidream `datasets_service.filter_rows` (`services/datasets/service.py:537`).
4. **Whole-container + structured-list parallel.** `dimension:"whole"` → the whole table/list is the value (emit a `table` / `structured_list` fence). Structured-list `group` dimension (grouped lists only; group name is the value/filter). Keep the existing list→read-only-dropdown ("picklist") trick working (`PicklistBindingEditor` path).
5. **Agent writeback.** Extend `aidream/services/conversation_context/context_writeback.py` so an agent can write each dimension (set a row_id, a cell, a group), validated against the item's `reference_source` container + dimension.
6. **Reconcile `feed_type='dataset'`.** Today it points at a RAG **data-store**, not a udt **table** — confusing given this feature. Decide whether the new `reference_source` dataset binding absorbs/renames it or they coexist with distinct names.
7. **Permanent model (Arman's caveat).** The `reference_source` JSONB is interim to ship fast. Revisit for the ideal permanent design — likely one or more dedicated tables — once the shape is proven in use.
8. **Naming sweep (independent, low-risk):** UI "picklist" → "Structured List" wording (`PicklistBindingEditor`, labels). Deprioritized by Arman ("has little to do with this").

## Done

- `reference_source` JSONB binding — DB column + read-RPC emission (`list_scope_type_items`, `get_scope_context`) + generated types + FE data layer (`ReferenceSource` type & helpers in `features/scopes/utils/referenceSource.ts`; threaded through `ContextItem`, `updateContextItem`, `ScopeContextRow`, cache patch). See `migrations/ctx_reference_source.sql`.
- **Scope-to-scope references already work end-to-end** (existing `scope` reference type, no new work) — verified in production on the `Matter` scope type: "Practice Area" → a Practice-Area scope, "Client (retaining party)" → a Client scope, stored as `{kind:reference,type:scope,items:[{id}]}` fences, `allowed_scope_type_ids` constrains the target type. Arman's Department/Reports-To (incl. self-reference) is this. Remaining for scopes: surface it as a first-class authoring choice (item 1) + confirm display resolves the scope name.

## Building blocks (spare the next agent a discovery pass)

- Structured-list listing: `getAccessibleLists()` (`features/user-lists/service.ts:41`); items via `getListWithItems`.
- Datasets: NO reusable picker exists — datasets are queried ad-hoc via `.from("udt_datasets")` (`app/(core)/organizations/[orgId]/tables/page.tsx:16`, `features/organizations/peek/kinds/DatasetPeek.tsx:31`). A dataset/field/row picker is net-new. Types in `features/data-tables/types.ts` (`Dataset`, `DatasetField`, `DatasetRow`).
- Reference resolution (frontend): `features/matrx-envelope/referenceResolvers.ts` (resolves `table_cell`, dataset refs, scope refs → display) — the display side hooks in here.
- Scope refs are authored via the existing `ReferenceConfigFields` (`allowed_reference_types:['scope']` + `allowed_scope_type_ids`) — no `reference_source` needed; keep that path.

## Storage decision (Arman, 2026-07-13) — INTERIM

Bound-source config lives in a new **`context_items.reference_source` JSONB** (the
reference-config family). **Arman's caveat, verbatim:**

> "I would prefer that we do it as the reference source jsonb, but then I need you to put in the handoff document that this was done in order to get through this quickly and have it set up and functional in the ui and with agents, but we need to look more closely to see the most ideal permanent solution, which is likely one or more tables. But for now, let's do it."

So: JSONB is the **ship-fast** representation to get this functional in the UI + with
agents. **Permanent model is unresolved — revisit for a proper table-based design
(one or more tables)** once the shape is proven. Do not treat the JSONB as final.

`reference_source` shape:
```
{ container_type: "dataset" | "structured_list",
  container_id:   "<table_id | list_id>",   // fixed on the definition
  dimension:      "whole" | "row" | "column" | "cell" | "group",
  filter:         { column, op, value: "$scope.id" }  // dynamic case only
}
```
