"use client";

/**
 * features/media-capture/components/CaptureControls.tsx
 *
 * Control strip for the Capture Studio photo mode: shutter, framing toggle
 * (viewport-crop default / full-frame), and camera selection — facingMode
 * flip on mobile, device select on desktop (devices from the shared
 * media-devices manager; labels appear once permission is granted).
 */

import { Camera, Crop, Frame, Loader2, SwitchCamera } from "lucide-react";
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

export interface CaptureControlsProps {
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
}

export function CaptureControls({
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
}: CaptureControlsProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 pb-safe pt-2">
      <Button
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() =>
          onFramingChange(framing === "viewport-crop" ? "full-frame" : "viewport-crop")
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
            <SelectTrigger className="h-9 w-[190px] text-xs" aria-label="Camera">
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
    </div>
  );
}
