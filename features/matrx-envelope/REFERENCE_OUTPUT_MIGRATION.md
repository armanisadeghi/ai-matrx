# Reference Output Migration — subagent playbook

**Goal:** every place in the codebase that produces a user-facing **bookmark / reference artifact** (a string the user copies, downloads, or sees in a "copy this" box) must emit the **canonical `matrx` reference fence**, never a hand-rolled bookmark JSON object.

A bare bookmark object (`{ type: "table_cell", table_id, ... }`) pasted into chat is just dead text. The canonical fence resolves to a **live reference chip** the agent can read and the user can open. Unifying the output is the whole point — see `docs/protocol/MATRX_REFERENCES.md` and `features/matrx-envelope/FEATURE.md`.

> Workflow code (`features/workflows/**`) is being deleted — **skip it**. It still consumes the legacy object shape programmatically and is not worth migrating.

---

## The one correct primitive

```ts
import { buildBookmarkReferenceFence } from "@/features/matrx-envelope/bookmarkToReference";

// one bookmark or an array; returns the ```matrx``` fence string
const fence = buildBookmarkReferenceFence(bookmark);
await navigator.clipboard.writeText(fence);
```

`buildBookmarkReferenceFence` accepts **canonical** bookmarks only (it maps bookmark `type` → reference `type` via `BOOKMARK_TYPE_TO_REFERENCE`). If the producer builds a legacy-shaped object, **fix the object first** (canonical type + field names) so the mapper recognizes it, then fence it.

### Canonical bookmark shapes (source: `@/types/python-generated/stream-events`)

| `type` | required identity fields | optional hints |
|---|---|---|
| `full_table` | `table_id` | `table_name` |
| `table_row` | `table_id`, `row_id` | `table_name` |
| `table_column` | `table_id`, `column_name` | `table_name`, `column_display_name` |
| `table_cell` | `table_id`, `row_id`, `column_name` | `table_name`, `column_display_name` |
| `full_list` | `list_id` | `list_name` |
| `list_group` | `list_id`, `group_id` | `list_name` |
| `list_item` | `list_id`, `item_id` | `label`, `description` |

`description` and other display strings ride along as non-authoritative hints — keep them if present, but the **identity ids are authoritative**.

---

## How to spot the targets

Two-step detection. Step 1 finds candidate files; step 2 confirms it's a real output site.

### Step 1 — find reference/bookmark CONSTRUCTION

```
# canonical + ancient type discriminators
rg -n "type:\s*['\"](full_table|table_row|table_column|table_cell|full_list|list_group|list_item|user_table|user_table_row|user_table_cell|picklist_ref)['\"]"

# legacy field-name drift (always a bug — see rename table below)
rg -n "field_display_name|field_name\s*:|item_label|list_item_id"
```

### Step 2 — confirm it reaches a user-facing OUTPUT

Within those files, the object must flow into one of:

```
# clipboard copy of a bookmark/reference object
rg -n "writeText\(\s*JSON\.stringify\(\s*(bookmark|reference|generate\w*Reference)"

# "copy this" textarea / readonly display of one
rg -n "value=\{JSON\.stringify\((bookmark|reference|generate\w*Reference)"
```

> ⚠️ A bare `writeText(JSON.stringify(x))` is **not** automatically a target — most are generic debug/JSON copies (config, stream events, query results). Only migrate when `x` is a **bookmark or reference** (it has, or is built from, a reference `type` discriminator above). When in doubt, trace the variable to its construction.

### Legacy field renames (fix at construction)

| Legacy field / type | Canonical |
|---|---|
| `type: "user_table"` | `type: "full_table"` |
| `type: "user_table_row"` | `type: "table_row"` |
| `type: "user_table_cell"` | `type: "table_cell"` |
| `field_name` (on a table cell/column ref) | `column_name` |
| `field_display_name` | `column_display_name` |
| `item_label` (list item) | `label` |
| `list_item_id` | `item_id` |
| `type: "picklist_ref"` envelope | route through `buildPicklistItemFence` / `translateLegacyPicklistRef` |

---

## Worked example (DONE — use as your template)

`components/user-generated-table-data/TableReferenceModal.tsx` — was the ancient encoding, now canonical:

```diff
- const generateCellReference = (rowId, fieldName, fieldDisplayName) => ({
-   type: 'user_table_cell',
-   table_id: tableId,
-   row_id: rowId,
-   field_name: fieldName,
-   field_display_name: fieldDisplayName,
-   description: `...`,
- });
- onClick={() => copyToClipboard(JSON.stringify(generateCellReference(...), null, 2), key)}
+ const generateCellReference = (rowId, fieldName, fieldDisplayName) =>
+   buildBookmarkReferenceFence({
+     type: "table_cell",
+     table_id: tableId,
+     table_name: tableName,
+     row_id: rowId,
+     column_name: fieldName,
+     column_display_name: fieldDisplayName,
+   });
+ onClick={() => copyToClipboard(generateCellReference(...), key)}
```

`TableReferenceOverlay.tsx` — already built canonical-typed objects; only the **output** changed (`JSON.stringify(ref)` → `buildBookmarkReferenceFence(ref)`), while the programmatic `onReferenceGenerated(object)` callback was left as-is for typed (workflow) consumers.

---

## Next target (NOT yet done — start here)

`features/user-lists/components/BookmarkCopyButton.tsx:29` — the single shared list-side copy button. One fix covers every list/group/item copy in the app:

```diff
- await navigator.clipboard.writeText(JSON.stringify(bookmark, null, 2));
+ await navigator.clipboard.writeText(buildBookmarkReferenceFence(bookmark));
```

(`bookmark: UserListBookmark` is already canonical — `list_id`/`item_id`/`label` — so no construction change is needed there.)

---

## Acceptance check per file

1. Output is a `matrx` fence string (starts with the fence open from `referenceFence.ts`), not a bare object.
2. The bookmark feeding `buildBookmarkReferenceFence` uses canonical `type` + identity field names (table above).
3. Any "paste into workflow nodes" copy/help text is updated to "paste into chat → live reference chip."
4. `pnpm type-check` clean; no new `JSON.stringify(<bookmark>)` output sites remain in the file.
5. Do **not** touch `features/workflows/**` or the legacy translation seam (`legacyTranslate.ts`) — that intentionally still reads old shapes loudly.
