"use client";

/**
 * The meta row UNDER the composer card (brief §2): left Scope · Output, right
 * Agent · Effort (Work+). At compact width Agent · Effort ride the
 * toolbar row (`ComposerPills`); Scope and Output move into +.
 *
 * The row NEVER wraps (Arman, 2026-09-28): on a narrow screen it scrolls
 * sideways. "Auto" is the Effort pill's own word (no effort override) — there
 * is no separate run-approval pill.
 */

import { ActiveContextLensChip } from "@host/features/scopes/components/active-context/ActiveContextLensChip";
import { ComposerAgentPill } from "./ComposerAgentPill";
import { ComposerEffortPill } from "./ComposerEffortPill";
import { ComposerOutputPill } from "./ComposerOutput";
import { composerShows } from "./composer-mode-visibility";
import { COMPOSER_ROW_CLASS } from "./composer-chip";
import { cn } from "@ai-matrx/design-system";
import type { ComposerPresentation } from "./composer-types";
import { useEffectiveModelId } from "./useComposerAgent";
import { useAppSelector } from "../../../../../store/hooks";
import { selectAgentIdFromInstance } from "../../../../redux/execution-system/conversations/conversations.selectors";
import {
  ConversationContextChip,
  useConversationContextChipShown,
} from "../ConversationContextChip";

/**
 * The value-group chip, in the meta row beside Output (Arman, 2026-10-03): the
 * card never spends a whole row on this one chip. The rail is told not to draw it.
 */
export function ComposerValueGroupChip({ conversationId }: { conversationId: string }) {
  const shown = useConversationContextChipShown(conversationId);
  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId));
  if (!shown) return null;
  return (
    <span className="flex shrink-0 items-center">
      <ConversationContextChip conversationId={conversationId} agentId={agentId ?? null} />
    </span>
  );
}

/**
 * The Scope chip's two faces under comparison (Arman, 2026-10-03):
 * `plain` = the Output pill's own face; `pill` = bordered, round like the card.
 */
const SCOPE_CHIP_CLASS: Record<"plain" | "pill", string> = {
  plain:
    "h-6 rounded-md border-transparent bg-transparent px-2 text-muted-foreground hover:bg-accent hover:text-foreground",
  pill: "h-6 rounded-full px-2.5",
};

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
  // Every size: the direct way to change effort (Work+) is the point of this pill.
  const showEffort = composerShows(composer.mode, "meta.effort");
  return (
    // The agent pill is the ONE pill here that shrinks (its label ellipsizes),
    // never below a readable floor; Effort keeps its natural width.
    // `ml-auto` keeps the cluster on the right. Never `justify-end`: past the
    // floor a `justify-end` cluster spills its pills out of its LEFT edge,
    // over the Output pill ("TexGen…" at a 260px column); start-justified,
    // the overflow runs right, into the row's sideways scroll.
    <div className="ml-auto flex min-w-0 shrink items-center gap-0.5 [&>*:first-child]:min-w-[4.5rem] [&>*:not(:first-child)]:shrink-0">
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
    // `@container/composer-meta`: a narrow column (a chat beside a wide
    // canvas) folds the Scope chip to its icon, as a phone does.
    <div className={cn(COMPOSER_ROW_CLASS, "@container/composer-meta justify-between gap-2 px-1")}>
      <div className="flex shrink-0 items-center gap-0.5">
        <ActiveContextLensChip
          conversationId={conversationId}
          className={SCOPE_CHIP_CLASS[composer.scopeChipStyle ?? "plain"]}
        />
        <ComposerOutputPill conversationId={conversationId} size={composer.size} menuSide={menuSide} />
        <ComposerValueGroupChip conversationId={conversationId} />
      </div>
      <ComposerPills conversationId={conversationId} composer={composer} menuSide={menuSide} />
    </div>
  );
}
