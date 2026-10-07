"use client";

/**
 * EmbedSnippet — copy-paste iframe snippet generator for the Sharing
 * tab. Exposes the public widget embed URL (`?embed=widget`) plus a
 * pre-formatted iframe block users can drop into a third-party site.
 *
 * The widget shell strips management chrome and runs against the
 * standard public path, so the same row deployed at /applets/<slug> serves
 * both the full-page experience and the embed without any further
 * configuration.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

interface EmbedSnippetProps {
  /** App slug — what /applets/[slug] resolves on. */
  slug: string;
  /** Origin to use when assembling the URL (defaults to window.origin). */
  origin?: string;
  /** Default iframe height in px. */
  defaultHeight?: number;
}

export function EmbedSnippet({
  slug,
  origin,
  defaultHeight = 600,
}: EmbedSnippetProps) {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  const [height, setHeight] = useState<number>(defaultHeight);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const resolvedOrigin =
    origin ??
    (typeof window !== "undefined"
      ? window.location.origin
      : "https://aimatrx.com");

  const widgetUrl = useMemo(
    () => `${resolvedOrigin}/applets/${slug}?embed=widget`,
    [resolvedOrigin, slug],
  );

  const iframeSnippet = useMemo(
    () =>
      `<iframe
  src="${widgetUrl}"
  style="width:100%; height:${height}px; border:0;"
  loading="lazy"
  allow="clipboard-write"
></iframe>`,
    [widgetUrl, height],
  );

  const copy = async (text: string, key: string) => {
    if (!(await copyText(text))) return;
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Embed
        </Label>
      </div>
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border/60">
        <span className="text-sm font-mono text-foreground truncate flex-1">
          {widgetUrl}
        </span>
        <button
          type="button"
          onClick={() => copy(widgetUrl, "url")}
          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
          aria-label="Copy embed URL"
        >
          {copiedKey === "url" ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      <div className="grid grid-cols-[180px_1fr] items-center gap-3">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Iframe height (px)
        </Label>
        <Input
          type="number"
          min={200}
          max={2000}
          step={50}
          value={height}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next) && next > 0) setHeight(next);
          }}
          className="w-32"
        />
      </div>
      <div className="rounded-md border border-border/60 bg-muted/40 p-3 space-y-2">
        <pre className="text-[12px] font-mono text-foreground whitespace-pre-wrap leading-relaxed">
          {iframeSnippet}
        </pre>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => copy(iframeSnippet, "snippet")}
          >
            {copiedKey === "snippet" ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy snippet
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
