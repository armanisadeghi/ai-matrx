"use client";

/**
 * features/media-capture/components/CaptureControls.tsx
 *
 * Control strip for the Capture Studio: mode switch (photo / video / audio),
 * the device rail, then per-mode controls —
 * - photo: shutter + framing toggle,
 * - video/audio: the Record button (mic on/off for video).
 *
 * Live recording controls (timer, gauges, pause/stop/cancel) are NOT here —
 * `RecordingHud` owns them, so there is exactly one place that renders a live
 * recording.
 *
 * Device selection is NOT here either: `CaptureDeviceRail` owns camera / mic /
 * speaker, sourced from `useAudioDevices()` and persisted to
 * `userPreferences.mediaDevices`. This strip keeps only facingMode (a
 * constraint, not a device choice) on mobile, where a front/rear flip beats a
 * device list.
 */

import {
  Camera,
  Circle,
  Crop,
  Frame,
  Loader2,
  Mic,
  MicOff,
  SwitchCamera,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaptureDeviceRail } from "@/features/media-capture/components/CaptureDeviceRail";
import type { FramingMode } from "@/features/media-capture/core/capture-types";

export type CaptureMode = "photo" | "video" | "audio";

export type RecordingUiState = "idle" | "starting" | "recording" | "paused";

export interface CaptureControlsProps {
  mode: CaptureMode;
  onModeChange: (mode: CaptureMode) => void;
  /** Mode switching is locked while recording. */
  modeLocked: boolean;

  framing: FramingMode;
  onFramingChange: (framing: FramingMode) => void;
  isMobile: boolean;
  facing: "user" | "environment";
  onToggleFacing: () => void;
  onShutter: () => void;
  shutterDisabled: boolean;
  capturing: boolean;

  // ── Recording (video/audio modes) ──
  recordingState: RecordingUiState;
  withMic: boolean;
  onToggleMic: () => void;
  onStartRecording: () => void;
  recordDisabled: boolean;
  /**
   * Why the primary action is unavailable. A disabled Capture/Record button
   * with no stated reason reads as a broken app — the strip always SAYS why.
   */
  blockedReason?: string | null;
}

const MODES: Array<{ mode: CaptureMode; label: string; Icon: typeof Camera }> = [
  { mode: "photo", label: "Photo", Icon: Camera },
  { mode: "video", label: "Video", Icon: Video },
  { mode: "audio", label: "Audio", Icon: Mic },
];

export function CaptureControls(props: CaptureControlsProps) {
  const {
    mode,
    onModeChange,
    modeLocked,
    framing,
    onFramingChange,
    isMobile,
    facing,
    onToggleFacing,
    onShutter,
    shutterDisabled,
    capturing,
    recordingState,
    withMic,
    onToggleMic,
    onStartRecording,
    recordDisabled,
    blockedReason,
  } = props;

  const isRecordingLive =
    recordingState === "recording" || recordingState === "paused";

  return (
    <div className="flex shrink-0 flex-col gap-2 pb-safe pt-2">
      {/* Device rail — always visible, right where the user captures. */}
      <CaptureDeviceRail
        showCamera={mode !== "audio"}
        recording={isRecordingLive || recordingState === "starting"}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5"
          role="tablist"
          aria-label="Capture mode"
        >
          {MODES.map(({ mode: m, label, Icon }) => (
            <Button
              key={m}
              role="tab"
              aria-selected={mode === m}
              variant={mode === m ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2.5"
              disabled={modeLocked && mode !== m}
              onClick={() => onModeChange(m)}
            >
              <Icon className="mr-1 h-4 w-4" />
              {label}
            </Button>
          ))}
        </div>

        {mode !== "audio" && !isRecordingLive && (
          <>
            {mode === "photo" && (
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() =>
                  onFramingChange(
                    framing === "viewport-crop" ? "full-frame" : "viewport-crop",
                  )
                }
                aria-label={
                  framing === "viewport-crop"
                    ? "Switch to full frame"
                    : "Switch to viewport crop"
                }
              >
                {framing === "viewport-crop" ? (
                  <Crop className="mr-1.5 h-4 w-4" />
                ) : (
                  <Frame className="mr-1.5 h-4 w-4" />
                )}
                {framing === "viewport-crop" ? "Crop to view" : "Full frame"}
              </Button>
            )}

            {/* facingMode is a CONSTRAINT, not a device choice — the rail owns
                device selection. On mobile a front/rear flip beats a list. */}
            {isMobile && (
              <Button
                variant="outline"
                size="sm"
                className="h-11 sm:h-9"
                onClick={onToggleFacing}
                aria-label="Switch camera"
              >
                <SwitchCamera className="mr-1.5 h-4 w-4" />
                {facing === "user" ? "Front" : "Rear"}
              </Button>
            )}
          </>
        )}

        {mode === "video" && !isRecordingLive && (
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={onToggleMic}
            aria-label={withMic ? "Record without microphone" : "Record with microphone"}
          >
            {withMic ? (
              <Mic className="mr-1.5 h-4 w-4" />
            ) : (
              <MicOff className="mr-1.5 h-4 w-4" />
            )}
            {withMic ? "Mic on" : "Mic off"}
          </Button>
        )}

        {/* Stated reason for an unavailable primary action, right beside it. */}
        {blockedReason && (
          <span className="basis-full text-[11px] leading-snug text-muted-foreground sm:ml-auto sm:max-w-[18rem] sm:basis-auto sm:text-right">
            {blockedReason}
          </span>
        )}

        {mode === "photo" ? (
          <Button
            size="sm"
            className="ml-auto h-9 max-sm:w-full"
            onClick={onShutter}
            disabled={shutterDisabled}
            title={blockedReason ?? undefined}
            aria-label="Take photo"
          >
            {capturing ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Camera className="mr-1.5 h-4 w-4" />
            )}
            Capture
          </Button>
        ) : (
          // Live recording controls live in `RecordingHud` — this strip only
          // ever starts a recording.
          !isRecordingLive && (
            <Button
              size="sm"
              className="ml-auto h-11 max-sm:w-full sm:h-9"
              onClick={onStartRecording}
              disabled={recordDisabled || recordingState === "starting"}
              title={blockedReason ?? undefined}
              aria-label="Start recording"
            >
              {recordingState === "starting" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Circle className="mr-1.5 h-4 w-4 fill-destructive text-destructive" />
              )}
              Record
            </Button>
          )
        )}
      </div>
    </div>
  );
}
