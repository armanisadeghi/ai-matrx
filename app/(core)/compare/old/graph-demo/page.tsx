// record-view: none — an old-version comparison page
"use client";

// Old graph demo (/knowledge/visualization, the flow-animation playground,
// before H6a, 2026-09-27), review-only. Page body restored verbatim from
// c16b6616f9^:app/(core)/rag/visualization/page.tsx; the animation component
// itself is still live and unchanged.

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { RagFlowVisualization } from "@/features/rag/components/visualization/RagFlowVisualization";
import { OldPageBanner } from "../_components/OldPageBanner";

export default function OldGraphDemoPage() {
  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton href="/knowledge" ariaLabel="Back to Knowledge" />
            <span className="ml-2 text-sm font-medium text-foreground truncate">
              Visualization
            </span>
          </>
        }
      />
      <div className="h-full overflow-auto bg-background pt-[var(--shell-header-h)]">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        <header className="space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Demo
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Matrx Vector Data Stores — Flow Animation
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Two paths converge on the vector data store. Read path on the left
            (violet) is what your agent asks. Write path on the right (cyan) is
            how documents get indexed. Watch them meet, then top-K chunks come
            back to ground the agent's answer.
          </p>
        </header>

        <RagFlowVisualization />

        <section className="space-y-2 pt-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Embed variants
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">
                  No controls (cinematic)
                </span>
                <code className="text-[10px] text-muted-foreground">
                  showControls={"{false}"}
                </code>
              </div>
              <RagFlowVisualization
                showControls={false}
                className="!h-[420px] !min-h-[420px]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Click-to-play</span>
                <code className="text-[10px] text-muted-foreground">
                  autoPlay={"{false}"}
                </code>
              </div>
              <RagFlowVisualization
                autoPlay={false}
                className="!h-[420px] !min-h-[420px]"
              />
            </div>
          </div>
        </section>
      </div>
      </div>
      <OldPageBanner newHref="/knowledge/flow" newLabel="the pipeline animation at Knowledge flow" />
    </>
  );
}
