"use client";

/**
 * Preview tab — renders the kind's live `kind_example` rows through the REAL
 * production path, never a lookalike: the example's zero-loss value object is
 * wrapped by the same complete-envelope assembler the splitter/rehydration
 * use (`envelopeFromCompleteValue`), placed on a raw render block's
 * `metadata.__ir`, and handed to the production `SafeBlockRenderer` — whose
 * `BlockRenderer` runs `applyIrKindRoute` exactly as it does for streamed
 * chat content. If the kind has no registered component/bridge, the block
 * stays a generic code block — shown honestly, never faked.
 *
 * SafeBlockRenderer already owns the `ssr:false` dynamic boundary for the
 * heavy renderer; this shell is light on purpose (no second boundary).
 */

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Info,
  Loader2,
} from "lucide-react";
import { SafeBlockRenderer } from "@/components/mardown-display/chat-markdown/internal-handlers/SafeBlockRenderer";
import type { RenderBlock } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { envelopeFromCompleteValue } from "@/features/content-ir/core/normalize";
import { IR_ENVELOPE_KEY } from "@/features/content-ir/core/ir-types";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import type { KindExampleListItem } from "@/features/content-ir/admin/kind-detail-types";
import type { ExamplesState } from "@/features/content-ir/admin/KindDetailClient";

const noopReplaceBlockContent = (_original: string, _replacement: string) => {};
const noopOpenEditor = () => {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface KindPreviewTabProps {
  kind: string;
  examples: ExamplesState;
}

export default function KindPreviewTab({ kind, examples }: KindPreviewTabProps) {
  const [index, setIndex] = useState(0);

  if (examples.status === "loading") {
    return (
      <div className="flex items-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading kind_example rows</span>
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
    return (
      <div className="rounded-md border border-border bg-card px-4 py-8 text-center">
        <p className="text-sm font-medium text-foreground">
          No examples for this kind yet.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Author a canonical <code className="font-mono">kind_example</code> row
          (R4) — nothing renders here until a real sample exists.
        </p>
      </div>
    );
  }

  const current = rows[Math.min(index, rows.length - 1)];
  const definition = kindRegistry.getDefinition(kind);
  const routable = Boolean(definition?.legacyBlockType);
  const valueIsRecord = isRecord(current.data);

  const block: RenderBlock | null = valueIsRecord
    ? {
        type: "code",
        content: JSON.stringify(current.data, null, 2),
        language: "json",
        metadata: {
          [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(
            current.data as Record<string, unknown>,
            kind,
          ),
        },
      }
    : null;

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

      {/* Honest routing state */}
      {!routable && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Renders via the generic viewer — no component/bridge registered for
          this kind, so <code className="font-mono">applyIrKindRoute</code>{" "}
          leaves the block untouched. What you see below is exactly what
          production shows.
        </div>
      )}

      {/* The real render path */}
      {block ? (
        <div className="rounded-md border border-border bg-card p-3">
          <SafeBlockRenderer
            block={block}
            index={0}
            replaceBlockContent={noopReplaceBlockContent}
            handleOpenEditor={noopOpenEditor}
          />
        </div>
      ) : (
        <div className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" />
            This example&apos;s data is a JSON scalar/array (workflow I/O kind) —
            there is no block render path for it; raw value below.
          </div>
          <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 font-mono text-xs text-foreground">
            {JSON.stringify(current.data, null, 2)}
          </pre>
        </div>
      )}

      {/* Raw example data */}
      <details className="rounded-md border border-border bg-card">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
          Raw example data (kind_example.data)
        </summary>
        <pre className="overflow-x-auto border-t border-border p-3 font-mono text-xs text-foreground">
          {JSON.stringify(current.data, null, 2)}
        </pre>
      </details>

      <p className="text-[11px] text-muted-foreground">
        Rendered through the production path: complete envelope
        (envelopeFromCompleteValue) on metadata.__ir → BlockRenderer →
        applyIrKindRoute
        {routable && definition?.legacyBlockType
          ? ` → "${definition.legacyBlockType}"`
          : ""}
        .
      </p>
    </div>
  );
}
