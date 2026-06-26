"use client";

/**
 * DiffBlock — the in-chat render block for ```diff fences.
 *
 * A JSON spec { old, new, title?, split? } renders as a before/after diff
 * (added/removed lines highlighted, split or unified). Great for showing edits,
 * refactors, or revisions. Light shell: the diff lib is isolated in DiffCanvas,
 * loaded ONLY via `next/dynamic ssr:false`.
 */

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Columns2, Copy, GitCompareArrows, Rows3, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DiffSpec {
  title?: string;
  oldValue: string;
  newValue: string;
  split: boolean;
}

const DiffCanvas = dynamic(() => import("./DiffCanvas"), {
  ssr: false,
  loading: () => <Skeleton className="h-40 w-full" />,
});

export interface DiffBlockProps {
  content?: string;
  isStreamActive?: boolean;
  className?: string;
}

function str(v: unknown): string {
  return v == null ? "" : typeof v === "string" ? v : String(v);
}

function parseDiff(raw: string): DiffSpec | { error: string } {
  let s = raw.trim();
  const fenced = /^```(?:json|diff)?\s*\n([\s\S]*?)\n?```$/.exec(s);
  if (fenced) s = fenced[1].trim();
  let obj: unknown;
  try {
    obj = JSON.parse(s);
  } catch {
    try {
      obj = JSON.parse(s.replace(/,(\s*[}\]])/g, "$1"));
    } catch {
      return { error: "Diff needs a JSON object with `old` and `new` strings." };
    }
  }
  if (!obj || typeof obj !== "object") return { error: "Diff needs a JSON object with `old` and `new`." };
  const o = obj as Record<string, unknown>;
  const oldValue = str(o.old ?? o.before ?? o.original ?? o.left);
  const newValue = str(o.new ?? o.after ?? o.updated ?? o.modified ?? o.right);
  if (!oldValue && !newValue) return { error: "Diff needs at least one of `old` / `new`." };
  return {
    title: typeof o.title === "string" ? o.title : undefined,
    oldValue,
    newValue,
    split: o.split !== false,
  };
}

export const DiffBlock: React.FC<DiffBlockProps> = ({ content = "", isStreamActive = false, className }) => {
  const parsed = useMemo(() => (isStreamActive ? null : parseDiff(content)), [content, isStreamActive]);
  const spec = parsed && !("error" in parsed) ? parsed : null;
  const error = parsed && "error" in parsed ? parsed.error : null;
  const [copied, setCopied] = useState(false);
  const [split, setSplit] = useState<boolean | null>(null);
  const effectiveSplit = split ?? spec?.split ?? true;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <div className={cn("my-3 overflow-hidden rounded-lg border border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <GitCompareArrows className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-sm font-medium text-foreground">{spec?.title ?? "Changes"}</span>
          {isStreamActive && <span className="shrink-0 animate-pulse text-xs text-muted-foreground">…</span>}
        </div>
        {!isStreamActive && spec && (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-label={effectiveSplit ? "Unified view" : "Split view"}
              title={effectiveSplit ? "Unified view" : "Split view"}
              onClick={() => setSplit(!effectiveSplit)}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              {effectiveSplit ? <Rows3 className="h-3.5 w-3.5" /> : <Columns2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              aria-label={copied ? "Copied" : "Copy source"}
              title={copied ? "Copied" : "Copy source"}
              onClick={handleCopy}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </div>
      <div className="max-h-[60vh] overflow-auto">
        {isStreamActive ? (
          <div className="p-3">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <div className="m-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : spec ? (
          <DiffCanvas oldValue={spec.oldValue} newValue={spec.newValue} split={effectiveSplit} />
        ) : null}
      </div>
    </div>
  );
};

export default DiffBlock;
