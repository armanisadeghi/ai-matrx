import { CheckCircle, XCircle, Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { pctOf } from "./metrics";

/**
 * Shared SERP validation chrome — the char/pixel progress bars, the
 * desktop/mobile device checks, and the compact metric chips.
 *
 * Used everywhere a meta title/description is scored: the calculator page's
 * Analysis panel, the SEO tool overlay's per-result detail, and the inline
 * tool stacks. Semantic color tokens only (no raw green/orange), so it tracks
 * the theme. Purely presentational.
 */

export interface SerpFieldMetrics {
  label: string;
  chars: number;
  charLimit: number;
  pixels: number;
  pixelLimit: number;
  ok: boolean;
  desktopOk?: boolean;
  mobileOk?: boolean;
}

function barTone(pct: number): string {
  if (pct >= 100) return "bg-destructive";
  if (pct >= 85) return "bg-warning";
  return "bg-success";
}

function textTone(pct: number): string {
  if (pct >= 100) return "text-destructive";
  if (pct >= 85) return "text-warning";
  return "text-success";
}

function ProgressBar({
  pct,
  label,
  detail,
}: {
  pct: number;
  label: string;
  detail: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className={cn("font-medium", textTone(pct))}>{detail}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-300", barTone(pct))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SerpDeviceCheck({
  device,
  ok,
}: {
  device: "desktop" | "mobile";
  ok: boolean;
}) {
  const Icon = device === "desktop" ? Monitor : Smartphone;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs capitalize text-foreground">{device}</span>
      <span className="ml-auto">
        {ok ? (
          <CheckCircle className="h-4 w-4 text-success" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
      </span>
    </div>
  );
}

/** Full bars + device checks for one field (title or description). */
export function SerpFieldBars({ field }: { field: SerpFieldMetrics }) {
  const charPct = pctOf(field.chars, field.charLimit);
  const pixelPct = pctOf(field.pixels, field.pixelLimit);
  return (
    <div className="space-y-3">
      <div className="flex items-center">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
          {field.label}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{field.pixels}px</span>
      </div>
      <ProgressBar
        pct={pixelPct}
        label={`Pixel width (${field.pixelLimit}px)`}
        detail={`${field.pixels}px`}
      />
      <ProgressBar
        pct={charPct}
        label={`Characters (${field.charLimit} limit)`}
        detail={`${field.chars}/${field.charLimit}`}
      />
      {field.desktopOk !== undefined || field.mobileOk !== undefined ? (
        <div className="grid grid-cols-2 gap-2">
          <SerpDeviceCheck device="desktop" ok={field.desktopOk ?? field.ok} />
          <SerpDeviceCheck device="mobile" ok={field.mobileOk ?? field.ok} />
        </div>
      ) : null}
    </div>
  );
}

/** Compact one-line metric chips, e.g. "54c · 312px". */
export function SerpFieldChips({
  chars,
  pixels,
  ok,
  prefix,
}: {
  chars: number;
  pixels: number;
  ok: boolean;
  prefix?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[11px]",
        ok ? "text-success" : "text-warning",
      )}
    >
      {prefix ? `${prefix} ` : ""}
      {chars}c · {pixels}px
    </span>
  );
}
