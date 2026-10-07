# Surface campaign — worker brief (batch mode)

Paste this whole file as a worker's task and fill in the assignment block. It is self-contained on
purpose: retain the entrypoint's integration receipt and read its runtime/menu/write-target branches
when the assignment reaches them.
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
undeclared, and it is proven in the real UI with real data.

## Contents

- Setup and verification lane
- Claim
- Build one surface
- Check, sync, commit
- Verify live behavior
- Independent review
- Finish

## The loop — build in batches, verify changed code

Build and push each batch immediately. Local workers prove changed code in the managed localhost
preview; production probes add deployed evidence when the release contains the commit. A cloud
worker without a preview reports that exact unproven boundary to its named coordinator.

```
Batch 1: build 5 → check → sync → commit+push each
Batch 2: build 5 → check → sync → commit+push each      (batch 1 is shipping meanwhile)
         verify batch 1 on production → fix → commit+push
Batch 3: build 5 ...                                      (batch 2 is shipping)
         verify batch 2 → fix ...
...
Last:    verify the remaining batch(es), then the independent review and integration receipts
```

If a batch is not deployed yet, continue useful work; deployed proof does not replace required
localhost engineering proof. Never manually release, ship, deploy, or build production here.

## 0. Setup (once)

- Reuse the assigned checkout and read its `CLAUDE.md`; only a cloud task without a checkout
  needs the environment's repository setup and `pnpm install --frozen-lockfile`.
- Use existing authentication and environment credentials. Never print a credential or sign-in URL.
- Local lane: use the shared managed preview and its session localhost URL; follow the repo's
  browser-authentication flow. Never start a second raw dev server.
- Supabase MCP: `project_id` `brsgrqvjdzwihsvnfqkf`.
- Commit assigned paths and push to `origin/main` immediately. Fetch before integrating; never
  run dirty-tree `git pull --rebase` or a blanket stash/reset/restore/clean. Follow workspace
  synchronization rules for a rejected push.
- If an integrated change updates `pnpm-lock.yaml`, run `pnpm install --frozen-lockfile` again.

## 1. Claim (per surface, before building it)

A direct human assignment names surfaces without a fleet claim. For autonomous fleet work,
the assigned Work Loop claim is authority. Never combine it with a legacy SQL claim.
Only a campaign cloud worker without Work Loop uses this expiring legacy fallback:

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
4. **Runtime rules:**
   - `getScope` never fetches. Inspectors may poll it; read state the page already rendered.
   - **Not loaded yet** = OMIT the key. **Loaded, and empty** = `[]` / `0` / `""`. Only a
     SUCCESSFUL load may report counts or rows; a failed load reports its load-status value only.
   - **State in a child:** use `useSurfaceScopeContribution` for additive values and
     `useSurfaceWriteHandlers` for additive handlers on the same identity, or publish into an
     owner-held ref. A genuinely separate layer gets its own provider and identity.
   - A menu's `resolveContextOnOpen` returns only DECLARED names (e.g. a right-clicked row's values
     in the surface's own terms), never new keys.
   - **List scope describes the rows its owner actually knows.** When a table owns filters/sort
     that the page scope cannot observe, describe values as "after the page's own filters" and
     name that boundary in readiness. Check the installed table's controlled query and row
     callbacks before claiming its displayed rows; never mutate scope refs during render.
   - **A docked panel with its own surface becomes primary while open.** The mounted page
     remains a `surface_chain` level. Declare panel-only values on the panel and follow
     `overlay-surfaces.md` and the intentional helper/native/resident handoff contract.
   - `sourceFeature` must be a real slug from `@ai-matrx/agents/generated/source-attribution`. Map
     the surface in `../aidream/apps/shared/chat/src/agents/utils/source-feature-from-surface.ts`; if no slug fits, use
     the canonical registry/generated contract rather than an unrelated slug; verify the header
     resolver and menu both name the actual product.
   - A page with nothing a person can create, change or author gets no write targets and says so,
     with the reason, in the manifest header. Every page that lists records gets the full set below.
   - A page with a **"New ___" dialog** is the exception that always gets two targets, both `ask`:
     a `draft` target that opens the dialog and fills EVERY field (buttons, toggles and added rows
     too, not just text boxes), and an `entity` target that takes an ARRAY and creates each item
     through the page's own create function, validating the whole list first. Worked example: `education-classes.manifest.ts`, its
     validation `features/education/classes/classAgentWrites.ts`, its handlers in
     `ClassesHome.tsx` (list) and `ClassFormDialog.tsx` (dialog).
   - **Record lists get full CRUD over lists, one set per record type** (`create_/update_/
     delete_<plural>`, plus `<record>_draft` for a "New" dialog), built with
     `collectionWriteHandlers`. The rules, the `{ validate, apply }` handler shape and the live
     test are in `.claude/skills/surface-write-targets/SKILL.md` Steps 0-4 — read it before
     declaring any target.
   - **What the agent sees up front:** follow THE CONTEXT BUDGET in `surface-write-targets` Step 4
     (spend up to 10,000 chars per page by its shape, as one XML bundle; more needs Arman's
     approval). Write a
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
     `SURFACE_LAYER_ATTRIBUTE` from `../aidream/apps/shared/chat/src/surfaces/runtime/window-forms.ts`) so the platform's
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
   - **Route mapping:** `../aidream/apps/shared/chat/src/surfaces/utils/route-to-surface.ts`. When child routes
     (`/x/[id]`) are a different page, map the list with an exact regex (`/^\/x\/?$/`) above the
     prefix table, and add both cases to `route-to-surface.test.ts`.
   - Never run a formatter over a whole file you did not create: a formatted file becomes a
     900-line diff that collides with everyone. Format only files you created.
5. **Readiness:** `partial`, with a note naming exactly what is not proven yet (normally: "no
   outside-helper binding test"). `verified` only when that is proven too.

## 3. Check, sync, commit (per batch)

- Run the queued full `pnpm type-check` for the batch. Never introduce a focused tsconfig or
  exclude shipped code. Follow `CLAUDE.md` if the launcher fails; report unrelated errors while
  proving changed types and affected callers clean.
- `pnpm check:surface-drift` and `pnpm check:surface-routes` (seconds each). If drift is red because
  of someone else's clash, fix that one line too.
- **Sync each focused mirror** with
  `pnpm exec tsx scripts/sync-surface-manifests-direct.ts --surface <name>`, followed by the
  matching `--check --surface <name>`. Review removed values and mappings first: stale child
  rows are archived and declared archived rows are revived.
- If direct Postgres credentials are unavailable, generate the focused plan with the SQL
  emitter's current arguments, inspect it, and execute it through connected Supabase MCP in a
  transaction. Verify all metadata, values/roles/write-targets/client-tools, ownership/public
  visibility, and archival in both directions. A value count alone is not a full check receipt.
  If the full check cannot run, record `NOT RUN`, the exact boundary, and its named owner/next
  action; do not claim a completed integration.
- **Commit each surface separately**, keeping the owning feature's current rules in `FEATURE.md`
  in the same change; no changelog. Push immediately and record each surface's commit SHA.

## 4. Verify live behavior (per batch)

Run every probe with your own short temp dir, e.g. `TMPDIR=/tmp/sw-<short-name> pnpm surface:probe …`:
parallel workers otherwise share one browser profile and collide (keep the path short; a long one
breaks Chromium's socket).

```bash
pnpm surface:probe --surface <client/name> --base http://<session>.localhost:3001 \
  --route <route> [--route <second route or /record/<real id>>] \
  [--fill '<css selector>=><text>'] --out probe-<name>.json
```

- For production evidence, select the correct host with `--base` and add `--commit <sha>` to
  prove the deployment contains the change. **Exit 3:** not deployed; continue other authorized
  work and report the release boundary.
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

Fix findings, commit/push, and re-probe changed code. Report the test rows you created so the
person can delete them.

## 5. Independent review (once, near the end, against changed code)

Dispatch ONE reviewer subagent (lane: standard) for the whole assignment, time-boxed to 45 minutes.

- **Give it:** the list of surfaces and their routes; the owner's standard ("every piece of data the
  page loads is declared and supplied, nothing invented, not-loaded is never shown as empty,
  verified in the real UI with real data"); the probe command; read-only SQL access; and the
  instruction to try to break each surface by changing state.
- **Do NOT give it:** your counts, file list, or suspicions.

Fix what it finds that is yours. Write a handoff prompt for what is not. Then resume the SAME
reviewer to re-check only the fixes.

## 6. Finish

- **Settle assigned Work Loop work through its worker-candidate/verifier process.** Only a
  worker using the bounded legacy SQL fallback releases that claim with:
  `update ui.ui_surface set check_claimed_by = null, check_claimed_at = null where check_claimed_by = 'surface-worker/<short-name>';`
- **For a legacy campaign assignment, file ONE review-queue row** for the assignment:
  - title: "Agent-readable: <n> surfaces (<names>)"; url: the first surface's route; lane tag
    `surface-emitters`; `repo_slug` `matrx-frontend`; domain `platform`; feature `surfaces`.
  - Check none exists first.
  - The reviewer sets it to `ready_for_human` only if it passes.
- **Report** each surface with the entrypoint's integration receipt; a scratch report may hold
  detailed evidence. Never write `last_checked_*` or a final certification pass yourself. Cover:
  - each surface: commit SHA, values before → after, probe counters per route, readiness and note;
  - skipped or already-done surfaces;
  - the reviewer's findings and what you fixed;
  - every wall you hit;
  - a self-contained handoff prompt for anything broken that you could not fix.
