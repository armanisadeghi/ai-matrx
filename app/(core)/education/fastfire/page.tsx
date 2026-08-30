// /education/fastfire — the FastFire voice-graded flashcard drill.
//
// Server shell: resolves the optional `?set=<id>` query (a deep link straight
// into a set's drill) and renders the client island. FastFire is a heavy,
// browser-only client (mic, MediaRecorder, AudioContext, rAF timers), so it is
// code-split behind `next/dynamic({ ssr: false })` via FastFireClient — it must
// never enter a server/SSR render path.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { EducationToolHeader } from "@/features/education/components/EducationToolHeader";
import { FastFireClient } from "@/features/flashcards/fast-fire/components/FastFireClient";

export const metadata: Metadata = toolMetadata("fastfire");

interface FastFirePageProps {
  searchParams: Promise<{ set?: string }>;
}

export default async function FastFireToolPage({
  searchParams,
}: FastFirePageProps) {
  const { set } = await searchParams;
  return (
    <>
      <EducationToolHeader title="FastFire" />
      <div className="h-full overflow-hidden bg-textured">
        {/* One scroll owner for setup and scoreboard. The header offset keeps
            their first interactive controls below the AppShell glass. */}
        <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
          <FastFireClient setId={set ?? null} />
        </div>
      </div>
    </>
  );
}
