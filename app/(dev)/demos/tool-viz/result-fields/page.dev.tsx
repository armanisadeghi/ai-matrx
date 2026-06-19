"use client";

/**
 * Dev gallery for the tool-call-visualization "result field" library + the
 * generic renderer. Renders a battery of result shapes so the field library
 * can be eyeballed in isolation (no backend) across every branch of
 * `detectResultShape`. Doubles as the visual regression harness referenced by
 * the create-tool-renderer skill and the future user-facing builder.
 *
 * Route: /demos/tool-viz/result-fields   (dev profile only)
 */

import React from "react";
import { ResultValue } from "@/features/tool-call-visualization/result-fields/ResultValue";
import { GenericRenderer } from "@/features/tool-call-visualization/registry/GenericRenderer";
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
        label: "image url",
        value: "https://images.unsplash.com/photo-1518770660439-4636190af475.jpg",
    },
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

// Shell-level entries to verify the full ToolCallVisualization path.
const SHELL_ENTRIES: ToolLifecycleEntry[] = [
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

export default function ResultFieldsGalleryPage() {
    return (
        <div className="mx-auto max-w-5xl space-y-8 p-6">
            <header className="space-y-1">
                <h1 className="text-xl font-semibold text-foreground">Tool result field library — gallery</h1>
                <p className="text-sm text-muted-foreground">
                    Every <code className="text-xs">ResultShape</code> branch rendered at full density, plus the full
                    shell path. Verification harness for the generic tool renderer overhaul.
                </p>
            </header>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    ResultValue — full density
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {FIXTURES.map((f) => (
                        <div key={f.label} className="rounded-lg border border-border bg-card p-3">
                            <div className="mb-2 text-xs font-medium text-muted-foreground">{f.label}</div>
                            <ResultValue value={f.value} density="full" />
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    ResultValue — inline density
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {FIXTURES.map((f) => (
                        <div key={f.label} className="rounded-lg border border-border bg-card p-3">
                            <div className="mb-2 text-xs font-medium text-muted-foreground">{f.label}</div>
                            <ResultValue value={f.value} density="inline" />
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    GenericRenderer — completed / error / running states
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {SHELL_ENTRIES.map((e) => (
                        <div key={e.callId} className="rounded-lg border border-border bg-card p-3">
                            <div className="mb-2 text-xs font-medium text-muted-foreground">
                                {e.displayName} — {e.status}
                            </div>
                            <GenericRenderer entry={e} events={e.events} toolGroupId={e.callId} />
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
