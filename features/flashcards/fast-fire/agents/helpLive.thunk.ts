// features/flashcards/fast-fire/agents/helpLive.thunk.ts
//
// Fast Fire's thin wrapper over the generalized tutor lane
// (`features/education/tutor/lanes/helpLive.ts`, Phase 4 parity push). Builds
// REAL learner context from the drill's own Redux state — recent grades,
// due count, and this card's attempt history — instead of the historical
// `recent_correct: []` / `struggled_topics: []` stub. `timeOnCardMs` comes
// from the caller (`FastFireLiveCard` tracks when the card became visible;
// the timer deadline itself lives in a ref, not Redux, per the slice's design).
//
// The lane resolves through the mandate (FC_MANDATES.helpLive) — swap the
// agent behind it at /agents/mandates (the old localStorage agent-id config
// is RETIRED; bindings replaced it).

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { studyService } from "@/features/education/study/service/studyService";
import {
  helpLive as helpLiveCore,
  type HelpLiveResult,
} from "@/features/education/tutor/lanes/helpLive";
import {
  selectFastFireScoreboard,
  selectGradesInOrder,
  selectFastFireCards,
  selectFastFireSessionId,
} from "../redux/fastFire.selectors";

export type { HelpLiveResult };

const FC_CARD_ITEM_TYPE = "fc_card";

interface HelpLiveArgs {
  cardId: string;
  front: string;
  back: string;
  question?: string;
  /** Milliseconds the learner has spent looking at this card so far. */
  timeOnCardMs?: number;
}

/** Returns help, or null when the run failed. */
export function helpLive(args: HelpLiveArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<HelpLiveResult | null> => {
    const state = getState();
    const board = selectFastFireScoreboard(state);
    const grades = selectGradesInOrder(state);
    const cards = selectFastFireCards(state);

    // Real recent-correct/wrong from the grades resolved so far this drill,
    // newest first.
    const byId = new Map(cards.map((c) => [c.id, c]));
    const recentCorrect: string[] = [];
    const recentWrong: string[] = [];
    // Topics of the recently-missed cards (DrillCard carries `topic` when the
    // set has one) — the same "struggling with" signal StudyDeck derives.
    const struggledTopics = new Set<string>();
    for (let i = grades.length - 1; i >= 0 && (recentCorrect.length < 5 || recentWrong.length < 5); i--) {
      const g = grades[i];
      if (g.status !== "resolved" || g.result === null) continue;
      const drillCard = byId.get(g.cardId);
      const front = drillCard?.front;
      if (!front) continue;
      if (g.result === "correct" && recentCorrect.length < 5) recentCorrect.push(front);
      else if (g.result !== "correct" && recentWrong.length < 5) {
        recentWrong.push(front);
        if (drillCard?.topic?.trim()) struggledTopics.add(drillCard.topic.trim());
      }
    }

    // This card's real attempt history + the learner's real due count — both
    // small, cheap reads through the canonical study spine.
    const [historyRes, dueRes] = await Promise.all([
      studyService.listAttemptsForItem(FC_CARD_ITEM_TYPE, args.cardId, 5),
      studyService.listDue(FC_CARD_ITEM_TYPE, 200),
    ]);

    return dispatch(
      helpLiveCore({
        front: args.front,
        back: args.back,
        question: args.question,
        // D151: the drill advances on a timer, so the asking card is usually
        // gone before the answer arrives. Journal it against the drill's own
        // session so nothing paid for is lost to the deadline.
        cardId: args.cardId,
        sessionId: selectFastFireSessionId(state),
        sessionScore: board.avgScorePct != null ? board.avgScorePct / 100 : null,
        recentCorrect,
        recentWrong,
        struggledTopics: [...struggledTopics],
        dueCount: dueRes.data?.length ?? 0,
        timeOnCardMs: args.timeOnCardMs ?? 0,
        cardHistory: historyRes.data ?? [],
      }),
    );
  };
}
