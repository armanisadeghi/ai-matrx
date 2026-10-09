"use client";

/**
 * The player of a post (UI-SPEC §4). One frame sized by the media's true aspect
 * ratio, and three honest states:
 *
 *   poster    the stored/provider thumbnail (or a designed placeholder) with a
 *             Play affordance. Never an error look: a video that is not stored
 *             yet is simply "press Play".
 *   working   Play pressed and the video is being fetched, then downloaded:
 *             a skeleton + spinner over the poster, with the stage and a real
 *             percentage when the stream or the download reports one.
 *   playing   the video (a blob URL through the authenticated door) or the
 *             YouTube embed, started automatically.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, RotateCw } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { formatDuration } from "../mappers";
import { confirmPostSpend } from "../postSpend";
import { fetchPlaybackUrl, ingestPost, listPostMedia, socialErrorMessage } from "../server";
import type { PostMediaRef } from "../types";
import { PlatformMark, platformLabel } from "./PlatformMark";

/** Aspect ratio (w/h) a post's player starts with, before the poster or the video reports its own. */
export function guessAspect(format: string, platform: string): number {
  if (platform === "youtube") return format === "short" ? 9 / 16 : 16 / 9;
  return ["reel", "short", "story", "video"].includes(format) && platform !== "facebook" && platform !== "linkedin" && platform !== "x"
    ? 9 / 16
    : 16 / 9;
}

/** Whether a post of this platform/format is a video the player can be asked for. */
export function isVideoPost(format: string, platform: string): boolean {
  return platform === "youtube" || platform === "tiktok" || ["reel", "short", "story", "video"].includes(format);
}

type Stage =
  | { kind: "idle" }
  | { kind: "working"; label: string; pct: number | null }
  | { kind: "error"; message: string; failure: unknown };

const IDLE: Stage = { kind: "idle" };

function pickPrimary(list: readonly PostMediaRef[] | undefined): PostMediaRef | undefined {
  return list?.find((m) => m.role === "video") ?? list?.find((m) => m.role.startsWith("image")) ?? list?.[0];
}

export function PostMedia({
  postId,
  organizationId,
  thumbnailUrl,
  postUrl,
  platform,
  platformPostId,
  format,
  durationSeconds,
  onRatio,
  fill,
}: {
  postId: string;
  organizationId: string;
  thumbnailUrl: string | null;
  postUrl: string;
  platform: string;
  platformPostId: string;
  format: string;
  durationSeconds: number | null;
  /** Reports the media's true aspect ratio once known, so the host can lay out around it. */
  onRatio?: (ratio: number) => void;
  /** The host sizes the box (a board tile): the frame fills it instead of following the media's ratio. */
  fill?: boolean;
}) {
  const client = useQueryClient();
  const embed = platform === "youtube";
  const wantsVideo = isVideoPost(format, platform);
  const mediaKey = useMemo(() => ["marketing", "social", "media", postId] as const, [postId]);
  const media = useQuery({
    queryKey: mediaKey,
    queryFn: ({ signal }) => listPostMedia(postId, { organizationId, signal }),
    staleTime: 60_000,
    enabled: !embed,
  });

  const [ratio, setRatioState] = useState(() => guessAspect(format, platform));
  const [src, setSrc] = useState<string | null>(null);
  const [embedding, setEmbedding] = useState(false);
  const [stage, setStage] = useState<Stage>(IDLE);
  const [posterBroken, setPosterBroken] = useState(false);
  const [storedPoster, setStoredPoster] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function setRatio(next: number) {
    setRatioState(next);
    onRatio?.(next);
  }
  useEffect(() => {
    onRatio?.(ratio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const current = src;
    return () => {
      if (current) URL.revokeObjectURL(current);
    };
  }, [src]);
  useEffect(() => {
    const current = storedPoster;
    return () => {
      if (current) URL.revokeObjectURL(current);
    };
  }, [storedPoster]);

  const primary = embed ? undefined : pickPrimary(media.data);
  const storedImage = embed ? undefined : media.data?.find((m) => m.role.startsWith("image"));
  const primaryIsVideo = primary ? (primary.mime_type?.startsWith("video") ?? primary.role === "video") : false;

  // Provider thumbnails expire. When one fails (or none exists) the stored image, if any, takes its place.
  const youtubePoster = embed && platformPostId ? `https://i.ytimg.com/vi/${encodeURIComponent(platformPostId)}/hqdefault.jpg` : null;
  const providerPoster = posterBroken ? null : (thumbnailUrl ?? youtubePoster);
  useEffect(() => {
    if (providerPoster || storedPoster || !storedImage) return;
    let cancelled = false;
    void fetchPlaybackUrl(storedImage.door, { organizationId })
      .then((url) => {
        if (cancelled || !alive.current) URL.revokeObjectURL(url);
        else setStoredPoster(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [providerPoster, storedPoster, storedImage, organizationId]);
  const poster = providerPoster ?? storedPoster;

  async function play() {
    if (embed) {
      setEmbedding(true);
      return;
    }
    setStage({ kind: "working", label: "Getting the video", pct: null });
    try {
      let ref = primaryIsVideo ? primary : undefined;
      if (!ref) {
        if (!(await confirmPostSpend("fetch_video"))) {
          setStage(IDLE);
          return;
        }
        await ingestPost(
          { url: postUrl, landMedia: true, transcript: false, force: true },
          {
            organizationId,
            onProgress: (p) => {
              if (alive.current) setStage({ kind: "working", label: "Getting the video", pct: p.step && p.total ? Math.round((p.step / p.total) * 100) : null });
            },
          },
        );
        const fresh = await client.fetchQuery({
          queryKey: mediaKey,
          queryFn: ({ signal }) => listPostMedia(postId, { organizationId, signal }),
          staleTime: 0,
        });
        const found = fresh.find((m) => m.role === "video") ?? fresh.find((m) => m.mime_type?.startsWith("video"));
        if (!found) throw new Error("This post has no video to play");
        ref = found;
      }
      if (alive.current) setStage({ kind: "working", label: "Loading the video", pct: 0 });
      const url = await fetchPlaybackUrl(ref.door, {
        organizationId,
        onBytes: (loaded, total) => {
          if (alive.current) setStage({ kind: "working", label: "Loading the video", pct: total ? Math.min(99, Math.round((loaded / total) * 100)) : null });
        },
      });
      if (!alive.current) {
        URL.revokeObjectURL(url);
        return;
      }
      setSrc(url);
      setStage(IDLE);
    } catch (err) {
      if (alive.current) setStage({ kind: "error", message: socialErrorMessage(err, "Couldn't load the video"), failure: err });
    }
  }

  const working = stage.kind === "working";

  if (embed && embedding) {
    return (
      <Frame ratio={ratio} fill={fill}>
        <iframe
          title="YouTube player"
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(platformPostId)}?autoplay=1&rel=0&playsinline=1`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0"
        />
      </Frame>
    );
  }
  if (src) {
    return (
      <Frame ratio={ratio} fill={fill}>
        <video
          src={src}
          poster={poster ?? undefined}
          controls
          autoPlay
          playsInline
          loop
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight);
          }}
          className="h-full w-full object-contain"
        />
      </Frame>
    );
  }

  const duration = formatDuration(durationSeconds);
  // A post with no video to ask for (an image post, a carousel) shows its poster and nothing to press.
  const canPlay = embed || wantsVideo;

  return (
    <Frame ratio={ratio} fill={fill}>
      {poster ? (
        <img
          src={poster}
          alt=""
          referrerPolicy="no-referrer"
          onLoad={(e) => {
            const i = e.currentTarget;
            if (!embed && i.naturalWidth && i.naturalHeight) setRatio(i.naturalWidth / i.naturalHeight);
          }}
          onError={() => (providerPoster ? setPosterBroken(true) : undefined)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <PosterPlaceholder platform={platform} format={format} />
      )}
      {working ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 px-4 text-center text-white" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          <span className="text-xs">{stage.pct === null ? stage.label : `${stage.label} · ${stage.pct}%`}</span>
          {stage.pct !== null ? <Progress value={stage.pct} className="h-1 w-3/5 bg-white/25" /> : <div className="h-1 w-3/5 animate-pulse rounded-full bg-white/40" />}
        </div>
      ) : stage.kind === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 px-4 text-center text-white">
          <span className="text-xs">{stage.message}</span>
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => void play()}
              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-black"
            >
              <RotateCw className="h-3 w-3" aria-hidden />
              Try again
            </button>
            <ErrorAlchemyMenu error={stage.failure} operation="play social post video" />
          </span>
        </div>
      ) : canPlay ? (
        <button
          type="button"
          onClick={() => void play()}
          aria-label="Play"
          className="group absolute inset-0 flex items-center justify-center bg-black/10 transition-colors hover:bg-black/25"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition-transform group-hover:scale-105">
            <Play className="h-5 w-5 fill-current" aria-hidden />
          </span>
        </button>
      ) : null}
      {duration && !working ? (
        <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
          {duration}
        </span>
      ) : null}
    </Frame>
  );
}

function Frame({ ratio, fill, children }: { ratio: number; fill?: boolean; children: React.ReactNode }) {
  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-black" style={fill ? { height: "100%" } : { aspectRatio: String(ratio) }}>
      {children}
    </div>
  );
}

function PosterPlaceholder({ platform, format }: { platform: string; format: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-end gap-2 pb-6 bg-gradient-to-br from-muted to-muted-foreground/20">
      <PlatformMark platform={platform} size={36} />
      <span className="text-xs text-muted-foreground">{`${platformLabel(platform)} ${format}`}</span>
    </div>
  );
}
