"use client";

/**
 * Preview ⇄ JSON toggle for any structured value the kind system renders
 * through a fallback view (Arman, 2026-08-25: "when the kind component
 * renders something it doesn't recognize, it should be giving us tab icons …
 * an option to see the JSON. And that's for everyone, even when it's a
 * user").
 *
 * SMALL, AND IN THE HEADER (Arman, 2026-08-26): the controls are icon-size,
 * and when the host provides a header slot (`TileActionsProvider` /
 * `useTileActionsTarget`) they render THERE — on the tile's existing title
 * line — instead of spending a body row of the most valuable space on the
 * page. Hosts without a slot get the same tiny controls inline,
 * right-aligned, one thin row.
 *
 * The JSON is not a debug easter egg: when the reader is looking at a
 * fallback rendering, the raw payload IS the ground truth, and hiding it
 * meant nobody could check what actually arrived.
 */

import React, { useState } from "react";
import { Braces, Check, Copy, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { IntoTileActions, useHasTileActionsSlot } from "./tile-actions-slot";

type Tab = "preview" | "json";

function TabButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: typeof Eye;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-5 w-6 items-center justify-center rounded transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
    </button>
  );
}

/**
 * `value` feeds the JSON tab (pretty-printed, copyable); `raw` is the
 * zero-loss fallback when no structured value survived. `header` renders any
 * host status line (kind drift note, "still arriving") above the content.
 */
export function StructuredValueTabs({
  value,
  raw,
  header,
  children,
}: {
  value: unknown;
  raw?: string | null;
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("preview");
  const [copied, setCopied] = useState(false);
  const hasSlot = useHasTileActionsSlot();

  const json =
    value !== undefined && value !== null
      ? JSON.stringify(value, null, 2)
      : (raw ?? "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied — the text is still selectable below */
    }
  };

  const controls = (
    <span className="inline-flex shrink-0 items-center gap-1">
      <span className="inline-flex items-center gap-px rounded-md border border-border bg-muted/50 p-px">
        <TabButton
          active={tab === "preview"}
          label="Preview"
          icon={Eye}
          onClick={() => setTab("preview")}
        />
        <TabButton
          active={tab === "json"}
          label="JSON"
          icon={Braces}
          onClick={() => setTab("json")}
        />
      </span>
      {tab === "json" ? (
        <button
          type="button"
          onClick={copy}
          title="Copy JSON"
          aria-label="Copy JSON"
          className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-card text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      ) : null}
    </span>
  );

  return (
    <div>
      <IntoTileActions>
        {hasSlot ? (
          controls
        ) : (
          // No header slot: one THIN inline row, right-aligned, nothing more.
          <div className="mb-1 flex items-center justify-end">{controls}</div>
        )}
      </IntoTileActions>
      {header}
      {tab === "preview" ? (
        children
      ) : (
        <pre className="max-h-[28rem] overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground">
          {json}
        </pre>
      )}
    </div>
  );
}
