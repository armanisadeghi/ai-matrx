import { Suspense } from "react";
import type { ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import { listSessionsServer } from "@/features/transcript-studio/service/studioService";
import { StudioHydrator } from "@/features/transcript-studio/route/StudioHydrator";

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
      <div className="flex h-dvh w-full justify-center bg-muted/20">
        <div className="h-dvh w-full max-w-2xl overflow-hidden md:border-x md:border-border">
          <Suspense fallback={null}>{children}</Suspense>
        </div>
      </div>
    </>
  );
}
