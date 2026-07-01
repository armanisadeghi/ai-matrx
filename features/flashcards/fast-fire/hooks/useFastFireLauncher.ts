// features/flashcards/fast-fire/hooks/useFastFireLauncher.ts
//
// The START gesture. Loading a set's cards, opening a study session, and warming
// the mic are all kicked off from the user's click on "Start" so iOS grants the
// mic + resumes the AudioContext in a gesture (REQUIREMENTS §6). On success it
// dispatches `startDrill` — the slice takes over from there (countdown → cards).
//
// A SINGLE mic permission prompt for the WHOLE session is guaranteed because
// `startContinuousCapture` acquires ONE warm stream via the mic singleton, and
// nothing in the drill ever stops/re-acquires it mid-session.
//
// Sources cards from a REAL fc_set (hard-requirement #7): `getSetWithCards`,
// trimmed to the chosen limit — never the old hardcoded `historyFlashcards`.

"use client";

import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fcService } from "@/features/flashcards/data/fcService";
import { studyService } from "@/features/education/study/service/studyService";
import { startContinuousCapture } from "../audio/continuousCapture";
import { startDrill, setError } from "../redux/fastFireSlice";
import { selectFastFireConfig } from "../redux/fastFire.selectors";
import type { DrillCard } from "../redux/fastFireSlice";

const STUDY_MODE = "fast_fire";

export interface UseFastFireLauncherResult {
  start: () => Promise<void>;
  starting: boolean;
  startError: string | null;
}

export function useFastFireLauncher(): UseFastFireLauncherResult {
  const dispatch = useAppDispatch();
  const config = useAppSelector(selectFastFireConfig);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const start = async (): Promise<void> => {
    if (!config.setId) {
      setStartError("Pick a flashcard set first.");
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      // 1. Load the real set + ordered cards.
      const res = await fcService.getSetWithCards(config.setId);
      if (!res.data) {
        const msg = res.error ?? "Could not load the set.";
        setStartError(msg);
        dispatch(setError(msg));
        return;
      }
      const { set, cards: loaded } = res.data;
      if (loaded.length === 0) {
        setStartError("This set has no cards yet.");
        return;
      }

      // 2. Trim to the configured limit and flatten to the drill shape. Carry any
      //    already-cached spoken-front audio (fc_detail kind='spoken_front') so the
      //    drill can play the question aloud instantly. Generation is a separate
      //    pre-step (see FastFireSetup) so the mic-warm below stays in-gesture.
      const limited =
        config.cardLimit > 0 ? loaded.slice(0, config.cardLimit) : loaded;
      const drillCards: DrillCard[] = limited.map((c, i) => {
        const spoken = c.details.find(
          (d) => d.kind === "spoken_front" && !!d.audio_file_id,
        );
        return {
          id: c.id,
          front: c.front,
          back: c.back,
          position: c.position ?? i,
          spokenFrontFileId: spoken?.audio_file_id ?? null,
        };
      });

      // 3. Open a study session on the shared spine (best-effort — a failed
      //    session does NOT block the drill; attempts are valid session-less).
      const sessionRes = await studyService.createSession({
        mode: STUDY_MODE,
        // `study_session.source_kind` CHECK allows set/dynamic_batch/adaptive
        // (the source TYPE, not the table) — a single-set run is `set`.
        sourceKind: "set",
        sourceSetId: set.id,
        status: "active",
        settings: {
          seconds_per_card: config.secondsPerCard,
          card_count: drillCards.length,
          live_score: config.liveScore,
        },
      });
      if (sessionRes.error) {
        console.error("[useFastFireLauncher] createSession:", sessionRes.error);
      }
      const sessionId = sessionRes.data?.id ?? null;

      // 4. Warm the mic + start the ONE continuous recording (single prompt).
      //    Must run inside the click gesture, which it is.
      await startContinuousCapture();

      // 5. Hand off to the state machine.
      dispatch(
        startDrill({ cards: drillCards, sessionId, setName: set.name }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start the drill.";
      console.error("[useFastFireLauncher] start failed:", err);
      setStartError(msg);
      dispatch(setError(msg));
    } finally {
      setStarting(false);
    }
  };

  return { start, starting, startError };
}
