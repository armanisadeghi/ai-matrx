"use client";

import { InlineDemo, PrimitivesDemo } from "./_components/ScreenCaptureDemo";
import { FloatingCaptureDemo } from "./_components/FloatingCaptureDemo";

export default function ScreenCaptureDemoPage() {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold">Screen Capture</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-lg">
            Two capture strategies. Both return a{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">File</code>{" "}
            and a{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              dataUrl
            </code>
            . Logic lives in{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              hooks/useScreenCapture.ts
            </code>
            .
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card p-3 space-y-1">
              <p className="text-sm font-semibold">Tab Capture</p>
              <p className="text-xs text-muted-foreground">
                <code className="bg-muted px-1 py-0.5 rounded">
                  html-to-image
                </code>{" "}
                — silently re-paints the DOM. No browser picker. Fast. May miss
                backdrop-filter, canvas, and WebGL content.
              </p>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1">
              <p className="text-sm font-semibold">Screen Capture</p>
              <p className="text-xs text-muted-foreground">
                <code className="bg-muted px-1 py-0.5 rounded">
                  getDisplayMedia
                </code>{" "}
                with{" "}
                <code className="bg-muted px-1 py-0.5 rounded">
                  preferCurrentTab
                </code>{" "}
                — native browser picker, pixel-perfect. Current tab
                pre-selected.
              </p>
            </div>
          </div>
        </div>

        {/* Section 1: Inline via hook */}
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">1. Inline (via hook)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              <code className="bg-muted px-1 py-0.5 rounded">
                useScreenCapture
              </code>{" "}
              React hook used directly on a page. Captures this exact view.
            </p>
          </div>
          <InlineDemo />
        </section>

        {/* Section 2: Standalone primitives */}
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">
              2. Standalone async functions
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Calling the exported primitives directly — no hook required.
              Useful outside React (e.g. event handlers, utils).
            </p>
          </div>
          <PrimitivesDemo />
        </section>

        {/* Section 3: Floating window — harder case */}
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">
              3. Floating Window (hide → capture → restore)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              The trickier case: the panel hides itself before firing the
              capture so it doesn&apos;t appear in the screenshot. Both methods
              work inside a{" "}
              <code className="bg-muted px-1 py-0.5 rounded">WindowPanel</code>.
            </p>
          </div>
          <FloatingCaptureDemo />
        </section>
      </div>
    </div>
  );
}
