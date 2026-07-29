/**
 * app/(a)/files/trash/page.tsx
 *
 * Deleted files. Renders the Dropbox-style shell with `section="trash"` —
 * the row-data filter picks out every soft-deleted file and folder across
 * the user's tree.
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

export default async function CloudFilesTrashPage({ searchParams }: PageProps) {
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
      section="trash"
      initialSidebarMode={sidebarMode}
      initialUiPatch={initialUiPatch}
      initialFileId={initialFileId}
    />
  );
}
