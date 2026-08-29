/**
 * features/capture-camera/ — EXTRACTION SOURCE for the `@ai-matrx/capture`
 * package (aidream/apps/shared/capture). Everything outside `host/` must stay
 * free of app imports beyond React, lucide-react and `cn` — those are the
 * documented substitution points when this directory is mirrored into the
 * package (icons → inlined SVGs, cn → tailwind-merge), exactly like
 * `@ai-matrx/media` was extracted from `features/files`.
 *
 * The package is the OPINIONATED iPhone-style camera chrome: translucent
 * top/bottom bars over a full-bleed feed, the two-tap options grid, zoom
 * pills, shutter, VIDEO·PHOTO·UPLOAD mode selector, recents thumb, flip
 * button, rule-of-thirds grid, countdown timer, and the iOS-style sheet.
 * It renders and orchestrates UI state ONLY — the host injects the engine
 * (stream + capture callbacks) and everything persisted (upload, gallery,
 * thumbnails). No fetch, no storage, no getUserMedia in this layer.
 */

import type * as React from "react";

/** The two persistent capture modes; Upload is an immediate action. */
export type CaptureCameraMode = "photo" | "video";

/** Timer options genuinely supported (a countdown before the shutter). */
export type CaptureTimerSetting = 0 | 3 | 10;

/**
 * The engine port — everything the chrome needs from the host's camera
 * runtime. The host owns lease acquisition/release, capture and recording;
 * the chrome never touches getUserMedia.
 */
export interface CaptureCameraEngine {
  /** Live stream for the preview, or null while connecting/blocked. */
  stream: MediaStream | null;
  /** The preview <video> element ref the host's capture path reads from. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Camera unavailable: permission denied or unsupported. */
  blocked: null | { reason: "permission-denied" | "not-supported" };
  /** Take a photo NOW (any timer countdown already elapsed). */
  onCapturePhoto: () => void;
  /** Start / stop video recording. */
  onStartRecording: () => void;
  onStopRecording: () => void;
  recording: boolean;
  /** Elapsed recording seconds (host-owned monotonic clock). */
  recordElapsedSeconds: number;
  /** Open the device files picker (the Upload lane). */
  onUpload: () => void;
  /** Flip to the next camera; null hides the flip button. */
  onFlipCamera: (() => void) | null;
}

/** One tile in the two-tap options grid. */
export interface CaptureOptionTile {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** Highlight state (iPhone: yellow when engaged/auto). */
  active?: boolean;
  /** Small value read-out under the icon (e.g. "3s", "4:3"). */
  valueLabel?: string;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * Slot-based extensibility — how domain layers (e.g. commerce intake) attach
 * their own affordances without forking the chrome. Typed slots, not a plugin
 * registry, on purpose.
 */
export interface CaptureCameraSlots {
  /** Extra buttons in the top bar, before the options-grid button. */
  topBarTrailing?: React.ReactNode;
  /** Center of the top bar (e.g. current-item label + count). */
  topBarCenter?: React.ReactNode;
  /** Honesty chips under the top bar (QR confirmation, etc.). */
  statusChips?: React.ReactNode;
  /** Rows rendered inside the bottom bar ABOVE the mode selector
   *  (filmstrip, notes/voice row, process button…). */
  aboveModeSelector?: React.ReactNode;
  /** A compact action pinned right of the mode selector (Next/Break). */
  modeRowTrailing?: React.ReactNode;
  /** Extra tiles appended to the options grid. */
  optionTiles?: CaptureOptionTile[];
  /** Free overlays rendered above everything (sheets, pagers). */
  overlays?: React.ReactNode;
}
