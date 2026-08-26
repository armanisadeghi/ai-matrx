---
name: agent-disclosure
description: >-
  Make a surface NAME the AI it runs, and open that AI in place. The sweep recipe for
  THE DISCLOSURE LAW — add `<PageAgents>` inline, declare the job as a manifest
  `agentRole` carrying `mandateKey`, and replace every link to a mandate route with the
  `mandateWindow` panel. Use whenever a page, panel, overlay, or window runs an agent
  behind a button, chip, assist, or automatic action; whenever `pnpm check:agent-disclosure`
  names a file; whenever you are working the undisclosed-surface backlog; and as part of any
  broad UI enhancement pass on a surface that touches AI. Triggers on "this page runs an
  agent", "name the AI", "disclose the agent", "mandate link", "PageAgents", "agentRoles",
  "AI doing jobs here", "surface runs a mandate", "secret AI". NOT for agent-AUTHORING
  surfaces (the builder, the mandate console, agent settings) — they disclose nothing, and
  that exception is part of the law.
---

# Agent disclosure — a surface names the AI it runs

## The law (Arman, 2026-08-25 / 2026-08-26 — quoted)

> "Any page where we have AI integrations, I need the page to identify what agents it's
> using for those purposes so that I can go look at those agents' instructions."

> "On any surface where an agent is actually being assigned but built into the physical UI
> … we also add that agent to the list of available agents at the top."

> "We don't ever want to send the user off of the page, over to a route like the agent's
> mandate route. Instead, you should do the same thing that we do when the user clicks on
> the settings icon for the agents that are assigned into roles."

Three sentences, three obligations. A page that quietly calls a model is a black box, and a
black box cannot be approved — least of all one that also runs on a schedule while nobody is
watching.

Cross-repo SoR: `../../../common-docs/systems/agents/mandates/CLIENT-SURFACES.md`
§ THE DISCLOSURE LAW. Frontend detail: [`features/surfaces/FEATURE.md`](../../../features/surfaces/FEATURE.md)
§ "AI doing jobs here" · [`features/agents/mandates/FEATURE.md`](../../../features/agents/mandates/FEATURE.md).

## 🚨 THE SELF-CONTEXT EXCEPTION — read this before you touch anything

A surface where the user **builds, edits, pins, tests, or reviews an agent** discloses
NOTHING. There the agent is the page's **subject**, not its worker, and handing it context
of itself is the exact bug the surfaces system exists to prevent. Exempt by path, with the
reason, in `scripts/check-agent-disclosure.ts`:

`features/agents/mandates/**` · `features/admin/mandates/**` · `features/surfaces/**` ·
`features/agents/components/**` · `features/agent-shortcuts/**` · `app/(dev)/**` · `scripts/**`

Adding a path there is a RULING, not housekeeping: write the reason, and only for a surface
whose subject IS an agent. "It was noisy" is not a reason.

The same boundary in the other direction is surface-check S5: an agent-PURPOSE surface
(chat, agent run, battle) launches its own primary conversation with
`runtime: { surfaceName: null }`. Disclosure and that opt-out are different rules about the
same boundary — read S5 when the surface's whole point is the agent.

## Find the work

```bash
pnpm check:agent-disclosure          # advisory; names every undisclosed SURFACE
```

It scans surfaces only — execution machinery (thunks, launchers, services, tool handlers)
runs mandates on behalf of a surface and discloses nothing by design. That scoping is
deliberate: a guard that prints 124 rows teaches its readers to skip it.

**Its blind spots are yours to cover** when you are already in a file:

- a surface that runs an agent through a helper the regexes do not name;
- a `<PageAgents>` that names ONE mandate on a page that runs three;
- a chip whose `does` copy is stale because the mandate changed jobs.

## The fix — three parts, and the first two are not alternatives

### 1. Name it inline — `<PageAgents>`

```tsx
import { PageAgents } from "@/components/agents/PageAgents";

<PageAgents
  agents={[{ mandateKey: "seo.topic_assigner", does: "places keywords onto the Offering tree" }]}
  surfaceName="matrx-admin/marketing-run-console"
/>
```

- **A mandate KEY, never a raw agent id.** The Holder is DB-managed and moves without a
  deploy. A file holding a raw agent UUID is a different job first —
  `pnpm check:hardcoded-agents`, then come back.
- **`does` is what it does HERE, in the surface's own words**, lowercase, no period,
  readable by a non-technical SME: "places keywords onto the Offering tree", not "invokes
  the topic assignment mandate".
- **`surfaceName` whenever the host knows it** — it is stamped onto notes written about the
  mandate from this page.
- Put it in the surface's own control bar / header row, beside what the agent acts on —
  never in a footer nobody reads.
- This ALSO registers the mandate into the live registry
  ([`features/surfaces/runtime/surface-mandates.ts`](../../../features/surfaces/runtime/surface-mandates.ts)),
  so the Agents header menu lists it. One declaration, two disclosures.

### 2. Declare it as a role — the manifest half

In the surface's manifest (`features/surfaces/manifests/<slug>.manifest.ts`):

```ts
agentRoles: [
  {
    name: "topic_assigner",
    label: "Topic assigner",
    description: "What this agent does here, and why an operator would inspect or test it.",
    kind: "single",
    defaultAgentId: null,
    mandateKey: "seo.topic_assigner",
    autoRun: "never",
    sortOrder: 100,
  },
],
```

- `mandateKey` **instead of** `defaultAgentId` — `check:surface-drift` refuses both.
- This is what makes the agent **bindable, runnable against the page's live scope, and
  testable** from the header menu. The inline chip alone does not.
- Sync after: `pnpm check:surface-drift && pnpm check:surface-routes`, then the manifest
  sync (`POST /api/admin/surfaces/sync-manifests`, or the Surfaces admin button).
- **No manifest yet?** The inline half still ships today — do it. Then either register the
  surface (**invoke `surface-authoring`**) or leave a chip saying which surface is missing.
  Never skip part 1 because part 2 is bigger.

### 3. Open it IN PLACE — never a link to a mandate route

```tsx
const openMandate = useOpenMandateWindow();   // features/overlays/openers/mandateWindow
openMandate({ initialMandateKey, mandateKeys, surfaceName, initialView: "yours" });
```

A `<Link href="/agents/mandates…">` or `/administration/agents/mandates…` **from a working
surface is a regression** — it costs the user the screen they were standing on. The routes
stay for browsing all 365. `mandateWindow` wraps the canonical components (Yours =
`MandateOverridePanel`, Admin = `MandateDetailView`), so nothing is re-implemented; read
[`features/window-panels/FEATURE.md`](../../../features/window-panels/FEATURE.md) § A PANEL
WRAPS THE CANONICAL COMPONENT before adding any pane to it.

## Decide, never ask

| Situation | Verdict |
|---|---|
| Button/assist/automatic action runs a mandate for the USER | **Disclose.** Both halves. |
| The page builds/edits/tests/reviews the agent itself | **Exempt** — self-context exception. |
| A thunk, service, launcher, or tool handler runs it | **Not a surface.** The surface that calls it discloses. |
| The surface runs a DIFFERENT mandate per mode/engine/tab | Disclose the LIVE one — `<PageAgents>` re-registers when the set changes. |
| The mandate is disabled or unseeded | Still disclose. The menu shows it "off"; silence would be worse. |
| The agent runs only in a window/overlay on this page | The WINDOW discloses (mount `<PageAgents>` inside it); a window is a surface. |
| It runs a raw agent UUID, no mandate | Stop. That is `check:hardcoded-agents` work first — never invent a mandate key. |

## Verify — per surface, live

1. `pnpm check:agent-disclosure` — the file is gone from the list, and the total dropped by
   what you fixed. It never goes UP in your change.
2. Open the route. The chip is visible where the agent acts, and its wording reads like the
   product, not the code.
3. Open **Agents for this page** → "AI doing jobs here" lists the mandate; the surface's own
   jobs sort above the family's.
4. Click it → the mandate window opens **over the page**, on Yours for a user, Admin for a
   super-admin. The page behind it is still there.
5. Admin only: write a note, reopen the window, confirm it is there with the surface stamped
   on it.
6. `pnpm type-check` clean for your files; console clean.

## Sweep discipline

- **One feature area per commit** (`git add <your files>` → `git commit --only`). Shared
  checkout: never tree-wide git operations, never `git add -A`.
- **Never disclose an agent the page does not actually run** to make the count drop. A false
  chip is worse than a missing one — it sends the reviewer to the wrong instructions.
- **Never `eslint-disable`, never add an exempt path** to clear a finding.
- Unrelated defects found on the way: chip them (`spawn_task`) or `FOUND_DEFECTS.md`. Do not
  widen the sweep into the surface's other problems — unless you are running the full
  `surface-check`, which owns that.
- Update the surface's `FEATURE.md` Change Log in the same commit (**invoke `context-docs`**).

## Where this runs from

- **Standalone:** `/agent-disclosure` (or "sweep the undisclosed surfaces") — work the guard's
  list, batching by feature.
- **Inside a UI pass:** `live-ui-iteration` routes here from
  [`references/skill-router.md`](../live-ui-iteration/references/skill-router.md); this is a
  required owner on any surface that touches AI, not an optional extra.
- **Inside certification:** `surface-check` S5. A surface cannot pass S5 while it runs an
  agent it does not name.
- **In Codex:** the repo's `.agents/skills` is a symlink to `.claude/skills`, so this skill is
  visible there with no second copy; `agents/openai.yaml` beside this file carries its Codex
  interface, and `AGENTS.md` (→ `CLAUDE.md`) carries the law line that points here.
