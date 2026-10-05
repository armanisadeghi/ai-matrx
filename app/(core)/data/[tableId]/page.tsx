"use client";

// app/(core)/data/[tableId]/page.tsx — THE MOUNT, AND NOTHING MORE. The screen itself is
// `UnifiedDataTablePage` (features/unified-data/table-page), which every other mount imports.

import { use } from "react";

import { UnifiedDataTablePage } from "@/features/unified-data/table-page/UnifiedDataTablePage";

export default function UnifiedDataTableRoute({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = use(params);
  return <UnifiedDataTablePage tableId={tableId} />;
}
