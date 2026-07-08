/**
 * SinkAwarePlayer state machine + sink routing.
 *
 * Uses the `createContext` test seam with a fake AudioContext — no real Web
 * Audio in jsdom. Verifies the WebPlayer-contract parity (throw-before-play,
 * pause/resume/toggle, buffer chunk scheduling, short-read termination) and
 * the sink behavior that motivated the fork (apply-at-creation, mid-utterance
 * re-route, Firefox/Safari no-setSinkId fallback, closed-context guard).
 */

import {
  SinkAwarePlayer,
  type PlayableSource,
  type SinkAwareAudioContext,
} from "@/features/audio/sinkAwarePlayer";
import { setPreferredOutputDeviceId } from "@/features/audio/audioOutputSink";

interface FakeNode {
  buffer: AudioBuffer | null;
  connected: unknown[];
  startedAt: number | null;
  onended: (() => void) | null;
}

function makeFakeContext(opts: { withSetSinkId: boolean }) {
  const nodes: FakeNode[] = [];
  const sinkCalls: string[] = [];
  let state: AudioContextState = "running";

  const ctx: SinkAwareAudioContext = {
    get currentTime() {
      return 0;
    },
    get state() {
      return state;
    },
    destination: {} as AudioNode,
    createBufferSource() {
      const node: FakeNode = {
        buffer: null,
        connected: [],
        startedAt: null,
        onended: null,
      };
      nodes.push(node);
      return {
        set buffer(b: AudioBuffer | null) {
          node.buffer = b;
        },
        get buffer() {
          return node.buffer;
        },
        connect(dest: unknown) {
          node.connected.push(dest);
        },
        start(at: number) {
          node.startedAt = at;
        },
        set onended(fn: (() => void) | null) {
          node.onended = fn;
          // Auto-complete: fire "ended" on the next microtask, like a
          // zero-length real buffer would.
          if (fn) queueMicrotask(fn);
        },
        get onended() {
          return node.onended;
        },
      } as unknown as AudioBufferSourceNode;
    },
    createBuffer(_channels: number, length: number, sampleRate: number) {
      const data = new Float32Array(length);
      return {
        length,
        sampleRate,
        getChannelData: () => data,
      } as unknown as AudioBuffer;
    },
    async suspend() {
      state = "suspended";
    },
    async resume() {
      state = "running";
    },
    async close() {
      if (state === "closed") {
        throw new Error("Cannot close a closed AudioContext");
      }
      state = "closed";
    },
    ...(opts.withSetSinkId
      ? {
          setSinkId: async (deviceId: string) => {
            sinkCalls.push(deviceId);
          },
        }
      : {}),
  };

  return { ctx, nodes, sinkCalls, getState: () => state };
}

/** Source producing `totalSamples` samples of silence at 44100 Hz. */
function makeSource(totalSamples: number): PlayableSource {
  let remaining = totalSamples;
  return {
    sampleRate: 44100,
    async read(dst: Float32Array) {
      const n = Math.min(dst.length, remaining);
      remaining -= n;
      dst.fill(0, 0, n);
      return n;
    },
    durationToSampleCount(durationSecs: number) {
      return Math.round(durationSecs * 44100);
    },
  };
}

afterEach(() => {
  setPreferredOutputDeviceId("");
});

describe("SinkAwarePlayer contract parity", () => {
  it("throws 'AudioContext not initialized.' for pause/resume/toggle/stop before play", async () => {
    const player = new SinkAwarePlayer({ bufferDuration: 1 });
    for (const op of ["pause", "resume", "toggle", "stop"] as const) {
      await expect(player[op]()).rejects.toThrow(
        "AudioContext not initialized.",
      );
    }
  });

  it("plays a source in bufferDuration chunks and resolves at the end", async () => {
    const fake = makeFakeContext({ withSetSinkId: true });
    const player = new SinkAwarePlayer({
      bufferDuration: 1, // 44100 samples per chunk
      createContext: () => fake.ctx,
    });
    // 2.5 chunks → 3 scheduled buffers (44100, 44100, 22050).
    await player.play(makeSource(Math.round(44100 * 2.5)));
    expect(fake.nodes.map((n) => n.buffer?.length)).toEqual([
      44100, 44100, 22050,
    ]);
    // Back-to-back scheduling: chunk N starts where N-1 ends.
    expect(fake.nodes.map((n) => n.startedAt)).toEqual([0, 1, 2]);
  });

  it("pause suspends, resume resumes, toggle flips", async () => {
    const fake = makeFakeContext({ withSetSinkId: false });
    const player = new SinkAwarePlayer({
      bufferDuration: 1,
      createContext: () => fake.ctx,
    });
    await player.play(makeSource(10));
    await player.pause();
    expect(fake.getState()).toBe("suspended");
    await player.resume();
    expect(fake.getState()).toBe("running");
    await player.toggle();
    expect(fake.getState()).toBe("suspended");
    await player.toggle();
    expect(fake.getState()).toBe("running");
  });

  it("stop closes the context and a second stop is a silent no-op", async () => {
    const fake = makeFakeContext({ withSetSinkId: false });
    const player = new SinkAwarePlayer({
      bufferDuration: 1,
      createContext: () => fake.ctx,
    });
    await player.play(makeSource(10));
    await player.stop();
    expect(fake.getState()).toBe("closed");
    // SDK threw "Cannot close a closed AudioContext" here; the fork no-ops.
    await expect(player.stop()).resolves.toBeUndefined();
  });
});

describe("SinkAwarePlayer sink routing", () => {
  it("applies the preferred device at context creation", async () => {
    const fake = makeFakeContext({ withSetSinkId: true });
    setPreferredOutputDeviceId("device-A");
    const player = new SinkAwarePlayer({
      bufferDuration: 1,
      createContext: () => fake.ctx,
    });
    await player.play(makeSource(10));
    expect(fake.sinkCalls).toEqual(["device-A"]);
  });

  it("does not call setSinkId for the system default (empty id)", async () => {
    const fake = makeFakeContext({ withSetSinkId: true });
    setPreferredOutputDeviceId("");
    const player = new SinkAwarePlayer({
      bufferDuration: 1,
      createContext: () => fake.ctx,
    });
    await player.play(makeSource(10));
    expect(fake.sinkCalls).toEqual([]);
  });

  it("re-routes mid-utterance on a device change", async () => {
    const fake = makeFakeContext({ withSetSinkId: true });
    setPreferredOutputDeviceId("device-A");
    let releaseRead: (() => void) | null = null;
    // A source that stalls after its first chunk so the utterance is "live"
    // while we flip the device.
    let served = false;
    const stalling: PlayableSource = {
      sampleRate: 44100,
      async read(dst: Float32Array) {
        if (!served) {
          served = true;
          dst.fill(0);
          return dst.length; // full read → keep streaming
        }
        await new Promise<void>((r) => {
          releaseRead = r;
        });
        return 0; // end of source
      },
      durationToSampleCount: (s) => Math.round(s * 44100),
    };
    const player = new SinkAwarePlayer({
      bufferDuration: 1,
      createContext: () => fake.ctx,
    });
    const playing = player.play(stalling);
    // Let the first chunk get scheduled, then flip devices mid-utterance.
    await new Promise((r) => setTimeout(r, 0));
    setPreferredOutputDeviceId("device-B");
    releaseRead!();
    await playing;
    expect(fake.sinkCalls).toEqual(["device-A", "device-B"]);
  });

  it("ignores device changes after the utterance finished", async () => {
    const fake = makeFakeContext({ withSetSinkId: true });
    const player = new SinkAwarePlayer({
      bufferDuration: 1,
      createContext: () => fake.ctx,
    });
    await player.play(makeSource(10));
    setPreferredOutputDeviceId("late-device");
    expect(fake.sinkCalls).toEqual([]);
  });

  it("is a clean no-op when the context has no setSinkId (Firefox/Safari)", async () => {
    const fake = makeFakeContext({ withSetSinkId: false });
    setPreferredOutputDeviceId("device-A");
    const player = new SinkAwarePlayer({
      bufferDuration: 1,
      createContext: () => fake.ctx,
    });
    // System default playback, no crash.
    await expect(player.play(makeSource(10))).resolves.toBeUndefined();
    setPreferredOutputDeviceId("device-B");
  });
});
