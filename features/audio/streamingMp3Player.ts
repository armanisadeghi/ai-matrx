// features/audio/streamingMp3Player.ts
//
// Progressive MP3 player for encoded `audio_stream_chunk` events. ElevenLabs
// returns one continuous MP3 byte stream in provider-sized chunks; MediaSource
// lets the browser decode and play those bytes while later chunks are still
// arriving. The interface intentionally matches StreamingAudioPlayer so the
// podcast UI can swap PCM/Web Audio and MP3/MediaSource by event metadata.

import type { StreamingAudioPlayer } from "./streamingPcmPlayer";

export interface StreamingMp3PlayerOptions {
  mimeType?: string;
  onError?: (error: Error) => void;
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function createStreamingMp3Player(
  options: StreamingMp3PlayerOptions = {},
): StreamingAudioPlayer | null {
  if (typeof window === "undefined" || typeof MediaSource === "undefined") {
    console.error(
      "[streaming-mp3] MediaSource is unavailable — live MP3 playback disabled; waiting for the canonical audio file",
    );
    return null;
  }

  const mimeType = options.mimeType || "audio/mpeg";
  if (!MediaSource.isTypeSupported(mimeType)) {
    console.error(
      `[streaming-mp3] browser does not support MediaSource ${mimeType} — live playback disabled; waiting for the canonical audio file`,
    );
    return null;
  }

  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  const audio = document.createElement("audio");
  audio.preload = "auto";
  audio.hidden = true;
  audio.setAttribute("aria-hidden", "true");
  audio.src = objectUrl;
  // Keep the media element attached. Chromium will play a detached element,
  // but WebKit's MediaSource implementation is not reliable unless the
  // element belongs to the document. The visible transport remains React's
  // LiveAudioPlayer; this element is only the decoder/output sink.
  document.body.appendChild(audio);

  const pending: ArrayBuffer[] = [];
  const callbacks = new Set<() => void>();
  let sourceBuffer: SourceBuffer | null = null;
  let streamEnded = false;
  let destroyed = false;
  let failed = false;

  function notify(): void {
    for (const callback of callbacks) callback();
  }

  function fail(message: string, cause?: unknown): void {
    if (failed || destroyed) return;
    failed = true;
    const error =
      cause instanceof Error
        ? new Error(message, { cause })
        : new Error(message);
    console.error(`[streaming-mp3] ${message}`, cause ?? "");
    options.onError?.(error);
    notify();
  }

  function finishIfReady(): void {
    if (
      !destroyed &&
      !failed &&
      streamEnded &&
      pending.length === 0 &&
      sourceBuffer &&
      !sourceBuffer.updating &&
      mediaSource.readyState === "open"
    ) {
      try {
        mediaSource.endOfStream();
      } catch (error) {
        fail("could not finalize the MediaSource stream", error);
      }
    }
  }

  function appendNext(): void {
    if (
      destroyed ||
      failed ||
      !sourceBuffer ||
      sourceBuffer.updating ||
      mediaSource.readyState !== "open"
    ) {
      return;
    }
    const next = pending.shift();
    if (!next) {
      finishIfReady();
      return;
    }
    try {
      sourceBuffer.appendBuffer(next);
    } catch (error) {
      fail("could not append an MP3 stream chunk", error);
    }
  }

  mediaSource.addEventListener(
    "sourceopen",
    () => {
      if (destroyed || failed || sourceBuffer) return;
      try {
        sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        sourceBuffer.mode = "sequence";
        sourceBuffer.addEventListener("updateend", () => {
          notify();
          appendNext();
        });
        sourceBuffer.addEventListener("error", () => {
          fail("MediaSource rejected the MP3 stream");
        });
        appendNext();
      } catch (error) {
        fail("could not initialize an MP3 SourceBuffer", error);
      }
    },
    { once: true },
  );

  for (const event of ["timeupdate", "progress", "play", "pause", "ended"]) {
    audio.addEventListener(event, notify);
  }
  audio.addEventListener("error", () => {
    fail(
      `browser could not decode the live MP3 stream${audio.error?.message ? `: ${audio.error.message}` : ""}`,
    );
  });

  function getBufferedMs(): number {
    try {
      const ranges = audio.buffered;
      return ranges.length > 0 ? ranges.end(ranges.length - 1) * 1000 : 0;
    } catch {
      return 0;
    }
  }

  return {
    enqueueBase64: (b64) => {
      if (destroyed || failed || streamEnded) return;
      try {
        const bytes = base64ToArrayBuffer(b64);
        if (bytes.byteLength === 0) return;
        pending.push(bytes);
        appendNext();
        notify();
      } catch (error) {
        fail("received a malformed base64 MP3 chunk", error);
      }
    },
    end: () => {
      if (destroyed || failed) return;
      streamEnded = true;
      finishIfReady();
      notify();
    },
    play: () => {
      if (destroyed || failed) return;
      void audio.play().catch((error) => {
        fail("browser refused live MP3 playback", error);
      });
    },
    pause: () => audio.pause(),
    seekMs: (ms) => {
      if (destroyed || failed) return;
      const clampedMs = Math.max(0, Math.min(ms, getBufferedMs()));
      audio.currentTime = clampedMs / 1000;
      notify();
    },
    getPositionMs: () =>
      Number.isFinite(audio.currentTime) ? audio.currentTime * 1000 : 0,
    getBufferedMs,
    isPlaying: () => !audio.paused && !audio.ended,
    hasEnded: () => streamEnded,
    onUpdate: (callback) => {
      callbacks.add(callback);
      return () => callbacks.delete(callback);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      audio.pause();
      pending.length = 0;
      callbacks.clear();
      if (sourceBuffer?.updating) {
        try {
          sourceBuffer.abort();
        } catch {
          // The MediaSource may already have closed between the state check and abort.
        }
      }
      audio.removeAttribute("src");
      audio.load();
      audio.remove();
      URL.revokeObjectURL(objectUrl);
      sourceBuffer = null;
    },
  };
}
