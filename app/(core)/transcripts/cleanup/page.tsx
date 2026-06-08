import { cookies } from "next/headers";
import CleanupPad from "@/features/transcription-cleanup/components/CleanupPad";

/**
 * Read a persisted react-resizable-panels layout cookie (written client-side by
 * CleanupPad's `onLayoutChanged`). Returns the percentage map so the split
 * paints at the user's saved widths on the first frame — no flash.
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

export default async function TranscriptionCleanupPage() {
  const [hLayout, vLayout] = await Promise.all([
    readLayout("panels:cleanup-h"),
    readLayout("panels:cleanup-v"),
  ]);

  // h-full fills the shell main area (which already reserves the mobile dock via
  // its own padding). The shell header is transparent and content sits behind
  // it — the page header is portaled in via <PageHeader>, panels clear it with
  // their own pt-[var(--shell-header-h)].
  return (
    <div className="h-full overflow-hidden bg-textured">
      <CleanupPad defaultHLayout={hLayout} defaultVLayout={vLayout} />
    </div>
  );
}
