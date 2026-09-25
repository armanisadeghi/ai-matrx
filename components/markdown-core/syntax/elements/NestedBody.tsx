"use client";

// A directive container's body that holds blocks (a code fence, a diagram, a
// CSV table): rendered through the nested rich-content renderer, one level
// deeper and depth-capped like every nested section, so the fence inside a
// tab or a callout is the same code block it is anywhere else.

import { lazy, Suspense } from "react";

const NestedRichContent = lazy(() =>
  import("@/components/rich-content/standard/NestedRichContent").then((m) => ({ default: m.NestedRichContent })),
);

export function NestedBody(props: { "data-source"?: string }) {
  const source = String(props["data-source"] ?? "");
  return (
    <Suspense fallback={<div className="whitespace-pre-wrap text-sm">{source}</div>}>
      <NestedRichContent source={source} />
    </Suspense>
  );
}
