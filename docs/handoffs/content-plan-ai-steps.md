---
status: active
updated: 2026-08-08
repos: [matrx-frontend, aidream]
vision:
  - /Users/armanisadeghi/code/common-docs/systems/content-planning/FEATURE.md
  - /Users/armanisadeghi/code/common-docs/systems/cms-system/CMS-BUILDOUT-HANDOFF.md
---

# Content Plan — an AI at every step, grounded in the resources we already have

Sibling pointers: [`content-plan-client.md`](./content-plan-client.md) and aidream's
`docs/handoffs/content-plan-server.md` route the plan→CMS→live pipeline work to the
common-docs work order. **This doc owns one thing they don't: the AI steps and their
grounding in resources.**

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
- **The AI runner:** `features/marketing/content-plan/setup/ai.ts` — slot resolution
  (`resolveAgentSlot`), output coercion, variable builders, `useSetupAgents`. Headless
  `launchAgentExecution` + JSON extraction.
- **Agent slots (canonical):** server declarations in aidream
  `aidream/services/agent_slots/client_slots.py` (`content_plan.*`, seven slots with
  `required_variables` / `required_output_keys`). New setup agents are new slots there +
  consumption in `setup/ai.ts` — never raw UUIDs in components.
- **What's already wired in Setup** (don't rebuild): research-topic grounding strip
  (`setup/components/SetupAiBar.tsx`), "Recommend shape & counts" (shape_planner), per-family
  "AI names" / "AI topics" (family_namer, `SetupWorkOrderColumn.tsx` count rows), keyword
  strategy, entity curation/attach, plan review, brief writer, draft persistence
  (`setup/draft.ts`).
- **Grounding exemplar — the research Context Builder:**
  `features/research/resources/` (manifest → selector → bundle → `resolveBundle` →
  `runtime.variables` + `runtime.context`) + `features/research/components/resources/ContextBuilder.tsx`
  (~line 468 shows the canonical `launchAgent` call with resolved resources). This is the
  pattern for "point the agent at existing assets" — resolve to variables/context refs at the
  call site; do NOT use the image-studio create→addResource→execute workaround
  (`useImageStudio.ts` ~943, tagged KNOWN ANTI-PATTERN).
- **Known platform gap:** `ManagedAgentOptions` has no `resources` field — you cannot attach an
  `instanceResources` entry at launch. Grounding therefore travels as variables/context.
- **Form-with-AI exemplar:** `features/agents/components/smart/CreateWithAiTabs.tsx` (manual
  tab + agent tab; live consumer `ProjectCreatePanel.tsx`).
- **Server grounding:** `aidream/services/content_plan/generator.py` (`_load_research_report`,
  `_research_section`, `_user_can_read_topic`; `SITE_RESEARCH_TOPIC_KEY` twin in
  `archetypes.py`). Site crawl facts: `reconciler.py` over `web.page`; scraping lives in
  `packages/matrx-scraper`.
- **Live agents** (agx, via AI Dream MCP `agent_run`): Shape Planner `b600975c-fc8f-4f1d-ab36-670be436a038` ·
  Family Namer `7a16db8c-48eb-4997-a8d0-dc4a8892d7c5` · Entity Curator `c43e4497-3093-4b18-a906-b088127d8b9c` ·
  Reviewer `2a7f0dc8-5525-437a-8f2e-35f12a45cb27` · Keyword Strategist `e063ded1-38b2-4721-a526-aad01d26e2ef` ·
  Entity Attacher `a1a7784c-538b-44e5-b09d-40d215b79aa6` · Brief Writer `711d29b5-0afc-494c-a665-6011e529efce`.
- **Skills:** `matrx-agents`, `agent-execution-redux`, `surface-authoring`, `handoffs`.
- **Test route:** `/marketing/content-plan` → site → `?view=setup`. Needs a branded site + a
  research topic with a successful Document. Login per CLAUDE.md. Topics with live reports
  (verified 2026-07-30): `62465c78-fddd-458e-9f5e-0fb8193c6c18` (All Green),
  `36806c3f-e151-4dd0-bfd9-55f25fb7d655` (PBW Law), `b4c47842-64dc-4e7a-95c6-a0a69eee0fbe`
  (Nazarian), `08ec80da-a84c-475a-b6a5-443727e6cef6` (PRP).
- **Review queue row:** `agent.review_queue` id `2ca8190e-93d5-407a-ab9c-8607436d2bfb`.

## Remaining work

1. **Generalize the grounding strip beyond research.** Research is now creatable in place
   (Done); still missing as grounding inputs: **competitor URLs**, **pasted content/notes**,
   and **free-text guidance**. Persist each in `setup_draft` (`setup/draft.ts`), resolve to
   text at the call site (research-bundle pattern), and feed ONE shared `reference_material`
   block into every `content_plan.*` slot run (shape, names, topics, entities, review).
   URL → text needs a fetch path: prefer an existing aidream scrape/extract endpoint over
   anything new; if none is cleanly callable, that's a small server work item, not a client
   hand-roll.
2. **Names + information, not names alone.** `family_namer` returns bare `names`; Arman wants
   "some information about them as well." Extend the slot's output contract to
   `{name, note}` pairs (update the agx agent + `coerceFamilyNames` + `required_output_keys` in
   `client_slots.py`), stage the note as the child node's `brief` seed in the expansion so it
   persists on commit. Keep backward-tolerant coercion (plain strings still accepted).
3. **Web-search fallback grounding.** For the "no research, no website" case, arm the shape/
   namer agents with web search (server-side agent definition change via `agent_author`) —
   Arman explicitly wants "it does web search or just some basic web searches". See the open
   decision below before wiring.
4. **Harden the quick-research chain.** `useCompanyQuickResearch` drains the run stream in the
   tab; if the user navigates away mid-run the server finishes the pipeline but Document
   assembly never fires. Options: resume detection on return (topic linked + syntheses > 0 +
   no document → offer "Assemble report"), or a server-side run-then-document endpoint.
5. **Nothing downstream READS `attributes.planned_topics` / `attributes.keyword_strategy`** —
   stored authoritatively on hub nodes, consumed by no generator/writer/tool. Wiring them into
   the cms-fill / writer stage is the payoff step.
6. **Reviewer output contract** (`REVIEWER_OUTPUT_CONTRACT` in setup/ai.ts) must be sent by
   every caller until the stored prompt is fixed at the source — then delete the constant.
7. **Deepen has no per-run research picker** — reads the site's recorded link only; add
   `research_topic_id` to the deepen body like generate if per-node grounding is wanted.
8. **Re-review after research changes** — "what changed in the research since we planned?"
9. **File the launcher-resources gap** (platform, not this feature): `ManagedAgentOptions`
   cannot carry launch-time resources; image-studio's workaround is the standing evidence.
   Belongs to the execution-system owners; reference it, don't work around it here.

## Done

- Research creatable FROM Setup — "Research this company" runs the whole pipeline headlessly
  via `features/research/hooks/useCompanyQuickResearch.ts`; topic auto-selected + site-linked,
  picker refreshes (`ResearchTopicSelect` `refreshKey`), report lands in the bar (2026-08-08).
- "Build with AI" guided intake — the bar's primary button opens a hints dialog (size feel,
  single/multi location, notes; never commitments — `buildGuidanceInputs`), runs research first
  when none exists, then drafts shape → family names → count-only topics, all staged
  (`setup/components/BuildWithAiDialog.tsx`); single-step demoted to "Shape only" (2026-08-08).
- `site_context` real (`buildSiteContext` in setup/ai.ts); "Name with AI" solid button on
  unnamed families (2026-08-08).
- Header Agents popover shows role-bound agents platform-wide — `SurfaceBoundAgentsList`.
- Seven platform agents created + slot-declared (`agent_slots/client_slots.py`) + smoke-tested.
- Setup steps have real AI (shape+counts, family names, count-only topics, keyword strategy,
  entity curation/attach, plan review) staging into view state — `setup/`.
- Save-at-every-step draft persistence with unmount/commit flush — `setup/draft.ts`.
- ONE site↔research link (`settings.content_plan.research_topic_id`) read by both repos;
  generator + deepen grounded in the final Document — `generator.py`.
- Bulk deepen over empty-brief pages — `usePlanBulkDeepen` (2026-08-07).
- Topic promotion: `attributes.planned_topics` + confirmed "Create as pages".
- Three adversarial review rounds; all confirmed findings fixed (see FEATURE.md change log).

## Decisions needed

**Should promoting researched titles become automatic?** Today the archetype stays hub-only and
the user explicitly confirms "Create as pages." Making it automatic changes the meaning of
count-only families for every site.

**Web search for setup agents: which mechanism?** The setup agents are client-run agx agents.
Arming them with the platform's web-search tooling is a server-side agent definition change and
adds cost/latency per click. Decide: arm shape/namer agents with search always, only when no
other grounding is selected, or ship a separate "research-lite" fallback later.
