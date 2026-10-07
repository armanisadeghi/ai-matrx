# review-walk — the drill-down review walk (Dynamic Agent Graph S3, oversight surfaces)

A human walks DOWN from a bad AI output one layer at a time. Each layer shows
the whole turn — what the user sent, what the system added, what the agent
did — and EVERY item carries a **Flag** toggle (the agent's answer and
thinking included; any number can be flagged at once). One compact footer bar
drives the outcome:

- **Report** (`Report N flagged items` / `Report a problem`) → the report
  form (flagged items shown as chips, a required "what went wrong" line) →
  `POST /review/findings/from-walk` files a `hindsight.finding` (typed hop
  evidence, pinned snapshots, elevated assist — server side is aidream
  `services/review_descend/`, C-27/D-40). Fault placement falls out of the
  flags: exactly one flagged RECORDED input with a producer id pins the fault
  on that producer; anything else (none, several, agent-side parts) pins it
  on the walked unit. The flag summary rides the hop note.
- **"Trace where this came from"** (a quiet link on items whose producer the
  server declares walkable via `descend_ref`) → descends one layer down.
  Hops accumulate; breadcrumbs climb back up; flags reset per layer.

## What the agent answered, and runs that kept no chat (FX-W, 2026-09-30)

Every walk layer shows what the unit RECEIVED **and what it ANSWERED** — the
owner's "what the agent saw, what the agent responded".

- **`out.answer`** (server `DescendAnswer`) renders as **What the agent
  answered** (`AnswerSection` in `TurnDiagnosis.tsx`): the final text through
  the canonical `AnswerValueView` (a JSON answer as the structure it is, a
  `__kind` through its own component), earlier text/thinking folded, each tool
  call with what became of it (`ran` / `failed` / `Stopped before it ran` /
  `no record`). The turn view's final answer goes through the same view.
- **`out.transcript`**: `recorded_call` ⇒ one quiet line "Rebuilt from the
  recorded call — this run kept no chat" (the server rebuilt the user message,
  toolset and answer from the call's request snapshot); `none` ⇒ one line,
  nothing else.
- **A call candidate containment stopped is never a tool result the agent
  worked from.** The server moves it out of the inputs; the answer shows it
  open, with **Proposed arguments** and "Stopped before it ran". The turn view
  reads the tool row itself via `answer.ts` `isStoppedToolRow`.
- Guard: `__tests__/walkShowsTheAnswer.test.tsx` over REAL descend payloads
  captured from the clone (`__tests__/fixtures/descend-recorded-clone-2026-09-30.json`).

## Server contract

`GET /review/descend?unit_kind=&unit_id=` and
`POST /review/findings/from-walk`, mounted at prefix `/review` on aidream,
**user-scoped auth** (the conversation owner). All wire shapes are DERIVED
from `@ai-matrx/agents/generated/api-types` in `types.ts` — never
hand-mirrored; `pnpm sync-types` + type-check catches drift. The python-side
truth is `aidream/services/review_descend/types.py`.

Expected non-2xx outcomes are ANSWERS, rendered honestly in place (never an
error toast):

- **404** — unit is ephemeral / predates capture: "nothing was captured".
- **403** — the conversation (chat units) or workflow run (`wf_node_outcome`)
  belongs to someone else; a system-triggered run has no owner and is
  admin-only, and the server's sentence says which.
- `capturable: false` — inputs still render, with a banner explaining the
  exact wire payload (system prompt) can't be shown.

## Files

| File | Role |
|---|---|
| `answer.ts` | tool-call outcome words + `isStoppedToolRow` (candidate containment) |
| `types.ts` | contract aliases + walk state shapes (`WalkLayer`, `RecordedHop`) |
| `api.ts` | typed client (`descend`, `findingFromWalk`, `describeWalkError`) — same pattern as `features/hindsight/api.ts`, deliberately NOT merged into it (that file is admin-scoped and separately owned) |
| `turns.ts` | the TRUE-TURN model: folds the conversation (fetched DIRECT from Supabase via the canonical `fetchConversationBundle` + parsed through `parsePersistedMessageContent` — never a second parser) into turns: user message, context items, attachments, toolset, collab notes, and the agent's response parts (thinking / tool+result / text) in order. Provider framing (tool results as "user" messages) never reaches the UI |
| `components/ReviewWalkWindow.tsx` | the multi-instance floating window: TURN TABS at the root (switching re-roots the walk on that turn's assistant message), expand-all/collapse-all + Pretty↔Raw toggle, breadcrumb hop trail, layer header, footer action bar (flag count + Report), filing panel, receipt panel, collapsed bottom `TechnicalDetails` card (ALL identifiers live there — never in the header) |
| `components/TurnDiagnosis.tsx` | all presentation: `TurnDiagnosisView` (root chat layer — sections You sent / Context (N, collapsed) / Call setup / What the agent did / Also on this call), `GroupedInputsView` (deeper layers + non-chat units — descend inputs grouped the same way), `DiagCard` collapsible cards, pretty renderers (toolset chips, key-value args tables — JSON only in explicit Raw mode or for unknown payloads), the per-item `FlagToggle` (multi-select; flagged cards get an amber border) + the "Trace where this came from" link on walkable producers, `ConfidenceBadge` |
| `components/NegativeVerdictFollowUp.tsx` | the entry strip — renders ONLY while a negative verdict exists on the message: `[Diagnose] [Attach your version] [?]` as rounded pills matching the tap-button bar, with a help popover explaining both actions |
| `components/AttachVersionDialog.tsx` | O1 corrected-output editor → `captureCorrection` (`lib/output-feedback`) |

Display defaults: the user's message and the FINAL assistant text are expanded;
everything else (thinking, tools, context, setup) folds closed. Context is one
counted, collapsed group — context items are never presented as messages or as
"inputs the user gave". The turn model failing to load is an enhancement
failure only — the window falls back to `GroupedInputsView` over the descend
payload with an honest banner.
| `features/overlays/openers/reviewWalkWindow.tsx` | multi-instance opener hook; dispatches `openReviewWalk` |
| `address.ts` | the two identities in one place: instance id `review-walk\|{unit_kind}\|{unit_id}` and address `?panels=review_walk:<unitKind>.<unitId>` (+ parser, `isWalkUnitKind`, exhaustive over the server's `UnitKind`) |
| `openReviewWalk.ts` | the ONE open primitive (thunk) — opener and URL hydrator both use it, so the same unit already floating is focused (un-minimised + raised), never duplicated or overwritten |
| `walkTitle.ts` | the window title (`<role> · <detail> · <agent>` — e.g. `Live · Pair 3 · …` — else agent, else unit kind; 40-char budget; the labels ride the address and the saved window, a link without them falls back to the agent name) and `nextStackIndex` (lowest free cascade slot, so a new walk never lands on an open one) |

Overlay registration: `reviewWalkWindow` in
`features/overlays/catalogue.ts` (`multi`, window — its key is the overlay id), a gated multi-instance
block in `features/overlays/OverlayController.tsx` (accepts every `WalkUnitKind`, `wf_node_outcome`
included), a registry row `review-walk-window` in `features/window-panels/registry/windowRegistryMetadata.ts`
(multi; `mobilePresentation: "fullscreen"`; `urlSync.key: "review_walk"`; preserved on
`unitKind`+`unitId` (required) plus `agentId`/`agentName`/`roleLabel`/`detailLabel`), and the `review_walk` hydrator in
`features/window-panels/url-sync/initUrlHydration.ts`.

## Address (deep link + restore)

`?panels=review_walk:<unitKind>.<unitId>` — `unitKind` ∈ `assistant_message | agent_request |
wf_node_outcome`. Any surface that wants a "what the agent saw / what it answered" door emits this
token (or calls `useOpenReviewWalkWindow`). A reload restores the open walk from the local window
workspace; the walk's hops, flags and draft report are NOT preserved — a restore re-opens the unit's
root layer fresh. The window's labels ride the token's args —
`review_walk:<unitKind>.<unitId>:a-<agentId>_n-<agentName>_r-<role>_d-<detail>`, values
percent-encoded with `_` escaped (`address.ts` `reviewWalkUrlArgs` / `reviewWalkLabelsFromUrlArgs`)
— because the URL hydrator opens the walk BEFORE the local window workspace is read, and an open
window is never overwritten by that later read: a label only in the saved window was lost on
reload (FX-D2). A bare token still opens (agent-name, then unit-kind title). Guards:
`__tests__/reviewWalkAddress.test.ts`, `__tests__/walkTitleSurvivesReload.test.ts`.

## Entry points

Both assistant action bars render `NegativeVerdictFollowUp` directly under
the thumbs, as ONE coherent strip:

- `features/agents/components/messages-display/assistant/AssistantActionBar.tsx`
  (the live `/chat` bar) — passes `agentId` from
  `selectAgentIdFromInstance(conversationId)` so the receipt can door to
  `/agents/{id}/hindsight`.
- `features/cx-chat/components/messages/AssistantActionBar.tsx` — no agent in
  scope; the receipt falls back to the admin hindsight href.

Feedback state is READ from the ONE `lib/output-feedback` store
(`skipFetch: true`) — the strip never duplicates verdict state and never
issues a second fetch. Wiring table: `lib/output-feedback/FEATURE.md`.

## O1 — "Attach your version" (Engram §4.3)

Pre-filled with the AI output (or the existing correction when one is
attached — the button then reads "Your version (attached)" and reopens for
edit). Save calls `captureCorrection` → RPC →
`platform.output_feedback.corrected_content`; the frozen original rides along
automatically. Receipt copy: "Your version is saved — it becomes the
reference the system is judged against."

## Rendering doctrine

Input values render through the CANONICAL pipeline only: markdown → 
`MarkdownStream` (persisted mode, `isStreamActive={false}` — the same
EnhancedChatMarkdown → BlockRenderer route as streamed chat, so `__kind`
JSON payloads upgrade to their registered kind components automatically);
json → a fenced ` ```json ` block through the same pipeline; text → plain
text. Never a bespoke renderer. (`KindInstanceRender` was considered but its
contract is a *registered content-ir kind name* + record instance — the
descend inputs carry `text|markdown|json` shape hints, not kind names, so
`MarkdownStream` persisted mode is the correct canonical entry.)

## Doors (no-dead-ends inventory)

- `conversation_id` → `EntityRef token="conversation"` (`/chat/{id}`,
  new-tab: the walk floats over the user's current work).
- agent (receipt) → `EntityRef token="agent"` + improvement-workspace link
  `/agents/{agentId}/hindsight?enrollment=…&finding=…` (admin fallback
  `/administration/agents/hindsight?…` when no agent is in scope).
- snapshot ids → monospace short id + `CopyButton`. **No snapshot viewer
  surface exists in this repo** (inventoried: `captureInspectorWindow` is the
  client-side HTTP capture buffer, NOT server request snapshots; no other
  consumer of `runtime.request_snapshot` ids). Copy affordance + honest
  tooltip until a viewer ships.
- finding id → copy affordance + the workspace door above.

## Mobile

Expand/collapse instead of nested scroll areas; 44pt targets on all
answer/note controls; 16px inputs (no iOS zoom); the one scroll area is the
window body (`overflow-y-auto overscroll-contain pb-safe`). The dialog uses
the base `DialogContent` auto-bottom-sheet.

## Known limits

- `wf_node_outcome` descent is LIVE (2026-08-17, C-30 + C-27): a workflow step
  shows the exact arguments it was called with, a fan-in aggregate is one row
  per delivered item, and "inputs were wrong" hops down into the upstream step
  that produced the value. A step walk files its finding on the STEP (a
  `workflow_node` enrollment, lever `architecture`), not on an agent.
- The improvement-workspace door passes `?enrollment=&finding=` but
  `ImprovementWorkspace` does not yet read them (it lands on the agent's
  enrollment); deep-linking the exact finding is a follow-up on that surface.
