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
import { ResearchRevivalInline } from "@/features/tool-call-visualization/renderers/research-revival/ResearchRevivalInline";
import { ResearchRevivalOverlay } from "@/features/tool-call-visualization/renderers/research-revival/ResearchRevivalOverlay";
import { ResearchModernInline } from "@/features/tool-call-visualization/renderers/research-modern/ResearchModernInline";
import { ResearchModernOverlay } from "@/features/tool-call-visualization/renderers/research-modern/ResearchModernOverlay";
import { buildResearchRecording } from "@/features/tool-call-visualization/simulator/streamRecording";
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
        callId: "ctx-patch",
        toolName: "ctx_patch",
        displayName: "Context",
        arguments: { key: "patient_summary", command: "str_replace" },
        result: {
            key: "patient_summary",
            command: "str_replace",
            ok: true,
            preview:
                "## History\n\nPatient presents with **acute** chest pain, onset 2 hours ago. Aspirin 325mg administered.",
        },
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
 * Realistic stream simulation. One hook call drives a single evolving
 * `ToolLifecycleEntry`; the same entry is fed to BOTH research versions and the
 * shell, so they stream together for a true side-by-side comparison. Press Play
 * (then Replay) to (re)run; each query section lands as one whole part over
 * time — no character trickle.
 */
function StreamSimulationSection() {
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
                    Stream simulation (realistic — press Play)
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
                One simulated entry feeds all three. Query sections arrive as whole parts, spaced over time — the
                renderers reveal them part-by-part and fast-forward when the next lands.
            </p>

            <div className="space-y-4">
                <FixtureCard label="Version A — Revival (streaming)">
                    <ResearchRevivalInline entry={simEntry} events={simEntry.events} onOpenOverlay={() => {}} />
                </FixtureCard>
                <FixtureCard label="Version B — Modern (streaming)">
                    <ResearchModernInline entry={simEntry} events={simEntry.events} onOpenOverlay={() => {}} />
                </FixtureCard>
                <FixtureCard label="Shell behavior (auto-expand while streaming → auto-collapse after)">
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

            <StreamSimulationSection />

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Search / Research — INLINE: Version A (Revival) vs Version B (Modern)
                </h2>
                <div className="space-y-4">
                    <FixtureCard label="Version A — Revival (faithful to the lost comprehensive view)">
                        <ResearchRevivalInline entry={RESEARCH_ENTRY} events={[]} onOpenOverlay={() => {}} />
                    </FixtureCard>
                    <FixtureCard label="Version B — Modern (data-dense, Perplexity-style)">
                        <ResearchModernInline entry={RESEARCH_ENTRY} events={[]} onOpenOverlay={() => {}} />
                    </FixtureCard>
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Search / Research — FULL / MODAL view: Version A vs Version B
                </h2>
                <div className="space-y-4">
                    <FixtureCard label="Version A — Revival (overlay Results body)">
                        <ResearchRevivalOverlay entry={RESEARCH_ENTRY} />
                    </FixtureCard>
                    <FixtureCard label="Version B — Modern (overlay Results body)">
                        <ResearchModernOverlay entry={RESEARCH_ENTRY} />
                    </FixtureCard>
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
