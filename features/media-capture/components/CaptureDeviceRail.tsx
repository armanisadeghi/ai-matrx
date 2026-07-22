"use client";

/**
 * features/media-capture/components/CaptureDeviceRail.tsx
 *
 * The device rail — Camera / Microphone / Speaker selection inline in the
 * studio, where the user actually captures.
 *
 * Canonical sourcing (never a parallel device store, never raw
 * `enumerateDevices`): every list, permission state, resolved id, and setter
 * comes from `useAudioDevices()`, which bridges the framework-free device
 * manager to the persisted `userPreferences.mediaDevices` module. Choosing a
 * device here persists it for every other surface in the app.
 *
 * Presentation reuses the canonical compact device popover
 * (`DeviceMenuPanel` in components/audio/micDeviceMenuShared.tsx) — the same
 * w-60 body the composer's mic picker renders. Three capsule triggers, not
 * three fat selects.
 *
 * Recording lock: the camera lease is PINNED while recording and the mic clone
 * is already composed, so switching devices mid-recording is impossible. The
 * rail disables the affected controls and SAYS WHY rather than failing later.
 */

import { useCallback, useState } from "react";
import { ChevronDown, Mic, MonitorSpeaker, SlidersHorizontal, Video } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { DeviceMenuPanel } from "@/components/audio/micDeviceMenuShared";
import { useAudioDevices } from "@/features/audio/useAudioDevices";
import { useOpenAudioDevices } from "@/features/overlays/openers/audioDevices";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface CaptureDeviceRailProps {
  /** Hide the camera capsule in audio-only mode. */
  showCamera: boolean;
  /** Disables camera + mic switching and explains that recording pins them. */
  recording: boolean;
  className?: string;
}

/** One capsule trigger: icon + resolved label + chevron. */
function DeviceCapsule({
  icon,
  label,
  ariaLabel,
  disabled,
  children,
  onOpenChange,
}: {
  icon: React.ReactNode;
  label: string;
  ariaLabel: string;
  disabled?: boolean;
  children: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            // 44px touch target on mobile via min-h; visually a 32px capsule.
            "inline-flex min-h-[2.75rem] max-w-[11rem] touch-manipulation items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground transition-colors sm:min-h-[2rem]",
            "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <span className="shrink-0 text-muted-foreground">{icon}</span>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={6}
        className="w-60 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function CaptureDeviceRail({
  showCamera,
  recording,
  className,
}: CaptureDeviceRailProps) {
  const {
    cameras,
    inputs,
    outputs,
    selectedCameraId,
    selectedInputId,
    selectedOutputId,
    setCamera,
    setInput,
    setOutput,
    permissionState,
    cameraPermissionState,
    requestPermission,
    requestCameraPermission,
    outputSelectionSupported,
  } = useAudioDevices();
  const openSettings = useOpenAudioDevices();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Opening a picker is the honest moment to ask for the grant that unlocks
  // labels — never at boot (invariant 4: no boot-time camera prompt).
  const onMicOpen = useCallback(
    (open: boolean) => {
      if (open) void requestPermission();
    },
    [requestPermission],
  );
  const onCameraOpen = useCallback(
    (open: boolean) => {
      // Labels for cameras unlock on a camera grant; the studio already holds a
      // lease whenever a preview is live, so this is usually a no-op.
      if (open && cameraPermissionState !== "granted") {
        void requestCameraPermission();
      }
    },
    [cameraPermissionState, requestCameraPermission],
  );

  const labelFor = (
    list: Array<{ deviceId: string; label: string }>,
    id: string,
    fallback: string,
  ): string => {
    if (!id) return fallback;
    const found = list.find((d) => d.deviceId === id);
    return found?.label || fallback;
  };

  const recordingNote = recording
    ? "Locked while recording — the device is pinned for this capture."
    : null;

  const blockedNote = (state: string, what: string): React.ReactNode =>
    state === "denied" ? (
      <div className="px-2 py-1.5">
        <p className="mb-1.5 text-[11px] leading-snug text-destructive">
          {what} access is blocked. Allow it in your browser’s site settings,
          then reopen this menu.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full text-xs"
          onClick={() =>
            what === "Camera"
              ? void requestCameraPermission()
              : void requestPermission()
          }
        >
          Grant {what.toLowerCase()} access
        </Button>
      </div>
    ) : null;

  const cameraPanel = (
    <DeviceMenuPanel
      heading="Camera"
      icon={<Video className="h-3.5 w-3.5" />}
      devices={cameras}
      selectedId={selectedCameraId}
      defaultLabel="Automatic"
      fallbackLabel="Camera"
      onSelect={(deviceId) =>
        setCamera(deviceId, deviceId ? labelFor(cameras, deviceId, "") : "")
      }
      onOpenSettings={() => openSettings()}
      settingsLabel="Device settings…"
      disabledReason={recordingNote}
      footerSlot={blockedNote(cameraPermissionState, "Camera")}
    />
  );

  const micPanel = (
    <DeviceMenuPanel
      heading="Microphone"
      icon={<Mic className="h-3.5 w-3.5" />}
      devices={inputs}
      selectedId={selectedInputId}
      defaultLabel="System default"
      fallbackLabel="Microphone"
      onSelect={(deviceId) =>
        setInput(deviceId, deviceId ? labelFor(inputs, deviceId, "") : "")
      }
      onOpenSettings={() => openSettings()}
      settingsLabel="Device settings…"
      disabledReason={recordingNote}
      footerSlot={blockedNote(permissionState, "Microphone")}
    />
  );

  const speakerPanel = (
    <DeviceMenuPanel
      heading="Speaker"
      icon={<MonitorSpeaker className="h-3.5 w-3.5" />}
      devices={outputSelectionSupported ? outputs : []}
      selectedId={selectedOutputId}
      defaultLabel="System default"
      fallbackLabel="Speaker"
      onSelect={(deviceId) =>
        setOutput(deviceId, deviceId ? labelFor(outputs, deviceId, "") : "")
      }
      onOpenSettings={() => openSettings()}
      settingsLabel="Device settings…"
      disabledReason={
        outputSelectionSupported
          ? null
          : "This browser cannot route audio to a chosen speaker — playback follows the system default."
      }
    />
  );

  // ── Mobile: ONE trigger + a bottom sheet ───────────────────────────────────
  //
  // Three capsules wrap onto two rows at 375px and crush the camera stage — the
  // most important element on the screen. Per the mobile doctrine this collapses
  // into a single control that opens a Drawer with the panels stacked (never
  // tabs, never a Dialog).
  if (isMobile) {
    const summary = showCamera
      ? labelFor(cameras, selectedCameraId, "Auto camera")
      : labelFor(inputs, selectedInputId, "Default mic");
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setSheetOpen(true);
            if (showCamera && cameraPermissionState !== "granted") {
              void requestCameraPermission();
            }
            void requestPermission();
          }}
          aria-label="Capture devices"
          className={cn(
            "inline-flex min-h-[2.75rem] w-full touch-manipulation items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground transition-colors",
            "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            className,
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 font-medium">Devices</span>
          <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
            {summary}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>

        <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
          <DrawerContent className="max-h-[85dvh]">
            <DrawerHeader className="pb-1">
              <DrawerTitle className="text-sm">Capture devices</DrawerTitle>
            </DrawerHeader>
            <div className="space-y-2 overflow-y-auto px-3 pb-safe">
              {recordingNote && (
                <p className="px-1 text-[11px] leading-snug text-muted-foreground">
                  {recordingNote}
                </p>
              )}
              {showCamera && (
                <div className="rounded-lg border border-border">{cameraPanel}</div>
              )}
              <div className="rounded-lg border border-border">{micPanel}</div>
              <div className="rounded-lg border border-border">{speakerPanel}</div>
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      role="group"
      aria-label="Capture devices"
    >
      {showCamera && (
        <DeviceCapsule
          icon={<Video className="h-3.5 w-3.5" />}
          label={labelFor(cameras, selectedCameraId, "Camera: auto")}
          ariaLabel="Choose camera"
          disabled={recording}
          onOpenChange={onCameraOpen}
        >
          {cameraPanel}
        </DeviceCapsule>
      )}

      <DeviceCapsule
        icon={<Mic className="h-3.5 w-3.5" />}
        label={labelFor(inputs, selectedInputId, "Mic: default")}
        ariaLabel="Choose microphone"
        disabled={recording}
        onOpenChange={onMicOpen}
      >
        {micPanel}
      </DeviceCapsule>

      <DeviceCapsule
        icon={<MonitorSpeaker className="h-3.5 w-3.5" />}
        label={labelFor(outputs, selectedOutputId, "Speaker: default")}
        ariaLabel="Choose speaker"
      >
        {speakerPanel}
      </DeviceCapsule>
    </div>
  );
}
