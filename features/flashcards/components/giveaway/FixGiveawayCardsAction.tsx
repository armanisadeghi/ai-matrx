"use client";

// features/flashcards/components/giveaway/FixGiveawayCardsAction.tsx
//
// "Fix cards that give the answer away" — Arman, 2026-10-02, on the Match game:
// "have the ai modify the cards so that no card gives away the back of the
// card ... the model gets the cards and then provides updates for any that
// have it where the back gives away the front by exposing the value."
//
// ONE header action for a deck's editors. A click reads the whole deck through
// fcService and runs the `flashcards.fix_giveaway_cards` mandate with the deck
// offered as named variables (`deck_name`, `set_id`, `cards` as the registered
// input kind `flashcard_deck_cards_v1`) — never through user_input. The run
// streams into the floating LiveRunWindow (THE FLOATING LAW), and its answer is
// `list_change_proposal_v1` with target `{kind:"flashcard_deck"}`, so the
// window renders THE ONE proposal component: each rewrite shows current →
// proposed, and the editor accepts one or all. Nothing is written until they
// do; accepted rewrites save through the list-change port → fcService.
//
// Absent for anyone who cannot edit the deck (a viewer cannot accept edits).
// React Compiler is on — no manual memo.

import { ShieldCheckTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { useFloatingAgentRun } from "@ai-matrx/chat/agents/hooks/useFloatingAgentRun";

import { readListChangeProposal } from "@/features/content-ir/kinds/list-change-proposal";
import { toFlashcardDeckCards } from "@/features/content-ir/kinds/flashcard-deck-cards";
import { toast } from "@/lib/toast";
import { useAccess } from "@/utils/permissions/access";
import { canEditAccess } from "@/utils/permissions/access-core";

import { fcService } from "../../data/fcService";
import { FC_MANDATES } from "../../data/mandates";
import { useFlashcardMandates } from "../../data/mandate-disclosure";

/** A whole-deck read: generous, because the agent judges every card. */
const RUN_TIMEOUT_MS = 240_000;
const POLL_INTERVAL_MS = 250;
const LABEL = "Fix cards that give the answer away";

export function FixGiveawayCardsAction({ setId }: { setId: string }) {
  const access = useAccess("fc_set", setId);
  const canEdit = access.isOwner || canEditAccess(access.level);
  if (!canEdit) return null;
  return <FixGiveawayCardsButton setId={setId} />;
}

function FixGiveawayCardsButton({ setId }: { setId: string }) {
  // Disclosed in the shell's Agents menu — only where the job can launch.
  useFlashcardMandates(["fixGiveaways"]);
  const { run, isRunning } = useFloatingAgentRun({
    instanceId: `fc-giveaways:${setId}`,
  });

  async function start() {
    const deck = await fcService.getSetWithCards(setId);
    if (!deck.data) {
      toast.error("Couldn't read this deck", {
        description: deck.error ?? undefined,
      });
      return;
    }
    if (deck.data.cards.length === 0) {
      toast.info("This deck has no cards to check.");
      return;
    }
    try {
      await run({
        mandateKey: FC_MANDATES.fixGiveaways,
        label: LABEL,
        surfaceKey: "education-flashcards-giveaways",
        sourceFeature: "education-flashcards",
        initiation: "user",
        organizationId: deck.data.set.organization_id,
        variables: {
          deck_name: deck.data.set.name || "Untitled deck",
          set_id: setId,
          cards: toFlashcardDeckCards(
            deck.data.cards.map((c) => ({
              id: c.id,
              front: c.front,
              back: c.back ?? "",
            })),
          ),
        },
        timeoutMs: RUN_TIMEOUT_MS,
        pollIntervalMs: POLL_INTERVAL_MS,
        failureMessages: {
          streamError: "The check stopped before it finished",
          noJson: "The check finished without a list of changes",
          timeout: "The check took too long",
        },
        // The window renders the proposal; this only refuses an unreadable one.
        coerce: (value) => {
          const read = readListChangeProposal(value);
          if (!read) throw new Error("The proposed changes could not be read");
          return read;
        },
      });
    } catch (err) {
      toast.error("Couldn't check this deck", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  return (
    <ShieldCheckTapButton
      ariaLabel={LABEL}
      tooltip={LABEL}
      disabled={isRunning}
      onClick={() => void start()}
    />
  );
}
