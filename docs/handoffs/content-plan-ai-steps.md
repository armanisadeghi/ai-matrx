---
status: active
updated: 2026-08-16
chips: [content_plan.review_queue.mobile_headings_pass, content_plan.planned_topics_unread, content_plan.setup_ai_untested_coercers]
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

> **Everything in Done is LIVE.** Re-verified 2026-08-15 against `main` (matrx-frontend
> v0.4.623, aidream v0.2.83). There is no unshipped content-plan work. The gap between
> "built" and "accepted" is the review queue, not deployment — see Remaining work #1.
>
> **Do not re-audit this feature against THE FLOATING LAW.** `live-run-streaming-sweep.md`
> lists "Content-plan surfaces" under *Verified compliant — do not re-audit*. The one live
> exception is the in-tab run lifetime, which is item #6 below, not a spinner finding.

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

> Four items are live assist chips in Arman's dock (`platform.assists`, dedupe
> keys in the frontmatter) — each opens its own evidence. Delete the chip when
> you finish the item.

1. **THE BLOCKER — 21 review-queue rows for this feature, 0 approved (12
   `changes_requested`, 9 `pending`), and the 12 rejections are mostly ONE defect repeated.**
   Counts re-read from `agent.review_queue` on 2026-08-15; the queue has grown by three
   `pending` rows since 2026-08-13 and still has no approval on it. Across the 12 rejections:
   **no semantic page heading (9)**, **mobile controls under
   40–44px (7)**, **390px clipping / no mobile drill-down (7)**. Verified in code, not inferred
   (re-run 2026-08-15, both counts unchanged):
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
2. ~~**The page-template library is built but never seeded.**~~ **DONE 2026-08-16** — aidream
   migration `0371_seed_page_template_library.sql` (applied live) seeded the 17
   `BUILTIN_TEMPLATES` onto `plan.profile.template_map.templates`, so the option can now be
   chosen. **Templates remain an OPTION and are NEVER required** — no flag, gate, or default-on
   behaviour was added, and a profile with no `templates` key still realizes an empty body.
   Proved end to end on the throwaway site `d194-template-proof`; docs in
   `aidream/services/content_plan/FEATURE.md` § Page templates; 30 tests in
   `aidream/services/content_plan/tests/test_templates.py`. Chip resolved.
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
5. ~~**Nothing downstream READS `attributes.planned_topics` / `attributes.keyword_strategy`.**~~
   **DONE 2026-08-15.** `aidream/services/content_plan/page_pipeline.py` reads both: the family
   analyst (p3) reads the hub's `planned_topics` as the family's work order and the node's
   `keyword_strategy` for page role + planned internal links; the writer (p4) obeys the resulting
   placement; the builder (p6) renders the planned links with their anchor text. Proven live on
   `/hair-restoration` (prpinjectionmd). **Delete the chip.** Remaining slice: the whole-site
   `cms_fill` fan-out still authors in one call per page — see
   `website-factory-vision.md` item 4.
6. **Web-search fallback grounding** for the "no research, no website" case — arm the
   shape/namer agents with web search via `agent_author`. See the open decision below first.
7. **Harden the quick-research chain — the one live FLOATING-LAW remainder here.**
   `useCompanyQuickResearch` drains the run stream in the tab; navigating away mid-run leaves the
   pipeline finished but Document assembly unfired. That is class D ("dies on refresh") in
   `live-run-streaming-sweep.md`, not a spinner finding — the progress feed itself is real and
   already audited compliant. Either resume-detect on return (topic linked + syntheses > 0 + no
   document → offer "Assemble report") or add a server-side run-then-document endpoint;
   `useSiteCommandRun` is the primitive to copy.
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
    agent schema and the database — if a prompt changes shape upstream nothing fails loudly;
    malformed output is simply shaped into something wrong. aidream's `test_setup_agents.py`
    proves the pattern for its three server twins. Live chip.

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
  Content-plan surfaces are listed *Verified compliant — do not re-audit* in
  `live-run-streaming-sweep.md`. Platform rollout continues in `live-stream-everywhere.md`.
- **Keyword Intelligence no longer 500s.** This was item 0 and the top decision on this doc:
  `seo.search_performance_daily` (13.2M rows) had an RLS policy that materialized an array of
  every accessible row id, timing out every `authenticated` read and every `security_invoker`
  view over it. Fixed by re-shaping the predicate — verified live 2026-08-15, `std_select` now
  resolves through `run_id` / `page_id` / `site_id` against their own entity tokens (~16.5s →
  200ms, equivalent visibility). Its assist chip is resolved.
- Research creatable FROM Setup (`useCompanyQuickResearch`), auto-linked to the site.
- "Build with AI" guided intake — `setup/components/BuildWithAiDialog.tsx`.
- Save-at-every-step draft persistence with unmount/commit flush — `setup/draft.ts`.
- ONE site↔research link (`settings.content_plan.research_topic_id`) read by both repos.
- Bulk deepen over empty-brief pages — `usePlanBulkDeepen`.
- Topic promotion: `attributes.planned_topics` + confirmed "Create as pages".
- Header Agents popover shows role-bound agents platform-wide — `SurfaceBoundAgentsList`.
- Nine adversarial review rounds plus an independent completeness sweep; all confirmed findings
  fixed — see the FEATURE.md change log.
- Error-inspector classification fixed at the source so the real red on this route stops being
  buried: a producer's own `level`/`recoverable` are now first-class capture fields the tier
  rules can match (they were unreachable inside a stringified blob), a self-declared recoverable
  stream warning lands orange, and the assists dedupe race — which `features/assists/service.ts`
  already treats as success — lands yellow. Non-recoverable warnings and the statement timeout
  stay RED, pinned by `lib/diagnostics/errorTierRules.test.ts`.
- **Two agents with no runtime consumer, surfaced for a human ruling** — Keyword Binder
  `8ffb091c-dccf-4550-a14f-95807fd96b95`, Brief Writer `f9789816-91b9-4e64-a38d-aa4d2a8127be`.
  Both were superseded by the slot-bound step agents above and are referenced by nothing.
  **Do not delete them on your own authority**: per the unfinished-work alarm
  (`common-docs/policies/unfinished-work-alarm.md`), a purpose-built artifact with no consumers
  is unfinished work until Arman names it dead in writing. Leaving them dormant costs nothing.

## Decisions needed

**The review queue is 21 rows deep with nothing approved. Do you want a single mobile +
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
