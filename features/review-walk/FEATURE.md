# review-walk — the drill-down review walk (Dynamic Agent Graph S3, oversight surfaces)

A human walks DOWN from a bad AI output one layer at a time. Each layer shows
the unit being inspected, the provider call that produced it, and every input
that call received — and asks ONE question: **"are these inputs correct?"**
Two verb-labeled answers:

- **"These inputs are fine — the fault is HERE"** → files a
  `hindsight.finding` at this layer via `POST /review/findings/from-walk`
  (typed hop evidence, pinned snapshots, elevated assist — server side is
  aidream `services/review_descend/`, C-27/D-40).
- per-input **"This input is wrong"** → descends into that input's producer
  (`descend_ref`) and asks the same question one layer down. Hops accumulate;
  breadcrumbs climb back up.

## Server contract

`GET /review/descend?unit_kind=&unit_id=` and
`POST /review/findings/from-walk`, mounted at prefix `/review` on aidream,
**user-scoped auth** (the conversation owner). All wire shapes are DERIVED
from `types/python-generated/api-types.ts` in `types.ts` — never
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
| `types.ts` | contract aliases + walk state shapes (`WalkLayer`, `RecordedHop`) |
| `api.ts` | typed client (`descend`, `findingFromWalk`, `describeWalkError`) — same pattern as `features/hindsight/api.ts`, deliberately NOT merged into it (that file is admin-scoped and separately owned) |
| `turns.ts` | the TRUE-TURN model: folds the conversation (fetched DIRECT from Supabase via the canonical `fetchConversationBundle` + parsed through `parsePersistedMessageContent` — never a second parser) into turns: user message, context items, attachments, toolset, collab notes, and the agent's response parts (thinking / tool+result / text) in order. Provider framing (tool results as "user" messages) never reaches the UI |
| `components/ReviewWalkWindow.tsx` | the multi-instance floating window: TURN TABS at the root (switching re-roots the walk on that turn's assistant message), expand-all/collapse-all + Pretty↔Raw toggle, breadcrumb hop trail, layer header, filing panel, receipt panel |
| `components/TurnDiagnosis.tsx` | all presentation: `TurnDiagnosisView` (root chat layer — sections You sent / Context (N, collapsed) / Call setup / What the agent did / Also on this call), `GroupedInputsView` (deeper layers + non-chat units — descend inputs grouped the same way), `DiagCard` collapsible cards, pretty renderers (toolset chips, key-value args tables — JSON only in explicit Raw mode or for unknown payloads), the deliberate two-step "This is wrong" (open → optional note → Trace/Pin), `ConfidenceBadge` |
| `components/NegativeVerdictFollowUp.tsx` | the entry strip — renders ONLY while a negative verdict exists on the message: `[Diagnose] [Attach your version] [?]` as rounded pills matching the tap-button bar, with a help popover explaining both actions |
| `components/AttachVersionDialog.tsx` | O1 corrected-output editor → `captureCorrection` (`lib/output-feedback`) |

Display defaults: the user's message and the FINAL assistant text are expanded;
everything else (thinking, tools, context, setup) folds closed. Context is one
counted, collapsed group — context items are never presented as messages or as
"inputs the user gave". The turn model failing to load is an enhancement
failure only — the window falls back to `GroupedInputsView` over the descend
payload with an honest banner.
| `features/overlays/openers/reviewWalkWindow.tsx` | multi-instance opener; deterministic instanceId `review-walk\|{unit_kind}\|{unit_id}`, focus-don't-duplicate (modeled on `gscDrilldownWindow`) |

Overlay registration: `reviewWalkWindow` in
`features/window-panels/registry/overlay-ids.ts`,
`features/overlays/catalogue.ts` (`multi`, window), and a gated multi-instance
block in `features/overlays/OverlayController.tsx`.

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
