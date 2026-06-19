# Context-item drawer + registry

**Status:** live (2026-06-19). The single interactive detail surface for every resource/attachment chip shown on a chat turn.

## What this is

Every attachment a user sends with a turn renders as a chip in one of two places:

- **Pre-submit** — `inputs/resources/SmartAgentResourceChips.tsx` (resources still editable before send; `ManagedResource`).
- **Post-submit** — `messages-display/user/AgentUserMessage.tsx` (already sent; `RenderBlockPayload`).

Both now route every chip click through **one shared drawer** (`ContextItemDrawer`, built on `MatrxDynamicPanelHost`, right-positioned/resizable — same primitive as `ContextSlotDetailSheet`). This replaced the old per-message placeholder modal that just dumped `JSON.stringify(block.raw)` for every non-image type.

## The registry — the extension point

`registry.tsx` is THE source of truth for "what attachable types exist and how each renders in the drawer." Each `ContextItemTypeDef` = `{ blockTypes[], typeLabel, icon, themeKey, editable, Body }`.

**To give a type a custom UI:** add/extend a def with a dedicated `Body` component (in `bodies/`). Chips + drawer pick it up automatically. Unregistered types fall back to `GenericBody` (readable summary + collapsible raw payload — never a bare JSON dump).

| Body | Types | Editable |
|---|---|---|
| `NoteBody` | `input_notes` | yes (native `NoteContentEditor`) |
| `TaskBody` | `input_task` | yes (native `TaskEditor`) |
| `WorkingDocumentBody` | `working_document` | yes (native `WorkingDocumentPanel`) |
| `WebpageBody` | `input_webpage` | preview + live iframe |
| `DataBody` | `input_data` | preview |
| `MediaBody` | image/audio/video/document/youtube | view (via `InlineMediaRef`) |
| `GenericBody` | table/list/project/agent/app/transcript/workbook/document/text/editor_* + fallback | no (yet — extension targets) |

## Key flows

- **Normalization** (`normalize.ts`) — `ManagedResource` and `RenderBlockPayload` both flatten to `ContextDrawerItem[]`, **one item per underlying record**. So a "3 Notes" chip becomes 3 drawer items; prev/next + the bottom thumbnail rail page through each individually. A chip opens the drawer at its first item.
- **Editing** — note/task/working-document mount their canonical native editors, which self-persist to their own slices/DB.
- **Re-context** (`recontext.ts`) — an attachment is sent to the model only once. If the user edits an already-sent (`origin: "block"`) editable record, the drawer footer offers **"Send updated version"** → dispatches `addResource` so the edit reaches the agent on the next turn. The live **working document** needs no re-attach (it's a context entry re-sent every turn) — it's edited via the `ContextSlotDetailSheet`, which now renders the editable `WorkingDocumentPanel` for the `working_document` key instead of a read-only value dump.

## Invariants

- Never branch on type inside `ContextItemDrawer` — resolve the body via the registry.
- `input_document` (a reference to a specific rich doc) ≠ `working_document` (the live collaborative doc). Don't merge them.
- Each chip-host owns ONE local drawer controller (`useContextItemDrawer`); no global state/Redux added.

## Change log

- `2026-06-19` — claude: built the registry + shared drawer; wired both chip systems; killed the placeholder JSON modal; made notes/tasks/working-document editable in place; added re-attach-to-next-turn for edited attachments.
