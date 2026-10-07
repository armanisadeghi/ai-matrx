// app/(core)/data/[tableId]/page.tsx — THE MOUNT, AND NOTHING MORE. The screen itself is
// `UnifiedDataTablePage` (features/unified-data/table-page), which every other mount imports.
//
// A server component only to START the page's first reads as the signed-in person while the
// browser is still loading the app (lane PAGE-BUNDLE-2, `features/unified-data/page-seed`). The
// promise is not awaited: it streams in, and the page asks nothing it was already told.

import { PrimedTablePage } from "@/features/unified-data/page-seed/PrimedTablePages";
import { readTablePageSeed } from "@/features/unified-data/page-seed/tablePageSeed.server";

export default async function UnifiedDataTableRoute({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  return <PrimedTablePage tableId={tableId} seed={readTablePageSeed(tableId)} />;
}
