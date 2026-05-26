/**
 * app/(a)/files/recents/page.tsx
 *
 * Recents view — surfaces the most recently updated files across the entire
 * tree. The actual filtering + sort lives in `row-data.ts` (driven by the
 * `recents` filter chip the page auto-applies via PageShell). No server-side
 * query needed; the tree is already in Redux from the layout's realtime
 * provider.
 */

import { PageShell } from "@/features/files/components/surfaces/PageShell";
import { readSidebarModeCookie } from "@/features/files/utils/server-cookies";
import {
  readFilesUiFromParams,
  type ServerSearchParams,
} from "@/features/files/utils/server-search-params";

interface PageProps {
  searchParams?: Promise<ServerSearchParams>;
}

export default async function CloudFilesRecentsPage({
  searchParams,
}: PageProps) {
  const sidebarMode = await readSidebarModeCookie();
  const sp = searchParams ? await searchParams : undefined;
  const { initialUiPatch, initialFileId } = readFilesUiFromParams(sp);
  return (
    <PageShell
      section="recents"
      initialSidebarMode={sidebarMode}
      initialUiPatch={initialUiPatch}
      initialFileId={initialFileId}
    />
  );
}
