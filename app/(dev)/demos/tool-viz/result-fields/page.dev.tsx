"use client";

/**
 * Dev gallery for the tool-call-visualization "result field" library, the
 * generic renderer, and the full shell. Renders a battery of result shapes so
 * the field library can be eyeballed in isolation (no backend) across every
 * branch of `detectResultShape`. Doubles as the visual regression harness
 * referenced by the create-tool-renderer skill and the future user builder.
 *
 * WIDTH: content is constrained to `max-w-3xl` + `px-2` — the EXACT canonical
 * chat width (`AgentConversationColumn` with `constrainWidth`), so what you see
 * here is what renders in a real chat message.
 *
 * Route: /demos/tool-viz/result-fields   (dev profile only)
 */

import React, { useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResultValue } from "@/features/tool-call-visualization/result-fields/ResultValue";
import { GenericRenderer } from "@/features/tool-call-visualization/registry/GenericRenderer";
import { ToolCallVisualization } from "@/features/tool-call-visualization/components/ToolCallVisualization";
import { PatchDiffInline } from "@/features/tool-call-visualization/renderers/working-document/PatchDiffInline";
import { SearchInline } from "@/features/tool-call-visualization/renderers/search/SearchInline";
import { SearchOverlay } from "@/features/tool-call-visualization/renderers/search/SearchOverlay";
import { ScrapeInline } from "@/features/tool-call-visualization/renderers/scrape/ScrapeInline";
import { ScrapeOverlay } from "@/features/tool-call-visualization/renderers/scrape/ScrapeOverlay";
import { ResearchInline } from "@/features/tool-call-visualization/renderers/research/ResearchInline";
import { SubagentReportBlock } from "@/features/tool-call-visualization/renderers/research/SubagentReportBlock";
import {
    buildResearchRecording,
    buildScrapeRecording,
    buildSearchRecording,
} from "@/features/tool-call-visualization/simulator/streamRecording";
import { useSimulatedToolEntry } from "@/features/tool-call-visualization/simulator/useSimulatedToolEntry";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

// ─── Synthetic lifecycle entries ────────────────────────────────────────────

function entry(partial: Partial<ToolLifecycleEntry> & { callId: string; toolName: string }): ToolLifecycleEntry {
    return {
        displayName: partial.toolName,
        status: "completed",
        arguments: {},
        startedAt: "2026-06-19T10:00:00.000Z",
        completedAt: "2026-06-19T10:00:02.000Z",
        latestMessage: null,
        latestData: null,
        result: null,
        resultPreview: null,
        errorType: null,
        errorMessage: null,
        isDelegated: false,
        events: [],
        ...partial,
    };
}

// ─── Fixtures covering every ResultShape branch ─────────────────────────────

const FIXTURES: Array<{ label: string; value: unknown }> = [
    { label: "scalar — string", value: "Operation succeeded" },
    { label: "scalar — number", value: 42 },
    { label: "scalar — boolean", value: true },
    { label: "url", value: "https://www.anthropic.com/research" },
    {
        label: "markdown text",
        value:
            "## Summary\n\nThe analysis found **three** key themes:\n\n- Cost efficiency\n- Latency\n- Reliability\n\nSee [the report](https://example.com) for details.\n\n```ts\nconst x = 1;\n```",
    },
    {
        label: "plain text (long)",
        value: Array.from({ length: 12 }, (_, i) => `Line ${i + 1}: some plain text content here.`).join("\n"),
    },
    { label: "scalar list", value: ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta"] },
    {
        label: "table (uniform object array)",
        value: [
            { title: "Result one", url: "https://a.com", score: 0.92 },
            { title: "Result two", url: "https://b.com", score: 0.81 },
            { title: "Result three", url: "https://c.com", score: 0.77 },
            { title: "Result four", url: "https://d.com", score: 0.64 },
            { title: "Result five", url: "https://e.com", score: 0.51 },
            { title: "Result six", url: "https://f.com", score: 0.43 },
            { title: "Result seven", url: "https://g.com", score: 0.39 },
        ],
    },
    {
        label: "object (ctx_get-like)",
        value: {
            key: "patient_summary",
            type: "text",
            label: "Patient Summary",
            content: "## History\n\nPatient presents with **acute** symptoms. No prior history.",
            total_chars: 84,
        },
    },
    {
        label: "table with UUIDs (id shortening + hover-copy)",
        value: [
            { id: "0dd1a01c-24af-4c3e-9d6f-092ffaa10e4c", name: "Alpha", scope_id: "b0bf8b4e-8700-4e9c-9cac-a0cda8c22860", status: "active" },
            { id: "b572b495-2044-421b-a066-6a9f91a0e8b5", name: "Beta", scope_id: "b0bf8b4e-8700-4e9c-9cac-a0cda8c22860", status: "pending" },
            { id: "1febac7b-aa48-47e2-a677-f7cad1b0937a", name: "Gamma", scope_id: "565b0782-79ae-4adf-a104-9e6605cbdf90", status: "active" },
        ],
    },
    {
        label: "nested object (sql-like)",
        value: {
            row_count: 2,
            columns: ["id", "name", "email"],
            rows: [
                { id: 1, name: "Ada Lovelace", email: "ada@example.com" },
                { id: 2, name: "Alan Turing", email: "alan@example.com" },
            ],
            duration_ms: 14,
        },
    },
    { label: "empty (null)", value: null },
    { label: "empty (empty object)", value: {} },
];

// ─── CTX renderer fixtures (ctx_get / ctx_batch / ctx_patch) ────────────────

const CTX_ENTRIES: ToolLifecycleEntry[] = [
    entry({
        callId: "ctx-get-md",
        toolName: "ctx_get",
        displayName: "Context",
        arguments: { key: "patient_summary" },
        result: {
            key: "patient_summary",
            type: "text",
            label: "Patient Summary",
            content:
                "## History\n\nPatient presents with **acute** chest pain, onset 2 hours ago. No prior cardiac history.\n\n- BP 148/92\n- HR 104\n- O2 sat 96%\n\nSee the [intake note](https://example.com) for the full timeline.",
            total_chars: 214,
        },
    }),
    entry({
        callId: "ctx-get-table",
        toolName: "ctx_get",
        displayName: "Context",
        arguments: { key: "open_cases" },
        result: {
            key: "open_cases",
            type: "db_ref",
            label: "Open Cases",
            content: [
                { id: "C-1042", client: "Acme Corp", stage: "Discovery", days_open: 31 },
                { id: "C-1043", client: "Globex", stage: "Filing", days_open: 12 },
                { id: "C-1044", client: "Initech", stage: "Review", days_open: 4 },
            ],
            total_chars: 0,
        },
    }),
    entry({
        callId: "ctx-batch",
        toolName: "ctx_batch",
        displayName: "Context",
        arguments: {
            requests: [
                { key: "org_profile" },
                { key: "active_project" },
                { key: "missing_key" },
            ],
        },
        result: {
            count: 2,
            requested: 3,
            results: [
                {
                    key: "org_profile",
                    success: true,
                    output: {
                        key: "org_profile",
                        type: "org",
                        label: "Organization Profile",
                        content:
                            "Acme Corp — enterprise legal services. 240 employees. Primary contact: Jane Doe (GC).",
                        total_chars: 84,
                    },
                },
                {
                    key: "active_project",
                    success: true,
                    output: {
                        key: "active_project",
                        type: "project",
                        label: "Active Project",
                        content: { name: "Q3 Compliance Audit", owner: "j.doe", status: "in_progress" },
                        total_chars: 0,
                    },
                },
                {
                    key: "missing_key",
                    success: false,
                    error: "No context object found for key 'missing_key'",
                },
            ],
        },
    }),
    entry({
        // str_replace — the human diff. Persisted (reload) path: before=old_str,
        // after=new_str. The inserted sentence is highlighted; the unchanged
        // surrounding text is NOT — an insert must not mark everything changed.
        callId: "ctx-patch",
        toolName: "ctx_patch",
        displayName: "Context",
        arguments: {
            key: "patient_summary",
            command: "str_replace",
            old_str:
                "## History\n\nPatient presents with **acute** chest pain, onset 2 hours ago. No prior cardiac history.\n\n- BP 148/92\n- HR 104",
            new_str:
                "## History\n\nPatient presents with **acute** chest pain, onset 2 hours ago. Aspirin 325mg administered en route. No prior cardiac history.\n\n- BP 148/92\n- HR 96 (down from 104)",
        },
        result: { key: "patient_summary", command: "str_replace", matched_at_pass: "exact", new_size_chars: 180, persist: "auto" },
    }),
    entry({
        // overwrite — no before, so the new content renders as markdown (the
        // "beautiful new content" persisted), no diff.
        callId: "ctx-patch-overwrite",
        toolName: "ctx_patch",
        displayName: "Context",
        arguments: {
            key: "working_document",
            command: "overwrite",
            new_str:
                "# Discharge Plan\n\n- **Medications:** aspirin 81mg daily, atorvastatin 40mg nightly\n- **Follow-up:** cardiology in 1 week\n- **Activity:** light activity, no lifting > 10 lbs for 48h\n\nCall if chest pain returns or worsens.",
        },
        result: { key: "working_document", command: "overwrite", new_size_chars: 230, persist: "auto" },
    }),
];

// ─── Database / SQL renderer fixtures (sql / db_query / db_schema) ──────────

const SQL_ENTRIES: ToolLifecycleEntry[] = [
    entry({
        callId: "sql-select",
        toolName: "sql",
        displayName: "Database",
        arguments: {
            action: "query",
            query:
                "SELECT section, max_rows, field_count\nFROM tool_renderer_stats\nWHERE field_count > 0\nORDER BY max_rows DESC\nLIMIT 5;",
        },
        result: {
            rows: [
                { section: "results", max_rows: 200, field_count: 12 },
                { section: "input", max_rows: 50, field_count: 8 },
                { section: "raw", max_rows: 25, field_count: 4 },
                { section: "summary", max_rows: 10, field_count: 3 },
                { section: "errors", max_rows: 5, field_count: 2 },
            ],
        },
    }),
    entry({
        callId: "sql-insert",
        toolName: "sql",
        displayName: "Database",
        arguments: {
            action: "insert",
            table: "events",
            data: '[{"name":"page_view"},{"name":"click"}]',
        },
        result: {
            inserted: 73,
            ids: [
                "e1a2b3c4",
                "f5d6e7a8",
                "09b8c7d6",
                "1a2b3c4d",
                "5e6f7a8b",
                "9c0d1e2f",
            ],
        },
    }),
    entry({
        callId: "db-query",
        toolName: "db_query",
        displayName: "Database",
        arguments: {
            query:
                "SELECT id, name, email\nFROM users\nWHERE active = true\nORDER BY created_at DESC\nLIMIT 3;",
        },
        result: {
            rows: [
                { id: 1, name: "Ada Lovelace", email: "ada@example.com" },
                { id: 2, name: "Alan Turing", email: "alan@example.com" },
                { id: 3, name: "Grace Hopper", email: "grace@example.com" },
            ],
        },
    }),
    entry({
        callId: "db-schema",
        toolName: "db_schema",
        displayName: "Database",
        arguments: { table: "users" },
        result: {
            rows: [
                {
                    table_name: "users",
                    column_name: "id",
                    data_type: "bigint",
                    is_nullable: "NO",
                    column_default: "nextval('users_id_seq')",
                },
                {
                    table_name: "users",
                    column_name: "name",
                    data_type: "text",
                    is_nullable: "NO",
                    column_default: null,
                },
                {
                    table_name: "users",
                    column_name: "email",
                    data_type: "text",
                    is_nullable: "NO",
                    column_default: null,
                },
                {
                    table_name: "users",
                    column_name: "active",
                    data_type: "boolean",
                    is_nullable: "NO",
                    column_default: "true",
                },
                {
                    table_name: "users",
                    column_name: "created_at",
                    data_type: "timestamptz",
                    is_nullable: "NO",
                    column_default: "now()",
                },
            ],
        },
    }),
];

// `note` tool — Redux/Supabase-backed renderer. Uses REAL note ids owned by
// the local test user (admin@admin.com) so the card hydrates live content,
// the Edit/Preview toggle, stats, and "Open in Notes" against actual data.
// Log in via /login (admin@admin.com / Password1234#) for these to populate.
const NOTE_ENTRIES: ToolLifecycleEntry[] = [
    entry({
        callId: "note-compact",
        toolName: "note",
        result: {
            id: "71bd1d75-de7c-4703-b765-e7737bb89a28",
            label: "War Room note",
            updated_at: "2026-06-15 01:49:10.909074+00:00",
        },
    }),
    entry({
        callId: "note-long",
        toolName: "note",
        result: {
            id: "69e8b2d7-bdbd-46de-9ca8-365598ac8834",
            label: "HTML Example",
            updated_at: "2026-06-19 20:00:08.328877+00:00",
        },
    }),
];

// GenericRenderer state fixtures + shell fixtures.
const STATE_ENTRIES: ToolLifecycleEntry[] = [
    entry({
        callId: "c1",
        toolName: "web_research_demo",
        displayName: "Web Research (demo)",
        result: [
            { title: "Anthropic", url: "https://anthropic.com", snippet: "AI safety company" },
            { title: "Claude", url: "https://claude.ai", snippet: "AI assistant" },
        ],
    }),
    entry({
        callId: "c2",
        toolName: "broken_tool_demo",
        displayName: "Broken Tool (demo)",
        status: "error",
        errorType: "execution",
        errorMessage: "Connection timed out after 30s while contacting the upstream service.",
        result: null,
    }),
    entry({
        callId: "c3",
        toolName: "running_tool_demo",
        displayName: "Running Tool (demo)",
        status: "progress",
        latestMessage: "Reading https://example.com/article",
        result: null,
    }),
    entry({
        // A STAY-OPEN tool (news is result-is-purpose) that ERRORED. Must render
        // COLLAPSED, not the big open error box — an error has no result to keep
        // open. Regression guard for the "errored stay-open tool defaults open" bug.
        callId: "c4",
        toolName: "news_get_headlines",
        displayName: "News Headlines",
        status: "error",
        errorType: "validation",
        errorMessage: "Provide at least one of: country, sources, or category.",
        result: null,
    }),
];

// ─── Search/Research fixture (research_web text-blob format) ────────────────

const RESEARCH_RESULT = `Comprehensive research using the following queries: "best omega-3 sources 2026", "omega-3 to omega-6 ratio science", "marine vs plant omega oils 2026".

# All Search Results:

Searched: "best omega-3 sources 2026" (24), "omega-3 to omega-6 ratio science" (21), "marine vs plant omega oils 2026" (17)

---
## "best omega-3 sources 2026" (24 results)

Title: Office of Dietary Supplements - Omega-3 Fatty Acids (15 hours ago)
URL: https://ods.od.nih.gov/factsheets/Omega3FattyAcids/
Authoritative fact sheet on omega-3 intake, food sources, and supplementation.

Title: Catching the green wave: fueling the future of omega-3 sustainability (April 10, 2026)
URL: https://www.nature.com/articles/omega3-sustainability-2026
Algae-derived omega-3 emerges as the most sustainable marine-free source.

Title: Best Omega-3 Foods, Ranked by Bioavailability (March 2, 2026)
URL: https://www.healthline.com/nutrition/omega-3-foods
Fatty fish, algae oil, and walnuts top the bioavailability ranking.

---
## "omega-3 to omega-6 ratio science" (21 results)

Title: It's Not the Balance but the Levels That Matter (2 days ago)
URL: https://www.frontiersin.org/articles/omega-levels-2026
New analysis challenges the long-held omega ratio hypothesis.

Title: Dietary Omega-6/Omega-3 Ratio and Inflammation (Jan 18, 2026)
URL: https://pubmed.ncbi.nlm.nih.gov/omega-ratio-inflammation
Meta-analysis of 42 trials on the ratio's inflammatory markers.

---
## "marine vs plant omega oils 2026" (17 results)

Title: Marine vs Plant Omega Oils: A 2026 Comparison (5 days ago)
URL: https://www.consumerlab.com/marine-vs-plant-omega
Head-to-head on EPA/DHA conversion efficiency and contaminants.
`;

function researchEntry(toolName: string): ToolLifecycleEntry {
    return {
        callId: `research-${toolName}`,
        toolName,
        displayName: "Deep Research",
        status: "completed",
        arguments: { query: "best dietary sources to balance omega fatty acids 2026" },
        startedAt: "2026-06-19T10:00:00.000Z",
        completedAt: "2026-06-19T10:00:08.000Z",
        latestMessage: null,
        latestData: null,
        result: RESEARCH_RESULT,
        resultPreview: null,
        errorType: null,
        errorMessage: null,
        isDelegated: false,
        events: [],
    };
}

const RESEARCH_ENTRY = researchEntry("research_web");

// Realistic stream script built ONCE from the same blob the static fixtures use.
// Pure function of constants → safe at module scope (no hook, no React Compiler
// concern). Each query section lands as one whole part over time.
const RESEARCH_RECORDING = buildResearchRecording(RESEARCH_RESULT, {
    query: "best dietary sources to balance omega fatty acids 2026",
});

// ─── Research WITH a curated report (Wave 3 streaming report block) ──────────
//
// Same per-query result groups as RESEARCH_RESULT, plus the "# Curated Research
// Results" section the research sub-agent writes (the markdown report parseSearch
// surfaces as `report`). Drives the SubagentReportBlock — the streaming,
// auto-scrolling, scroll-locked, collapsible report.

const RESEARCH_REPORT = `# Curated Research Results

The following is the result of synthesizing the sources above.

## Bottom line

For most people in 2026, the best way to balance omega fatty acids is to **prioritize EPA/DHA from marine sources** while moderating omega-6 intake — the absolute *level* of long-chain omega-3s matters more than chasing a specific omega-6:omega-3 ratio.

## Best sources, ranked

1. **Fatty fish** (salmon, mackerel, sardines) — the richest dietary EPA + DHA, highest bioavailability.
2. **Algae oil** — the standout for plant-based eaters: the only source providing *preformed* EPA and DHA, and the most sustainable per the 2026 Nature analysis.
3. **Walnuts, flax, chia** — supply ALA, but conversion to EPA/DHA is inefficient (5–10%), so treat them as a complement, not a replacement.

## The ratio debate

Recent work (Frontiers, 2026) challenges the long-held omega-6:omega-3 *ratio* hypothesis, arguing that **raising absolute EPA/DHA** lowers inflammatory markers regardless of the ratio. A meta-analysis of 42 trials supports prioritizing intake over ratio engineering.

## Practical guidance

- Aim for 2–3 servings of fatty fish per week, **or** a daily algae-oil supplement (250–500 mg EPA+DHA) if you don't eat fish.
- Don't obsess over cutting all omega-6 — focus on adding omega-3s.
- Choose third-party-tested supplements (NSF, ConsumerLab) for purity and freshness.

## Next steps:
- Compare specific algae-oil brands by EPA/DHA density.
`;

const RESEARCH_REPORT_RESULT = `${RESEARCH_RESULT}\n\n${RESEARCH_REPORT}`;

const RESEARCH_REPORT_ARGS = {
    query: "best dietary sources to balance omega fatty acids 2026",
};

function researchReportEntry(toolName: string, callId: string): ToolLifecycleEntry {
    return {
        callId,
        toolName,
        displayName: "Deep Research",
        status: "completed",
        arguments: RESEARCH_REPORT_ARGS,
        startedAt: "2026-06-22T10:00:00.000Z",
        completedAt: "2026-06-22T10:00:12.000Z",
        latestMessage: null,
        latestData: null,
        result: RESEARCH_REPORT_RESULT,
        resultPreview: null,
        errorType: null,
        errorMessage: null,
        isDelegated: false,
        events: [],
    };
}

const RESEARCH_REPORT_ENTRY = researchReportEntry("research_web", "research-report-done");
const RESEARCH_REPORT_RECORDING = buildResearchRecording(
    RESEARCH_REPORT_RESULT,
    RESEARCH_REPORT_ARGS,
);

// STATIC mid-stream snapshot — status "progress" with the FULL report already
// in `result`. The report block paces it client-side (auto-scroll + scroll
// LOCKED) without the simulator timer, so the streaming-report path is provable
// even when Fast Refresh is thrashing the Play demo.
const RESEARCH_STREAMING_SNAPSHOT: ToolLifecycleEntry = {
    ...researchReportEntry("research_web", "research-report-streaming"),
    status: "progress",
    completedAt: null,
};

// ─── Web-search fixture (3 parallel queries, ~5 results each) ───────────────
//
// DELIBERATELY contains DUPLICATE base URLs across queries to prove base-URL
// dedupe — the SAME favicon must NEVER appear twice in the live conveyor or the
// persistent list:
//   • healthline.com/nutrition/omega-3-foods appears in Q1 and Q3 (differing
//     ?utm tracking params → same base URL → ONE source).
//   • ods.od.nih.gov/.../Omega3FattyAcids appears in Q1 and Q2.
// After dedupe the unified source list collapses these. No AI answer (plain
// search) → the persistent view leads with results, not a summary.
const SEARCH_RESULT = `Comprehensive research using the following queries: "best omega-3 food sources", "omega-3 supplements ranked 2026", "algae omega-3 vs fish oil".

# All Search Results:

Searched: "best omega-3 food sources" (5), "omega-3 supplements ranked 2026" (5), "algae omega-3 vs fish oil" (5)

---
## "best omega-3 food sources" (5 results)

Title: Office of Dietary Supplements - Omega-3 Fatty Acids (15 hours ago)
URL: https://ods.od.nih.gov/factsheets/Omega3FattyAcids/?src=search
Description: Authoritative fact sheet on omega-3 intake, food sources, and supplementation.

Title: Best Omega-3 Foods, Ranked by Bioavailability (March 2, 2026)
URL: https://www.healthline.com/nutrition/omega-3-foods?utm_source=serp
Description: Fatty fish, algae oil, and walnuts top the bioavailability ranking.

Title: 12 Foods Very High in Omega-3 (Jan 9, 2026)
URL: https://www.medicalnewstoday.com/articles/omega-3-foods
Description: Mackerel, salmon, cod liver oil, herring, and oysters lead the list.

Title: Omega-3 in Walnuts and Flaxseed (Feb 20, 2026)
URL: https://www.webmd.com/diet/omega-3-plant-sources
Description: Plant ALA sources and how the body converts them to EPA/DHA.

Title: Seafood Nutrition: Omega-3 Content by Species (Dec 2025)
URL: https://www.seafoodhealthfacts.org/omega-3-by-species
Description: Comparison table of EPA + DHA per 100g across common seafood.

---
## "omega-3 supplements ranked 2026" (5 results)

Title: Best Fish Oil Supplements of 2026 (April 1, 2026)
URL: https://www.consumerlab.com/reviews/fish-oil-supplements
Description: Independent lab testing for purity, freshness, and label accuracy.

Title: Office of Dietary Supplements - Omega-3 Fatty Acids (15 hours ago)
URL: https://ods.od.nih.gov/factsheets/Omega3FattyAcids/?ref=supplements
Description: Same authoritative fact sheet, surfaced again under supplements.

Title: Top Algae Oil Supplements, Tested (March 18, 2026)
URL: https://www.healthline.com/nutrition/algae-oil-supplements
Description: Vegan EPA/DHA options that rival fish oil on absorption.

Title: NSF-Certified Omega-3 Brands (Feb 2026)
URL: https://www.nsf.org/certified-omega-3
Description: Third-party certified supplements for sport and general use.

Title: How to Choose an Omega-3 Supplement (Jan 2026)
URL: https://www.health.harvard.edu/omega-3-supplement-guide
Description: EPA vs DHA ratios, dosing, and what the evidence supports.

---
## "algae omega-3 vs fish oil" (5 results)

Title: Algae Oil vs Fish Oil: A 2026 Comparison (5 days ago)
URL: https://www.consumerlab.com/algae-vs-fish-oil
Description: Head-to-head on EPA/DHA conversion efficiency and contaminants.

Title: Best Omega-3 Foods, Ranked by Bioavailability (March 2, 2026)
URL: https://www.healthline.com/nutrition/omega-3-foods?utm_source=compare
Description: The same bioavailability ranking, re-surfaced for the comparison.

Title: Is Algae Oil as Good as Fish Oil? (Feb 11, 2026)
URL: https://www.medicalnewstoday.com/articles/algae-oil-benefits
Description: Reviews the evidence on plant-derived EPA/DHA equivalence.

Title: Sustainable Omega-3: The Algae Advantage (April 10, 2026)
URL: https://www.nature.com/articles/omega3-sustainability-2026
Description: Algae-derived omega-3 emerges as the most sustainable source.

Title: Marine vs Plant Omega Oils (Dec 2025)
URL: https://www.examine.com/marine-vs-plant-omega
Description: Evidence summary on conversion, dosing, and outcomes.
`;

const SEARCH_ARGS = {
    queries: [
        "best omega-3 food sources",
        "omega-3 supplements ranked 2026",
        "algae omega-3 vs fish oil",
    ],
};

function searchEntry(toolName: string): ToolLifecycleEntry {
    return {
        callId: `search-${toolName}`,
        toolName,
        displayName: "Web Search",
        status: "completed",
        arguments: SEARCH_ARGS,
        startedAt: "2026-06-19T10:00:00.000Z",
        completedAt: "2026-06-19T10:00:05.000Z",
        latestMessage: null,
        latestData: null,
        result: SEARCH_RESULT,
        resultPreview: null,
        errorType: null,
        errorMessage: null,
        isDelegated: false,
        events: [],
    };
}

const SEARCH_ENTRY = searchEntry("web_search");
const SEARCH_RECORDING = buildSearchRecording(SEARCH_RESULT, SEARCH_ARGS, {
    toolName: "web_search",
    displayName: "Web Search",
});

// A STATIC mid-stream snapshot — status "progress" with the full result already
// parsed. Drives the LIVE conveyor code path WITHOUT the simulator timer, so the
// rolling-window invariant (≤4 rows at once, deduped) is verifiable even when
// Fast Refresh is thrashing the timer-driven Play demo. The conveyor still
// advances on the renderer's own internal reveal timer, but the window cap is
// structural regardless of reveal position.
const SEARCH_LIVE_SNAPSHOT: ToolLifecycleEntry = {
    ...searchEntry("web_search"),
    callId: "search-live-snapshot",
    status: "progress",
    completedAt: null,
};

// ─── Scrape / page-read fixtures (web_read / core_web_read_web_pages) ────────
//
// The REAL wire shape (verified from cx_tool_call): the read tools return
// `{ pages: [{ url, content }] }` WHOLE at completion, with each page body
// wrapped in the `Here is the content from page <url>: """…"""` envelope (which
// parseScrape strips). Title is derived best-effort from the body; preview
// image + AI review are OPTIONAL — present only if the page object carries them.

const SCRAPE_PAGE_ENVELOPE = (url: string, body: string): string =>
    `Here is the content from page ${url}: """\n${body}"""`;

// IMAGE-ABSENT fixture — the real, common shape: multiple pages, content only.
const SCRAPE_RESULT_NO_IMAGE = {
    pages: [
        {
            url: "https://ods.od.nih.gov/factsheets/Omega3FattyAcids/",
            content: SCRAPE_PAGE_ENVELOPE(
                "https://ods.od.nih.gov/factsheets/Omega3FattyAcids/",
                "# Omega-3 Fatty Acids\n\nOmega-3 fatty acids are a family of polyunsaturated fats the body cannot make from scratch. The three main types are ALA (plant oils), EPA, and DHA (marine sources). Fatty fish such as salmon, mackerel, and sardines are the richest dietary sources of EPA and DHA, while flaxseed, chia, and walnuts supply ALA.\n\nThe Office of Dietary Supplements recommends most adults obtain omega-3s through food first, reserving supplementation for those with low fish intake.",
            ),
        },
        {
            url: "https://www.healthline.com/nutrition/omega-3-foods",
            content: SCRAPE_PAGE_ENVELOPE(
                "https://www.healthline.com/nutrition/omega-3-foods",
                "# 12 Foods Very High in Omega-3\n\nFatty fish, algae oil, and walnuts top the bioavailability ranking. Mackerel delivers the highest EPA + DHA per serving, followed by salmon and cod liver oil. For plant-based eaters, algae oil is the only source providing preformed EPA and DHA, making it the standout vegan option.",
            ),
        },
        {
            url: "https://www.consumerlab.com/marine-vs-plant-omega",
            content: SCRAPE_PAGE_ENVELOPE(
                "https://www.consumerlab.com/marine-vs-plant-omega",
                "# Marine vs Plant Omega Oils: A 2026 Comparison\n\nHead-to-head testing on EPA/DHA conversion efficiency and contaminant load. Marine sources deliver preformed EPA/DHA, while plant ALA converts inefficiently (5–10%). Algae oil bridges the gap, offering marine-grade omega-3 without the contaminant risk of some fish oils.",
            ),
        },
    ],
};

const SCRAPE_ARGS_NO_IMAGE = {
    urls: [
        "https://ods.od.nih.gov/factsheets/Omega3FattyAcids/",
        "https://www.healthline.com/nutrition/omega-3-foods",
        "https://www.consumerlab.com/marine-vs-plant-omega",
    ],
};

// IMAGE-PRESENT fixture — a single page whose object ALSO carries an optional
// preview image + an AI-review line (the best-effort enrichment path). Proves
// the card renders the image via InlineMediaRef and the review chip.
const SCRAPE_RESULT_WITH_IMAGE = {
    pages: [
        {
            url: "https://www.nature.com/articles/omega3-sustainability-2026",
            image: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&q=80",
            ai_review:
                "Strong primary source: peer-reviewed, directly on-topic for omega-3 sustainability, with quantified conversion data.",
            content: SCRAPE_PAGE_ENVELOPE(
                "https://www.nature.com/articles/omega3-sustainability-2026",
                "# Catching the Green Wave: Fueling the Future of Omega-3 Sustainability\n\nAlgae-derived omega-3 emerges as the most sustainable marine-free source. Cultivated photobioreactors yield EPA and DHA at densities rivaling wild fish stocks, sidestepping overfishing and ocean contaminant accumulation. The authors project algae oil could supply 30% of global omega-3 demand by 2030.",
            ),
        },
    ],
};

const SCRAPE_ARGS_WITH_IMAGE = {
    urls: ["https://www.nature.com/articles/omega3-sustainability-2026"],
};

function scrapeEntry(
    toolName: string,
    result: unknown,
    args: Record<string, unknown>,
    callId: string,
): ToolLifecycleEntry {
    return {
        callId,
        toolName,
        displayName: "Web Page Reader",
        status: "completed",
        arguments: args,
        startedAt: "2026-06-22T10:00:00.000Z",
        completedAt: "2026-06-22T10:00:06.000Z",
        latestMessage: null,
        latestData: null,
        result,
        resultPreview: null,
        errorType: null,
        errorMessage: null,
        isDelegated: false,
        events: [],
    };
}

const SCRAPE_ENTRY_NO_IMAGE = scrapeEntry(
    "core_web_read_web_pages",
    SCRAPE_RESULT_NO_IMAGE,
    SCRAPE_ARGS_NO_IMAGE,
    "scrape-no-image",
);
const SCRAPE_ENTRY_WITH_IMAGE = scrapeEntry(
    "web_read",
    SCRAPE_RESULT_WITH_IMAGE,
    SCRAPE_ARGS_WITH_IMAGE,
    "scrape-with-image",
);

const SCRAPE_RECORDING = buildScrapeRecording(
    SCRAPE_RESULT_NO_IMAGE,
    SCRAPE_ARGS_NO_IMAGE,
    { toolName: "core_web_read_web_pages", displayName: "Web Page Reader" },
);

// STATIC mid-stream snapshot — status "progress", NO pages parsed yet, but the
// "Browsing <url>" activity events present. Drives the READING-WAVE card path
// WITHOUT the simulator timer, so the reading shimmer + one-card-per-page is
// verifiable even when Fast Refresh is thrashing the Play demo.
const SCRAPE_READING_SNAPSHOT: ToolLifecycleEntry = {
    ...scrapeEntry(
        "core_web_read_web_pages",
        null,
        SCRAPE_ARGS_NO_IMAGE,
        "scrape-reading-snapshot",
    ),
    status: "progress",
    completedAt: null,
    events: SCRAPE_ARGS_NO_IMAGE.urls.map((url, i) => ({
        event: "tool_progress" as const,
        call_id: "scrape-reading-snapshot",
        tool_name: "core_web_read_web_pages",
        timestamp: Date.now() + i,
        message: `Browsing ${url}`,
        data: undefined,
    })),
};

// Dynamic (DB) renderer demo — resolves to the `tool_ui` row for `agent_call`,
// fetched + compiled at runtime via the canonical compileSlotComponent path.
const AGENT_CALL_ENTRY = entry({
    callId: "agent-call-demo",
    toolName: "agent_call",
    displayName: "Sub-agent",
    arguments: {
        agent_id: "7e388760-5e21-48fc-baa6-39fd717c08e2",
        user_input: "Summarize the omega-3 research",
    },
    result: {
        agent_id: "7e388760-5e21-48fc-baa6-39fd717c08e2",
        agent_name: "Research Summarizer",
        model_id: "claude-opus-4-8",
        result:
            "## Summary\n\nThe omega-3 research converges on three themes: bioavailability, sustainability, and the ratio debate. Algae-derived sources lead on sustainability.\n\n- Fatty fish + algae oil rank highest on bioavailability\n- The ratio hypothesis is being challenged in favor of absolute levels",
    },
});

// DB-loaded renderer examples — each resolves to its `tool_ui` row (agent-
// authored code), fetched + compiled at runtime via compileSlotComponent. The
// codebase ships NONE of these renderers; they live in the DB. This is the
// code-first dynamic path that, long-term, carries most tool UIs.
const DB_RENDERER_ENTRIES: ToolLifecycleEntry[] = [
    entry({
        callId: "db-fs-list",
        toolName: "fs_list",
        // No displayName — the collapsed label resolves from the tool_ui row's
        // display_name ("Directory") via useDbToolMeta, proving a DB renderer
        // owns its label too, not just its body.
        arguments: { path: "/home/agent/repos", recursive: false },
        result: {
            path: "/home/agent/repos",
            entries: [
                { name: "matrx-frontend", path: "/home/agent/repos/matrx-frontend", is_dir: true, size: 4096, mtime: 1781080487 },
                { name: "aidream", path: "/home/agent/repos/aidream", is_dir: true, size: 4096, mtime: 1781083431 },
                { name: "matrx-extend", path: "/home/agent/repos/matrx-extend", is_dir: true, size: 4096, mtime: 1781083058 },
                { name: "README.md", path: "/home/agent/repos/README.md", is_dir: false, size: 2048, mtime: 1781083100 },
                { name: "deploy.sh", path: "/home/agent/repos/deploy.sh", is_dir: false, size: 512, mtime: 1781083111 },
            ],
        },
    }),
    entry({
        callId: "db-shell",
        toolName: "shell_execute",
        arguments: { command: "git log --oneline -3" },
        result: {
            stdout: "7317e7de2 fix(chat): agentic turn renders as ONE unit + fold consecutive tool calls\n40e901215 release: v0.3.574\nc36d91c16 bookmark additions",
            stderr: "",
            exit_code: 0,
            cwd: "/home/agent/repos/matrx-frontend",
        },
    }),
    entry({
        callId: "db-memory",
        toolName: "memory",
        arguments: {
            key: "omega3_findings",
            action: "store",
            content: "Algae-derived omega-3 leads on sustainability + bioavailability; the ratio hypothesis is being challenged in favor of absolute levels.",
            importance: 0.8,
        },
        result: { stored: true, key: "omega3_findings", type: "long" },
    }),
    entry({
        callId: "db-weather",
        toolName: "travel_get_weather",
        arguments: { city: "Miami" },
        result: { city: "Miami", condition: "windy", temperature: 83, unit: "fahrenheit" },
    }),
    entry({
        callId: "db-fs-read",
        toolName: "fs_read",
        arguments: { path: "scripts/deploy.sh" },
        result: {
            path: "/home/agent/repos/matrx-frontend/scripts/deploy.sh",
            content: "#!/usr/bin/env bash\nset -euo pipefail\n\n# Build the core profile and ship to Vercel\nMATRX_PROFILE=core pnpm build\npnpm db-types\nvercel deploy --prod\n",
            size: 156,
            truncated: false,
        },
    }),
    entry({
        callId: "db-data-record",
        toolName: "data",
        arguments: { action: "get", resource: "project", id: "2c3d7caf" },
        // Shape-tolerant: this is the single-record variant ({record, resource_type}).
        result: {
            resource_type: "project",
            record: {
                id: "2c3d7caf-678a-423a-9c5c-d5b1d19b5934",
                name: "Universal Layout for Org Scope & Context System",
                slug: "universal-layout-org-scope-context",
                status: "active",
                created_at: "2026-06-19 04:26:19+00",
                settings: { __matrx_apply_key: "req:2df1b117" },
            },
        },
    }),
    entry({
        callId: "db-restaurants",
        toolName: "travel_get_restaurants",
        arguments: { city: "Miami" },
        result: { city: "Miami", restaurants: ["Joe's Stone Crab", "Casa French Bistro", "Versailles", "KYU"] },
    }),
    entry({
        callId: "db-events",
        toolName: "travel_get_events",
        arguments: { city: "Miami" },
        result: { city: "Miami", weather: "windy", events: ["Outdoor concert at Bayfront", "Food truck festival", "Art Basel preview"] },
    }),
    entry({
        callId: "db-navigate",
        toolName: "navigate_active_tab",
        arguments: { url: "https://platform.claude.com/docs" },
        result: { url: "https://platform.claude.com/docs/en/api/messages", title: "Messages — Claude API Reference", status: "complete" },
    }),
    entry({
        callId: "db-tabs",
        toolName: "tabs",
        arguments: {},
        result: {
            count: 3,
            tabs: [
                { id: 1, url: "https://mail.google.com/mail/u/0", title: "Inbox (2,927) - Gmail" },
                { id: 2, url: "https://github.com/anthropics", title: "anthropics · GitHub" },
                { id: 3, url: "https://aimatrx.com/chat", title: "Chat — AI Matrx" },
            ],
        },
    }),
    entry({
        callId: "db-find",
        toolName: "find",
        arguments: { query: "search" },
        result: {
            ok: true,
            mode: "ai",
            matches: [
                { ref: "7", score: 1, reason: "Directly corresponds to the page's search box." },
                { ref: "11", score: 0.8, reason: "Secondary search affordance in the header." },
            ],
        },
    }),
    entry({
        callId: "db-click",
        toolName: "click_element",
        arguments: { ref: "7" },
        result: { ok: true, tag: "button", text: "Search" },
    }),
    // Authored end-to-end by the "Tool Renderer Author" AI Matrx agent
    // (agent 678eb72e) via the agent MCP, then inserted into tool_ui — proof
    // of the full author → DB → render loop.
    entry({
        callId: "db-read-page",
        toolName: "read_page",
        arguments: { max_elements: 200 },
        result: {
            count: 159,
            elements: [
                { href: "https://pypi.org/manage/projects/#content", name: "Skip to main content", ref: "ref:0", role: "link" },
                { name: "Search PyPI", ref: "ref:5", role: "searchbox" },
                { name: "Your projects", ref: "ref:14", role: "heading" },
                { name: "Create a new project", ref: "ref:18", role: "button" },
                { href: "https://pypi.org/account/login/", name: "Log in", ref: "ref:8", role: "link" },
            ],
        },
    }),
    entry({
        callId: "db-active-tab",
        toolName: "get_active_tab",
        arguments: {},
        result: { tab_id: 908926627, url: "https://platform.claude.com/docs/en/api/admin/usage_report", title: "Usage Report — Claude API Reference", status: "complete" },
    }),
    entry({
        callId: "db-find-text",
        toolName: "find_text_on_page",
        arguments: { text: "observability" },
        result: {
            count: 2,
            matches: [
                { context: "Integrations and observability", selector: "li:nth-of-type(10) > a", tag: "a", text: "observability" },
                { context: "Observability dashboard overview", tag: "h2", text: "Observability" },
            ],
        },
    }),
    entry({
        callId: "db-page-text",
        toolName: "get_page_text",
        arguments: { max_chars: 5000 },
        result: {
            byline: "MGM Resorts",
            char_count: 1281,
            ok: true,
            title: "Bellagio — Book a Room",
            text: "Stay dates & resort selected for Las Vegas. Guests: 2. Calendar pricing includes the average daily resort fee (if applicable) and excludes tax. Select your stay dates and resort to see availability and pricing for your trip. Bellagio offers a range of room and suite options overlooking the famous fountains.",
            url: "https://bellagio.mgmresorts.com/book-room/",
        },
    }),
];

function FixtureCard({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">{label}</div>
            {children}
        </div>
    );
}

/**
 * Live search (press Play) — the Wave-1 canonical SEARCH renderer in its LIVE
 * rolling-window phase. One simulated entry drives both the raw inline renderer
 * and the full shell (NOT isPersisted, so it streams). The 3 parallel query
 * sections arrive as whole parts over time; the renderer reveals them a few at
 * a time (conveyor) and fast-forwards to the persistent Google-class view on
 * completion. The fixture has duplicate base URLs across queries → confirm at
 * most ~4 result rows at once and NO duplicate favicons.
 */
function LiveSearchSection() {
    const [playKey, setPlayKey] = useState(0);
    const hasPlayed = playKey > 0;
    const simEntry = useSimulatedToolEntry(hasPlayed ? SEARCH_RECORDING : null, { playKey });

    const statusVariant =
        simEntry.status === "completed"
            ? "default"
            : simEntry.status === "error"
              ? "destructive"
              : "secondary";
    const statusLabel = !hasPlayed ? "idle" : simEntry.status;

    return (
        <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Live search (press Play)
                </h2>
                <Button size="sm" onClick={() => setPlayKey((k) => k + 1)} className="gap-1.5">
                    {hasPlayed ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}
                    {hasPlayed ? "Replay" : "Play"}
                </Button>
                <Badge variant={statusVariant}>{statusLabel}</Badge>
                {simEntry.latestMessage ? (
                    <span className="text-xs text-muted-foreground">{simEntry.latestMessage}</span>
                ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
                Rolling-window conveyor: at most ~4 result rows visible at once, deduped by base URL (no
                duplicate favicon), sliding in as older rows flow out. On completion it fast-forwards to the
                clean persistent results view. Press Play to run.
            </p>

            <div className="space-y-4">
                <FixtureCard label="SearchInline — LIVE conveyor → PERSISTENT (raw renderer)">
                    <SearchInline entry={simEntry} events={simEntry.events} onOpenOverlay={() => {}} />
                </FixtureCard>
                <FixtureCard label="Shell behavior (live: auto-expand while streaming → auto-collapse after)">
                    <ToolCallVisualization entries={[simEntry]} hasContent />
                </FixtureCard>
            </div>
        </section>
    );
}

/**
 * Research stream simulation — the legacy research blob still streamed through
 * the shell, to keep the research/scrape recording exercised ahead of Waves
 * 2–3. Each query section lands as one whole part over time.
 */
function ResearchStreamSection() {
    const [playKey, setPlayKey] = useState(0);
    const hasPlayed = playKey > 0;
    const simEntry = useSimulatedToolEntry(hasPlayed ? RESEARCH_RECORDING : null, { playKey });

    const statusVariant =
        simEntry.status === "completed"
            ? "default"
            : simEntry.status === "error"
              ? "destructive"
              : "secondary";
    const statusLabel = !hasPlayed ? "idle" : simEntry.status;

    return (
        <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Research stream simulation (press Play)
                </h2>
                <Button size="sm" onClick={() => setPlayKey((k) => k + 1)} className="gap-1.5">
                    {hasPlayed ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}
                    {hasPlayed ? "Replay" : "Play"}
                </Button>
                <Badge variant={statusVariant}>{statusLabel}</Badge>
            </div>
            <FixtureCard label="Shell behavior (research_web — Wave 3 renderer)">
                <ToolCallVisualization entries={[simEntry]} hasContent />
            </FixtureCard>
        </section>
    );
}

/**
 * Live scrape (press Play) — the Wave-2 SCRAPE renderer in its READING phase.
 * One simulated entry drives both the raw inline renderer and the full shell.
 * Each page begins reading a beat apart (a "Browsing <url>" event), so the
 * left-to-right reading-wave card appears per page; on completion every card
 * fast-forwards to its filled state (title + snippet + char count).
 */
function LiveScrapeSection() {
    const [playKey, setPlayKey] = useState(0);
    const hasPlayed = playKey > 0;
    const simEntry = useSimulatedToolEntry(hasPlayed ? SCRAPE_RECORDING : null, { playKey });

    const statusVariant =
        simEntry.status === "completed"
            ? "default"
            : simEntry.status === "error"
              ? "destructive"
              : "secondary";
    const statusLabel = !hasPlayed ? "idle" : simEntry.status;

    return (
        <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Live scrape / page-read (press Play)
                </h2>
                <Button size="sm" onClick={() => setPlayKey((k) => k + 1)} className="gap-1.5">
                    {hasPlayed ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}
                    {hasPlayed ? "Replay" : "Play"}
                </Button>
                <Badge variant={statusVariant}>{statusLabel}</Badge>
                {simEntry.latestMessage ? (
                    <span className="text-xs text-muted-foreground">{simEntry.latestMessage}</span>
                ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
                One full CARD per page with a left-to-right reading-wave shimmer while reading; pages start a beat
                apart (Browsing &lt;url&gt;), then each card fills in (title · snippet · char count) on completion.
                Press Play to run.
            </p>
            <div className="space-y-4">
                <FixtureCard label="ScrapeInline — READING wave → filled cards (raw renderer)">
                    <ScrapeInline entry={simEntry} events={simEntry.events} onOpenOverlay={() => {}} />
                </FixtureCard>
                <FixtureCard label="Shell behavior (web_read — live: auto-expand → auto-collapse after)">
                    <ToolCallVisualization entries={[simEntry]} hasContent />
                </FixtureCard>
            </div>
        </section>
    );
}

/**
 * Live research (press Play) — the Wave-3 RESEARCH renderer. LIVE reuses the
 * Wave 1 search conveyor + Wave 2 scrape activity (driven by events) so the
 * sub-agent never sits still, and the curated report STREAMS into the
 * SubagentReportBlock (auto-scrolling, scroll-locked, collapsible). On
 * completion the report settles into a user-controllable shape.
 */
function LiveResearchSection() {
    const [playKey, setPlayKey] = useState(0);
    const hasPlayed = playKey > 0;
    const simEntry = useSimulatedToolEntry(hasPlayed ? RESEARCH_REPORT_RECORDING : null, { playKey });

    const statusVariant =
        simEntry.status === "completed"
            ? "default"
            : simEntry.status === "error"
              ? "destructive"
              : "secondary";
    const statusLabel = !hasPlayed ? "idle" : simEntry.status;

    return (
        <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Live research + streaming report (press Play)
                </h2>
                <Button size="sm" onClick={() => setPlayKey((k) => k + 1)} className="gap-1.5">
                    {hasPlayed ? <RotateCcw className="size-3.5" /> : <Play className="size-3.5" />}
                    {hasPlayed ? "Replay" : "Play"}
                </Button>
                <Badge variant={statusVariant}>{statusLabel}</Badge>
                {simEntry.latestMessage ? (
                    <span className="text-xs text-muted-foreground">{simEntry.latestMessage}</span>
                ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
                LIVE: the search conveyor + browsing activity keep the sub-agent visibly working; the curated report
                then streams into a distinct, slightly-narrower &quot;sub-agent report&quot; card that auto-scrolls to
                the bottom with user-scroll LOCKED. On completion it becomes scrollable + collapsible (none/partial/full)
                with the RichDocument action toolkit. Press Play to run.
            </p>
            <div className="space-y-4">
                <FixtureCard label="ResearchInline — LIVE activity → streaming report → settled (raw renderer)">
                    <ResearchInline entry={simEntry} events={simEntry.events} onOpenOverlay={() => {}} />
                </FixtureCard>
                <FixtureCard label="Shell behavior (research_web — live: auto-expand → auto-collapse after)">
                    <ToolCallVisualization entries={[simEntry]} hasContent />
                </FixtureCard>
            </div>
        </section>
    );
}

export default function ResultFieldsGalleryPage() {
    return (
        // Mirror AgentConversationColumn's centerWrap: w-full max-w-3xl mx-auto px-2.
        <div className="mx-auto w-full max-w-3xl space-y-8 px-2 py-6">
            <header className="space-y-1">
                <h1 className="text-xl font-semibold text-foreground">Tool result field library — gallery</h1>
                <p className="text-sm text-muted-foreground">
                    Every <code className="text-xs">ResultShape</code> branch rendered at the exact canonical chat
                    width (<code className="text-xs">max-w-3xl</code>, 768px). Verification harness for the generic
                    tool renderer overhaul.
                </p>
            </header>

            <LiveSearchSection />

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Live search — STATIC mid-stream snapshot (timer-independent)
                </h2>
                <p className="-mt-2 text-xs text-muted-foreground">
                    A <code className="text-xs">status: &quot;progress&quot;</code> entry with the full result already
                    parsed — the LIVE conveyor without the Play timer. Confirms the rolling-window cap (≤4 rows at
                    once) and base-URL dedupe even when HMR is unstable.
                </p>
                <FixtureCard label="SearchInline — LIVE conveyor (static progress entry)">
                    <SearchInline entry={SEARCH_LIVE_SNAPSHOT} events={[]} onOpenOverlay={() => {}} />
                </FixtureCard>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Search — PERSISTENT (final Google-class view, deduped)
                </h2>
                <p className="-mt-2 text-xs text-muted-foreground">
                    The fast-forwarded result: 3 parallel queries grouped, base-URL-deduped source list (the
                    healthline + nih duplicates across queries collapse to one each). No AI answer (plain search) →
                    leads with results. Click a row to expand the full overlay.
                </p>
                <div className="space-y-4">
                    <FixtureCard label="SearchInline — persistent (raw renderer)">
                        <SearchInline entry={SEARCH_ENTRY} events={[]} onOpenOverlay={() => {}} />
                    </FixtureCard>
                    <FixtureCard label="Shell — persisted (click to expand)">
                        <ToolCallVisualization entries={[SEARCH_ENTRY]} isPersisted hasContent />
                    </FixtureCard>
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Search — FULL / MODAL view (hide nothing: filter · sort · all sources)
                </h2>
                <FixtureCard label="SearchOverlay — overlay Results body">
                    <SearchOverlay entry={SEARCH_ENTRY} />
                </FixtureCard>
            </section>

            {/* ─── Wave 2: scrape / page-read cards ─────────────────────────── */}

            <LiveScrapeSection />

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Scrape — READING wave (STATIC mid-stream, timer-independent)
                </h2>
                <p className="-mt-2 text-xs text-muted-foreground">
                    A <code className="text-xs">status: &quot;progress&quot;</code> entry with NO pages parsed yet but
                    the &quot;Browsing &lt;url&gt;&quot; activity events present — one reading-wave card per page,
                    independent of the Play timer.
                </p>
                <FixtureCard label="ScrapeInline — READING cards (static progress entry)">
                    <ScrapeInline entry={SCRAPE_READING_SNAPSHOT} events={SCRAPE_READING_SNAPSHOT.events} onOpenOverlay={() => {}} />
                </FixtureCard>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Scrape — DONE, image ABSENT (real wire shape: pages = content only)
                </h2>
                <p className="-mt-2 text-xs text-muted-foreground">
                    The common case: <code className="text-xs">{`{pages:[{url,content}]}`}</code> with the
                    <code className="text-xs"> Here is the content from page …: &quot;&quot;&quot;…&quot;&quot;&quot;</code> envelope stripped, title
                    derived best-effort from the body, no preview image. Click a row to open the full reader overlay.
                </p>
                <div className="space-y-4">
                    <FixtureCard label="ScrapeInline — filled cards, no image (raw renderer)">
                        <ScrapeInline entry={SCRAPE_ENTRY_NO_IMAGE} events={[]} onOpenOverlay={() => {}} />
                    </FixtureCard>
                    <FixtureCard label="Shell — persisted (click to expand)">
                        <ToolCallVisualization entries={[SCRAPE_ENTRY_NO_IMAGE]} isPersisted hasContent />
                    </FixtureCard>
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Scrape — DONE, image PRESENT + AI-review (best-effort enrichment)
                </h2>
                <p className="-mt-2 text-xs text-muted-foreground">
                    A page object that ALSO carries an optional preview image (rendered via{" "}
                    <code className="text-xs">InlineMediaRef</code>, never a raw <code className="text-xs">&lt;img&gt;</code>) and an AI-review line (shown ONLY because it&apos;s present).
                </p>
                <FixtureCard label="ScrapeInline — page card with preview image + review line">
                    <ScrapeInline entry={SCRAPE_ENTRY_WITH_IMAGE} events={[]} onOpenOverlay={() => {}} />
                </FixtureCard>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Scrape — FULL / MODAL view (page list · full content · image · review)
                </h2>
                <div className="rounded-lg border border-border bg-card p-3" style={{ height: 520 }}>
                    <ScrapeOverlay entry={SCRAPE_ENTRY_WITH_IMAGE} />
                </div>
            </section>

            {/* ─── Wave 3: research subagent + streaming report ─────────────── */}

            <LiveResearchSection />

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Research report — STREAMING (STATIC mid-stream, timer-independent)
                </h2>
                <p className="-mt-2 text-xs text-muted-foreground">
                    A <code className="text-xs">status: &quot;progress&quot;</code> entry with the FULL curated report in{" "}
                    <code className="text-xs">result</code> — the SubagentReportBlock paces it client-side and pins to
                    the bottom with user-scroll LOCKED, no Play timer needed. Distinct &quot;sub-agent report&quot; card,
                    slightly narrower than full width, ~400px viewport.
                </p>
                <FixtureCard label="ResearchInline — streaming report (static progress entry)">
                    <ResearchInline entry={RESEARCH_STREAMING_SNAPSHOT} events={[]} onOpenOverlay={() => {}} />
                </FixtureCard>
                <FixtureCard label="SubagentReportBlock — streaming (direct render)">
                    <SubagentReportBlock report={RESEARCH_REPORT} streaming queries={[RESEARCH_REPORT_ARGS.query]} />
                </FixtureCard>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Research report — DONE (scrollable · collapsible · RichDocument actions)
                </h2>
                <p className="-mt-2 text-xs text-muted-foreground">
                    The settled report: free scroll in the ~400px window, Expand to full, collapse to the header, and
                    the RichDocument action toolkit (copy / save to notes / open editor / …). Below, the full renderer
                    with the report + sources summary + &quot;View full research&quot; overlay handoff.
                </p>
                <FixtureCard label="SubagentReportBlock — done (direct render)">
                    <SubagentReportBlock report={RESEARCH_REPORT} streaming={false} queries={[RESEARCH_REPORT_ARGS.query]} />
                </FixtureCard>
                <FixtureCard label="ResearchInline — done (report + sources + overlay handoff)">
                    <ResearchInline entry={RESEARCH_REPORT_ENTRY} events={[]} onOpenOverlay={() => {}} />
                </FixtureCard>
            </section>

            <ResearchStreamSection />

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Research (research_web) — full shell + overlay tabs (click to expand)
                </h2>
                <p className="-mt-2 text-xs text-muted-foreground">
                    The research blob WITHOUT a curated report — the renderer leads with the sources summary; expand the
                    row, then the overlay shows Report / Sources / Full Text / Input / Raw tabs.
                </p>
                <div className="rounded-lg border border-border bg-card p-3">
                    <ToolCallVisualization entries={[RESEARCH_ENTRY]} isPersisted hasContent />
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                    <ToolCallVisualization entries={[RESEARCH_REPORT_ENTRY]} isPersisted hasContent />
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Dynamic (DB) renderer — `agent_call` compiled from `tool_ui` via the canonical runtime (click to expand)
                </h2>
                <div className="rounded-lg border border-border bg-card p-3">
                    <ToolCallVisualization entries={[AGENT_CALL_ENTRY]} isPersisted hasContent />
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    DB-loaded renderers — agent-authored code from `tool_ui`, NONE in the codebase (click a row to expand)
                </h2>
                <p className="-mt-2 text-xs text-muted-foreground">
                    fs_list (collection) · shell_execute (terminal) · memory (sparse status) · travel_get_weather (rich visual). Each is
                    fetched by `tool_name` and compiled at runtime through the same Babel sandbox the Agent Apps runtime uses — the
                    code-first path that scales to user- and agent-authored components across every platform.
                </p>
                <div className="rounded-lg border border-border bg-card p-3">
                    {DB_RENDERER_ENTRIES.map((e) => (
                        <ToolCallVisualization key={e.callId} entries={[e]} isPersisted hasContent />
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Note renderer — `note` (click a row to expand)
                </h2>
                <p className="-mt-2 text-xs text-muted-foreground">
                    Redux/Supabase-backed: the tiny result (`{`{ id, label, updated_at }`}`) hydrates the live note —
                    Edit/Preview toggle, collapsible markdown Preview, content stats, and "Open in Notes" (deep-linked
                    window). Log in as admin@admin.com to see real content; the second row is long enough to collapse.
                </p>
                <div className="rounded-lg border border-border bg-card p-3">
                    {NOTE_ENTRIES.map((e) => (
                        <ToolCallVisualization key={e.callId} entries={[e]} isPersisted hasContent />
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    CTX renderers — ctx_get / ctx_batch / ctx_patch (click a row to expand)
                </h2>
                <div className="rounded-lg border border-border bg-card p-3">
                    {CTX_ENTRIES.map((e) => (
                        <ToolCallVisualization key={e.callId} entries={[e]} isPersisted hasContent />
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    ctx_patch — human diff + new content (PatchDiffInline, rendered directly)
                </h2>
                <p className="-mt-2 text-xs text-muted-foreground">
                    str_replace shows the highlight diff (inserted text tinted, unchanged plain — an insert doesn't mark
                    everything changed); overwrite renders the new content as markdown. Works the SAME on reload, since the
                    diff is reconstructed from the persisted args. Toggle Changes / Result.
                </p>
                <div className="space-y-3">
                    {CTX_ENTRIES.filter((e) => e.toolName === "ctx_patch").map((e) => (
                        <PatchDiffInline key={e.callId} entry={e} events={[]} isPersisted toolGroupId={e.callId} />
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Database / SQL renderers — sql / db_query / db_schema (click a row to expand)
                </h2>
                <div className="rounded-lg border border-border bg-card p-3">
                    {SQL_ENTRIES.map((e) => (
                        <ToolCallVisualization key={e.callId} entries={[e]} isPersisted hasContent />
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    ToolCallVisualization shell — real path (click a row to expand)
                </h2>
                <div className="rounded-lg border border-border bg-card p-3">
                    {STATE_ENTRIES.map((e) => (
                        <ToolCallVisualization key={e.callId} entries={[e]} isPersisted hasContent />
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    GenericRenderer — completed / error / running states
                </h2>
                {STATE_ENTRIES.map((e) => (
                    <FixtureCard key={e.callId} label={`${e.displayName} — ${e.status}`}>
                        <GenericRenderer entry={e} events={e.events} toolGroupId={e.callId} />
                    </FixtureCard>
                ))}
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    ResultValue — full density
                </h2>
                {FIXTURES.map((f) => (
                    <FixtureCard key={f.label} label={f.label}>
                        <ResultValue value={f.value} density="full" />
                    </FixtureCard>
                ))}
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    ResultValue — inline density
                </h2>
                {FIXTURES.map((f) => (
                    <FixtureCard key={f.label} label={f.label}>
                        <ResultValue value={f.value} density="inline" />
                    </FixtureCard>
                ))}
            </section>
        </div>
    );
}
