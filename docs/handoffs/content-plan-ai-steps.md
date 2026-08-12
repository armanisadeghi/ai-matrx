---
status: active
updated: 2026-08-12
repos: [matrx-frontend, aidream]
vision:
  - /Users/armanisadeghi/code/common-docs/systems/content-planning/FEATURE.md
  - /Users/armanisadeghi/code/common-docs/systems/cms-system/CMS-BUILDOUT-HANDOFF.md
---

# Content Plan — an AI at every step, grounded in research

Sibling pointers: [`content-plan-client.md`](./content-plan-client.md) and aidream's
`docs/handoffs/content-plan-server.md` route the plan→CMS→live pipeline work to the
common-docs work order. **This doc owns one thing they don't: the AI steps and their
research grounding.**

## Vision — Arman's words

> "we sort of have two inlets to it. One of them is that I have an agent who does a great job
> of creating plans, but then the other way is that the system has its own thing where you
> click through. The problem is that the two don't really work together. First of all, the one
> that's built into the page where, uh, it supposedly offers the agent doesn't actually work.
> But then if you assume that really the way you wanna go through it is by selecting one of the
> packages and then going through the options. The problem is that there's no place for me to
> plug in agents there."

> "all we wanna do is we wanna create an agent at each of those steps. And the key with the
> agent is that, um, our agents have inputs that they take, so variables. and then they have...
> they can either output text, which is useless for us, or they can output a structured content
> IR kind. And that can automatically give us the structure that we need."

> "you select the package, and you'd say you won't have six service pages or whatever else.
> That's great. But the thing is is then you have to manually go through and name those
> services. But the better way of doing it is we already have research generate... one research
> report on a company brand, it takes fifty to a hundred AI calls to get. So it's an incredible
> report. So we have that report. All we have to do is give that as context to an AI and say,
> okay. Look. We're building a twenty page site. Here's what you're working with. What should
> these service pages be? What should the blog topics be? And the AI will just instantly give us
> that stuff so easily, but we're missing that little integration."

> "the other thing that's horrible is that that stuff doesn't get saved. I just spent probably
> twenty minutes manually going in and typing all the little services and this and that. And
> then none of it got saved... it needs to save at every single step."

> "I want each step to be real, have an ai integration and to then actually create the plan and
> build on it and save and persist."

On linking research: *"you prompt the user to select the... which research they want. They would
select the topic. And then that's one that they've already done research on. And then there's a
ton of resources... but for now, we could just start with only the final report, which is called
the 'Document'"*

## Resources

- **Feature truth:** [`features/marketing/content-plan/FEATURE.md`](../../features/marketing/content-plan/FEATURE.md)
  (client) · `aidream/services/content_plan/FEATURE.md` (server). Read both before touching this.
- **The AI runner:** `features/marketing/content-plan/setup/ai.ts` — agent ids, output coercion,
  variable builders, `useSetupAgents`. Headless `launchAgentExecution` + JSON extraction; the
  pattern comes from `features/education/assessment/data/useGenerateQuiz.ts`.
- **Draft persistence:** `features/marketing/content-plan/setup/draft.ts` —
  `web.site.settings.content_plan.setup_draft` + `research_topic_id`.
- **Server grounding:** `aidream/services/content_plan/generator.py`
  (`_load_research_report`, `_research_section`, `_user_can_read_topic`) and its
  `SITE_RESEARCH_TOPIC_KEY` twin in `archetypes.py`.
- **Live agents** (agx, run them with `agent_run`) — the seven the UI calls, covering eight
  steps (the Family Namer serves both "names" and "topics"):
  | Agent | id | Used by |
  |---|---|---|
  | Content Plan Shape Planner | `b600975c-fc8f-4f1d-ab36-670be436a038` | Setup "Recommend shape & counts"; `site_shaper` role |
  | Content Plan Family Namer | `7a16db8c-48eb-4997-a8d0-dc4a8892d7c5` | "AI names" (pages families) + "AI topics" (count-only) |
  | Content Plan Entity Curator | `c43e4497-3093-4b18-a906-b088127d8b9c` | Entities "Suggest from research"; `entity_curator` + `eeat_curator` roles |
  | Content Plan Entity Attacher | `a1a7784c-538b-44e5-b09d-40d215b79aa6` | Entities "Attach to pages"; `entity_attacher` role |
  | Content Plan Reviewer | `2a7f0dc8-5525-437a-8f2e-35f12a45cb27` | Setup "Plan review"; `plan_architect` role |
  | Content Plan Keyword Strategist | `e063ded1-38b2-4721-a526-aad01d26e2ef` | Setup "Suggest keywords" (whole-plan, top-down) |
  | Content Plan Brief Writer | `711d29b5-0afc-494c-a665-6011e529efce` | NodePanel "Draft brief"; `brief_writer` role (neighbour-aware) |

  **Two agents I built are now ORPHANED and should be deleted or left dormant** — Arman's
  Keyword Strategist and neighbour-aware Brief Writer strictly supersede them, so the wiring
  was repointed rather than kept in parallel (a second implementation of a job we own is a
  defect even when it works): Keyword Binder `8ffb091c-dccf-4550-a14f-95807fd96b95` and Brief
  Writer `f9789816-91b9-4e64-a38d-aa4d2a8127be`. Nothing references either.
- **Skills:** `matrx-agents` (authoring/running agx agents), `agent-execution-redux`
  (launch + structured output), `surface-authoring` (roles/writeTargets), `handoffs`.
- **Test route:** `/marketing/content-plan` → pick a site → `?view=setup`. Needs a site with a
  brand AND a research topic whose Document assembled successfully. Log in per CLAUDE.md
  (`admin@admin.com`).
- **Research topics that HAVE a successful report** (verified live 2026-07-30 — use these to
  test grounding): "All Green Electronics Recycling, LLC: Comprehensive Brand Profile"
  (`62465c78-fddd-458e-9f5e-0fb8193c6c18`), "Pearlman, Brown & Wax, LLP (PBW Law)"
  (`36806c3f-e151-4dd0-bfd9-55f25fb7d655`, 2 versions), "Dr. Sheila Nazarian & Nazarian Plastic
  Surgery" (`b4c47842-64dc-4e7a-95c6-a0a69eee0fbe`), "PRP Injections & Therapy"
  (`08ec80da-a84c-475a-b6a5-443727e6cef6`). All owned by `4cf62e4e-…`, `visibility='internal'`.
  Access gate spot-checked: `iam.has_access_for(owner,'research_topic',id,'viewer')` = true, a
  stranger = false.
- **Review queue row:** `agent.review_queue` id `2ca8190e-93d5-407a-ab9c-8607436d2bfb`.

## Remaining work

1. **DEPLOY — nothing here is live.** Both repos sit on `claude/practical-euler-x4kjjc`.
   The FE sends `research_topic_id` on `/content-plan/sites/{id}/generate`, and aidream's
   `GeneratePlanBody` is `extra="forbid"` — **ship aidream first (or together), never the FE
   alone**, or every Generate run 422s. aidream: `./scripts/release.sh` (Coolify, verify
   `/health/version` vs `origin/main`). FE: `./scripts/release.sh`.
2. **Arman's review — the mobile half is DONE, the "visible error" is NOT**
   (`agent.review_queue` `2ca8190e-…`, still `changes_requested`). His words:
   *"desktop Setup is powerful, but mobile exposes only the shape chooser and drops the Work
   Order, page list, lint, and Make It Real workflow from the accessible surface. Recompose the
   three-column workbench into explicit mobile steps/tabs or sheets, add a semantic title, fix
   the visible error, and verify every step at 390px."* Shipped in commit `dd261354`: the
   five-step mobile shell (`setup/components/SetupStepper.tsx`), the missing `h1`, sticky
   commit bar, 40px/16px tap targets. **Two things remain: (a) the "visible error" could not
   be identified** — every error path in Setup is data-dependent, not structural, and nothing
   renders unconditionally at any width, so it needs the site he tested or a screenshot;
   **(b) nothing has been checked in a real browser at 390px** — the CSS was reasoned about,
   never seen. Do both before flipping the row out of `changes_requested`.
3. **Nothing downstream READS the planned topics.** Count-only families record researched titles
   at `plan.node.attributes.planned_topics` (`string[]` on the family hub; the brief marker block
   is a human mirror). No aidream generator, writer, or tool parses that key — the work order
   exists but nobody consumes it. Wiring it into the cms-fill / writer stage is the payoff step.
   (The "Create as pages" action is the other half: promoted titles become normal plan nodes the
   whole pipeline already understands.)
4. **The shell-header Agents panel can't see these agents.** `SurfaceBoundAgentsList` reads
   `agent.menu_surface`, a view over `platform.associations` JOINed to **`agent.card`**; all of these
   agents live in `agent.definition` only (`agent.card` 138 rows, `agent.definition` 723), so no
   binding edge can exist for them. The on-page buttons are the only entry point. Fix is a
   platform decision — promote them into `agent.card`, or teach the panel to resolve roles via
   `useSurfaceAgentRoles`, which DOES see them (all 12 content-plan role rows are bound).
5. **Bulk deepen.** Deepen is one node at a time. A fan-out over the existing server pipeline
   (progress + per-page results, no new agent) would make a 200-page plan practical.
6. **Reviewer needs its output contract sent by every caller.** `REVIEWER_OUTPUT_CONTRACT`
   (setup/ai.ts) rides on every run as `guidance` because without it the agent writes a summary
   naming six missing pages and returns ONE finding (measured, not guessed). If the stored prompt
   is ever fixed at the source, delete the constant — never keep both. Note: `agent_author
   update` with `goals` did NOT change the stored prompt.
7. **Deepen has no research picker of its own** — it reads the site's recorded link only. Fine
   today; for per-node grounding, add `research_topic_id` to the deepen body as generate has it.

## Done

- **Seven platform agents wired**, one per step — ids in Resources above. **All 12
  `ui.ui_surface_agent_role` rows across the content-plan surfaces are bound.**
- Every Setup step has AI staging into the view's own state: shape + counts, family page names,
  count-only topics, keyword binding, plan review — `features/marketing/content-plan/setup/`.
- Keyword binder resolves phrases against the site's real pool and drops anything unmatched, so
  an invented phrase cannot reach the DB — `setup/components/KeywordBindSection.tsx`.
- Staged brief writer on the node panel (review-then-save, distinct from Deepen's immediate
  server write) — `components/NodePanel.tsx`.
- Save-at-every-step draft persistence with unmount/commit flush — `setup/draft.ts`.
- ONE site↔research link (`settings.content_plan.research_topic_id`) read by both repos;
  generator + deepen grounded in the final Document — `aidream/services/content_plan/generator.py`.
- Entities "Suggest from research" (roster) AND "Attach to pages" (bulk node→entity edges through
  the canonical `attachNodeEntity` chokepoint, unresolvable labels/routes dropped and counted) —
  `components/EntityAttachDialog.tsx`. Plan review with one-click page creation from `gap` findings.
- Blog/guide topics: recorded on the hub (`attributes.planned_topics`) AND promotable into real
  pages — `setup/service.ts#promoteTopicsToPages`.
- Five adversarial review rounds plus an independent completeness sweep; every confirmed finding
  fixed —
  including a cross-org research-report exfiltration hole, a `send_warning` crash on the exact
  degrade path, and a draft-clear that destroyed staged topics. See the FEATURE.md change log.

## Decisions needed

**Should promoting blog titles into pages become the default instead of a button?**
Situation: a site shape with a Blog or Guides section deliberately plans only the section's hub
page and records "12 articles" as the target. The AI now writes those 12 titles from the research
report, saves them on the hub, and a "Create as pages" button turns them into real planned pages
on request. Nothing happens automatically.
Decide: keep it a deliberate click (today), or have a commit create those pages automatically
whenever titles exist — which would change what the site shapes mean for every site.

**Should these agents appear in the header Agents popover?**
Situation: the popover lists agents bound to a surface through `agent.card`; all of them exist only
as `agent.definition` rows, so they cannot be listed there — they are reachable only from the
buttons on the Setup and Entities pages. Every other surface with agents has the same split.
Decide: promote agents like these into `agent.card` when they are bound to a surface, or change
the popover to also show the role-bound agents it currently ignores.
