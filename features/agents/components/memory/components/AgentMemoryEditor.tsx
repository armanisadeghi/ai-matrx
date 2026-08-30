"use client";

/**
 * MemoryComposer — body content for the new-memory form AND the
 * single-memory editor (same component, driven by the hoisted draft in
 * `useAgentMemories`). Title reads like a document heading; content is a
 * single textarea that fills all remaining vertical space so nothing is
 * ever cut off or requires an inner scroll. Save/Delete + the importance
 * slider live in the footer slot — this component is content-only, but
 * mirrors the current importance score at the top so it's never hidden.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  importanceScore,
  importanceTier,
  type AgentMemoryRow,
  type AgentMemoryScope,
} from "../types";
import {
  NEW_MEMORY_ID,
  type UseAgentMemoriesReturn,
} from "../hooks/useAgentMemories";

const SCOPE_OPTIONS: { value: AgentMemoryScope; label: string }[] = [
  { value: "user", label: "Just me" },
  { value: "organization", label: "Organization" },
];

const TIER_BADGE_CLASS: Record<ReturnType<typeof importanceTier>, string> = {
  high: "bg-primary/15 text-primary",
  medium: "bg-muted text-foreground",
  low: "bg-muted text-muted-foreground",
};

interface MemoryComposerProps {
  state: UseAgentMemoriesReturn;
  memory: AgentMemoryRow | null;
}

export function MemoryComposer({ state, memory }: MemoryComposerProps) {
  const { draft, setDraftTitle, setDraftContent, selectedId } = state;
  const isNew = selectedId === NEW_MEMORY_ID;
  const score = importanceScore(draft.importance);
  const tier = importanceTier(draft.importance);

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
            TIER_BADGE_CLASS[tier],
          )}
          title="Importance"
        >
          {score}
          <span className="text-[9px] font-normal opacity-70">/10</span>
        </span>

        {isNew ? (
          <div className="flex gap-1.5">
            {SCOPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => state.setDraftScope(opt.value)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  draft.scope === opt.value
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : (
          memory && (
            <>
              <Badge variant="secondary" className="text-[10px] capitalize">
                {memory.scope}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                Updated {new Date(memory.updated_at).toLocaleDateString()}
              </span>
            </>
          )
        )}
      </div>

      <input
        value={draft.title}
        onChange={(e) => setDraftTitle(e.target.value)}
        placeholder="Memory title…"
        autoFocus={isNew}
        className="mb-2 w-full shrink-0 bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground/50"
      />

      <textarea
        value={draft.content}
        onChange={(e) => setDraftContent(e.target.value)}
        placeholder="Write the memory as a clear statement of fact or preference…"
        className="min-h-0 w-full flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50"
      />
    </div>
  );
}
