"use client";

/**
 * /demos/media-capture — dev harness exercising the REAL media-capture
 * primitives (no mocks): CaptureStudio (framing modes, shutter, review,
 * save-through-fileHandler), quality profiles, device/facing switching, and
 * the live camera-stream-manager diagnostics so lease/error states are
 * observable while testing.
 */

import { useState, useSyncExternalStore } from "react";
import { Camera } from "lucide-react";
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
  const [mounted, setMounted] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);

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
    <div className="mx-auto flex h-dvh max-w-3xl flex-col gap-3 p-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Camera className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold">Media Capture harness</h1>
        <div className="ml-auto flex items-center gap-1">
          {PROFILES.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={p === profile ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => {
                setProfile(p);
              }}
            >
              {p}
            </Button>
          ))}
          <Button
            size="sm"
            variant={mounted ? "destructive" : "default"}
            className="h-8 text-xs"
            onClick={() => setMounted((m) => !m)}
          >
            {mounted ? "Unmount studio" : "Mount studio"}
          </Button>
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
            Studio unmounted — the camera light must be OFF (last-lease-release
            shutdown) and the diagnostics below must read idle / 0 leases.
          </p>
        )}
      </div>

      <div className="shrink-0 rounded-lg border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
        <p>
          manager: state={cameraState.state} leases={cameraState.leaseCount}{" "}
          pinnedBy={cameraState.pinnedBy ?? "none"} spec=
          {cameraState.activeSpec
            ? `${cameraState.activeSpec.deviceId ?? cameraState.activeSpec.facingMode ?? "auto"}/${cameraState.activeSpec.profile}`
            : "none"}
        </p>
        <p>
          devices: cameras={devices.cameras.length} camPermission=
          {devices.cameraPermissionState ?? "unknown"}
        </p>
        <p>saved file_ids: {savedIds.length === 0 ? "—" : savedIds.join(", ")}</p>
      </div>
    </div>
  );
}
