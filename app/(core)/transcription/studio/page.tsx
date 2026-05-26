import { Suspense } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { listSessionsServer } from "@/features/transcript-studio/service/studioService";
import { StudioHydrator } from "@/features/transcript-studio/route/StudioHydrator";
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

export default async function TranscriptStudioPage({ searchParams }: PageProps) {
  const { session: initialSessionId } = await searchParams;

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

  // Read the studio columns layout cookie so the 4-column shell paints
  // with the user's saved widths on the first frame.
  const defaultColumnLayout = decodeStudioLayoutCookie(
    cookieStore.get(STUDIO_COLUMN_COOKIE_NAME)?.value,
  );
  const defaultSidebarLayout = decodeStudioSidebarCookie(
    cookieStore.get(STUDIO_SIDEBAR_COOKIE_NAME)?.value,
  );

  return (
    <>
      <StudioHydrator
        seeds={seeds}
        initialSessionId={initialSessionId ?? null}
      />
      <Suspense fallback={null}>
        <StudioRoute
          defaultColumnLayout={defaultColumnLayout}
          defaultSidebarLayout={defaultSidebarLayout}
        />
      </Suspense>
    </>
  );
}
