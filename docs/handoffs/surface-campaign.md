---
type: Handoff
title: "Surface campaign — handoff"
description: "Make every registered surface agent-readable, verified on the live site, with one list that stays true."
status: active
updated: 2026-09-26
repos: [matrx-frontend, aidream]
scope: program
feature: surfaces
vision: []
---
# Surface campaign — handoff

**What this is:** the campaign to make every page and window in the app publish what the user is
looking at, so an AI agent launched there sees it. It also removes the platform gaps that stopped the
last attempt.

**Seen from his seat:** on any page, the header button "Agents for this page" → "Surface Context"
names the page and lists its live values. His review inbox gets one row per finished batch.

## Vision — Arman's words

> "It's clear we need to have a management process in place so that the lists and all of that are perfect and all updated."

> "Don't assume the problems are on purpose. The good things are on purpose, but the bad need to be overcome and that's what I need your help with."

> "The key that would make this work really well is if each agent worked on multiple surfaces at once … the agent is fixing x pages and commiting each as he goes. Then, when he's all done, already one or more of the pages are live for testing … even if they did batches of 5, they would fix 5, commit, wait, test 5, recommit..."

## Where it stands

- The method is written down:
  - worker brief: `.claude/skills/surface-authoring/references/campaign-worker.md` (batches of 5,
    verify on production, one independent reviewer);
  - coordinator brief: `.../campaign-coordinator.md`.
- The list is computed, not declared: `pnpm surface:census` (plus `--sql` for the DB mirror). On
  2026-09-26: 214 surfaces, 193 emitting, 21 not emitting.
- Verification needs no dev server: `pnpm surface:probe --surface <name> --route <path> --commit <sha>`
  checks the live site in ~40 s per surface.
- The pilot surface is done and reviewed: `matrx-user/artifacts` (`features/artifacts/lib/artifacts-scope.ts`).
- The Surface Context window now shows "Supplied, empty" distinctly from "not supplied".

## Future — everything still open

1. **Run the campaign.** Start a coordinator session with `campaign-coordinator.md`. Its Wave 0 list
   is in that file.

2. **`MatrxDataTable` must tell its host which rows are on screen.**
   - **Where:** `aidream/apps/shared/design-system`, the `data-table` export.
   - **Problem:** it applies column filters, layered filters and sort internally. It exposes neither
     the processed rows nor its query state unless the host takes over every control with
     `controlled-local`, so every table-backed list surface reports the wrong rows once a user
     filters or sorts from a header.
   - **What to add:** an optional read-only callback or handle with the processed rows (before
     pagination) and the query state that produced them. It must not trigger a render loop. Release
     it and adopt it in the SAME session (same-session law).
   - **First adopter:** `features/artifacts/components/CmsArtifactList.tsx`. Feed the rows to
     `buildArtifactListScope`, declare the active column filters and sort in `artifacts.manifest.ts`,
     and delete its "PLATFORM GAP" note.
   - **Done when:** on `/artifacts`, a Name "Contains" filter and a Name sort show the same count and
     order in the probe as on screen.

3. **A creator cannot see some of their own artifacts** (access-sensitive; read
   `docs/official/db-rules.md` §6 and the `protected-resources` skill; start with the `diagnose`
   skill).
   - **Symptom:** `admin@admin.com` has 387 non-deleted `chat.artifact` rows as creator, but
     `/artifacts` (the `/api/artifacts` `list` action) shows 377. For example, 79 flashcard decks in
     the DB but 78 on the Flashcards tab, and 1 report in the DB but 0 on screen.
   - **Worst case:** `/artifacts/3e9a8551-2849-4a8c-8242-d2d1551a2cb1` tells its own creator "You
     don't have access".
   - **Lead:** the user's rows span five organizations (`f9cb3e35…`, `7cd12da2…`, `884d1ce8…` which
     holds the example, `5dc930e9…`, `3e790542…`).
   - **Done when:** DB rows equal the rows shown, per type tab, and the example opens.

4. **Cloud sessions cannot sync or check a surface's DB mirror.**
   - **Problem:** `scripts/sync-surface-manifests-direct.ts` needs the five `SUPABASE_MATRIX_*`
     direct-Postgres variables, which cloud sessions lack. The fallback,
     `scripts/emit-surface-sync-sql.ts`, needs an undocumented `--organization-id`
     (`39c38960-d30c-4840-b0c1-c9960de95582`), and its ~27 KB of SQL must be pasted through the
     Supabase MCP. There is no `--check` in the cloud.
   - **Fix:** make one command work with what cloud sessions have (`SUPABASE_SECRET_KEY` +
     `NEXT_PUBLIC_SUPABASE_URL`, e.g. an admin RPC pair `ui.sync_surface(jsonb)` /
     `ui.check_surface(text)`), and update the skill's Layer 4 and pre-flight checklist.
   - **Done when:** sync and `--check` for `matrx-user/artifacts` run from a cloud session.

5. **A docked panel with its own surface replaces the page's surface.**
   - **Problem:** runtimes resolve "deepest wins, most recent breaks ties"
     (`features/surfaces/runtime/SurfaceRuntimeContext.tsx`). On `/artifacts`, opening a row in the
     side canvas (`CanvasSurface`, same depth) wipes the list's values from the Agents chrome. The
     user sees both; an agent sees one.
   - **Fix:** decide the platform rule for co-visible surfaces (a page plus a docked panel), write it
     in `features/surfaces/FEATURE.md`, and implement it in the runtime.
   - **Done when:** on `/artifacts` with the canvas open, both the list's values and the canvas's
     values are reachable.

6. **The admin board should compute status, and claims should expire, everywhere they are read.**
   - `/administration/ui/surfaces` should show the census facts beside declared readiness: emitting,
     mirror in sync, claim age, last independent check.
   - A claim older than 6 hours reads as free.
   - Clear the four stale claims from 2026-08-26 (`matrx-user/files`, `agent-apps`, `messages`,
     `chat`).
   - Until this lands, the coordinator's census is the board.

7. **DB rows with no manifest (31 on 2026-09-26).**
   - Split them into rows that legitimately belong to other clients (`chrome-extension/*`,
     `matrx-local/*`, `sms/*`, `voice/*`) and true orphans:
     - renames: `matrx-user/rag`, `rag-data-stores`, `rag-library`, `rag-search`, `rag-viewer`
       (now `knowledge-*`);
     - old admin debug windows: `matrx-admin/*-debug`, `execution-inspector`, `json-truncator`, …
   - Before deleting an orphan, move any `platform.associations` agent bindings that target it.
   - Two value-count drifts to resync: `matrx-user/markdown-pdf`, `matrx-user/settings`.

8. **Four surfaces are declared verified, but the census found no emitter:**
   `matrx-user/assistant-message`, `working-document`, `masterwork-rulebook`, `crm-manager`. Probe
   each. Either teach the census their emitter (a shared builder such as
   `_conversation-document.manifest.ts`) or demote them to `partial`.

9. **Artifacts surface, remaining gaps.**
   - The access gate distinguishes "no access" from "not found" but emits only
     `artifact_load_state = "gate"`.
   - Right-clicking empty space below the detail cards opens no menu.
   - No outside-helper binding test yet (non-matching names plus the Matrx-vs-matrix check).

10. **Attribution slug.** No `artifacts` product slug exists in
    `types/python-generated/source-attribution.ts` (generated from aidream), so the surface is
    attributed to `canvas`. If the Content Library should report as its own product, add the slug in
    aidream, regenerate, and update `features/agents/utils/source-feature-from-surface.ts`.

## Resources

- Worker brief: `.claude/skills/surface-authoring/references/campaign-worker.md`
- Coordinator brief: `.claude/skills/surface-authoring/references/campaign-coordinator.md`
- Tools: `scripts/surface-census.ts` (`pnpm surface:census`), `scripts/surface-probe.mjs`
  (`pnpm surface:probe`)
- Pilot, worked example: `features/artifacts/lib/artifacts-scope.ts`,
  `features/artifacts/components/CmsArtifactList.tsx`, `CmsArtifactDetail.tsx`
- Review row for the pilot: https://manage.aimatrx.com/administration/users/agent-review/3eed121b-6a96-4850-a49c-7e309289958b
