/**
 * Audio bypass guard — LOUD runtime enforcement of the single audio system.
 *
 * The twin of `reportMediaDurabilityViolation`. Every audio path (playback AND
 * recording) must flow through the canonical primitives:
 *   - playback  → `audioSessionRegistry` (`beginPlaybackSession` / register a
 *     session) on top of `playbackLock` / `playbackQueue`.
 *   - recording → `captureLock` + a registered recording session.
 *
 * If audio is produced or captured with no registered/claimed session, that's a
 * bypass — a real defect. We do NOT silently paper over it (that hides the bug);
 * we scream in the console (and toast in dev) so it can't be ignored. ESLint
 * import bans are the first line of defense; this is the runtime backstop for
 * anything that slips past static analysis.
 */

import { getActivePlaybackHolderId } from "@/features/audio/playback/playbackLock";

let warnedContexts = new Set<string>();

/**
 * Assert that audio OUT is owned by the playback lock before a producer makes
 * sound. Call this at the moment a producer starts playing. Returns true if a
 * violation was reported. Never throws.
 */
export function assertPlaybackClaimed(context: string): boolean {
  if (getActivePlaybackHolderId() !== null) return false;
  return reportAudioBypassViolation({
    context,
    direction: "playback",
    detail:
      "audio started playing but no playback session owns the playback lock",
  });
}

/**
 * LOUD: report an audio-system bypass. A producer reached `context` without a
 * registered session / lock claim. Returns true (it was a violation). Dedupes
 * per-context so a hot loop doesn't flood the console.
 */
export function reportAudioBypassViolation(args: {
  context: string;
  direction: "playback" | "recording";
  detail: string;
}): boolean {
  const key = `${args.direction}:${args.context}`;
  if (warnedContexts.has(key)) return true;
  warnedContexts.add(key);

  const canonical =
    args.direction === "playback"
      ? "Route audio OUT through the registry: beginPlaybackSession(...) (or " +
        "enqueue via useAudioPlayback / useTtsSpeak), never a raw WebPlayer / " +
        "AudioContext / <audio> for our media."
      : "Route audio IN through the global recorder (useGlobalRecording / " +
        "useVoiceCapture) or register a recording session; acquire the mic only " +
        "via features/audio/micStream + captureLock.";

  console.error(
    "\n================ AUDIO-SYSTEM BYPASS ================\n" +
      `A ${args.direction} path bypassed the single audio system at "${args.context}".\n` +
      `${args.detail}.\n` +
      `${canonical}\n` +
      "See features/audio/FEATURE.md → 'The one and only way in'.\n" +
      "====================================================\n",
  );

  if (process.env.NODE_ENV !== "production") {
    void import("sonner")
      .then(({ toast }) =>
        toast.error("Audio bypass detected", {
          description: `${args.direction} @ ${args.context} — see console.`,
        }),
      )
      .catch(() => {});
  }
  return true;
}

/** Test helper — clear the per-context dedupe set. */
export function __resetAudioBypassGuard(): void {
  warnedContexts = new Set<string>();
}
