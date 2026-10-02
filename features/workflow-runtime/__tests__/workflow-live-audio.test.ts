/**
 * A workflow step's live TTS reaches the player the run page reads for THAT
 * step. The wire carries `(node_id, dispatch_id, item_index)` with the
 * non-fan-out default `dispatch_id: ""`; the run viewer asks by
 * `invocationKey` (`invocationKeyOf`, which maps "" and null to "root"). If the
 * two keys disagree the audio plays into a registry slot nobody renders —
 * silently. These frames are shaped exactly as aidream `_publish_framed`
 * sends them.
 *
 * Breaks each case catches: frames joined in arrival order instead of
 * `frame_index` order; chunks played out of `seq` order or with a lost slice
 * (audio with a hole); a set played with a frame missing;
 * no reassembly at all; the wrong registry key; a run view leaving players
 * (and their AudioContexts) behind; a reattach stuck on the old stream.
 */

import {
  createWorkflowMediaRouter,
  workflowLiveAudio,
  workflowLiveAudioKey,
} from "../transport/live-media";
import { invocationKeyOf, type NodeStreamEvent } from "../types";

const RUN = "4f3e2d1c-0b9a-4876-8543-210fedcba987";
const VIEWER_KEY = workflowLiveAudioKey(RUN, invocationKeyOf("narrate", null, 0));

/** One `audio_stream_chunk` of `samples` 16-bit mono samples at 24 kHz. */
function pcmChunk(seq: number, samples: number) {
  return {
    type: "audio_stream_chunk",
    stream_id: "tts-narrate",
    seq,
    audio_base64: btoa("\u0000\u0001".repeat(samples)),
    mime_type: "audio/L16;rate=24000",
    encoding: "pcm_s16le",
    sample_rate: 24000,
    bits_per_sample: 16,
    channels: 1,
  };
}

/** 24 kHz mono: `samples` samples last samples / 24 ms. */
const msOf = (samples: number) => samples / 24;

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
    for (const frame of framesOf(pcmChunk(0, 400), "media:01", 3, 10)) {
      expect(router.push(frame)).toBe(true);
    }
    const player = workflowLiveAudio.player(VIEWER_KEY);
    expect(player).not.toBeNull();
    expect(player!.getBufferedMs()).toBeCloseTo(msOf(400), 5);
  });

  it("joins slices by frame_index when they arrive out of order", () => {
    const router = createWorkflowMediaRouter(RUN);
    const [a, b, c] = framesOf(pcmChunk(0, 600), "media:03", 3, 30);
    for (const frame of [c!, a!, b!]) router.push(frame);
    expect(workflowLiveAudio.player(VIEWER_KEY)?.getBufferedMs()).toBeCloseTo(msOf(600), 5);
  });

  it("plays consecutive chunks gap-free, and a lost slice mid-stream never plays audio with a hole", () => {
    const router = createWorkflowMediaRouter(RUN);
    for (const frame of framesOf(pcmChunk(0, 400), "media:04", 2, 40)) router.push(frame);
    for (const frame of framesOf(pcmChunk(1, 200), "media:05", 2, 42)) router.push(frame);
    expect(workflowLiveAudio.player(VIEWER_KEY)?.getBufferedMs()).toBeCloseTo(msOf(600), 5);

    // Chunk 2 loses its middle slice; chunk 3 arrives whole. Playing chunk 3
    // after chunk 1 would skip audio, so the live stream drops (the saved file
    // takes over) instead.
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const lost = framesOf(pcmChunk(2, 400), "media:06", 3, 44);
    router.push(lost[0]!);
    router.push(lost[2]!);
    for (const frame of framesOf(pcmChunk(3, 400), "media:07", 2, 47)) router.push(frame);
    expect(workflowLiveAudio.player(VIEWER_KEY)).toBeNull();
    warn.mockRestore();
  });

  it("an incomplete frame set never reaches a player", () => {
    const router = createWorkflowMediaRouter(RUN);
    const [first, , third] = framesOf(pcmChunk(0, 400), "media:02", 3, 20);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    router.push(first!);
    router.push(third!);
    router.flush();
    warn.mockRestore();
    expect(workflowLiveAudio.player(VIEWER_KEY)).toBeNull();
  });

  it("leaving the run view destroys its players; a reattach plays the replay fresh", () => {
    const router = createWorkflowMediaRouter(RUN);
    for (const frame of framesOf(pcmChunk(0, 400), "media:16", 2, 60)) router.push(frame);
    for (const frame of framesOf(pcmChunk(1, 400), "media:17", 2, 62)) router.push(frame);
    const before = workflowLiveAudio.player(VIEWER_KEY);
    expect(before?.getBufferedMs()).toBeCloseTo(msOf(800), 5);
    const destroy = jest.spyOn(before!, "destroy");

    router.dispose();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(workflowLiveAudio.player(VIEWER_KEY)).toBeNull();

    // A rejoin replays the stream from seq 0 under the same key.
    const again = createWorkflowMediaRouter(RUN);
    for (const frame of framesOf(pcmChunk(0, 200), "media:18", 2, 70)) again.push(frame);
    const after = workflowLiveAudio.player(VIEWER_KEY);
    expect(after).not.toBe(before);
    expect(after?.getBufferedMs()).toBeCloseTo(msOf(200), 5);
  });
});
