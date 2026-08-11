---
name: surface-write-targets
description: Make a surface AGENT-WRITABLE — declare writeTargets on its manifest, register page handlers, and verify a live agent run end-to-end. Use whenever a task says "let agents write/update/fill X on this page", "add write targets to <surface>", "make <surface> agent-writable", "wire apply_surface_write on <page>", or is an avalanche-campaign chip. Covers the judgment bar (which fields EARN a target), the draft/entity/ui + applyPolicy doctrine, the manifest + handler recipe, the mandatory live-agent verification, and the avalanche contract (end by firing 3-5 chips for further surfaces). NOT for creating a brand-new surface (surface-authoring first) or for the writeback seam internals (features/surfaces/runtime/surface-writeback.ts + FEATURE.md).
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
declarations + page handlers.

**Worked references (read one before writing anything):**
- `features/surfaces/manifests/tasks.manifest.ts` + handler block in
  `features/tasks/components/editor/TaskEditorBody.tsx` — draft-into-Redux
  editor + entity actions. THE exemplar.
- `features/surfaces/manifests/marketing-page.manifest.ts` + 
  `features/marketing/components/pages/MarketingPageWriteTargets.tsx` —
  entity targets through canonical services, handlers registered from a
  child via `useSurfaceWriteHandlers`.

## Step 0 — the judgment bar (this is why an agent, not a sweep, does this)

**Not every input earns a target.** The extra code is only worth it where an
agent plausibly produces the value. Rank the surface first:

- **YES:** authored content an agent can draft better/faster (descriptions,
  briefs, meta tags, summaries, keywords, labels, plans); planning fields
  derivable from context (status, priority, due date); decomposition actions
  (add subtasks, add items).
- **NO:** identity/ownership fields, ids, credentials, billing, permissions,
  anything destructive (delete stays human), pure-mechanical toggles nobody
  would ask an agent to flip, and surfaces that are read-only reports.
- A surface with fewer than ~2 YES fields probably doesn't earn the work —
  say so and pick a better surface. A surface where EVERY input is
  agent-drivable (marketing-page class) is the jackpot.

## Step 1 — declare targets on the manifest

In the surface's `manifests/<name>.manifest.ts`, add a
`SurfaceWriteTarget[]` and `writeTargets` on the export. Per target:

- `name` lower_snake, unique on the surface. `label` = THE canonical label.
- `description` is **model-facing contract prose**: exact value shape,
  vocabulary enums spelled out (`low | medium | high`), replace-vs-append
  semantics ("replaces the FULL set — include existing values from
  <read-twin>"), and where it lands. The agent sees exactly this.
- `valueType`, `updatesValue` (the read-twin value — the evidence loop),
  `group`/`sortOrder` (existing groups).
- `mode`: `"draft"` stages into the page's editor state, user still saves
  (PREFERRED — additive, reversible); `"entity"` persists immediately through
  the page's canonical service; `"ui"` ephemeral view state.
- `applyPolicy`: **`"ask"` is the default for anything agents should drive**
  (in-place confirm, decline is a normal outcome). `"auto"` only for
  ephemeral `ui` targets. Omit (= `manual`) for targets meant only for
  user-click kind components. **A target left `manual` is never offered to
  agents** — declaring it does nothing for this campaign.

## Step 2 — register handlers on the page

Two equivalent seams — pick by where the state lives:

- Owner component mounts the provider: `<SurfaceRuntimeProvider … getWriteHandlers={buildHandlers}>`.
- A deep child owns the state: `useSurfaceWriteHandlers(SURFACE_NAME, handlers)`.

Handler rules (see the TaskEditorBody block):
- **Validate input and THROW on bad shape** — the seam converts throws to
  safe error envelopes the agent reads. Enum checks against the real
  vocabulary constants, never re-typed literals.
- Draft handlers dispatch the SAME action the user's typing uses
  (`patch`/slice draft) — never a parallel write path.
- Entity handlers call the canonical thunk/service — never raw supabase.
- Never silently coerce; a wrong value is the agent's error to hear about.

## Step 3 — verify with a REAL agent run (non-negotiable)

Mock nothing. On a dev server (`pnpm dev:status` for existing ones; login
`/login` admin@admin.com / Password1234#):

1. Open the page; open the header **Agents** popover ("Agents for this
   page") and Run a bound agent (Badass Agent is globally bound).
2. Ask it in plain language to change several targets in one message.
3. Confirm: the ask dialog appears **per target** with your description
   text; Apply lands the value through your handler (draft → editor shows
   staged value + Save bar; entity → persisted + toast); Keep as is
   declines without an error and the agent acknowledges gracefully.
4. Ask for something you did NOT declare — expect a loud refusal.
5. Send one deliberately INVALID value and confirm your handler's throw
   reaches the agent verbatim. A good model often refuses to send a value it
   can see is invalid — say you are testing validation and want the exact
   error. Confirm nothing was staged (validate-then-apply).
6. Check the Error Inspector — zero new `surface-writeback` captures, **on a
   page load where you did NOT force an invalid value**. A handler throw is a
   capture BY DESIGN: `applySurfaceWrite`'s catch routes to `fail()`, which
   fires `toast.error` AND `captureError({source:"surface-writeback"})`. Step
   5 therefore MANUFACTURES a capture. Reload (captures are per page load),
   redo only the valid applies + a decline, and check that load — otherwise
   you find your own test and report a defect that is not one.

Then run `pnpm check:surface-drift` and `pnpm type-check`. Also run the
manifest sync (admin surfaces page) or note it pending — the DB mirror
(`ui.ui_surface_write_target`) is what lets aidream advertise targets
server-side; the client tool works either way.

## Step 4 — document + the avalanche contract

- FEATURE.md of the touched feature: one Change Log line. The surfaces
  FEATURE.md "360 loop" section lists live adopters — add yours.
- Register the surface in `agent.review_queue` (skill `agent-review-queue`)
  so Arman can test it.
- **End your task by firing 3-5 `spawn_task` chips**, each assigning ONE
  concrete surface (name the manifest + page component + candidate targets
  you scouted), instructing the agent to invoke THIS skill
  (`surface-write-targets`), verify with a live agent run, and **end with
  3-5 chips of its own for further surfaces**. Skip chips only when you
  genuinely cannot find worthy surfaces left — check
  `features/surfaces/manifests/` for manifests without `writeTargets` whose
  pages have real editable state.

## Traps

- The confirm dialog says "An agent wants…" when the agent-definition slice
  isn't hydrated — known nit, not yours to fix per-surface.
- `content-plan-node` and its siblings are now `applyPolicy: "ask"`/`"auto"`
  (2026-08-09); only `node_primary_keyword_id` stays `manual` (no keyword
  options exposed). Never leave a new target `manual` by omission.
- Don't declare a target whose handler you can't wire to a CANONICAL write
  path — a declared-but-unwired target is a loud runtime defect by design.
- Multiple values in one field object (like `page_meta_tags`
  `{meta_title?, meta_description?}`) beat five micro-targets when they're
  edited together; separate targets when they're independent decisions.
- **The inline-tool layer PARSES a JSON-looking argument before your handler
  sees it.** A `valueType: "string"` target cannot receive raw JSON text — it
  arrives already parsed as an object, the handler throws, and the agent
  "fixes" it by double-encoding (escaped `\n`, stray quotes in the field).
  If a target legitimately takes structured data, accept the OBJECT and
  serialize it yourself. Bit `shapes`; don't rediscover it.
- **CHECK FOR A COLLISION BEFORE YOU WRITE ANYTHING, and again before you
  commit.** These chips fan out in parallel and the same surface gets
  assigned more than once. `git fetch origin main` and confirm the manifest
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
- **A 404 on a route that worked ten minutes ago is usually a corrupt `.next`**
  after the dev server was killed mid-compile, not your code. `rm -rf .next`
  and restart before you go looking for a bug you did not write.
