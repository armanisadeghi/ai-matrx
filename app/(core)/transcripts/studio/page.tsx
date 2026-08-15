import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { createClient } from "@/utils/supabase/server";
import {
  listCleanedSegmentsServer,
  listConceptItemsServer,
  listModuleSegmentsServer,
  listRawSegmentsServer,
  listSessionsServer,
} from "@/features/transcript-studio/service/studioService";
import {
  StudioHydrator,
  type StudioSessionSeed,
} from "@/features/transcript-studio/route/StudioHydrator";
import {
  STUDIO_COLUMN_COOKIE_NAME,
  decodeStudioLayoutCookie,
} from "@/features/transcript-studio/components/resize/studioPanelCookie";
import {
  STUDIO_SIDEBAR_COOKIE_NAME,
  decodeStudioSidebarCookie,
} from "@/features/transcript-studio/components/resize/studioSidebarCookie";
import { StudioRoute } from "./_components/StudioRoute";

interface PageProps {
  searchParams: Promise<{ session?: string }>;
}

export default async function TranscriptStudioPage({
  searchParams,
}: PageProps) {
  const { session: initialSessionId } = await searchParams;

  // Guests bounce to the public `/transcripts` landing (same convention as
  // the processor page) — the studio workspace has nothing to show them.
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect("/transcripts");
  }

  const supabase = await createClient();
  const cookieStore = await cookies();

  // Best-effort SSR seed of the session list. Failures fall through to a
  // client-side fetch in StudioView (showing the loading state briefly).
  let seeds: Awaited<ReturnType<typeof listSessionsServer>> = [];
  try {
    seeds = await listSessionsServer(supabase);
  } catch {
    seeds = [];
  }

  // When the URL names a session we own, seed its four columns server-side
  // too. `ActiveSessionView` guards each fetch on `has*Ids`, so a successful
  // seed means the workspace paints with content on the first frame and fires
  // no client round trip. Best-effort in the same way as the list above — any
  // failure just falls back to the client fetch.
  let sessionSeed: StudioSessionSeed | null = null;
  if (initialSessionId && seeds.some((s) => s.id === initialSessionId)) {
    try {
      const [raw, cleaned, concepts, moduleSegments] = await Promise.all([
        listRawSegmentsServer(supabase, initialSessionId),
        listCleanedSegmentsServer(supabase, initialSessionId),
        listConceptItemsServer(supabase, initialSessionId),
        listModuleSegmentsServer(supabase, initialSessionId),
      ]);
      sessionSeed = {
        sessionId: initialSessionId,
        raw,
        cleaned,
        concepts,
        moduleSegments,
      };
    } catch {
      sessionSeed = null;
    }
  }

  // Read the studio columns layout cookie so the 4-column shell paints
  // with the user's saved widths on the first frame.
  const defaultColumnLayout = decodeStudioLayoutCookie(
    cookieStore.get(STUDIO_COLUMN_COOKIE_NAME)?.value,
  );
  const defaultSidebarLayout = decodeStudioSidebarCookie(
    cookieStore.get(STUDIO_SIDEBAR_COOKIE_NAME)?.value,
  );

  return (
    <div className="h-full overflow-hidden bg-textured">
      <StudioHydrator
        seeds={seeds}
        initialSessionId={initialSessionId ?? null}
        sessionSeed={sessionSeed}
      />
      <Suspense fallback={null}>
        <StudioRoute
          defaultColumnLayout={defaultColumnLayout}
          defaultSidebarLayout={defaultSidebarLayout}
        />
      </Suspense>
    </div>
  );
}
