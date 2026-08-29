"use client";

/**
 * CameraCapture — the opinionated iPhone-style camera surface, assembled.
 *
 * Layout (matching the iOS Camera app):
 * - Full-bleed live feed with a semi-transparent near-black bar across the
 *   top and bottom — controls read clearly while the feed shows through.
 * - Top bar: close (host-provided), center slot, torch, host extras, and the
 *   grid button revealing the two-tap OptionsGridPanel.
 * - Over the feed's bottom edge: real zoom pills (only when the track
 *   reports a zoom range).
 * - Bottom bar: injected rows → VIDEO·PHOTO·UPLOAD mode selector → recents
 *   thumb · shutter · flip.
 * - Overlays: rule-of-thirds grid, timer countdown, recording chip, blocked
 *   sheet (iOS system-sheet presentation).
 *
 * The chrome owns UI state only (options panel, grid, timer, countdown).
 * Capture behavior, streams and persistence come from the injected
 * `CaptureCameraEngine`; domain features attach through `CaptureCameraSlots`.
 *
 * Package source (`@ai-matrx/capture`).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Grip,
  Grid3x3,
  Proportions,
  SunMedium,
  Timer,
  X,
  Zap,
  ZapOff,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

import type {
  CaptureAspect,
  CaptureCameraEngine,
  CaptureCameraMode,
  CaptureCameraSlots,
  CaptureCloudPort,
  CaptureOptionTile,
  CaptureTimerSetting,
} from "../types";
import { useTrackControls } from "../hooks/useTrackControls";
import { ShutterButton } from "./ShutterButton";
import { ModeSelector } from "./ModeSelector";
import { ZoomRow } from "./ZoomRow";
import { OptionsGridPanel } from "./OptionsGridPanel";
import { CaptureSheet, type CaptureSheetAction } from "./CaptureSheet";
import { GridOverlay } from "./GridOverlay";
import { CountdownOverlay } from "./CountdownOverlay";

export interface CameraCaptureProps {
  engine: CaptureCameraEngine;
  /** THE CLOUD LAW: the cloud port is REQUIRED — a camera with no cloud
   *  library/persistence is not a valid instance of this system. */
  cloud: CaptureCloudPort;
  mode: CaptureCameraMode;
  onModeChange: (mode: CaptureCameraMode) => void;
  /** The live preview element (host wires its runtime's `CameraPreview`). */
  preview: React.ReactNode;
  /** Close affordance top-left; omitted = no close button. */
  onClose?: () => void;
  /** Body + actions for the camera-blocked iOS-style sheet. */
  blockedSheet?: { body: React.ReactNode; actions: CaptureSheetAction[] };
  /** Hide all chrome except honesty chips (host renders its own toggle). */
  controlsHidden?: boolean;
  shutterDisabled?: boolean;
  slots?: CaptureCameraSlots;
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

const ASPECT_CYCLE: CaptureAspect[] = ["full", "4:3", "1:1", "16:9"];

export function CameraCapture({
  engine,
  cloud,
  mode,
  onModeChange,
  preview,
  onClose,
  blockedSheet,
  controlsHidden = false,
  shutterDisabled = false,
  slots = {},
}: CameraCaptureProps) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [gridOn, setGridOn] = useState(false);
  const [timerSetting, setTimerSetting] = useState<CaptureTimerSetting>(0);
  const [aspect, setAspect] = useState<CaptureAspect>("full");
  const [exposureOpen, setExposureOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  // The blocked sheet is dismissible — uploads and the system camera keep
  // working, so closing it reveals the chrome rather than leaving the page.
  const [blockedDismissed, setBlockedDismissed] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const controls = useTrackControls(engine.stream);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
    setCountdown(null);
  }, []);
  useEffect(() => clearCountdown, [clearCountdown]);

  const onShutter = useCallback(() => {
    if (mode === "video") {
      if (engine.recording) engine.onStopRecording();
      else engine.onStartRecording();
      return;
    }
    if (countdown !== null) {
      // Tapping mid-countdown cancels — matching iOS.
      clearCountdown();
      return;
    }
    if (timerSetting === 0) {
      engine.onCapturePhoto({ aspect });
      return;
    }
    let remaining = timerSetting;
    setCountdown(remaining);
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearCountdown();
        engine.onCapturePhoto({ aspect });
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }, [mode, engine, countdown, timerSetting, aspect, clearCountdown]);

  const cycleTimer = useCallback(() => {
    setTimerSetting((t) => (t === 0 ? 3 : t === 3 ? 10 : 0));
  }, []);

  const coreTiles: CaptureOptionTile[] = [
    ...(controls.torchSupported
      ? [
          {
            id: "flash",
            label: "Flash",
            icon: controls.torchOn ? (
              <Zap className="h-6 w-6" fill="currentColor" />
            ) : (
              <ZapOff className="h-6 w-6" />
            ),
            active: controls.torchOn,
            onPress: controls.toggleTorch,
          },
        ]
      : []),
    {
      id: "timer",
      label: "Timer",
      icon: <Timer className="h-6 w-6" />,
      active: timerSetting !== 0,
      valueLabel: timerSetting === 0 ? undefined : `${timerSetting}s`,
      onPress: cycleTimer,
    },
    {
      id: "grid",
      label: "Grid",
      icon: <Grid3x3 className="h-6 w-6" />,
      active: gridOn,
      onPress: () => setGridOn((g) => !g),
    },
    // Aspect applies to PHOTO output (center-cropped from the full sensor).
    {
      id: "aspect",
      label: "Aspect",
      icon: <Proportions className="h-6 w-6" />,
      active: aspect !== "full",
      valueLabel: aspect === "full" ? undefined : aspect,
      onPress: () =>
        setAspect(
          (a) => ASPECT_CYCLE[(ASPECT_CYCLE.indexOf(a) + 1) % ASPECT_CYCLE.length],
        ),
    },
    ...(controls.exposureSupported
      ? [
          {
            id: "exposure",
            label: "Exposure",
            icon: <SunMedium className="h-6 w-6" />,
            active: controls.exposure !== 0 || exposureOpen,
            valueLabel:
              controls.exposure === 0
                ? undefined
                : `${controls.exposure > 0 ? "+" : ""}${controls.exposure}`,
            onPress: () => setExposureOpen((o) => !o),
          },
        ]
      : []),
  ];
  const tiles = [...coreTiles, ...(slots.optionTiles ?? [])];

  const blocked = engine.blocked !== null;

  return (
    <div className="absolute inset-0 select-none overflow-hidden bg-black">
      {/* Full-bleed feed */}
      <div className="absolute inset-0">{preview}</div>
      <GridOverlay visible={gridOn && !blocked} />
      {/* Aspect framing hint — the photo output is center-cropped to the
          selected ratio; the dimmed bands approximate the discarded region
          of the VISIBLE frame (the capture itself crops the full sensor). */}
      {mode === "photo" && aspect !== "full" && !blocked && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <div
            className="shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            style={{
              aspectRatio:
                aspect === "1:1" ? "1 / 1" : aspect === "4:3" ? "3 / 4" : "9 / 16",
              width: aspect === "16:9" ? "100%" : undefined,
              height: aspect === "16:9" ? undefined : "70%",
              maxWidth: "100%",
              maxHeight: "100%",
            }}
          />
        </div>
      )}
      <CountdownOverlay seconds={countdown} />

      {/* Top bar — semi-transparent near-black, feed visible through it. */}
      {!controlsHidden && (
        <div className="absolute inset-x-0 top-0 z-20 bg-black/65 pt-safe backdrop-blur-[2px]">
          <div className="flex h-16 items-center gap-1 px-3">
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close camera"
                className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
              >
                <X className="h-6 w-6" />
              </button>
            ) : (
              <span className="w-11 shrink-0" />
            )}
            <div className="min-w-0 flex-1">{slots.topBarCenter}</div>
            {controls.torchSupported && (
              <button
                type="button"
                onClick={controls.toggleTorch}
                aria-label={
                  controls.torchOn ? "Turn flash off" : "Turn flash on"
                }
                aria-pressed={controls.torchOn}
                className={cn(
                  "flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full transition-colors",
                  controls.torchOn
                    ? "text-[#FFCC00]"
                    : "text-white hover:bg-white/10",
                )}
              >
                <Zap
                  className="h-[22px] w-[22px]"
                  fill={controls.torchOn ? "currentColor" : "none"}
                />
              </button>
            )}
            {slots.topBarTrailing}
            <button
              type="button"
              onClick={() => setOptionsOpen((o) => !o)}
              aria-label="More camera options"
              aria-expanded={optionsOpen}
              className={cn(
                "flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full transition-colors",
                optionsOpen ? "bg-white/20 text-white" : "text-white hover:bg-white/10",
              )}
            >
              <Grip className="h-[22px] w-[22px]" />
            </button>
          </div>
        </div>
      )}

      {/* Honesty chips — visible even with controls hidden. */}
      <div className="pointer-events-none absolute inset-x-0 top-20 z-20 mt-safe flex flex-col items-center gap-2">
        {engine.recording && (
          <span className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm font-medium text-white">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#FF3B30]" />
            {formatElapsed(engine.recordElapsedSeconds)}
          </span>
        )}
        {slots.statusChips}
      </div>

      {/* Bottom stack */}
      {!controlsHidden && (
        <div className="absolute inset-x-0 bottom-0 z-20">
          {/* Zoom pills float on the FEED, just above the bottom bar. */}
          {!blocked && controls.zoomOptions.length >= 2 && (
            <div className="mb-3">
              <ZoomRow
                options={controls.zoomOptions}
                value={controls.zoom}
                onSelect={controls.setZoom}
              />
            </div>
          )}
          {/* Exposure slider — revealed by the EXPOSURE tile, floats above
              the bottom bar like the iOS exposure control. */}
          {exposureOpen && controls.exposureSupported && controls.exposureRange && (
            <div className="mx-auto mb-3 flex w-64 items-center gap-3 rounded-full bg-black/55 px-4 py-2">
              <SunMedium className="h-4 w-4 shrink-0 text-[#FFCC00]" />
              <input
                type="range"
                min={controls.exposureRange.min}
                max={controls.exposureRange.max}
                step={controls.exposureRange.step}
                value={controls.exposure}
                onChange={(e) => controls.setExposure(Number(e.target.value))}
                aria-label="Exposure compensation"
                className="w-full accent-[#FFCC00]"
              />
              <span className="w-8 shrink-0 text-right text-xs tabular-nums text-white">
                {controls.exposure > 0 ? "+" : ""}
                {controls.exposure}
              </span>
            </div>
          )}
          <div className="bg-black/65 px-3 pb-safe backdrop-blur-[2px]">
            {slots.aboveModeSelector}
            <div className="relative flex items-center justify-center py-2.5">
              <ModeSelector
                mode={mode}
                onModeChange={onModeChange}
                onUpload={engine.onUpload}
                modeDisabled={engine.recording}
                uploadDisabled={shutterDisabled && !blocked}
                extraModes={slots.extraModes}
              />
              {slots.modeRowTrailing && (
                <div className="absolute right-0">{slots.modeRowTrailing}</div>
              )}
            </div>
            <div className="flex items-center justify-between px-2 pb-4 pt-1">
              <div className="flex w-16 justify-start">
                <button
                  type="button"
                  onClick={cloud.onOpenLibrary}
                  aria-label="Open your media library"
                  className="h-12 w-12 touch-manipulation overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/25 transition-transform active:scale-95"
                >
                  {cloud.recentsThumb ?? (
                    <span className="block h-full w-full bg-white/5" />
                  )}
                </button>
              </div>
              <ShutterButton
                mode={mode}
                recording={engine.recording}
                disabled={shutterDisabled || blocked}
                onPress={onShutter}
              />
              <div className="flex w-16 justify-end">
                {engine.onFlipCamera ? (
                  <button
                    type="button"
                    onClick={engine.onFlipCamera}
                    aria-label="Switch camera"
                    className="flex h-12 w-12 touch-manipulation items-center justify-center rounded-full bg-white/15 text-white transition-transform active:rotate-180 active:scale-95 duration-300"
                  >
                    <RefreshCw className="h-5 w-5" />
                  </button>
                ) : (
                  <span className="h-12 w-12" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <OptionsGridPanel
        open={optionsOpen && !controlsHidden}
        onClose={() => setOptionsOpen(false)}
        tiles={tiles}
      />

      {blocked && blockedSheet && !blockedDismissed && (
        <CaptureSheet
          open
          onClose={() => setBlockedDismissed(true)}
          body={blockedSheet.body}
          title="Camera unavailable"
          actions={blockedSheet.actions}
        />
      )}

      {slots.overlays}
    </div>
  );
}
