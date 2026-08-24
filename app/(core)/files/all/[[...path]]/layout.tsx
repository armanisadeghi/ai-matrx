/**
 * app/(core)/files/all/[[...path]]/layout.tsx
 *
 * Persistent shell for the `/files/all` workspace. PageShell lives here — not
 * in page.tsx — so folder-to-folder navigation does not remount the sidebar,
 * header, or file list chrome. Mirrors the Notes layout pattern: the page
 * slot handles query-string hydration only (`FilesQueryHydrator`).
 *
 * Folder path segments are resolved server-side once per hard navigation;
 * in-app folder browsing updates the URL via `history.pushState` (see
 * `navigateFilesFolderPath`) without re-running this layout.
 */

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { filesDb } from "@/features/files/filesDb";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { PageShell } from "@/features/files/components/surfaces/PageShell";
import { readSidebarModeCookie } from "@/features/files/utils/server-cookies";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ path?: string[] }>;
}

export default async function CloudFilesAllLayout({
  children,
  params,
}: LayoutProps) {
  const { isAuthenticated, user } = await getServerAuth();

  if (!isAuthenticated || !user) {
    redirect("/files");
  }

  const supabase = await createClient();
  const { path } = await params;
  const folderPath = (path ?? []).map(decodeURIComponent).join("/");

  let initialFolderId: string | null = null;
  if (folderPath) {
    // Scoped to the viewer's OWN folder. `folder_path` is not globally unique
    // — `files.folders` has a UNIQUE index on (created_by, folder_path), and 15
    // separate users own a folder called "system-files". Without `created_by`
    // this lookup (a) matched every RLS-visible namesake, so `maybeSingle()`
    // returned PGRST116 and silently dropped the folder id, and (b) could not
    // use the composite index because its leading column was absent.
    const { data } = await filesDb(supabase)
      .from("folders")
      .select("id")
      .eq("created_by", user.id)
      .eq("folder_path", folderPath)
      .is("deleted_at", null)
      .maybeSingle();
    initialFolderId = data?.id ?? null;
  }

  const sidebarMode = await readSidebarModeCookie();

  return (
    <>
      <PageShell
        section="all"
        initialFolderId={initialFolderId}
        initialFolderPath={folderPath || null}
        initialSidebarMode={sidebarMode}
      />
      <div style={{ display: "none" }} aria-hidden>
        {children}
      </div>
    </>
  );
}
