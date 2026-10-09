"use client";

import { useParams } from "next/navigation";
import { TableRouteSkeleton } from "@/features/unified-data/page-seed/TableRouteSkeleton";

/**
 * THE ROUTE'S FIRST FRAME IS THE TABLE PAGE'S OWN SKELETON (lane STABLE-TABLES, Arman 2026-10-06:
 * "They must properly show skeletons and they should not cause shifts"). The table page draws the
 * same component while it waits for its first reads (`PrimedTablePage`), so the frames that follow
 * fill these boxes instead of replacing them.
 */
export default function Loading() {
  const params = useParams<{ tableId?: string }>();
  return <TableRouteSkeleton tableId={params?.tableId ?? null} />;
}
