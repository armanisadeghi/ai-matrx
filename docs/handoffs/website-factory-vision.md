---
status: active
updated: 2026-08-17
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

**Still open here:** swapping the in-code prompts for mandate-bound specialist agents (item 7
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

## Where this stands (2026-08-19, global-view audit) — read this first

**The factory works end to end, small, and its whole surface is coherent.** One button
(`cms_fill_start`) takes a planned site through four AI steps per page — family territory (p3) →
structured write (p4) → review/fact-check (p5) → HTML build (p6) — on one durable queue, one item
per (page, step), pages overlapping, crash-resumable, cost stated before the run and measured
after. All four page agents are DATABASE agents behind mandates
(`content_plan.p3_family|p4_write|p5_review|p6_build`; rebind from `/agents/mandates`, no deploy).
A human edits any page's words without HTML (`PageDraftEditor`), and a human revision supersedes
the agent's. Live proof 2026-08-16: 24/24 steps on a 6-page throwaway for $0.33; kill-resume and
single-page-failure isolation both demonstrated.

**Landed since, all verified on main 2026-08-19 (cross-session merge audit):**
- **THE PIPELINE IS THE PAGE** (Arman ruling 2026-08-17): NodePanel's rail chips are now the
  panel's TAB STRIP (Page | Keywords | Research | Family | Write | Review | Build | Publish);
  content lives inside its step; `defaultTabFor` lands on the first gap. Four chrome rows
  collapsed into ONE `PlanToolbar`. FE FEATURE.md §2 describes it (caught as doc drift, fixed).
- **Keyword→brief enforcement, end to end + browser-verified:** write-step gate aligned with the
  brief gate (bulk fill records refusals as readable SKIPs — server-proven HTTP 422, zero paid
  work), warn-loud per-page floor on Deepen / tool / apply_plan_tree, keyword-containment check
  on produced briefs, binding TARGET-KEYWORD prompt framing, precondition-aware run arrows
  (reason + fix in the tooltip BEFORE the click; a not-loaded read never blocks). The ONE
  predicate on both sides is primary keyword OR page role — secondaries/links/notes deliberately
  do NOT count (narrowed 2026-08-18; change one side and you must change the other).
- **Tiered bulk SEO planning** (cheap/thorough/advanced on the strategist, exact calls + priced
  cost before the button) — that is the SETUP/keyword-strategist tier, live-proven; the
  `cms_fill` effort tier (item 3 below) is still open, though its server knobs (`steps` /
  `overwrite_steps` / `include_review` on the fill request) are already accepted — the FE just
  never sends more than `include_review`.

**What it is NOT yet:** proven at 25-page scale, deep (p1 keyword research and a rich p2 content
research have no producer — today's ~4 calls/page vs the 200–300-call vision), specialized (one
builder, not an expert location/blog/service-page builder), or tiered at the FILL level.

**The feature's other parts and who owns them (the global map — keep it current):**
- **Setup AI steps** (grounding strip, family namer, quick-research):
  [content-plan-ai-steps.md](./content-plan-ai-steps.md) — same owner as this doc; open items 3,
  4, 6–12 there.
- **CMS side** (page hub, publish, collections, my-matrx renderer): [cms-page-hub.md](./cms-page-hub.md)
  is THE CMS master handoff (separately owned); the code-verified global CMS map is
  `common-docs/systems/cms-system/FEATURE.md` § THE CMS FEATURE MAP.
- **Workflow-node exposure** of Content Plan/CMS operations: `aidream/docs/handoffs/features-to-workflows.md`
  (separately owned) — 14 nodes built, more coming; the factory pipeline itself stays on the
  durable `cms_fill` queue, not workflow nodes.
- **Bug dispatch:** `website-factory-bug-dispatch.md` is DELETED (2026-08-19) — 11 of 12 items
  were DONE; the sole survivor (WF-10) is folded in as item 7 below.
- **Two dormant purpose-built agents** (Keyword Binder `8ffb091c…`, Brief Writer `f9789816…`,
  zero runtime consumers) are held under the unfinished-work alarm — never delete; wire or get
  Arman's written ruling.

## Remaining work (priority order)

1. **Prove the loop at SCALE.** *(Dispatched as a chip 2026-08-19 — check for a parallel session
   before starting.)* Never yet run: a real ~25-page site end to end — starter kit →
   fill every node (all four steps) → human review → bulk publish → verify every URL live. Use a
   throwaway or `cosmeticinjectables` (`baa61391…`, already CMS-linked), never `iopbm` /
   `prp-injection-md`. Surface every failure; the queue's per-page isolation should make each one
   attributable.
2. **Per-page research depth — p1 and p2 producers.** This is where the call count grows toward
   the vision, not more fan-out. p1: per-node keyword research storing a `research`-kind artifact
   against the node (the FK edges exist; the ARTIFACT doesn't). p2: connect `features/research/`
   as a richer content-research engine (Deepen already writes the `research` artifact p4 reads —
   extend, don't fork).
3. **Specialist builders routed by page type.** Arman's vision is an expert location-page
   builder, blog builder, service-page builder — "over 200 agents". The pipeline needs NO code
   change: this is more DB agents plus mandate routing by `page_type`. Decide the routing seam
   (per-page-type binding on the mandate vs. a dispatcher agent) before authoring the fleet.
4. **The effort TIER** (§ Effort tiers below). *(Dispatched as a chip 2026-08-19.)* The knobs
   exist (`steps` / `include_review` on the fill request — the server already accepts them; the
   FE sends only `include_review`); a tier is a named per-site + per-page preset over them, with
   the cheap end merging steps into fewer calls (the one-shot author call IS the cheapest tier
   and still works). The Setup keyword-strategist tier (shipped 2026-08-18) is the UX pattern to
   copy: named tiers on the SAME button, exact call count + priced cost before commit.
5. **Site design system (S3) — the reusable block library.** Curated sections (hero, cards, CTA,
   FAQ, pricing) the starter kit installs; the build step MAY reach for them. Offered, never
   imposed — same law as templates.
6. **Plan-UI remainder:** whole-page "run the rest of the pipeline" action; bulk run-step across a
   tree multi-selection.
7. **WF-10 (folded in from the deleted bug-dispatch doc; LOW).** *(Dispatched as a chip
   2026-08-19.)* Site→vertical binding is a buried settings convention
   (`web.site.settings.content_plan.vertical` jsonb), so `plan.profile` binds ambiguously for
   multi-profile orgs and the FE needs a manual picker. Fix: promote to a real column/FK on
   `web.site` (Supabase MCP + `pnpm db-types` + aidream `db/generate.py`), migrate existing
   settings values, update `aidream/services/content_plan/` readers and the FE setup view.
8. **Streaming-capable assists** (platform gap parked from the editor work): the editor's guided
   AI actions are buttons, not assist chips, because an assist action cannot adopt a stream — a
   chip would spin silently through a minute-long call. Fix belongs in the assists capability,
   not this feature.

## Done (compressed — details live in the FEATURE.md files and git history)

- ✅ **Keyword→brief enforcement, end to end — CLOSED 2026-08-18** (the 2026-08-17 pbw-law "my keywords got dropped"
  trace): `assign_primary_keyword` is the one store writer (root cause) AND the whole tail —
  write-step gate aligned with the brief gate (bulk fill records it as a readable SKIP),
  one shared warn-loud per-page floor on Deepen / the `content_plan` tool /
  `apply_plan_tree` (primary keyword OR page role; bulk paths never block), exact-phrase-or-
  significant-words containment on produced Brief Writer drafts (lands in durable `concerns`),
  directive target framing in both prompts, FE `hasKeywordAssignment` aligned exactly to the
  server predicate, and precondition-aware run arrows on the rail. Contracts: aidream
  `services/content_plan/FEATURE.md` invariant 5 tail + FE `content-plan/FEATURE.md` §2.
- Content plan feature (5 views, generator, deepen, reconciler, signals) + CMS authoring stack +
  plan↔CMS bridge — `features/marketing/content-plan/`, `features/cms/`, aidream
  `services/content_plan/` + `services/cms/`.
- **P4 record** (`plan.node_artifact` supersession + `plan.node_step`) built 2026-08-12, carrying
  real production traffic.
- **Pipeline steps p3/p5 built, p4/p6 decomposed** 2026-08-15; **per-(page,step) fan-out on the
  one durable queue** 2026-08-16 (migration `0370`; contract: aidream
  `services/content_plan/FEATURE.md` § ONE BUTTON, FOUR AI STEPS PER PAGE).
- **All four page agents are DB agents on mandates** (2026-08-16); zero prompt text in
  `page_pipeline.py` / `cms_fill.py`, guarded in both repos (aidream guard + FE
  `pnpm check:hardcoded-prompts`), counts only go down.
- **Human page-text editor** over the draft artifact (2026-08-16) — the kept promise behind
  retired S4; human revision beats stale agent output; `lib/page-draft.ts` mirrors
  `approved_content` under test.
- **Template library seeded as an OPTION** (migration `0371`, 17 templates, 30 tests); free-form
  sites untouched.
- **All five artifact kinds registered** with kind components + rail staleness derivation
  (2026-08-16) — no JSON dumps, one component per shape.
- **Mobile + headings class fix** across the whole feature (2026-08-16): `.matrx-touch-targets`
  floor + `MatrxColumnDef.mobileHidden`; 0 controls under 44px at 390px; all 12 rejected review
  rows re-submitted.
- Theme wiring (WF-1), CMS linkage UI (WF-11), NodePanel rail, progress badges, per-node
  run-step actions — all live.

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

Status: directive recorded, not built as an effort TIER. The per-step fan-out (item 4) shipped
2026-08-16 and delivered the estimate-before-the-button half: `cms_fill_start` returns the exact
call count plus a cost priced from the agents' own recorded runs, the status endpoint carries the
actual, and nothing is enforced mid-run (no cap, by design). What is still missing is the tier
itself — a per-page/per-site "effort" setting that MERGES steps into fewer calls at the cheap end.
Today the shape of that setting already exists as `steps` / `include_review` on the fill request;
a tier would be a named preset over them.

## The models each step runs (Arman's binding, 2026-08-16)

`Gemini 3.7 Flash` is the default workhorse — best Google model on all three axes at once, so an
agent on any older Gemini is drift. Escalate to `Claude Opus` only when a step is both highly
agentic AND consequential for MULTIPLE downstream things. Applied here: **p3_family → Claude Opus
5** (it constrains the writer, the builder and every sibling page's territory); **p4_write /
p5_review / p6_build → Gemini 3.7 Flash** (each produces one artifact for one page). Policy:
`common-docs/systems/agent-design/MODEL-AND-TASK-PLAYBOOKS.md` § THE MATRX DEFAULT BINDING.
Rebinding is a database edit — never a code change.

## Decisions needed (Arman) — and the routing rule

🚨 **THE ROUTING RULE (Arman, 2026-08-17): developer tasks NEVER go to Arman.** On review he found
that almost nothing queued for him was actually his — they were engineering decisions parked in
his lists. Before adding anything to a "Decisions needed" section, an assists chip addressed to
him, or `.matrx/ARMAN_TASKS.md`, apply the test: **does this need Arman PERSONALLY — a product
ruling, a naming ruling, money, an account only he holds, or his own review/test?** If a competent
engineer could decide it by reading the code and the doctrine, it is a developer task: decide it,
or hand it to another session — never to him. Both prior decisions on this doc dissolved exactly
that way (P4 shape: ruled and built; template strictness: the question itself was the mistake —
templates are an OPTION, never required, per
`common-docs/systems/content-planning/FEATURE.md` § TEMPLATES ARE AN OPTION).

**Currently waiting on Arman: nothing on this handoff.** The one standing ask that IS his:
**21 content-plan rows sit `pending` in `agent.review_queue`** (`/administration/users/
agent-review`) — his review, nobody else's.
