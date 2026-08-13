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
| S4. ~~Page templates: no page created without a prebuilt template~~ **RETIRED (Arman, 2026-08-07):** *"my comments were silly … figure it out and remove that from the vision."* The real goal behind it was **a non-technical way for the user to edit a page's TEXT without knowing HTML** — in the AI age the page itself can be the template. Replacement direction: smart per-case paths (block library where it helps, free-form where it doesn't) + an easy text-edit surface for humans. The structured-content draft in the P4 record (below) is what makes that surface possible — edit the structured sections, the builder re-renders. | — | No template entity. `client_pages.page_type`/`layout_type` stay labels. |

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

## P4 — the per-page working-content record: BUILT 2026-08-12 (shape as proposed — flag for Arman's review)

Ruling (Arman, 2026-08-07): plan side, main DB — *"absolutely no question"*; the SHAPE below
was the argued proposal and was **built exactly as written** (bias-to-action call, 2026-08-12
session; append-only data, nothing downstream depends on it yet, so shape adjustments stay
cheap). Live: aidream migration `0344` (`plan.node_artifact` + `plan.node_step`, components of
`plan_node`, canonical RLS, site/org trigger-stamped, supersession index proven live);
writer module `aidream/services/content_plan/artifacts.py` (STEPS vocabulary, loud-open
recording); wired producers: deepen → `p2_research` (+ research artifact), cms_fill →
`p6_build` running/done/failed (+ `final` build artifact, preview-write included), publish
flow-back → `p7_publish`. FE: direct RLS reads + the NodePanel "Pipeline" rail
(`NodeStepRail.tsx`). NOT yet done: formal content-ir kind registration for the two envelope
shapes, tree/table step badges, per-step run actions, and the p1/p3/p4/p5 specialist steps.

### The two tables (and why exactly two)

**1. `plan.node_artifact` — everything a step PRODUCES. Append-only, supersession-versioned.**

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `node_id` | uuid NOT NULL → `plan.node` ON DELETE CASCADE | the owner — a direct FK, deliberately NOT an association (see Why below) |
| `site_id` / `organization_id` | uuid | TRIGGER-stamped from the node (same pattern as `plan._node_shape` stamps `organization_id`) — site-wide queries without joins |
| `kind` | text | small machine vocabulary: `research` · `outline` · `draft` · `review` · `fact_check` · `final` (code constant, not a lookup table — architecture lives in code) |
| `step` | text | which pipeline step wrote it (`p1_keywords` … `p6_build`) |
| `content` | jsonb | **a content-ir `__kind` envelope** — the platform's ONE structured-content representation. A draft is a structured page-sections kind, NOT HTML; research is a findings kind. This is what makes the "easy text edit for humans" surface and every downstream agent input possible without a new format |
| `summary` | text | one paragraph for lists/context assembly (agents skim summaries, load `content` on demand) |
| `valid_to` | timestamptz null | **Wave-A supersession law**: current row has `valid_to IS NULL`; a revision INSERTS a new row and stamps the old one. Revisions ARE the history — no separate version log, no UPDATE of content ever |
| `produced_by` | jsonb | provenance: agent id, run/job id, model, input artifact ids |
| `created_at` | timestamptz | |

Partial unique index: `(node_id, kind) WHERE valid_to IS NULL` — ONE current artifact per kind
per page; "latest draft" is an index lookup, never a max() scan.

**2. `plan.node_step` — where each page IS in the pipeline. One row per (node, step), updated in place.**

| column | type | notes |
|---|---|---|
| `node_id` → `plan.node` CASCADE + `step` text | UNIQUE pair | |
| `status` | text | `pending` · `running` · `done` · `failed` · `skipped` — machine lifecycle, so NOT a `platform.categories` dimension (categories are user taxonomy; this is a state machine) |
| `artifact_id` | uuid null → `node_artifact` | the step's current output |
| `attempts` / `error` / `started_at` / `finished_at` | | re-runnable + honest failure display |
| `site_id` / `organization_id` | | trigger-stamped, as above |

This is the vision's "steps exist in DATA, not prose": each step independently re-runnable, the
plan UI reads `node_step` for the researched/written/reviewed/built axis, and the one-button
pipeline is just "run every non-done step in order".

### What is deliberately NOT a new table

- **Full research reports / crawl data / keywords** — already have homes (`research.*`, `seo.*`,
  `primary_keyword_id` + `secondary_keyword` edges). `node_artifact(kind='research')` holds only
  the per-page DISTILLATION; links to the source report/topic go on **`platform.associations`**
  (node→`research_topic` / node→`rs_document`, target types already registered). Associations
  connect DOMAINS; they never carry the content payload itself.
- **Step registry** — a code constant beside the pipeline, not a table (a step is architecture).
- **Job/queue state** — `plan.cms_fill_job/_item` already is the durable fan-out engine; when
  fill decomposes into steps, its items reference `(node_id, step)` instead of growing new state.
- **`plan_status`** — untouched. It stays the EDITORIAL lifecycle (planned→published); `node_step`
  is the production axis. They meet exactly once: the build step creates the CMS page, and
  publish already advances `plan_status` (WF-2, shipped).

### Why this shape (the argued alternatives)

- **Why not one mega-table with everything jsonb?** You lose the one query that matters ("what
  step is every page at" across 300 pages) to jsonb scans, and step state gets versioned along
  with content when only content deserves supersession. Two tables = the two different write
  patterns (append-only artifacts vs in-place step state).
- **Why not a table per artifact type (page_draft, page_research, page_review…)?** Same columns
  six times; every new specialist agent would need DDL. `kind` + a content-ir envelope makes a
  new artifact type DATA (register the kind), which is the whole Shape System's point.
- **Why not `platform.associations` as the storage?** An artifact is OWNED by its node (same
  lifecycle, cascade-deleted, org-stamped from it) — that is a child row, not a cross-entity
  relationship. Megabyte drafts in edge payloads would also wreck the associations table's
  role. Associations are used exactly where they shine: node↔research-source links.
- **RLS**: canonical `iam.apply_rls` v2 + `iam.has_access` on both tables (never hand-written
  policies); org comes from the trigger-stamped column.

### Build order once approved

1. Tables + triggers + RLS via Supabase MCP; `pnpm db-types` + aidream `db/generate.py`.
2. aidream: `node_artifact`/`node_step` write path in `services/content_plan/service.py` +
   tool actions; decompose `cms_fill._author_page()` so each phase reads/writes artifacts and
   stamps its step (thin steps first — same prompts, now persisted).
3. FE: NodePanel gains the step rail + artifact viewer (structured draft = the human text-edit
   surface); tree/table badges read `node_step`.
4. Specialist agents replace the thin steps one at a time (writer, reviewer, fact-checker).

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
3. ~~Design + build the per-node content record (P4)~~ **DONE 2026-08-12** (see the P4 section — tables, writer, producers, FE rail all live; review the shape).
4. **Decompose `cms_fill` into explicit pipeline steps** behind the SAME button. STARTED 2026-08-12: fill/deepen/publish now persist step state + artifacts (the steps exist in data); still monolithic per page — the author call is one prompt. Next: split context-assembly (`p3_family`), structured write (`p4_write`), review (`p5_review`) into separately re-runnable item types on the same durable queue.
5. **Site design system (S3) + page templates (S4)**: template/block entities in the CMS DB, starter kit installs a default set, `page_type` binds node → template, per-site "templates required vs theme-only" setting. Page build step consumes them.
6. **Plan UI shows the pipeline**: linked-CMS-page half DONE (2026-08-07, WF-11); NodePanel step rail DONE (2026-08-12, `NodeStepRail` + direct `node_step`/`node_artifact` reads). Remaining: step badges on tree/table views, and per-node "run step / generate this page" actions.
7. **First specialist agents on the rails**: writer, reviewer/fact-checker, page-builder as saved agents; orchestrate per-page via AgentPlan; `cms_fill`'s inline prompt becomes the page-builder's starting prompt.
8. Wire per-node keyword/content research (P1/P2) to store artifacts on the content record; connect `features/research/` pipeline as the P2 engine.

## Done

- Content plan feature built (5 views, generator, deepen, reconciler, signals) — see `features/marketing/content-plan/` + `aidream/services/content_plan/`
- CMS authoring stack built (sites/pages/components/collections, drafts/versions/publish, agent tools + write policy + activity feed) — see `features/cms/` + `aidream/services/cms/`
- Plan↔CMS bridge + durable fill queue built (unexercised) — see `cms_fill.py`, `cms_reconciler.py`, `setup/bridge.ts`

## Decisions needed (Arman)

1. ~~Where does per-page content live?~~ **Ruled (a) 2026-08-07 and BUILT 2026-08-12** as the P4 section's exact shape. Open for review, not decision: sanity-check the shape on the live tables (`plan.node_artifact` / `plan.node_step`); adjustments are cheap while nothing downstream depends on them.
2. **Templates: how strict?** Situation: the vision says "no page created without a prebuilt template" but also allows theme-only free-form sites. Decide: is template-required the default for new sites with an explicit per-site opt-out, or opt-in? Recommendation: required by default, `client_sites.settings` flag to relax.
