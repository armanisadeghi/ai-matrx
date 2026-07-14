"use client";

// features/education/assessment/grade-work/GradeWorkClient.tsx
//
// Thin client boundary that code-splits the Grade-My-Work surface behind
// `next/dynamic({ ssr: false })`. The surface pulls in the agent-execution
// slices + fileHandler upload path (browser-only), so it must never enter a
// server/SSR render path (CLAUDE.md heavy-client-code-split rule).

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const GradeWorkSurface = dynamic(
  () => import("./GradeWorkSurface").then((m) => m.GradeWorkSurface),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[60dvh] items-center justify-center bg-textured">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export function GradeWorkClient() {
  return <GradeWorkSurface />;
}
