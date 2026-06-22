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
| `BookmarkReferenceBody` | `input_table` / `input_list` | live reference chips (resolve from Supabase + open the entity), via `bookmarkToReference` |
| `GenericBody` | project/agent/app/transcript/workbook/document/text/editor_* + fallback | no (yet — extension targets) |

## Key flows

- **Normalization** (`normalize.ts`) — `ManagedResource` and `RenderBlockPayload` both flatten to `ContextDrawerItem[]`, **one item per underlying record**. So a "3 Notes" chip becomes 3 drawer items; prev/next + the bottom thumbnail rail page through each individually. A chip opens the drawer at its first item.
- **Editing** — note/task/working-document mount their canonical native editors, which self-persist to their own slices/DB.
- **Re-context** (`recontext.ts`) — an attachment is sent to the model only once. If the user edits an already-sent (`origin: "block"`) editable record, the drawer footer offers **"Send updated version"** → dispatches `addResource` so the edit reaches the agent on the next turn. The live **working document** needs no re-attach (it's a context entry re-sent every turn) — it's edited via the `ContextSlotDetailSheet`, which now renders the editable `WorkingDocumentPanel` for the `working_document` key instead of a read-only value dump.

## Invariants

- Never branch on type inside `ContextItemDrawer` — resolve the body via the registry.
- `input_document` (a reference to a specific rich doc) ≠ `working_document` (the live collaborative doc). Don't merge them.
- Each chip-host owns ONE local drawer controller (`useContextItemDrawer`); no global state/Redux added.
- **Attachments ≠ context (load-bearing UI rule).** User-attached resources (`input_notes`, files, tasks, …) render ONLY as attachment chips from `content[]`. Ambient / slot context (`model_context.items`, working document, org, declared slots) renders ONLY in `ContextSlotChipStrip`. Never merge `model_context.input_items` into the context strip — that field mirrors attachments for the server/audit trail; duplicating it in the UI showed notes twice and made attachments look like defer-fetch context.

## Layout contract (non-negotiable)

The panel must be hyper-focused — ~all space usable. Enforced by structure:

- **Title bar** (`MatrxDynamicPanelHost`): icon + record title (bodies report it via `setTitle`) + prev/next icon controls + close. **No description line.**
- **Body**: fills 100% of remaining height (`h-full`/flex). **No in-body header, no repeated title/type, no large buttons.**
- **Footer** (registry `Footer`, optional): ONE thin row (`h-9`) for links / lists / inline meta + icon-only actions with tooltips. All "open / copy / re-attach / view-diff" affordances live here.

If you find yourself adding a header or a tall block inside a body, stop — it goes in the footer or the title bar.

## Working document

Shown as a differentiated **"Context"** chip in the input strip whenever it's enabled (ring + primary tint — context, not a one-off attachment), and joins the drawer nav list. Its body is the native editor (`ProTextarea`, full height) with a footer **GitCompare** toggle (lights up + dot when the agent made an unseen edit) that swaps to the canonical `DiffViewer` (light engine / highlight view) fed by `useWorkingDocChanges` — reusing Scribe's diff stack. Only the Body mounts `useWorkingDocument`; the Footer reads a tiny shared store so the realtime channel / context-sync effects aren't double-mounted.

## Change log

- `2026-06-22` — claude: **note drawer gets view-mode controls; attachments no longer duplicate in context strip.** `NoteTitleActions` + `NoteViewControls` in the drawer title bar (Edit / Split / Rich / MD Split / Preview + history). `AgentUserMessage` stopped rendering `model_context.input_items` in `ContextSlotChipStrip` — attachments belong exclusively on the attachment chip row.
- `2026-06-22` — claude: **fixed empty drawer when clicking sent note/task chips.** Post-submit bubbles passed raw `MessagePart[]` straight into the drawer normalizer; `AgentUserMessage` now runs `normalizeContentBlocks` first. `normalize.ts` accepts `{ id }` ResourceRefInput objects; `NoteBody` prefetches on open.
- `2026-06-19` (2) — claude: **layout overhaul + working-document chip/diffs.** Full-height bodies; single compact icon-only footer (`Footer` added to the type def + `resolveContextItemFooter`); dynamic title via `setTitle`; dropped the bottom thumbnail rail and all descriptions. Documents/webpages/youtube now fill height (iframe via resolved `useFileSrc`). Working document surfaces as a pre-submit "Context" chip and gets an in-drawer edit↔diff toggle.
- `2026-06-19` — claude: built the registry + shared drawer; wired both chip systems; killed the placeholder JSON modal; made notes/tasks/working-document editable in place; added re-attach-to-next-turn for edited attachments.
