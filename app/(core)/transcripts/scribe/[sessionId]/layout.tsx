import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { createClient } from "@/utils/supabase/server";
import { getSessionServer } from "@/features/transcript-studio/service/studioService";

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
    letter: "Ss",
  });
}

export default function ScribeSessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
