"use client";

/**
 * PromptPreviewModal — "visualize the full prompt".
 *
 * On open it runs the live-draft dry-run (requestPromptPreview) and shows what is
 * ABOUT to go to the model: the fully-rendered system prompt (context + tools +
 * Matrx Actions guidance already assembled), the assembled messages, the resolved
 * tool set, and the model params. Read-only — nothing is run or saved.
 */

import { useEffect, useState } from "react";
import { Loader2, Copy, RefreshCw, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAppStore } from "@/lib/redux/hooks";
import { requestPromptPreview } from "./service";
import type { PromptPreview } from "./types";

interface PromptPreviewModalProps {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PromptPreviewModal({
  conversationId,
  open,
  onOpenChange,
}: PromptPreviewModalProps) {
  const store = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PromptPreview | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    requestPromptPreview(store.getState(), conversationId)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, conversationId, store, nonce]);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col gap-3 bg-textured">
        <DialogHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <DialogTitle className="text-sm">
            Full prompt preview
            {preview?.model ? (
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {preview.model}
              </span>
            ) : null}
          </DialogTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setNonce((n) => n + 1)}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Assembling the full prompt…
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="leading-snug">{error}</span>
          </div>
        ) : preview ? (
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {/* System prompt — the star of the show */}
            <Section
              title="System prompt"
              onCopy={
                preview.system_prompt
                  ? () => copy("System prompt", preview.system_prompt as string)
                  : undefined
              }
            >
              <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-card p-3 font-mono text-[11px] leading-relaxed text-foreground">
                {preview.system_prompt || "(empty)"}
              </pre>
            </Section>

            {/* Messages */}
            <Section
              title={`Messages (${preview.messages.length})`}
              onCopy={() =>
                copy("Messages", JSON.stringify(preview.messages, null, 2))
              }
            >
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-card p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {JSON.stringify(preview.messages, null, 2)}
              </pre>
            </Section>

            {/* Tools + params */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Section title={`Tools (${preview.tools.length})`}>
                {preview.tools.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {preview.tools.map((t) => (
                      <code
                        key={t}
                        className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {t}
                      </code>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No tools.</p>
                )}
              </Section>
              <Section title="Params">
                <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-card p-3 font-mono text-[11px] text-muted-foreground">
                  {JSON.stringify(preview.params, null, 2)}
                </pre>
              </Section>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Read-only preview of the assembled request — no model was called and
              nothing was saved.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  onCopy,
  children,
}: {
  title: string;
  onCopy?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        {onCopy ? (
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
