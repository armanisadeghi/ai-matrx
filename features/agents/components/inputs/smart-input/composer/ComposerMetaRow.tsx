"use client";

/**
 * The meta row UNDER the composer card (brief §2): left Scope · Output, right
 * Agent · Effort (Work+). At compact width only Agent remains and it rides the
 * toolbar row (`ComposerPills`); Scope and Output move into +.
 *
 * The row NEVER wraps (Arman, 2026-09-28): on a narrow screen it scrolls
 * sideways. "Auto" is the Effort pill's own word (no effort override) — there
 * is no separate run-approval pill.
 */

import { ActiveContextLensChip } from "@/features/scopes/components/active-context/ActiveContextLensChip";
import { ComposerAgentPill } from "./ComposerAgentPill";
import { ComposerEffortPill } from "./ComposerEffortPill";
import { ComposerOutputPill } from "./ComposerOutput";
import { composerShows } from "./composer-mode-visibility";
import { COMPOSER_ROW_CLASS } from "./composer-chip";
import { cn } from "@/lib/utils";
import type { ComposerPresentation } from "./composer-types";
import { useEffectiveModelId } from "./useComposerAgent";

/** Agent · (Effort) — the right cluster, shared by the meta row and the compact toolbar. */
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
    // never below a readable floor; Effort keeps its natural width.
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
    // One line, always: a phone scrolls the row sideways, never wraps it.
    <div className={cn(COMPOSER_ROW_CLASS, "justify-between gap-2 px-1")}>
      <div className="flex shrink-0 items-center gap-0.5">
        <ActiveContextLensChip conversationId={conversationId} className="h-6 rounded-md px-2" />
        <ComposerOutputPill conversationId={conversationId} size={composer.size} menuSide={menuSide} />
      </div>
      <ComposerPills conversationId={conversationId} composer={composer} menuSide={menuSide} />
    </div>
  );
}
