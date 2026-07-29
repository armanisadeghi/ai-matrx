/**
 * app/(a)/files/photos/page.tsx
 *
 * Photos view — filters `cld_files` client-side to those with `image/*` mime
 * types. No server-side query; the tree is already in Redux from the layout's
 * realtime provider.
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

export default async function CloudFilesPhotosPage({
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
      section="photos"
      initialSidebarMode={sidebarMode}
      initialUiPatch={initialUiPatch}
      initialFileId={initialFileId}
    />
  );
}
