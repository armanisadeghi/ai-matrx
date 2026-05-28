"use client";

import { useState } from "react";
import { AgentPlanningIndicator } from "@/features/agents/components/shared/AgentPlanningIndicator";
import { AgentStatusIndicator } from "@/features/agents/components/run/AgentStatusIndicator";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import MatxRouteLoader from "@/components/loaders/route-loading";
import MatxLoader from "@/components/loaders/MatxLoader";
import LoadingSpinner from "@/components/ui/loading-spinner";
import ThinkingVisualization from "@/components/mardown-display/blocks/thinking-reasoning/ThinkingVisualization";
import ReasoningVisualization from "@/components/mardown-display/blocks/thinking-reasoning/ReasoningVisualization";
import ConsolidatedReasoningVisualization from "@/components/mardown-display/blocks/thinking-reasoning/ConsolidatedReasoningVisualization";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

type DemoId =
  | "shimmer-text-short"
  | "shimmer-text-long"
  | "agent-planning-default"
  | "agent-planning-compact"
  | "agent-status-default"
  | "agent-status-compact"
  | "matrx-mini-loader"
  | "matx-route-loader"
  | "matx-full-loader"
  | "thinking-streaming"
  | "thinking-static"
  | "reasoning-streaming"
  | "reasoning-static"
  | "consolidated-reasoning"
  | "spinner-brain"
  | "spinner-workflow"
  | "spinner-dots";

const STATUS_MESSAGE =
  "Selecting tools and preparing a detailed response — this may take a moment.";

const SAMPLE_THINKING = `### Request Analysis:
Reviewing your question for scope and required data.

### Logical Steps:
1. Gather relevant context
2. Draft a precise answer

### Ready to respond:
Analysis complete.`;

const SAMPLE_REASONING = `**Tool selection**
Choosing the safest API route and validating parameters before execution.

Additional checks: rate limits, auth scope, and argument types.`;

const CONSOLIDATED_STEPS = [
  `**Understanding**
Parsed the goal, constraints, and success criteria from the user message.`,
  `**Plan**
Run a targeted search, then synthesize results into a short answer with citations.`,
];

type DemoDef = {
  id: DemoId;
  label: string;
  hint: string;
};

const DEMOS: DemoDef[] = [
  {
    id: "shimmer-text-short",
    label: "Shimmer text — Planning...",
    hint: "Text-only left-to-right sweep, no icons.",
  },
  {
    id: "shimmer-text-long",
    label: "Shimmer text — Planning next moves...",
    hint: "Longer variant of the same text sweep.",
  },
  {
    id: "agent-planning-default",
    label: "AgentPlanningIndicator (default)",
    hint: "Pre–first-token “Connecting” state in agent chat.",
  },
  {
    id: "agent-planning-compact",
    label: "AgentPlanningIndicator (compact)",
    hint: "Dense layout for tight panels.",
  },
  {
    id: "agent-status-default",
    label: "AgentStatusIndicator (default)",
    hint: "Server status / info line with pulse + shimmer.",
  },
  {
    id: "agent-status-compact",
    label: "AgentStatusIndicator (compact)",
    hint: "Compact status row during streaming.",
  },
  {
    id: "matrx-mini-loader",
    label: "MatrxMiniLoader",
    hint: "Small “Initializing Matrx” + progress bar.",
  },
  {
    id: "matx-route-loader",
    label: "MatxRouteLoader",
    hint: "Route-style overlay: brain icon + step labels.",
  },
  {
    id: "matx-full-loader",
    label: "MatxLoader",
    hint: "Full-screen style loader (preview scrolls inside box).",
  },
  {
    id: "thinking-streaming",
    label: "ThinkingVisualization (streaming)",
    hint: "Collapsible thinking block while content updates.",
  },
  {
    id: "thinking-static",
    label: "ThinkingVisualization (static)",
    hint: "Same block without streaming shimmer on body.",
  },
  {
    id: "reasoning-streaming",
    label: "ReasoningVisualization (streaming)",
    hint: "Reasoning card with header shimmer.",
  },
  {
    id: "reasoning-static",
    label: "ReasoningVisualization (static)",
    hint: "Reasoning card, finalized appearance.",
  },
  {
    id: "consolidated-reasoning",
    label: "ConsolidatedReasoningVisualization",
    hint: "Multiple reasoning steps in one control.",
  },
  {
    id: "spinner-brain",
    label: "LoadingSpinner (brain)",
    hint: "Neural-style pulse around brain icon.",
  },
  {
    id: "spinner-workflow",
    label: "LoadingSpinner (workflow)",
    hint: "Workflow icon + step strip (inline, not fullscreen).",
  },
  {
    id: "spinner-dots",
    label: "LoadingSpinner (dots)",
    hint: "Pulsing dots + message (default variant).",
  },
];

function ShimmerText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block bg-clip-text text-transparent bg-[length:200%_100%] animate-shimmer",
        className,
      )}
      style={{
        backgroundImage:
          "linear-gradient(90deg, hsl(var(--muted-foreground) / 0.3) 0%, hsl(var(--foreground)) 50%, hsl(var(--muted-foreground) / 0.3) 100%)",
      }}
    >
      {text}
    </span>
  );
}

function renderPreview(active: DemoId) {
  switch (active) {
    case "shimmer-text-short":
      return <ShimmerText text="Planning..." className="text-sm" />;
    case "shimmer-text-long":
      return <ShimmerText text="Planning next moves..." className="text-sm" />;
    case "agent-planning-default":
      return <AgentPlanningIndicator />;
    case "agent-planning-compact":
      return <AgentPlanningIndicator compact />;
    case "agent-status-default":
      return <AgentStatusIndicator message={STATUS_MESSAGE} />;
    case "agent-status-compact":
      return <AgentStatusIndicator message={STATUS_MESSAGE} compact />;
    case "matrx-mini-loader":
      return <MatrxMiniLoader />;
    case "matx-route-loader":
      return (
        <div className="relative min-h-[280px] w-full overflow-hidden rounded-lg border border-border bg-background">
          <MatxRouteLoader
            title="AI Matrx"
            subtitle="Integrating intelligence for this preview…"
            step1="Initializing"
            step2="Loading"
            step3="Finalizing"
            fullscreen={false}
          />
        </div>
      );
    case "matx-full-loader":
      return (
        <div className="relative h-[min(28rem,calc(100dvh-12rem))] w-full overflow-auto rounded-lg border border-border bg-background">
          <MatxLoader />
        </div>
      );
    case "thinking-streaming":
      return (
        <ThinkingVisualization
          thinkingText={SAMPLE_THINKING}
          showThinking
          isStreaming
        />
      );
    case "thinking-static":
      return (
        <ThinkingVisualization
          thinkingText={SAMPLE_THINKING}
          showThinking
          isStreaming={false}
        />
      );
    case "reasoning-streaming":
      return (
        <ReasoningVisualization
          reasoningText={SAMPLE_REASONING}
          showReasoning
          isStreaming
        />
      );
    case "reasoning-static":
      return (
        <ReasoningVisualization
          reasoningText={SAMPLE_REASONING}
          showReasoning
          isStreaming={false}
        />
      );
    case "consolidated-reasoning":
      return (
        <ConsolidatedReasoningVisualization
          reasoningTexts={CONSOLIDATED_STEPS}
          showReasoning
        />
      );
    case "spinner-brain":
      return (
        <LoadingSpinner
          variant="brain"
          message="Model is processing…"
          size="md"
        />
      );
    case "spinner-workflow":
      return (
        <LoadingSpinner
          variant="workflow"
          title="Running workflow"
          subtitle="Planning steps and validating inputs…"
          showMessage={false}
        />
      );
    case "spinner-dots":
      return (
        <LoadingSpinner
          variant="dots"
          message="Waiting for first token…"
          size="md"
        />
      );
    default:
      return null;
  }
}

export function ModelActivityIndicatorsDemo() {
  const [active, setActive] = useState<DemoId | null>(null);

  const activeMeta = active ? DEMOS.find((d) => d.id === active) : null;

  return (
    <div className="min-h-dvh overflow-y-auto bg-textured">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Model activity indicators
          </h1>
          <p className="text-sm text-muted-foreground">
            Planning, connecting, initializing, and reasoning UI used around
            agents and markdown. Choose one component at a time — nothing runs
            on a timer except each component&apos;s own CSS animations.
          </p>
        </header>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Component
            </span>
            {active && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => setActive(null)}
              >
                <X className="h-3 w-3" />
                Clear preview
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {DEMOS.map((d) => (
              <Button
                key={d.id}
                type="button"
                variant={active === d.id ? "secondary" : "outline"}
                className={cn(
                  "h-auto min-h-10 w-full justify-start whitespace-normal px-3 py-2 text-left",
                  active === d.id && "ring-1 ring-primary/30",
                )}
                onClick={() => setActive(d.id)}
              >
                <span className="block text-sm font-medium">{d.label}</span>
                <span className="block text-xs text-muted-foreground font-normal">
                  {d.hint}
                </span>
              </Button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">Preview</h2>
          <div
            className={cn(
              "rounded-lg border border-border bg-card p-5 shadow-sm",
              !active && "min-h-[8rem] flex items-center justify-center",
            )}
          >
            {!active && (
              <p className="text-sm text-muted-foreground text-center px-4">
                Select a component above to render it here.
              </p>
            )}
            {active && (
              <div className="space-y-3">
                {activeMeta && (
                  <p className="text-xs text-muted-foreground border-b border-border pb-2">
                    {activeMeta.hint}
                  </p>
                )}
                <div className="min-w-0">{renderPreview(active)}</div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
