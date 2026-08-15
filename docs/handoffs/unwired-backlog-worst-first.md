---
status: blocked-on-decision
updated: 2026-08-15
repos: [matrx-frontend, aidream]
---

# Handoff — the unwired backlog, worst-first

**Scoreboard:** `/administration/reporting/unwired`
**Governing law:** `/Users/armanisadeghi/code/common-docs/policies/unfinished-work-alarm.md` — nothing on this
page may be deleted, dropped, or "cleaned up" on an agent's authority. Finish it, or report what finishing takes.

The nine largest findings from the 2026-08-14 sweep were hunted and dispatched. **Eight are worked through.
What is left is not code — it is six written rulings only Arman can give.** That is the whole point of this
page now; the per-item detail exists to make each ruling a one-line answer.

## 🚨 THE SIX RULINGS

Each of these is finished-and-superseded, or hunted-and-blocked. None may be deleted until Arman names it
dead **in writing**. Each row's value is already extracted, so "yes, retire it" costs one commit.

| Artifact | Lines | Why it is stuck | The question |
|---|---|---|---|
| `components/debug/PromptExecutionDebugPanel.tsx` | 517 | Superset successor `AgentExecutionDebugPanel` took its slot 2026-08-14 | Retire it, or does it earn a second debug slot? |
| `features/code/terminal/TerminalTab.tsx` | 625 | `SimpleTerminal` replaced it after the xterm/SSE path silently emitted nothing | Retire it, or fund a working PTY upgrade so xterm can come back? |
| `features/tasks/components/TaskDetailPage.tsx` + `TaskContent.tsx` | 778 + 338 | Sharing already ported into the live `TaskEditor` (v0.4.658); agents still pay upkeep on an unreachable screen | Retire both? |
| `features/transcript-studio/.../TranscriptionLanding.tsx` | 528 | Its wayfinding already ported onto `/transcripts` (`transcriptsRoutes.ts` + `TranscriptsSurfaceGuide`) | Retire it? |
| `features/content-manager/components/PageListView.tsx` | 393 | Reconciled against the live `features/cms` component 2026-08-14 — **nothing to port** | Retire it and the one-file `features/content-manager/` directory? |
| `hooks/tts/useVoiceChat*.ts` | 1,106 | Hunted; the engine behind them is retired | **Do we still want hands-free VAD voice chat at all?** Full brief: [`voice-chat-vad-revival.md`](./voice-chat-vad-revival.md) |

## Done — cleared from the report

- **`AgentExecutionDebugPanel`** (777) → mounted from `components/debug/DebugIndicatorManager.tsx`. The strict
  superset successor of `PromptExecutionDebugPanel`: same execution-system selectors, same `onClose`, ten
  sections vs six. `instanceId` is the value `adminDebugSlice` stores as `runId`.
- **`TransformableCard` + `EnhancedDraggableCardBody`** (430 + 337) → mounted at `/demos/draggable-cards`.
  Mounting them immediately exposed a defect neither had ever been exercised enough to reveal (**D195**),
  now fixed and verified live: the cause was Tailwind `transition-all` on the motion element — the browser
  transitioned `transform` from `none` while motion rewrote it every frame, silently discarding the
  translate. **Not** the wrapper CSS the original brief blamed; the twin component never carried
  `transition-all`, which is why its half always laid out correctly. The demo shows two cards at distinct
  positions.
- **`LinkAgentToShortcutModal`** (483) → mounted on `AgentShortcutsPanel` (v0.4.659/660). It had sat
  unreachable since April behind a phase doc that said *"No routes mounted; Phases 11/12/13 will consume."*

## Done — value extracted, artifact awaiting a ruling above

- **Tasks** — sharing ported from the unreachable `TaskDetailPage` into `TaskEditor`; `/tasks/[id]` gained a
  project door + `AccessGate` (v0.4.658).
- **Transcripts** — `transcriptsRoutes.ts` is now the surface register, each mode carrying a blurb, so the
  route no longer names Studio / Process / Scribe / Clean without decoding them (THE DOOR LAW).
- **content-manager** — reconciled against `features/cms`; nothing to port. A related defect it could not fix
  (a shell migration is a rewrite) is recorded in `FOUND_DEFECTS.md`.
- **Voice chat** — hunted and handed to its own handoff, which owns the decision.

## Still open — real work, not a ruling

**`NotesLayout` (431) + `NotesTreeView` (287)** — the legacy notes shell. `features/notes/FEATURE.md`
2026-06-24 calls the canonical stack "a strict superset" but names four salvage targets that were never
landed: RAG/knowledge indexing for a note (`ProcessForRagButton` + `useNoteIngestStatus`, explicitly *"the
one thing the canonical /notes lacks"*), sidebar drag-edge auto-scroll, mobile "New Folder", and
`NoteViewShell`'s declarative single/split frame. Verify the superset claim item by item, land the
survivors on `NotesView`, and this becomes a seventh ruling. Note also that the FEATURE.md claim that these
render in `/demos/notes-salvage` is **stale** — that page only mentions `NotesLayout` in prose.

Read `features/notes/FEATURE.md` § Freeze-loop doctrine and invoke the `supabase-realtime` skill before
touching any autosave/realtime path; this feature has a history of browser freezes.

## The detector itself

The 2026-08-14 pass fixed four category-level false-positive classes in `scripts/unwired/scan.ts`
(1,270 → 972 findings). Details and tests: [`scripts/unwired/FEATURE.md`](../../scripts/unwired/FEATURE.md).

aidream's half was **half** fixed. `module-unreached` now treats a top-level `scripts/*.py` as a real entry
point and moves such modules to a labelled `cli_only` bucket — correct, and it cleared
`services/runtime/workflow_ab.py`. Its sibling `service-unreached` did not get the same treatment: it still
reports all 13 public functions of that same module, including `stable_sha256`, which is named six times
across the two driver scripts, even though `scripts` is already in `CONSUMER_ROOTS`. **258 of the 268 aidream
findings come from that one detector**, so the true aidream number is unknown until it is fixed. Chipped
2026-08-15.

**The report grows while it is worked.** 972 → 986 across one day of ~90 concurrent sessions. Clearing this
backlog is not a finish line; the number *moving* is the signal, not the number itself.
