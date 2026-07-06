"use client";

/**
 * WorkingDocumentAgentDiff — the drawer's "what did the agent change" view.
 *
 * Renders the SAME animated, reconciling diff the inline tool-call message shows
 * (`AnimatedDiffReveal` fed by `useLiveWorkingDocPatch`): the removed span tints
 * destructive/struck, the new text fills in tinted success, token-by-token while
 * the agent writes, then snaps to the server's authoritative content once the
 * turn settles. When there is no live/recent agent patch (a fresh turn, or a
 * reloaded page whose tool lifecycle is gone) it renders `fallback` — the DB
 * version-history diff.
 */

import { FileText } from "lucide-react";

import { AnimatedDiffReveal } from "@/components/diff/text/AnimatedDiffReveal";
import type { LiveWorkingDocPatch } from "@/features/agents/redux/execution-system/instance-working-document/useLiveWorkingDocPatch";

interface WorkingDocumentAgentDiffProps {
  livePatch: LiveWorkingDocPatch;
  /** Rendered when there is no live/recent agent patch (reload / new turn). */
  fallback: React.ReactNode;
}

export function WorkingDocumentAgentDiff({
  livePatch,
  fallback,
}: WorkingDocumentAgentDiffProps) {
  // A live/recent text patch → the animated, reconciling diff.
  if (livePatch.hasPatch && livePatch.after !== null) {
    return (
      <div className="h-full min-h-0 overflow-auto bg-background px-4 py-3">
        <AnimatedDiffReveal
          before={livePatch.before}
          after={livePatch.after}
          reveal={{
            active: livePatch.animate,
            replayKey: livePatch.latestCallId ?? "working-doc-diff",
          }}
        />
      </div>
    );
  }

  // A structural (json_*) patch has no text diff to animate.
  if (livePatch.hasPatch && livePatch.isStructural) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 px-6 text-center">
        <FileText className="h-7 w-7 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          The agent applied a structured update.
        </p>
      </div>
    );
  }

  return <>{fallback}</>;
}
