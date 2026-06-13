"use client";

import React, { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AssetUploader, type AssetUrls } from "./AssetUploader";
import { podcastService } from "../../service";
import type {
  PcShow,
  PcEpisodeWithShow,
  PcShowFormData,
  PcEpisodeFormData,
  PcDisplayMode,
} from "../../types";

// ── Show Form ─────────────────────────────────────────────────────────────────

interface ShowFormProps {
  show: PcShow | null;
  isNew: boolean;
  onSaved: (saved: PcShow) => void;
  onCancel: () => void;
}

const EMPTY_SHOW: PcShowFormData = {
  slug: "",
  title: "",
  description: "",
  image_url: "",
  og_image_url: "",
  thumbnail_url: "",
  author: "",
  is_published: false,
};

export function ShowForm({ show, isNew, onSaved, onCancel }: ShowFormProps) {
  const [form, setForm] = useState<PcShowFormData>(EMPTY_SHOW);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualUrls, setShowManualUrls] = useState(false);

  useEffect(() => {
    if (show) {
      setForm({
        slug: show.slug,
        title: show.title,
        description: show.description ?? "",
        image_url: show.image_url ?? "",
        og_image_url: show.og_image_url ?? "",
        thumbnail_url: show.thumbnail_url ?? "",
        author: show.author ?? "",
        is_published: show.is_published,
      });
    } else {
      setForm(EMPTY_SHOW);
    }
    setError(null);
  }, [show]);

  const set = (key: keyof PcShowFormData, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleAssetComplete = (urls: AssetUrls) => {
    setForm((prev) => ({
      ...prev,
      image_url: urls.image_url ?? prev.image_url,
      og_image_url: urls.og_image_url ?? prev.og_image_url,
      thumbnail_url: urls.thumbnail_url ?? prev.thumbnail_url,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.slug.trim()) {
      setError("Title and slug are required.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        slug: form.slug.trim(),
        title: form.title.trim(),
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
        og_image_url: form.og_image_url.trim() || null,
        thumbnail_url: form.thumbnail_url.trim() || null,
        author: form.author.trim() || null,
        is_published: form.is_published,
      };
      const saved = show
        ? await podcastService.updateShow(show.id, payload)
        : await podcastService.createShow(payload);
      onSaved(saved);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Save failed.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="show-title">Title *</Label>
        <Input
          id="show-title"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="My Podcast Show"
          required
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="show-slug">Slug *</Label>
        <Input
          id="show-slug"
          value={form.slug}
          onChange={(e) =>
            set("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))
          }
          placeholder="my-podcast-show"
          required
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Used in the share URL: /podcast/your-slug
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="show-author">Author</Label>
        <Input
          id="show-author"
          value={form.author}
          onChange={(e) => set("author", e.target.value)}
          placeholder="Author or creator name"
        />
      </div>

      {/* Asset uploader */}
      <div className="border rounded-xl p-3 bg-muted/20">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Cover Art
        </p>
        <AssetUploader
          onComplete={handleAssetComplete}
          currentImageUrl={form.image_url || null}
          showVideoUpload={false}
          podcastId={show?.id ?? null}
        />
      </div>

      {/* Manual URL override (collapsed by default) */}
      <button
        type="button"
        onClick={() => setShowManualUrls((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
      >
        {showManualUrls ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
        {showManualUrls ? "Hide" : "Show"} manual URL fields
      </button>

      {showManualUrls && (
        <div className="flex flex-col gap-3 border rounded-xl p-3 bg-muted/10">
          <div className="grid gap-1.5">
            <Label htmlFor="show-image" className="text-xs">
              Cover Image URL (3000×3000)
            </Label>
            <Input
              id="show-image"
              value={form.image_url}
              onChange={(e) => set("image_url", e.target.value)}
              placeholder="https://…"
              className="text-xs h-8"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="show-og" className="text-xs">
              OG Image URL (1200×630)
            </Label>
            <Input
              id="show-og"
              value={form.og_image_url}
              onChange={(e) => set("og_image_url", e.target.value)}
              placeholder="https://…"
              className="text-xs h-8"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="show-thumb" className="text-xs">
              Thumbnail URL (400×400)
            </Label>
            <Input
              id="show-thumb"
              value={form.thumbnail_url}
              onChange={(e) => set("thumbnail_url", e.target.value)}
              placeholder="https://…"
              className="text-xs h-8"
            />
          </div>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="show-desc">Description</Label>
        <Textarea
          id="show-desc"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          placeholder="What is this podcast about?"
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="show-published"
          checked={form.is_published}
          onCheckedChange={(v) => set("is_published", v)}
        />
        <Label htmlFor="show-published">Published (visible to public)</Label>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isSaving} className="flex-1">
          {isSaving ? "Saving…" : isNew ? "Create Show" : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ── Episode Form ──────────────────────────────────────────────────────────────

interface EpisodeFormProps {
  episode: PcEpisodeWithShow | null;
  isNew: boolean;
  shows: PcShow[];
  defaultShowId?: string;
  onSaved: (saved: PcEpisodeWithShow) => void;
  onCancel: () => void;
}

const EMPTY_EPISODE: PcEpisodeFormData = {
  slug: "",
  show_id: "",
  title: "",
  description: "",
  audio_url: "",
  image_url: "",
  og_image_url: "",
  thumbnail_url: "",
  video_url: "",
  display_mode: "audio_only",
  episode_number: "",
  duration_seconds: "",
  is_published: false,
};

export function EpisodeForm({
  episode,
  isNew,
  shows,
  defaultShowId,
  onSaved,
  onCancel,
}: EpisodeFormProps) {
  const [form, setForm] = useState<PcEpisodeFormData>(EMPTY_EPISODE);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualUrls, setShowManualUrls] = useState(false);

  useEffect(() => {
    if (episode) {
      setForm({
        slug: episode.slug,
        show_id: episode.show_id ?? "",
        title: episode.title,
        description: episode.description ?? "",
        audio_url: episode.audio_url,
        image_url: episode.image_url ?? "",
        og_image_url: episode.og_image_url ?? "",
        thumbnail_url: episode.thumbnail_url ?? "",
        video_url: episode.video_url ?? "",
        display_mode: episode.display_mode,
        episode_number:
          episode.episode_number != null ? String(episode.episode_number) : "",
        duration_seconds:
          episode.duration_seconds != null
            ? String(episode.duration_seconds)
            : "",
        is_published: episode.is_published,
      });
    } else {
      setForm({ ...EMPTY_EPISODE, show_id: defaultShowId ?? "" });
    }
    setError(null);
  }, [episode, defaultShowId]);

  const set = <K extends keyof PcEpisodeFormData>(
    key: K,
    value: PcEpisodeFormData[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleAssetComplete = (urls: AssetUrls) => {
    setForm((prev) => ({
      ...prev,
      image_url: urls.image_url ?? prev.image_url,
      og_image_url: urls.og_image_url ?? prev.og_image_url,
      thumbnail_url: urls.thumbnail_url ?? prev.thumbnail_url,
      video_url: urls.video_url ?? prev.video_url,
      // Auto-set display_mode based on what was uploaded
      display_mode: urls.video_url
        ? "with_video"
        : urls.image_url
          ? "with_metadata"
          : prev.display_mode,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.slug.trim() || !form.audio_url.trim()) {
      setError("Title, slug, and audio URL are required.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        slug: form.slug.trim(),
        show_id: form.show_id || null,
        title: form.title.trim(),
        description: form.description.trim() || null,
        audio_url: form.audio_url.trim(),
        image_url: form.image_url.trim() || null,
        og_image_url: form.og_image_url.trim() || null,
        thumbnail_url: form.thumbnail_url.trim() || null,
        video_url: form.video_url.trim() || null,
        display_mode: form.display_mode,
        episode_number: form.episode_number
          ? parseInt(form.episode_number, 10)
          : null,
        duration_seconds: form.duration_seconds
          ? parseInt(form.duration_seconds, 10)
          : null,
        host_count: null,
        script: null,
        speakers: null,
        is_published: form.is_published,
      };

      let saved: PcEpisodeWithShow;
      if (episode) {
        const updated = await podcastService.updateEpisode(episode.id, payload);
        const show = shows.find((s) => s.id === updated.show_id) ?? null;
        saved = { ...updated, show };
      } else {
        const created = await podcastService.createEpisode(payload);
        const show = shows.find((s) => s.id === created.show_id) ?? null;
        saved = { ...created, show };
      }
      onSaved(saved);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Save failed.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="ep-title">Title *</Label>
        <Input
          id="ep-title"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Episode title"
          required
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ep-slug">Slug *</Label>
        <Input
          id="ep-slug"
          value={form.slug}
          onChange={(e) =>
            set("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))
          }
          placeholder="episode-slug"
          required
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">/podcast/your-slug</p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ep-audio">Audio URL *</Label>
        <Input
          id="ep-audio"
          value={form.audio_url}
          onChange={(e) => set("audio_url", e.target.value)}
          placeholder="https://…supabase.co/storage/v1/object/public/…"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="ep-show">Show (optional)</Label>
          <Select
            value={form.show_id || "none"}
            onValueChange={(v) => set("show_id", v === "none" ? "" : v)}
          >
            <SelectTrigger id="ep-show">
              <SelectValue placeholder="No show" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No show (standalone)</SelectItem>
              {shows.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="ep-display">Display Mode</Label>
          <Select
            value={form.display_mode}
            onValueChange={(v) => set("display_mode", v as PcDisplayMode)}
          >
            <SelectTrigger id="ep-display">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="audio_only">Audio only</SelectItem>
              <SelectItem value="with_metadata">With metadata</SelectItem>
              <SelectItem value="with_video">With video</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Asset uploader */}
      <div className="border rounded-xl p-3 bg-muted/20">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Visual Assets
          <span className="text-xs font-normal normal-case ml-1">
            — auto-generates all sizes
          </span>
        </p>
        <AssetUploader
          onComplete={handleAssetComplete}
          currentImageUrl={form.image_url || null}
          currentVideoUrl={form.video_url || null}
          showVideoUpload={true}
          podcastId={episode?.id ?? null}
        />
      </div>

      {/* Social sharing preview status */}
      <div
        className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-xs border ${
          form.og_image_url
            ? "bg-success/5 border-success/30 text-success"
            : "bg-warning/10 border-warning/40 text-warning-foreground"
        }`}
      >
        {form.og_image_url ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-success" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
        )}
        <div>
          <p className="font-semibold flex items-center gap-1">
            <Share2 className="h-3 w-3" />
            Social share preview
          </p>
          {form.og_image_url ? (
            <p className="mt-0.5 text-success/80">
              OG image set — shares will show a rich preview with image.
            </p>
          ) : (
            <p className="mt-0.5">
              <strong>No OG image set.</strong> When this episode is shared on
              Telegram, WhatsApp, or Twitter it will show as a plain link with
              no image.
              {form.video_url && !form.image_url && (
                <span>
                  {" "}
                  Upload a cover image or wait for Python video frame extraction
                  to generate one automatically.
                </span>
              )}
              {!form.video_url && !form.image_url && (
                <span> Upload a cover image above to fix this.</span>
              )}
              {form.image_url && !form.og_image_url && (
                <span>
                  {" "}
                  A cover image is set but no 1200×630 OG variant was generated
                  — re-upload the image through the uploader above to regenerate
                  all variants.
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Manual URL override (collapsed) */}
      <button
        type="button"
        onClick={() => setShowManualUrls((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
      >
        {showManualUrls ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
        {showManualUrls ? "Hide" : "Show"} manual URL fields
      </button>

      {showManualUrls && (
        <div className="flex flex-col gap-3 border rounded-xl p-3 bg-muted/10">
          <div className="grid gap-1.5">
            <Label htmlFor="ep-image" className="text-xs">
              Cover Image URL (3000×3000)
            </Label>
            <Input
              id="ep-image"
              value={form.image_url}
              onChange={(e) => set("image_url", e.target.value)}
              placeholder="https://…"
              className="text-xs h-8"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ep-og" className="text-xs">
              OG Image URL (1200×630)
            </Label>
            <Input
              id="ep-og"
              value={form.og_image_url}
              onChange={(e) => set("og_image_url", e.target.value)}
              placeholder="https://…"
              className="text-xs h-8"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ep-thumb" className="text-xs">
              Thumbnail URL (400×400)
            </Label>
            <Input
              id="ep-thumb"
              value={form.thumbnail_url}
              onChange={(e) => set("thumbnail_url", e.target.value)}
              placeholder="https://…"
              className="text-xs h-8"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ep-video" className="text-xs">
              Video URL
            </Label>
            <Input
              id="ep-video"
              value={form.video_url}
              onChange={(e) => set("video_url", e.target.value)}
              placeholder="https://…"
              className="text-xs h-8"
            />
          </div>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="ep-desc">Description</Label>
        <Textarea
          id="ep-desc"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          placeholder="What is this episode about?"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="ep-number">Episode Number</Label>
          <Input
            id="ep-number"
            type="number"
            min={1}
            value={form.episode_number}
            onChange={(e) => set("episode_number", e.target.value)}
            placeholder="1"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ep-duration">Duration (seconds)</Label>
          <Input
            id="ep-duration"
            type="number"
            min={1}
            value={form.duration_seconds}
            onChange={(e) => set("duration_seconds", e.target.value)}
            placeholder="3600"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="ep-published"
          checked={form.is_published}
          onCheckedChange={(v) => set("is_published", v)}
        />
        <Label htmlFor="ep-published">Published (visible to public)</Label>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isSaving} className="flex-1">
          {isSaving ? "Saving…" : isNew ? "Create Episode" : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
