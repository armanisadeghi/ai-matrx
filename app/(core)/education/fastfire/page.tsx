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
    <div className="h-[calc(100vh-2.5rem)] overflow-hidden">
      <FastFireClient setId={set ?? null} />
    </div>
  );
}
