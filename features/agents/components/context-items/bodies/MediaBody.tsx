"use client";

/**
 * Media drawer body — image / audio / video / document / youtube, filling the
 * full height. Renders through the universal file handler so URLs self-heal.
 * Documents (PDFs, etc.) embed full-height via the resolved src. The
 * open-original action lives in `MediaFooter`.
 */

import { ExternalLink } from "lucide-react";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
import type { FileSource } from "@/features/files/handler/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ContextItemBodyProps } from "../types";

function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/,
  );
  return m?.[1] ?? null;
}

function toFileSource(
  fileId: string | null | undefined,
  fileUrl: string | null | undefined,
): FileSource | null {
  if (fileId) return { kind: "file_id", fileId };
  if (fileUrl) return { kind: "external_url", url: fileUrl };
  return null;
}

export function MediaBody({ item }: ContextItemBodyProps) {
  const { fileId, fileUrl } = item.refs;
  const ref = fileId ?? fileUrl ?? null;
  const resolvedSrc = useFileSrc(toFileSource(fileId, fileUrl));

  if (item.blockType === "youtube_video" && fileUrl) {
    const id = youtubeId(fileUrl);
    if (id) {
      return (
        <iframe
          src={`https://www.youtube.com/embed/${id}`}
          title={item.title}
          className="h-full w-full bg-black"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      );
    }
  }

  const isDocument =
    item.blockType === "document" || item.blockType === "file_output";

  if (isDocument) {
    return resolvedSrc ? (
      <iframe
        src={resolvedSrc}
        title={item.title}
        className="h-full w-full bg-white"
      />
    ) : (
      <p className="p-4 text-xs text-muted-foreground italic">
        Preview unavailable for this file.
      </p>
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
    <div className="flex h-full min-h-0 items-center justify-center p-3">
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

export function MediaFooter({ item }: ContextItemBodyProps) {
  const { fileId, fileUrl } = item.refs;
  const src = useFileSrc(toFileSource(fileId, fileUrl));
  const href = fileUrl ?? src;
  if (!href) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </TooltipTrigger>
      <TooltipContent>Open original</TooltipContent>
    </Tooltip>
  );
}
