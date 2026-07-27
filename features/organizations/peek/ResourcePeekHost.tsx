"use client";

/**
 * ResourcePeekHost — thin front door (MarkdownStream pattern, right-way experiment).
 * ONE dynamic({ssr:false}) edge; everything inside (ResourcePeekHostImpl) is a single
 * statically-imported piece built once.
 */

import React from "react";
import dynamic from "next/dynamic";

const ResourcePeekHostImplLazy = dynamic(
  () => import("./ResourcePeekHostImpl").then((m) => ({ default: m.ResourcePeekHostImpl })),
  { ssr: false, loading: () => null },
);

export function ResourcePeekHost(
  props: React.ComponentProps<typeof ResourcePeekHostImplLazy>,
) {
  return <ResourcePeekHostImplLazy {...props} />;
}
