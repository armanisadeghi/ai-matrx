/**
 * A workflow step's live TTS reaches the player the run page reads for THAT
 * step. The wire carries `(node_id, dispatch_id, item_index)` with the
 * non-fan-out default `dispatch_id: ""`; the run viewer asks by
 * `invocationKey` (`invocationKeyOf`, which maps "" and null to "root"). If the
 * two keys disagree the audio plays into a registry slot nobody renders —
 * silently. These frames are shaped exactly as aidream `_publish_framed`
 * sends them.
 */

import {
  createWorkflowMediaRouter,
  workflowLiveAudio,
  workflowLiveAudioKey,
} from "../transport/live-media";
import { invocationKeyOf, type NodeStreamEvent } from "../types";

const RUN = "4f3e2d1c-0b9a-4876-8543-210fedcba987";

function framesOf(payload: Record<string, unknown>, frameId: string, slices: number, seq0: number) {
  const text = JSON.stringify(payload);
  const size = Math.ceil(text.length / slices);
  return Array.from({ length: slices }, (_, i) => ({
    event: "node_stream",
    run_id: RUN,
    node_id: "narrate",
    dispatch_id: "",
    item_index: 0,
    kind: "media",
    delta: text.slice(i * size, (i + 1) * size),
    stream_seq: seq0 + i,
    ts: "2026-10-01T19:30:00Z",
    chunks_received: 0,
    chars_streamed: 0,
    frame_id: frameId,
    frame_index: i,
    frame_count: slices,
    block_shadowed: false,
  })) as unknown as NodeStreamEvent[];
}

describe("workflow live audio", () => {
  afterEach(() => workflowLiveAudio.destroy());

  it("plays a step's reassembled audio under the key the run viewer reads", () => {
    const router = createWorkflowMediaRouter(RUN);
    const chunk = {
      type: "audio_stream_chunk",
      stream_id: "tts-narrate",
      seq: 0,
      audio_base64: btoa("\u0000\u0001".repeat(400)),
      mime_type: "audio/L16;rate=24000",
      encoding: "pcm_s16le",
      sample_rate: 24000,
      bits_per_sample: 16,
      channels: 1,
    };
    for (const frame of framesOf(chunk, "media:01", 3, 10)) {
      expect(router.push(frame)).toBe(true);
    }
    const viewerKey = workflowLiveAudioKey(RUN, invocationKeyOf("narrate", null, 0));
    const player = workflowLiveAudio.player(viewerKey);
    expect(player).not.toBeNull();
    expect(player!.getBufferedMs()).toBeGreaterThan(0);
  });

  it("an incomplete frame set never reaches a player", () => {
    const router = createWorkflowMediaRouter(RUN);
    const [first] = framesOf({ type: "audio_stream_chunk", seq: 0 }, "media:02", 2, 20);
    router.push(first!);
    router.flush();
    expect(
      workflowLiveAudio.player(workflowLiveAudioKey(RUN, invocationKeyOf("narrate", null, 0))),
    ).toBeNull();
  });
});
