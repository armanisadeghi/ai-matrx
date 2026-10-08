// app/(core)/data/[tableId]/r/[recordId]/page.tsx — THE MOUNT, AND NOTHING MORE. The screen is
// `UnifiedRecordPage` (features/unified-data/table-page): the record panel, full page.
//
// A server component only to START the table's first reads as the signed-in person while the
// browser is still loading the app (lane PAGE-BUNDLE-2, `features/unified-data/page-seed`).

import { PrimedRecordPage } from "@/features/unified-data/page-seed/PrimedTablePages";
import { readTablePageSeed, serverRowsOn } from "@/features/unified-data/page-seed/tablePageSeed.server";

export default async function UnifiedRecordRoute({
  params,
}: {
  params: Promise<{ tableId: string; recordId: string }>;
}) {
  const [{ tableId, recordId }, serverRows] = await Promise.all([params, serverRowsOn()]);
  return (
    <PrimedRecordPage
      tableId={tableId}
      recordId={recordId}
      serverRows={serverRows}
      seed={readTablePageSeed(tableId, recordId, { rows: false })}
    />
  );
}
