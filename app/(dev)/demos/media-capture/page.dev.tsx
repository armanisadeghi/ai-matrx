"use client";

/**
 * /demos/media-capture — the Capture Studio running on the REAL primitives
 * (no mocks): device rail, photo/video/audio modes, the recording HUD, review,
 * save-through-fileHandler, and transcription.
 *
 * This reads as a product demo first. The lease/permission diagnostics that
 * make leak-testing possible are still here — collapsed into the footer, where
 * they belong. The "unmount the studio and watch the camera light go out"
 * check lives on the footer's own toggle.
 */

import { useState, useSyncExternalStore } from "react";
import { Camera, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaptureStudio } from "@/features/media-capture/components/CaptureStudio";
import type { CaptureQualityProfile } from "@/features/media-capture/core/capture-types";
import {
  getCameraStreamState,
  subscribeCameraStream,
} from "@/features/media-capture/runtime/camera-stream-manager";
import {
  getMediaDevicesSnapshot,
  subscribeMediaDevices,
} from "@/features/media-devices/deviceManager";

const PROFILES: CaptureQualityProfile[] = [
  "maximum-available",
  "1080p",
  "720p",
];

export default function MediaCaptureDemoPage() {
  const [profile, setProfile] = useState<CaptureQualityProfile>("1080p");
  // Mounted by default — this is a capture studio, not a debug console.
  const [mounted, setMounted] = useState(true);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  const cameraState = useSyncExternalStore(
    subscribeCameraStream,
    getCameraStreamState,
    getCameraStreamState,
  );
  const devices = useSyncExternalStore(
    subscribeMediaDevices,
    getMediaDevicesSnapshot,
    getMediaDevicesSnapshot,
  );

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-3 p-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Camera className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold">Capture Studio</h1>
        <span className="text-xs text-muted-foreground">
          Photo, video, and audio — saved to your captures.
        </span>
        <div className="ml-auto flex items-center gap-1">
          {PROFILES.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={p === profile ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => setProfile(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 rounded-lg border border-border p-2">
        {mounted ? (
          <CaptureStudio
            key={profile}
            sourceFeature="media-capture-demo"
            profile={profile}
            onSaved={(fileId) => setSavedIds((prev) => [fileId, ...prev])}
          />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            Studio unmounted. The camera light must now be OFF
            (last-lease-release shutdown) and the diagnostics below must read
            idle with 0 leases.
          </p>
        )}
      </div>

      <div className="shrink-0 rounded-lg border border-border bg-muted/30">
        <button
          type="button"
          onClick={() => setDiagnosticsOpen((o) => !o)}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={diagnosticsOpen}
        >
          {diagnosticsOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Diagnostics
          <span className="ml-auto tabular-nums">
            {cameraState.leaseCount} lease(s) · {devices.cameras.length} camera(s)
            {savedIds.length > 0 ? ` · ${savedIds.length} saved` : ""}
          </span>
        </button>
        {diagnosticsOpen && (
          <div className="space-y-1 border-t border-border px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <p>
              manager: state={cameraState.state} leases={cameraState.leaseCount}{" "}
              pinnedBy={cameraState.pinnedBy ?? "none"} spec=
              {cameraState.activeSpec
                ? `${cameraState.activeSpec.deviceId ?? cameraState.activeSpec.facingMode ?? "auto"}/${cameraState.activeSpec.profile}`
                : "none"}
            </p>
            <p>
              devices: cameras={devices.cameras.length} mics=
              {devices.inputs.length} speakers={devices.outputs.length}{" "}
              camPermission={devices.cameraPermissionState ?? "unknown"}{" "}
              micPermission={devices.permissionState ?? "unknown"}
            </p>
            <p>
              saved file_ids: {savedIds.length === 0 ? "—" : savedIds.join(", ")}
            </p>
            <Button
              size="sm"
              variant={mounted ? "destructive" : "default"}
              className="mt-1 h-7 text-xs"
              onClick={() => setMounted((m) => !m)}
            >
              {mounted ? "Unmount studio (leak check)" : "Mount studio"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
