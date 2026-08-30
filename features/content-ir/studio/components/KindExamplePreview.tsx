"use client";

/**
 * KindExamplePreview — the shared example-preview engine: cycle a kind's
 * `kind_example` rows and render the current one through EVERY real render
 * path (`KindRenderPaths`). One engine for the user studio and the admin
 * detail page; callers own only the empty-state copy.
 *
 * 🚨 IT USED TO CHEAT (fixed 2026-08-29). This component handed the stored
 * example straight to `KindInstanceRender` as a JavaScript object: no text was
 * produced, nothing had to recognize the shape, and no routing decision was
 * made. It was therefore structurally incapable of failing the way production
 * fails — and on 2026-08-29 it showed a flawless
 * `electronics_intake_analysis` while that same kind rendered as a key/value
 * dump in every chat. A preview that cannot fail is not a preview.
 *
 * The direct-object render is still HERE, because panels and instance pages
 * genuinely use it — but as one honestly-labelled path among the streaming
 * ones, never as "the preview".
 *
 * The render TEMPLATE moved out (Arman: it does not belong under Preview). It
 * lives on its own tab beside the schema.
 */

import { useState, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import KindRenderPaths from "@/features/content-ir/render-paths/KindRenderPaths";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import type { ExamplesState } from "@/features/content-ir/studio/kind-examples";
import {
  emitPayloadFence,
  emitPayloadJson,
} from "@ai-matrx/content-ir";

interface KindExamplePreviewProps {
  kind: string;
  examples: ExamplesState;
  /** Rendered when the kind has zero examples — caller owns the copy. */
  emptyState: ReactNode;
  /** Show the "rendered through the production path" footnote (admin). */
  showPathFootnote?: boolean;
}

export default function KindExamplePreview({
  kind,
  examples,
  emptyState,
  showPathFootnote = false,
}: KindExamplePreviewProps) {
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState<"json" | "fence" | null>(null);

  async function copy(kind: string, data: unknown, mode: "json" | "fence") {
    const text =
      mode === "fence" ? emitPayloadFence(kind, data) : emitPayloadJson(kind, data);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(mode);
      toast.success(
        mode === "fence"
          ? "Render block copied — paste it into a chat to see it live"
          : "Render payload copied (with __kind)",
      );
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  if (examples.status === "loading") {
    return (
      <div className="flex items-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading examples</span>
      </div>
    );
  }

  if (examples.status === "error") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
        <CircleAlert className="h-4 w-4 shrink-0" />
        {examples.message}
      </div>
    );
  }

  const rows = examples.rows;
  if (rows.length === 0) {
    return <>{emptyState}</>;
  }

  const current = rows[Math.min(index, rows.length - 1)];

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      {/* Example cycler */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index <= 0}
          className="rounded border border-border p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          aria-label="Previous example"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(rows.length - 1, i + 1))}
          disabled={index >= rows.length - 1}
          className="rounded border border-border p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          aria-label="Next example"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted-foreground">
          example {Math.min(index + 1, rows.length)} / {rows.length}
        </span>
        {current.isCanonical && (
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            canonical
          </span>
        )}
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {current.source}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
            current.validationStatus === "passed"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
          }`}
        >
          {current.validationStatus}
        </span>
        {current.label && (
          <span className="text-xs text-muted-foreground">{current.label}</span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          kind v{current.kindVersion} · {current.updatedAt.slice(0, 10)}
        </span>
      </div>

      {/* Every real render path, one mode each. */}
      <KindRenderPaths
        kind={kind}
        value={current.data as Record<string, unknown>}
      />

    </div>
  );
}
