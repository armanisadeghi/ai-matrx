"use client";

/**
 * `kind_value` — a kind value opened in the canvas (KINDS-GLUE wave 3 §5.5).
 *
 * The value (`{"__kind": …}`, an object or its JSON text) goes to the ONE kind front door,
 * `KindValueFrontDoor`, which routes it exactly as a chat or a note does — so a record of a Table
 * (`table:<uuid>`) is the same card here as there. This adapter draws nothing of its own.
 */

import KindValueFrontDoor from "@/components/official/structured-value/KindValueFrontDoor";
import type { ArtifactRendererProps } from "../types";

function valueOf(data: unknown, raw: string | undefined): unknown {
  if (data !== undefined && data !== null && typeof data !== "string") return data;
  const text = typeof data === "string" ? data : raw;
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export default function KindValueArtifact({ data, raw }: ArtifactRendererProps) {
  const value = valueOf(data, raw);
  return (
    <div className="h-full overflow-auto p-3">
      <KindValueFrontDoor value={value} />
    </div>
  );
}
