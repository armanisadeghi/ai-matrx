import { Suspense } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { listSessionsServer } from "@/features/transcript-studio/service/studioService";
import { StudioHydrator } from "@/features/transcript-studio/route/StudioHydrator";
import CleanupPad from "@/features/transcription-cleanup/components/CleanupPad";

/**
 * Read a persisted react-resizable-panels layout cookie (written client-side by
 * CleanupPad's `onLayoutChanged`). Returns the percentage map so the splits
 * paint at the user's saved widths on the first frame — no flash.
 */
async function readLayout(
  name: string,
): Promise<Record<string, number> | undefined> {
  const raw = (await cookies()).get(name)?.value;
  if (!raw) return undefined;
  try {
    return JSON.parse(decodeURIComponent(raw)) as Record<string, number>;
  } catch {
    return undefined;
  }
}

interface PageProps {
  searchParams: Promise<{ session?: string }>;
}

export default async function TranscriptionCleanupPage({
  searchParams,
}: PageProps) {
  const { session: initialSessionId } = await searchParams;
  const supabase = await createClient();

  // Best-effort SSR seed of the cleanup session list (source='cleanup' only).
  // Failures fall through to the client-side fetch in useCleanupSession.
  let seeds: Awaited<ReturnType<typeof listSessionsServer>> = [];
  try {
    seeds = await listSessionsServer(supabase, { source: "cleanup" });
  } catch {
    seeds = [];
  }

  const [hLayout, vLayout] = await Promise.all([
    readLayout("panels:cleanup-h3"),
    readLayout("panels:cleanup-v"),
  ]);

  // h-full fills the shell main area (which already reserves the mobile dock
  // via its own padding). The shell header is transparent and content sits
  // behind it — the page header portals in via <PageHeader>; panels clear it
  // with their own pt-[var(--shell-header-h)].
  return (
    <div className="h-full overflow-hidden bg-textured">
      <StudioHydrator
        seeds={seeds}
        initialSessionId={initialSessionId ?? null}
      />
      <Suspense fallback={null}>
        <CleanupPad defaultHLayout={hLayout} defaultVLayout={vLayout} />
      </Suspense>
    </div>
  );
}
