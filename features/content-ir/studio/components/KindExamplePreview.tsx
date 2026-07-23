"use client";

/**
 * KindExamplePreview — the shared example-preview engine: cycle a kind's
 * `kind_example` rows and render the current one through the REAL production
 * path via `KindInstanceRender`. Extracted from the admin KindPreviewTab so
 * the user studio and the admin detail page consume ONE engine; callers own
 * only the empty-state copy (admin speaks R4/kind_example, the studio speaks
 * user language).
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
import KindInstanceRender, {
  kindIsRoutable,
} from "@/features/content-ir/studio/components/KindInstanceRender";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import type { ExamplesState } from "@/features/content-ir/studio/kind-examples";
import {
  emitPayloadFence,
  emitPayloadJson,
} from "@/features/content-ir/core/emit-payload";

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
  const routable = kindIsRoutable(kind);
  const definition = kindRegistry.getDefinition(kind);

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

      {/* The real render path */}
      <KindInstanceRender kind={kind} value={current.data} />

      {/* The render template — the emit shape WITH __kind, one-click copyable.
          This is the thing to paste into an agent prompt or a chat to see the
          component render; the stored example is source-shape (no __kind). */}
      <div className="rounded-md border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-xs font-medium text-foreground">
            Render template
          </span>
          <span className="text-[11px] text-muted-foreground">
            the emit shape — leads with{" "}
            <code className="rounded bg-muted px-1 py-0.5">&quot;__kind&quot;</code>
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => copy(kind, current.data, "json")}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {copied === "json" ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              Copy JSON
            </button>
            <button
              type="button"
              onClick={() => copy(kind, current.data, "fence")}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {copied === "fence" ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              Copy as ```json block
            </button>
          </div>
        </div>
        <pre className="overflow-x-auto p-3 font-mono text-xs text-foreground">
          {emitPayloadJson(kind, current.data)}
        </pre>
      </div>

      {showPathFootnote && (
        <p className="text-[11px] text-muted-foreground">
          Rendered through the production path: complete envelope
          (envelopeFromCompleteValue) on metadata.__ir → BlockRenderer →
          applyIrKindRoute
          {routable && definition?.legacyBlockType
            ? ` → "${definition.legacyBlockType}"`
            : ""}
          .
        </p>
      )}
    </div>
  );
}
