// features/audio/streamingPcmPlayer.ts
//
// Generic progressive PCM stream player — the client half of the server's
// `audio_stream_chunk` / `audio_stream_end` events (matrx_connect
// AudioStreamChunkData: base64 signed 16-bit little-endian PCM segments).
//
// Unlike the conversational playback in features/voice-agent (turn-based,
// interrupt-driven, fire-and-forget), this player BUFFERS every chunk so a
// long render (a podcast episode arriving over minutes) supports the full
// listen-while-it-renders UX: play/pause, seek within what has buffered,
// position tracking, and graceful underrun (playback catches up with the
// buffer, then resumes as the next chunk lands).
//
// Memory: chunks are kept as Int16 (half the size of Float32) and converted
// per-chunk at schedule time. 24 kHz mono ≈ 2.9 MB/min — fine for the
// transient live-preview window; callers destroy() once the canonical file
// URL takes over.
//
// AudioContext is created lazily inside play() so the browser's user-gesture
// requirement is satisfied by the user's own click.

export interface StreamingPcmFormat {
  sampleRate: number;
  /** Interleaved channel count. The podcast/TTS streams are mono (1). */
  channels: number;
}

export interface StreamingPcmPlayer {
  /** Buffer one base64 chunk of s16le PCM. Safe to call before play(). */
  enqueueBase64: (b64: string) => void;
  /** No more chunks are coming — playback may drain to the true end. */
  end: () => void;
  play: () => void;
  pause: () => void;
  /** Seek within the buffered range (clamped). Keeps playing if playing. */
  seekMs: (ms: number) => void;
  getPositionMs: () => number;
  getBufferedMs: () => number;
  isPlaying: () => boolean;
  hasEnded: () => boolean;
  /** Subscribe to position/buffer changes. Returns unsubscribe. */
  onUpdate: (cb: () => void) => () => void;
  /** Tear down: stop audio, close the context, release buffers. */
  destroy: () => void;
}

function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, len >> 1);
}

export function createStreamingPcmPlayer(
  format: StreamingPcmFormat,
): StreamingPcmPlayer {
  const sampleRate = format.sampleRate > 0 ? format.sampleRate : 24000;
  const channels = format.channels > 0 ? format.channels : 1;

  /** Buffered PCM, one Int16Array per received chunk (interleaved frames). */
  const chunks: Int16Array[] = [];
  /** Cumulative frame count at the END of each chunk — for offset lookup. */
  const chunkEndFrames: number[] = [];
  let totalFrames = 0;

  let ctx: AudioContext | null = null;
  const scheduled: AudioBufferSourceNode[] = [];
  /** Index of the next buffered chunk to schedule while playing. */
  let nextChunkIndex = 0;
  /** ctx time at which the next scheduled buffer should start (gapless chain). */
  let nextPlayTime = 0;

  let playing = false;
  let ended = false;
  let destroyed = false;
  /** Playhead when paused; while playing it's derived from the ctx clock. */
  let pausedAtFrame = 0;
  /** Anchors mapping ctx.currentTime → stream frame while playing. */
  let anchorCtxTime = 0;
  let anchorFrame = 0;

  let updateTimer: ReturnType<typeof setInterval> | null = null;
  const updateCallbacks = new Set<() => void>();

  function notify(): void {
    for (const cb of updateCallbacks) {
      try {
        cb();
      } catch {
        // subscriber errors must never break playback
      }
    }
  }

  function startUpdateLoop(): void {
    if (updateTimer !== null) return;
    updateTimer = setInterval(() => {
      notify();
      if (!playing && updateTimer !== null) {
        clearInterval(updateTimer);
        updateTimer = null;
      }
    }, 250);
  }

  function framesToMs(frames: number): number {
    return (frames / sampleRate) * 1000;
  }

  function getPositionFrames(): number {
    if (!playing || !ctx) return pausedAtFrame;
    const elapsed = Math.max(0, ctx.currentTime - anchorCtxTime);
    return Math.min(anchorFrame + Math.round(elapsed * sampleRate), totalFrames);
  }

  function ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor({ sampleRate });
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  function int16ToBuffer(
    c: AudioContext,
    pcm: Int16Array,
    fromFrame: number,
  ): AudioBuffer | null {
    const frames = pcm.length / channels - fromFrame;
    if (frames <= 0) return null;
    const buf = c.createBuffer(channels, frames, sampleRate);
    for (let ch = 0; ch < channels; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < frames; i++) {
        data[i] = pcm[(fromFrame + i) * channels + ch] / 0x8000;
      }
    }
    return buf;
  }

  function scheduleChunk(index: number, fromFrame: number): void {
    if (!ctx) return;
    const buf = int16ToBuffer(ctx, chunks[index], fromFrame);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now, nextPlayTime);
    // An underrun gap (playback drained before this chunk arrived) must not
    // count toward the playhead — shift the anchor by the silent gap.
    if (startAt > nextPlayTime && nextPlayTime > 0) {
      anchorCtxTime += startAt - nextPlayTime;
    }
    src.start(startAt);
    nextPlayTime = startAt + buf.duration;
    scheduled.push(src);
    src.onended = () => {
      const i = scheduled.indexOf(src);
      if (i !== -1) scheduled.splice(i, 1);
      try {
        src.disconnect();
      } catch {
        // already disconnected
      }
      if (playing && scheduled.length === 0 && ended && nextChunkIndex >= chunks.length) {
        // True end of the stream — settle as paused at the end.
        pausedAtFrame = totalFrames;
        playing = false;
        notify();
      }
    };
  }

  function scheduleFrom(frame: number): void {
    if (!ctx) return;
    // Locate the chunk containing `frame`.
    let index = chunkEndFrames.findIndex((end) => frame < end);
    if (index === -1) index = chunks.length; // at/past the buffered end
    const chunkStart = index === 0 ? 0 : chunkEndFrames[index - 1];

    nextPlayTime = ctx.currentTime;
    anchorCtxTime = ctx.currentTime;
    anchorFrame = frame;
    if (index < chunks.length) {
      scheduleChunk(index, frame - chunkStart);
      for (let i = index + 1; i < chunks.length; i++) scheduleChunk(i, 0);
    }
    nextChunkIndex = chunks.length;
  }

  function stopScheduled(): void {
    for (const src of scheduled) {
      try {
        src.onended = null;
        src.stop(0);
        src.disconnect();
      } catch {
        // already stopped
      }
    }
    scheduled.length = 0;
  }

  function enqueueBase64(b64: string): void {
    if (destroyed || ended) return;
    let pcm: Int16Array;
    try {
      pcm = base64ToInt16(b64);
    } catch {
      return; // a malformed chunk is dropped, never fatal
    }
    if (pcm.length === 0) return;
    chunks.push(pcm);
    totalFrames += pcm.length / channels;
    chunkEndFrames.push(totalFrames);
    if (playing && ctx) {
      // Chain the new chunk onto the live schedule.
      scheduleChunk(chunks.length - 1, 0);
      nextChunkIndex = chunks.length;
    }
    notify();
  }

  function play(): void {
    if (destroyed || playing) return;
    const c = ensureContext();
    if (!c) return;
    if (ended && pausedAtFrame >= totalFrames) pausedAtFrame = 0; // replay
    playing = true;
    scheduleFrom(pausedAtFrame);
    startUpdateLoop();
    notify();
  }

  function pause(): void {
    if (!playing) return;
    pausedAtFrame = getPositionFrames();
    playing = false;
    stopScheduled();
    notify();
  }

  function seekMs(ms: number): void {
    const frame = Math.max(
      0,
      Math.min(Math.round((ms / 1000) * sampleRate), totalFrames),
    );
    if (playing) {
      stopScheduled();
      scheduleFrom(frame);
    } else {
      pausedAtFrame = frame;
    }
    notify();
  }

  function end(): void {
    ended = true;
    notify();
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    playing = false;
    stopScheduled();
    if (updateTimer !== null) {
      clearInterval(updateTimer);
      updateTimer = null;
    }
    updateCallbacks.clear();
    chunks.length = 0;
    chunkEndFrames.length = 0;
    if (ctx) {
      void ctx.close().catch(() => undefined);
      ctx = null;
    }
  }

  return {
    enqueueBase64,
    end,
    play,
    pause,
    seekMs,
    getPositionMs: () => framesToMs(getPositionFrames()),
    getBufferedMs: () => framesToMs(totalFrames),
    isPlaying: () => playing,
    hasEnded: () => ended,
    onUpdate: (cb) => {
      updateCallbacks.add(cb);
      return () => updateCallbacks.delete(cb);
    },
    destroy,
  };
}
