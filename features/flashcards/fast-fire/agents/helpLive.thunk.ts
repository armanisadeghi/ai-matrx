// features/flashcards/fast-fire/agents/helpLive.thunk.ts
//
// Fast Fire's thin wrapper over the generalized tutor lane
// (`features/flashcards/data/tutor/helpLive.ts`, Phase 4 parity push). Builds
// REAL learner context from the drill's own Redux state — recent grades,
// due count, and this card's attempt history — instead of the historical
// `recent_correct: []` / `struggled_topics: []` stub. `timeOnCardMs` comes
// from the caller (`FastFireLiveCard` tracks when the card became visible;
// the timer deadline itself lives in a ref, not Redux, per the slice's design).
//
// OPTIONAL (hard-requirement #6): with no help agent configured the caller
// gets `null` and the UI shows a "configure a help agent" hint — the drill
// is unaffected.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { studyService } from "@/features/education/study/service/studyService";
import {
  helpLive as helpLiveCore,
  type HelpLiveResult,
} from "../../data/tutor/helpLive";
import { getFcTutorAgentConfig } from "../../data/tutor/config";
import {
  selectFastFireScoreboard,
  selectGradesInOrder,
  selectFastFireCards,
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

/** Returns help, or null when no help agent is configured / it failed. */
export function helpLive(args: HelpLiveArgs) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<HelpLiveResult | null> => {
    const { helpAgentId } = getFcTutorAgentConfig();
    if (!helpAgentId) return null; // optional lane

    const state = getState();
    const board = selectFastFireScoreboard(state);
    const grades = selectGradesInOrder(state);
    const cards = selectFastFireCards(state);

    // Real recent-correct/wrong from the grades resolved so far this drill,
    // newest first.
    const byId = new Map(cards.map((c) => [c.id, c]));
    const recentCorrect: string[] = [];
    const recentWrong: string[] = [];
    for (let i = grades.length - 1; i >= 0 && (recentCorrect.length < 5 || recentWrong.length < 5); i--) {
      const g = grades[i];
      if (g.status !== "resolved" || g.result === null) continue;
      const front = byId.get(g.cardId)?.front;
      if (!front) continue;
      if (g.result === "correct" && recentCorrect.length < 5) recentCorrect.push(front);
      else if (g.result !== "correct" && recentWrong.length < 5) recentWrong.push(front);
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
        agentId: helpAgentId,
        sessionScore: board.avgScorePct != null ? board.avgScorePct / 100 : null,
        recentCorrect,
        recentWrong,
        struggledTopics: [], // Fast Fire's DrillCard carries no topic field
        dueCount: dueRes.data?.length ?? 0,
        timeOnCardMs: args.timeOnCardMs ?? 0,
        cardHistory: historyRes.data ?? [],
      }),
    );
  };
}
