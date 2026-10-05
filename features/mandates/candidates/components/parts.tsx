"use client";

/**
 * Small shared pieces of the candidate record bodies (pair + summary).
 */

import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import { Cost } from "@/components/cost/Cost";
import { formatCount, formatDurationMs } from "@ai-matrx/kit/format";

export function Chip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 type-meta font-medium leading-none",
        className ?? "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** One quiet line — an honest state, never a paragraph. */
export function StateLine({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "warn";
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "rounded-md px-2.5 py-1.5 type-secondary",
        tone === "muted" && "bg-muted/60 text-muted-foreground",
        tone === "warn" && "bg-amber-500/10 text-amber-800 dark:text-amber-300",
      )}
    >
      {children}
    </p>
  );
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Cost · duration · tokens for one side, from the recorded metrics. */
export function MetricsLine({ metrics }: { metrics: Record<string, unknown> | null | undefined }) {
  const m = metrics ?? {};
  const duration = num(m.duration_ms);
  const tokensIn = num(m.tokens_in);
  const tokensOut = num(m.tokens_out);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-secondary text-muted-foreground tabular-nums">
      <span title="Cost">
        <Cost usd={num(m.cost_usd)} short />
      </span>
      <span title="Duration">{duration == null ? "—" : formatDurationMs(duration)}</span>
      <span title="Tokens in / out">
        {tokensIn == null && tokensOut == null
          ? "— tokens"
          : `${formatCount(tokensIn)} in · ${formatCount(tokensOut)} out`}
      </span>
    </div>
  );
}

/** A plain new-tab link to a record's own page. */
export function NewTabLink({ href, label = "Open in new tab" }: { href: string; label?: string }) {
  const absolute = typeof window === "undefined" ? href : new URL(href, window.location.origin).toString();
  return (
    <a
      href={absolute}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-7 items-center gap-1 rounded-md px-2 type-secondary text-muted-foreground hover:bg-accent hover:text-foreground pointer-coarse:h-10"
      data-candidate-new-tab
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

export function detailPageHref(type: string, id: string): string {
  return `/detail/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
}

/** Pretty JSON for a value that is data, not prose. */
export function JsonBlock({ value, className }: { value: unknown; className?: string }) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? "—";
  } catch {
    text = String(value);
  }
  return (
    <pre /* rich-content-exempt: debug or inspector output: logs, JSON, code or source view */
      className={cn(
        "max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 font-mono type-meta leading-snug",
        className,
      )}
    >
      {text}
    </pre>
  );
}
