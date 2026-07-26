"use client";

// features/education/media/audio/components/AudioStudyDetail.tsx
//
// The audio-study artifact page: live generation (with agent_run-backed recovery)
// while it's producing, then a durable player. Reuses the podcast run machinery
// (useStudioRun → generate/resume stream, LiveProgressRail, RunRecoveryBanner)
// unchanged; adds the education chrome (trust sources, back nav, share) and
// persists the finished episode onto the study_media row.
//
// React Compiler is on: no manual memo.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Headphones,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useStudioRun } from "@/features/podcasts/studio/runs/useStudioRun";
import { LiveProgressRail } from "@/features/podcasts/generator/components/LiveProgressRail";
import { RunRecoveryBanner } from "@/features/podcasts/studio/components/RunRecoveryBanner";
import { SessionAudio } from "@/features/education/study/components/SessionAudio";
import { podcastService } from "@/features/podcasts/service";
import { SourceCitations } from "@/features/education/trust/components/SourceCitations";
import { ConfidenceBadge } from "@/features/education/trust/components/ConfidenceBadge";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { useAccess } from "@/utils/permissions/access";
import { fileIdFromUserFilesUrl } from "@/lib/media/durability";
import { studyMediaService } from "../../service";
import type { StudyMediaRow } from "../../types";

const FORMAT_LABEL: Record<string, string> = {
  overview: "Audio overview",
  debate: "Debate",
  panel: "Panel",
  review: "Audio review",
};

/**
 * Durable audio playback for a finished study. Prefers the re-mintable `file_id`
 * (best); falls back to the produced episode's durable public audio URL — the
 * path that matters when the run completed while the tab was closed, so no
 * live `audio_stream_end` file_id was ever captured (recovery).
 */
function AudioPlayback({
  fileId,
  episodeId,
}: {
  fileId: string | null;
  episodeId: string | null;
}) {
  const [episodeUrl, setEpisodeUrl] = useState<string | null>(null);

  useEffect(() => {
    if (fileId || !episodeId) return;
    let active = true;
    podcastService.fetchEpisodeById(episodeId).then((ep) => {
      if (active) setEpisodeUrl(ep?.audio_url ?? null);
    });
    return () => {
      active = false;
    };
  }, [fileId, episodeId]);

  if (fileId) return <SessionAudio fileId={fileId} className="h-10 w-full" />;
  if (episodeUrl) {
    // Episode audio_url is a durable public/CDN URL (episodes are share-ready).
    return (
      <audio src={episodeUrl} controls preload="none" className="h-10 w-full">
        <track kind="captions" />
      </audio>
    );
  }
  return (
    <div className="flex h-10 items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading audio…
    </div>
  );
}

/** Build the "generate a new version" link, preserving the original source kind. */
function regenerateHref(media: StudyMediaRow): string {
  const format = media.audio_format ?? "overview";
  if (media.source_kind === "topic") {
    return `/education/audio-study/new?source=topic&format=${format}`;
  }
  return `/education/audio-study/new?source=deck&deck=${media.source_id ?? ""}&format=${format}`;
}

export function AudioStudyDetail({ mediaId }: { mediaId: string }) {
  const router = useRouter();
  const [media, setMedia] = useState<StudyMediaRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    studyMediaService.getById(mediaId).then((res) => {
      if (!active) return;
      setMedia(res.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [mediaId]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!media) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 p-10 text-center">
        <Headphones className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          This audio study doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/education/audio-study")}
        >
          Back to Audio Study
        </Button>
      </div>
    );
  }

  const isReady =
    media.status === "ready" &&
    Boolean(media.audio_file_id || media.episode_id);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4">
      <Header
        media={media}
        onBack={() => router.push("/education/audio-study")}
        onDeleted={() => router.push("/education/audio-study")}
      />
      {isReady ? (
        <ReadyAudioView media={media} />
      ) : (
        <LiveAudioRun media={media} onReady={setMedia} />
      )}
      <TrustPanel media={media} />
    </div>
  );
}

function Header({
  media,
  onBack,
  onDeleted,
}: {
  media: StudyMediaRow;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const { isOwner } = useAccess("study_media", media.id);

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this audio study?",
      description:
        "It will be removed from your library. This can't be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await studyMediaService.softDelete(media.id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Deleted");
    onDeleted();
  }

  return (
    <div className="flex items-start gap-3">
      <Button
        variant="ghost"
        size="icon"
        className="mt-0.5 shrink-0"
        onClick={onBack}
        aria-label="Back"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {FORMAT_LABEL[media.audio_format ?? "overview"] ?? "Audio"}
          </span>
          {media.source_title && (
            <span className="truncate text-xs text-muted-foreground">
              from {media.source_title}
            </span>
          )}
        </div>
        <h1 className="mt-1 truncate text-lg font-semibold text-foreground">
          {media.title}
        </h1>
      </div>
      {isOwner && (
        <div className="flex shrink-0 items-center gap-1">
          <ShareButton
            resourceType="study_media"
            resourceId={media.id}
            resourceName={media.title}
            isOwner
            size="sm"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            aria-label="Delete"
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      )}
    </div>
  );
}

/** A finished audio study — the durable player + owner regenerate. */
function ReadyAudioView({ media }: { media: StudyMediaRow }) {
  const router = useRouter();
  const { isOwner } = useAccess("study_media", media.id);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Headphones className="h-4 w-4 text-primary" />
        Listen
      </div>
      <AudioPlayback
        fileId={media.audio_file_id}
        episodeId={media.episode_id}
      />
      {isOwner && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => router.push(regenerateHref(media))}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Generate a new version
          </Button>
        </div>
      )}
    </div>
  );
}

/** A live/interrupted run — streams generation, shows progress + recovery, and
 *  persists the finished episode onto the study_media row exactly once. */
function LiveAudioRun({
  media,
  onReady,
}: {
  media: StudyMediaRow;
  onReady: (updated: StudyMediaRow) => void;
}) {
  const run = useStudioRun(media.run_id ?? "");
  const persistedRef = useRef(false);

  const { state } = run;

  // Persist the finished episode onto the artifact row — once.
  useEffect(() => {
    if (state.status !== "done" || persistedRef.current) return;
    const fileId =
      state.audioFileId ?? fileIdFromUserFilesUrl(state.audioUrl ?? "");
    // A durable anchor is either the re-mintable file_id (live path) OR the
    // produced episode (recovery path — no live file_id was ever captured).
    if (!fileId && !state.episodeId) return;
    persistedRef.current = true;
    void (async () => {
      const res = await studyMediaService.update(media.id, {
        status: "ready",
        episode_id: state.episodeId,
        audio_file_id: fileId,
        title: state.title || media.title,
      });
      if (res.error || !res.data) {
        toast.error(res.error ?? "Couldn't save the finished audio");
        return;
      }
      toast.success("Audio study ready");
      onReady(res.data);
    })();
  }, [
    state.status,
    state.audioFileId,
    state.audioUrl,
    state.episodeId,
    state.title,
    media.id,
    media.title,
    onReady,
  ]);

  // Mark the artifact errored so the library reflects it (best-effort).
  useEffect(() => {
    if (state.status === "error" && media.status !== "error") {
      void studyMediaService.update(media.id, { status: "error" });
    }
  }, [state.status, media.id, media.status]);

  if (!media.run_id) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        This audio study is missing its generation run.
      </div>
    );
  }

  const audioReady = Boolean(state.audioFileId || state.episodeId);

  return (
    <div className="space-y-4">
      <RunRecoveryBanner
        status={state.status}
        streaming={run.streaming}
        stalled={run.stalled}
        backgroundWorking={run.backgroundWorking}
        canReconnect={run.canReconnect}
        canRerun={run.recovery.canRerun}
        audioMissing={state.status === "done" && !audioReady}
        error={state.error}
        onResume={run.reconnect}
        onRerun={run.rerunFromSource}
      />

      {/* As soon as a durable audio file lands (before the run fully completes),
          let the listener play it. */}
      {audioReady && (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Headphones className="h-4 w-4 text-primary" />
            Listen
          </div>
          <AudioPlayback
            fileId={state.audioFileId}
            episodeId={state.episodeId}
          />
        </div>
      )}

      {(run.streaming || state.status === "running" || run.loading) &&
        !audioReady && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span>
              Producing your audio — you can leave and come back; it resumes.
            </span>
          </div>
        )}

      <LiveProgressRail state={state} startedAt={run.startedAt} />
    </div>
  );
}

function TrustPanel({ media }: { media: StudyMediaRow }) {
  const trust = coerceTrustEnvelope({ trust: media.trust });
  if (!trust) return null;
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">Grounded in</span>
        <ConfidenceBadge confidence={trust.confidence} />
      </div>
      <SourceCitations trust={trust} />
    </div>
  );
}
