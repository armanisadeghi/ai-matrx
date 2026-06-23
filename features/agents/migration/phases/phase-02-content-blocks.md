# Phase 2 — Content Blocks Migration

**Status:** implementation-complete (DB applied); perf profile (2.3) outstanding
**Owner:** _unassigned_
**Prerequisites:** Phase 1
**Unblocks:** Phase 3, Phase 5

## Goal

Make content blocks (static, insertable text templates) fully agent-native and neutral: scope-aware, reusable, and decoupled from the prompt feature tree.

## Scope after Phase 1

Phase 1 absorbed most of the original Phase 2 scope:
- ✅ `content_blocks` table got scope columns (was originally a Phase 2 step).
- ✅ `agent_context_menu_view` returns content blocks alongside shortcuts.
- ✅ `features/agent-shortcuts/components/` includes `ContentBlockList.tsx` and `ContentBlockForm.tsx` (built in task 1.7).

**What remains:**

## Success criteria
- [ ] Port text-insertion utilities from `features/prompts/utils/textareaInsertUtils.ts` to a neutral location. Proposal: `utils/text-insertion.ts`. Non-prompt consumers switch to the neutral import.
- [ ] Confirm the `agent_context_menu_view` performance for realistic row counts (e.g. 200 shortcuts × 50 content blocks × 20 categories). Add indexes if slow.
- [ ] All existing content blocks remain visible (migration is additive — they're all global-scope with NULL user_id/org_id).
- [ ] Change log entry here, `MASTER-PLAN.md` status updated.

## Tasks
- [x] **2.1** Port insertion utils. New: `utils/text-insertion.ts`. Re-export shim kept at `features/prompts/utils/textareaInsertUtils.ts` (deleted in Phase 18). One non-prompts caller (`app/(dev)/demos/notes/_components/NoteContextMenuContent.tsx`) switched.
- [ ] **2.2** View performance smoke test. Run `EXPLAIN ANALYZE` against `agent_context_menu_view` with a meaningful data set. Add partial indexes if the scan-rate is unacceptable. *(Requires DB apply of Phase 1 migrations.)*
- [ ] **2.3** Write short dev-doc paragraph in `features/agent-shortcuts/` describing what content blocks are and how they differ from shortcuts (for Phase 3 consumers).

## Out of scope
- Any UI route (Phases 11/12/13).
- The context menu itself (Phase 3).
- Deletion of any prompt-side insertion code (Phase 18).

## Change log
| Date | Who | Change |
|---|---|---|
| 2026-04-20 | initial plan | Phase created |
| 2026-04-20 | main agent | Phase largely absorbed into Phase 1 after discovery that `content_blocks` already exists. Remaining scope: insertion util port + perf verification. |
| 2026-04-20 | main agent | Task 2.1 shipped. Insertion utils now live at `utils/text-insertion.ts`; legacy path is a re-export shim so prompt-side callers keep working until Phase 18. |
