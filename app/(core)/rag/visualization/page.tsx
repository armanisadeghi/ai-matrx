"use client";

/**
 * /rag/visualization — Demo playground for the RagFlowVisualization.
 *
 * Temporary host page so the animation has a public URL while we figure
 * out where it ultimately lives. Shows the visualization with controls
 * + a small variant grid below so you can see how it looks at different
 * sizes and configurations.
 */

import { RagFlowVisualization } from "@/features/rag/components/visualization/RagFlowVisualization";

export default function Page() {
  return (
    <div className="flex-1 bg-background overflow-auto">
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
  );
}
