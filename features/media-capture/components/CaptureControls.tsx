"use client";

/**
 * features/media-capture/components/CaptureControls.tsx
 *
 * Control strip for the Capture Studio: mode switch (photo / video / audio),
 * then per-mode controls —
 * - photo: shutter + framing toggle,
 * - video/audio: record / pause / resume / stop / cancel with a live
 *   pause-aware elapsed timer (fed from the recorder controller's monotonic
 *   clock, never a chunk-derived time), plus a mic on/off toggle for video.
 *
 * Camera selection: facingMode flip on mobile, device select on desktop
 * (devices from the shared media-devices manager; labels appear once
 * permission is granted). Device/facing switching is disabled while a
 * recording pins the camera.
 */

import {
  Camera,
  Circle,
  Crop,
  Frame,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  SwitchCamera,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MediaDeviceDescriptor } from "@/features/media-devices/deviceManager";
import type { FramingMode } from "@/features/media-capture/core/capture-types";

export type CaptureMode = "photo" | "video" | "audio";

export type RecordingUiState = "idle" | "starting" | "recording" | "paused";

export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = `${m}`.padStart(2, "0");
  const ss = `${s}`.padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

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
  cameras: MediaDeviceDescriptor[];
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
  onShutter: () => void;
  shutterDisabled: boolean;
  capturing: boolean;

  // ── Recording (video/audio modes) ──
  recordingState: RecordingUiState;
  elapsedMs: number;
  withMic: boolean;
  onToggleMic: () => void;
  onStartRecording: () => void;
  onPauseResume: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  recordDisabled: boolean;
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
    cameras,
    selectedDeviceId,
    onSelectDevice,
    onShutter,
    shutterDisabled,
    capturing,
    recordingState,
    elapsedMs,
    withMic,
    onToggleMic,
    onStartRecording,
    onPauseResume,
    onStopRecording,
    onCancelRecording,
    recordDisabled,
  } = props;

  const isRecordingLive =
    recordingState === "recording" || recordingState === "paused";

  return (
    <div className="flex shrink-0 flex-col gap-2 pb-safe pt-2">
      <div className="flex items-center gap-2">
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

            {isMobile ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={onToggleFacing}
                aria-label="Switch camera"
              >
                <SwitchCamera className="mr-1.5 h-4 w-4" />
                {facing === "user" ? "Front" : "Rear"}
              </Button>
            ) : (
              cameras.length > 1 && (
                <Select
                  value={selectedDeviceId ?? undefined}
                  onValueChange={onSelectDevice}
                >
                  <SelectTrigger
                    className="h-9 w-[190px] text-xs"
                    aria-label="Camera"
                  >
                    <SelectValue placeholder="Camera" />
                  </SelectTrigger>
                  <SelectContent>
                    {cameras.map((cam, i) => (
                      <SelectItem key={cam.deviceId} value={cam.deviceId}>
                        {cam.label || `Camera ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
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

        {mode === "photo" ? (
          <Button
            size="sm"
            className="ml-auto h-9"
            onClick={onShutter}
            disabled={shutterDisabled}
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
          <div className="ml-auto flex items-center gap-2">
            {isRecordingLive && (
              <span
                className="min-w-[3.5rem] text-right font-mono text-sm tabular-nums text-foreground"
                aria-live="polite"
              >
                {formatElapsed(elapsedMs)}
              </span>
            )}
            {recordingState === "idle" || recordingState === "starting" ? (
              <Button
                size="sm"
                className="h-9"
                onClick={onStartRecording}
                disabled={recordDisabled || recordingState === "starting"}
                aria-label="Start recording"
              >
                {recordingState === "starting" ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Circle className="mr-1.5 h-4 w-4 fill-destructive text-destructive" />
                )}
                Record
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={onPauseResume}
                  aria-label={
                    recordingState === "paused" ? "Resume recording" : "Pause recording"
                  }
                >
                  {recordingState === "paused" ? (
                    <Play className="h-4 w-4" />
                  ) : (
                    <Pause className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="sm"
                  className="h-9"
                  onClick={onStopRecording}
                  aria-label="Stop and review"
                >
                  <Square className="mr-1.5 h-4 w-4" />
                  Stop
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={onCancelRecording}
                  aria-label="Discard recording"
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
