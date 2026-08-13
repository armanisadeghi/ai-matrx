/**
 * THE GROWTH LOOP MAP — the single machine-readable source of truth.
 *
 * Research -> Plan -> Brief -> Realize -> Fill -> Publish -> Serve -> Crawl ->
 * Measure -> Analyze -> Suggest -> Write-back -> (back to Plan/Fill).
 *
 * Vision + doctrine: common-docs/systems/growth-loop/VISION.md + FEATURE.md.
 * Campaign + lanes:  common-docs/projects/growth-loop-gaps/PLAN.md.
 *
 * THE THREE PIPES: every edge must be runnable by CODE (deterministic, free),
 * by a HUMAN (a real UI they can reach), and by AI (a purpose-built agent).
 * A connection that exists on only one pipe is still a gap.
 *
 * RULES FOR EDITING THIS FILE
 * 1. Status here must reflect LIVE CODE, never intent. Every `state` other than
 *    "missing" carries a `ref` an auditor can open and verify.
 * 1b. 🚨 "LIVE" MEANS SHIPPED — on origin/main and deployed. Code sitting in a
 *    working tree, however finished, is NOT live; that is what `status:
 *    "in-progress"` is for, and the gap's `detail` must say so. This rule exists
 *    because it was broken: the 2026-08-12 audit found ~10 gaps fully built on
 *    one laptop, several with their MIGRATIONS ALREADY APPLIED to the live
 *    database, while production ran none of the code. A map that counted those
 *    as done would have been worse than no map.
 * 2. This file is the ONLY place statuses live. common-docs points here; it must
 *    never restate a status (that is how mirrors rot).
 * 3. Filling a gap = flipping its pipe state here in the SAME change as the code.
 * 4. Never delete a gap id. Set `status: "closed"` with the evidence ref.
 */

export type Pipe = "code" | "human" | "ai";

/** How well a pipe carries this edge/stage today. */
export type PipeState =
    | "live" // works unattended/reachable today, verified
    | "partial" // exists but incomplete, manual-only, or unwired
    | "missing" // nothing exists
    | "n/a"; // deliberately does not apply (record WHY in note)

export type Maturity = "production" | "near" | "stub" | "missing";

export type Repo = "ai-matrx" | "aidream" | "my-matrx" | "db";

export interface PipeStatus {
    state: PipeState;
    /** One line: what exists, or what is missing. No hedging. */
    note: string;
    /** file path / endpoint / table an auditor can open. Required unless missing. */
    ref?: string;
}

/**
 * The customer-facing face of a stage. Presence of this object is the
 * "show publicly" flag — a stage without it never renders on /how-it-works.
 *
 * Copy rules (our user is a brilliant NON-technical expert):
 * - No product jargon, no file names, no internal stage names.
 *   "Realize page shell" is engineer-speak; "Create the pages" is not.
 * - `plain` is ONE sentence a stranger understands in five seconds.
 * - Never describe intent. If the stage cannot do it today, do not say it.
 */
export interface PublicStageInfo {
    /** Customer-facing stage name. */
    title: string;
    /** One plain-English sentence. */
    plain: string;
    /** Lucide icon NAME — this file stays React-free (see FEATURE.md). */
    icon: string;
}

export interface LoopStage {
    id: string;
    /** Short label rendered in the node. */
    label: string;
    /** One sentence a non-technical person understands. */
    blurb: string;
    repos: Repo[];
    /** Canonical storage. Exact table names. */
    stores: string[];
    maturity: Maturity;
    pipes: Record<Pipe, PipeStatus>;
    /** Where a human enters this stage today. */
    entry?: string;
    /** Present = this stage is shown on the public /how-it-works page. */
    publicInfo?: PublicStageInfo;
}

export interface LoopEdge {
    id: string;
    from: string;
    to: string;
    label: string;
    pipes: Record<Pipe, PipeStatus>;
    /** Gap ids that live on this connection. */
    gaps?: string[];
}

export type GapSeverity = "blocker" | "major" | "minor";
export type GapStatus = "open" | "in-progress" | "closed";

export interface LoopGap {
    id: string;
    title: string;
    severity: GapSeverity;
    status: GapStatus;
    /** stage id or edge id this gap sits on. */
    at: string;
    /** Which pipe(s) this gap breaks. */
    breaks: Pipe[];
    /** What is missing, concretely. */
    detail: string;
    /** Campaign lane id (see LANES). */
    lane: string;
    /** Evidence path when closed. */
    evidence?: string;
}

export interface Lane {
    id: string;
    label: string;
    /** Why these gaps belong together (shared code, shared risk). */
    rationale: string;
    repos: Repo[];
    /** Lane ids that must land first. Empty = start now, in parallel. */
    dependsOn: string[];
}

// ---------------------------------------------------------------------------
// STAGES
// ---------------------------------------------------------------------------

export const STAGES: LoopStage[] = [
    {
        id: "research",
        label: "Research",
        blurb: "Learn everything about a brand, market and keywords, and write it up as one report.",
        publicInfo: {
            title: "Learn the market",
            plain: "We study your business, your competitors, and what people are actually searching for — and write it all up as one report.",
            icon: "Search",
        },
        repos: ["ai-matrx", "aidream", "db"],
        stores: ["research.rs_topic", "research.rs_source", "research.rs_synthesis", "research.rs_document"],
        maturity: "production",
        entry: "/research/topics/[topicId]",
        pipes: {
            code: {
                state: "partial",
                note: "Pipeline runs server-side end-to-end, but nothing schedules or re-runs it; every run starts from a click.",
                ref: "aidream/aidream/services/research/pipeline.py#run_pipeline",
            },
            human: {
                state: "live",
                note: "Full topic workspace: keywords, sources, curation, analysis, synthesis, document.",
                ref: "ai-matrx/app/(core)/research/topics/[topicId]",
            },
            ai: {
                state: "partial",
                note: "7 pinned research agents do the work INSIDE a run, but no agent can start a research run — there is no tool for it.",
                ref: "aidream/aidream/services/research/agents.py",
            },
        },
    },
    {
        id: "plan",
        label: "Content plan",
        blurb: "Turn the research into the full list of pages the site should have, as a tree.",
        publicInfo: {
            title: "Plan every page",
            plain: "That research becomes the complete list of pages your site should have, organised the way your visitors actually think.",
            icon: "ListTree",
        },
        repos: ["ai-matrx", "aidream", "db"],
        stores: ["plan.node", "plan.entity", "plan.profile"],
        maturity: "production",
        entry: "/marketing/content-plan",
        pipes: {
            code: {
                state: "live",
                note: "Archetype expansion is deterministic and fixture-pinned (62 cases) — concepts/variants/counts to routes.",
                ref: "ai-matrx/features/marketing/content-plan/setup/archetypes.ts",
            },
            human: {
                state: "live",
                note: "Tree editor, node panel, pillar map, entity manager; drag-reparent writes real parent_id.",
                ref: "ai-matrx/features/marketing/content-plan/components/PlanTree.tsx",
            },
            ai: {
                state: "live",
                note: "3 research-wave agents + 1 merger generate the tree server-side.",
                ref: "aidream/aidream/services/content_plan/generator.py#generate_merged_plan",
            },
        },
    },
    {
        id: "brief",
        label: "Page brief",
        blurb: "Write the core instructions for each individual page, with its own research behind it.",
        publicInfo: {
            title: "Decide what each page says",
            plain: "Every single page gets its own instructions, with its own research behind it, before a word is written.",
            icon: "FileText",
        },
        repos: ["ai-matrx", "aidream", "db"],
        stores: ["plan.node.brief", "plan.node.attributes"],
        maturity: "production",
        entry: "/marketing/content-plan (node panel)",
        pipes: {
            code: {
                state: "n/a",
                note: "Writing a brief is a judgement call — code cannot author it. Code only bulk-DISPATCHES briefs (empty-brief sweep).",
                ref: "ai-matrx/features/marketing/content-plan/hooks/useContentPlanAi.ts#usePlanBulkDeepen",
            },
            human: {
                state: "live",
                note: "Brief textarea on the node panel.",
                ref: "ai-matrx/features/marketing/content-plan/components/NodePanel.tsx",
            },
            ai: {
                state: "live",
                note: "deepen_node does node-scoped research and writes brief + source entities; brief-writer agent stages a draft for the user.",
                ref: "aidream/aidream/services/content_plan/generator.py#deepen_node",
            },
        },
    },
    {
        id: "realize",
        label: "Realize page shell",
        blurb: "Create the actual (empty) page in the CMS at the address the plan promised.",
        publicInfo: {
            title: "Create the pages",
            plain: "Each planned page is created for real, at the exact web address the plan promised — nothing gets lost between the plan and the site.",
            icon: "LayoutTemplate",
        },
        repos: ["aidream", "db"],
        stores: ["client_pages (CMS project)", "client_pages.plan_node_id"],
        maturity: "near",
        entry: "/marketing/content-plan (Make it real)",
        pipes: {
            code: {
                state: "live",
                note: "cms_reconcile buckets matched/ghosts/orphans/conflicts; cms_align realize/adopt/map/retire, dry-run + idempotent.",
                ref: "aidream/aidream/services/content_plan/cms_reconciler.py",
            },
            human: {
                state: "live",
                note: "Per-PAGE build from the node panel (sends the unbuilt ancestor chain in one call), plus the whole-site Setup rungs.",
                ref: "ai-matrx/features/marketing/content-plan/components/NodeRealityCard.tsx",
            },
            ai: {
                state: "live",
                note: "content_plan tool actions cms_reconcile / cms_align.",
                ref: "aidream/aidream/tools",
            },
        },
    },
    {
        id: "fill",
        label: "Fill page body",
        blurb: "Write the real content of each page from its brief.",
        publicInfo: {
            title: "Write the content",
            plain: "Every page is written from its own instructions, so it says something specific and useful instead of something generic.",
            icon: "PenLine",
        },
        repos: ["aidream", "db"],
        stores: ["plan.cms_fill_job", "plan.cms_fill_item", "client_pages.html_content_draft"],
        maturity: "near",
        pipes: {
            code: {
                state: "partial",
                note: "Durable queue + mandatory 1-page preview exist, but the plan's template_map is not consumed — there is no deterministic template path from plan to markup.",
                ref: "aidream/aidream/services/content_plan/cms_fill.py",
            },
            human: {
                state: "partial",
                note: "Pages are editable, but the CMS editor is raw HTML/CSS textareas — not a surface our non-technical user can work in.",
                ref: "ai-matrx/app/(core)/cms/[siteId]/pages/[pageId]",
            },
            ai: {
                state: "live",
                note: "_author_page writes html + page CSS + SEO through the guarded page_service.",
                ref: "aidream/aidream/services/content_plan/cms_fill.py#_author_page",
            },
        },
    },
    {
        id: "publish",
        label: "Publish",
        blurb: "Make the page live for the public.",
        publicInfo: {
            title: "Put it live",
            plain: "Nothing becomes public on its own. You look it over, and one click makes it live.",
            icon: "Send",
        },
        repos: ["ai-matrx", "aidream", "db"],
        stores: ["client_pages.is_published", "client_activity_log"],
        maturity: "production",
        pipes: {
            code: {
                state: "live",
                note: "One guarded seam: publish_page_draft RPC; bulk publish_many; advances plan node status forward-only.",
                ref: "aidream/aidream/services/cms/pages.py#publish",
            },
            human: {
                state: "live",
                note: "Publish one page from the plan's node panel (bridge path, advances plan status) or from the CMS page editor.",
                ref: "ai-matrx/features/marketing/content-plan/components/NodeRealityCard.tsx",
            },
            ai: {
                state: "live",
                note: "cms_page publish tool, gated by per-site agent_write_policy.",
                ref: "aidream/aidream/services/cms/access.py",
            },
        },
    },
    {
        id: "serve",
        label: "Live site",
        blurb: "The page is served to real visitors on a real domain.",
        publicInfo: {
            title: "Your site, your domain",
            plain: "Your pages are served to real visitors on your own web address.",
            icon: "Globe",
        },
        repos: ["my-matrx"],
        stores: ["client_sites.domain"],
        maturity: "near",
        pipes: {
            code: {
                state: "partial",
                note: "One renderer + custom-domain routing + 301 ledger are live, and collections now server-render into the HTML a crawler receives: <template data-matrx-collection> expanded in loadSitePageProps, order from settings.default_order / ?order= instead of a hardcoded created_at DESC (G-COLLECTIONS closed 2026-08-11). Still partial: the site emits NO sitemap.xml and NO robots.txt.",
                ref: "my-matrx/lib/render/clientSiteRenderer.js",
            },
            human: { state: "n/a", note: "Serving is infrastructure; there is no human step." },
            ai: { state: "n/a", note: "Serving is infrastructure; there is no agent step." },
        },
    },
    {
        id: "crawl",
        label: "Crawl",
        blurb: "Our crawler visits the live site and records what is actually there.",
        publicInfo: {
            title: "Check what's really there",
            plain: "We visit your live site the way a search engine does, and record exactly what it finds — not what you hoped it would find.",
            icon: "ScanSearch",
        },
        repos: ["aidream", "db"],
        stores: ["web.crawl_session", "web.page", "web.snapshot", "web.link_edge"],
        maturity: "production",
        entry: "/marketing/brands/[brandId]/sites/[siteId]",
        pipes: {
            code: {
                state: "live",
                note: "One crawl world as of 2026-08-10 (G-CRAWL-DUAL): the legacy scraper.crawl_* store is in graveyard and the every-minute dispatcher drives web.crawl_schedule. The writer side closed 2026-08-11 (G-CRAWL-SCHEDULE): CrawlScheduleCard writes intent direct to Supabase under the column-scoped grants of aidream migration 0322.",
                ref: "aidream/packages/matrx-scraper/matrx_scraper/web_crawl/schedules.py#dispatch_due_crawl_schedules",
            },
            human: {
                state: "live",
                note: "New-crawl workspace, per-page fetch, sitemap sync — all button-driven.",
                ref: "ai-matrx/features/marketing/crawler/direct-client.ts",
            },
            ai: {
                state: "missing",
                note: "No agent tool starts or reads a crawl.",
            },
        },
    },
    {
        id: "measure",
        label: "Measure",
        blurb: "Pull in the real numbers: Search Console, analytics, speed, rankings, backlinks.",
        publicInfo: {
            title: "Bring in the real numbers",
            plain: "Where you rank, who visited, how fast the page loads, who links to you — the actual results, all in one place.",
            icon: "BarChart3",
        },
        repos: ["aidream", "db"],
        stores: ["seo.search_performance_daily", "seo.web_analytics_daily", "seo.page_performance", "seo.backlink_*"],
        maturity: "production",
        entry: "/marketing/search-console",
        pipes: {
            code: {
                state: "partial",
                note: "GSC, backlinks and ranks sync nightly; PageSpeed coverage runs in small resumable ten-minute batches; GA4 remains on-demand only.",
                ref: "aidream/aidream/services/scheduling/system_task_runner.py#register_builtin_system_tasks",
            },
            human: {
                state: "live",
                note: "Connect + sync buttons per integration; Search Console workspace.",
                ref: "ai-matrx/features/marketing/components/integrations/SiteIntegrationsWorkspace.tsx",
            },
            ai: { state: "missing", note: "No agent can trigger or read a sync directly." },
        },
    },
    {
        id: "analyze",
        label: "Analyze",
        blurb: "Judge every page against what good looks like, and against how it is actually performing.",
        publicInfo: {
            title: "Find what's holding you back",
            plain: "Every page is checked against what good looks like — and against how it is actually performing out in the world.",
            icon: "SearchCheck",
        },
        repos: ["ai-matrx", "aidream", "db"],
        stores: ["web.analysis_result", "web.finding", "web.snapshot.audit_metrics"],
        maturity: "production",
        entry: "/marketing/brands/[brandId]/sites/[siteId]/findings",
        pipes: {
            code: {
                state: "live",
                note: "15-check catalogue runs automatically after every full crawl; findings reconciled, not duplicated. FE evaluators are byte-parity locked to the server.",
                ref: "ai-matrx/features/marketing/data/analysis-service.ts",
            },
            human: {
                state: "live",
                note: "Findings table, finding detail, site analysis table, GSC insight views.",
                ref: "ai-matrx/features/marketing/components/analysis/FindingsTable.tsx",
            },
            ai: {
                state: "partial",
                note: "7 SEO agent slots exist and page analyzers run, but no agent reviews the finding register itself.",
                ref: "aidream/aidream/services/seo/keyword_agents.py",
            },
        },
    },
    {
        id: "suggest",
        label: "Suggest",
        blurb: "Turn what we learned into a one-click suggestion the user can accept.",
        publicInfo: {
            title: "Get told what to do next",
            plain: "What we learn becomes a plain-English suggestion you can accept — not a report you have to decode first.",
            icon: "Lightbulb",
        },
        repos: ["ai-matrx", "db"],
        stores: ["platform.assists", "web.finding.status"],
        maturity: "stub",
        pipes: {
            code: {
                state: "partial",
                note: "Exactly ONE SEO producer emits assists (Search Console insights). The 15-check finding catalogue emits none.",
                ref: "ai-matrx/features/marketing/search-console/insights-assists-producer.ts",
            },
            human: {
                state: "partial",
                note: "Findings are READ-ONLY in the app — a user cannot acknowledge, resolve or suppress one. Assist chips can be accepted or dismissed.",
                ref: "ai-matrx/features/assists/runtime/useAssistRunner.ts",
            },
            ai: {
                state: "partial",
                note: "An assist can launch a pre-filled agent run, but nothing produces assists from findings for it to launch from.",
                ref: "ai-matrx/features/assists/runtime/handlers/launch-agent.ts",
            },
        },
    },
    {
        id: "writeback",
        label: "Write back",
        blurb: "Push the accepted improvement into the page and back into the plan.",
        publicInfo: {
            title: "Improve it, and go again",
            plain: "An accepted improvement is written back into the page and back into the plan — so the next pass starts from what you just learned.",
            icon: "RefreshCw",
        },
        repos: ["ai-matrx", "aidream", "db"],
        stores: ["client_pages (draft columns)", "plan.node.status_id", "seo metrics_desired"],
        maturity: "near",
        pipes: {
            code: {
                state: "live",
                note: "Desired-meta -> page intent -> CMS draft push; never auto-publishes, never moves a route (THE 301 LAW).",
                ref: "ai-matrx/features/marketing/lib/push-to-cms.ts",
            },
            human: {
                state: "live",
                note: "Apply-meta-to-page and Push-to-CMS cards.",
                ref: "ai-matrx/features/marketing/components/pages/cards/PushToCmsCard.tsx",
            },
            ai: {
                state: "partial",
                note: "Agents can write CMS drafts via tools, but no agent path starts from a finding and ends at a corrected page.",
                ref: "ai-matrx/features/marketing/components/pages/MarketingPageWriteTargets.tsx",
            },
        },
    },
];

// ---------------------------------------------------------------------------
// EDGES — the connections. This is where the loop actually breaks.
// ---------------------------------------------------------------------------

const MISSING = (note: string): PipeStatus => ({ state: "missing", note });

export const EDGES: LoopEdge[] = [
    {
        id: "research->plan",
        from: "research",
        to: "plan",
        label: "site shape",
        pipes: {
            code: {
                state: "live",
                note: "web.site.settings.content_plan.research_topic_id is the durable link; latest successful document is read on both sides.",
                ref: "ai-matrx/features/marketing/content-plan/setup/draft.ts",
            },
            human: {
                state: "live",
                note: "Build-with-AI dialog: research a company, then commit the staged shape.",
                ref: "ai-matrx/features/marketing/content-plan/setup/components/SetupView.tsx",
            },
            ai: {
                state: "live",
                note: "Server generator loads the report and runs the 3+1 agent wave.",
                ref: "aidream/aidream/services/content_plan/generator.py#_load_research_report",
            },
        },
    },
    {
        id: "plan->brief",
        from: "plan",
        to: "brief",
        label: "briefs",
        pipes: {
            code: { state: "live", note: "Bulk sweep dispatches every empty-brief node.", ref: "useContentPlanAi.ts#usePlanBulkDeepen" },
            human: { state: "live", note: "Open a node, write the brief.", ref: "NodePanel.tsx" },
            ai: { state: "live", note: "deepen_node / brief-writer.", ref: "generator.py#deepen_node" },
        },
    },
    {
        id: "brief->realize",
        from: "brief",
        to: "realize",
        label: "real pages",
        gaps: ["G-TEMPLATE"],
        pipes: {
            code: {
                state: "partial",
                note: "realize creates the page at the right route but produces an EMPTY draft — plan.profile.template_map is never read.",
                ref: "cms_reconciler.py#_realize_batch",
            },
            human: {
                state: "live",
                note: "Node panel 'The real page' always states the verdict and carries its next action; Setup rungs do the whole site with dry-run.",
                ref: "NodeRealityCard.tsx",
            },
            ai: { state: "live", note: "content_plan tool.", ref: "aidream/aidream/tools" },
        },
    },
    {
        id: "realize->fill",
        from: "realize",
        to: "fill",
        label: "content",
        pipes: {
            code: { state: "live", note: "Durable job/item queue with cancel + status.", ref: "cms_fill.py" },
            human: {
                state: "live",
                note: "'Write the content' authors ONE page from its brief in the node panel; Setup previews one page then fans out.",
                ref: "NodeRealityCard.tsx",
            },
            ai: { state: "live", note: "_author_page.", ref: "cms_fill.py#_author_page" },
        },
    },
    {
        id: "fill->publish",
        from: "fill",
        to: "publish",
        label: "goes live",
        pipes: {
            code: { state: "live", note: "publish_many over linked nodes.", ref: "content_plan.py POST /cms-publish" },
            human: {
                state: "live",
                note: "Publish one page from the node panel through the BRIDGE (advances the plan node); CMS editor publishes the page alone.",
                ref: "NodeRealityCard.tsx",
            },
            ai: { state: "live", note: "cms_page publish, policy-gated.", ref: "aidream/aidream/services/cms/access.py" },
        },
    },
    {
        id: "publish->serve",
        from: "publish",
        to: "serve",
        label: "reachable",
        gaps: [],
        pipes: {
            code: {
                state: "partial",
                note: "Rendering, domains, server-rendered collections, sitemap.xml, and robots.txt are live. Still missing on this edge: an IndexNow/GSC submit on publish (G-PUBLISH-CRAWL).",
                ref: "my-matrx/lib/render/sitemap.js",
            },
            human: { state: "n/a", note: "Nothing for a human to do." },
            ai: { state: "n/a", note: "Nothing for an agent to do." },
        },
    },
    {
        id: "serve->crawl",
        from: "serve",
        to: "crawl",
        label: "what shipped",
        gaps: ["G-PUBLISH-CRAWL"],
        pipes: {
            code: {
                state: "missing",
                note: "THE BIGGEST BREAK IN THE LOOP. Publishing a page notifies nothing: no crawl is enqueued, no web.page row is created, nothing is invalidated. The chain stops here and only restarts when a human clicks Crawl.",
            },
            human: { state: "live", note: "Start a crawl by hand.", ref: "NewCrawlWorkspace.tsx" },
            ai: MISSING("No agent tool can start a crawl."),
        },
    },
    {
        id: "crawl->measure",
        from: "crawl",
        to: "measure",
        label: "the numbers",
        gaps: ["G-CMS-IDENTITY"],
        pipes: {
            code: {
                state: "live",
                note: "web.page is the anchor: gsc_page_stat, search_performance_daily, web_analytics_daily and page_performance all carry a real page_id FK.",
                ref: "aidream/packages/matrx-seo/matrx_seo/db/models_seo.py",
            },
            human: { state: "live", note: "Per-site integrations workspace.", ref: "SiteIntegrationsWorkspace.tsx" },
            ai: MISSING("No agent-side sync trigger."),
        },
    },
    {
        id: "measure->analyze",
        from: "measure",
        to: "analyze",
        label: "findings",
        pipes: {
            code: { state: "live", note: "Analysis runs automatically after each full crawl; GSC insight rules run client-side.", ref: "analysis-service.ts" },
            human: { state: "live", note: "Run analysis on demand.", ref: "CatalogueAnalysisPanel.tsx" },
            ai: { state: "partial", note: "Page-analyzer agents run on demand; nothing reviews the whole register.", ref: "aidream/aidream/services/seo/page_agents.py" },
        },
    },
    {
        id: "analyze->suggest",
        from: "analyze",
        to: "suggest",
        label: "offers",
        gaps: ["G-FINDING-ASSIST", "G-SUGGEST-FORK"],
        pipes: {
            code: {
                state: "partial",
                note: "THE SECOND BIG BREAK IS CLOSED (G-FINDING-ASSIST, 2026-08-13): web.finding rows now become platform.assists rows — a deterministic per-site sweep emits up to two page chips plus one cross-page rollup, mounted on the register, the priority queue, and the audit rollup. Still partial only because the fork is absorbed but not collapsed: the offer layer is unified on platform.assists and the capability inventory is written, yet thirteen capabilities of kg-suggestions and of web.finding's own offer layer remain uncovered, so nothing may be retired (G-SUGGEST-FORK).",
                ref: "features/marketing/findings-assists-producer.ts",
            },
            human: {
                state: "live",
                note: "A user can act on a finding (acknowledge/resolve/suppress via finding-mutations.ts) AND is now offered the highest-value ones as chips where they stand, instead of having to think to open the register.",
                ref: "FindingsAssistStrip.tsx",
            },
            ai: {
                state: "partial",
                note: "The chip's verb button hands the SEO agent a prepared brief for the specific finding (metadata checks run all the way to ApplyMetaToPage). No agent yet proposes across the whole register unprompted.",
                ref: "features/marketing/lib/finding-remedies.ts",
            },
        },
    },
    {
        id: "suggest->writeback",
        from: "suggest",
        to: "writeback",
        label: "applied",
        pipes: {
            code: {
                state: "live",
                note: "planDeterministicFix drafts the derivable class free and unattended; the findings assist producer upgrades those chips to apply_page_meta, which lands desired metadata + a CMS DRAFT. Never publishes.",
                ref: "features/marketing/lib/finding-fix.ts",
            },
            human: {
                state: "live",
                note: "FindingFixCard on the finding shows before/after, risks, and one Apply-as-a-draft button; PushToCmsCard remains the page-level path.",
                ref: "features/marketing/components/analysis/FindingFixCard.tsx",
            },
            ai: {
                state: "live",
                note: "The purpose-built SEO Finding Fixer (slot seo.finding_fixer, agent seo_finding_fixer_v1) writes the judgement-call replacements via POST /seo/findings/draft-fix. Proposes only — it has no write path.",
                ref: "aidream/aidream/services/seo/finding_fix.py",
            },
        },
    },
    {
        id: "writeback->fill",
        from: "writeback",
        to: "fill",
        label: "page fixed",
        pipes: {
            code: { state: "live", note: "Writes land in draft columns only; publishing stays a separate, deliberate act.", ref: "push-to-cms.ts#executeCmsPush" },
            human: { state: "live", note: "Review the draft, then publish.", ref: "ai-matrx/app/(core)/cms/[siteId]/pages/[pageId]" },
            ai: { state: "live", note: "cms_page tool under agent_write_policy.", ref: "aidream/aidream/services/cms/access.py" },
        },
    },
    {
        id: "writeback->plan",
        from: "writeback",
        to: "plan",
        label: "plan learns",
        gaps: ["G-STALENESS", "G-PLAN-STATUS"],
        pipes: {
            code: {
                state: "partial",
                note: "Publishing advances a node to 'published', but nothing ever flips a node to 'needs-update' from performance data — the cadences in plan.profile are unread.",
                ref: "cms_reconciler.py#advance_plan_status_for_published_page",
            },
            human: { state: "live", note: "Set node status by hand.", ref: "NodePanel.tsx" },
            ai: MISSING("No agent proposes plan changes from live performance."),
        },
    },
    {
        id: "analyze->plan",
        from: "analyze",
        to: "plan",
        label: "reality check",
        gaps: ["G-RECONCILE-UI"],
        pipes: {
            code: {
                state: "partial",
                note: "plan_node -> web_page reconciliation exists (realizes / migrates_from) but is thin and has no scheduled run.",
                ref: "aidream/aidream/services/content_plan/reconciler.py",
            },
            human: { state: "partial", note: "Plan-vs-reality overlay exists but is manual-run only; badges not surfaced in table/map.", ref: "ai-matrx/features/marketing/content-plan/hooks/usePlanReality.ts" },
            ai: MISSING("No agent dispositions orphan URLs."),
        },
    },
];

// ---------------------------------------------------------------------------
// GAPS — never delete an id; close it with evidence.
// ---------------------------------------------------------------------------

export const GAPS: LoopGap[] = [
    {
        id: "G-PUBLISH-CRAWL",
        title: "Publishing a page tells nobody",
        severity: "blocker",
        status: "closed",
        at: "serve->crawl",
        breaks: ["code", "ai"],
        detail:
            "CLOSED AND RUNNING 2026-08-13. aidream deployed; web_announce is called from cms/pages.py:932 on publish and from system_task_runner.py:958 for the reconcile sweep. Live-verified: the 'CMS publish → crawl reconcile' task is enabled with 198 runs / 0 failures. Still deliberately NOT claimed here: the IndexNow / Search Console submit ping on publish — that is a new gap if wanted, not this one.",
        lane: "L1",
        evidence: "aidream/aidream/services/web_announce/",
    },
    {
        id: "G-CRAWL-SCHEDULE",
        title: "No UI can set a site's crawl cadence",
        severity: "major",
        status: "closed",
        at: "crawl",
        breaks: ["human"],
        detail:
            "CLOSED 2026-08-11. The writer half shipped: CrawlScheduleCard in the new-crawl workspace (plus CrawlScheduleSummary in SiteOverview) creates, edits, and toggles a site's recurring schedule directly through crawl-schedule-service.ts with guardedUpdate version CAS. aidream migration 0322 is applied and ledgered: authenticated has column-scoped INSERT/UPDATE for intent columns plus version, while dispatcher lease/outcome columns stay server-only. Every save clears next_run_at so the dispatcher recomputes the occurrence from the new cadence. Verified live with a schedule row written from the card. Still open elsewhere: historical dispatcher failures and the AI pipe (no agent tool starts or reads a crawl).",
        lane: "L1",
    },
    {
        id: "G-SITEMAP",
        title: "Live sites emit no sitemap.xml and no robots.txt",
        severity: "major",
        status: "closed",
        at: "publish->serve",
        breaks: ["code"],
        detail:
            "CLOSED AND LIVE-VERIFIED 2026-08-12: https://www.mymatrx.com/c/prp-injection-md/sitemap.xml returns 200 and robots.txt serves a correct per-host Sitemap line. STILL ABSENT and deliberately not claimed closed here: any IndexNow or Search Console submit ping on publish — that is a new gap if wanted, not this one.",
        lane: "L1",
        evidence: "my-matrx/lib/render/sitemap.js",
    },
    {
        id: "G-COLLECTIONS",
        title: "Collections render client-side only — invisible to crawlers",
        severity: "major",
        status: "closed",
        at: "serve",
        breaks: ["code"],
        detail:
            "CLOSED 2026-08-11. my-matrx expands <template data-matrx-collection> bindings server-side in loadSitePageProps (collectionBindings.js scan+expand, ssrBindings.js fetch) through the same public_read / public_read_fields gate as the HTTP route, with renderer-owned escaping. Ordering is configurable — ?order= / data-order -> site_collections.settings.default_order -> created_at:desc (the old default, unchanged) — DB-side with a stable id tiebreak, sort fields restricted to readable ones. PROOF: curl of /c/dev-website/events-and-booking with no JS returns 'Open house (Sep 3)' above 'Herbal workshop (Sep 17)' with internal_notes absent; 19 live iopbm + prp-injection-md pages render byte-identically before/after; 207 render-layer tests pass. Remaining (separate, W2C-render-binding): data-filter, MatrxData.render(), and aidream + matrx-frontend still hardcoding -created_at.",
        lane: "L1",
        evidence: "my-matrx/lib/render/collectionBindings.js",
    },
    {
        id: "G-FINDING-ASSIST",
        title: "Findings never reach the assists ledger",
        severity: "major",
        status: "closed",
        at: "analyze->suggest",
        breaks: ["code", "ai"],
        detail:
            "CLOSED 2026-08-13. The producer existed but nothing mounted it — dead code that compiled. FindingsAssistStrip is now mounted on all three surfaces where findings are read (register, priority queue, audit rollup). PROOF on live Matrx Main: platform.assists went from ZERO finding-sourced rows to three for prpinjectionmd.com — two page chips (seo.finding.meta_description_presence, seo.finding.h1_presence) and one rollup (seo.finding_rollup.meta_description_length, '121+ pages share one problem'), each with a stable dedupe key '<sourceKey>:<siteId>:<pageId|site>'. Dismissal is durable: 'Don't show again' wrote status='dismissed' and three later sweeps (including a hard reload) re-ran filterUndecidedKeys and did not resurrect it. Chips obey THE INTENTIONAL-ACTION LAW — clicking expands the card; only 'Open agent' runs. Fixed in the same pass: isFindingAssist matched 'seo.finding.' so every rollup chip was silently filtered out of the page strip while sitting in the ledger.",
        lane: "L2",
        evidence:
            "ai-matrx/features/marketing/components/analysis/FindingsAssistStrip.tsx",
    },
    {
        id: "G-FINDING-TRACK",
        title: "A user cannot act on a finding",
        severity: "major",
        status: "closed",
        at: "suggest",
        breaks: ["human"],
        detail:
            "CLOSED. features/marketing/data/finding-mutations.ts ships acknowledge / unacknowledge / resolve / reopen / suppress / unsuppress, bulk verbs, and whole-check suppression, wired into FindingDetail and the findings table.",
        lane: "L2",
        evidence: "ai-matrx/features/marketing/data/finding-mutations.ts",
    },
    {
        id: "G-FINDING-FIX",
        title: "No path from a finding to a fixed page",
        severity: "blocker",
        status: "closed",
        at: "suggest->writeback",
        breaks: ["code", "ai"],
        detail:
            "CLOSED 2026-08-13, all three pipes. AI: scripts/seed_finding_fixer.py now creates the purpose-built system agent seo_finding_fixer_v1, seeds + activates its two Content-IR kinds, and pins slot seo.finding_fixer; finding_fix.py joined DECLARING_MODULES and is reachable at POST /seo/findings/draft-fix (durable streamed command, proposes only — no write path). CODE: planDeterministicFix + buildFindingFixEvidence draft the derivable class with zero model calls, and the findings assist producer upgrades those chips to the apply_page_meta action. HUMAN: FindingFixCard on every finding shows before/after plus risks behind one Apply-as-a-draft button. All three land through applyFindingFix -> updatePageIntent + executeCmsPush — the existing seams — writing draft twins only. Nothing publishes; THE 301 LAW holds (no route is ever moved, no CMS page created).",
        lane: "L2",
        evidence: "ai-matrx/features/marketing/components/analysis/FindingFixCard.tsx",
    },
    {
        id: "G-SUGGEST-FORK",
        title: "Three parallel suggestion systems",
        severity: "major",
        status: "in-progress",
        at: "suggest",
        breaks: ["code", "human", "ai"],
        detail:
            "ABSORB COMPLETE AND SHIPPED; RETIREMENT DELIBERATELY BLOCKED. The seven absorbed columns on platform.assists were DDL-only — no client read or wrote one — and are now live end to end: the evidence receipt on the card, first_seen_at + occurrences (a re-notice counts and never moves the first sighting), the resolved status with resolveAssistsByDedupeKeys() so a condition that went away closes itself, decision_note, is_starred and viewed_at with a flag column, unseen dot and filters in the /assists manager. THE CAPABILITY INVENTORY is written in features/assists/FEATURE.md — every capability of kg-suggestions and of web.finding's offer layer, each judged better / equal / not yet. NOTHING WAS RETIRED, and that is the method working: thirteen capabilities are still uncovered. The widest is that an assist is visibility='personal' addressed to one user_id, so a shared SEO register produces chips only the person who swept can see; then producer-level suppression (dismissal is per dedupe_key, so silencing a whole check means dismissing every chip one at a time), per-record chips (entity_type/entity_id are on the ledger with no selector), and an rpc action kind for kg-suggestions' accept semantics. Also settled here: web.finding's domain half is NOT a fork and is not being absorbed (the analyzer owns detection; only the offer layer moved), and extend.wbx_seo_audit is NOT dead — it is a registered canonical entity with zero consumers, i.e. unfinished work under policies/unfinished-work-alarm.md, so deleting it is forbidden.",
        lane: "L2",
        evidence: "ai-matrx/features/assists/FEATURE.md",
    },
    {
        id: "G-TEMPLATE",
        title: "Realized pages are empty — template_map is never read",
        severity: "major",
        status: "closed",
        at: "brief->realize",
        breaks: ["code"],
        detail:
            "CLOSED 2026-08-13. aidream deployed. content_plan/templates.py is a library layer over plan.profile.template_map with a real resolution chain, consumed by four modules (routers/content_plan.py, content_plan/service.py, cms_fill.py, cms_reconciler.py): cms_reconciler scaffolds html_content/css_content on create and cms_fill treats a scaffold as unfilled. Production no longer realizes empty drafts.",
        lane: "L3",
        evidence: "aidream/aidream/services/content_plan/templates.py",
    },
    {
        id: "G-CMS-IDENTITY",
        title: "CMS pages join to measurement by route string",
        severity: "major",
        status: "open",
        at: "crawl->measure",
        breaks: ["code"],
        detail:
            "Half solved. plan.node -> client_pages is durable via client_pages.plan_node_id (written only through page_service.set_plan_link, consumed by useCmsPageMap). But web.page -> client_pages is still route-string matching in push-to-cms.ts, there is no web_page_id anywhere, and URL normalisation remains a hand-maintained twin (ai-matrx page-url.ts vs matrx-scraper url.py) with no shared package and no parity test.",
        lane: "L3",
    },
    {
        id: "G-STALENESS",
        title: "Nothing ever marks a page as needing an update",
        severity: "major",
        status: "closed",
        at: "writeback->plan",
        breaks: ["code", "ai"],
        detail:
            "CLOSED AND RUNNING. services/content_plan/signals.py flips published/live-verified nodes to needs-update on two lanes — cadence (plan.profile.cadences review_days) and a 28-day-over-28-day GSC click decline. Registered as plan_signal_sweep, seeded daily by migration 0252, and live-verified: 17 runs, 0 failures.",
        lane: "L4",
        evidence: "aidream/aidream/services/content_plan/signals.py",
    },
    {
        id: "G-PLAN-STATUS",
        title: "plan_status has no enforced state machine",
        severity: "major",
        status: "closed",
        at: "writeback->plan",
        breaks: ["code"],
        detail:
            "CLOSED 2026-08-13 — the split is healed. plan._status_flow_guard enforces transitions live (migrations 0326/0327/0328), and the service half that cooperates with it now ships and is deployed: content_plan/service.py:383 reads status_override_reason as the audited escape hatch and refuses it when no status change accompanies it. Code and trigger agree again.",
        lane: "L4",
        evidence: "aidream/aidream/services/content_plan/service.py",
    },
    {
        id: "G-RECONCILE-UI",
        title: "Plan-vs-reality is manual and half-surfaced",
        severity: "minor",
        status: "in-progress",
        at: "analyze->plan",
        breaks: ["code", "human", "ai"],
        detail:
            "Improved and shipped: reality badges now reach the pillar map and both plan trees. The fuller drift surface (usePlanDrift + PlanDriftBar/PlanDriftSheet + bridgeAdopt/bridgeResolveConflict over the existing cms-align adopt/map actions) now compiles and is committed — but NOTHING MOUNTS IT yet, so it reaches no user. Still true: usePlanReality is manual-run only (enabled:false), PlanNodesTable has no reality reference, and the server reconciler has no scheduled task.",
        lane: "L4",
    },
    {
        id: "G-RESEARCH-TRIGGER",
        title: "Research cannot be started by code or by an agent",
        severity: "major",
        status: "closed",
        at: "research",
        breaks: ["code", "ai"],
        detail:
            "CLOSED AND RUNNING 2026-08-13. aidream deployed. Both pipes live: aidream/tools/research_tool.py exposes research_run(action='start') for the AI pipe, and research_refresh_dispatch drives the scheduled lane. Live-verified: the 'Research refresh dispatch' task is enabled with 394 runs / 2 failures.",
        lane: "L5",
        evidence: "aidream/aidream/tools/research_tool.py",
    },
    {
        id: "G-PIPE-SELECTOR",
        title: "No 'one step, three pipes' primitive",
        severity: "blocker",
        status: "in-progress",
        at: "plan",
        breaks: ["code", "human", "ai"],
        detail:
            "ONE AUTHORITY, AI LEG DEAD. packages/matrx-graph/nodes/pipe/ defines StepContract, PipeBindings{code,human,ai}, select_pipe and a registered pipe.step executor validating all three legs against one schema — the right shape. CORRECTION 2026-08-13: services/growth_loop/pipes.py is NOT a competing fork — earlier entries claimed it was. Its module docstring refuses to execute on purpose ('Building the executor here would create exactly the second authority the gap entry warns about'); resolve_pipe is a PURE policy->ResolvedPipe function meant to compose with the node. Two real defects remain: (1) set_ai_pipe_runner is still called only inside matrx-graph, never by an aidream host, so the AI leg fails with no_ai_pipe_runner; (2) that docstring is stale — it says the pipe node does not exist, and it does.",
        lane: "L5",
    },
    {
        id: "G-HUMAN-TIMEOUT",
        title: "No timed human-to-AI escalation",
        severity: "major",
        status: "closed",
        at: "plan",
        breaks: ["human", "ai"],
        detail:
            "CLOSED AND RUNNING 2026-08-13. decide_for_absent_human finally has a caller: services/human_decisions/sweeper.py runs on the sch_* spine as the 30s system task 'human_decision_escalation' (migration 0346, handler-gated like every other sweep). One tick: scan interrupted runs that declared an escalation, put the 'a workflow is waiting on you' chip in front of the person, defer until the FROZEN deadline passes, claim with a lease, let the declared fallback decide, resume through the queued worker with matrx_decision provenance stamped on the answer. THE HUMAN ALWAYS WINS — the resume goes through the same atomic interrupted->running claim the HTTP route uses, so a person who answers mid-escalation keeps their decision and the AI's is discarded. Live-verified end to end against Matrx Main: a real human_input with escalation{after_seconds:300, fallback:agent} was noticed, deferred for the full 5 minutes, escalated by the platform decider, resumed and completed, with the outcome in platform.activity_log (workflow_decision.escalated) and on the run row. Defaults unchanged (growth_loop/pipes.py default_policy: human first, AI at 3600s, realize/serve/crawl/measure pinned to CODE).",
        lane: "L5",
        evidence: "aidream/aidream/services/human_decisions/",
    },
    {
        id: "G-ORCHESTRATOR",
        title: "No end-to-end run object",
        severity: "blocker",
        status: "in-progress",
        at: "research",
        breaks: ["code", "ai"],
        detail:
            "THE HUMAN PIPE IS CLOSED 2026-08-13; code and AI remain. THE ROOT CAUSE, for the record: 3,209 lines landed on 2026-08-11 (aidream 7505afdf6, the stale-machine rescue) and were dead for two days because app.py mounts 138 routers and growth_loop was the one never added. Routes supplied (13 at /api/growth-loop/*, authed), and a real UI now drives them: a site owner starts the loop, sees its stage, sees the blocker and continues/skips/pauses it at /marketing/brands/[brandId]/sites/[siteId]/growth-loop. First live loop_run row written from that button. REMAINING, and why this stays open: no STAGE SERVICE calls enter_stage/complete_stage on its own (crawl finishing does not advance the loop — every advance is still a human click), and no agent drives a stage (blocked on G-PIPE-SELECTOR).",
        lane: "L6",
        evidence: "ai-matrx/features/growth-loop/run/",
    },
    {
        id: "G-ORCHESTRATOR-READ",
        title: "The loop's own tables are unreadable from a browser",
        severity: "minor",
        status: "open",
        at: "research",
        breaks: ["human"],
        detail:
            "OPENED 2026-08-13 while building the human pipe. The `growth` schema is NOT in this project's PostgREST exposed-schemas list, so `supabase.schema('growth')` returns PGRST106 and the client cannot read growth.v_loop_state at all — every loop read is an aidream round-trip, against this repo's rule that reads go direct. Two things must land together: expose `growth` (a Supabase API setting, and the change that takes the WHOLE API down when a bad schema name is written), and fix the read grants underneath it — growth.v_loop_state is a postgres-owned view with NO security_invoker, so exposing it as-is would let any authenticated user read every org's loops, and growth.loop_stage_run's SELECT policy resolves only through iam.accessible_entity_ids with no parent-follows-loop_run clause, so a loop's own creator cannot read its stages. Do NOT expose the schema before both are fixed.",
        lane: "L6",
    },
    {
        id: "G-SUPERVISOR",
        title: "No supervisor agent over the stages",
        severity: "major",
        status: "open",
        at: "plan",
        breaks: ["ai"],
        detail:
            "The general primitive now EXISTS and is shipped: agent_sets supervisor mode exposes each set member as a tool of an orchestrator agent. What is still missing is the specific thing — no declared slot supervises loop stages, judges stage completion, or hands off; growth_loop completion is caller-asserted through the API, never agent-judged.",
        lane: "L6",
    },
    {
        id: "G-CRAWL-DUAL",
        title: "Two crawl worlds",
        severity: "minor",
        status: "closed",
        at: "crawl",
        breaks: ["code"],
        detail:
            "CLOSED on the backend: the legacy scraper world is gone from origin — scraper_admin.py deleted, services/scraper/ emptied, api/routers/scraper.py reduced to a re-export of matrx_scraper, and the registered dispatcher drives the modern web.crawl_schedule. Frontend residue is tracked separately (permissions registry + generated types still expose the dead scraper schema).",
        lane: "L1",
        evidence: "aidream/aidream/services/scraper_client/__init__.py",
    },
    {
        id: "G-MEASURE-SCHEDULE",
        title: "GA4 never refreshes itself",
        severity: "minor",
        status: "in-progress",
        at: "measure",
        breaks: ["code"],
        detail:
            "BOTH HANDLERS NOW LIVE AND BOTH FAILING. Verified 2026-08-13: GA4 shipped and its task is enabled — and has failed 2 of 2 runs with the swallowed message '3 site syncs failed' (a count where the per-site cause must be). PageSpeed regressed hard: 267 runs / 155 failed (58%), up from 49/13, and 90 of those failures are TWO page ids retried forever on terminal PSI verdicts (NO_FCP, FAILED_DOCUMENT_REQUEST) — a poison-pill loop, not a systemic break; 16 more are 'runner cancelled before completion' (the ten-minute budget). Scheduling is solved; error handling is not. Separately, SitePerformanceWorkspace reads an automation field the backend does not return.",
        lane: "L1",
    },
];

// ---------------------------------------------------------------------------
// LANES — what different agents can build at the same time without colliding.
// ---------------------------------------------------------------------------

export const LANES: Lane[] = [
    {
        id: "L1",
        label: "Close the publish -> crawl break",
        rationale: "Everything downstream is starved until a published page announces itself and crawls run on a cadence. Touches CMS publish, my-matrx discovery surfaces, and crawl scheduling.",
        repos: ["aidream", "my-matrx", "db"],
        dependsOn: [],
    },
    {
        id: "L2",
        label: "Make findings actionable",
        rationale: "One vehicle for suggestions, a finding->assist producer, a user-drivable finding lifecycle, and the fix agent an accepted assist launches.",
        repos: ["ai-matrx", "aidream", "db"],
        dependsOn: [],
    },
    {
        id: "L3",
        label: "Page identity and templates",
        rationale: "Give a CMS page a durable identity across projects and give realize a template so pages are not born empty. Both are about what a page IS.",
        repos: ["aidream", "ai-matrx", "db"],
        dependsOn: [],
    },
    {
        id: "L4",
        label: "Staleness and plan truth",
        rationale: "Cadence-driven needs-update flips, the plan_status state machine, and surfacing plan-vs-reality drift. All read measurement and write plan.",
        repos: ["aidream", "ai-matrx", "db"],
        dependsOn: ["L1"],
    },
    {
        id: "L5",
        label: "THE THREE PIPES primitive",
        rationale: "One step with a swappable executor (code / human / AI), timed human->AI escalation, and an agent-callable entry for every stage that lacks one. This is the platform primitive the whole vision rests on — build it once, consume it everywhere.",
        repos: ["aidream", "ai-matrx"],
        dependsOn: [],
    },
    {
        id: "L6",
        label: "The loop run object and its supervisor",
        rationale: "One durable run spanning all twelve stages, watchable and resumable, plus the supervising agent. Needs the pipe primitive to exist first.",
        repos: ["aidream", "ai-matrx", "db"],
        dependsOn: ["L5"],
    },
];

// ---------------------------------------------------------------------------
// Derived helpers (pure — safe to import anywhere).
// ---------------------------------------------------------------------------

export const PIPES: Pipe[] = ["code", "human", "ai"];

export const PIPE_LABEL: Record<Pipe, string> = {
    code: "Code",
    human: "Human",
    ai: "AI",
};

export function stageById(id: string): LoopStage | undefined {
    return STAGES.find((s) => s.id === id);
}

export function gapsAt(id: string): LoopGap[] {
    return GAPS.filter((g) => g.at === id && g.status !== "closed");
}

/** Worst pipe state on an edge — drives edge colouring. */
export function edgeHealth(edge: LoopEdge): PipeState {
    const states = PIPES.map((p) => edge.pipes[p].state).filter((s) => s !== "n/a");
    if (states.includes("missing")) return "missing";
    if (states.includes("partial")) return "partial";
    return "live";
}

// ---------------------------------------------------------------------------
// PUBLIC VIEW — derived, never hand-written.
//
// 🚨 THE HONESTY GATE. The public page at /how-it-works renders capability
// ONLY from `state === "live"`. "partial" and "missing" produce NOTHING —
// they can never leak out as a promise. That is deliberate: a marketing page
// must not claim a capability this map records as unfinished, and the only
// way to make it claim one is to flip a pipe to "live" here, which rule 1 at
// the top of this file says requires a `ref` an auditor can open.
//
// Consequence, on purpose: a stage with no live pipe simply shows no
// capability chips. Do not add a fallback.
// ---------------------------------------------------------------------------

/** How a customer can make a step happen. Derived from a LIVE pipe only. */
export type PublicCapability = "you" | "ai" | "automatic";

export const PUBLIC_CAPABILITY: Record<PublicCapability, { pipe: Pipe; label: string; short: string }> = {
    you: { pipe: "human", label: "You can do it yourself", short: "You" },
    ai: { pipe: "ai", label: "An AI agent can do it for you", short: "AI" },
    automatic: { pipe: "code", label: "It happens automatically", short: "Automatic" },
};

export const PUBLIC_CAPABILITIES: PublicCapability[] = ["you", "ai", "automatic"];

export type PublicStage = LoopStage & { publicInfo: PublicStageInfo };

/** The stages cleared for public display, in loop order. */
export function publicStages(): PublicStage[] {
    return STAGES.filter((s): s is PublicStage => Boolean(s.publicInfo));
}

/** Only ways this step can ACTUALLY be run today. Never intent. */
export function publicCapabilities(stage: LoopStage): PublicCapability[] {
    return PUBLIC_CAPABILITIES.filter((c) => stage.pipes[PUBLIC_CAPABILITY[c].pipe].state === "live");
}

/**
 * Honest headline numbers for the public page: how many public stages you can
 * run yourself, how many an agent can run, how many run automatically.
 */
export function publicStanding(): { stages: number } & Record<PublicCapability, number> {
    const stages = publicStages();
    const counts = { stages: stages.length, you: 0, ai: 0, automatic: 0 };
    for (const stage of stages) {
        for (const capability of publicCapabilities(stage)) counts[capability] += 1;
    }
    return counts;
}

export function loopScore(): { live: number; partial: number; missing: number; total: number } {
    let live = 0;
    let partial = 0;
    let missing = 0;
    for (const edge of EDGES) {
        for (const pipe of PIPES) {
            const state = edge.pipes[pipe].state;
            if (state === "live") live += 1;
            else if (state === "partial") partial += 1;
            else if (state === "missing") missing += 1;
        }
    }
    return { live, partial, missing, total: live + partial + missing };
}
