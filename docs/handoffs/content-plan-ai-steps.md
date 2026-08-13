---
status: active
updated: 2026-08-13
repos: [matrx-frontend, aidream]
vision:
  - /Users/armanisadeghi/code/common-docs/systems/content-planning/FEATURE.md
  - /Users/armanisadeghi/code/common-docs/systems/cms-system/CMS-BUILDOUT-HANDOFF.md
---

# Content Plan — an AI at every step, grounded in the resources we already have

Sibling pointers: the plan→CMS→live pipeline work order lives in
`common-docs/systems/cms-system/CMS-BUILDOUT-HANDOFF.md` (aidream's
`docs/handoffs/content-plan-server.md` routes there too), and the pipeline
architecture spine is [`website-factory-vision.md`](./website-factory-vision.md) —
its P1/P2 research-artifact wiring converges with items 1 and 3 below; sync with it
when either lands. **This doc owns one thing they don't: the AI steps and their
grounding in resources.**

> **Everything in Done is LIVE.** Verified 2026-08-13: matrx-frontend `main` = v0.4.547
> (aimatrx.com serves it), aidream `/health/version` = `044f77c8` = `origin/main` (v0.2.56).
> There is no unshipped content-plan work. The gap between "built" and "accepted" is the
> review queue, not deployment — see Remaining work #1.

## Vision — Arman's words

2026-08-08, on the Setup work order (site shapes):

> "I've clicked the option for local services… one of the options is services. Well, that's
> great, and you can change the number of services, but then I have to put in the names of the
> services myself. But considering that, for this particular case, I have research that I've
> already done, or maybe I could even have a website that the company already has, or maybe I
> wanna base it after a competitor… it would make a lot more sense if I could sort of click
> something and an agent could help me get that part done."

> "more intelligently wouldn't be just the names of the pages, but some information about them
> as well."

> "when it comes to things like the individual pages, that's a different story… the agent can do
> it at the next stage. But for services, or if it's multilocation to get the individual
> locations… I think it makes a lot of sense to just have an agent quickly do this. And also
> just sort of having an agent who can help. But the key is to be able to give the agent
> resources. So we need an easy way to be able to point the agent at some research that's
> already been done, or at some other things, assets and resources that we already have. I think
> that's the big thing."

> "the other thing that we should do as a very simple extension of that is simply having an
> agent where you have an option of setting the sort of the style of site you want — such as
> micro or small or whatever — and then giving the agent some resources again. Again, whether
> it's research, brand research, or some content you put in, or a website, or some guidance you
> give the agent and it does web search or just some basic web searches or something, but then
> it creates this for you. So it at least sets up the work order to the point where you're ready
> to just hit go."

> "if some already exist, don't recreate things that we already have — let's focus on either
> integrating them properly so they're easily and clearly seen here, or let's build the ones
> that we need and make sure we do it correctly through the canonical agent slot system."

Earlier (2026-07, still binding): *"all we wanna do is we wanna create an agent at each of
those steps"* · *"our agents have inputs that they take, so variables… or they can output a
structured content IR kind"* · *"we already have research… one research report on a company
brand takes fifty to a hundred AI calls to get… All we have to do is give that as context to an
AI"* · *"it needs to save at every single step"* · *"I want each step to be real, have an AI
integration and to then actually create the plan and build on it and save and persist."* On
research linking: start with the final report (the "Document"), user picks the topic.

## Resources

- **Feature truth:** [`features/marketing/content-plan/FEATURE.md`](../../features/marketing/content-plan/FEATURE.md)
  (client) · `aidream/services/content_plan/FEATURE.md` (server). Read both before touching this.
- **The AI runner:** `features/marketing/content-plan/setup/ai.ts` — slot constants, output
  coercion, variable builders, `useSetupAgents`; runs through `useLiveAgentRun` so every step
  streams into `<LiveRunDisplay>`.
- **Agent slots (canonical, verified live 2026-08-13):** `agent.slot_definition` holds all seven
  `content_plan.*` slots, every one `is_enabled` with a `default_agent_id` bound. Resolution is
  `resolveAgentSlot` (`features/agents/slots/service.ts`) — platform default overlaid with the
  user's `agent.slot_binding`; an unseeded/disabled/version-pinned slot THROWS with the reason and
  never falls back. Server declarations: aidream `agent_slots/client_slots.py`. **Never a raw UUID
  in a component.** Rebind UI: `/agents/slots` (user), `/administration/agents/slots` (admin).
  **Known platform gap:** `launchAgentExecution` consumers — content-plan named explicitly in
  `features/agents/slots/FEATURE.md` — apply a binding's *agent* but not its `config_overrides`,
  so a model/thinking-only override is silently inert here.
- **Where each agent RUNS is split, and the split is easy to get wrong.** Server-run since
  2026-08-11 (aidream `services/content_plan/setup_agents.py`, routes
  `POST /api/content-plan/sites/{id}/keyword-strategy | entity-attachments | review`):
  keyword strategist, entity attacher, plan reviewer. Server-run separately: brief writer
  (`brief_writer.py`). Still CLIENT-run: shape planner, family namer, entity curator.
  `client_slots.py` marks the moved ones with `# NOTE: server-run since 2026-08-11`; the three
  without that note are the client ones.
- **Proposals are persisted, not held in memory:** server runs write
  `web.site.settings.content_plan.<kind>_proposal` (`{result, run_id, slot_key, agent_id,
  model_id, generated_at, applied_at}`), re-reading the Site row first so they never clobber the
  client's autosaved `setup_draft`. Client reads them back — the stream carries only a summary.
- **Grounding exemplar — the research Context Builder:** `features/research/resources/`
  (manifest → selector → bundle → `resolveBundle` → `runtime.variables` + `runtime.context`) +
  `features/research/components/resources/ContextBuilder.tsx`. This is the pattern for "point the
  agent at existing assets". Do NOT copy the image-studio create→addResource→execute workaround
  (`useImageStudio.ts`, tagged KNOWN ANTI-PATTERN).
- **Known platform gap:** `ManagedAgentOptions` has no `resources` field — grounding travels as
  variables/context, never a launch-time resource attachment.
- **Server grounding:** `generator.py` (`_load_research_report`, `_research_section`,
  `_user_can_read_topic` — `iam.has_access_for`, fail-closed; caps 160k generate / 60k deepen).
  `research_topic_id` is accepted on generate (`GeneratePlanRequest`, `extra="forbid"`);
  precedence is request id → the site's recorded link. Deepen grounds from the site link only
  and degrades loudly when the report is missing.
- **Skills:** `matrx-agents`, `agent-execution-redux`, `surface-authoring`, `core-route-headers`,
  `ios-mobile-first`, `agent-review-queue`, `handoffs`.
- **Test route:** `/marketing/content-plan` → site → `?view=setup`. Needs a branded site + a
  research topic with a successful Document. Login per CLAUDE.md. Topics with live reports:
  `62465c78-fddd-458e-9f5e-0fb8193c6c18` (All Green),
  `36806c3f-e151-4dd0-bfd9-55f25fb7d655` (PBW Law), `b4c47842-64dc-4e7a-95c6-a0a69eee0fbe`
  (Nazarian), `08ec80da-a84c-475a-b6a5-443727e6cef6` (PRP).

## Remaining work

1. **THE BLOCKER — 18 review-queue rows for this feature, 0 approved (12
   `changes_requested`, 6 `pending`), and the 12 rejections are mostly ONE defect repeated.**
   Counted 2026-08-13 across all 12: **no semantic page heading (9)**, **mobile controls under
   40–44px (7)**, **390px clipping / no mobile drill-down (7)**. Verified in code, not inferred:
   the entire `features/marketing/content-plan/` tree contains **zero `<h1>`** (and the shell's
   `PageHeader` supplies none — consumers pass their own, per
   `features/shell/components/header/variants/USAGE.md`), and exactly **one** file in the whole
   feature calls `useIsMobile()` (`ContentPlanWorkbench` — **Setup itself uses none**; its mobile
   story is one CSS-stacked column below `md`, with per-control `h-9 md:h-7` touch fixes and
   `text-base sm:text-sm` zoom guards). Fix the class once across the feature — list page,
   workspace, Setup, node panel — then re-submit every row. Skills: `core-route-headers`,
   `ios-mobile-first`. Two rows are blocked on something else and need a
   fixture, not code: `8e2e600c` and `f5ecb011` cannot be reviewed because the supplied site has
   no CMS counterpart, so "Make it real" rungs 2–5 are uninspectable without mutating
   production — **supply a stable, already-linked review site**. One (`fbf59d2a`) just needs its
   URL corrected to the current canonical skills route.
2. **The page-template system shipped but is INERT in production.** aidream
   `services/content_plan/templates.py` (916 lines) resolves a per-node HTML scaffold from
   `plan.profile.template_map.templates`, and `cms_reconciler` writes it into the page body on
   realize. Verified live 2026-08-13: **no `plan.profile` row has a `templates` key** — all six
   rows carry only `archetypes`/`concepts` — and nothing in either repo seeds one
   (`BUILTIN_TEMPLATES`, its 18 templates, is referenced only by its own definition). So realize
   still writes empty bodies and the `cms_fill` scaffold branch never fires. Seed the library
   from `BUILTIN_TEMPLATES` via migration, then verify a realize writes a scaffold. It is also
   undocumented — no `FEATURE.md` section, no Change Log entry, no `/templates` route in the
   registration map, and **no test file**.
3. **Generalize the grounding strip beyond research.** Still missing as grounding inputs:
   **competitor URLs**, **pasted content/notes**, **free-text guidance**. Persist each in
   `setup_draft` (`setup/draft.ts`), resolve to text at the call site (research-bundle pattern),
   and feed ONE shared `reference_material` block into every `content_plan.*` run. URL → text
   needs a fetch path: prefer an existing aidream scrape/extract endpoint over anything new.
4. **Names + information, not names alone.** `family_namer` returns bare `names`; Arman wants
   "some information about them as well." Extend the slot's output contract to `{name, note}`
   (agx agent + `coerceFamilyNames` + `required_output_keys` in `client_slots.py`), stage the
   note as the child node's `brief` seed so it persists on commit. Keep coercion
   backward-tolerant (plain strings still accepted).
5. **Nothing downstream READS `attributes.planned_topics` / `attributes.keyword_strategy`.**
   Re-verified 2026-08-13: the frontend writes both (`setup/service.ts`,
   `setup/keyword-strategy.ts`); a full-repo search of aidream returns **zero** matches for
   `planned_topics` in any file. Wiring them into the cms-fill / writer stage is the payoff step.
6. **Web-search fallback grounding** for the "no research, no website" case — arm the
   shape/namer agents with web search via `agent_author`. See the open decision below first.
7. **Harden the quick-research chain.** `useCompanyQuickResearch` drains the run stream in the
   tab; navigating away mid-run leaves the pipeline finished but Document assembly unfired.
   Either resume-detect on return (topic linked + syntheses > 0 + no document → offer "Assemble
   report") or add a server-side run-then-document endpoint.
8. **Reviewer output contract** (`REVIEWER_OUTPUT_CONTRACT`) must ride every reviewer call until
   the stored prompt is fixed at the source — then delete the constant, never keep both.
9. **Deepen has no per-run research picker** — add `research_topic_id` to the deepen body like
   generate if per-node grounding is wanted.
10. **Re-review after research changes** — "what changed in the research since we planned?"
11. **File the launcher-resources gap** (platform, not this feature): `ManagedAgentOptions`
    cannot carry launch-time resources. Belongs to the execution-system owners.
12. **The AI half has almost no tests.** Seven test files exist (`draft.test.ts`, `lint`,
    `readiness`, `entity-write-targets`, `page-reality`, `tree-view`, `pillar-map/layouts`) —
    none covers `setup/ai.ts`'s coercers, `keyword-strategy.ts`, `entity-attach.ts`,
    `proposals.ts`, or `drift.ts`. The coercers are the one thing standing between a drifting
    agent schema and the database; aidream's `test_setup_agents.py` proves the pattern for its
    three server twins.

## Done

- **Seven step agents, live and slot-bound** — shape planner, family namer (also count-only
  topics), entity curator, entity attacher, keyword strategist, plan reviewer, brief writer, plus
  "Build with AI" which chains shape → names → topics in one go. Verified 2026-08-13: **no Setup
  step is missing its AI**, and **nothing an agent produces reaches the plan without an explicit
  user action** (Create N pages / Record on hub / Create as pages / Apply to plan / Add page /
  Use this brief). The one automatic write is the server persisting a *proposal* to site settings.
  Deepen is the deliberate exception: it commits brief + sources immediately.
- Three of them (keyword strategy, entity attach, review) plus brief writing moved SERVER-side
  with durable proposals — `aidream/services/content_plan/setup_agents.py` + `brief_writer.py`.
- Live streaming everywhere in this feature (`useLiveAgentRun` + `<LiveRunDisplay>`); no spinners.
  Platform rollout continues in `docs/handoffs/live-stream-everywhere.md`.
- Research creatable FROM Setup (`useCompanyQuickResearch`), auto-linked to the site.
- "Build with AI" guided intake — `setup/components/BuildWithAiDialog.tsx`.
- Save-at-every-step draft persistence with unmount/commit flush — `setup/draft.ts`.
- ONE site↔research link (`settings.content_plan.research_topic_id`) read by both repos.
- Bulk deepen over empty-brief pages — `usePlanBulkDeepen`.
- Topic promotion: `attributes.planned_topics` + confirmed "Create as pages".
- Header Agents popover shows role-bound agents platform-wide — `SurfaceBoundAgentsList`.
- Nine adversarial review rounds plus an independent completeness sweep; all confirmed findings
  fixed — see the FEATURE.md change log.
- **Two orphaned agents to delete or leave dormant** (superseded, referenced by nothing):
  Keyword Binder `8ffb091c-dccf-4550-a14f-95807fd96b95`, Brief Writer
  `f9789816-91b9-4e64-a38d-aa4d2a8127be`.

## Decisions needed

**The Keyword Intelligence window is dead for every signed-in user, and the fix
is a security-policy change somebody has to own.**
Situation: opening a keyword from a plan node returns HTTP 500 every time.
`seo.search_performance_daily` has 13.2 million rows, and its row-level security
policy answers "which rows may this user see?" by building a list of *every*
matching row id — 13,183,309 of them. Just counting that list takes 44.6
seconds; the database gives a page 8 seconds before it gives up. So the query
never had a chance, on any site, including sites with no data at all. The same
pattern will hit any other large table registered the same way.
Decide: who makes the policy change (it is the platform's shared access kernel,
and CLAUDE.md forbids an agent changing a security layer on its own authority),
and whether the correction is scoped to this table or made in the kernel for
every large table at once. Full evidence: `FOUND_DEFECTS.md` D182.


**The review queue is 18 rows deep with nothing approved. Do you want a single mobile +
headings pass across the whole Content Plan feature before anything else?**
Situation: every rejection you wrote names the same handful of problems — no page heading,
controls too small to tap, content clipping at phone width. The features themselves are built and
live; they keep failing review on presentation. One focused pass could clear most of the queue.
Decide: do that pass first, or keep adding capability and accept that the queue stays red.

**Should promoting researched titles into pages become automatic?**
Today a count-only family (blog, guides) stays hub-only and the user explicitly confirms "Create
as pages." Making it automatic changes what count-only families mean for every site.

**Web search for setup agents: which mechanism?**
Arming the shape/namer agents with the platform's web-search tooling is a server-side agent
definition change and adds cost and latency to every click. Decide: always on, only when no other
grounding is selected, or a separate "research-lite" fallback later.
