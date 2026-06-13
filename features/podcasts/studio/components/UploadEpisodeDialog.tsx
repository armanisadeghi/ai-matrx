"use client";

// features/podcasts/studio/components/UploadEpisodeDialog.tsx
//
// The "boring simple" episode-creation path: the owner uploads audio (or video)
// they ALREADY have — no AI generation. Pick a show, enter title + description,
// upload the audio through the universal file handler (durable public URL),
// optionally add a cover image and a background video, and a real pc_episodes
// row is created and shows up on the public page + RSS feed.
//
// Media handling:
//   - Audio → useFileUpload (visibility "public") → durable html_src URL.
//   - Cover image + video → AssetUploader (the same pipeline the admin form
//     uses: ImageAssetUploader + Python video upload), which yields durable
//     image variants and a video URL.
//
// display_mode is derived from what the owner provided:
//   video → "with_video", image (no video) → "with_metadata", else "audio_only".

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  AudioLines,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFileUpload, fileHandler, folderForPodcast } from "@/features/files";
import {
  AssetUploader,
  type AssetUrls,
} from "@/features/podcasts/components/admin/AssetUploader";
import { podcastService } from "@/features/podcasts/service";
import { slugify } from "@/features/podcasts/utils";
import type {
  PcShow,
  PcEpisodeWithShow,
  PcDisplayMode,
} from "@/features/podcasts/types";

const ACCEPT_AUDIO = "audio/*,.mp3,.m4a,.wav,.aac,.ogg";

interface UploadEpisodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shows the owner can publish into. */
  shows: PcShow[];
  defaultShowId?: string;
  onCreated: (episode: PcEpisodeWithShow) => void;
}

export function UploadEpisodeDialog({
  open,
  onOpenChange,
  shows,
  defaultShowId,
  onCreated,
}: UploadEpisodeDialogProps) {
  const audioInputRef = useRef<HTMLInputElement>(null);
  const { upload } = useFileUpload();

  const [showId, setShowId] = useState(defaultShowId ?? shows[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Audio
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioName, setAudioName] = useState<string | null>(null);
  const [audioState, setAudioState] = useState<
    "idle" | "uploading" | "done" | "error"
  >("idle");
  const [audioError, setAudioError] = useState<string | null>(null);

  // Visual assets (cover + optional video) via AssetUploader
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ogImageUrl, setOgImageUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setShowId(defaultShowId ?? shows[0]?.id ?? "");
    }
  }, [open, defaultShowId, shows]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setAudioUrl(null);
    setAudioName(null);
    setAudioState("idle");
    setAudioError(null);
    setImageUrl(null);
    setOgImageUrl(null);
    setThumbnailUrl(null);
    setVideoUrl(null);
    setSaving(false);
  };

  const handleAudioFile = async (file: File) => {
    setAudioState("uploading");
    setAudioError(null);
    setAudioName(file.name);
    try {
      // Public visibility so the durable URL is fetchable by the public page
      // AND by Apple/Spotify when they pull the RSS feed server-side.
      const normalized = await upload(
        { kind: "file", file },
        {
          visibility: "public",
          folderPath: showId ? folderForPodcast(showId) : undefined,
          fileName: file.name,
        },
      );
      // Resolve to the best durable, publicly-fetchable URL string for <audio>
      // and the feed enclosure.
      const durable = normalized.fileId
        ? await fileHandler
            .use({ kind: "file_id", fileId: normalized.fileId })
            .as({ kind: "html_src" })
        : normalized.url;
      if (!durable) throw new Error("Upload did not return a usable URL");
      setAudioUrl(durable);
      setAudioState("done");
      if (!title.trim()) {
        // Seed a friendly title from the filename.
        setTitle(
          file.name
            .replace(/\.[^.]+$/, "")
            .replace(/[-_]+/g, " ")
            .trim(),
        );
      }
    } catch (e) {
      setAudioState("error");
      setAudioError(e instanceof Error ? e.message : "Audio upload failed");
    }
  };

  const handleAssetComplete = (urls: AssetUrls) => {
    if (urls.image_url !== undefined) setImageUrl(urls.image_url);
    if (urls.og_image_url !== undefined) setOgImageUrl(urls.og_image_url);
    if (urls.thumbnail_url !== undefined) setThumbnailUrl(urls.thumbnail_url);
    if (urls.video_url !== undefined) setVideoUrl(urls.video_url);
  };

  const canSubmit =
    Boolean(showId) &&
    Boolean(title.trim()) &&
    audioState === "done" &&
    Boolean(audioUrl);

  const handleSubmit = async () => {
    if (!canSubmit || !audioUrl) {
      if (audioState !== "done") toast.error("Upload your audio file first");
      else if (!title.trim()) toast.error("Give your episode a title");
      else if (!showId) toast.error("Pick a podcast");
      return;
    }
    setSaving(true);
    try {
      const displayMode: PcDisplayMode = videoUrl
        ? "with_video"
        : imageUrl
          ? "with_metadata"
          : "audio_only";

      const suffix = Math.random().toString(36).slice(2, 7);
      const created = await podcastService.createEpisode({
        slug: `${slugify(title) || "episode"}-${suffix}`,
        show_id: showId,
        title: title.trim(),
        description: description.trim() || null,
        audio_url: audioUrl,
        image_url: imageUrl,
        og_image_url: ogImageUrl,
        thumbnail_url: thumbnailUrl,
        video_url: videoUrl,
        display_mode: displayMode,
        episode_number: null,
        duration_seconds: null,
        host_count: null,
        script: null,
        speakers: null,
        is_published: true,
      });

      const show = shows.find((s) => s.id === created.show_id) ?? null;
      onCreated({ ...created, show });
      toast.success(`Published "${created.title}"`);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create episode");
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (saving || audioState === "uploading") return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <AudioLines className="h-4.5 w-4.5" />
            </span>
            <div>
              <DialogTitle>Upload an episode</DialogTitle>
              <DialogDescription className="mt-0.5">
                Already have the audio? Upload it here — no generation needed.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Show picker */}
          <div className="space-y-1.5">
            <Label htmlFor="ep-show">Podcast</Label>
            <Select value={showId} onValueChange={setShowId}>
              <SelectTrigger id="ep-show">
                <SelectValue placeholder="Choose a podcast" />
              </SelectTrigger>
              <SelectContent>
                {shows.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Audio uploader */}
          <div className="space-y-1.5">
            <Label>Audio file</Label>
            <div
              onClick={() =>
                audioState !== "uploading" && audioInputRef.current?.click()
              }
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) void handleAudioFile(f);
              }}
              onDragOver={(e) => e.preventDefault()}
              className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-colors ${
                audioState === "uploading"
                  ? "cursor-not-allowed border-primary/40 bg-primary/5"
                  : audioState === "error"
                    ? "border-destructive/50 bg-destructive/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <input
                ref={audioInputRef}
                type="file"
                accept={ACCEPT_AUDIO}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleAudioFile(f);
                }}
              />
              {audioState === "done" && audioUrl ? (
                <div className="flex items-center gap-3 p-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {audioName ?? "Audio uploaded"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Uploaded · click to replace
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAudioUrl(null);
                      setAudioName(null);
                      setAudioState("idle");
                      if (audioInputRef.current)
                        audioInputRef.current.value = "";
                    }}
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    title="Remove"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-6">
                  {audioState === "uploading" ? (
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  ) : (
                    <UploadCloud className="h-7 w-7 text-muted-foreground" />
                  )}
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">
                      {audioState === "uploading"
                        ? "Uploading…"
                        : "Drop audio or click to upload"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      MP3, M4A, WAV, AAC, OGG
                    </p>
                  </div>
                </div>
              )}
            </div>
            {audioError && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" /> {audioError}
              </p>
            )}
          </div>

          {/* Title + description */}
          <div className="space-y-1.5">
            <Label htmlFor="ep-title">Title</Label>
            <Input
              id="ep-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Episode title"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ep-desc">Description</Label>
            <Textarea
              id="ep-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What is this episode about? (optional)"
            />
          </div>

          {/* Cover image + optional video */}
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cover &amp; video
              <span className="ml-1 font-normal normal-case">— optional</span>
            </p>
            <AssetUploader
              onComplete={handleAssetComplete}
              currentImageUrl={imageUrl}
              currentVideoUrl={videoUrl}
              showVideoUpload={true}
              podcastId={showId || null}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving || audioState === "uploading"}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            className="gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Publish episode
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
