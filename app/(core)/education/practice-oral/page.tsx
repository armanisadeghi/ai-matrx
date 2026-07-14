// /education/practice-oral — Spoken Practice (oral exam / interview / debate).
//
// Server shell: resolves the optional `?mode=` deep link and renders the
// browser-only client island. The surface uses the shared AudioContext, mic
// capture, and agent-execution slices, so it is code-split behind
// `next/dynamic({ ssr: false })` via SpokenPracticeClient — it must never enter
// a server/SSR render path.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { SpokenPracticeClient } from "@/features/education/spoken-practice/components/SpokenPracticeClient";

export const metadata: Metadata = toolMetadata("practice-oral");

interface PracticeOralPageProps {
  searchParams: Promise<{ mode?: string }>;
}

export default async function PracticeOralToolPage({
  searchParams,
}: PracticeOralPageProps) {
  const { mode } = await searchParams;
  return (
    <div className="h-[calc(100dvh-2.5rem)] overflow-y-auto bg-textured">
      <SpokenPracticeClient initialMode={mode ?? null} />
    </div>
  );
}
