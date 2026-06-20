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
