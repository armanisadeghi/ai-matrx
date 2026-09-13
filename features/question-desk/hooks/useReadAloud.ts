"use client";

// features/question-desk/hooks/useReadAloud.ts
//
// R — read this question out loud; Esc — stop.
//
// Three rules this hook exists to keep:
//
// 1. VOICE AND SPEED ARE NOT OURS. They come from the tiered `listening` config
//    (system → organization → user), resolved inside the Cartesia adapter at
//    start time. This hook passes NO voice, NO speed and NO language — reading
//    a preference here would be a second knob for the same thing.
// 2. THE GESTURE PRIMES THE OUTPUT. `primeAudioOutput()` runs synchronously
//    inside the key handler / click that starts speech; a browser only unlocks
//    audio inside a real user gesture, and an async hop first means silence
//    with no error.
// 3. WHICH PARTS ARE READ IS A KNOB (`question_desk.read_aloud_parts`). The
//    parts are spoken as ONE utterance, in the knob's order, separated by a
//    short spoken cue ("Background." / "My recommendation.") so a listener can
//    hear where one part ends and the next begins.

import { useCallback, useMemo } from "react";
import { useAudioPlayback } from "@/features/audio/playback/useAudioPlayback";
import { useSpeech } from "@/features/audio/service/useSpeech";
import { primeAudioOutput } from "@/features/audio/unlock";
import type { DecisionQuestionRow } from "../types";
import type { ReadAloudPart } from "./useQuestionDeskKnobs";

/** The spoken cue that introduces each part. Empty = read straight through. */
const CUE: Record<ReadAloudPart, string> = {
  title: "",
  question: "",
  background: "Background.",
  recommendation: "My recommendation.",
  ruled_before: "What you ruled before.",
  the_best_do: "What the best in the world do.",
  today: "What the system does today.",
  implications: "What each way costs.",
};

function partText(
  question: DecisionQuestionRow,
  part: ReadAloudPart,
): string | null {
  const value =
    part === "title"
      ? question.title
      : part === "question"
        ? question.question
        : question[part];
  if (typeof value !== "string") return null;
  return value.length > 0 ? value : null;
}

/** The exact words that will be spoken — also what the button's title shows. */
export function readAloudScript(
  question: DecisionQuestionRow,
  parts: readonly ReadAloudPart[],
): string {
  const chunks: string[] = [];
  for (const part of parts) {
    const text = partText(question, part);
    if (!text) continue;
    const cue = CUE[part];
    chunks.push(cue ? `${cue}\n\n${text}` : text);
  }
  return chunks.join("\n\n");
}

export interface ReadAloud {
  /** Speak this question. MUST be called inside the user's gesture. */
  read: (question: DecisionQuestionRow) => void;
  /** Stop immediately (Esc). */
  stop: () => void;
  /** True while this surface's utterance is loading or playing. */
  speaking: boolean;
  /**
   * Why the voice did not speak, in the queue's words. NOTHING FAILS SILENTLY:
   * a read-aloud that dies inside the playback queue would otherwise leave the
   * button sitting there looking idle, which is a screen lying about what it
   * just did.
   */
  error: string | null;
  /** Nothing in the knob's parts had any text on this question. */
  nothingToRead: (question: DecisionQuestionRow) => boolean;
}

export function useReadAloud(parts: readonly ReadAloudPart[]): ReadAloud {
  const { speak, status, itemId, remove } = useSpeech({
    purpose: "assistant",
    label: "Question Desk",
    processMarkdown: false,
  });
  const { items } = useAudioPlayback();

  const speaking = status === "playing" || status === "loading";
  const failed =
    status === "error"
      ? (items.find((item) => item.id === itemId)?.error ??
        "The voice service could not be reached.")
      : null;
  const error = failed
    ? `${/[.!?]$/.test(failed) ? failed : `${failed}.`} Read it on screen, or try again once the voice service answers.`
    : null;

  const read = useCallback(
    (question: DecisionQuestionRow) => {
      // Inside the gesture, before anything async.
      primeAudioOutput();
      const script = readAloudScript(question, parts);
      if (!script) return;
      speak(script);
    },
    [parts, speak],
  );

  const stop = useCallback(() => {
    if (itemId) remove(itemId);
  }, [itemId, remove]);

  const nothingToRead = useCallback(
    (question: DecisionQuestionRow) => readAloudScript(question, parts) === "",
    [parts],
  );

  return useMemo(
    () => ({ read, stop, speaking, error, nothingToRead }),
    [read, stop, speaking, error, nothingToRead],
  );
}
