/**
 * app/(a)/files/all/[[...path]]/page.tsx
 *
 * Folder deep-link for the Files workspace. URL `/files/all/reports/2026/q1`
 * resolves to the folder with folder_path = "reports/2026/q1" server-side,
 * then hands off to the Dropbox-style PageShell with `initialFolderId` so
 * the view lands on the correct folder without a client-side round-trip.
 *
 * `/files` itself is the public marketing landing — sidebar nav points here
 * (`/files/all`) so authed users skip the marketing surface.
 *
 * Falls back to the root view if the path can't be resolved.
 */

import { FolderOpen } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { PageShell } from "@/features/files/components/surfaces/PageShell";
import { readSidebarModeCookie } from "@/features/files/utils/server-cookies";
import {
  readFilesUiFromParams,
  type ServerSearchParams,
} from "@/features/files/utils/server-search-params";
import { UnauthSurfaceLanding } from "@/features/auth/components/UnauthSurfaceLanding";

interface PageProps {
  params: Promise<{ path?: string[] }>;
  searchParams?: Promise<ServerSearchParams>;
}

export default async function CloudFilesDeepLinkPage({
  params,
  searchParams,
}: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Guests deep-linking to /files/all/* see the compact surface landing —
  // the marketing landing at /files is the front door.
  if (!user) {
    return (
      <UnauthSurfaceLanding
        featureName="Files"
        icon={FolderOpen}
        description="A real-time synced file system for uploads, previews, and sharing."
        bullets={[
          "Upload and organize files across folders",
          "Share via link with granular permissions",
          "Drop files straight into chat or agents",
        ]}
      />
    );
  }

  const { path } = await params;
  const folderPath = (path ?? []).map(decodeURIComponent).join("/");
  const sp = searchParams ? await searchParams : undefined;

  let initialFolderId: string | null = null;
  if (folderPath) {
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
