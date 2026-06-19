"use client";

/**
 * Media drawer body — image / audio / video / document / youtube. Renders
 * through the universal file handler (`InlineMediaRef`) so URLs self-heal and
 * never ship raw signed/expiring links. Documents fall back to a file chip +
 * open link.
 */

import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { FileResourceChip } from "@/features/files/components/preview/FileResourceChip";
import { ExternalLink } from "lucide-react";
import type { ContextItemBodyProps } from "../types";

function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/,
  );
  return m?.[1] ?? null;
}

export function MediaBody({ item }: ContextItemBodyProps) {
  const { fileId, fileUrl } = item.refs;
  const ref = fileId ?? fileUrl ?? null;

  if (item.blockType === "youtube_video" && fileUrl) {
    const id = youtubeId(fileUrl);
    if (id) {
      return (
        <div className="p-4">
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${id}`}
              title={item.title}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      );
    }
  }

  const isDocument =
    item.blockType === "document" || item.blockType === "file_output";

  if (isDocument) {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        {fileId ? (
          <FileResourceChip fileId={fileId} size="md" />
        ) : (
          <div className="text-sm text-foreground">{item.title}</div>
        )}
        {fileUrl && (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open original
          </a>
        )}
      </div>
    );
  }

  if (!ref) {
    return (
      <p className="p-4 text-xs text-muted-foreground italic">
        No media source on this item.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 items-center justify-center p-4">
      <InlineMediaRef
        ref={ref}
        alt={item.title}
        size="fill"
        fit="contain"
        rounded="lg"
        className="max-h-full max-w-full"
      />
    </div>
  );
}
