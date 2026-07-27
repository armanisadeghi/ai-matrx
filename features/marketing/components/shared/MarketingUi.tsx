import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  Loader2,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CopyButtons,
  type CopyButtonsProps,
} from "@/components/agent-copy/CopyButtons";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";
import type { Json } from "@/types/database.types";
import { isJsonRecord } from "@/features/marketing/types";
import type { BackendFailureExplanation } from "@/lib/api/errors";

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatCompactDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDuration(
  start: string | null,
  end: string | null,
): string {
  if (!start) return "—";
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "—";
  const seconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function displayScore(score: number | null): string {
  return score === null ? "—" : String(Math.round(score));
}

export function statusBadgeVariant(
  status: string,
): "success" | "warning" | "destructive" | "secondary" | "outline" {
  if (["active", "complete", "completed", "pass", "fetched"].includes(status)) {
    return "success";
  }
  if (
    [
      "queued",
      "running",
      "processing",
      "partial",
      "warn",
      "warning",
      "missing",
    ].includes(status)
  ) {
    return "warning";
  }
  if (["failed", "error", "gone", "critical"].includes(status)) {
    return "destructive";
  }
  return status ? "secondary" : "outline";
}

export function StatusBadge({ value }: { value: string | null }) {
  const label = value || "unknown";
  return (
    <Badge
      variant={statusBadgeVariant(label)}
      className="whitespace-nowrap capitalize"
    >
      {label.replaceAll("_", " ")}
    </Badge>
  );
}

export function QueryError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center p-6">
      <div className="max-w-lg rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Could not load this data
            </p>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              {extractErrorMessage(error)}
            </p>
            {onRetry ? (
              <Button
                className="mt-3 h-7"
                size="sm"
                variant="outline"
                onClick={onRetry}
              >
                Retry
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoadingSurface({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function MetricCell({
  label,
  value,
  detail,
  tone = "default",
  icon,
  variant = "strip",
  anchor,
  href,
  copy,
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "default" | "good" | "warning" | "bad";
  icon?: React.ReactNode;
  variant?: "strip" | "card";
  /** Surface value name — rendered as `data-surface-value` (locate-on-page). */
  anchor?: string;
  /** Turns the whole cell into a navigation card — the KPI IS the link. */
  href?: string;
  /**
   * Hover-revealed xs Copy / Copy-for-AI pair for this KPI. Build with
   * `webCopy` from `features/marketing/lib/copy-payloads`. Not shown when
   * `href` is set (the cell is itself a navigation link).
   */
  copy?: Pick<CopyButtonsProps, "label" | "human" | "agent">;
}) {
  const className = cn(
    "group/metric relative min-w-0",
    variant === "strip"
      ? "border-r border-border/70 px-3 py-2 last:border-r-0"
      : "rounded-xl border border-border/70 bg-gradient-to-br from-card to-muted/40 p-3 shadow-sm",
    href &&
      "group block transition-colors hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );
  const body = (
    <>
      <div className="flex items-center gap-2">
        {icon ? (
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
              tone === "good" &&
                "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
              tone === "warning" &&
                "bg-amber-500/10 text-amber-600 dark:text-amber-400",
              tone === "bad" && "bg-destructive/10 text-destructive",
            )}
          >
            {icon}
          </span>
        ) : null}
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {href ? (
          <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
        ) : null}
      </div>
      <p
        className={cn(
          "truncate font-semibold tabular-nums text-foreground",
          variant === "card"
            ? "mt-2 text-2xl tracking-tight"
            : "mt-0.5 text-xl",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "warning" && "text-amber-600 dark:text-amber-400",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </p>
      {detail ? (
        <p
          className={cn(
            "truncate text-[11px] text-muted-foreground",
            variant === "card" && "mt-0.5",
          )}
        >
          {detail}
        </p>
      ) : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} data-surface-value={anchor} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <div data-surface-value={anchor} className={className}>
      {body}
      {copy ? (
        <span className="absolute right-1 top-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/metric:opacity-100">
          <CopyButtons size="xs" {...copy} />
        </span>
      ) : null}
    </div>
  );
}

export function CondensedFieldGrid({
  fields,
}: {
  fields: Array<{
    label: string;
    value: React.ReactNode;
    span?: 1 | 2;
    tone?: "default" | "good" | "warning" | "bad";
  }>;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
      {fields.map((field) => (
        <div
          key={field.label}
          className={cn("min-w-0", field.span === 2 && "col-span-2")}
        >
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {field.label}
          </dt>
          <dd
            className={cn(
              "mt-0.5 break-words font-medium text-foreground",
              field.tone === "good" && "text-emerald-600 dark:text-emerald-400",
              field.tone === "warning" && "text-amber-600 dark:text-amber-400",
              field.tone === "bad" && "text-destructive",
            )}
          >
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SectionCard({
  title,
  action,
  headerExtra,
  copy,
  children,
  className,
  collapsible = false,
  defaultOpen = true,
  anchor,
}: {
  title: string;
  /** Link action (`href`) or in-place action (`onClick`). */
  action?:
    { label: string; href: string } | { label: string; onClick: () => void };
  /** Free-form right-side header content (icon buttons, toggles). Renders before `action`. */
  headerExtra?: React.ReactNode;
  /**
   * Copy + Copy-for-AI pair for this card (agent-copy doctrine: every section
   * is copyable). Build with `webCopy` from `features/marketing/lib/copy-payloads`.
   */
  copy?: Pick<CopyButtonsProps, "label" | "human" | "agent">;
  children: React.ReactNode;
  className?: string;
  /** Adds a compact disclosure control without changing existing callers. */
  collapsible?: boolean;
  /** Initial disclosure state when `collapsible` is enabled. */
  defaultOpen?: boolean;
  /** Surface value name — rendered as `data-surface-value` (locate-on-page). */
  anchor?: string;
}) {
  const content = collapsible ? (
    <CollapsibleContent>{children}</CollapsibleContent>
  ) : (
    children
  );
  const card = (
    <section
      data-surface-value={anchor}
      className={cn(
        "min-w-0 rounded-lg border border-border bg-card",
        collapsible && "self-start",
        className,
      )}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {copy ? <CopyButtons size="icon" {...copy} /> : null}
          {headerExtra}
          {action && "href" in action ? (
            <Link
              href={action.href}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary"
            >
              {action.label}
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : action ? (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary"
            >
              {action.label}
              <Plus className="h-3 w-3" />
            </button>
          ) : null}
          {collapsible ? (
            <CollapsibleTrigger asChild>
              <button
                type="button"
                aria-label={`Toggle ${title}`}
                title={`Toggle ${title}`}
                className="group flex h-6 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=closed]:-rotate-90" />
              </button>
            </CollapsibleTrigger>
          ) : null}
        </div>
      </div>
      {content}
    </section>
  );

  if (collapsible) {
    return (
      <Collapsible defaultOpen={defaultOpen} className="min-w-0 self-start">
        {card}
      </Collapsible>
    );
  }
  return card;
}

export function JsonPreview({ value }: { value: Json }) {
  const empty =
    value === null ||
    (Array.isArray(value) && value.length === 0) ||
    (isJsonRecord(value) && Object.keys(value).length === 0);
  if (empty)
    return (
      <p className="p-3 text-xs text-muted-foreground">No data recorded.</p>
    );
  return (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5 text-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function BackendFailureDetails({
  failure,
  label = "Last operation failed",
}: {
  failure: BackendFailureExplanation;
  label?: string;
}) {
  return (
    <div className="rounded-sm border border-destructive/40 bg-destructive/5 p-1.5">
      <p className="text-[10px] font-medium text-destructive">
        {label}: {failure.headline}
      </p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        {(
          [
            ["Cause", failure.cause],
            ["Error code", failure.code],
            ["Request id", failure.requestId || "not reported"],
            ["HTTP status", failure.status ? String(failure.status) : "—"],
          ] as Array<[string, string]>
        ).map(([fieldLabel, value]) => (
          <div key={fieldLabel} className="col-span-2 grid grid-cols-subgrid">
            <dt className="text-[10px] text-muted-foreground">{fieldLabel}</dt>
            <dd className="break-words font-mono text-[10px] text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {failure.chain.length > 1 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
            Full service chain ({failure.chain.length} layers)
          </summary>
          <ol className="mt-1 space-y-0.5">
            {failure.chain.map((entry, index) => (
              <li
                key={`${index}:${entry.slice(0, 24)}`}
                className="break-words font-mono text-[10px] text-muted-foreground"
              >
                {index + 1}. {entry}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

export function jsonNumber(value: Json, keys: string[]): number {
  if (!isJsonRecord(value)) return 0;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate))
      return candidate;
  }
  return 0;
}

export function jsonNumberPath(value: Json, path: string[]): number {
  let current: Json = value;
  for (const segment of path) {
    if (!isJsonRecord(current)) return 0;
    const next = current[segment];
    if (next === undefined) return 0;
    current = next;
  }
  return typeof current === "number" && Number.isFinite(current) ? current : 0;
}

export function jsonString(value: Json, key: string): string | null {
  if (!isJsonRecord(value)) return null;
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
}
