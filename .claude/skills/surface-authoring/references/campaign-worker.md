# Surface campaign — worker brief (batch mode)

Paste this whole file as a worker's task and fill in the assignment block. It is self-contained on
purpose: the rest of the `surface-authoring` skill is reference, never required reading for this job.
**A page pass (agent surface + UI/UX in one pass) starts from the `page-pass` skill, which
uses §2-§4 here as its surface procedure.** Coordinator side: [campaign-coordinator.md](./campaign-coordinator.md). Open platform gaps:
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

0. **Read what agents already said about it:** `pnpm surface:feedback --surface <name>`, then run
   the printed SQL through the Supabase MCP. Fix what they report, or say why not in your report.
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
   surfaceName menuVersion={1} getApplicationScope contentSource={…}>` → a DOM element
   (`<div className="contents">`).
   - The provider goes AROUND the menu, never between the menu and its child.
   - Editors use `EditableContextMenu`.
   - `contentSource`: a page showing a real record passes that record's own source (and `entity`
     when it can be attached or shared); `{type:"raw"}` only when the page has no primary text.
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
     and sort (open gap, handoff "MatrxDataTable must tell its host which rows are on screen"). Describe list values as "after the page's own filters"
     and name the gap in the readiness note.
   - **A docked panel with its own surface (e.g. the side canvas) replaces yours while open**
     (handoff "A docked panel with its own surface replaces the page's surface"). Never declare a value that only exists while such a panel is open.
   - `sourceFeature` must be a real slug from `types/python-generated/source-attribution.ts`. Map
     the surface in `features/agents/utils/source-feature-from-surface.ts`; if no slug fits, use
     the closest honest product and say so.
   - A page with nothing a person can create, change or author gets no write targets and says so,
     with the reason, in the manifest header. Every page that lists records gets the full set below.
   - A page with a **"New ___" dialog** is the exception that always gets two targets, both `ask`:
     a `draft` target that opens the dialog and fills EVERY field (buttons, toggles and added rows
     too, not just text boxes), and an `entity` target that takes an ARRAY and creates each item
     through the page's own create function, validating the whole list first. Without them,
     agents improvise with generic tools and create half-built records (2026-09-26, My Classes:
     classes with no settings or owner). Worked example: `education-classes.manifest.ts`, its
     validation `features/education/classes/classAgentWrites.ts`, its handlers in
     `ClassesHome.tsx` (list) and `ClassFormDialog.tsx` (dialog).
   - **Record lists get full CRUD over lists, one set per record type** (`create_/update_/
     delete_<plural>`, plus `<record>_draft` for a "New" dialog), built with
     `collectionWriteHandlers`. The rules, the `{ validate, apply }` handler shape and the live
     test are in `.claude/skills/surface-write-targets/SKILL.md` Steps 0-4 — read it before
     declaring any target.
   - **What the agent sees up front:** follow the inline policy in `surface-write-targets` Step 4
     exactly (`record` / `list` / `recent` tiers; anything else needs Arman's approval). Write a
     guide (`features/surfaces/guides/<slug>.md` + manifest `guide`) for any page with more than
     one record type or rules the descriptions can't hold.
   - **Judgment calls follow the approval system** (`surface-write-targets` → "The approval
     system"): the default, a named exception whose condition holds, or Arman's recorded
     approval. Never your own choice.
   - **A page that runs its own agent** (chat, builder, runner, battle) declares it with
     `ownConversationId` / `isOwnConversation` on its provider: that conversation never sees the
     page; every other agent does.
   - **Every write handler** calls the page's OWN save/create function (never a parallel path),
     validates the WHOLE value before changing anything, and throws a sentence the agent can act
     on. A list target also refuses names repeated in the list or already present, and on a
     part-way failure says exactly which items were created, so a retry never duplicates. Declare
     `updatesValue` on every target that has a read twin (the draft value, the list).
   - **A dialog with its own fields:** mark its root `data-surface-layer="<surface>"` (import
     `SURFACE_LAYER_ATTRIBUTE` from `features/surfaces/runtime/window-forms.ts`) so the platform's
     generic form net stands down; that net fills only real inputs, never buttons or added rows.
     If the dialog component stays mounted while closed, it registers its draft handler itself
     with `useSurfaceWriteHandlers(surfaceName, …)` and opens itself; otherwise register it at the
     page and pass the values down.
   - **A create with no workspace selected** must ask, never return nothing: resolve the org with
     `ensureOrgId(orgId)` (`lib/organizations/ensureOrgId.ts`) and treat
     `isOrganizationSelectionCancelled(e)` as "not now" (no error toast; a write handler refuses
     with `refuseSurfaceWrite("…ask which workspace…")`).
   - **The intro** names the surface's write targets for the jobs agents will be asked to do
     ("to add classes, use create_classes"), and says plainly not to use generic tools for this
     data when they would skip the page's rules.
   - **Route mapping:** `features/surfaces/utils/route-to-surface.ts`. When child routes
     (`/x/[id]`) are a different page, map the list with an exact regex (`/^\/x\/?$/`) above the
     prefix table, and add both cases to `route-to-surface.test.ts`.
   - Never run a formatter over a whole file you did not create: a formatted file becomes a
     900-line diff that collides with everyone. Format only files you created.
5. **Readiness:** `partial`, with a note naming exactly what is not proven yet (normally: "no
   outside-helper binding test"). `verified` only when that is proven too.

## 3. Check, sync, commit (per batch)

- **Type check only what you touched** (the full `pnpm type-check` needs ~13 GB and is killed in a
  cloud container):
  1. Write `tsconfig.focused.<your-short-name>.tmp.json` IN THE REPO ROOT (outside it, `types`
     cannot resolve and every file errors; a name of your own, because parallel workers delete a
     shared one mid-run) with
     `{"extends":"./tsconfig.json","compilerOptions":{"noEmit":true,"incremental":false},"include":["global.d.ts","cartesia.d.ts","types/typecheck-env.d.ts", <your files>]}`.
  2. Run `node --max-old-space-size=11000 node_modules/typescript/bin/tsc6 -p tsconfig.focused.<your-short-name>.tmp.json`. One run covers the
     whole batch, in about 3 minutes.
  3. Delete the temporary file.

  Errors in files you did not touch are pre-existing: list them and don't fix them. CI runs the full
  type check on every push.
- `pnpm check:surface-drift` and `pnpm check:surface-routes` (seconds each). If drift is red because
  of someone else's clash, fix that one line too.
- **Sync each surface's DB mirror.** Cloud sessions lack the direct-Postgres variables (handoff "Cloud
  sessions cannot sync"), so:
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

Run every probe with your own short temp dir, e.g. `TMPDIR=/tmp/sw-<short-name> pnpm surface:probe …`:
parallel workers otherwise share one browser profile and collide (keep the path short; a long one
breaks Chromium's socket).

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

**Every surface with write targets also gets an agent write test** — a read probe cannot see a
write that "succeeds" with half-built records:

```bash
pnpm surface:probe --surface <client/name> --route <route> \
  --agent '<what a person would ask, e.g. "Add these classes: A (closed), B (open, final 2026-12-10)">' \
  [--click 'button=>New class'] --out agent-<name>.json
```

It runs a real agent from the Agents menu, answers the workspace picker, and presses every Apply
card (for real: use obviously named test data). Pass means ALL of:
- `agent.approvals` shows the approval(s) you expected, and `agent.reply` reports what landed;
- `afterAgent` shows the read twin supplied (a draft target) or the list changed (an entity target);
- for an entity target, a read-only SQL query shows every created row COMPLETE — every field the
  page's own create would set (settings, memberships, links), compared with a row made by hand;
- one refusal case: send a value the handler must refuse (a duplicate, a bad date) and confirm the
  reply carries the handler's reason and nothing was written.

Fix findings, commit, and re-probe after the next deploy. Report the test rows you created so the
person can delete them.

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
