/**
 * app/(a)/files/[[...path]]/page.tsx
 *
 * Folder deep-link. URL `/files/reports/2026/q1` resolves to the folder
 * with folder_path = "reports/2026/q1" server-side, then hands off to the
 * Dropbox-style PageShell with `initialFolderId` so the view lands on the
 * correct folder without a client-side round-trip.
 *
 * Falls back to the root view if the path can't be resolved.
 */

import { createClient } from "@/utils/supabase/server";
import { PageShell } from "@/features/files/components/surfaces/PageShell";
import { readSidebarModeCookie } from "@/features/files/utils/server-cookies";
import {
  readFilesUiFromParams,
  type ServerSearchParams,
} from "@/features/files/utils/server-search-params";

interface PageProps {
  params: Promise<{ path?: string[] }>;
  searchParams?: Promise<ServerSearchParams>;
}

export default async function CloudFilesDeepLinkPage({
  params,
  searchParams,
}: PageProps) {
  const { path } = await params;
  const folderPath = (path ?? []).map(decodeURIComponent).join("/");
  const sp = searchParams ? await searchParams : undefined;

  let initialFolderId: string | null = null;
  if (folderPath) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("cld_folders")
      .select("id")
      .eq("folder_path", folderPath)
      .is("deleted_at", null)
      .maybeSingle();
    initialFolderId = data?.id ?? null;
  }

  const sidebarMode = await readSidebarModeCookie();
  const { initialUiPatch, initialFileId } = readFilesUiFromParams(sp);

  return (
    <PageShell
      section="all"
      initialFolderId={initialFolderId}
      initialFileId={initialFileId}
      initialUiPatch={initialUiPatch}
      initialSidebarMode={sidebarMode}
    />
  );
}
