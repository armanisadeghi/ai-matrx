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

import React from "react";
import { ResultValue } from "@/features/tool-call-visualization/result-fields/ResultValue";
import { GenericRenderer } from "@/features/tool-call-visualization/registry/GenericRenderer";
import { ToolCallVisualization } from "@/features/tool-call-visualization/components/ToolCallVisualization";
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

function FixtureCard({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">{label}</div>
            {children}
        </div>
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
