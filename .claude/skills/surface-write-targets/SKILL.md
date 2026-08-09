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
5. Check the Error Inspector — zero new `surface-writeback` captures.

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
- `content-plan-node`'s draft targets predate agent-origin and are `manual`
  (kind-component only) — do not copy its policy omissions for new work.
- Don't declare a target whose handler you can't wire to a CANONICAL write
  path — a declared-but-unwired target is a loud runtime defect by design.
- Multiple values in one field object (like `page_meta_tags`
  `{meta_title?, meta_description?}`) beat five micro-targets when they're
  edited together; separate targets when they're independent decisions.
