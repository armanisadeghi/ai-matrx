/**
 * app/(a)/files/starred/page.tsx
 *
 * Starred items — "Coming soon" placeholder. Needs a `cld_user_stars` table
 * before it can be wired up.
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

export default async function CloudFilesStarredPage({
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
      section="starred"
      initialSidebarMode={sidebarMode}
      initialUiPatch={initialUiPatch}
      initialFileId={initialFileId}
    />
  );
}
