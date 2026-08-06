---
status: active
updated: 2026-07-30
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
- **Live agents** (agx, created via the AI Dream MCP; run them with `agent_run`):
  | Agent | id | Used by |
  |---|---|---|
  | Content Plan Shape Planner | `b600975c-fc8f-4f1d-ab36-670be436a038` | Setup "Recommend shape & counts"; `site_shaper` role |
  | Content Plan Family Namer | `7a16db8c-48eb-4997-a8d0-dc4a8892d7c5` | "AI names" (pages families) + "AI topics" (count-only) |
  | Content Plan Entity Curator | `c43e4497-3093-4b18-a906-b088127d8b9c` | Entities "Suggest from research"; `entity_curator` + `eeat_curator` roles |
  | Content Plan Reviewer | `2a7f0dc8-5525-437a-8f2e-35f12a45cb27` | Setup "Plan review"; `plan_architect` role |
  | Content Plan Keyword Strategist | `e063ded1-38b2-4721-a526-aad01d26e2ef` | Setup "Plan keywords" (WHOLE-plan, top-down) |
  | Content Plan Entity Attacher | `a1a7784c-538b-44e5-b09d-40d215b79aa6` | Setup "Assign entities" |
  | Content Plan Brief Writer | `711d29b5-0afc-494c-a665-6011e529efce` | NodePanel "Draft brief"; `brief_writer` role |
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

1. **DEPLOY the frontend.** aidream is **LIVE** (v0.1.706, `/health/version` = `6694767`,
   which contains the research-grounding commit) — so the server already accepts
   `research_topic_id` and the old deploy-order trap is gone. The FE half still sits on
   `claude/practical-euler-x4kjjc`: merge to `main` and run `./scripts/release.sh` (a plain
   push builds NOTHING).
2. **The shell-header Agents panel can't see these agents.** `SurfaceBoundAgentsList` reads
   `agent.menu_surface`, a view over `platform.associations` JOINed to **`agent.card`**; all four
   agents live in `agent.definition` only (`agent.card` has 138 rows, `agent.definition` 723), so
   a binding edge cannot be created for them. Today the on-page buttons are the only entry point.
   Fix is a platform decision: either promote these to `agent.card`, or teach the panel to resolve
   roles via `useSurfaceAgentRoles` (which DOES see them — all roles are bound in
   `ui.ui_surface_agent_role`).
3. **Nothing downstream READS the planned topics yet.** Same gap now applies to
   `attributes.keyword_strategy` (page role / supports / internal links) — the writers should
   read both. They are stored authoritatively at
   `plan.node.attributes.planned_topics` (a `string[]` on the family hub; the brief marker block
   is a human mirror only). No aidream generator, writer, or tool parses that key today — the
   work order exists but nobody consumes it. Wiring it into the cms-fill / writer stage is the
   payoff step.
4. **Count-only topics never become pages.** The archetype deliberately materializes only the
   hub. Turning titles into real planned pages is a new deliberate action ("promote topics to
   pages"), NOT a change to the expander: `setup/archetypes.ts` is a fixture-pinned twin of
   aidream's `archetypes.py` (`pnpm check:archetype-expansion`, 62 cases) and must not diverge.
   See the first Decision below.
5. **Deepen has no research picker of its own** — it reads the site's recorded link only. Fine
   today; if per-node grounding is ever wanted, add `research_topic_id` to the deepen body the
   same way generate has it.
6. **Reviewer needs its output contract sent by every caller.** `REVIEWER_OUTPUT_CONTRACT`
   (setup/ai.ts) is passed as `guidance` on every run because without it the agent writes a
   summary naming six missing pages and returns ONE finding (measured, not guessed). If the
   agent's stored prompt is ever fixed at the source, delete the constant — do not silently keep
   both. Note `agent_author update` with `goals` did NOT change the stored prompt.
7. **Bulk deepen** — the one approved item not built: fan out the existing research-grounded
   deepen over many pages with progress + per-page results (not a new agent).
8. **Re-review after research changes** — "what changed in the research since we planned?"

## Done

- Four platform agents created + model-pinned + smoke-tested — ids in Resources above.
- Setup steps have real AI (shape+counts, family names, count-only topics, plan review) staging
  into the view's own state — see `features/marketing/content-plan/setup/`.
- Save-at-every-step draft persistence with unmount/commit flush — `setup/draft.ts`.
- ONE site↔research link (`settings.content_plan.research_topic_id`) read by both repos;
  generator + deepen grounded in the final Document — `aidream/services/content_plan/generator.py`.
- Entities "Suggest from research"; plan review with one-click page creation from `gap` findings.
- ALL 11 content-plan agent roles bound in manifests + `ui.ui_surface_agent_role` (0 unbound).
- Top-down keyword strategy (money/supporting/internal links) — `setup/keyword-strategy.ts`.
- Whole-plan E-E-A-T attachment — `setup/entity-attach.ts`.
- Neighbour-aware staged brief writer — `hooks/useBriefWriter.ts`.
- Blog/guide topic planning: researched titles recorded on the family hub
  (`attributes.planned_topics` authoritative + a human-readable brief mirror), retryable via
  "Record on hub" without a commit.
- Three adversarial review rounds (20 + 12 + 21 agents); every confirmed finding fixed —
  including a cross-org research-report exfiltration hole, a `send_warning` crash on the exact
  degrade path, and a draft-clear that destroyed staged topics. See the FEATURE.md change log.

## Decisions needed

**Should researched blog/guide titles become real planned pages?**
Situation: when a site shape includes a Blog or Guides section, the shape deliberately creates
only the section's hub page and records "12 articles" as the target — the individual titles were
always meant to come later from research. The AI now produces those titles from the company's
research report, and they are saved onto the hub page as its work order, but no page rows are
created for them.
Decide: leave them as a recorded work order for the writers (today's behavior), or add a button
that turns the titles into real planned pages so they show up in the tree, the table, and the
CMS pipeline like every other page.

**Should these four agents appear in the header Agents popover?**
Situation: the popover lists agents bound to a surface through `agent.card`; these four exist only
as `agent.definition` rows, so they cannot be listed there — they are reachable only from the
buttons on the Setup and Entities pages. Every other surface with agents has the same split.
Decide: promote agents like these into `agent.card` when they are bound to a surface, or change
the popover to also show the role-bound agents it currently ignores.
