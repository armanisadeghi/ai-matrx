// features/flashcards/fast-fire/helper-audio/generateHelperAudio.thunk.ts
//
// PRE-GENERATED "I'm confused" helper audio — the zero-wait help lane the
// FastFire spec named as its headline ("fast fire = you never wait on the AI";
// Arman Q15 ruling 2026-08-20: all five missing FastFire features are wanted,
// helper audio FIRST). AGENT_SPECS.md §4 (`fc_write_helper`) is the contract:
// for each card, a short spoken-friendly explanation is written ahead of time,
// TTS-rendered ONCE to a durable file, and cached as
// fc_detail(kind='helper', audio_file_id) — so tapping "I'm confused" mid-drill
// plays instantly instead of launching a live run and waiting.
//
// Built by COMPOSING the live primitives, no new ones:
//   • helper TEXT   → the live `flashcards.enrich_card` mandate (its declared
//     job is fc_detail layers incl. 'helper'), via `runHeadlessAgentJson`.
//     A card that already has a text-only helper layer reuses it verbatim.
//   • helper AUDIO  → the `flashcards.helper_tts` mandate (same TTS holder as
//     spoken fronts, its own key so the calm helper voice is independently
//     rebindable), read back exactly like spoken fronts (`readAudioFileId`).
//   • persistence   → `fcService.addDetail` / `fcService.setDetailAudio`.
//
// Timing mirrors spoken fronts (owner ruling 2026-07-01): ON-DEMAND from a
// Prepare affordance, NEVER at card creation; cached durably; a card that has
// audio is never re-generated. Missing cards dispatch concurrently — matrx-ai
// owns provider admission (2026-08-18 ruling, features/flashcards/FEATURE.md).

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { selectLatestRequestId } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { runHeadlessAgentJson } from "@/features/agents/redux/execution-system/thunks/run-headless-agent-json";
import { fcService } from "@/features/flashcards/data/fcService";
import { FC_MANDATES } from "@/features/flashcards/data/mandates";
import { coerceDetails } from "@/features/flashcards/data/enhanceCard";
import type { CardWithDetails } from "@/features/flashcards/data/types";
import { readAudioFileId } from "../spoken-front/generateSpokenFront.thunk";

/** Mandate key for the helper-audio TTS lane — resolves live to the DB-bound
 *  TTS agent; swap the voice at /agents/mandates, no deploy. */
export const HELPER_TTS_MANDATE = "flashcards.helper_tts";

// The helper is EXPLANATION, not gameplay: calm, warm, unhurried — the exact
// opposite register of the spoken-front quiz host. One consistent voice (no
// variation bank): a learner who is confused needs steadiness, not flavor.
const HELPER_SPEECH_STYLE = {
  sample_context:
    "A calm one-on-one tutoring moment. The learner just said they're " +
    "confused; this is the short, clear explanation that unblocks them.",
  speaker_profile:
    "A warm, patient tutor who explains clearly at a relaxed, measured pace.",
  directors_notes:
    "Calm, reassuring, unhurried. Clear diction, gentle emphasis on the key " +
    "idea. No urgency, no game-show energy.",
  scene: "A quiet study room, one-on-one, no clock.",
} as const;

/**
 * Read-only readiness: how many of a set's cards already have CACHED helper
 * audio (a durable fc_detail(kind='helper') with audio_file_id) vs the total.
 */
export async function getHelperAudioReadiness(
  setId: string,
): Promise<{ ready: number; total: number }> {
  const res = await fcService.getSetWithCards(setId);
  if (!res.data) return { ready: 0, total: 0 };
  const cards = res.data.cards;
  const ready = cards.filter((c) =>
    c.details.some((d) => d.kind === "helper" && !!d.audio_file_id),
  ).length;
  return { ready, total: cards.length };
}

/** A card's cached helper layer, split by what it still needs. */
function findHelper(card: CardWithDetails): {
  withAudio: string | null;
  textOnly: { id: string; text: string } | null;
} {
  const withAudio =
    card.details.find((d) => d.kind === "helper" && !!d.audio_file_id)
      ?.audio_file_id ?? null;
  const textRow = card.details.find(
    (d) => d.kind === "helper" && !d.audio_file_id && !!d.text?.trim(),
  );
  return {
    withAudio,
    textOnly: textRow ? { id: textRow.id, text: textRow.text } : null,
  };
}

/** Write the helper explanation for ONE card via the live enrich mandate. */
function writeHelperText(card: CardWithDetails) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    const existing = card.details.map((d) => ({ kind: d.kind, text: d.text }));
    const result = await runHeadlessAgentJson(dispatch, getState, {
      mandateKey: FC_MANDATES.enrichCard,
      surfaceKey: "flashcards-helper-audio-text",
      sourceFeature: "education-fastfire",
      surfaceName: "matrx-user/education-fastfire",
      initiation: "auto",
      variables: {
        front: card.front,
        back: card.back,
        topic: card.topic ?? "",
        // The enrich agent's free-text difficulty channel carries the spoken
        // register (declared variables are the only way values reach a bound
        // agent — same fold the depth tiers use).
        difficulty:
          "foundational recall — write ONE short helper: a 2-4 sentence, " +
          "spoken-friendly explanation a confused learner could hear read " +
          "aloud (plain words, no markdown, no formulas-as-symbols)",
        kinds: ["helper"],
        existing_details: existing,
      },
      timeoutMs: 60_000,
      pollIntervalMs: 150,
    });
    const helper = coerceDetails(result.data).find((d) => d.kind === "helper");
    if (!helper?.text) {
      // Loud, never silent — a whole batch failing here must not read as done.
      console.error(
        `[fastfire.helper] no helper text for card ${card.id}:`,
        result.error ?? "agent returned no helper layer",
      );
      return null;
    }
    return helper.text;
  };
}

/** TTS-render one helper text to a durable audio file_id (null on failure). */
function renderHelperAudio(cardId: string, text: string) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    let conversationId: string | null = null;
    try {
      const launch = await dispatch(
        launchAgentExecution({
          mandateKey: HELPER_TTS_MANDATE,
          surfaceKey: `fastfire-helper-tts-${cardId}`,
          sourceFeature: "education-fastfire",
          isEphemeral: false,
          runtime: {
            surfaceName: "matrx-user/education-fastfire",
            variables: {
              content: `[calm/reassuring] ${text}`,
              ...HELPER_SPEECH_STYLE,
            },
          },
          config: { autoRun: true, displayMode: "background" },
        }),
      ).unwrap();
      conversationId = launch.conversationId;
      const requestId =
        launch.requestId ??
        selectLatestRequestId(launch.conversationId)(getState());
      if (!requestId) return null;
      const fileId = readAudioFileId(getState(), requestId);
      if (!fileId) {
        console.error(`[fastfire.helper-tts] no audio for card ${cardId}`);
        return null;
      }
      return fileId;
    } catch (err) {
      console.error(`[fastfire.helper-tts] failed for ${cardId}:`, err);
      return null;
    } finally {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    }
  };
}

/**
 * Ensure ONE card has helper text + durable helper audio. Returns the audio
 * file_id, or null on any failure (never throws — the drill degrades to the
 * live help lane, exactly as before this feature existed).
 */
export function generateHelperAudio(card: CardWithDetails) {
  return async (dispatch: AppDispatch): Promise<string | null> => {
    const { withAudio, textOnly } = findHelper(card);
    if (withAudio) return withAudio;

    const text = textOnly?.text ?? (await dispatch(writeHelperText(card)));
    if (!text) return null;

    const fileId = await dispatch(renderHelperAudio(card.id, text));
    if (!fileId) return null;

    const persisted = textOnly
      ? await fcService.setDetailAudio(textOnly.id, fileId)
      : await fcService.addDetail(card.id, "helper", text, {
          audio_file_id: fileId,
          generated_by: "agent",
        });
    if (persisted.error) {
      // The audio exists; it just isn't cached for next time. Loud, not fatal.
      console.error(
        `[fastfire.helper-tts] persist failed for ${card.id}:`,
        persisted.error,
      );
    }
    return fileId;
  };
}

/**
 * Ensure every card in a set has cached helper audio, generating the missing
 * ones concurrently. Returns cardId → audio file_id for the whole set.
 * On-demand only — call from a Prepare affordance, never at creation.
 */
export function ensureHelperAudioForSet(
  setId: string,
  onProgress?: (done: number, total: number) => void,
) {
  return async (dispatch: AppDispatch): Promise<Record<string, string>> => {
    const result: Record<string, string> = {};
    const setRes = await fcService.getSetWithCards(setId);
    if (!setRes.data) return result;
    const cards = setRes.data.cards;
    const total = cards.length;

    const todo: CardWithDetails[] = [];
    cards.forEach((c) => {
      const cached = findHelper(c).withAudio;
      if (cached) result[c.id] = cached;
      else todo.push(c);
    });

    let done = cards.length - todo.length;
    onProgress?.(done, total);
    if (todo.length === 0) return result;

    await Promise.all(
      todo.map(async (card) => {
        const fileId = await dispatch(generateHelperAudio(card));
        if (fileId) result[card.id] = fileId;
        done += 1;
        onProgress?.(done, total);
      }),
    );
    return result;
  };
}
