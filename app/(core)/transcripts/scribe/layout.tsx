import { Suspense } from "react";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { listSessionsServer } from "@/features/transcript-studio/service/studioService";
import { StudioHydrator } from "@/features/transcript-studio/route/StudioHydrator";
import { GlobalRecordingIndicator } from "@/features/transcript-studio/components/recording/GlobalRecordingIndicator";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/transcripts", {
  titlePrefix: "Scribe",
  title: "Transcripts",
  description:
    "Voice-first capture, live transcription, and an assistant workspace for working documents.",
  letter: "M",
});

/**
 * Layout for the Scribe section (voice-driven working-document workspace).
 * Seeds the session list once for the whole section (persists across client
 * navigations between the list, a session, and the unsorted pool) and frames
 * every child in the phone-width column that stays usable on desktop.
 * Per-session routing lives in the child route segments so refresh /
 * deep-link / back all work.
 */
export default async function ScribeLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Guests bounce to the public `/transcripts` landing (same convention as
  // the processor page) — Scribe is a signed-in capture workspace.
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/transcripts");
  }

  const supabase = await createClient();

  let seeds: Awaited<ReturnType<typeof listSessionsServer>> = [];
  try {
    seeds = await listSessionsServer(supabase);
  } catch {
    seeds = [];
  }

  return (
    <>
      <StudioHydrator seeds={seeds} initialSessionId={null} />
      {/* h-full, NOT h-dvh: `.shell-root` is already `position: fixed; inset: 0`
          and this column lives in its `main` grid track, so 100dvh double-counts
          the viewport and overflows whatever the track actually is. */}
      <div className="flex h-full w-full justify-center bg-muted/20">
        <div className="h-full w-full max-w-2xl overflow-hidden md:border-x md:border-border">
          <Suspense fallback={null}>{children}</Suspense>
        </div>
      </div>
      {/* Persistent recording control — floats over every Scribe screen while a
          recording is active, so navigating away never hides or risks it. */}
      <GlobalRecordingIndicator />
    </>
  );
}
