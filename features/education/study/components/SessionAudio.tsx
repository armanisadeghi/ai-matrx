"use client";

// features/education/study/components/SessionAudio.tsx
//
// A durable native <audio> for a study artifact (a per-attempt response clip or a
// full-session recording). Resolves the src from a durable file_id via useFileSrc
// (re-mints per the media-durability rules — never a stored expiring URL). Always
// mounted with native controls so iOS plays on the user's tap (no off-gesture
// .play()). Mode-agnostic — used by any study mode's session views.

import { useFileSrc } from "@/features/files";

export function SessionAudio({
  fileId,
  className,
}: {
  fileId: string | null | undefined;
  className?: string;
}) {
  const src = useFileSrc(fileId ? { kind: "file_id", fileId } : null);
  if (!fileId) return null;
  return (
    <audio
      src={src ?? undefined}
      controls
      preload="none"
      className={className ?? "mt-1 h-8 w-full"}
    >
      <track kind="captions" />
    </audio>
  );
}
