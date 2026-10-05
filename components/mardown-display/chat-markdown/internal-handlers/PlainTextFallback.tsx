import React, { Suspense, lazy } from "react";
import { cn } from "@/styles/themes/utils";
import { MarkdownErrorBoundary } from "./MarkdownErrorBoundary";
import { findEmbeddedKindJsonRegions } from "@/features/content-ir/surfaces/embedded-kind-json";
import {
  firstKindSlug,
  hasKindKey,
  hasKindKeyAnySpelling,
  kindObjectProseBreak,
  normalizeKindSpellings,
} from "@/features/content-ir/surfaces/json-kind-signal";
import { kindTextToMarkdown } from "@/features/content-ir/surfaces/kind-text-to-markdown";
import { humanizeKind } from "@/features/content-ir/kinds/kind-markdown-utils";

// The kind door, lazily: this fallback is what renders when the engine has
// already crashed, so it must not pull the engine in eagerly (or cycle with it).
const KindInstanceRender = lazy(
  () => import("@/features/content-ir/studio/components/KindInstanceRender"),
);

interface PlainTextFallbackProps {
  requestId?: string;
  content: string;
  className?: string;
}

/** A fence marker line (```json, ```, ~~~) — chrome around a kind region. */
const FENCE_LINE = /^[ \t]*(`{3,}|~{3,})[^\n`]*$/gm;

type Piece =
  | { type: "text"; text: string }
  | { type: "kind"; kind: string; value: Record<string, unknown>; source: string }
  | { type: "broken"; kind: string | null };

function isKindObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).__kind === "string"
  );
}

/** Text between kind regions: fence chrome dropped; a kind it still holds
 * (truncated, so no region was found) becomes its "could not be read" state. */
function textPieces(text: string): Piece[] {
  const cleaned = text.replace(FENCE_LINE, "");
  if (!hasKindKey(cleaned)) return cleaned.trim() ? [{ type: "text", text: cleaned }] : [];
  const keyAt = cleaned.search(/"__kind"\s*:/);
  const objectAt = cleaned.lastIndexOf("{", keyAt);
  const before = cleaned.slice(0, objectAt < 0 ? keyAt : objectAt);
  const out: Piece[] = [];
  if (before.trim()) out.push({ type: "text", text: before });
  out.push({ type: "broken", kind: firstKindSlug(cleaned) });
  // Never past where the object broke into prose: the text after it stays (round 9).
  const proseBreak = objectAt < 0 ? null : kindObjectProseBreak(cleaned.slice(objectAt));
  if (proseBreak !== null) out.push(...textPieces(cleaned.slice(objectAt + proseBreak)));
  return out;
}

function piecesOf(content: string): Piece[] {
  const pieces: Piece[] = [];
  let cursor = 0;
  for (const region of findEmbeddedKindJsonRegions(content)) {
    let value: unknown = null;
    try {
      value = JSON.parse(region.content);
    } catch {
      value = null;
    }
    if (!isKindObject(value)) continue;
    pieces.push(...textPieces(content.slice(cursor, region.start)));
    pieces.push({ type: "kind", kind: value.__kind as string, value, source: region.content });
    cursor = region.end;
  }
  pieces.push(...textPieces(content.slice(cursor)));
  return pieces;
}

function ReadableText({ text }: { text: string }) {
  return <div /* rich-content-exempt: deliberate plain-text fallback for content that failed to render, or raw XML */ className="whitespace-pre-wrap break-words">{text}</div>;
}

// Fallback component that renders plain text with basic formatting.
// Hardcoded for the assistant-message rendering mode — `type` and `role`
// were removed as part of the MarkdownStream prop cleanup.
//
// A kind is never drawn as raw JSON, not even here (Arman, 2026-09-30): text
// carrying `__kind` renders each kind region through the kind door inside its
// OWN error boundary (the crash that brought us here cannot loop), falling to
// the kind's readable markdown if that throws too. Kindless text stays plain.
export const PlainTextFallback: React.FC<PlainTextFallbackProps> = ({
  requestId,
  content,
  className,
}) => {
  const containerStyles = cn(
    "py-3 px-4 space-y-2 font-sans text-md antialiased leading-relaxed tracking-wide whitespace-pre-wrap break-words overflow-x-hidden min-w-0",
    "block rounded-lg w-full bg-textured",
    className,
  );

  // Every realistic spelling of the key reads as the kind (round 9).
  if (!content || !hasKindKeyAnySpelling(content)) {
    return (
      <div className="mb-3 w-full min-w-0 text-left overflow-x-hidden">
        <div className={containerStyles}>{content || "No content available"}</div>
      </div>
    );
  }

  return (
    <div className="mb-3 w-full min-w-0 text-left overflow-x-hidden">
      <div className={cn(containerStyles, "whitespace-normal")}>
        {piecesOf(normalizeKindSpellings(content)).map((piece, i) => {
          if (piece.type === "text") return <ReadableText key={i} text={piece.text} />;
          if (piece.type === "broken") {
            return (
              <p key={i} className="text-sm text-muted-foreground" data-kind-fallback="broken">
                {piece.kind ? humanizeKind(piece.kind) : "This content"} could not be read
              </p>
            );
          }
          const readable = <ReadableText text={kindTextToMarkdown(piece.source)} />;
          return (
            <MarkdownErrorBoundary key={i} fallback={readable}>
              <Suspense fallback={readable}>
                <KindInstanceRender
                  kind={piece.kind}
                  value={piece.value}
                  showRoutingNote={false}
                  variant="bare"
                />
              </Suspense>
            </MarkdownErrorBoundary>
          );
        })}
      </div>
    </div>
  );
};
