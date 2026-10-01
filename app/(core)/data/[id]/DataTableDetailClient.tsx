"use client";

// DataTableDetailClient — /data/<id> is the table page, the same screen as /data-v2/<id>
// (records-ui TablePage). Same id, same address. A table this person may not open is answered by
// the table page's own not-found / access answer.

import { UnifiedDataTablePage } from "@/features/unified-data/table-page/UnifiedDataTablePage";

export default function DataTableDetailClient({ tableId }: { tableId: string }) {
  return <UnifiedDataTablePage tableId={tableId} />;
}
