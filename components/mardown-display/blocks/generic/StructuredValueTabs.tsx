"use client";

/**
 * Preview ⇄ JSON tabs for any structured value the kind system renders
 * through a fallback view (Arman, 2026-08-25: "when the kind component
 * renders something it doesn't recognize, it should be giving us tab icons …
 * an option to see the JSON. And that's for everyone, even when it's a
 * user").
 *
 * The JSON is not a debug easter egg: when the reader is looking at a
 * generic key/value rendering, the raw payload IS the ground truth, and
 * hiding it behind an admin gate meant nobody could check what actually
 * arrived. Two small icon tabs in the header, preview first, always present.
 */

import React, { useState } from "react";
import { Braces, Check, Copy, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

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
      title={label}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </button>
  );
}

/**
 * `value` feeds the JSON tab (pretty-printed, copyable); `raw` is the
 * zero-loss fallback when no structured value survived. `header` renders any
 * host status line (kind name, "still arriving") inline, left of the tabs.
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

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <div className="min-w-0 flex-1">{header}</div>
        <div className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5">
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
        </div>
        {tab === "json" ? (
          <button
            type="button"
            onClick={copy}
            title="Copy JSON"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        ) : null}
      </div>
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
