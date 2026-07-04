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
  const { isAuthenticated } = await getServerAuth();

  if (!isAuthenticated) {
    redirect("/files");
  }

  const supabase = await createClient();
  const { path } = await params;
  const folderPath = (path ?? []).map(decodeURIComponent).join("/");

  let initialFolderId: string | null = null;
  if (folderPath) {
    const { data } = await filesDb(supabase)
      .from("folders")
      .select("id")
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
