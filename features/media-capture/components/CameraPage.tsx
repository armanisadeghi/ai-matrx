"use client";

/**
 * features/media-capture/components/CameraPage.tsx — the /camera route body.
 *
 * Capture Studio (photo / video / audio) + the full capture management lens
 * (`CaptureLibrary`): kind filters, upload-state chips with failed-upload
 * retry, TUS resume-pending indicator, journal recovery, and the canonical
 * file context menu / viewer links — all over the EXISTING files data layer
 * (no second query stack). Body stays `h-full overflow-hidden` with the
 * internal scroll on the content column (core-route rules).
 */

import { useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { CaptureStudio } from "@/features/media-capture/components/CaptureStudio";
import { CaptureLibrary } from "@/features/media-capture/components/CaptureLibrary";

export default function CameraPage() {
  const [studioOpen, setStudioOpen] = useState(true);
  // Bumped on save so the lens reflects the new row even if realtime lags.
  const [saveCount, setSaveCount] = useState(0);

  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-2">
          <Camera className="h-4 w-4 shrink-0 text-primary" />
          <h1 className="shrink-0 text-sm font-semibold">Camera</h1>
          <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:inline">
            Photo, video, and audio — saved to your captures.
          </span>
          {!studioOpen && (
            <Button
              size="sm"
              className="ml-auto h-8"
              onClick={() => setStudioOpen(true)}
            >
              <Camera className="mr-1.5 h-4 w-4" />
              New capture
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="h-full overflow-hidden bg-textured">
        {/*
          The studio must FIT the viewport — never grow to the camera's
          intrinsic size and push the library off-screen (a real feed made the
          stage taller than the page). On desktop the column does not scroll:
          studio and library split the available height (≈60/40) and each is
          `min-h-0` so the stage is bounded and the library scrolls INSIDE its
          own region. On mobile a bounded split would crush the stage, so the
          column falls back to a normal vertical scroll with min-height floors.
        */}
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 pt-[var(--shell-header-h)] md:overflow-hidden">
          {studioOpen && (
            <div className="min-h-[360px] shrink-0 md:min-h-0 md:flex-[3] md:basis-0">
              <CaptureStudio
                sourceFeature="camera"
                onSaved={() => setSaveCount((n) => n + 1)}
              />
            </div>
          )}
          <div className="min-h-[280px] shrink-0 md:min-h-0 md:flex-[2] md:basis-0 md:overflow-y-auto">
            <CaptureLibrary refreshToken={saveCount} />
          </div>
        </div>
      </div>
    </>
  );
}
