"use client";

/**
 * The meta row UNDER the composer card (brief §2): left Scope · Output, right
 * Agent · Effort (Work+) · Auto. At compact width only Agent · Auto remain and
 * they ride the toolbar row (`ComposerPills`); Scope and Output move into +.
 */

import { ActiveContextLensChip } from "@/features/scopes/components/active-context/ActiveContextLensChip";
import { ComposerAgentPill } from "./ComposerAgentPill";
import { ComposerAutoPill } from "./ComposerAutoPill";
import { ComposerEffortPill } from "./ComposerEffortPill";
import { ComposerOutputPill } from "./ComposerOutput";
import { composerShows } from "./composer-mode-visibility";
import type { ComposerPresentation } from "./composer-types";
import { useEffectiveModelId } from "./useComposerAgent";

/** Agent · (Effort) · Auto — the right cluster, shared by the meta row and the compact toolbar. */
export function ComposerPills({
  conversationId,
  composer,
  menuSide,
}: {
  conversationId: string;
  composer: ComposerPresentation;
  menuSide: "top" | "bottom";
}) {
  const effectiveModelId = useEffectiveModelId(conversationId);
  const showEffort = composer.size !== "compact" && composerShows(composer.mode, "meta.effort");
  return (
    // The agent pill is the ONE pill here that shrinks (its label ellipsizes),
    // never below a readable floor; Effort and Auto keep their natural width.
    <div className="ml-auto flex min-w-0 shrink items-center justify-end gap-0.5 [&>*:first-child]:min-w-[4.5rem] [&>*:not(:first-child)]:shrink-0">
      <ComposerAgentPill
        conversationId={conversationId}
        mode={composer.mode}
        size={composer.size}
        agentControl={composer.agent}
        menuSide={menuSide}
      />
      {showEffort ? (
        <ComposerEffortPill
          conversationId={conversationId}
          modelId={effectiveModelId}
          size={composer.size}
          menuSide={menuSide}
        />
      ) : null}
      <ComposerAutoPill size={composer.size} menuSide={menuSide} />
    </div>
  );
}

export function ComposerMetaRow({
  conversationId,
  composer,
  menuSide,
}: {
  conversationId: string;
  composer: ComposerPresentation;
  menuSide: "top" | "bottom";
}) {
  return (
    // One line wherever it fits; on a phone the right cluster wraps under
    // Scope · Output (right-aligned) instead of squeezing every label to "…".
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1">
      <div className="flex shrink-0 items-center gap-0.5">
        <ActiveContextLensChip conversationId={conversationId} />
        <ComposerOutputPill conversationId={conversationId} size={composer.size} menuSide={menuSide} />
      </div>
      <ComposerPills conversationId={conversationId} composer={composer} menuSide={menuSide} />
    </div>
  );
}
