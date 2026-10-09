"use client";

// features/podcasts/generator/components/ResultActions.tsx
//
// What users can DO with a freshly-generated episode — all real writes against
// the persisted pc_episodes row (no mock actions):
//   • Open the public episode page
//   • Publish / unpublish (draft → public)
//   • Choose how the episode page renders (audio / cover / video)
//   • Download the audio, copy the share link, native share

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import {
  ExternalLink,
  Download,
  Link2,
  Share2,
  Globe,
  Loader2,
  Check,
  AudioLines,
  ImageIcon,
  Clapperboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { podcastService } from "@/features/podcasts/service";
import { useShare } from "@/features/sharing/hooks/useShare";
import type { PcDisplayMode } from "@/features/podcasts/types";
import { episodeHref } from "../constants";
import { SegmentedControl } from "@ai-matrx/design-system/controls";
import { downloadUrl } from "@ai-matrx/kit/download";

interface ResultActionsProps {
  episodeId: string;
  episodeSlug: string | null;
  audioUrl: string | null;
  title: string;
  hasVideo: boolean;
}

const DISPLAY_MODES: {
  value: PcDisplayMode;
  label: string;
  icon: typeof AudioLines;
}[] = [
  { value: "audio_only", label: "Audio", icon: AudioLines },
  { value: "with_metadata", label: "Cover", icon: ImageIcon },
  { value: "with_video", label: "Video", icon: Clapperboard },
];

export function ResultActions({
  episodeId,
  episodeSlug,
  audioUrl,
  title,
  hasVideo,
}: ResultActionsProps) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // Mirror the backend's persisted default: a freshly-generated episode with a
  // video (the merged "official" video) renders in video mode; otherwise cover.
  const [displayMode, setDisplayMode] = useState<PcDisplayMode>(
    hasVideo ? "with_video" : "with_metadata",
  );
  const [savingMode, setSavingMode] = useState<PcDisplayMode | null>(null);
  const { share, fallbackDialog } = useShare();

  const href = episodeHref(episodeSlug, episodeId);
  const absoluteUrl =
    href && typeof window !== "undefined"
      ? `${window.location.origin}${href}`
      : href;

  const togglePublish = async () => {
    setPublishing(true);
    try {
      const next = !published;
      await podcastService.updateEpisode(episodeId, { is_published: next });
      setPublished(next);
      toast.success(next ? "Published — now public" : "Unpublished — back to draft");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    } finally {
      setPublishing(false);
    }
  };

  const changeDisplayMode = async (mode: PcDisplayMode) => {
    if (mode === displayMode) return;
    setSavingMode(mode);
    try {
      await podcastService.updateEpisode(episodeId, { display_mode: mode });
      setDisplayMode(mode);
      toast.success(`Episode page set to ${mode.replace(/_/g, " ")}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    } finally {
      setSavingMode(null);
    }
  };

  const copyLink = async () => {
    if (!absoluteUrl) return;
    await copyText(absoluteUrl, "Link copied");
  };

  return (
    <div className="space-y-4">
      {/* Primary actions — kept to a single compact row on desktop. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {href && (
          <Button variant="primary" asChild>
            <Link href={href} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Podcast
            </Link>
          </Button>
        )}
        <Button
          icon={publishing ? (
            <Loader2 className="animate-spin" />
          ) : published ? (
            <Globe className="text-emerald-500" />
          ) : (
            <Globe />
          )}
          variant={published ? "outline" : "outline"}
          onClick={togglePublish}
          disabled={publishing}
        >
          {published ? "Published" : "Publish"}
        </Button>
        {audioUrl && (
          <Button
            icon={<Download />}
            variant="outline"
            onClick={() => downloadUrl(audioUrl, `${title || "episode"}.wav`)}
          >
            Audio
          </Button>
        )}
        <Button icon={<Link2 />} variant="outline" onClick={copyLink}>
          Link
        </Button>
        <Button
          icon={<Share2 />}
          variant="outline"
          onClick={() =>
            share({ title, url: absoluteUrl ?? undefined })
          }
        >
          Share
        </Button>
        {/* Blog post + show notes live in the EpisodeContentStudio panel below
            (real generate/preview/publish) — not duplicated here. */}
      </div>

      {/* Display mode */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Episode page style:
        </span>
        <SegmentedControl aria-label="Display" value={displayMode} onValueChange={changeDisplayMode} data={DISPLAY_MODES.map((m) => { const Icon = m.icon; const disabled = m.value === "with_video" && !hasVideo; const active = displayMode === m.value; return { value: m.value, disabled: disabled || savingMode !== null, title: disabled ? "No video available for this episode" : undefined, label: <span className="inline-flex items-center gap-1.5">{savingMode === m.value ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : active ? <Check className="h-3.5 w-3.5 text-primary" /> : <Icon className="h-3.5 w-3.5" />}{m.label}</span> }; })} />
      </div>

      {fallbackDialog}
    </div>
  );
}
