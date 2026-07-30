---
status: active
updated: 2026-07-30
repos: [matrx-frontend, aidream, my-matrx]
vision: [this doc §Vision — Arman's words, 2026-07-30 chat]
---

# Website Factory — from content plan to agent-built professional sites

The system that takes a `web.site` content plan and produces a real, professional, multi-page
website through many specialized agent steps. This doc is the tracking spine: Arman's vision,
where each missing piece inserts into what exists today, and the ordered work list.
Point-fix defects found in the same audit are assignable one-by-one on
[website-factory-bug-dispatch.md](./website-factory-bug-dispatch.md) (WF-1…WF-12).

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
> structures, making sure that **no page is created without a prebuilt template**. It doesn't mean
> you can't have custom pages — it means you build your service pages on some sort of a template,
> and you have your headers, your footers, your menus, your colors — all that stuff needs to be
> predetermined so that we're not just vibecoding some little crappy website."

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
| S2. Site shell: theme CSS, header+menu, footer | ⚠️ half | `cms_site starter_kit` (`aidream/services/cms/starter_kit.py`) seeds all three, agent-only, no UI button; **renderer `theme_config`→CSS wiring is dead in my-matrx** (`lib/render/themeCss.js` exists, unimported — filed defect 2026-07-27) |
| S3. Design system: curated section/block library (hero, cards, CTA, FAQ, pricing…) per site | ❌ none | New: block library the starter kit installs (site CSS + reference markup); consumed by S4 and P6 |
| S4. Page templates: no page created without a prebuilt template (with an explicit "theme-only, free-form" opt-out per site) | ❌ none | New: template entity in CMS DB (`viyklljfdhtidwecakwx`) keyed by `page_type`; `client_pages.page_type`/`layout_type` labels already exist but nothing consumes them |

Per PAGE (× 25 pages ⇒ the 200–300 calls):

| Step | Exists today? | Where it inserts |
|---|---|---|
| P1. Keyword research for this page | ⚠️ site-level exists, per-node link is a bare FK | `seo.*` schema + `/marketing/keyword-research` work; `plan.node.primary_keyword_id` + `secondary_keyword` edges exist; no per-node research ARTIFACT is stored |
| P2. Content research (web/competitor/brand facts) | ❌ not persisted | `deepen_node` (generator.py:501) does research but discards evidence, keeping only brief bullets + `cites` edges; research pipeline exists in `features/research/` + aidream `research/` but isn't wired to plan nodes |
| P3. Family comparison (what goes on THIS page vs its siblings) | ❌ none | New step; sibling context partially assembled today inside `cms_fill._build_site_context()` — extract into its own persisted step |
| P4. Write the content (structured content, NOT HTML) | ❌ none | **Biggest schema gap: there is no per-node content record anywhere** — plan has `brief text[]`, CMS has finished `html_content`, nothing between. New: content/draft store keyed to `plan.node` |
| P5. Improve → fact-check → optimize (review loop, revisions) | ❌ none | Operates on the P4 content record; each pass = its own agent + persisted revision |
| P6. Build the page from final content, using the site's template + blocks | ⚠️ conflated | Today `cms_fill._author_page()` does P1–P6 in ONE fixed-prompt LLM call. Becomes: template + blocks + final content → HTML into `client_pages.*_draft` via existing guarded `page_service` |
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

## Resources

- Content plan FE: `features/marketing/content-plan/FEATURE.md`; workbench `components/ContentPlanWorkbench.tsx`; bridge client `setup/bridge.ts`; fill UI `setup/components/SetupBridgeSection.tsx`
- Content plan BE: `aidream/aidream/services/content_plan/FEATURE.md` — `service.py` (one write path), `tools.py` (21-action `content_plan` tool), `generator.py`, `cms_fill.py`, `cms_reconciler.py`, routers `aidream/api/routers/content_plan.py` (`/api/content-plan/*`)
- CMS: `features/cms/FEATURE.md` (FE) · `aidream/aidream/services/cms/FEATURE.md` + `CONTRACT.md` (BE) · agent tools `aidream/aidream/tools/cms_*.py` · governance UI `/administration/knowledge/cms-agents` · renderer = **my-matrx repo (not in most sessions — attach before touching render claims)**
- Multi-agent plan of record for CMS agent authoring: `aidream/docs/cms_agent_authoring/README.md` (P5 pending)
- SEO: `packages/matrx-seo/`, `aidream/services/seo/`, FE `features/marketing/seo/`
- Cross-repo SoRs (common-docs repo): `systems/content-planning/FEATURE.md`, `systems/cms-system/FEATURE.md` — update when steps land
- Test login: `/login` `admin@admin.com` / `Password1234#`; plan UI at `/marketing/content-plan`

## Remaining work (priority order)

1. **Prove the current loop once end-to-end.** Test site → starter kit → cms-fill (~10 nodes) → publish → view on mymatrx.com/c/{slug}. `plan.cms_fill_job` has 0 rows ever; nothing downstream should be designed on an unexercised pipeline. Surface every failure found.
2. **Fix `theme_config` → CSS in my-matrx** (filed defect). Without it, S2 theming is fake — theme edits after starter-kit change nothing.
3. **Design the per-node content record (P4)** — where drafts, revisions, research artifacts, and per-step status live. This unblocks P1/P2/P3/P5. Needs a schema decision (see Decisions).
4. **Decompose `cms_fill` into explicit pipeline steps** behind the SAME button: persisted step records per node, each step independently re-runnable; initial step implementations may be thin (even the current single prompt split apart), but the steps must exist in data, not prose. Reuse the durable-queue pattern.
5. **Site design system (S3) + page templates (S4)**: template/block entities in the CMS DB, starter kit installs a default set, `page_type` binds node → template, per-site "templates required vs theme-only" setting. Page build step consumes them.
6. **Plan UI shows the pipeline**: per-node step status + linked CMS page (route, published state, open/edit) + per-node "run step / generate this page" actions in `NodePanel`, tree/table badges.
7. **First specialist agents on the rails**: writer, reviewer/fact-checker, page-builder as saved agents; orchestrate per-page via AgentPlan; `cms_fill`'s inline prompt becomes the page-builder's starting prompt.
8. Wire per-node keyword/content research (P1/P2) to store artifacts on the content record; connect `features/research/` pipeline as the P2 engine.

## Done

- Content plan feature built (5 views, generator, deepen, reconciler, signals) — see `features/marketing/content-plan/` + `aidream/services/content_plan/`
- CMS authoring stack built (sites/pages/components/collections, drafts/versions/publish, agent tools + write policy + activity feed) — see `features/cms/` + `aidream/services/cms/`
- Plan↔CMS bridge + durable fill queue built (unexercised) — see `cms_fill.py`, `cms_reconciler.py`, `setup/bridge.ts`

## Decisions needed (Arman)

1. **Where does per-page content live?** Situation: a page's draft content, research artifacts, and review revisions currently have no home — the plan node (main Supabase project) holds only a bullet-list brief, and the CMS project holds only finished HTML. Decide: (a) new tables in the `plan` schema next to `plan.node` (content stays with the plan, main project), or (b) draft-content tables in the CMS project next to `client_pages` (content stays with the site). Recommendation: (a) — the content lifecycle belongs to planning; the CMS receives only the final built page, and cross-project links already exist via `plan_node_id`.
2. **Templates: how strict?** Situation: the vision says "no page created without a prebuilt template" but also allows theme-only free-form sites. Decide: is template-required the default for new sites with an explicit per-site opt-out, or opt-in? Recommendation: required by default, `client_sites.settings` flag to relax.
