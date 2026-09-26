# Surface campaign — worker brief (batch mode)

Paste this whole file as a worker's task and fill in the assignment block. It is self-contained on
purpose: the rest of the `surface-authoring` skill is reference, never required reading for this job.
Coordinator side: [campaign-coordinator.md](./campaign-coordinator.md). Open platform gaps:
`docs/handoffs/surface-campaign.md`.

```
ASSIGNMENT
  worker name:   surface-worker/<short-name>
  surfaces:      <client/name>, <client/name>, ...   (usually 10-15, grouped by feature)
  batch size:    5
```

## What you are doing

A **surface** is a page or window that publishes named live values ("what the user is looking at")
so an AI agent launched there can see them. Your job, for each surface: while a user is on it, the
Surface Context window (header button "Agents for this page" → "Surface Context") names the surface
and shows every piece of data the page loads as a supplied value. Nothing is invented, nothing is
undeclared, and it is proven on the live site with real data.

## The loop — build in batches, verify on production, never wait

You do NOT run a dev server. You build and push; the release train ships `main` to aimatrx.com
about every 30 minutes; you verify there with `pnpm surface:probe` (~40 s per surface, ~1 GB).

```
Batch 1: build 5 → check → sync → commit+push each
Batch 2: build 5 → check → sync → commit+push each      (batch 1 is shipping meanwhile)
         verify batch 1 on production → fix → commit+push
Batch 3: build 5 ...                                      (batch 2 is shipping)
         verify batch 2 → fix ...
...
Last:    verify the remaining batch(es), then the independent review, then the report
```

If a batch is not deployed yet when you want to verify it, keep building. Only wait (in a
`until …; do sleep 60; done` loop, never a chain of sleeps) when nothing else is left.

## 0. Setup (once)

- `add_repo armanisadeghi/ai-matrx`, ONE `git clone --depth 1` to the path it gives (10-minute
  timeout; `git index-pack` looks stalled while it unpacks, and it isn't), then
  `pnpm install --frozen-lockfile` (expect ~116 entries in `node_modules/.bin`).
- Credentials are already in the environment (`AI_ADMIN_USERNAME`, `AI_ADMIN_PASSWORD`, the
  Supabase and backend URLs). Never write a `.env.local`. Never print a credential or a sign-in URL.
- Supabase MCP: `project_id` `brsgrqvjdzwihsvnfqkf`.
- Work on `main` only: no branches, no worktrees. Commit path-scoped
  (`git commit -m "…" -- <paths>`), then `git pull --rebase origin main` and
  `git push origin HEAD:main`. About 30 people push to this repo.
- **After every `git pull`, if `pnpm-lock.yaml` changed, run `pnpm install --frozen-lockfile`
  again.** A stale install makes even `pnpm check:surface-drift` fail with
  `ERR_PACKAGE_PATH_NOT_EXPORTED` (seen 2026-09-26).

## 1. Claim (per surface, before building it)

```sql
update ui.ui_surface
   set check_claimed_by = 'surface-worker/<short-name>', check_claimed_at = now()
 where name = '<client/name>'
   and (check_claimed_at is null or check_claimed_at < now() - interval '6 hours'
        or check_claimed_by = 'surface-worker/<short-name>')
returning name;
```

- **No row returned:** someone else holds it. Skip it and say so in your report.
- **The surface already emits:** its `create…Scope` is called outside its own manifest file on
  latest `origin/main`. Probe it. If it passes, report "already done" (a good outcome) and release
  the claim.

## 2. Build one surface

1. **Completeness pass from the components, not from the manifest.**
   - Many manifests were declared from a code read and never audited, so expect wrong descriptions.
   - Read every component each route renders, and list what it loads: fields, their natural
     composite objects, list rows, filters and search, loading/error/empty/access states, and
     content a child component renders.
   - Keep every existing value `name` (stored bindings reference them). Fix descriptions and add
     what is missing.
2. **One pure scope module** beside the feature (e.g. `features/<feature>/lib/<surface>-scope.ts`).
   It turns live state into values through the manifest's `create…Scope`.
   - Worked example: `features/artifacts/lib/artifacts-scope.ts` (a list route, a detail route, and
     a child that publishes content).
3. **Mount it in the component that owns the page's state:**
   `<SurfaceRuntimeProvider surfaceName getScope>` → `<NonEditableContextMenu sourceFeature
   surfaceName menuVersion={1} getApplicationScope contentSource={{type:"raw"}}>` → a DOM element
   (`<div className="contents">`).
   - The provider goes AROUND the menu, never between the menu and its child.
   - Editors use `EditableContextMenu`.
   - Worked example: `features/artifacts/components/CmsArtifactList.tsx` / `CmsArtifactDetail.tsx`.
4. **Rules that bite** (each one cost a real surface a bug):
   - `getScope` never fetches. It is polled every 400 ms; read state the page already rendered.
   - **Not loaded yet** = OMIT the key. **Loaded, and empty** = `[]` / `0` / `""`. Only a
     SUCCESSFUL load may report counts or rows; a failed load reports its load-status value only.
   - **State in a child:** the child publishes into a ref the owner holds (one ref per publishing
     child). Never mount a second provider: the deeper one replaces the owner's whole scope.
   - A menu's `resolveContextOnOpen` returns only DECLARED names (e.g. a right-clicked row's values
     in the surface's own terms), never new keys.
   - **A `MatrxDataTable` does not tell the page which rows it shows** after its own column filters
     and sort (open gap, handoff item 1). Describe list values as "after the page's own filters"
     and name the gap in the readiness note.
   - **A docked panel with its own surface (e.g. the side canvas) replaces yours while open**
     (handoff item 4). Never declare a value that only exists while such a panel is open.
   - `sourceFeature` must be a real slug from `types/python-generated/source-attribution.ts`. Map
     the surface in `features/agents/utils/source-feature-from-surface.ts`; if no slug fits, use
     the closest honest product and say so.
   - No write targets unless the page has a genuine user-authored draft. A read-only surface says
     so, with the reason, in the manifest header.
   - Never run a formatter over a whole file you did not create: a formatted file becomes a
     900-line diff that collides with everyone. Format only files you created.
5. **Readiness:** `partial`, with a note naming exactly what is not proven yet (normally: "no
   outside-helper binding test"). `verified` only when that is proven too.

## 3. Check, sync, commit (per batch)

- **Type check only what you touched** (the full `pnpm type-check` needs ~13 GB and is killed in a
  cloud container):
  1. Write `tsconfig.focused.tmp.json` with
     `{"extends":"./tsconfig.json","compilerOptions":{"noEmit":true,"incremental":false},"include":["global.d.ts","cartesia.d.ts","types/typecheck-env.d.ts", <your files>]}`.
  2. Run `node node_modules/typescript/bin/tsc6 -p tsconfig.focused.tmp.json`. One run covers the
     whole batch, in about 3 minutes.
  3. Delete the temporary file.

  Errors in files you did not touch are pre-existing: list them and don't fix them. CI runs the full
  type check on every push.
- `pnpm check:surface-drift` and `pnpm check:surface-routes` (seconds each). If drift is red because
  of someone else's clash, fix that one line too.
- **Sync each surface's DB mirror.** Cloud sessions lack the direct-Postgres variables (handoff
  item 3), so:
  1. Run `pnpm exec tsx scripts/emit-surface-sync-sql.ts --organization-id 39c38960-d30c-4840-b0c1-c9960de95582 --surface <name> > sync.sql`.
  2. READ it: it has caught real bugs.
  3. Run the statements that changed through the Supabase MCP inside `begin; … commit;`.
  4. Confirm the value count with
     `select count(*) from ui.ui_surface_value where surface_name = '<name>'`.

  If `SUPABASE_MATRIX_*` exist in your environment, use
  `pnpm exec tsx scripts/sync-surface-manifests-direct.ts --surface <name>` and `--check` instead.
- **Commit each surface separately**, with a one-line Change Log entry in its feature's `FEATURE.md`,
  then push. Record each surface's commit SHA; you need it to verify.

## 4. Verify on production (per batch, once deployed)

```bash
pnpm surface:probe --surface <client/name> --commit <sha> \
  --route <route> [--route <second route or /record/<real id>>] \
  [--fill '<css selector>=><text>'] --out probe-<name>.json
```

- **Exit 3:** not deployed yet. Build the next batch and try again later.
- **Exit 0:** the surface is named, no keys are undeclared, and the menu opened.
  - Read `supplied` / `suppliedEmpty` / `absent` for each route against what the page actually
    shows. A value visible on screen but absent is a finding. So is a value whose content is wrong.
  - Use real records: find an id with a read-only SQL query as the test user. Include a missing or
    forbidden id to see the gate state.
  - Use `--fill` to change state (a search box, a filter input) and read the `after` block.
- **Exit 1:** read `errors` and fix.

Fix findings, commit, and re-probe after the next deploy.

## 5. Independent review (once, near the end, on the deployed site)

Dispatch ONE reviewer subagent (lane: standard) for the whole assignment, time-boxed to 45 minutes.

- **Give it:** the list of surfaces and their routes; the owner's standard ("every piece of data the
  page loads is declared and supplied, nothing invented, not-loaded is never shown as empty,
  verified in the real UI with real data"); the probe command; read-only SQL access; and the
  instruction to try to break each surface by changing state.
- **Do NOT give it:** your counts, file list, or suspicions.

Fix what it finds that is yours. Write a handoff prompt for what is not. Then resume the SAME
reviewer to re-check only the fixes. On the pilot, the reviewer found two real bugs, a design flaw,
a platform gap and a data bug that the builder had missed.

## 6. Finish

- **Release every claim:**
  `update ui.ui_surface set check_claimed_by = null, check_claimed_at = null where check_claimed_by = 'surface-worker/<short-name>';`
- **File ONE review-queue row** for the assignment:
  - title: "Agent-readable: <n> surfaces (<names>)"; url: the first surface's route; lane tag
    `surface-emitters`; `repo_slug` `matrx-frontend`; domain `platform`; feature `surfaces`.
  - Check none exists first.
  - The reviewer sets it to `ready_for_human` only if it passes.
- **Report**, in at most 15 lines plus a file `REPORT-<short-name>.md` in your scratchpad. Cover:
  - each surface: commit SHA, values before → after, probe counters per route, readiness and note;
  - skipped or already-done surfaces;
  - the reviewer's findings and what you fixed;
  - every wall you hit;
  - a self-contained handoff prompt for anything broken that you could not fix.
