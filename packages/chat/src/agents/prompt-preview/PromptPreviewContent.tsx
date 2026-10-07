"use client";

/**
 * PromptPreviewContent — the reusable "visualize the full prompt" body.
 *
 * On mount (and on Refresh) it runs the live-draft dry-run (requestPromptPreview)
 * and shows what is ABOUT to go to the model: the fully-rendered system prompt
 * (context + tools + Matrx Directives guidance already assembled — this is where the
 * auto-injected `## Available Matrx Directives` guidance lands), the assembled
 * messages, the resolved tool set, and the model params. Read-only — nothing is
 * run or saved.
 *
 * Host-agnostic: it carries its own compact toolbar (model + Refresh) so it drops
 * into any surface — the PromptPreviewWindow WindowPanel today, a plain page or a
 * dialog tomorrow — with zero chrome assumptions.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { toast as copyToast } from "@/lib/toast";
import { useEffect, useState } from "react";
import { Loader2, Copy, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { useAppStore } from "../../store/hooks";
import { requestPromptPreview } from "./service";
import type { PromptPreview } from "./types";
import { ErrorAlchemyMenu } from "@ai-matrx/chat/host/ui-slots";

interface PromptPreviewContentProps {
  conversationId: string;
}

export function PromptPreviewContent({
  conversationId,
}: PromptPreviewContentProps) {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? copyToast.error(message) : copyToast.success(message),
  });
  const store = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PromptPreview | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await requestPromptPreview(
          store.getState(),
          conversationId,
        );
        if (!cancelled) setPreview(result);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [conversationId, store, nonce]);

  const copy = async (label: string, text: string) => {
    if (!(await copyText(text, `${label} copied`))) return;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 bg-textured p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-baseline gap-2 text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-wide">Model</span>
          <span className="font-mono text-foreground">
            {preview?.model ?? "—"}
          </span>
        </span>
        <Button
          icon={<RefreshCw
            className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`}
          />}
          variant="outline"
          onClick={() => setNonce((n) => n + 1)}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Assembling the full prompt…
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="leading-snug">{error} <ErrorAlchemyMenu error={error} /></span>
        </div>
      ) : preview ? (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {/* A decision turn is reshaped before it reaches the model; the
              server applies that same reshaping to this preview and says so
              here, so an empty system prompt or tool list is never a mystery. */}
          {preview.decision_notice ? (
            <p className="rounded-md border border-border bg-card px-3 py-2 text-xs leading-snug text-muted-foreground">
              {preview.decision_notice}
            </p>
          ) : null}
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
              {preview.tool_notice ? (
                <p className="text-xs leading-snug text-muted-foreground">
                  {preview.tool_notice}
                </p>
              ) : null}
            </Section>
            <Section title="Params">
              <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-card p-3 font-mono text-[11px] text-muted-foreground">
                {JSON.stringify(preview.params, null, 2)}
              </pre>
            </Section>
          </div>

          <p className="text-[10px] text-muted-foreground">
            Read-only preview; nothing was sent or saved.
          </p>
        </div>
      ) : null}
    </div>
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
          <Button variant="quiet" icon={<Copy />} onClick={onCopy}>Copy</Button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
