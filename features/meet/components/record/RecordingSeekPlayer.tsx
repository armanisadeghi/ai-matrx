"use client";

// features/meet/components/record/RecordingSeekPlayer.tsx
//
// THE RECORDING, SEEKABLE FROM THE TRANSCRIPT (Meet wave 3). Same bytes lane as
// the package's `RecordingPlayer` — `host.api.fileMedia` mints the file-session
// cookie and streams, or reads the bytes and says why — plus the one thing a
// record page needs that the package player cannot offer: a transcript line
// can move the playhead, and the playhead tells the transcript where it is.
//
// Loaded on a click (a recording is tens of megabytes; nobody who opened the
// summary asked to download a video) or on the first seek request.

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useEffect, useRef, useState } from "react";
import { Loader2, Play } from "lucide-react";
import {
  fileDownloadPath,
  useMeetHost,
  type MeetFileMedia,
} from "@ai-matrx/meet/react";
import { Button } from "@/components/ui/button";

export interface SeekRequest {
  readonly ms: number;
  /** Changes on every request, so seeking to the same spot twice still seeks. */
  readonly nonce: number;
}

export function RecordingSeekPlayer({
  fileId,
  seek,
  onTime,
}: {
  fileId: string;
  seek: SeekRequest | null;
  onTime?: (ms: number) => void;
}) {
  const host = useMeetHost();
  const video = useRef<HTMLVideoElement | null>(null);
  const [media, setMedia] = useState<MeetFileMedia | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<number | null>(null);
  const handled = useRef<number | null>(null);

  // A `blob:` url is revoked on unmount; a streaming url is not one.
  useEffect(() => {
    if (media === null || media.kind !== "bytes") return undefined;
    const url = media.url;
    return () => URL.revokeObjectURL(url);
  }, [media]);

  const load = async () => {
    if (host === null || loading) return;
    setLoading(true);
    setError(null);
    try {
      setMedia(await host.api.fileMedia(fileId, "meet.recording.play"));
    } catch (thrown) {
      const failure = thrown as { message?: string; remedy?: string };
      setError(
        [failure.message ?? "The recording could not be loaded.", failure.remedy]
          .filter(Boolean)
          .join(" "),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (seek === null || handled.current === seek.nonce) return;
    handled.current = seek.nonce;
    const element = video.current;
    if (element !== null && element.readyState >= 1) {
      element.currentTime = seek.ms / 1000;
      void element.play().catch(() => undefined);
      return;
    }
    pending.current = seek.ms;
    if (media === null) void load();
  });

  if (host === null) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
        Choose an organization from the avatar menu to play this recording.
      </div>
    );
  }

  if (media === null) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-border bg-black/90">
        <Button
          variant="secondary"
          size="sm"
          className="gap-1.5"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
          {loading ? "Loading the recording…" : "Play recording"}
        </Button>
        {error ? (
          <p role="alert" className="max-w-md px-4 text-center text-xs text-red-300">
            {error}
            <ErrorAlchemyMenu error={error} size="xs" />
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* The transcript beside the player is its caption track. */}
      <video
        ref={video}
        className="aspect-video w-full rounded-lg bg-black"
        src={media.url}
        controls
        preload="metadata"
        onLoadedMetadata={(event) => {
          if (pending.current !== null) {
            event.currentTarget.currentTime = pending.current / 1000;
            pending.current = null;
            void event.currentTarget.play().catch(() => undefined);
          }
        }}
        onTimeUpdate={(event) => onTime?.(event.currentTarget.currentTime * 1000)}
        onError={() => {
          if (media.kind === "stream") {
            // The media element does not say why; retry through the bytes lane.
            setMedia(null);
            void (async () => {
              try {
                setMedia({
                  url: await host.api.fetchObjectUrl({
                    path: fileDownloadPath(fileId),
                    operation: "meet.recording.play",
                  }),
                  kind: "bytes",
                  fallbackReason:
                    "Streaming did not start, so the recording was downloaded in full instead. Seeking works once it finishes.",
                });
              } catch (thrown) {
                setError((thrown as Error).message ?? "The recording could not be played.");
              }
            })();
          } else {
            setMedia(null);
            setError("The downloaded recording could not be played. Reload the page and try again.");
          }
        }}
      />
      {media.fallbackReason ? (
        <p className="text-xs text-muted-foreground">{media.fallbackReason}</p>
      ) : null}
    </div>
  );
}
