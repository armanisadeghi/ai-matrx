"use client";

// DataTableDetailClient — /data/<id> is the table page, the same screen as /data-v2/<id>
// (records-ui TablePage). Same id, same address. A table this person may not open is answered by
// the table page's own not-found / access answer.

import { useMemo } from "react";

import UnifiedDataTableRoute from "@/app/(core)/data-v2/[tableId]/page";

export default function DataTableDetailClient({ tableId }: { tableId: string }) {
  const params = useMemo(() => Promise.resolve({ tableId }), [tableId]);
  return <UnifiedDataTableRoute params={params} />;
}
