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
                note: "Setup bridge rungs drive reconcile then align with confirmation.",
                ref: "ai-matrx/features/marketing/content-plan/setup/components/SetupBridgeSection.tsx",
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
                note: "Publish button on the CMS page editor.",
                ref: "ai-matrx/features/cms/hooks/useCmsPages.ts#publishDraft",
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
        repos: ["my-matrx"],
        stores: ["client_sites.domain"],
        maturity: "near",
        pipes: {
            code: {
                state: "partial",
                note: "One renderer + custom-domain routing + 301 ledger are live, but the site emits NO sitemap.xml and NO robots.txt, and collections render client-side only (invisible to any crawler).",
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
        repos: ["aidream", "db"],
        stores: ["web.crawl_session", "web.page", "web.snapshot", "web.link_edge"],
        maturity: "production",
        entry: "/marketing/brands/[brandId]/sites/[siteId]",
        pipes: {
            code: {
                state: "partial",
                note: "web.crawl_schedule table exists but has NO dispatcher and NO writer; the only scheduled crawl dispatcher drives the LEGACY scraper schema instead.",
                ref: "aidream/packages/matrx-scraper/matrx_scraper/db/models_web.py",
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
        repos: ["aidream", "db"],
        stores: ["seo.search_performance_daily", "seo.web_analytics_daily", "seo.page_performance", "seo.backlink_*"],
        maturity: "production",
        entry: "/marketing/search-console",
        pipes: {
            code: {
                state: "partial",
                note: "GSC, backlinks and ranks sync nightly; GA4 and PageSpeed have NO scheduler and are on-demand only.",
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
            human: { state: "live", note: "Make-it-real rungs with dry-run.", ref: "SetupBridgeSection.tsx" },
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
            human: { state: "live", note: "Preview one page, then start the fill.", ref: "SetupBridgeSection.tsx" },
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
            human: { state: "live", note: "Publish button.", ref: "useCmsPages.ts#publishDraft" },
            ai: { state: "live", note: "cms_page publish, policy-gated.", ref: "aidream/aidream/services/cms/access.py" },
        },
    },
    {
        id: "publish->serve",
        from: "publish",
        to: "serve",
        label: "reachable",
        gaps: ["G-SITEMAP", "G-COLLECTIONS"],
        pipes: {
            code: {
                state: "partial",
                note: "Rendering + domains work; discovery does not — no sitemap.xml, no robots.txt, no IndexNow/GSC submit.",
                ref: "my-matrx/pages/_sites/[host]/[[...slug]].js",
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
        gaps: ["G-PUBLISH-CRAWL", "G-CRAWL-SCHEDULE"],
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
                state: "missing",
                note: "THE SECOND BIG BREAK. web.finding rows never become assists. The 15-check catalogue produces findings nobody is ever offered.",
            },
            human: {
                state: "partial",
                note: "A user can look at findings but cannot act on one — the register is read-only in the app.",
                ref: "FindingsTable.tsx",
            },
            ai: MISSING("No agent turns findings into proposals."),
        },
    },
    {
        id: "suggest->writeback",
        from: "suggest",
        to: "writeback",
        label: "applied",
        gaps: ["G-FINDING-FIX"],
        pipes: {
            code: {
                state: "partial",
                note: "The write-back machinery is real and safe, but nothing drives it from a finding — it only starts from a chip or a human card.",
                ref: "push-to-cms.ts",
            },
            human: { state: "live", note: "Apply meta, then push to CMS as a draft.", ref: "PushToCmsCard.tsx" },
            ai: { state: "partial", note: "Assist chips can launch a pre-filled agent; the SEO fix agents to launch do not exist yet.", ref: "launch-agent.ts" },
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
        status: "open",
        at: "serve->crawl",
        breaks: ["code", "ai"],
        detail:
            "cms publish() fans out only to the plan-status advance. No crawl is enqueued, no web.page anchor is created, nothing is invalidated. The loop is cut in half here: everything downstream waits for a human to remember to press Crawl.",
        lane: "L1",
    },
    {
        id: "G-CRAWL-SCHEDULE",
        title: "web.crawl_schedule has no dispatcher and no writer",
        severity: "blocker",
        status: "open",
        at: "crawl",
        breaks: ["code"],
        detail:
            "The table exists with cadence/scope/next_run_at, but the only scheduled crawl dispatcher drives the LEGACY scraper schema. Marketing crawls are manual-only, so nothing re-measures a site on its own.",
        lane: "L1",
    },
    {
        id: "G-SITEMAP",
        title: "Live sites emit no sitemap.xml and no robots.txt",
        severity: "major",
        status: "open",
        at: "publish->serve",
        breaks: ["code"],
        detail:
            "The renderer serves pages but publishes no discovery surface, and nothing pings IndexNow or Search Console on publish. We are an SEO product whose own CMS does not tell search engines a page exists.",
        lane: "L1",
    },
    {
        id: "G-COLLECTIONS",
        title: "Collections render client-side only — invisible to crawlers",
        severity: "major",
        status: "open",
        at: "serve",
        breaks: ["code"],
        detail: "Collection items are fetched in the browser, so neither Google nor our own crawler sees them. Content we generated cannot be measured.",
        lane: "L1",
    },
    {
        id: "G-FINDING-ASSIST",
        title: "Findings never become suggestions",
        severity: "blocker",
        status: "open",
        at: "analyze->suggest",
        breaks: ["code", "ai"],
        detail:
            "The 15-check catalogue writes web.finding rows that no producer ever turns into a platform.assists chip. Exactly one SEO assist producer exists (Search Console). The analysis is real and the user is never offered it.",
        lane: "L2",
    },
    {
        id: "G-FINDING-TRACK",
        title: "A user cannot act on a finding",
        severity: "major",
        status: "open",
        at: "suggest",
        breaks: ["human"],
        detail:
            "web.finding has a full status model (open / acknowledged / resolved / reopened / suppressed) but the frontend never writes it. There is no acknowledge, no suppress, no 'I fixed this'.",
        lane: "L2",
    },
    {
        id: "G-FINDING-FIX",
        title: "No path from a finding to a fixed page",
        severity: "blocker",
        status: "open",
        at: "suggest->writeback",
        breaks: ["code", "ai"],
        detail:
            "Write-back machinery is mature and safe, but it can only be started from a human card or a chip. Accepting a finding does not draft a fix, and there is no purpose-built SEO fix agent to hand it to.",
        lane: "L2",
    },
    {
        id: "G-SUGGEST-FORK",
        title: "Three parallel suggestion systems",
        severity: "major",
        status: "open",
        at: "suggest",
        breaks: ["code", "human", "ai"],
        detail:
            "platform.assists (the intended universal vehicle), web.finding (its own status enum), and kg-suggestions (its own tables + accept RPCs) all model 'here is something you could do'. Plus a dead extend.wbx_seo_audit. Pick one vehicle before building more producers.",
        lane: "L2",
    },
    {
        id: "G-TEMPLATE",
        title: "Realized pages are empty — template_map is never read",
        severity: "major",
        status: "open",
        at: "brief->realize",
        breaks: ["code"],
        detail:
            "plan.profile.template_map carries the concept/variant library, but realize creates a blank draft with only a page type. 'Template pages' as a concept does not exist in code; every page waits on an LLM to author it from scratch.",
        lane: "L3",
    },
    {
        id: "G-CMS-IDENTITY",
        title: "CMS pages join to measurement by route string",
        severity: "major",
        status: "open",
        at: "crawl->measure",
        breaks: ["code"],
        detail:
            "web.page is a clean anchor for every metric, but client_pages reaches it only by comparing route text (separate Supabase projects, no FK). One route change or one trailing-slash difference silently orphans a page's whole history.",
        lane: "L3",
    },
    {
        id: "G-STALENESS",
        title: "Nothing ever marks a page as needing an update",
        severity: "major",
        status: "open",
        at: "writeback->plan",
        breaks: ["code", "ai"],
        detail:
            "plan.profile.cadences exists and performance data exists, but no job compares them. plan_status can move forward to published and never comes back for another pass.",
        lane: "L4",
    },
    {
        id: "G-PLAN-STATUS",
        title: "plan_status has no enforced state machine",
        severity: "minor",
        status: "open",
        at: "writeback->plan",
        breaks: ["code"],
        detail: "Transitions are loose by an earlier deliberate decision, pending the CMS handoff. That handoff now exists, so this is newly decidable.",
        lane: "L4",
    },
    {
        id: "G-RECONCILE-UI",
        title: "Plan-vs-reality is manual and unsurfaced",
        severity: "minor",
        status: "open",
        at: "analyze->plan",
        breaks: ["code", "human", "ai"],
        detail: "The reality overlay must be run by hand and its badges do not appear in the plan table or pillar map, so drift between plan and live site is invisible until someone goes looking.",
        lane: "L4",
    },
    {
        id: "G-RESEARCH-TRIGGER",
        title: "Research cannot be started by code or by an agent",
        severity: "major",
        status: "open",
        at: "research",
        breaks: ["code", "ai"],
        detail:
            "Every research run begins with a human click. There is no scheduled refresh and no agent tool that starts one, so the first stage of the loop can never run unattended — which alone makes 'click one thing and have the whole thing done' impossible.",
        lane: "L5",
    },
    {
        id: "G-PIPE-SELECTOR",
        title: "No 'one step, three pipes' primitive",
        severity: "blocker",
        status: "open",
        at: "plan",
        breaks: ["code", "human", "ai"],
        detail:
            "The workflow engine has code nodes, an agent node and a human_input node — but they are three DIFFERENT node types, not one step with a swappable executor. Nothing lets an owner say 'this decision: me, or the agent, or ask me and fall back to the agent'.",
        lane: "L5",
    },
    {
        id: "G-HUMAN-TIMEOUT",
        title: "No timed human-to-AI escalation",
        severity: "major",
        status: "open",
        at: "plan",
        breaks: ["human", "ai"],
        detail:
            "human_input blocks forever; assists expire but never escalate. Arman's 'ask the user, and if they don't answer in N minutes ask the AI' has no implementation anywhere on the platform.",
        lane: "L5",
    },
    {
        id: "G-ORCHESTRATOR",
        title: "No end-to-end run object",
        severity: "blocker",
        status: "open",
        at: "research",
        breaks: ["code", "human", "ai"],
        detail:
            "Each stage has its own run tracking (workflow.run, sch_run, cx_request, cms_fill_job) but nothing represents 'this brand's loop, stage 7 of 12'. There is no single thing to click, watch, resume, or show a customer.",
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
            "Per-stage agents are good and many. What is missing is the overseeing agent Arman described — one that owns several adjacent steps, decides when each is done, and hands off. subgraph.call is the mechanism; no such agent is defined.",
        lane: "L6",
    },
    {
        id: "G-CRAWL-DUAL",
        title: "Two crawl worlds",
        severity: "minor",
        status: "open",
        at: "crawl",
        breaks: ["code"],
        detail: "The modern web.* crawler and the legacy scraper.* crawler both exist; the scheduled dispatcher serves the legacy one. Retire or bridge before adding scheduling on top.",
        lane: "L1",
    },
    {
        id: "G-MEASURE-SCHEDULE",
        title: "GA4 and PageSpeed never refresh themselves",
        severity: "minor",
        status: "open",
        at: "measure",
        breaks: ["code"],
        detail: "GSC, backlinks and ranks are scheduled. GA4 and PageSpeed are on-demand only, so half the measurement picture is as stale as the last click.",
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
