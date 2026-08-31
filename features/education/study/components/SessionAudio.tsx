"use client";

// features/education/study/components/SessionAudio.tsx
//
// Durable playback for a study artifact (a per-attempt response clip or a
// full-session recording). InlineMediaRef re-mints from file_id and joins the
// host playback port, so study audio cannot overlap a podcast, video, or TTS.
// Native controls remain visible so iOS playback begins in the user's gesture.

import { useState } from "react";
import { InlineMediaRef } from "@ai-matrx/media/react";

export function SessionAudio({
  fileId,
  className,
}: {
  fileId: string | null | undefined;
  className?: string;
}) {
  const [failedFileId, setFailedFileId] = useState<string | null>(null);
  if (!fileId) return null;

  if (failedFileId === fileId) {
    return (
      <p className="text-xs text-destructive" role="alert">
        This study audio could not be loaded. Try again.
      </p>
    );
  }

  return (
    <InlineMediaRef
      ref={fileId}
      as="audio"
      controls
      preload="none"
      playbackLabel="Study session audio"
      onError={() => setFailedFileId(fileId)}
      errorFallback={null}
      className={className ?? "mt-1 h-8 w-full"}
    />
  );
}
