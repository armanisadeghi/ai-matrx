"use client";

// components/official/structured-value/AnswerValueView.tsx
//
// THE ONE VIEW OF A SETTLED ANSWER — whatever a run handed back (an agent, a
// mandate, a workflow, a test bench), drawn by the platform's real renderers
// and never as a JSON dump (Arman, 2026-09-25: results always in the canonical
// viewer, never raw).
//
//   structured value + kind → the kind's own component (`KindInstanceRender`),
//                             whose floor is `StructuredValueView`. The kind is
//                             the caller's, else the value's own `__kind`.
//   structured value         → `StructuredValueView`;
//   text that is a file URL  → `InlineMediaRef` (durable file id, never the URL);
//   text                     → `MarkdownStream` (settled content).
//
// A surface with too little room bounds this in a scroll box and hands the
// whole answer to `structuredValueWindow` (`useOpenStructuredValueWindow`),
// which renders through this same view.

import { KIND_KEY } from "@ai-matrx/content-ir";
import { InlineMediaRef } from "@ai-matrx/media/react";
import MarkdownStream from "@/components/MarkdownStream";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import {
  StructuredValueView,
  type StructuredValueDensity,
} from "@/components/official/structured-value/StructuredValueView";
import { fileIdFromUserFilesUrl } from "@/lib/media/durability";

/** The kind a structured value claims for itself, when it carries one. */
export function kindOfValue(value: unknown): string | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const kind = (value as Record<string, unknown>)[KIND_KEY];
  return typeof kind === "string" && kind.trim() ? kind : null;
}

export interface AnswerValueViewProps {
  /** The structured answer, when there is one. Wins over `text`. */
  value?: unknown;
  /** The text answer. */
  text?: string | null;
  /** The kind the answer is declared as. Default: the value's own `__kind`. */
  kind?: string | null;
  /** Density for the structured floor. */
  density?: StructuredValueDensity;
  /** What an empty answer says. */
  emptyText?: string;
}

export function AnswerValueView({
  value,
  text,
  kind,
  density,
  emptyText = "The run finished with an empty answer.",
}: AnswerValueViewProps) {
  if (value != null && typeof value === "object") {
    const routeKind = kind ?? kindOfValue(value);
    return routeKind ? (
      <KindInstanceRender
        kind={routeKind}
        value={value}
        showRoutingNote={false}
        variant="bare"
        unroutableFallback={
          <StructuredValueView value={value} kind={routeKind} density={density} />
        }
      />
    ) : (
      <StructuredValueView value={value} density={density} />
    );
  }
  const shown = (typeof value === "string" ? value : (text ?? "")).trim();
  const fileId = shown ? fileIdFromUserFilesUrl(shown) : null;
  if (fileId) return <InlineMediaRef ref={fileId} size="xl" fit="cover" />;
  if (!shown) {
    if (value != null) return <StructuredValueView value={value} density={density} />;
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return <MarkdownStream imagePolicy="ai" content={shown} hideCopyButton={false} />;
}
