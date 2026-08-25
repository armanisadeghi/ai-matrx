"use client";

/**
 * KindHeaderBar — the standard compact header of a kind component:
 * icon · title (the instance's `title_key` value) · at-a-glance stats · the
 * copy bar (`CopyButtons`: Copy / Copy-for-AI / JSON / Export from builders
 * the caller supplies). One row that wraps on narrow widths; the copy bar
 * stays on the right. Contract: `components/kind-kit/README.md`.
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CopyButtons,
  type CopyButtonsProps,
} from "@/components/agent-copy/CopyButtons";
import {
  renderKindKitIcon,
  type KindKitIcon,
} from "@/components/kind-kit/icon-slot";

export interface KindHeaderStat {
  /** Short label, e.g. "keywords". */
  label: string;
  /** The number/text, e.g. 42 or "3 buckets". */
  value: React.ReactNode;
  /** Lucide component or an already-created icon element. */
  icon?: KindKitIcon;
  /** Optional hover text. */
  title?: string;
}

export interface KindHeaderBarProps {
  /** The instance title (usually `data[title_key]`). */
  title: React.ReactNode;
  /** Lucide component or an already-created icon element. */
  icon?: KindKitIcon;
  /** Small muted line under the title (a primary keyword, a subtitle). */
  subtitle?: React.ReactNode;
  /** At-a-glance numbers rendered as compact "value label" stats. */
  stats?: KindHeaderStat[];
  /** Shows a spinner + "Streaming" while the instance is still arriving. */
  streaming?: boolean;
  /** Word shown beside the spinner. Default "Streaming". */
  streamingLabel?: string;
  /**
   * The copy bar. Pass the builders you have — `human` (text), `agent`
   * (payload or string), `json` (raw record), `export` (download items) and
   * the `label` used in toasts. Omit to render no copy bar.
   */
  copy?: Omit<CopyButtonsProps, "size" | "className">;
  /** Extra controls rendered between the stats and the copy bar. */
  actions?: React.ReactNode;
  /** "sm" (default) for in-chat blocks; "md" for page-level kind surfaces. */
  size?: "sm" | "md";
  className?: string;
}

export function KindHeaderBar({
  title,
  icon,
  subtitle,
  stats,
  streaming = false,
  streamingLabel = "Streaming",
  copy,
  actions,
  size = "sm",
  className,
}: KindHeaderBarProps) {
  const titleCls = size === "md" ? "text-base" : "text-sm";
  const iconCls = size === "md" ? "h-5 w-5" : "h-4 w-4";
  const iconNode = renderKindKitIcon(
    icon,
    cn("mt-0.5 shrink-0 text-primary", iconCls),
  );
  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", className)}
    >
      <div className="flex min-w-0 flex-1 basis-48 items-start gap-2">
        {iconNode}
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "font-semibold leading-tight text-foreground break-words",
              titleCls,
            )}
          >
            {title}
          </div>
          {subtitle !== undefined && subtitle !== null && subtitle !== "" && (
            <div className="mt-0.5 text-xs leading-snug text-muted-foreground break-words">
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {stats && stats.length > 0 && (
        <dl className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {stats.map((s, i) => (
            <div
              key={`${i}-${s.label}`}
              title={s.title}
              className="flex items-baseline gap-1 text-xs"
            >
              {renderKindKitIcon(
                s.icon,
                "h-3 w-3 self-center text-muted-foreground",
              )}
              <dd className="font-semibold tabular-nums text-foreground">
                {s.value}
              </dd>
              <dt className="text-muted-foreground">{s.label}</dt>
            </div>
          ))}
        </dl>
      )}
      {streaming && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {streamingLabel}
        </span>
      )}
      {(actions || copy) && (
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {actions}
          {copy && (
            <CopyButtons {...copy} size={size === "md" ? "sm" : "icon"} />
          )}
        </div>
      )}
    </div>
  );
}
