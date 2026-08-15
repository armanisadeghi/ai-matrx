import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { createClient } from "@/utils/supabase/server";
import {
  getSessionServer,
  listCleanedSegmentsServer,
  listRawSegmentsServer,
  listRecordingSegmentsServer,
} from "@/features/transcript-studio/service/studioService";
import {
  StudioHydrator,
  type StudioSessionSeed,
} from "@/features/transcript-studio/route/StudioHydrator";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();
  let title = "Scribe Session";

  try {
    const session = await getSessionServer(supabase, sessionId);
    if (session?.title) title = session.title;
  } catch {
    // Fall back to generic title — metadata must never block render.
  }

  return createDynamicRouteMetadata("/transcripts", {
    titlePrefix: "Scribe",
    title,
    description: `Voice capture and assistant workspace for ${title}.`,
    letter: "M",
  });
}

/**
 * SSR-seeds the session's recordings + raw + cleaned segments so the Scribe
 * screen paints its recording cards and transcript without waiting on a client
 * round trip. The hydrator is rendered BEFORE `{children}` deliberately —
 * sibling effects run in tree order, so the seed lands before `ScribeScreen`'s
 * mount effect and its `has*Ids` guards can skip the fetch entirely.
 *
 * `seeds` is intentionally omitted: the parent scribe layout already seeded the
 * session list, and passing an empty array here would wipe it.
 */
export default async function ScribeSessionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  let sessionSeed: StudioSessionSeed | null = null;
  try {
    const supabase = await createClient();
    const [recordings, raw, cleaned] = await Promise.all([
      listRecordingSegmentsServer(supabase, sessionId),
      listRawSegmentsServer(supabase, sessionId),
      listCleanedSegmentsServer(supabase, sessionId),
    ]);
    sessionSeed = { sessionId, recordings, raw, cleaned };
  } catch {
    // Best-effort: the client fetch in ScribeScreen remains the fallback.
    sessionSeed = null;
  }

  return (
    <>
      <StudioHydrator sessionSeed={sessionSeed} />
      {children}
    </>
  );
}
