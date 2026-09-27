---
name: surface-write-targets
description: "Recipe for making an existing surface agent-writable via manifest writeTargets. Use when asked to 'let agents write/update/fill X on this page', 'add write targets', or 'wire apply_surface_write', or for an avalanche-campaign item. NOT for a brand-new surface (use surface-authoring)."
---

# surface-write-targets — make a page agent-writable

Surfaces already tell agents what a page SHOWS (values). This skill adds the
other half: **declared write paths agents can drive**, gated by policy. The
plumbing is ALL built and automatic — when a mounted surface has agent-writable
targets, every agent run on it is offered ONE inline tool
(`apply_surface_write`), and its calls route through `applySurfaceWrite`
(`features/surfaces/runtime/surface-writeback.ts`) with `origin: "agent"`:
`ask` shows an in-place confirm, `auto` applies, `manual` refuses loudly, a
decline returns a non-error result. **You add ZERO plumbing** — only manifest
declarations + page handlers. Changing the writeback seam itself is not this
skill: that is `surface-writeback.ts` + `features/surfaces/FEATURE.md`.

**Worked references (read one before writing anything):**
- `features/surfaces/manifests/tasks.manifest.ts` + handler block in
  `features/tasks/components/editor/TaskEditorBody.tsx` — draft-into-Redux
  editor + entity actions. THE exemplar.
- `features/surfaces/manifests/marketing-page.manifest.ts` + 
  `features/marketing/components/pages/MarketingPageWriteTargets.tsx` —
  entity targets through canonical services, handlers registered from a
  child via `useSurfaceWriteHandlers`.

## Step 0 — what a page gets (decided 2026-09-27, from the My Classes test)

**Every record type a page lists gets full CRUD over LISTS**, through the
page's own save functions, each target `ask`:

| Target | Value | Notes |
|---|---|---|
| `create_<plural>` | array of 1-25 objects | only what the page's own create would take |
| `update_<plural>` | array of `{ id, …fields to change }` | only the fields sent change; merge onto the current record |
| `delete_<plural>` | array of ids (or `{ id }`) | description states exactly what is lost and steers to archive when the record can be archived |
| `<record>_draft` | object | only when the page has a "New ___" dialog: opens it and fills EVERY field, nothing saved |

- **One set per record type**, built with `collectionWriteHandlers`
  (`features/surfaces/runtime/collection-write-targets.ts`). A page with five
  record types calls it five times. Never one catch-all target.
- Archive/restore is a field on `update_<plural>` (`archived: true|false`) when
  the record can be archived.
- Deletion is allowed: the person approves every one on the card, and the
  description states the consequence (law: a destructive action states what
  is lost). Prefer archive in the description.
- Still NO targets for: ids/ownership, credentials, billing, permissions, and
  derived evidence (scores, mastery, counts). Those stay read-only values.
- Authored fields on an editor page (a description, a brief, meta tags) keep
  their `draft` targets as before (worked reference: `tasks.manifest.ts` +
  `TaskEditorBody.tsx`).

Worked example of all of it: `features/surfaces/manifests/education-classes.manifest.ts`,
`features/education/classes/classAgentWrites.ts` (pure parsers + tests),
`features/education/classes/components/ClassesHome.tsx` (the helper) and
`ClassFormDialog.tsx` (the draft target).

## Step 1 — declare targets on the manifest

Per target: `name`, `label`, `valueType` (`array` for the CRUD targets),
`updatesValue` (the list value it changes), `mode` (`entity` for CRUD,
`draft` for the dialog), `applyPolicy: "ask"`, `group`, `sortOrder`.

The `description` is the ONLY contract the model sees (until the target names
a `valueKind`). Write it so a small model gets it right the first time:
- start with what it does and whether it saves ("saved immediately" / "NOTHING
  is saved");
- "Value is a JSON ARRAY of objects, each { … }" — spell every field, its
  type, allowed values (`"open" | "closed" | "paid"`), formats (`YYYY-MM-DD`),
  and which are required;
- what is refused (duplicates, unknown ids, rules between fields);
- for delete: what is lost, and "prefer update with archived: true".

Every record type also gets its list as a value (`owned_<plural>` or the
page's name for it) with the ids the targets need, and an `archived_<plural>`
value when archived records exist, so update and restore can name them.

## Step 2 — register handlers on the page

A handler entry is `{ validate, apply }`
(`SurfaceWriteHandlerEntry`, `features/surfaces/runtime/SurfaceRuntimeContext.tsx`):
- `validate(value)` runs BEFORE the person's approval card. Throw a sentence
  the agent can act on and no card is shown. Put the whole-list check here
  (a pure parser, unit-tested).
- `apply(value)` runs after approval. Re-parse against the live page, save,
  and RETURN `{ summary, data }`: what landed, with ids. The agent's page
  snapshot was taken when its run started and will not show new records, so
  this return value is how it knows.
- `collectionWriteHandlers` does both for list CRUD, plus the part-way failure
  message ("Created 1 of 3 … Not attempted: …") so a retry never duplicates.

The seam (`surface-writeback.ts`) already, for every target:
- turns a JSON string into the array/object the target declares, and refuses a
  wrong type before the card, naming expected vs received;
- returns every outcome to the agent: refused before approval, declined by the
  person, failed after approval (with the handler's message), or succeeded
  (with your `summary`/`data`).

Rules that still bite:
- **Save through the page's canonical function** (the one its button calls),
  never a parallel write. If it replaces a whole JSON column (settings), merge
  onto the current value first.
- **No workspace selected:** a create resolves it with `ensureOrgId(orgId)`,
  which asks the person; treat `isOrganizationSelectionCancelled` as a refusal
  ("ask which workspace"), never a silent no-op.
- **A dialog with its own fields:** mark its root
  `data-surface-layer="<surface>"` (`SURFACE_LAYER_ATTRIBUTE`) so the generic
  window-form net stands down, and register its draft handler with
  `useSurfaceWriteHandlers` from the component that owns the fields (it stays
  mounted while closed, so it can open itself).
- **Intro:** name the targets for the jobs agents will be asked to do, and say
  not to use generic tools (scope/context tools) for this data.

## Step 3 — verify with a REAL agent on the live site (non-negotiable)

No dev server. After the release carrying your commit is live:

```bash
pnpm surface:probe --surface <client/name> --route <route> --commit <sha> \
  --agent '<a real request, e.g. "Add these classes: A (closed), B (open, final 2026-12-10)">'
```

It runs a real agent from the Agents menu and presses Apply for you (use
obviously named test data). Run, for each record type:
1. create two items in one request; `agent.approvals` shows ONE approval and
   `agent.reply` names both with ids;
2. update one field on one item and archive another;
3. a request that must be refused (a duplicate name, a bad date): the reply
   carries your validator's reason and `agent.approvals` is EMPTY (refused
   before the card);
4. then a read-only SQL query: every created row is COMPLETE (every field the
   page's own create sets, links and memberships included), compared with one
   made by hand.

Then `pnpm check:surface-drift`, the focused type check, and the DB mirror
sync (see `surface-authoring/references/campaign-worker.md` §3). Report the
test rows you created so the person can remove them.

## Step 4 — what the agent sees up front, the guide, and feedback

- **What the agent sees in full up front — the inline policy (Arman,
  2026-09-27).** The platform default (200 chars; anything bigger becomes a
  "look it up" item) stays for almost every value. A page lifts it ONLY for
  what an agent cannot work without, using exactly these tiers
  (`INLINE_TIER`, `features/surfaces/types.ts`; the declaration check refuses
  any other number):
  - `record` — the ONE record the page is about (a note, a class, a study
    guide, an agent definition, an article): one structured object, passed
    whole. Long text fields in it are also `patchable` write targets.
  - `list` — a list page's CONDENSED list: only the fields a person scans
    (id, name, 3-6 key fields), in the person's current sort and filter, the
    first 25 rows; the total count and the active sort/filter are their own
    small values. Full rows stay a separate default (lookup) value.
  - `recent` — a sidebar's recent items (up to 5) or open tabs (up to 10),
    each `{ id, title }`.
  Anything else — a bigger number, more rows, another kind of value — needs
  Arman's approval: leave the default, file the question (skill `ask-arman`)
  with the evidence, and only after he approves set `inlineApproval: "Arman
  <date>: <why>"` beside the number.
- **Judge it by what agents do first.** A surface is failing when most agent
  runs on it open with `context` lookups for the same value. The live agent
  test (Step 3) must show the agent answering "what is on this page" with no
  lookups; report any lookup it made.
- **A guide for any page with more than one record type or any rule the
  descriptions can't hold.** Write `features/surfaces/guides/<surface-slug>.md`
  (80-150 lines: what the page is, each value, each target with a worked
  example value, the rules, what to do when stuck) and set
  `guide: "features/surfaces/guides/<slug>.md"` on the manifest. The sync
  publishes it as the platform skill `surface-guide-<slug>` and adds a pointer
  to the intro. Worked example: `features/surfaces/guides/education-classes.md`.
  The intro stays short: the basics and which target does which job.
- **Read the page's agent feedback before changing a surface.** Every page
  offers agents the platform target `surface_feedback` (saved to the central
  feedback system, tagged with the surface). Before editing, run
  `pnpm surface:feedback --surface <client/name>` and run the SQL it prints
  through the Supabase MCP; fix what it reports or say why not. Mark handled
  rows resolved.
- **Document:** one Change Log line in the touched feature's `FEATURE.md`;
  file an `agent.review_queue` row (skill `agent-review-queue`).

## Traps

- The approval card can still read "The agent proposed this change…" instead
  of the agent's real name when neither the shared agent-name cache
  (`useAgentNames`/`resolveAgentName`) nor the agent-definition slice has
  resolved a name yet — known nit, not yours to fix per-surface (see
  `dispatch-surface-write.thunk.ts`).
- `content-plan-node` and its siblings are now `applyPolicy: "ask"`/`"auto"`
  (2026-08-09); only `node_primary_keyword_id` stays `manual` (no keyword
  options exposed). Never leave a new target `manual` by omission.
- Don't declare a target whose handler you can't wire to a CANONICAL write
  path — a declared-but-unwired target is a loud runtime defect by design.
- Multiple values in one field object (like `page_meta_tags`
  `{meta_title?, meta_description?}`) beat five micro-targets when they're
  edited together; separate targets when they're independent decisions.
- **The seam parses a JSON string into the declared object/array** (since
  2026-09-27). A `valueType: "string"` target still receives a string, so if a
  target legitimately takes structured data, declare `object`/`array` and
  accept the value itself.
- **CHECK FOR A COLLISION BEFORE YOU WRITE ANYTHING, and again before you
  commit.** Subagents and other sessions fan out in parallel, and the same
  surface gets assigned more than once. `git fetch origin main` and confirm the manifest
  still lacks `writeTargets` ON LATEST MAIN — not on your clone's base, which
  goes stale within the hour — and `git ls-remote origin <your-branch>` to
  see whether someone is already pushing there. If a DIFFERENT design already
  landed on main, it wins: do NOT merge a competing target set on top of it
  (two targets covering the same fields is a defect, not a merge), keep the
  landed work, and contribute only what is genuinely additive. Never
  force-push over another agent's branch. Scraper hit this three ways at
  once — a branch implementation, a second agent on the same branch name, and
  a third, better design already merged to main.
- A surface can have several provider mounts, and the ROUTE is often not one
  of them. Confirm which component actually mounts `SurfaceRuntimeProvider`
  before verifying — an agent run on a page with no mounted runtime is
  offered no write tool at all, which looks exactly like a broken target.
  (Scraper's live mount is the `scraperWindow` floating panel, not
  `/scraper`.)
- **Collisions land MID-FLIGHT, not just before you start.** The trap above
  says check before you write and again before you commit — the second check
  is the one that fires. `connections-skills` passed a clean STEP ZERO (no
  branch, no `agent.review_queue` row, no `writeTargets` on main) and a
  complete competing design was merged to main while the live-agent
  verification was still running. When that happens the landed design wins
  even if yours is finished and verified: revert your competing files rather
  than reconciling them, and keep only what is genuinely additive. Budget for
  it — a surface you scouted is not a surface you hold.

### Verification-harness traps (these silently fake a PASS or a FAIL)

- **Pass a real FUNCTION to `page.evaluate`, never a string.** A string like
  `"() => {...}"` evaluates to a function object rather than being called, so
  the poll returns nothing and you conclude "no confirm dialog appeared" while
  five appeared and blocked the run. Cost four full agent runs on
  `connections-skills`.
- **Match dialog buttons on `textContent`, not `innerText`.** `innerText`
  needs layout and comes back `""` for the portal'd radix `AlertDialog`'s
  Apply / Keep as is buttons in headless Chromium — the text is plainly in
  `document.body`, so the dialog looks present and unclickable at once. Same
  for finding a list row by its label.
- **The confirm's smallest common ancestor is the FOOTER, not the dialog.**
  Walking up from the Apply button until you find "Keep as is" lands on the
  button row, so your evidence log captures two button labels and none of the
  description you are trying to prove. Take `closest('[role="alertdialog"]')`
  for the text.
- **`input[placeholder*="search" i]` is ambiguous on shell pages** — on
  `/agent-connections` it matches the SIDEBAR's section filter, not the list
  search. A dirty-editor guard test that types into the wrong box makes the
  editor stay clean and the write get ACCEPTED, which reads exactly like a
  broken guard. Identify a field by an EXACT value match and then assert the
  state you meant to create (Save button enabled) before trusting the probe.
- **`getScope()` is sampled when the user presses ▶.** A second message in the
  same agent conversation carries the FIRST run's scope snapshot, so an agent
  that writes and then re-reads within one thread reports its own writes as
  missing. Start a fresh run to prove a read twin — that is the design, not a
  stale twin, and it is worth saying so before someone "fixes" it.
