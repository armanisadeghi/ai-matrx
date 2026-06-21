# Bookmark Export Coverage — what gets a "copy reference," and at what granularity

**Status:** planning spec for a follow-up agent. Nothing here is implemented yet except where the "Today" column says so.

## What an "export bookmark" is

A small UI affordance ("copy reference" / bookmark button) on an entity that copies the **canonical `matrx` reference fence** for it. Pasted into chat it resolves to a **live reference chip** the agent reads — the backend re-fetches the live value each turn from the ids, never the value. The artifact is always built with `buildBookmarkReferenceFence(...)` (`features/matrx-envelope/bookmarkToReference.ts`). Never hand-roll JSON. See `docs/protocol/MATRX_REFERENCES.md` and `features/matrx-envelope/REFERENCE_OUTPUT_MIGRATION.md`.

The goal of this doc: decide **which entities qualify** for an export bookmark, and **how many "dimensions"** (granularities) each one needs.

---

## The core idea: dimensions

Some entities are **atomic** — there's one thing to point at (a note, a task). One bookmark = one dimension.

Some entities are **compound** — they contain addressable sub-parts, and the user may want the agent focused on the whole *or* on a specific part. Each level the user could reasonably mean is a **dimension**, and **a compound entity needs a bookmark for every dimension or it's broken** — if you can't point at the row you mean, the feature half-works and confuses everyone.

The table is the worked example: it has **4 data dimensions** today and is **missing a 5th** (see below).

---

## Simple rules

1. **Qualifies?** An item gets an export bookmark only if it is a **persistent Matrx entity with a stable id the backend can re-resolve live.** Ephemeral / external things (a pasted URL, a YouTube link, an uploaded raw file with no record) do not — those are *attachments*, not references.
2. **How many dimensions?** Provide one bookmark per level a user would meaningfully ask the agent to focus on:
   - Atomic entity → 1 (the whole thing).
   - Container → the whole **plus every addressable sub-part** (row/column/cell, group/item, sheet/section, segment…).
3. **Completeness rule.** For a compound entity, ship **all** its dimensions together or none — a partial set (e.g. table without `table_cell`) is a defect, not a milestone.
4. **Add the "definition/schema" dimension** for any entity whose *structure* is itself useful context independent of its data (tables; arguably workbooks). The agent often needs the shape to act, not the rows.
5. **When in doubt, look at the facts and decide.** Most entities below have at least one judgment call (does a note need section-level? does a transcript need segment-level?). Default to the **whole-entity** bookmark first; add sub-dimensions only where there's a concrete "I want the agent on *just this part*" use case. Record the decision in this doc.
6. **New dimension = cross-repo work.** Any new reference type needs, in lockstep: a backend Pydantic item model + resolver (Python), a frontend resolver in `referenceResolvers.ts`, a chip icon in `registry.tsx`, and the producer UI. A frontend-only bookmark that the backend can't resolve is dead.

---

## The table — 4 dimensions today, needs a 5th

Reference/bookmark types that exist now (`features/matrx-envelope/envelope.ts` + generated wire bookmarks):

| Dimension | bookmark `type` | reference `type` | required ids |
|---|---|---|---|
| Whole table (data) | `full_table` | `table` | `table_id` |
| One column | `table_column` | `table_column` | `table_id`, `column_name` |
| One row | `table_row` | `table_row` | `table_id`, `row_id` |
| One cell | `table_cell` | `table_cell` | `table_id`, `row_id`, `column_name` |

**Missing 5th dimension — the table definition / schema.** `full_table` resolves to *data* (rows). There is no way to reference the table's **structure**: column names, data types, required flags, order, descriptions — with no row data. The agent frequently needs the shape (to write rows, validate input, transform, or explain the table) without dragging the data.

**Proposed:** add a `table_schema` bookmark + `table_schema` reference type.
- required id: `table_id`
- resolves to: the field/column definition set (name, display_name, data_type, is_required, field_order, description) — **no rows**.
- needs: backend Pydantic model + resolver, frontend resolver entry, chip icon, and a "Copy schema reference" affordance in the table reference UI (`components/user-generated-table-data/TableReference*`).

So the table becomes **5 dimensions**: schema + full + column + row + cell.

---

## The list / picklist — 3 dimensions (complete today)

| Dimension | bookmark `type` | reference `type` | required ids |
|---|---|---|---|
| Whole list | `full_list` | `picklist` | `list_id` |
| One group | `list_group` | `picklist_group` | `list_id`, group key |
| One item | `list_item` | `picklist_item` | `list_id`, `item_id` |

Export exists today via the shared `BookmarkCopyButton` (covers ListItem / GroupSection / ListMetaHeader). *(Open question to confirm later: does a list also want a "definition" dimension, or is a list structurally trivial enough that `full_list` is the schema? Lean: trivial, no schema dimension needed.)*

---

## Coverage catalog — every candidate entity

Source of truth for the entity set is the `Resource` union (`features/prompts/types/resources.ts`). "Today" = does an export-bookmark (copy-fence) affordance exist now.

| Entity | Class | Proposed dimensions | Today | Notes / judgment |
|---|---|---|---|---|
| **Table** (user data table) | compound | schema, full, column, row, cell (**5**) | data 4/5 ✅, schema ❌ | Add `table_schema`. Reference UI already exists. |
| **List / picklist** | compound | full, group, item (**3**) | ✅ | Complete. Schema dimension: likely unnecessary. |
| **Task** | atomic | whole task (**1**) | ❌ | Whole task only. A single task *field* bookmark is over-engineering — skip unless a real need shows up. |
| **Project** | atomic→container? | whole project (**1**); maybe "project's tasks" | ❌ | "Project tasks" is a *query*, not a bookmark dimension — keep to whole-project. |
| **Note** | atomic, maybe compound | whole note (**1**); possibly note section/heading | ❌ | **Judgment:** notes are long rich docs. A section-level reference has a real use case. Start with whole-note; flag section-level as a fast follow. |
| **Agent** | atomic | whole agent definition (**1**) | ❌ | Bookmark = the agent definition/config. |
| **Agent app** | atomic | whole app (**1**) | ❌ | — |
| **Transcript** | compound | whole transcript (**1**); **segment / time-range** (**+1**) | ❌ | **Strong case for segment-level** (point the agent at one passage / speaker turn / timestamp range). Likely 2 dimensions. |
| **Transcript session** | container | whole session (**1**); a transcript within (**+1**) | ❌ | A session holds multiple transcripts; "this transcript in the session" is a dimension. |
| **Workbook** | compound | whole workbook (**1**); **sheet** (**+1**); cell? | ❌ | A sheet is table-like — if we go to cell level it mirrors the table dimensions. Start: workbook + sheet. |
| **Document** | compound | whole document (**1**); **section / page** (**+1**) | ❌ | PDF/long doc → page or section reference is meaningful. Judgment on section vs page. |
| **File** | atomic / page | whole file (**1**); page (PDFs) | ❌ | Most files are atomic; PDFs may want a page dimension (overlaps Document). Decide once for the file↔document overlap. |
| **Webpage** | external | — | n/a | A URL is the reference; not a Matrx entity to resolve live. **Attachment, not bookmark.** |
| **YouTube** | external | — | n/a | Same — attachment. |
| **Image URL / File URL / Audio (url)** | external | — | n/a | External media; attach, don't bookmark. |
| **Scope / context layer** (org, scope, project, task as context) | compound | a scope; a context item; a value | ❌ | Separate system (`features/scopes`). A "reference to a scope" is plausible future work — decide with the scopes owner. Out of scope for the first pass. |

---

## Judgment framework for the ambiguous ones

For each entity with a "?" or sub-dimension above, answer three questions and record the decision here:

1. **Is there a concrete "focus the agent on just this part" use case?** No → whole-entity only.
2. **Can the backend resolve that sub-part from stable ids?** No → not yet (needs ids first).
3. **Does the sub-part overlap an entity we already model?** (file page ↔ document page; workbook cell ↔ table cell) → reuse the existing dimension shape, don't invent a parallel one.

---

## Work breakdown for the implementing agent

1. **Tables:** add the `table_schema` dimension end-to-end (BE model + resolver, FE resolver, chip icon, "Copy schema reference" in the table reference UI).
2. **Atomic entities** (task, project, note, agent, agent_app): add a whole-entity reference type + resolver + a "copy reference" affordance on each entity's primary surface. One new reference type each.
3. **Compound entities** (transcript±segment, transcript_session, workbook±sheet, document±section): decide dimensions per the judgment framework, then implement whole-entity first.
4. **Externals** (webpage/youtube/image/file urls): explicitly **no bookmark** — leave as attachments.
5. Every new reference type updates: `envelope.ts` (`REFERENCE_TYPES`), `referenceResolvers.ts`, `registry.tsx` (icon), the backend (Pydantic model + resolver), and this doc's "Today" column.

**Do not** create a parallel copy primitive — every export routes through `buildBookmarkReferenceFence`. **Do not** ship a frontend bookmark whose backend resolver doesn't exist yet.
