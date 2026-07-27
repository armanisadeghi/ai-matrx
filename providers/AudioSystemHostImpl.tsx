"use client";

/**
 * AudioSystemHostImpl — the entire audio system, mounted once on first
 * engagement by `AudioSystemHost` (the only importer; see its header for the
 * activation contract).
 *
 * LAW (mirrors DeferredSingletonCore): every import here is STATIC and every
 * child renders unconditionally. This file sits behind the one `ssr:false`
 * boundary in the shell — adding a second dynamic boundary or a render gate
 * here fragments the chunk graph for zero benefit. The only tolerated inner
 * dynamics are condition-gated rare-event leaves INSIDE the children (the
 * recovery toast body, the audio modal body), which follow the
 * OverlayController leaf pattern.
 *
 * Contents:
 *   1. AudioDeviceProviderImpl — devicechange/permission listeners, persisted
 *      mic/speaker applied to the singletons. Runs at activation (not boot),
 *      and before the first recording can begin (the engine mounts with it).
 *   2. GlobalRecordingEngine — the single shared chunked recorder; registers
 *      the start/stop/cancel/pause/resume verbs with recordingCommands
 *      (flushing any start queued before mount).
 *   3. AudioOutputHostImpl — the read-aloud/TTS streaming speaker (Cartesia
 *      SDK). Lives here so playback survives navigation and tab switches.
 *   4. AudioPlaybackHost — mirrors the framework-free playback queue into
 *      Redux (replays current snapshot on subscribe).
 *   5. AudioSessionHost — mirrors the unified audio session registry into
 *      Redux + projects the playback queue into it.
 *   6. AudioModalHost — registers the imperative showAudioModal() sink and
 *      flushes a request queued before activation.
 *   7. AudioRecoveryProvider + AudioRecoveryToast — IndexedDB orphan scan +
 *      recovery UI. Scoped here (its only consumers are the toast/modal);
 *      also owns clearing the dirty-recording boot marker.
 */

import AudioDeviceProviderImpl from "./AudioDeviceProviderImpl";
import AudioOutputHostImpl from "./AudioOutputHostImpl";
import { AudioModalHost } from "./AudioModalHost";
import { GlobalRecordingEngine } from "./GlobalRecordingEngine";
import { AudioPlaybackHost } from "@/features/audio/playback/AudioPlaybackHost";
import { AudioSessionHost } from "@/features/audio/session/AudioSessionHost";
import { AudioRecoveryProvider } from "@/features/audio/providers/AudioRecoveryProvider";
import { AudioRecoveryToast } from "@/features/audio/components/AudioRecoveryToast";

export default function AudioSystemHostImpl() {
  return (
    <>
      <AudioDeviceProviderImpl />
      <GlobalRecordingEngine />
      <AudioOutputHostImpl />
      <AudioPlaybackHost />
      <AudioSessionHost />
      <AudioModalHost />
      <AudioRecoveryProvider>
        <AudioRecoveryToast />
      </AudioRecoveryProvider>
    </>
  );
}
