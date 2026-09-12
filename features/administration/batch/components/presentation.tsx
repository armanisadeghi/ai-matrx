"use client";

/**
 * Shared vocabulary for the Batch admin surface: money, time, and the two
 * badges that carry the system's meaning (lifecycle status, delivery outcome).
 *
 * Kept in one place because the SAME words must appear identically in the
 * tiles, the filter chips, the tables and the expanded rows — a queue where
 * "dead" reads one way in a chip and another way in a row is a lying screen.
 */
import { Badge } from "@/components/ui/badge";
import { formatDurationMs, formatRelativeTime } from "@ai-matrx/kit/format";
import { cn } from "@/lib/utils";

export function fmtUsd(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(digits)}`;
}

export function fmtPct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function fmtInt(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

/**
 * THE relative-time voice: @ai-matrx/kit/format owns "3m". Bare on purpose —
 * the column header is "Age", so " ago" on every row is a word per row that
 * says nothing the header has not.
 */
export function fmtAge(iso: string | null | undefined): string {
  return formatRelativeTime(iso, { style: "short" }).replace(/ ago$/, "");
}

export function fmtStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function fmtSpan(
  fromIso: string | null | undefined,
  toIso: string | null | undefined,
): string {
  if (!fromIso || !toIso) return "—";
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return "—";
  // THE compact duration voice (@ai-matrx/kit/format): 250ms, 5.2s, 5m 30s.
  return formatDurationMs(b - a, { style: "compact" });
}

// ---------------------------------------------------------------------------
// Status — the lifecycle the DB trigger enforces
// ---------------------------------------------------------------------------

const STATUS_CLASS: Record<string, string> = {
  pending: "border-border bg-muted text-muted-foreground",
  claimed: "border-info/30 bg-info/10 text-info",
  submitted: "border-info/40 bg-info/15 text-info",
  completed: "border-success/30 bg-success/10 text-success",
  failed: "border-warning/40 bg-warning/10 text-warning",
  dead_letter: "border-destructive/40 bg-destructive/10 text-destructive",
  abandoned: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 rounded px-1.5 font-mono text-[11px] font-medium",
        STATUS_CLASS[status] ?? "border-border bg-muted text-muted-foreground",
      )}
    >
      {status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Delivery — `handler_status`, the queue's yield signal
// ---------------------------------------------------------------------------

/** Label + meaning for every `handler_status`, including NULL. */
export const DELIVERY: Record<
  string,
  { label: string; hint: string; className: string }
> = {
  none: {
    label: "not dispatched",
    hint: "No result handler has been asked to deliver this answer yet.",
    className: "border-border bg-muted text-muted-foreground",
  },
  dispatched: {
    label: "delivering",
    hint: "A result handler is running; the answer has not landed yet.",
    className: "border-info/40 bg-info/10 text-info",
  },
  succeeded: {
    label: "delivered",
    hint: "The answer reached the consumer that ordered it.",
    className: "border-success/30 bg-success/10 text-success",
  },
  failed: {
    label: "retrying",
    hint: "The handler raised; the queue will try again.",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  dead: {
    label: "never delivered",
    hint: "Dead-lettered after the handler's last attempt. Tokens were bought and nothing was delivered.",
    className: "border-destructive/50 bg-destructive/15 text-destructive font-semibold",
  },
};

export function deliveryOf(handlerStatus: string | null) {
  const key = handlerStatus === null || handlerStatus === "" ? "none" : handlerStatus;
  return (
    DELIVERY[key] ?? {
      label: key,
      // An unconstrained column can carry a value nobody taught this screen.
      hint: "Unrecognised handler_status — this screen does not know whether it means delivered or lost.",
      className: "border-warning/50 bg-warning/10 text-warning",
    }
  );
}

export function DeliveryBadge({ handlerStatus }: { handlerStatus: string | null }) {
  const d = deliveryOf(handlerStatus);
  return (
    <Badge
      variant="outline"
      className={cn("h-5 rounded px-1.5 text-[11px]", d.className)}
      title={d.hint}
    >
      {d.label}
    </Badge>
  );
}

/**
 * Actual vs live-equivalent, with the discount stated rather than implied.
 *
 * `settled` is false while the provider has not billed the row yet (a pending
 * or in-flight item). Printing `$0.0000 -100%` there would read as a measured
 * total discount; the honest cell says nothing has been billed and shows only
 * the live estimate the discount will be measured against.
 */
export function CostCell({
  actual,
  estLive,
  settled = true,
}: {
  actual: number;
  estLive: number;
  settled?: boolean;
}) {
  const saved = estLive - actual;
  const pct = estLive > 0 ? (saved / estLive) * 100 : null;
  if (!settled) {
    return (
      <div className="leading-tight">
        <div className="text-xs text-muted-foreground">not billed yet</div>
        <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {estLive > 0 ? `live ${fmtUsd(estLive)}` : "live —"}
        </div>
      </div>
    );
  }
  return (
    <div className="leading-tight">
      <div className="font-mono text-xs tabular-nums text-foreground">
        {fmtUsd(actual)}
      </div>
      <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
        {estLive > 0 ? `live ${fmtUsd(estLive)}` : "live —"}
        {pct !== null && saved > 0 ? (
          <span className="ml-1 text-success">-{pct.toFixed(0)}%</span>
        ) : null}
      </div>
    </div>
  );
}
