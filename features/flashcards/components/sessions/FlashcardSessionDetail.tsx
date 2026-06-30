"use client";

// features/flashcards/components/sessions/FlashcardSessionDetail.tsx
//
// Flashcards' thin adapter over the generic, mode-agnostic SessionDetailView: it
// supplies a labelResolver that turns each attempt's item_id (an fc_card id) into
// the card's front, so the session ledger reads "What is the powerhouse of the
// cell?" instead of a UUID. The generic detail view stays decoupled from fcService.

import { SessionDetailView } from "@/features/education/study/components/SessionDetailView";
import type { SessionWithAttempts } from "@/features/education/study/types";
import { fcService } from "../../data/fcService";

// Module-level (stable identity) so the detail view's effect deps don't churn.
async function resolveFlashcardLabels(
  data: SessionWithAttempts,
): Promise<Record<string, string>> {
  const setId = data.session.source_set_id;
  if (!setId) return {};
  const res = await fcService.getSetWithCards(setId);
  if (!res.data) return {};
  const map: Record<string, string> = {};
  for (const card of res.data.cards) map[card.id] = card.front;
  return map;
}

export function FlashcardSessionDetail({ sessionId }: { sessionId: string }) {
  return (
    <SessionDetailView
      sessionId={sessionId}
      backHref="/education/flashcards/sessions"
      labelResolver={resolveFlashcardLabels}
    />
  );
}
