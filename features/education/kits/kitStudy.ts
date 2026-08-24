// features/education/kits/kitStudy.ts
//
// THE KIT IS FOR STUDYING — this is what makes its page a study surface rather
// than a list of links.
//
// Arman, on why the kit has to exist at all: *"when a kit is studying, that's
// kind of the whole point."* A learner who opens their chemistry chapter should
// see where they stand and be one tap from the next thing to practise — not read
// a directory of artifacts and have to work out which one to click.
//
// It reads the canonical study spine (`item_mastery` through `studyService`), so
// the numbers here are the SAME numbers the deck page and the planner show. No
// second progress model, no derived store.
//
// 🚨 Mastery is recomputed LIVE via `displayMasteryPct`, never read off
// `item_mastery.mastery_score`. That column is a WRITE-TIME SNAPSHOT (~1 at the
// moment of review) and decays continuously with elapsed time — trusting it
// would show a deck last touched a month ago as freshly mastered, and would
// silently disagree with the deck page and the planner, which both decay.
// `masteryFsrs.ts` states the rule; this is a reader, so it obeys it.

"use client";

import { fcService } from "@/features/flashcards/data/fcService";
import { studyService } from "@/features/education/study/service/studyService";
import { displayMasteryPct } from "@/features/education/study/utils/masteryFsrs";

const FC_CARD = "fc_card";

/** One of the kit's decks, reduced to what the study read needs. */
interface LoadedDeck {
  id: string;
  cardIds: string[];
}

export interface KitStudyState {
  /** The deck the Study action opens (the kit's largest). */
  setId: string;
  cardCount: number;
  /** Cards with a mastery row — i.e. seen at least once. */
  studiedCount: number;
  /** Cards whose review is due now — what "study" would actually serve. */
  dueCount: number;
  /** 0..100, mean mastery across every card (unseen counts as 0). */
  masteryPct: number;
}

/**
 * Study state for a kit, computed from its decks. Returns null when the kit has
 * no deck (a summary-only kit has nothing to practise yet) so the surface can
 * omit the bar rather than render a row of zeroes.
 *
 * Reads the LARGEST deck when a kit has several — the one a learner means by
 * "study this". Best-effort: a failed read yields null and the page still works.
 */
export async function readKitStudyState(
  setIds: string[],
): Promise<KitStudyState | null> {
  if (setIds.length === 0) return null;
  try {
    const decks = await Promise.all(
      setIds.map(async (id): Promise<LoadedDeck | null> => {
        const res = await fcService.getSetWithCards(id);
        if (!res.data || res.data.cards.length === 0) return null;
        return { id, cardIds: res.data.cards.map((c) => c.id) };
      }),
    );
    // flatMap narrows without a hand-written type predicate (which would be
    // claiming a narrower shape than the array actually holds).
    const usable = decks.flatMap((d) => (d ? [d] : []));
    if (usable.length === 0) return null;

    const deck = usable.reduce((a, b) =>
      b.cardIds.length > a.cardIds.length ? b : a,
    );
    const mastery = await studyService.getMasteryBulk(
      deck.cardIds.map((id) => ({ itemType: FC_CARD, itemId: id })),
    );
    const rows = mastery.data ?? [];
    const now = new Date();
    const nowMs = now.getTime();
    const dueCount = rows.filter(
      (r) => r.due_at != null && new Date(r.due_at).getTime() <= nowMs,
    ).length;
    // Unseen cards count as 0 — "40% mastered" must mean 40% of the DECK, not
    // 40% of the handful already touched, which would read as progress a
    // learner has not made.
    const scoreSum = rows.reduce(
      (sum, r) => sum + (displayMasteryPct(r, now) ?? 0),
      0,
    );
    return {
      setId: deck.id,
      cardCount: deck.cardIds.length,
      studiedCount: rows.length,
      dueCount,
      masteryPct: Math.round((scoreSum / deck.cardIds.length) * 100),
    };
  } catch (err) {
    console.error("[kits] study state read failed:", err);
    return null;
  }
}

/**
 * What the kit's primary action should say and where it goes.
 *
 * 🚨 It always opens the deck's own study surface. There is NO per-kit due
 * queue: `/education/flashcards/review` studies the FSRS due queue across ALL
 * decks, and `[setId]/study` takes no mode parameter — so a "review this kit's
 * due cards" link would be a promise the product cannot keep. The due count is
 * reported as a FACT next to the button, never as the destination.
 */
export function kitStudyAction(state: KitStudyState): {
  label: string;
  href: string;
} {
  const href = `/education/flashcards/${state.setId}/study`;
  if (state.studiedCount === 0) return { label: "Start studying", href };
  return { label: "Keep studying", href };
}
