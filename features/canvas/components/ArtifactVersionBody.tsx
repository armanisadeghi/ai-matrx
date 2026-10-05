"use client";

/**
 * One selected artifact version, as a person reads it (KIND_NEVER_RAW S5,
 * round 4): the version's data through `AnswerValueView` (a kind → its own
 * component), never `JSON.stringify` in a `<pre>`. The stored text stays what
 * restore and the diff read; "View JSON" is the explicit, labelled raw toggle.
 */

import React, { useState } from "react";
import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";
import { hasKindKey } from "@/features/content-ir/surfaces/json-kind-signal";
import { kindTextToMarkdown } from "@/features/content-ir/surfaces/kind-text-to-markdown";
import { kindValueToMarkdown } from "@/features/canvas/export/exportArtifactMarkdown";
import type { CanvasArtifactRow } from "@/features/canvas/services/canvasArtifactService";

function dataOf(row: CanvasArtifactRow): unknown {
  const c = row.content as { data?: unknown } | string | null | undefined;
  if (c && typeof c === "object" && "data" in c) return c.data ?? "";
  return c ?? "";
}

/** The stored body as text — what restore saves (data: `__kind` kept). */
export function versionText(row: CanvasArtifactRow): string {
  const data = dataOf(row);
  return typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

/** The body as a person reads it: a kind (value or text) becomes its markdown. */
export function versionReadableText(row: CanvasArtifactRow): string {
  const data = dataOf(row);
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const record = data as Record<string, unknown>;
    if (typeof record.__kind === "string") return kindValueToMarkdown(record);
  }
  return kindTextToMarkdown(versionText(row));
}

export function ArtifactVersionBody({ row }: { row: CanvasArtifactRow }) {
  const [showJson, setShowJson] = useState(false);
  const data = dataOf(row);
  const text = versionText(row);
  // `hasKindKey` is the one detector (a kind at any depth, escaped spellings too).
  const holdsKind = hasKindKey(text);
  const rawPre = (
    <pre
      data-kind-source={holdsKind ? "explicit" : undefined}
      className="max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/80"
    >
      {text.slice(0, 4000)}
    </pre>
  );
  // Kindless bodies (code, html, plain JSON) keep their plain view.
  if (!holdsKind) return <div className="px-3 pb-3 pt-1">{rawPre}</div>;
  const structured = data !== null && typeof data === "object";
  return (
    <div className="px-3 pb-3 pt-1">
      <button
        type="button"
        onClick={() => setShowJson((v) => !v)}
        className="mb-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-background hover:text-foreground"
      >
        {showJson ? "View answer" : "View JSON"}
      </button>
      {showJson ? (
        rawPre
      ) : (
        <div className="max-h-40 overflow-auto text-[11px] leading-relaxed text-foreground/80">
          <AnswerValueView
            value={structured ? data : undefined}
            text={structured ? undefined : text}
          />
        </div>
      )}
    </div>
  );
}
