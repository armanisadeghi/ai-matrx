"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

interface JsonViewerProps {
  value: unknown;
  className?: string;
  /** Max-height utility class. Defaults to a moderate scroll cap. */
  maxHeight?: string;
}

/** Tiny syntax-highlighted JSON viewer with copy. No external deps. */
export function JsonViewer({
  value,
  className,
  maxHeight = "max-h-96",
}: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const text = (() => {
    try {
      return typeof value === "string" ? value : JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  })();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable; ignore */
    }
  };

  return (
    <div
      className={cn(
        "relative rounded-md border border-border bg-muted/40",
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute right-1 top-1 h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        onClick={handleCopy}
        aria-label="Copy JSON"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
      <pre
        className={cn(
          "overflow-auto rounded-md p-3 pr-10 font-mono text-xs leading-relaxed text-foreground",
          maxHeight,
        )}
      >
        {text}
      </pre>
    </div>
  );
}
