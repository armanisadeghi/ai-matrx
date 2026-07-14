// /education/grade-work — "Grade My Handwritten Work".
//
// Server shell: renders the browser-only client island. The surface uses the
// agent-execution slices + fileHandler upload path, so it is code-split behind
// `next/dynamic({ ssr: false })` via GradeWorkClient — it must never enter a
// server/SSR render path.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { GradeWorkClient } from "@/features/education/assessment/grade-work/GradeWorkClient";

export const metadata: Metadata = toolMetadata("grade-work");

export default function GradeWorkToolPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] overflow-y-auto bg-textured">
      <GradeWorkClient />
    </div>
  );
}
