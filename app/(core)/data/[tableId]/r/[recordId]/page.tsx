"use client";

// app/(core)/data/[tableId]/r/[recordId]/page.tsx — THE MOUNT, AND NOTHING MORE. The screen is
// `UnifiedRecordPage` (features/unified-data/table-page): the record panel, full page.

import { use } from "react";

import { UnifiedRecordPage } from "@/features/unified-data/table-page/UnifiedRecordPage";

export default function UnifiedRecordRoute({ params }: { params: Promise<{ tableId: string; recordId: string }> }) {
  const { tableId, recordId } = use(params);
  return <UnifiedRecordPage tableId={tableId} recordId={recordId} />;
}
