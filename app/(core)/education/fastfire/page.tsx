// /education/fastfire — the FastFire voice-graded flashcard drill.
//
// Server shell: resolves the optional `?set=<id>` query (a deep link straight
// into a set's drill) and renders the client island. FastFire is a heavy,
// browser-only client (mic, MediaRecorder, AudioContext, rAF timers), so it is
// code-split behind `next/dynamic({ ssr: false })` via FastFireClient — it must
// never enter a server/SSR render path.
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
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
    // dvh (not vh) + scroll: the setup/scoreboard phases are taller than a phone
    // viewport, so the shell MUST scroll — `overflow-hidden` here clipped everything
    // below the fold on mobile and locked the user out. Full-screen drill phases use
    // `min-h-full` and simply fill this height without adding a scrollbar.
    <div className="h-[calc(100dvh-2.5rem)] overflow-y-auto">
      <FastFireClient setId={set ?? null} />
    </div>
  );
}
