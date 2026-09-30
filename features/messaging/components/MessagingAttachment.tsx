"use client";

import type { Attachment } from "@ai-matrx/messaging";
import { InlineMediaRef } from "@ai-matrx/media/react";
import { FileText, ExternalLink } from "lucide-react";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";

/** Media resolves through the same authenticated file pipeline as Chat. */
export function MessagingAttachment({
  attachment,
}: {
  attachment: Attachment;
}) {
  const open = useOpenFilePreviewWindow();
  const media = /^(image|video|audio)\//.test(attachment.mimeType ?? "");
  return (
    <div className="messages-media">
      {media && (
        <InlineMediaRef
          ref={{ file_id: attachment.fileId, mime_type: attachment.mimeType }}
          size="fill"
          fit="contain"
          as={
            (attachment.mimeType ?? "").startsWith("video/")
              ? "video"
              : (attachment.mimeType ?? "").startsWith("audio/")
                ? "audio"
                : "img"
          }
          controls={true}
          crossOrigin="anonymous"
          alt={attachment.fileName}
          fallback="skeleton"
          errorFallback="icon"
          onClick={
            (attachment.mimeType ?? "").startsWith("image/")
              ? () => open({ fileId: attachment.fileId })
              : undefined
          }
        />
      )}
      <button
        type="button"
        className="messages-file-link"
        onClick={() => open({ fileId: attachment.fileId })}
      >
        <FileText size={15} />
        <span className="truncate">{attachment.fileName}</span>
        <ExternalLink size={12} />
      </button>
    </div>
  );
}
