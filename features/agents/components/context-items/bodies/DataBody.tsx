"use client";

/**
 * Data-reference drawer body — full descriptor of a single DataRef
 * (db_record / db_query / db_field). Reuses `DataRefPreviewContent`.
 */

import { DataRefPreviewContent } from "@/features/agents/components/previews/DataRefHoverPreview";
import type { ContextItemBodyProps } from "../types";

export function DataBody({ item }: ContextItemBodyProps) {
  const ref = item.refs.dataRefs?.[0] ?? null;

  if (!ref) {
    return (
      <p className="p-4 text-xs text-muted-foreground italic">
        No data reference on this item.
      </p>
    );
  }

  return (
    <div className="p-4">
      <DataRefPreviewContent ref={ref} />
    </div>
  );
}
