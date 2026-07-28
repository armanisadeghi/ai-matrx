---
status: active
updated: 2026-07-28
repos: [matrx-frontend, aidream]
vision: [features/content-ir/FEATURE.md, docs/SHAPE_SYSTEM.md]
---

# Dimensional reference values — datasets & structured lists as containers with a settable dimension

A context-item (or agent-variable) value references a **container** and sets a **dimension** within
it. Datasets and Structured Lists are the same shape. Backend reference resolution for the static
dataset dimensions already exists; the work is frontend authoring, the net-new **dynamic filter**,
agent **writeback**, and reconciling the `feed_type='dataset'` naming collision.

## Vision — Arman's words

**Everything routes through `content_ir` (the Shape System) — ONE canonical system, nothing else.**
> "all of our references need to use the already established content_ir structure so we have a single canonical system … our goal is for everything to use that one system and nothing else. If that structure directly works, then great!"

> "if for database purposes, we want to store a different version and then do a conversion, that's fine."

So: canonical = a `content_ir` kind; a storage projection (the ```matrx fence) is fine as long as it
converts. Reverse references and aggregates ALSO go through content_ir:
> "The key is to build that system so if we don't have those things and we can build them now, that's fantastic … but we can't get ahead of that system."

**Clickability rule (non-negotiable):**
> "all references must be linked to the thing they reference so that the user can open that thing with a window panel component … or click to open in a new tab (ideally both)"

Today's reference chips render via `MatrxEnvelopeBlock` (clickable); any NEW dataset/list/row
display MUST preserve this.

On the container/dimension model:
> "right now, we say that the VALUE is going to be a table. that means the entire table IS the value. But then, we might say, we have a table and a row (id) is the value. In this case, we DEFINE the exact table and when you set the value, you choose a row."

> "Or (similar to above) we pick the table and you set the filter, such as 'category' or type."

> "Anything the actions already offer plus the Dynamic. remember that actions allow selection of the entire table, a row, a column or a cell. Let's not go away from the core but we will add the static column/enum, and the dynamic filter as you said."

> "be careful when we say 'At agent resolution time' -- what we mean is... anywhere the value is shown or needed, including agent resolution."

> "remember that agents need to be able to write to all of these as well so we'll have to do that as well."

On the driving use case:
> "we will have an employee review system where the user gets a row in the reviews each time they get one and their context item for 'reviews' points to the table and with employee id = their id."

On scope-to-scope references:
> "the ability for context item values to reference other scopes and possibly scope types, but probably scopes... Departments: Sales/Accounting/Marketing/Legal. Team Members: John/Jane. team members can have an assigned department. Name | Department | pay rate | Reports To -- John | department.sales | $100,000 | employees.jane doe"

On Structured Lists (the load-bearing reframe):
> "we are using one feature for two completely different things in this case. The way you have seen lists used is actually not the way they were originally created. A Structured list has two flavors.. a list of things such as a Grocery list or a list of employees. Alternatively, it can take on one more dimension and be a list of employees grouped by department or a list of things to buy from target and costco. It just so happens that structured lists also make good readonly dropdowns but they are not read only and before they were used for picking things, they were lists."

> "the 'REAL' Way we use lists is the same [way] as any other reference. You can have a list as the value. The list could be grouped or not. Or you could specify a list and then have the group dimension be the element that is set, just like we said with category for a dataset. If you do this, you must have a grouped list and the group name would be the [filter]. And we will still retain the 'trick' we use to populate dynamic dropdowns from a list the user creates."

Two shapes he gave for the dynamic case:
```
{ "dataset_id": "<performance_review_table>",
  "filter": { "column": "employee_id", "op": "=", "value": "$scope.id" } }
```
```
{ "matrx_version": 1, "kind": "reference", "type": "table_row",
  "items": [ { "table_id": "<performance_review_table>", "row_id": "$scope.id" } ] }
```

On priority:
> "The concept is correct. The data structure is not but it will be something like this. For now, let's get the core information for the templates done."

**Storage caveat (verbatim) — the JSONB is INTERIM:**
> "I would prefer that we do it as the reference source jsonb, but then I need you to put in the handoff document that this was done in order to get through this quickly and have it set up and functional in the ui and with agents, but we need to look more closely to see the most ideal permanent solution, which is likely one or more tables. But for now, let's do it."

## The model (inferred)

| Container | Whole | Static sub-element | Dynamic |
|---|---|---|---|
| Dataset/table | whole table | row · column · cell | filter (`col op $token`) → row/cell |
| Structured List | whole list | group | grouped-list, group as filter |
| **Scope** (DONE) | a scope instance constrained by `allowed_scope_type_ids`; self-reference allowed; `max_items` for many | — | — |
| Scope type | a scope type as the value (rarely needed) | — | — |
| (retain) | | | list → read-only dropdown ("picklist" trick) |

Container is bound on the **definition**; the per-scope value picks the sub-element. Dynamic filter
lives on the definition (no per-scope value). Resolution runs **everywhere the value is shown or
needed** — UI display AND `resolve_full_context`.

**Dynamic-filter token vocabulary** (the load-bearing new decision): `$scope.id`, `$scope.name`,
`$scope.<field_key>` (another context-item value on the SAME scope), `$user.id`, `$org.id`,
`$project.id`, `$task.id`, `$parent_scope.id`, literals. Operators: at least `=`; likely `!=`,
`in`, `>`, `<`, `contains`, date-range.

**Advanced — decide in/out now so a later data-model change isn't needed:** cross-scope traversal
(follow a scope ref, read a field on it); reverse references (`context_value_refs` index exists,
surfacing it is new); aggregates over a dynamic filter (count/sum/avg).

## Remaining work

1. **Authoring UI — the generic bound source.** `ContextItemSettingsForm` today only writes the
   `dataset_template` branch. Add: pick `container_type` (dataset / structured_list), pick the
   container (**dataset/table picker** — `features/data-tables/**`; **structured-list picker** —
   `features/user-lists/**`), pick `dimension`, pick the column for `column`/`cell`, build the
   `filter` for dynamic. Mirror into the create path (`ContextItemAddForm`) — the
   `create_context_item` RPC already accepts `p_reference_source`.
2. **Per-scope value picker — static.** In `features/scopes/components/reference/ReferenceValuePicker.tsx`
   (or a sibling): when the item's `reference_source` fixes a container + dimension, show ONLY the
   sub-element chooser (row / column / cell picker for datasets, group picker for grouped lists)
   scoped to that container. Emit the canonical fence: `table_row {table_id,row_id}`,
   `table_cell {table_id,row_id,column_name}`, `table_column`, `structured_list_group`.
   `ScopeContextRow.reference_source` already carries the binding.
3. **Dynamic filter (net-new).** `reference_source.filter = {column, op, value:"$scope.id"}` → no
   per-scope value. A resolver substitutes the token and resolves the matching row/cell wherever
   the value is shown or needed — `ContextValueDisplay` AND `resolve_full_context`. Backend: a new
   reference type (`table_query`/`dataset_filter`) or a resolver reusing
   `aidream/services/datasets/service.py:537 filter_rows`.
4. **Whole-container + structured-list parallel.** `dimension:"whole"` → emit a `table` /
   `structured_list` fence. Structured-list `group` dimension (grouped lists only). Keep the
   list→read-only-dropdown trick working (`PicklistBindingEditor`).
5. **Agent writeback.** Extend `aidream/services/conversation_context/context_writeback.py` so an
   agent can write each dimension (row_id, cell, group), validated against the item's
   `reference_source` container + dimension.
6. **Reconcile `feed_type='dataset'`.** It points at a RAG **data-store**, not a udt **table**.
   Decide whether the new binding absorbs/renames it or they coexist with distinct names.
7. **Permanent model.** Revisit the JSONB for the ideal design (likely dedicated tables) once the
   shape is proven — see Arman's caveat above.
8. **Naming sweep (low-risk).** UI "picklist" → "Structured List". Deprioritized by Arman
   ("has little to do with this").

## Resources

- `features/scopes/utils/referenceSource.ts` — the `ReferenceSource` type + `parseReferenceSource`.
- `features/scopes/FEATURE.md` §"Context reference cells"; `utils/referenceCell.ts`
  (`CONTEXT_REFERENCE_TYPE_OPTIONS` — the authorable subset, still EXCLUDES table/list dimensions);
  `components/reference/{ReferenceValuePicker,ReferenceConfigFields}.tsx`.
- `features/matrx-envelope/envelope.ts` — `REFERENCE_TYPES` already has `table, table_schema,
  table_column, table_row, table_cell, structured_list, structured_list_group,
  structured_list_item` (+ legacy `picklist*` aliases). `TableRowRefItem {table_id,row_id}` ~L240.
- Frontend display resolution: `features/matrx-envelope/referenceResolvers.ts`.
- Datasets (udt tables, `table_id`): `features/data-tables/{service,types}.ts`. **No reusable
  picker exists** — datasets are queried ad-hoc via `.from("udt_datasets")`. A dataset/field/row
  picker is net-new. Distinct from RAG data-stores.
- Structured lists: `getAccessibleLists()` (`features/user-lists/service.ts:41`), `getListWithItems`.
- Picklist binding today: `ContextItemSettingsForm` → `CustomComponentConfigurator` →
  `PicklistBindingEditor` → `structured_list_item` fence via `buildPicklistItemFence`.
- aidream (static dataset dims already done): `services/references/{__init__,items,resolvers}.py`,
  `user_data/dataset_reference_fetch.py`, `services/action_catalog/catalog.py`.
- Test: `/organizations/<org>/scopes/<typeId>/<scopeId>`; login `admin@admin.com` / `Password1234#`.

## Done

- `context_items.reference_source` JSONB — column + read-RPC emission (`list_scope_type_items`,
  `get_scope_context`) + generated types + FE data layer (`referenceSource.ts`, threaded through
  `ContextItem`, `updateContextItem`, `ScopeContextRow`, cache patch).
- `create_context_item` RPC accepts `p_reference_source` (verified live).
- **Per-scope dataset templates** — `container_type:"dataset_template"` + `template_id` +
  `dimension:"whole"` + `provision:"per_scope"`; the DB provisions and schema-locks one dataset per
  scope via `context.scope_dataset_instances` (verified live); the stored cell is a normal
  `dataset` reference fence. Authoring wired in `ContextItemSettingsForm`.
- **Scope-to-scope references work end-to-end** (existing `scope` reference type) — verified in
  production on the `Matter` scope type; `allowed_scope_type_ids` constrains the target type;
  self-reference (Reports To) is this. Remaining: surface it as a first-class authoring choice
  (item 1) + confirm display resolves the scope name.
