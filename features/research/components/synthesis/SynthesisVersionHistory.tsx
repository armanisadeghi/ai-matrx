"use client";

import { useCallback, useState } from "react";
import { ChevronDown, ChevronUp, History, Loader2 } from "lucide-react";

import MarkdownStream from "@/components/MarkdownStream";
import { AiModelRef } from "@/components/official/entity-ref/AiIdentityRef";
import { toast } from "@/lib/toast";

import { getSynthesisVersions } from "../../service";
import type { ResearchSynthesis } from "../../types";

/**
 * Superseded versions of one synthesis scope.
 *
 * Rewriting a report flips the old row's `is_current` and inserts a new
 * version — the previous text is never deleted. Until this component existed
 * nothing read those rows, so a rebuild LOOKED destructive and "your previous
 * report is kept" was an unverifiable claim. Loaded on demand: most users never
 * open it, and it is a second query over full synthesis bodies.
 */
export function SynthesisVersionHistory({
  topicId,
  scope,
  keywordId,
  label,
}: {
  topicId: string;
  scope: string;
  keywordId?: string;
  /** What this scope is called, e.g. "topic report". Used in the toggle copy. */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<ResearchSynthesis[] | null>(null);

  const toggle = useCallback(async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (versions) return;
    setLoading(true);
    try {
      setVersions(
        await getSynthesisVersions(topicId, { scope, keyword_id: keywordId }),
      );
    } catch (err) {
      toast.error((err as Error).message ?? "Could not load previous versions");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [open, versions, topicId, scope, keywordId]);

  return (
    <div className="border-t border-border/40">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        <History className="h-3 w-3 shrink-0" />
        <span>
          Previous versions of this {label}
          {versions ? ` (${versions.length})` : ""}
        </span>
        <span className="flex-1" />
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : open ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {open && !loading && (
        <div className="space-y-2 px-3 pb-3">
          {versions && versions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No earlier versions — this is the first one written.
            </p>
          ) : (
            versions?.map((v) => (
              <details
                key={v.id}
                className="rounded-lg border border-border/50 bg-muted/20"
              >
                <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">
                    v{v.version}
                  </span>
                  {v.created_at
                    ? ` · ${new Date(v.created_at).toLocaleString()}`
                    : ""}
                  {v.model_id ? (
                    <span className="ml-1 inline-flex align-middle">
                      ·
                      <AiModelRef
                        modelId={v.model_id}
                        showId
                        showIcon={false}
                        disableNavigation
                        className="ml-1"
                      />
                    </span>
                  ) : null}
                </summary>
                <div className="border-t border-border/40 px-2.5 py-2">
                  {v.result && v.result.trim().length > 0 ? (
                    <MarkdownStream content={v.result} />
                  ) : (
                    // An empty body is a real "produced nothing" outcome, not a
                    // loading state — render it as such.
                    <p className="text-[11px] text-muted-foreground">
                      This version produced no text.
                    </p>
                  )}
                </div>
              </details>
            ))
          )}
        </div>
      )}
    </div>
  );
}
