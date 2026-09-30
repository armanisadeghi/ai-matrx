"use client";
import type { Attachment } from "@ai-matrx/messaging";
import { FileText } from "lucide-react";

/** Self-contained sample bytes: the gallery never needs access to a private file. */
export function DemoAttachment({ attachment }: { attachment: Attachment }) {
  if ((attachment.mimeType ?? "").startsWith("image/"))
    return (
      <img
        src="/messages-demo-landscape.svg"
        alt="Demo landscape attachment"
        className="max-w-full rounded-xl"
        width={280}
        height={180}
      />
    );
  if ((attachment.mimeType ?? "").startsWith("audio/"))
    return (
      <audio
        controls
        preload="metadata"
        src="/messages-demo-tone.wav"
        aria-label="Demo audio attachment"
        className="max-w-full"
      />
    );
  if ((attachment.mimeType ?? "").startsWith("video/"))
    return (
      <video
        controls
        preload="metadata"
        poster="/messages-demo-landscape.svg"
        src="/messages-demo-video.mp4"
        aria-label="Demo video attachment"
        className="max-w-full rounded-xl"
        width={280}
      />
    );
  return (
    <a
      href="/messages-demo-landscape.svg"
      download="design-sample.svg"
      className="inline-flex items-center gap-2 rounded-lg border p-3"
    >
      <FileText size={24} />
      <span>
        Design sample.svg
        <small className="block">Download attachment</small>
      </span>
    </a>
  );
}
