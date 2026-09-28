"use client";

/**
 * A FILE DRAWN AS A PICTURE — records-ui's `fileImage` host port (lane DATA-V2-VIEWS-1).
 *
 * A gallery card whose picture column is a File column hands the host the file's id; the platform
 * draws it through its ONE media element, `InlineMediaRef` (durable refs only, the media lane's own
 * auth), filling the cover box. Spread into every RecordsMount host with `RECORDS_FILES`.
 */
import type { ReactNode } from "react";
import { InlineMediaRef } from "@ai-matrx/media/react";

export function fileImage({ fileId, alt }: { fileId: string; alt: string }): ReactNode {
  return <InlineMediaRef ref={fileId} alt={alt} size="fill" fit="cover" fallback="skeleton" errorFallback="icon" />;
}
