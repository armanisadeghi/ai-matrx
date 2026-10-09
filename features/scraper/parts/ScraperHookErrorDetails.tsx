"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useState, useCallback } from "react";
import { Button } from "@ai-matrx/design-system";
import { Copy, Check } from "lucide-react";
import { formatScraperDiagnosticsJson } from "@/utils/scraper-diagnostics-json";

/**
 * Shows structured JSON from useScraperApi().errorDiagnostics when a scrape fails.
 */
export function ScraperHookErrorDetails({
  diagnostics,
}: {
  diagnostics: unknown;
}) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [copied, setCopied] = useState(false);
  const text = formatScraperDiagnosticsJson(diagnostics);

  const handleCopy = useCallback(async () => {
    if (!(await copyText(text))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  if (diagnostics == null) return null;
  return (
    <div className="mt-2 rounded-md border border-border bg-muted/60 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-border bg-muted/80">
        <span className="text-[10px] text-muted-foreground">
          Diagnostics JSON
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-600" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          <span className="ml-1 text-[10px]">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      <pre /* rich-content-exempt: debug or inspector output: logs, JSON, code or source view */ className="max-h-56 overflow-auto p-2 text-[10px] font-mono leading-relaxed whitespace-pre-wrap text-foreground">
        {text}
      </pre>
    </div>
  );
}
