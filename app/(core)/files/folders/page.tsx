/**
 * app/(a)/files/folders/page.tsx
 *
 * Folder explorer — a tree view of all folders, reached from the left icon
 * rail's Folders icon. The shell renders its FolderExplorer sub-view when
 * section === "folders".
 */

import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { PageShell } from "@/features/files/components/surfaces/PageShell";
import { readSidebarModeCookie } from "@/features/files/utils/server-cookies";
import {
  readFilesUiFromParams,
  type ServerSearchParams,
} from "@/features/files/utils/server-search-params";

interface PageProps {
  searchParams?: Promise<ServerSearchParams>;
}

export default async function CloudFilesFoldersPage({
  searchParams,
}: PageProps) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    // Guests never see the workspace shell — bounce to the /files landing.
    redirect("/files");
  }
  const sidebarMode = await readSidebarModeCookie();
  const sp = searchParams ? await searchParams : undefined;
  const { initialUiPatch, initialFileId } = readFilesUiFromParams(sp);
  return (
    <PageShell
      section="folders"
      initialSidebarMode={sidebarMode}
      initialUiPatch={initialUiPatch}
      initialFileId={initialFileId}
    />
  );
}
