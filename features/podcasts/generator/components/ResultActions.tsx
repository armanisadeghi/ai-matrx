"use client";

// features/podcasts/generator/components/ResultActions.tsx
//
// What users can DO with a freshly-generated episode — all real writes against
// the persisted pc_episodes row (no mock actions):
//   • Open the public episode page
//   • Publish / unpublish (draft → public)
//   • Choose how the episode page renders (audio / cover / video)
//   • Download the audio, copy the share link, native share

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ExternalLink,
  Download,
  Link2,
  Share2,
  Globe,
  Lock,
  Loader2,
  Check,
  AudioLines,
  ImageIcon,
  Clapperboard,
  FileText,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComingSoonInline } from "@/components/coming-soon/ComingSoonInline";
import { cn } from "@/lib/utils";
import { podcastService } from "@/features/podcasts/service";
import { useShare } from "@/features/podcasts/hooks/useShare";
import type { PcDisplayMode } from "@/features/podcasts/types";
import { episodeHref } from "../constants";

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
  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [displayMode, setDisplayMode] = useState<PcDisplayMode>("with_metadata");
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
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <div className="space-y-4">
      {/* Primary actions */}
      <div className="flex flex-wrap items-center gap-2">
        {href && (
          <Button asChild className="gap-2">
            <Link href={href}>
              <ExternalLink className="h-4 w-4" />
              Open the podcast
            </Link>
          </Button>
        )}
        <Button
          variant={published ? "secondary" : "outline"}
          onClick={togglePublish}
          disabled={publishing}
          className="gap-2"
        >
          {publishing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : published ? (
            <Globe className="h-4 w-4 text-emerald-500" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
          {published ? "Published" : "Publish"}
        </Button>
        {audioUrl && (
          <Button asChild variant="outline" className="gap-2">
            <a href={audioUrl} download={`${title || "episode"}.wav`}>
              <Download className="h-4 w-4" />
              Audio
            </a>
          </Button>
        )}
        <Button variant="outline" onClick={copyLink} className="gap-2">
          <Link2 className="h-4 w-4" />
          Copy link
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            share({ title, url: absoluteUrl ?? undefined })
          }
          className="gap-2"
        >
          <Share2 className="h-4 w-4" />
          Share
        </Button>
        <ComingSoonInline tooltip="Blog post — coming soon">
          <Button variant="outline" className="gap-2">
            <FileText className="h-4 w-4" />
            Blog post
          </Button>
        </ComingSoonInline>
        <ComingSoonInline tooltip="Show notes — coming soon">
          <Button variant="outline" className="gap-2">
            <ListChecks className="h-4 w-4" />
            Show notes
          </Button>
        </ComingSoonInline>
      </div>

      {/* Display mode */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Episode page style:
        </span>
        <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
          {DISPLAY_MODES.map((m) => {
            const Icon = m.icon;
            const disabled = m.value === "with_video" && !hasVideo;
            const active = displayMode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                disabled={disabled || savingMode !== null}
                onClick={() => changeDisplayMode(m.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                  disabled && "cursor-not-allowed opacity-40",
                )}
                title={
                  disabled ? "No video available for this episode" : undefined
                }
              >
                {savingMode === m.value ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : active ? (
                  <Check className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {fallbackDialog}
    </div>
  );
}
