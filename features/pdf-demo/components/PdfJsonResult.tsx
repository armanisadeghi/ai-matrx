"use client";

/**
 * PdfJsonResult — collapsible JSON viewer for endpoint responses.
 *
 * Lightweight on purpose — no external JSON-tree dependency. Renders the
 * pretty-printed payload in a scrollable code block with a copy button.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useState } from "react";
import { Copy, Check, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  data: unknown;
  title?: string;
}

export function PdfJsonResult({ data, title = "Response" }: Props) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [copied, setCopied] = useState(false);

  if (data == null) return null;

  const json = JSON.stringify(data, null, 2);

  async function copy() {
    if (!(await copyText(json, "Copied JSON."))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Code2 className="h-4 w-4 text-primary" />
          {title}
        </div>
        <Button variant="outline" onClick={copy}>
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 mr-1" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copy
            </>
          )}
        </Button>
      </div>
      <pre className="max-h-[600px] overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed">
        <code>{json}</code>
      </pre>
    </div>
  );
}
