/**
 * app/(a)/files/shared/page.tsx
 *
 * Shared files + folders — everything with visibility of public/shared or
 * explicit grantees. Filtering is client-side over the already-loaded tree.
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

export default async function CloudFilesSharedPage({
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
      section="shared"
      initialSidebarMode={sidebarMode}
      initialUiPatch={initialUiPatch}
      initialFileId={initialFileId}
    />
  );
}
