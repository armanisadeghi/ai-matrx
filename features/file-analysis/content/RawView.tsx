/**
 * features/file-analysis/content/RawView.tsx
 *
 * Toggle wrapper for every content renderer — flips between the pretty
 * view and a fidelity-first raw JSON dump. The raw view is the single most
 * useful debug surface for "I want to feed this into an AI to extract
 * specific fields" — every detector's full payload + annotation metadata
 * is one click away, with Copy + Download actions.
 *
 * Used by every section in the AnalysisTab + the Inspector. Consistent UX
 * so the user always knows where to find the raw data.
 */

"use client";

import { useState } from "react";
import { Braces, Check, Copy, Download, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RawViewProps {
  /** What's being shown — gets stamped into copied JSON + the download filename. */
  label: string;
  /** The pretty rendering. */
  children: React.ReactNode;
  /** The data to surface when the user flips to raw. Anything — array,
   *  object, primitive — gets JSON.stringified. */
  rawData: unknown;
  /** Optional default open. Default closed (pretty first). */
  defaultRaw?: boolean;
  className?: string;
}

export function RawView({
  label,
  children,
  rawData,
  defaultRaw = false,
  className,
}: RawViewProps) {
  const [raw, setRaw] = useState<boolean>(defaultRaw);
  const [copied, setCopied] = useState(false);

  const jsonText = (() => {
    try {
      return JSON.stringify(rawData, null, 2);
    } catch {
      return "/* could not serialize */";
    }
  })();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label.toLowerCase().replace(/\s+/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-card/40 px-2 py-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setRaw((v) => !v)}
          className="h-6 gap-1 text-[10px] uppercase tracking-wider"
        >
          {raw ? (
            <>
              <Eye className="h-3 w-3" /> Pretty
            </>
          ) : (
            <>
              <Braces className="h-3 w-3" /> Raw JSON
            </>
          )}
        </Button>
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="ml-auto rounded bg-muted px-1.5 py-px text-[9px] tabular-nums text-muted-foreground">
          {(jsonText.length / 1024).toFixed(1)} KB
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void handleCopy()}
          className="h-6 w-6 p-0"
          title="Copy as JSON"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDownload}
          className="h-6 w-6 p-0"
          title="Download JSON"
        >
          <Download className="h-3 w-3" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {raw ? (
          <pre className="m-0 whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-snug">
            {jsonText}
          </pre>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/**
 * Compact inline variant — just a "Show raw" toggle for places where the
 * full RawView with chrome would be overkill (e.g. one row of a list).
 */
export function InlineRawToggle({
  data,
  label,
}: {
  data: unknown;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-[10px]">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        {open ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        {open ? "Hide" : "Raw"} {label ?? ""}
      </button>
      {open ? (
        <pre className="mt-1 max-h-48 overflow-auto rounded border border-border bg-muted/30 p-2 font-mono leading-snug">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
