"use client";

// features/podcasts/studio/components/ShowManageClient.tsx
//
// OWNER-FACING podcast (show) management. This is the user equivalent of the
// admin ShowDetailClient — it lets the person who created a show edit its
// details, cover art, RSS / directory distribution settings, and its episodes,
// all from inside the Studio (/podcast/studio/show/[showId]).
//
// Sections:
//   1. Basics      — cover image (durable upload via AssetUploader → file
//                    handler pipeline), title, description, author, published.
//   2. Distribution — the "serious" RSS config persisted to pc_shows.rss_settings
//                    (Apple category, owner name/email, language, explicit) plus
//                    the computed feed URL with copy + directory-submit helpers.
//   3. Episodes    — list + an "Upload an episode" entry point (UploadEpisodeDialog).

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Loader2,
  Globe,
  Lock,
  Rss,
  Copy,
  Check,
  ExternalLink,
  Music,
  Plus,
  Clock,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ComingSoonBadge } from "@/components/coming-soon/ComingSoonBadge";
import { InlineMediaRef } from "@/features/files";
import { AssetUploader, type AssetUrls } from "@/features/podcasts/components/admin/AssetUploader";
import { podcastService } from "@/features/podcasts/service";
import { podcastMediaRef } from "@/features/podcasts/generator/media";
import {
  PC_APPLE_CATEGORIES,
  PC_FEED_LANGUAGES,
  PC_DEFAULT_LANGUAGE,
  isValidEmail,
} from "@/features/podcasts/studio/rssConstants";
import { UploadEpisodeDialog } from "@/features/podcasts/studio/components/UploadEpisodeDialog";
import type {
  PcShow,
  PcEpisodeWithShow,
  PcShowRssSettings,
} from "@/features/podcasts/types";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://aimatrx.com"
).replace(/\/$/, "");

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };
  return (
    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onCopy}>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      Copy
    </Button>
  );
}

function SectionCard({
  title,
  icon,
  badge,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

export function ShowManageClient({ showId }: { showId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [show, setShow] = useState<PcShow | null>(null);
  const [episodes, setEpisodes] = useState<PcEpisodeWithShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ── Basics form ──────────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ogImageUrl, setOgImageUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [savingBasics, setSavingBasics] = useState(false);

  // ── RSS / distribution form ──────────────────────────────────────────────
  const [category, setCategory] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [language, setLanguage] = useState(PC_DEFAULT_LANGUAGE);
  const [explicit, setExplicit] = useState(false);
  const [savingRss, setSavingRss] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);

  const hydrate = (s: PcShow) => {
    setShow(s);
    setTitle(s.title);
    setDescription(s.description ?? "");
    setAuthor(s.author ?? "");
    setImageUrl(s.image_url);
    setOgImageUrl(s.og_image_url);
    setThumbnailUrl(s.thumbnail_url);
    setIsPublished(s.is_published);

    // Guard with ?? {} — rss_settings may be null/absent until the migration is applied.
    const rss = (s.rss_settings ?? {}) as PcShowRssSettings;
    setCategory(rss.category ?? "");
    setOwnerName(rss.owner_name ?? s.author ?? "");
    setOwnerEmail(rss.owner_email ?? "");
    setLanguage(rss.language ?? PC_DEFAULT_LANGUAGE);
    setExplicit(rss.explicit ?? false);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const [found, eps] = await Promise.all([
          podcastService.fetchShowById(showId),
          podcastService.fetchEpisodesForShow(showId),
        ]);
        if (!active) return;
        if (!found) {
          setNotFound(true);
        } else {
          hydrate(found);
          setEpisodes(eps);
        }
      } catch (e) {
        if (active) {
          toast.error(e instanceof Error ? e.message : "Failed to load podcast");
          setNotFound(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [showId]);

  const handleAssetComplete = (urls: AssetUrls) => {
    if (urls.image_url !== undefined) setImageUrl(urls.image_url);
    if (urls.og_image_url !== undefined) setOgImageUrl(urls.og_image_url);
    if (urls.thumbnail_url !== undefined) setThumbnailUrl(urls.thumbnail_url);
  };

  const saveBasics = async () => {
    if (!show) return;
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSavingBasics(true);
    try {
      const saved = await podcastService.updateShow(show.id, {
        title: title.trim(),
        description: description.trim() || null,
        author: author.trim() || null,
        image_url: imageUrl,
        og_image_url: ogImageUrl,
        thumbnail_url: thumbnailUrl,
        is_published: isPublished,
      });
      hydrate(saved);
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingBasics(false);
    }
  };

  const saveRss = async () => {
    if (!show) return;
    if (ownerEmail.trim() && !isValidEmail(ownerEmail)) {
      toast.error("Enter a valid owner email");
      return;
    }
    setSavingRss(true);
    try {
      const rss_settings: PcShowRssSettings = {
        category: category || undefined,
        owner_name: ownerName.trim() || undefined,
        owner_email: ownerEmail.trim() || undefined,
        language: language || PC_DEFAULT_LANGUAGE,
        explicit,
      };
      const saved = await podcastService.updateShow(show.id, { rss_settings });
      hydrate(saved);
      toast.success("Distribution settings saved");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      // Most likely cause before the migration is applied: column doesn't exist.
      if (/rss_settings/.test(msg) || /column/.test(msg)) {
        toast.error(
          "Distribution settings need a quick database update before they can save. The basics above already work.",
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setSavingRss(false);
    }
  };

  const feedUrl = show ? `${SITE_URL}/podcast/${show.slug}/feed.xml` : "";
  const emailInvalid = ownerEmail.trim().length > 0 && !isValidEmail(ownerEmail);
  // Apple/Spotify require a category + owner email before a feed is accepted.
  const submitReady = Boolean(category) && isValidEmail(ownerEmail) && isPublished;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Skeleton className="mb-6 h-10 w-48" />
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (notFound || !show) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Radio className="h-7 w-7" />
        </span>
        <h1 className="text-lg font-semibold text-foreground">Podcast not found</h1>
        <p className="text-sm text-muted-foreground">
          This podcast doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/podcast/studio">
            <ArrowLeft className="h-4 w-4" />
            Back to studio
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => startTransition(() => router.back())}
          title="Back"
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="relative flex h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-muted">
          <InlineMediaRef
            ref={podcastMediaRef(imageUrl ?? thumbnailUrl)}
            size="fill"
            fit="cover"
            alt={show.title}
            fallbackIcon={<Radio className="h-5 w-5 text-primary/50" />}
          />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-foreground">{show.title}</h1>
          <p className="truncate font-mono text-xs text-muted-foreground">
            /podcast/{show.slug}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href={`/podcast/${show.slug}`} target="_blank">
            <ExternalLink className="h-3.5 w-3.5" />
            View public page
          </Link>
        </Button>
      </div>

      <div className="space-y-5">
        {/* ── Basics ─────────────────────────────────────────────────────── */}
        <SectionCard title="Podcast details" icon={<Radio className="h-4 w-4" />}>
          <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
            {/* Cover */}
            <div>
              <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                Cover art
              </Label>
              <AssetUploader
                onComplete={handleAssetComplete}
                currentImageUrl={imageUrl}
                showVideoUpload={false}
                podcastId={show.id}
              />
            </div>

            {/* Fields */}
            <div className="space-y-4">
              <div className="grid gap-1.5">
                <Label htmlFor="show-title">Title</Label>
                <Input
                  id="show-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My Podcast"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="show-author">Author / host</Label>
                <Input
                  id="show-author"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Who hosts this podcast?"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="show-desc">Description</Label>
                <Textarea
                  id="show-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What is this podcast about?"
                />
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <Switch id="show-published" checked={isPublished} onCheckedChange={setIsPublished} />
                <Label htmlFor="show-published" className="flex items-center gap-1.5 cursor-pointer">
                  {isPublished ? (
                    <Globe className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  {isPublished ? "Public — anyone with the link can listen" : "Private"}
                </Label>
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <Button onClick={saveBasics} disabled={savingBasics} className="gap-2">
              {savingBasics ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save details
            </Button>
          </div>
        </SectionCard>

        {/* ── Distribution / RSS ─────────────────────────────────────────── */}
        <SectionCard title="RSS &amp; distribution" icon={<Rss className="h-4 w-4" />}>
          <p className="mb-4 -mt-1 text-xs text-muted-foreground">
            Configure how your podcast appears in Apple Podcasts, Spotify, and other
            directories. These fields populate your public RSS feed.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rss-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="rss-category">
                  <SelectValue placeholder="Choose an Apple category" />
                </SelectTrigger>
                <SelectContent>
                  {PC_APPLE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!category && (
                <p className="text-xs text-muted-foreground">
                  Required before submitting to directories.
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="rss-language">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="rss-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PC_FEED_LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="rss-owner-name">Owner name</Label>
              <Input
                id="rss-owner-name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Shown to podcast directories"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="rss-owner-email">Owner email</Label>
              <Input
                id="rss-owner-email"
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="you@example.com"
                aria-invalid={emailInvalid}
                className={emailInvalid ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {emailInvalid ? (
                <p className="text-xs text-destructive">Enter a valid email address.</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Required by Apple Podcasts to verify ownership.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <Switch id="rss-explicit" checked={explicit} onCheckedChange={setExplicit} />
            <Label htmlFor="rss-explicit" className="cursor-pointer">
              Explicit content
            </Label>
          </div>

          <div className="mt-5 flex justify-end">
            <Button onClick={saveRss} disabled={savingRss || emailInvalid} className="gap-2">
              {savingRss ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save distribution
            </Button>
          </div>

          {/* Feed URL + submit helpers */}
          <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4">
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Your podcast feed
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground">
                {feedUrl}
              </code>
              <div className="flex shrink-0 gap-2">
                <CopyButton value={feedUrl} label="Feed URL" />
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link href={feedUrl} target="_blank">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-foreground">Submit to directories</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="secondary" size="sm" className="gap-1.5">
                  <Link
                    href="https://podcastsconnect.apple.com/my-podcasts/new-feed"
                    target="_blank"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Apple Podcasts Connect
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="sm" className="gap-1.5">
                  <Link href="https://podcasters.spotify.com/" target="_blank">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Spotify for Podcasters
                  </Link>
                </Button>
              </div>
              <div className="flex items-start gap-2 pt-1">
                <Button variant="outline" size="sm" disabled className="gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Verify &amp; submit
                </Button>
                <ComingSoonBadge className="mt-1.5" />
              </div>
              {!submitReady && (
                <div className="flex items-start gap-1.5 pt-1 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>
                    Before submitting, set a category, a valid owner email, and make the
                    podcast public.
                  </span>
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        {/* ── Episodes ───────────────────────────────────────────────────── */}
        <SectionCard title={`Episodes (${episodes.length})`} icon={<Music className="h-4 w-4" />}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {episodes.length === 0
                ? "No episodes yet."
                : `${episodes.length} episode${episodes.length === 1 ? "" : "s"}`}
            </p>
            <Button size="sm" className="gap-1.5" onClick={() => setUploadOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Upload an episode
            </Button>
          </div>

          {episodes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
              <Music className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Upload audio or video you already have, or generate one in the studio.
              </p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setUploadOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Upload your first episode
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {episodes.map((ep) => (
                <Link
                  key={ep.id}
                  href={`/podcast/${ep.slug}`}
                  target="_blank"
                  className="flex items-center gap-3 bg-card px-3 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <span className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                    <InlineMediaRef
                      ref={podcastMediaRef(ep.thumbnail_url ?? ep.image_url)}
                      size="fill"
                      fit="cover"
                      alt={ep.title}
                      fallbackIcon={<Music className="h-4 w-4 text-muted-foreground" />}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {ep.episode_number != null && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          Ep {ep.episode_number}
                        </span>
                      )}
                      <p className="truncate text-sm font-medium text-foreground">{ep.title}</p>
                      {ep.is_published ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                    {ep.duration_seconds != null && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDuration(ep.duration_seconds)}
                      </span>
                    )}
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <UploadEpisodeDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        shows={[show]}
        defaultShowId={show.id}
        onCreated={(ep) => setEpisodes((prev) => [ep, ...prev])}
      />
    </div>
  );
}
