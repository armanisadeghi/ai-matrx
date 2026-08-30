"use client";

/**
 * The EMIT TEMPLATE — the wire shape an agent produces for this kind.
 *
 * Lifted out of the Preview tab (Arman, 2026-08-29: "there's no reason for the
 * template to be listed under preview because that doesn't make any sense").
 * It is not a preview of anything: it is the payload text, for pasting into a
 * prompt or a chat. It belongs beside the schema, which is what it is derived
 * from.
 *
 * Stored examples carry their own `__kind` (KINDS_EVERYWHERE_PLAN §4.2), so
 * for a well-formed row this IS the row — guaranteed marker-first. A legacy
 * value missing the marker is repaired on the way out rather than shown wrong.
 */

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "@/lib/toast";
import { emitPayloadFence, emitPayloadJson } from "@ai-matrx/content-ir";

export interface KindEmitTemplateProps {
  kind: string;
  value: unknown;
}

export default function KindEmitTemplate({
  kind,
  value,
}: KindEmitTemplateProps) {
  const [copied, setCopied] = useState<"json" | "fence" | null>(null);

  async function copy(mode: "json" | "fence") {
    const text =
      mode === "fence"
        ? emitPayloadFence(kind, value)
        : emitPayloadJson(kind, value);
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

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-foreground">
          Emit template
        </span>
        <span className="text-[11px] text-muted-foreground">
          what an agent puts on the wire — leads with{" "}
          <code className="rounded bg-muted px-1 py-0.5">&quot;__kind&quot;</code>
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => copy("json")}
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
            onClick={() => copy("fence")}
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
        {emitPayloadJson(kind, value)}
      </pre>
    </div>
  );
}
