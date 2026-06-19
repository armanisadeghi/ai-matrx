"use client";

/**
 * Working-document drawer body. The working document is a live, collaborative
 * context item re-sent every turn — editing it here reaches the agent
 * automatically (no re-attach). Two views, toggled from the footer:
 *
 *   • Edit  — the native `ProTextarea` editor, full height (same surface as
 *             `WorkingDocumentPanel`, minus its header chrome).
 *   • Diff  — "what the agent last changed", via the canonical `DiffViewer`
 *             (light engine, highlight view) fed by `useWorkingDocChanges`.
 *
 * Only the Body mounts `useWorkingDocument` (which owns the realtime channel +
 * context-sync effects). It publishes the bits the Footer needs (view toggle,
 * unseen-change flag, saving) to a tiny per-conversation store, so the Footer
 * never double-mounts the hook.
 */

import { useEffect, useSyncExternalStore } from "react";
import { GitCompare, Loader2, Pencil } from "lucide-react";
import { ProTextarea } from "@/components/official/ProTextarea";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { useWorkingDocument } from "@/features/agents/hooks/useWorkingDocument";
import { useWorkingDocChanges } from "@/features/transcript-studio/hooks/useWorkingDocChanges";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ContextItemBodyProps } from "../types";

// ── Tiny per-conversation store shared between Body and Footer ───────────────

interface WorkingDocViewState {
  view: "edit" | "diff";
  hasUnseenChange: boolean;
  saving: boolean;
}

const store = new Map<string, WorkingDocViewState>();
const listeners = new Set<() => void>();
const DEFAULT_STATE: WorkingDocViewState = {
  view: "edit",
  hasUnseenChange: false,
  saving: false,
};

function emit() {
  listeners.forEach((l) => l());
}
function getState(conversationId: string): WorkingDocViewState {
  return store.get(conversationId) ?? DEFAULT_STATE;
}
function patch(conversationId: string, next: Partial<WorkingDocViewState>) {
  const cur = getState(conversationId);
  const merged = { ...cur, ...next };
  if (
    merged.view === cur.view &&
    merged.hasUnseenChange === cur.hasUnseenChange &&
    merged.saving === cur.saving
  ) {
    return;
  }
  store.set(conversationId, merged);
  emit();
}
function setView(conversationId: string, view: "edit" | "diff") {
  patch(conversationId, { view });
}
function useWorkingDocView(conversationId: string): WorkingDocViewState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => getState(conversationId),
    () => DEFAULT_STATE,
  );
}

// ── Body ─────────────────────────────────────────────────────────────────────

export function WorkingDocumentBody({ item, setTitle }: ContextItemBodyProps) {
  const conversationId = item.conversationId;
  const { title, draft, content, onChange, flush, saving } =
    useWorkingDocument(conversationId);
  const { before, after, hasUnseenChange } = useWorkingDocChanges(
    content,
    draft,
  );
  const { view } = useWorkingDocView(conversationId);

  useEffect(() => {
    setTitle?.(title?.trim() || "Working document");
  }, [title, setTitle]);

  // Publish footer-relevant state from the single hook owner.
  useEffect(() => {
    patch(conversationId, { hasUnseenChange, saving });
  }, [conversationId, hasUnseenChange, saving]);

  if (view === "diff") {
    return (
      <DiffViewer
        original={before}
        modified={after}
        engine="light"
        language="markdown"
        originalLabel="Before"
        modifiedLabel="After (agent's edit)"
        defaultView="highlight"
        className="h-full min-h-0"
      />
    );
  }

  return (
    <ProTextarea
      value={draft}
      onChange={(e) => onChange(e.target.value)}
      onBlur={flush}
      placeholder="Empty. Ask the agent to draft this — or type here. Your edits and the agent's stay in sync each round."
      wrapperClassName="flex h-full min-h-0 flex-col p-3"
      className="h-full min-h-0 flex-1 resize-none border-0 bg-transparent text-base leading-relaxed text-foreground shadow-none focus-visible:ring-0"
    />
  );
}

// ── Footer (reads the shared store only — no second hook mount) ──────────────

export function WorkingDocumentFooter({ item }: ContextItemBodyProps) {
  const conversationId = item.conversationId;
  const { view, hasUnseenChange, saving } = useWorkingDocView(conversationId);

  return (
    <>
      {saving && (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      )}
      {hasUnseenChange && view === "edit" && (
        <span className="text-[11px] text-primary">Agent edited this</span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() =>
              setView(conversationId, view === "diff" ? "edit" : "diff")
            }
            className={cn(
              "ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-accent",
              view === "diff"
                ? "text-foreground"
                : hasUnseenChange
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            {view === "diff" ? (
              <Pencil className="h-3.5 w-3.5" />
            ) : (
              <span className="relative">
                <GitCompare className="h-3.5 w-3.5" />
                {hasUnseenChange && (
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {view === "diff" ? "Back to editor" : "View agent's changes"}
        </TooltipContent>
      </Tooltip>
    </>
  );
}
