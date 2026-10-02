/**
 * A speech-script run renders the SAME script live as after a reload.
 *
 * The break this catches (2026-09-22): during a TTS run only the player showed;
 * the performed script appeared after a reload, because the live `media_block`
 * event carried only the generation metadata and the live path never lifted
 * `speech_script` to the block data the player's script panel reads.
 *
 * Both fixtures are REAL, captured from one localhost run of the Gemini TTS
 * podcast-intro agent (admin@admin.com, 2026-09-22): the `media_block` event
 * off the /v2/ai/manual stream, and the audio part persisted on that turn's
 * assistant message (chat.message, same file_id).
 */

import liveEvent from "./fixtures/gemini-live-media-block-event.json";
import persistedPart from "./fixtures/gemini-persisted-audio-part.json";
import { fromMediaBlock, type WireMediaBlock } from "@/features/files/blocks/adapters/from-media-block";
import { normalizeContentBlocks } from "@/features/agents/redux/execution-system/utils/normalize-content-blocks";
import { withPerformedScript } from "@/features/agents/speech-script/types";
import { readPerformedScript } from "@/components/mardown-display/blocks/audio/SpeechScriptPanel";
import type { MessagePart } from "@/types/python-generated/stream-events";

/** Exactly the data process-stream.ts dispatches for a live audio media_block. */
function liveBlockData(): Record<string, unknown> {
  const unified = fromMediaBlock((liveEvent as { data: { block: WireMediaBlock } }).data.block);
  return withPerformedScript(unified, unified.metadata) as unknown as Record<string, unknown>;
}

function reloadedBlockData(): Record<string, unknown> {
  const [block] = normalizeContentBlocks([persistedPart as unknown as MessagePart]);
  return block.data as Record<string, unknown>;
}

describe("speech script: live and reload render alike", () => {
  it("the captured live event carries the performed script", () => {
    const script = readPerformedScript(liveBlockData());
    expect(script).not.toBeNull();
    expect(script!.turns.map((t) => t.speaker)).toEqual(["Maya", "Sam", "Maya"]);
    expect(script!.turns[1].text).toBe(
      "And I'm Sam. Honestly, I have been waiting all week for this one. Dr. Lena Ortiz, thanks for coming in.",
    );
  });

  it("the live script equals the reloaded script, turn for turn", () => {
    expect(readPerformedScript(liveBlockData())).toEqual(readPerformedScript(reloadedBlockData()));
  });

  it("lifts speech_script to the top of the block data on both paths", () => {
    expect(liveBlockData().speech_script).toEqual(reloadedBlockData().speech_script);
  });
});
