// features/flashcards/fast-fire/spoken-front/generateSpokenFront.thunk.ts
//
// Optional spoken card fronts for Fast Fire (owner design 2026-07-01). Generates
// a high-energy, fast-paced narration of each card's question via the "Generate
// custom speech" agent (Google Gemini TTS) and CACHES it as a durable
// fc_detail(kind='spoken_front') so playback in the drill is instant.
//
// Delivery mechanism (resolved — see docs/FASTFIRE_SPOKEN_FRONTS_SPEC.md): the
// TTS agent streams its audio back as an `audio_output` render block whose data
// is a UnifiedMediaBlock carrying a durable `fileId` once complete (matrx origin).
// We launch with autoRun:true (the launch thunk runs to completion), then read
// that block by requestId and persist the fileId. No manual upload needed.
//
// Timing: generate ON-DEMAND (first time the option is used), batched ~5 at a
// time — NEVER at card creation (a 50-card set would be far too expensive).

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { selectRenderBlocksByType } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { selectLatestRequestId } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { fcService } from "@/features/flashcards/data/fcService";
import { pickSpokenFrontVariables } from "./variations";

/** Permanent id of the "Generate custom speech" agent (Google Gemini TTS). */
export const SPOKEN_FRONT_TTS_AGENT_ID = "04f69dff-a258-4791-a44e-b7b87f346b9d";

/** Max concurrent TTS generations (owner: ~5 at a time). */
const CONCURRENCY = 5;

interface SpokenFrontCard {
  id: string;
  front: string;
}

/** Pull the durable audio fileId out of the completed audio render block. */
function readAudioFileId(state: RootState, requestId: string): string | null {
  const blocks = selectRenderBlocksByType(requestId, "audio_output")(state);
  if (!blocks) return null;
  // Prefer a complete block with a durable fileId; take the last one.
  for (let i = blocks.length - 1; i >= 0; i--) {
    const data = blocks[i]?.data as
      | { fileId?: string | null; file_id?: string | null; status?: string }
      | undefined;
    const fileId = data?.fileId ?? data?.file_id ?? null;
    if (fileId) return fileId;
  }
  return null;
}

/**
 * Generate + persist ONE card's spoken front. Returns the durable audio file_id,
 * or null on any failure (never throws — the drill degrades to no audio).
 */
export function generateSpokenFront(
  card: SpokenFrontCard,
  index: number,
  total: number,
) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    const vars = pickSpokenFrontVariables(card.id, card.front, index, total);
    let conversationId: string | null = null;
    try {
      const launch = await dispatch(
        launchAgentExecution({
          agentId: SPOKEN_FRONT_TTS_AGENT_ID,
          surfaceKey: `fastfire-tts-${card.id}`,
          // Persisted like the other Fast Fire runs; a distinct system
          // source_feature keeps it out of the user's normal chats.
          sourceFeature: "fastfire-tts",
          isEphemeral: false,
          runtime: {
            variables: {
              content: vars.content,
              sample_context: vars.sample_context,
              speaker_profile: vars.speaker_profile,
              directors_notes: vars.directors_notes,
              scene: vars.scene,
            },
          },
          // autoRun:true → the launch thunk executes AND polls to completion
          // before returning, so the audio render block is present afterward.
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
        console.error(`[fastfire.tts] no audio produced for card ${card.id}`);
        return null;
      }

      // Cache as the card's durable spoken_front detail.
      const res = await fcService.addDetail(card.id, "spoken_front", vars.content, {
        audio_file_id: fileId,
        generated_by: "agent",
      });
      if (res.error) {
        console.error(`[fastfire.tts] persist failed for ${card.id}:`, res.error);
        // The audio still exists (fileId) even if the detail write failed — return
        // it so this session can play it; it just won't be cached for next time.
      }
      return fileId;
    } catch (err) {
      console.error(`[fastfire.tts] generation failed for ${card.id}:`, err);
      return null;
    } finally {
      if (conversationId) dispatch(destroyInstanceIfAllowed(conversationId));
    }
  };
}

/**
 * Ensure every card in a set has a spoken front, generating the missing ones
 * ~5 at a time. Returns a map of cardId → audio file_id for the whole set
 * (existing + newly generated). `onProgress(done, total)` fires as each resolves.
 * On-demand only — call this when the learner enables/starts a spoken drill.
 */
export function ensureSpokenFrontsForSet(
  setId: string,
  onProgress?: (done: number, total: number) => void,
) {
  return async (
    dispatch: AppDispatch,
  ): Promise<Record<string, string>> => {
    const result: Record<string, string> = {};
    const setRes = await fcService.getSetWithCards(setId);
    if (!setRes.data) return result;
    const cards = setRes.data.cards;
    const total = cards.length;

    // Partition: cards that already have a ready spoken_front (cached) vs. to-do.
    const todo: { card: SpokenFrontCard; index: number }[] = [];
    cards.forEach((c, index) => {
      const existing = c.details.find(
        (d) => d.kind === "spoken_front" && !!d.audio_file_id,
      );
      if (existing?.audio_file_id) {
        result[c.id] = existing.audio_file_id;
      } else {
        todo.push({ card: { id: c.id, front: c.front }, index });
      }
    });

    let done = cards.length - todo.length;
    onProgress?.(done, total);
    if (todo.length === 0) return result;

    // Simple concurrency pool of CONCURRENCY workers over the to-do queue.
    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < todo.length) {
        const item = todo[cursor++];
        const fileId = await dispatch(
          generateSpokenFront(item.card, item.index, total),
        );
        if (fileId) result[item.card.id] = fileId;
        done += 1;
        onProgress?.(done, total);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, todo.length) }, () => worker()),
    );
    return result;
  };
}
