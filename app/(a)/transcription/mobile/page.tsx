import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { listSessionsServer } from "@/features/transcript-studio/service/studioService";
import { StudioHydrator } from "@/features/transcript-studio/route/StudioHydrator";
import { MobileStudioRoute } from "@/features/transcript-studio/components/mobile/MobileStudioRoute";

interface PageProps {
  searchParams: Promise<{ session?: string }>;
}

export default async function MobileTranscriptionPage({
  searchParams,
}: PageProps) {
  const { session: initialSessionId } = await searchParams;

  const supabase = await createClient();

  // Best-effort SSR seed of the session list. Failures fall through to the
  // client-side fetch inside MobileStudioRoute.
  let seeds: Awaited<ReturnType<typeof listSessionsServer>> = [];
  try {
    seeds = await listSessionsServer(supabase);
  } catch {
    seeds = [];
  }

  return (
    <>
      <StudioHydrator seeds={seeds} initialSessionId={initialSessionId ?? null} />
      <Suspense fallback={null}>
        <MobileStudioRoute initialSessionId={initialSessionId ?? null} />
      </Suspense>
    </>
  );
}
