// features/flashcards/data/enrichCardLane.ts
//
// ENRICH ONE CARD, ALL THE WAY. `enrichCard` (data/enhanceCard.ts) only
// GENERATES a proposal; every caller then had to re-implement "now write the
// rows". This is the one composed lane — generate → persist `fc_detail` rows →
// clear the card's pending proposal — shared by BOTH real entry points:
//
//   • the study surface's in-place "Add more on this card" (single card), and
//   • "Enrich every card" on set detail (the batch),
//
// so a layer written by the batch and a layer written on the card are the same
// rows, written the same way. The preview-first path (EnhanceSetDialog, where
// the learner confirms before anything is written) keeps its own save step on
// purpose: it is a different product promise, not a different persistence path.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { Depth } from "@/features/education/assessment/data/types";
import { enrichCard, writePendingEnhancement } from "./enhanceCard";
import { fcService } from "./fcService";
import type { CardWithDetails, FcDetailRow } from "./types";

export type EnrichCardOutcome =
  /** New layers exist on the card, in the DB, right now. */
  | { status: "saved"; rows: FcDetailRow[] }
  /** The agent ran and honestly had nothing to add. Not a failure. */
  | { status: "empty" }
  /** Generation or persistence failed — the message is learner-facing. */
  | { status: "failed"; error: string };

/**
 * Generate detail layers for ONE card and write them. Never throws: every
 * failure comes back as `{status:"failed"}` so a batch can survive one bad card.
 */
export function enrichAndSaveCard(args: {
  card: CardWithDetails;
  depth: Depth;
  /** Live-render handle — see `enrichCard`; the caller owns the instance. */
  onConversationCreated?: (conversationId: string) => void;
  /**
   * The run's requestId, mid-stream — the handle a surface subscribes to in
   * order to render the `card_enrichment` kind AS IT ARRIVES (bulk enrich's
   * live cascade). See `enrichCard`.
   */
  onRequestId?: (requestId: string) => void;
}) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<EnrichCardOutcome> => {
    const { card, depth } = args;
    const details = await enrichCard({
      card,
      depth,
      ...(args.onConversationCreated
        ? { onConversationCreated: args.onConversationCreated }
        : {}),
      ...(args.onRequestId ? { onRequestId: args.onRequestId } : {}),
    })(dispatch, getState).catch(() => null);
    return finishEnrich(card, details);
  };
}

/** The persistence half, split out so the runner can call it directly. */
export async function persistEnrichedDetails(
  card: CardWithDetails,
  details: { kind: string; text: string }[],
): Promise<EnrichCardOutcome> {
  const base = card.details.length;
  const results = await Promise.all(
    details.map((d, i) =>
      fcService.addDetail(card.id, d.kind, d.text, {
        generated_by: "agent",
        position: base + i,
      }),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed) {
    return {
      status: "failed",
      error: failed.error ?? "Couldn't save the new layers.",
    };
  }
  // The proposal has become real rows — it is no longer pending (D151).
  await writePendingEnhancement(card.id, null);
  return {
    status: "saved",
    rows: results.map((r) => r.data).filter((r): r is FcDetailRow => !!r),
  };
}

async function finishEnrich(
  card: CardWithDetails,
  details: { kind: string; text: string }[] | null,
): Promise<EnrichCardOutcome> {
  if (!details) {
    return { status: "failed", error: "The AI couldn't enrich this card." };
  }
  if (details.length === 0) return { status: "empty" };
  return persistEnrichedDetails(card, details);
}
