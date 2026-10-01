"use client";

/**
 * ViewOnlyComposerBar — what stands where the composer would, for a person who
 * may read a conversation but not add to it (a view-level share).
 *
 * A screen never lies (W-65, PB-07 S10): the box used to take text and fail only
 * after Send. The answer comes from the access kernel via
 * `selectViewerCanReply` (asked once by `loadConversation`), so every surface
 * that mounts `SmartAgentInput` inherits it — no per-page hide.
 */

import { Eye } from "lucide-react";

export function ViewOnlyComposerBar() {
  return (
    <div
      role="status"
      data-testid="view-only-composer"
      className="mx-auto mb-2 flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-muted-foreground"
      title="Ask the owner for edit access to reply here."
    >
      <Eye className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">View only — you can read this chat, not reply</span>
    </div>
  );
}
