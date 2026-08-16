---
status: active
updated: 2026-08-16
repos: [matrx-frontend, aidream, my-matrx]
vision: [this doc §Vision — Arman's words, 2026-07-30 chat]
---

# Website Factory — from content plan to agent-built professional sites

The system that takes a `web.site` content plan and produces a real, professional, multi-page
website through many specialized agent steps. This doc is the tracking spine: Arman's vision,
where each missing piece inserts into what exists today, and the ordered work list.
Point-fix defects found in the same audit are assignable one-by-one on
[website-factory-bug-dispatch.md](./website-factory-bug-dispatch.md) (WF-1…WF-12).
The AI steps inside the plan editor (Setup agents, grounding strip) are owned by
[content-plan-ai-steps.md](./content-plan-ai-steps.md) — its grounding items converge
with P1/P2 research-artifact wiring here; sync when either lands.

## Vision — Arman's words (2026-07-30)

> "The keys to building a website… if we're building a brand new website we're gonna get the plan
> and then we're gonna trigger sort of like this starting thing, but before you start there are
> some core things a website has to have… the basic structure of what core pages do we have —
> homepage, about, pages like that — but that's not really the most important part. Then you need
> your primitives: you need your menu, you need your footer, you need your core reusable things,
> you need your CSS — styling — because we're trying to build a very very very professional
> high-end website. We're not trying to throw some crap together."

> "This is not the type of website where one agent is just gonna bust it out in one session. Most
> likely you're gonna have extensive keyword research, and then extensive content research, and
> then it's gonna be brought together and the content is gonna be compared to the pages that are
> in the same family to determine what should go into this page and what shouldn't, and then the
> content is gonna be written, and then it's gonna be improved, and it's gonna be fact-checked and
> optimized — imagine after all that maybe 10 AI agents involved — and then you finally give it to
> an agent and say OK, go build the page."

> "When you tell one agent to build an entire website that's very very different than having
> individual agents who are building each part and the parts coming together… In order for us to
> use it for real, we need to build a website properly from the ground up, and that means creating
> all of the reusable components, making sure that the CSS is solid, making sure that we have core
> structures, making sure that ~~no page is created without a prebuilt template~~. It doesn't mean
> you can't have custom pages — it means you build your service pages on some sort of a template,
> and you have your headers, your footers, your menus, your colors — all that stuff needs to be
> predetermined so that we're not just vibecoding some little crappy website."

> 🚨 **The struck sentence above was RETRACTED by Arman on 2026-08-16 — read the retraction before
> acting on anything template-shaped.** He was using "template" to mean a **themed page** (shared
> global CSS, header, menu, footer/sidebar, optionally reusable components like a consistently
> sized banner) — *not* a required template entity. **Templates are an OPTION and are never
> required; there is nothing to opt out of and no flag to build.** The standing requirement is the
> THEME. Canonical ruling, in his own words:
> `common-docs/systems/content-planning/FEATURE.md` § TEMPLATES ARE AN OPTION, NEVER A REQUIREMENT.
> The quote is kept here struck rather than deleted so nobody re-derives the mistake from the
> original chat.

> "You don't always have to have primitives — some companies would rather each page use the core
> theme but be slightly different — so that can happen too."

> "We need to identify the exact points where we can insert these things, and it doesn't mean
> we're gonna turn off the one button that does it all. In fact that IS the ultimate goal — one
> button that builds the entire site. But what I'd rather see today is a button that builds the
> site just like now, **but the steps are still in there**. When there are no steps, that's a very
> different story than if the steps are there but right now we skip over them… The end result is:
> to build a 25-page website it will be approximately 200–300 calls to AI. Right now it's one. If
> we go from one to 10, and at each step a call is being made, and each page is being built
> independently, that already gets us a lot closer. But we don't want to stop what we have now
> that might be working."

> "It's really all about this swarm of specialized agents and then agent managers who manage a
> lot of it… we're probably gonna have over 200 agents between deciding to build a website and
> building it. I want an expert location-page builder, blog builder, this builder, that builder…
> where do we have expert agents and where do we have an agent who we expect to do it all? There
> are agents who can do it all, but it doesn't make sense because it's too expensive, too slow,
> we're not gonna get the high-quality results we want, and we might end up getting a lot of the
> same-looking websites. The way we fix that is individual agents who handle different parts —
> but then they also have to have the right context."

**(inferred) The architectural ruling this implies:** the one-shot `cms_fill` pass (brief → HTML
in a single LLM call) is not "step 1 of the vision" — it is a placeholder that skips every step.
The build order is: make the PIPELINE exist as explicit, individually-runnable, persisted steps
(each step may start dumb or even pass-through), keep the one button running the whole pipeline
end-to-end, then deepen each step with specialist agents over time. Steps that exist but are
skipped ≠ steps that don't exist.

## The target pipeline and the exact insertion points

Per SITE (once, "the starting thing"):

| Step | Exists today? | Where it inserts |
|---|---|---|
| S1. Content plan (tree of pages, briefs, keywords) | ✅ works | `/marketing/content-plan/[siteId]`; `plan.node` (821 live nodes); generator `aidream/aidream/services/content_plan/generator.py` |
| S2. Site shell: theme CSS, header+menu, footer | ✅ works | `starter_kit` seeds all three; human Install button on `/cms/[siteId]/settings` (WF-7) and real theme/nav/footer editors with in-place AI (WF-6 + AI-everywhere). Renderer theme wiring fixed (WF-1). |
| S3. Design system: curated section/block library (hero, cards, CTA, FAQ, pricing…) per site | ❌ none | New: block library the starter kit installs (site CSS + reference markup); consumed by S4 and P6 |
| S4. Page templates — **AN OPTION, NEVER A REQUIREMENT.** Retired as a requirement twice: 2026-08-07 (*"my comments were silly … figure it out and remove that from the vision"*) and definitively 2026-08-16, where Arman explained that "template" had always meant a **themed page** — shared global CSS, header, menu, footer/sidebar, optionally reusable components like a consistently sized banner. **Never build a required/opt-out flag; there is nothing to opt out of.** Canonical ruling: `common-docs/systems/content-planning/FEATURE.md` § TEMPLATES ARE AN OPTION. The real goal underneath was **a non-technical way to edit a page's TEXT without knowing HTML** — served by the P4 structured draft, not by templates. | ✅ optional, built | `aidream/services/content_plan/templates.py` — convention-based resolution over `plan.profile.template_map`, pure data, `default` floor, no enforcement. A site with no `templates` key is CORRECT. `client_pages.page_type`/`layout_type` stay labels. |

Per PAGE (× 25 pages ⇒ the 200–300 calls):

| Step | Exists today? | Where it inserts |
|---|---|---|
| P1. Keyword research for this page | ⚠️ site-level exists, per-node link is a bare FK | `seo.*` schema + `/marketing/keyword-research` work; `plan.node.primary_keyword_id` + `secondary_keyword` edges exist; no per-node research ARTIFACT is stored |
| P2. Content research (web/competitor/brand facts) | ❌ not persisted | `deepen_node` (generator.py:501) does research but discards evidence, keeping only brief bullets + `cites` edges; research pipeline exists in `features/research/` + aidream `research/` but isn't wired to plan nodes |
| P3. Family comparison (what goes on THIS page vs its siblings) | ✅ **BUILT + PROVEN 2026-08-15** | `page_pipeline.py::_run_family` → `outline` artifact. Reads the family hub's `planned_topics` + the node's `keyword_strategy`; reports `uncovered_gaps` a plan has no page for |
| P4. Write the content (structured content, NOT HTML) | ✅ **BUILT + PROVEN 2026-08-15** | `page_pipeline.py::_run_write` → `draft` artifact (`PageDraft`: h1 / intro / sections{heading,intent,body,bullets} / CTA / meta). This IS the non-technical text-edit record — HTML is a rendering of it, never the master copy |
| P5. Improve → fact-check → optimize (review loop, revisions) | ✅ **BUILT + PROVEN 2026-08-15** | `page_pipeline.py::_run_review` → `review` artifact (issues in plain language + the COMPLETE revised draft). Proven on the first live run: it caught an invented physician name and an unsupported ISHRS statistic and removed both |
| P6. Build the page from final content, using the site's template + blocks | ✅ renders P4/P5 output | `cms_fill._author_page()` reads `page_pipeline.approved_content(node)` (review's revised draft ⇒ draft ⇒ none) and is told to RENDER it faithfully + link per the placement's `internal_links`. No draft ⇒ it composes from the brief exactly as before, so the one button never stops working. Blocks/templates (S3) still absent |
| P7. Verify / publish | ✅ mostly | `cms_verify/` (browser verification), `publish_many`, plan↔CMS link `client_pages.plan_node_id`, `cms_align` status writeback — built, barely exercised (0 fill jobs ever run) |

**Orchestration vehicle (the "manager agents"):** the AgentPlan mini-workflow system
(`packages/matrx-ai/matrx_ai/plans/` + `aidream/services/agent_plans/`) is built and working,
compiles to normal `wf_run`s, and is the intended way to chain per-page steps — but it has zero
content/site agents defined and no UI trigger. The durable queue pattern for fan-out already
exists (`plan.cms_fill_job`/`plan.cms_fill_item`, SKIP-LOCKED, boot-resume) — reuse it, don't
fork it.

**Per-step status must be visible on the node.** `plan_status` (10 slugs) conflates plan
lifecycle with publication; there is no "researched / written / reviewed / built" axis and no
node-level "has page / is live" flag, and the plan UI shows none of the CMS linkage.

## P4 — the per-page working-content record: BUILT and PROVEN IN PRODUCTION

Ruling (Arman, 2026-08-07): plan side, main DB. Built 2026-08-12 exactly as the argued proposal
(git history holds the full design rationale if the shape is ever re-opened).

**Live:** aidream migration `0344` — `plan.node_artifact` (append-only, Wave-A supersession, ONE
current row per `(node, kind)`) + `plan.node_step` (one row per `(node, step)`, in place); both
components of `plan_node` under canonical RLS, site/org trigger-stamped. Writer:
`aidream/services/content_plan/artifacts.py` (the STEPS vocabulary + the ONE write path,
loud-open so a record failure never fails the paid work). FE reads direct under RLS: NodePanel
"Pipeline" rail (`NodeStepRail`) + tree/table badges off one site-wide query
(`lib/pipeline-progress.ts`).

**Production proof (2026-08-14):** real runs have written every wired producer —
`p2_research` 2 done (+2 research artifacts), `p6_build` 2 done (+2 `final` artifacts),
`p7_publish` 3 done; all artifacts current with summaries. 2 fill jobs, 8 items succeeded.

**The producers now exist (2026-08-15).** `p3_family` / `p4_write` / `p5_review` are
`aidream/services/content_plan/page_pipeline.py`, each independently re-runnable via
`POST /content-plan/nodes/{id}/steps/{step}`, each superseding its own artifact, each opening a
`chat.agent_run` row before the paid call and stamping `failed` with the reason if it dies. The
rail runs them one click per step per page (`usePageStepRun` → `NodeStepRail`), streaming into
the floating run window. Only `p1_keywords` has no producer — Deepen and the Setup keyword pass
write the keyword itself, so the step row stays pending by design.

**The five envelope shapes are REGISTERED KINDS (2026-08-16).** `plan_page_research`,
`plan_page_outline`, `plan_page_draft`, `plan_page_review`, `cms_page_build` — plus their five
nested children — live in `features/content-ir/kinds/` with converter-emitted schemas mirroring
`page_pipeline.py`'s pydantic models, canonical examples, and components under
`components/mardown-display/blocks/page-pipeline/`. The five roots passed the dual gate and are
active; the children are nested-only (no component, inactive) like `media_chapter`. The rail's
artifact dialog renders through `KindInstanceRender` → the canonical route; the `JSON.stringify`
dump is gone. `plan_page_review.revised` is DECLARED a `plan_page_draft`, so the review composes
the draft component's exported parts — never a second draft renderer.

**Still open here:** swapping the in-code prompts for slot-bound specialist agents (item 7
below) — the module contract does not change when that happens.

**Known soft edges:**
- Concurrent writers racing `record_artifact` on the same `(node, kind)` can lose the losing
  record to the unique index (logged loudly; the work itself is unaffected).
- `draft` and `review` supersede INDEPENDENTLY, so re-running the writer leaves a review the new
  draft never saw. `approved_content` resolves this correctly (recency wins, tested), and since
  2026-08-16 the RAIL says so too: `lib/pipeline-staleness.ts` derives staleness from the
  artifact timestamps the client already reads (no round-trip, no writes) and renders the step
  amber — stale, never failed — with the re-run button it already had as the one-click fix.
  Verified live: re-running Write turns the Review chip amber with "Review ran before Write did.
  Run that step again to catch up."

## Resources

- Content plan FE: `features/marketing/content-plan/FEATURE.md`; workbench `components/ContentPlanWorkbench.tsx`; bridge client `setup/bridge.ts`; fill UI `setup/components/SetupBridgeSection.tsx`
- Content plan BE: `aidream/aidream/services/content_plan/FEATURE.md` — `service.py` (one write path), `tools.py` (21-action `content_plan` tool), `generator.py`, `cms_fill.py`, `cms_reconciler.py`, routers `aidream/api/routers/content_plan.py` (`/api/content-plan/*`)
- CMS: `features/cms/FEATURE.md` (FE) · `aidream/aidream/services/cms/FEATURE.md` + `CONTRACT.md` (BE) · agent tools `aidream/aidream/tools/cms_*.py` · governance UI `/administration/knowledge/cms-agents` · renderer = **my-matrx repo (not in most sessions — attach before touching render claims)**
- Multi-agent plan of record for CMS agent authoring: `aidream/docs/cms_agent_authoring/README.md` (P5 pending)
- SEO: `packages/matrx-seo/`, `aidream/services/seo/`, FE `features/marketing/seo/`
- Cross-repo SoRs (common-docs repo): `systems/content-planning/FEATURE.md`, `systems/cms-system/FEATURE.md` — update when steps land
- Test login: `/login` `admin@admin.com` / `Password1234#`; plan UI at `/marketing/content-plan`

## AI-everywhere in the CMS admin — Arman's ruling (2026-08-13)

> "The CMS section of our application is the least AI integrated system we have, and that just
> makes no sense… navigation, the footer, the contact information and social links… for the theme
> tokens, I know we have an agent who does that — so why isn't there a button to engage with the
> agent? … the same can be said for collections, components, and pages… It just seems like someone
> forgot that we do AI for a living, and everything needs to be agent driven."

**Why it happened (audited 2026-08-13 — it did NOT fall through the cracks, it stopped one step
short):** the deep plumbing was all built — the `matrx-user/cms-site|cms-page|cms-component`
surfaces carry a rich 360 read context AND staged `apply_surface_write` targets (theme tokens,
navigation, footer, global CSS, page body/SEO, add_page), and the roles were even declared —
but every CMS role had `defaultAgentId: null` (cms-site had none at all), and the ONLY launch
affordance was the tiny header robot icon. Declared-but-unbound roles render nothing, so the
whole system was invisible.

**Fixed 2026-08-13:** roles bound to real platform agents (Site Editor `d188520f`, Color
Concepts `ab003d53`, Website Content Writer `9061c874`) in both the manifests and
`ui.ui_surface_agent_role`; new in-place primitive
`features/surfaces/components/chrome/SurfaceRoleAgentButton.tsx` (same launch path as the
header panel — never a second execution seam); buttons mounted on every settings section
(theme / navigation / footer / contact / social / global CSS), the Pages toolbar, the
Components tab, the Collections tab, and the PageEditor toolbar.

**The standing rule this encodes:** a CMS surface (and by extension ANY surface) that lets a
human edit something must offer the agent that does the same job, in place — the header chrome
is the overflow, never the only door. Remaining spread (chipped/tracked): SEO tab +
publish-review buttons in PageEditor, a collections data agent, wiring the brand→theme agent
output into `theme_config`, per-page bulk AI actions on the pages list.

**Companion ruling (2026-08-14) — the CMS page editor is the page's HUB:** everything that made
the page (plan, keywords, research) and everything the live page produces (GSC, analysis,
findings) is associated and reachable as tabs that REUSE the existing canonical components;
before/during/after all captured. Work order: [cms-page-hub.md](./cms-page-hub.md).

## Remaining work (priority order)

1. **Prove the loop at SCALE.** The small loop is proven (2026-08-14 live: 2 fill jobs, 8 items succeeded, publish verified on mymatrx.com) — what has never been run is a real site end-to-end: starter kit → fill ~25 nodes → review → bulk publish → verify every URL. Do it on a throwaway or `cosmeticinjectables`, never `iopbm`/`prp-injection-md`, and surface every failure.
2. ~~Fix `theme_config` → CSS in my-matrx~~ **DONE** (WF-1: renderer was already wired; the starter kit's token bake — which shadowed later theme edits — was removed and 4 baked sites migrated + prod-verified).
3. ~~Design + build the per-node content record (P4)~~ **DONE 2026-08-12** (see the P4 section — tables, writer, producers, FE rail all live; review the shape).
4. ~~**Decompose `cms_fill` into explicit pipeline steps**~~ **DONE 2026-08-15** — p3/p4/p5 are real producers, p6 renders their output, the one button is unchanged. **What remains is the FAN-OUT:** the whole-site fill still runs the single author call per page; teach `cms_fill`'s durable queue to run the four steps as separate item types so a 25-page site is ~100 calls, not 25. The queue, the artifacts, and the steps all exist — this is wiring, not design.
5. **Site design system (S3) — the reusable block library.** Curated section/blocks (hero, cards, CTA, FAQ, pricing) the starter kit installs as site CSS + reference markup, which the build step may reach for. **Offered, never imposed** — same rule as templates (§ S4): a site that uses none of them is a correct site. There is NO "templates required vs theme-only" setting to build; that idea came from the retracted quote and is deleted.
6. **Plan UI shows the pipeline**: linked CMS pages DONE (2026-08-07, WF-11); NodePanel rail DONE (2026-08-12); tree/table progress badges DONE (2026-08-13); per-node run-step actions DONE (2026-08-15). Remaining: a whole-page "run the rest of the pipeline" action, and bulk run-step across a selection (the tree already has multi-select).
7. ~~**First specialist agents on the rails.**~~ **DONE 2026-08-16 — all four page agents are DATABASE agents.** Family analyst, writer, reviewer/fact-checker and page-builder are real `agent.definition` rows bound to slots `content_plan.p3_family` / `p4_write` / `p5_review` / `p6_build`; `page_pipeline.py` and `cms_fill.py` hold **zero** prompt text and may never hold any again (Arman, 2026-08-16: *"the code base is nothing more than the connection, but not the definition and the details and can never be those things"*). An org or user can rebind any slot from `/agents/slots` with no deploy, and each artifact records `slot_key` / `agent_id` / `model` / `bound_by`. **What remains is the SPECIALIZATION Arman actually wants:** one builder is not an expert location-page builder plus a blog builder plus a service-page builder. Route the slot by page type — that is a binding decision plus more agents, not a code change to the pipeline.
8. Wire per-node keyword research (P1) to store an artifact; connect `features/research/` as a richer P2 engine (Deepen already writes the `research` artifact p4 reads).
9. **A human EDIT surface over the `draft` artifact.** P4 exists precisely so a non-technical owner can change the page's words without touching HTML — today the rail only VIEWS it as JSON. Edit the sections, re-run the build. This is the retired-S4 promise, and it is the highest-value thing left on this doc.

## Done

- Content plan feature built (5 views, generator, deepen, reconciler, signals) — see `features/marketing/content-plan/` + `aidream/services/content_plan/`
- CMS authoring stack built (sites/pages/components/collections, drafts/versions/publish, agent tools + write policy + activity feed) — see `features/cms/` + `aidream/services/cms/`
- Plan↔CMS bridge + durable fill queue built (unexercised) — see `cms_fill.py`, `cms_reconciler.py`, `setup/bridge.ts`

## Effort tiers + pre-estimation — the shape of the cost controls (Arman, 2026-08-16)

Canonical, in his words: `common-docs/systems/content-planning/FEATURE.md` § EFFORT TIERS AND
PRE-ESTIMATION. The three things that bind anyone building here:

- **Effort is a PATHWAY, not a cap.** A cheap tier MERGES steps into fewer calls; the top tier
  runs every step and spends what quality costs. **The one-shot `cms_fill` authoring call is not
  legacy — it IS the cheapest tier** and must keep working.
- **Set per PAGE and per SITE** (site default, page override).
- 🚨 **Estimate before the button; never enforce mid-run.** A runtime budget abort spends the
  money AND loses the result, and presents as a crash. Show the whole job's projected cost (300
  pages included) before the user commits, gate there, and let a started run finish. No hidden
  ceilings.

Status: directive recorded, not built. The per-step fan-out (item 4) is its first consumer.

## The models each step runs (Arman's binding, 2026-08-16)

`Gemini 3.7 Flash` is the default workhorse — best Google model on all three axes at once, so an
agent on any older Gemini is drift. Escalate to `Claude Opus` only when a step is both highly
agentic AND consequential for MULTIPLE downstream things. Applied here: **p3_family → Claude Opus
5** (it constrains the writer, the builder and every sibling page's territory); **p4_write /
p5_review / p6_build → Gemini 3.7 Flash** (each produces one artifact for one page). Policy:
`common-docs/systems/agent-design/MODEL-AND-TASK-PLAYBOOKS.md` § THE MATRX DEFAULT BINDING.
Rebinding is a database edit — never a code change.

## Decisions needed (Arman)

*Nothing is waiting on Arman. Both former items are ruled.*

1. ~~Where does per-page content live?~~ **Ruled 2026-08-07, BUILT 2026-08-12** — the P4 section's exact shape (`plan.node_artifact` / `plan.node_step`), now carrying real traffic.
2. ~~Templates: how strict?~~ **RULED 2026-08-16: they are an OPTION and are never required — the question itself was the mistake.** It came from one sentence of Arman's taken out of context; he meant a *themed* page (shared global CSS, header, menu, footer/sidebar, optionally reusable components), not a template entity. Do not build a required-flag, an opt-out, or a per-site strictness setting — there is nothing to opt out of. Canonical, in his own words: `common-docs/systems/content-planning/FEATURE.md` § TEMPLATES ARE AN OPTION, NEVER A REQUIREMENT.
