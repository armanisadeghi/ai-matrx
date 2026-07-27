"use client";

/**
 * Simple Run Settings demo
 *
 * Visual-only preview of the consumer-facing settings panel for the agent
 * runner. Local state, no Redux wiring, no API calls. Drop the panel in
 * three contexts so you can sanity-check the look:
 *
 *   1. Inline — as it would look inside a drawer or full page.
 *   2. Popover — as it will actually ship (triggered by the gear button).
 *   3. Faux toolbar — shows the gear sitting alongside other toolbar icons
 *      so the sizing reads in context.
 */

import React, { useState } from "react";
import {
  SimpleRunSettings,
  type SimpleRunSettingsValue,
} from "@/features/agents/components/run-controls/SimpleRunSettings/SimpleRunSettings";
import { SimpleRunSettingsButton } from "@/features/agents/components/run-controls/SimpleRunSettings/SimpleRunSettingsButton";
import { ArrowUp, Mic, Paperclip } from "lucide-react";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/30">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function StateBadge({ value }: { value: SimpleRunSettingsValue | null }) {
  if (!value) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Nothing selected yet.
      </p>
    );
  }
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2 text-xs font-mono leading-relaxed">
      <div>
        <span className="text-muted-foreground">capability: </span>
        <span className="text-foreground">{value.capabilityId}</span>
      </div>
      <div>
        <span className="text-muted-foreground">model_id: </span>
        <span className="text-foreground">{value.modelId.slice(0, 8)}…</span>
      </div>
      <div>
        <span className="text-muted-foreground">reasoning: </span>
        <span className="text-foreground">{value.reasoningLevel}</span>
      </div>
    </div>
  );
}

export default function RunSettingsDemoPage() {
  const [inlineValue, setInlineValue] = useState<SimpleRunSettingsValue | null>(
    null,
  );
  const [popoverValue, setPopoverValue] =
    useState<SimpleRunSettingsValue | null>(null);

  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Simple Run Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Consumer-facing settings panel. Model names are hidden — we describe
            what the AI is good at, not which provider it comes from. Wiring to
            Redux / the override slice is a separate pass.
          </p>
        </div>

        {/* ── 1. Inline panel ─────────────────────────────────────────── */}
        <Section
          title="1. Inline — full panel as it would look in a drawer"
          description="Useful for mobile or for a dedicated settings page."
        >
          <div className="flex items-start gap-6">
            <SimpleRunSettings onChange={setInlineValue} />
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Current value
              </p>
              <StateBadge value={inlineValue} />
            </div>
          </div>
        </Section>

        {/* ── 2. Popover (the real integration) ──────────────────────── */}
        <Section
          title="2. Popover — triggered by the gear button (ships as this)"
          description="Click the gear to open. Clicking the selected card / pill is a no-op. A blue dot appears on the gear when the current run is customised."
        >
          <div className="flex items-center gap-4">
            <SimpleRunSettingsButton size="md" onChange={setPopoverValue} />
            <p className="text-xs text-muted-foreground">← click the gear</p>
            <div className="flex-1" />
            <StateBadge value={popoverValue} />
          </div>
        </Section>

        {/* ── 3. Faux toolbar — sanity-check sizing in context ────────── */}
        <Section
          title="3. In a faux input toolbar — check sizing against neighbours"
          description="Approximation of what it looks like next to the mic, attach, and send buttons."
        >
          <div className="flex items-center gap-0.5 bg-card rounded-lg border border-border px-2 py-1.5 w-fit">
            <button className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted">
              <Paperclip className="w-3.5 h-3.5" />
            </button>
            <button className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-muted">
              <Mic className="w-3.5 h-3.5" />
            </button>
            <SimpleRunSettingsButton size="sm" />
            <button className="h-7 w-7 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-foreground">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            In the actual input toolbar you&apos;d drop{" "}
            <code className="bg-muted/60 rounded px-1 py-0.5 font-mono text-[11px]">
              &lt;SimpleRunSettingsButton size=&quot;sm&quot; /&gt;
            </code>{" "}
            next to the mic.
          </p>
        </Section>

        {/* ── 4. Caveats / next steps ─────────────────────────────────── */}
        <Section title="Wiring notes (for the next pass)" description="">
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-5">
            <li>
              The <span className="font-mono">onChange</span> callback already
              returns both the capability id and the resolved underlying model
              id — feed that directly into{" "}
              <span className="font-mono">
                setOverrides({"{"}conversationId, changes: {"{"}model_id{"}"}
                {"}"})
              </span>{" "}
              when we&apos;re ready.
            </li>
            <li>
              Reasoning level is a single string the server can translate to
              either <span className="font-mono">reasoning_effort</span> or{" "}
              <span className="font-mono">thinking_level</span> — the UI
              doesn&apos;t need to know which.
            </li>
            <li>
              Model names, temperature, top_p, max_tokens, and stop_sequences
              are intentionally absent. They stay in the builder for power
              users.
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
