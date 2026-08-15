---
status: active
updated: 2026-08-15
repos: [matrx-frontend, aidream]
---

# Handoff — the unwired backlog, worst-first

**Scoreboard:** `/administration/reporting/unwired`
**Governing law:** `/Users/armanisadeghi/code/common-docs/policies/unfinished-work-alarm.md` — nothing may be
deleted, dropped, or "cleaned up" on an agent's authority. Finish it, or report what finishing takes.

The nine largest findings of 2026-08-14 are worked through. **Arman ruled on all six blocked items on
2026-08-15** (below). The report went **1,270 → 762**: roughly two thirds of that was detector false
positives, the rest real wiring and one authorized retirement.

## ✅ ARMAN'S RULINGS — 2026-08-15

Recorded here because the unfinished-work alarm requires the owner's decision **in writing** before any
purpose-built artifact is removed. This section IS that record.

**RETIRED — deleted 2026-08-15 (3,048 lines).** Each was verified unreferenced first: no importer, no JSX
mounter, no string/registry/dynamic-import reference, no admin-map entry, nothing in aidream / matrx-extend /
matrx-local. Only code comments and doc prose named them.

| File | Lines | Superseded by |
|---|---|---|
| `components/debug/PromptExecutionDebugPanel.tsx` | 589 | `AgentExecutionDebugPanel` (superset, mounted 2026-08-14) |
| `features/tasks/components/TaskDetailPage.tsx` | 868 | `TaskEditor` (sharing ported in v0.4.658) |
| `features/tasks/components/TaskContent.tsx` | 386 | `TaskContentNew`, rendered by `TaskApp` |
| `features/transcript-studio/.../TranscriptionLanding.tsx` | 745 | `/transcripts` list + `TranscriptsSurfaceGuide` |
| `features/content-manager/components/PageListView.tsx` | 460 | `features/cms/components/PageListView.tsx` (reconciled — nothing to port) |

`features/content-manager/` is gone entirely; it held only that one file. `TaskContentNew` and
`features/agents/agent-creators/tabbed-builder/TaskTab.tsx`'s local `TaskContent` const are **different
symbols** that share a name — both untouched.

**BUILD — not retirements, projects.** Both chipped 2026-08-15:

- **`features/code/terminal/TerminalTab.tsx`** (625) — Arman chose *build the PTY upgrade now*. The blocker
  is hosting, not the component: Next route handlers on Vercel cannot complete the 101 WebSocket upgrade, so
  step one is deciding where the PTY socket terminates (likely the matrx-sandbox orchestrator, reached
  directly with a brokered credential). `SimpleTerminal` must keep working as a loud fallback, and the
  zero-event-SSE failure that killed xterm the first time needs a test.
- **`hooks/tts/useVoiceChat*.ts`** (1,106) — Arman answered the blocking question **yes, he still wants
  hands-free VAD voice chat**. Rebuild on a live engine through the ONE sanctioned auth path
  (`accessToken.ts` + `connectCartesiaTts`, brokered token). The stranded hooks are the reference for
  behaviour — thresholds, sleep, barge-in — not code to wire up as-is. Authority:
  [`voice-chat-vad-revival.md`](./voice-chat-vad-revival.md), whose `blocked-on-decision` status is now lifted.

## Orphaned by the retirement — reported, NOT deleted

Removing the task screens left three components with no remaining consumer. They need their own ruling; an
agent may not extend Arman's decision to cover them.

| File | Lines | What it is |
|---|---|---|
| `features/agent-context/components/ScopePicker.tsx` | 195 | **A duplicate.** Tags an entity with scopes via an older `agent-context/redux/scope/*` slice family, while the canonical primitive is `features/scopes/components/entity-context/EntityScopeTagger.tsx` and the live task surface already assigns scopes through `TaskContextSection` → `ContextAssignmentField`. |
| `features/tasks/components/TaskList.tsx` | 41 | Fragment of the retired task screen. |
| `features/tasks/components/TaskHeader.tsx` | 16 | Fragment of the retired task screen. |

## Done — wired, not retired

- **`AgentExecutionDebugPanel`** (777) → `components/debug/DebugIndicatorManager.tsx`.
- **`TransformableCard` + `EnhancedDraggableCardBody`** (430 + 337) → `/demos/draggable-cards`. Mounting them
  exposed **D195**, now fixed: the cause was Tailwind `transition-all` on the motion element — the browser
  transitioned `transform` from `none` while motion rewrote it every frame, discarding the translate. **Not**
  the wrapper CSS the original brief blamed; the twin never carried `transition-all`, which is why its half
  always worked.
- **`LinkAgentToShortcutModal`** (483) → `AgentShortcutsPanel`. Unreachable since April behind a phase doc
  reading *"No routes mounted; Phases 11/12/13 will consume."*

## Still open — real work, no ruling needed

**`NotesLayout` (431) + `NotesTreeView` (287)** — the legacy notes shell. `features/notes/FEATURE.md`
2026-06-24 calls the canonical stack "a strict superset" but names four salvage targets never landed: RAG /
knowledge indexing for a note (`ProcessForRagButton` + `useNoteIngestStatus`, explicitly *"the one thing the
canonical /notes lacks"*), sidebar drag-edge auto-scroll, mobile "New Folder", and `NoteViewShell`'s
declarative single/split frame. Verify the superset claim item by item, land the survivors on `NotesView`,
then it becomes a ruling. The FEATURE.md claim that these render in `/demos/notes-salvage` is **stale** —
that page only mentions `NotesLayout` in prose.

Read `features/notes/FEATURE.md` § Freeze-loop doctrine and invoke the `supabase-realtime` skill before
touching any autosave/realtime path; this feature has a history of browser freezes.

## The detector itself

Two passes, both category fixes rather than triage — see
[`scripts/unwired/FEATURE.md`](../../scripts/unwired/FEATURE.md).

- **Frontend, 2026-08-14:** four false-positive classes (directory-name exclusions hiding real mounters,
  intra-module singleton factories, components consumed by call or as a registry value, SCREAMING_SNAKE
  constants read as components). 1,270 → 972.
- **aidream, 2026-08-15:** `module-unreached` learned that a top-level `scripts/*.py` is a real entry point
  and labels such modules `cli_only` rather than reporting them. Its sibling `service-unreached` was then
  fixed the same way — it had still been reporting all 13 public functions of `workflow_ab.py`, including
  `stable_sha256`, which two driver scripts name six times. **aidream's half fell 268 → 46.**

**The report grows while it is worked** — ~90 concurrent sessions create unwired work at roughly the rate
chips clear it. The number *moving* is the signal, not the number itself.
