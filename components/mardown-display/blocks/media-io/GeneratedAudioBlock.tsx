"use client";

/**
 * GeneratedAudioBlock — THE renderer for the `generated_audio` kind. There is
 * no other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (`features/content-ir/FEATURE.md`). Every
 * `ai.text_to_speech` node emits this shape. **Do not build a second TTS
 * result card.**
 *
 * 🚨 MEDIA DURABILITY. Playback goes through `<InlineMediaRef as="audio">`
 * with the clip's durable handle — `file_id` first, then the permanent CDN
 * URL, then any playable URL (the bridge decides; see
 * `kinds/media-io-shared.ts`). No raw `<audio src>`, so an expiring URL
 * re-mints instead of breaking.
 *
 * The `audio_b64`-only case is real (a provider that returned bytes and
 * nothing persisted) and is stated honestly rather than rendered as a silent
 * broken player.
 */

import { AudioLines, Loader2 } from "lucide-react";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import type { GeneratedAudioData } from "@/features/content-ir/kinds/generated-audio";
import {
  formatCost,
  formatDuration,
  readUsage,
} from "@/features/content-ir/kinds/media-io-shared";
import { cn } from "@/lib/utils";

export interface GeneratedAudioBlockProps {
  serverData?: unknown;
  hideHeader?: boolean;
  className?: string;
}

export function readGeneratedAudioData(
  serverData: unknown,
): GeneratedAudioData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<GeneratedAudioData>;
  // `handle` is the bridge's own derived field — its presence (even as null)
  // is what distinguishes this shape from foreign serverData.
  if (!("handle" in candidate)) return null;
  return {
    handle: typeof candidate.handle === "string" ? candidate.handle : null,
    file_id: typeof candidate.file_id === "string" ? candidate.file_id : null,
    audio_url: typeof candidate.audio_url === "string" ? candidate.audio_url : null,
    audio_cdn_url:
      typeof candidate.audio_cdn_url === "string" ? candidate.audio_cdn_url : null,
    audio_signed_url:
      typeof candidate.audio_signed_url === "string"
        ? candidate.audio_signed_url
        : null,
    mime_type: typeof candidate.mime_type === "string" ? candidate.mime_type : null,
    duration_seconds:
      typeof candidate.duration_seconds === "number" ? candidate.duration_seconds : null,
    model: typeof candidate.model === "string" ? candidate.model : "",
    usage: readUsage(candidate.usage),
    bytesOnly: candidate.bytesOnly === true,
    isComplete: candidate.isComplete === true,
  };
}

export default function GeneratedAudioBlock({
  serverData,
  hideHeader = false,
  className,
}: GeneratedAudioBlockProps) {
  const openFilePreview = useOpenFilePreviewWindow();
  const data = readGeneratedAudioData(serverData);
  if (!data) return null;

  const duration = formatDuration(data.duration_seconds);
  const cost = formatCost(data.usage?.cost_usd ?? null);

  return (
    <div className={cn("my-2 space-y-2", className)}>
      {!hideHeader && (
        <div className="flex flex-wrap items-center gap-2">
          <AudioLines className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            Generated audio
          </span>
          {data.model && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {data.model}
            </span>
          )}
          {duration && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {duration}
            </span>
          )}
          {cost && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {cost}
            </span>
          )}
          {!data.isComplete && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Synthesizing
            </span>
          )}
        </div>
      )}

      {data.handle ? (
        <>
          {/* The wrapper is a HEIGHT, not chrome: `size="fill"` means
              `h-full`, and a parent with auto height renders the player at
              0px — audible to no one. */}
          <div className="h-[54px] w-full">
            <InlineMediaRef
              ref={data.handle}
              as="audio"
              size="fill"
              rounded="md"
              controls
              preload="metadata"
            />
          </div>
          {/* NO DEAD ENDS: a clip with a durable id is a file the user can open. */}
          {data.file_id && (
            <button
              type="button"
              onClick={() => openFilePreview({ fileId: data.file_id })}
              className="rounded text-[11px] text-primary underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Open file
            </button>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {data.bytesOnly
            ? "The provider returned raw audio bytes with no stored file, so there is nothing to play here yet."
            : data.isComplete
              ? "No audio was returned."
              : "Waiting for the audio…"}
        </p>
      )}
    </div>
  );
}
