"use client";
// Next binding (slice P10): the dynamic() front door moved verbatim from the package call site.
// `next/dynamic` is imported here, literally, so Next's transform still applies.

import dynamic from "next/dynamic";
import { Skeleton } from "@ai-matrx/design-system";

export const AgentDiffViewer = dynamic(
  () => import("../../agents/components/diff/AgentDiffViewer").then((m) => m.AgentDiffViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 p-4 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    ),
  },
);
