import {
  closeOverlay,
  openOverlay,
  toggleOverlay,
  DEFAULT_INSTANCE_ID,
} from "@/lib/redux/slices/overlaySlice";
import type { VoicePadOverlayVariant } from "@/lib/redux/slices/voicePadSlice";

/**
 * Per-instance voice-pad opener helpers.
 *
 * Two variants live here:
 *   - "voicePad"          — simple floating pad
 *   - "voicePadAdvanced"  — full pad with history sidebar, footer actions
 *
 * The third overlay that shares the voice-pad slice — "transcriptionCleanup"
 * (the "Transcription Cleanup" window) — has its own opener at
 * `features/overlays/openers/transcriptionCleanup.tsx`.
 *
 * Every variant supports multiple coexisting instances. `instanceId` defaults
 * to "default" for toggle-style callers that expect singleton behavior.
 * Use `openNew*` to spawn a fresh instance while leaving existing ones open.
 */

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `vp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const openVoicePad = (instanceId: string = DEFAULT_INSTANCE_ID) =>
  openOverlay({ overlayId: "voicePad", instanceId });

export const toggleVoicePad = (instanceId: string = DEFAULT_INSTANCE_ID) =>
  toggleOverlay({ overlayId: "voicePad", instanceId });

export const openNewVoicePad = () =>
  openOverlay({ overlayId: "voicePad", instanceId: newId() });

export const openVoicePadAdvanced = (
  instanceId: string = DEFAULT_INSTANCE_ID,
) => openOverlay({ overlayId: "voicePadAdvanced", instanceId });

export const toggleVoicePadAdvanced = (
  instanceId: string = DEFAULT_INSTANCE_ID,
) => toggleOverlay({ overlayId: "voicePadAdvanced", instanceId });

export const openNewVoicePadAdvanced = () =>
  openOverlay({ overlayId: "voicePadAdvanced", instanceId: newId() });

export const closeVoicePadInstance = (
  overlayId: VoicePadOverlayVariant,
  instanceId: string,
) => closeOverlay({ overlayId, instanceId });
