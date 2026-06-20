"use client";

import { useCallback, useState, useMemo } from "react";
import {
  ImageIcon,
  Play,
  File,
  Check,
  X,
  Search,
  Shapes,
  Zap,
  RectangleHorizontal,
  Square,
  RectangleVertical,
  HelpCircle,
  LayoutGrid,
  Bug,
  Video,
  FileText,
  FileSpreadsheet,
  FileType,
  Music,
  ExternalLink,
  Download,
  Loader2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useTopicContext } from "../../context/ResearchContext";
import { useResearchMedia } from "../../hooks/useResearchState";
import { updateMedia } from "../../service";
import type { ResearchMedia } from "../../types";
import { idMatchesQuery } from "@/utils/search-scoring";
import {
  bucketMedia,
  formatResolvedSizeLabel,
  isFeaturedPhoto,
} from "./mediaCategorization";
import {
  embedInfo,
  videoPoster,
  fileNameFromUrl,
  fileExt,
  hostLabel,
} from "./mediaEmbed";
import MediaDebugPanel from "./MediaDebugPanel";
import { uploadFileWithProgress } from "@/features/files/api/files";
import {
  parseYouTubeUrl,
  youTubeChannelLabel,
  youTubeEmbedUrl,
} from "@/lib/media/youtube";

const TYPE_ICONS = {
  image: ImageIcon,
  video: Play,
  document: File,
  audio: Music,
};

type GalleryView = "gallery" | "debug";

export default function MediaGallery() {
  const { topicId } = useTopicContext();
  const [view, setView] = useState<GalleryView>("gallery");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [relevanceFilter, setRelevanceFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: media, refresh } = useResearchMedia(topicId);

  const mediaList = (media as ResearchMedia[]) ?? [];

  const filtered = useMemo(() => {
    let items = mediaList;
    if (typeFilter !== "all")
      items = items.filter((m) => m.media_type === typeFilter);
    if (relevanceFilter === "relevant")
      items = items.filter((m) => m.is_relevant);
    else if (relevanceFilter === "excluded")
      items = items.filter((m) => !m.is_relevant);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (m) =>
          (m.alt_text ?? "").toLowerCase().includes(q) ||
          (m.caption ?? "").toLowerCase().includes(q) ||
          m.url.toLowerCase().includes(q) ||
          idMatchesQuery(m, q),
      );
    }
    return items;
  }, [mediaList, typeFilter, relevanceFilter, search]);

  const buckets = useMemo(() => bucketMedia(filtered), [filtered]);

  const handleToggleRelevance = useCallback(
    async (item: ResearchMedia) => {
      await updateMedia(item.id, { is_relevant: !item.is_relevant });
      refresh();
    },
    [refresh],
  );

  const totalEmpty = filtered.length === 0;
  const hasPhotoSections =
    buckets.landscape.length > 0 ||
    buckets.square.length > 0 ||
    buckets.portrait.length > 0 ||
    buckets.unknownAspect.length > 0;

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="flex items-center gap-2 rounded-full matrx-glass-thin-border px-3 py-1.5">
        <span className="text-xs font-medium text-foreground/80">Media</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {filtered.length}/{mediaList.length}
        </span>
        <div className="flex items-center rounded-full matrx-glass-card p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setView("gallery")}
            className={cn(
              "flex items-center gap-1 px-2 h-5 rounded-full text-[10px] font-medium transition-colors",
              view === "gallery"
                ? "bg-background/80 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutGrid className="h-3 w-3" />
            Gallery
          </button>
          <button
            type="button"
            onClick={() => setView("debug")}
            className={cn(
              "flex items-center gap-1 px-2 h-5 rounded-full text-[10px] font-medium transition-colors",
              view === "debug"
                ? "bg-background/80 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Bug className="h-3 w-3" />
            Debug
          </button>
        </div>
        <div className="flex-1 relative min-w-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search alt text, caption, url..."
            className="w-full h-6 pl-7 pr-2 text-[11px] max-md:text-base rounded-full matrx-glass-card border-0 bg-transparent outline-none text-foreground placeholder:text-muted-foreground shadow-none"
          />
        </div>
        <Select value={relevanceFilter} onValueChange={setRelevanceFilter}>
          <SelectTrigger className="w-[4.75rem] h-6 px-2 text-[11px] rounded-full matrx-glass-card border-0 shrink-0 shadow-none [&_svg]:h-3 [&_svg]:w-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="text-[11px]">
            <SelectItem value="all" className="text-[11px]">
              All
            </SelectItem>
            <SelectItem value="relevant" className="text-[11px]">
              Relevant
            </SelectItem>
            <SelectItem value="excluded" className="text-[11px]">
              Excluded
            </SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[6.25rem] h-6 px-2 text-[11px] rounded-full matrx-glass-card border-0 shrink-0 shadow-none [&_svg]:h-3 [&_svg]:w-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="text-[11px]">
            <SelectItem value="all" className="text-[11px]">
              All Types
            </SelectItem>
            <SelectItem value="image" className="text-[11px]">
              Images
            </SelectItem>
            <SelectItem value="video" className="text-[11px]">
              Videos
            </SelectItem>
            <SelectItem value="document" className="text-[11px]">
              Docs
            </SelectItem>
            <SelectItem value="audio" className="text-[11px]">
              Audio
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {view === "debug" ? (
        <MediaDebugPanel
          topicId={topicId}
          items={filtered}
          totalCount={mediaList.length}
          scope="filtered"
        />
      ) : totalEmpty ? (
        <div className="flex flex-col items-center justify-center min-h-[280px] gap-3 text-center px-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/8 flex items-center justify-center">
            <ImageIcon className="h-6 w-6 text-primary/40" />
          </div>
          <div>
            <p className="text-xs font-medium text-foreground/70">
              {mediaList.length === 0 ? "No media yet" : "No matches"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 max-w-[240px]">
              {mediaList.length === 0
                ? "Images, videos, and other media are automatically extracted when you scrape sources."
                : "Try adjusting your search or filters to find what you're looking for."}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {buckets.documents.length > 0 && (
            <DocumentSection
              items={buckets.documents}
              onToggleRelevance={handleToggleRelevance}
            />
          )}
          {buckets.videos.length > 0 && (
            <VideoSection
              items={buckets.videos}
              onToggleRelevance={handleToggleRelevance}
            />
          )}
          {buckets.audio.length > 0 && (
            <ResourceSection
              icon={Music}
              title="Audio"
              description="Audio files and podcasts"
              items={buckets.audio}
              onToggleRelevance={handleToggleRelevance}
            />
          )}
          {buckets.landscape.length > 0 && (
            <PhotoAspectSection
              icon={RectangleHorizontal}
              title="Landscape"
              description="Wider than tall"
              items={buckets.landscape}
              aspectClass="aspect-video"
              featuredGrid="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"
              standardGrid="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2"
              onToggleRelevance={handleToggleRelevance}
            />
          )}
          {buckets.square.length > 0 && (
            <PhotoAspectSection
              icon={Square}
              title="Square"
              description="Roughly 1:1"
              items={buckets.square}
              aspectClass="aspect-square"
              featuredGrid="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2"
              standardGrid="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2"
              onToggleRelevance={handleToggleRelevance}
            />
          )}
          {buckets.portrait.length > 0 && (
            <PhotoAspectSection
              icon={RectangleVertical}
              title="Portrait"
              description="Taller than wide"
              items={buckets.portrait}
              aspectClass="aspect-[3/4]"
              featuredGrid="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2"
              standardGrid="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2"
              onToggleRelevance={handleToggleRelevance}
            />
          )}
          {buckets.unknownAspect.length > 0 && (
            <PhotoAspectSection
              icon={HelpCircle}
              title="Unknown Dimensions"
              description="Images without width/height"
              items={buckets.unknownAspect}
              aspectClass="aspect-video"
              featuredGrid="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2"
              standardGrid="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2"
              onToggleRelevance={handleToggleRelevance}
            />
          )}
          {!hasPhotoSections &&
            buckets.graphics.length === 0 &&
            buckets.icons.length === 0 &&
            buckets.videos.length === 0 &&
            buckets.youtubeChannels.length === 0 &&
            buckets.documents.length === 0 &&
            buckets.audio.length === 0 && (
              <div className="text-[10px] text-muted-foreground px-1">
                No items matched the current filters.
              </div>
            )}
          {buckets.graphics.length > 0 && (
            <GraphicsSection
              items={buckets.graphics}
              onToggleRelevance={handleToggleRelevance}
            />
          )}
          {buckets.icons.length > 0 && (
            <IconsSection
              items={buckets.icons}
              onToggleRelevance={handleToggleRelevance}
            />
          )}
          {buckets.youtubeChannels.length > 0 && (
            <YouTubeChannelsSection
              items={buckets.youtubeChannels}
              onToggleRelevance={handleToggleRelevance}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface SectionHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  description?: string;
}

function SectionHeader({
  icon: Icon,
  title,
  count,
  description,
}: SectionHeaderProps) {
  return (
    <div className="flex items-baseline gap-2 px-1">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-foreground/60" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
          {title}
        </h3>
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground">
        {count}
      </span>
      {description && (
        <span className="text-[10px] text-muted-foreground/70 hidden sm:inline">
          · {description}
        </span>
      )}
    </div>
  );
}

interface SectionProps {
  items: ResearchMedia[];
  onToggleRelevance: (item: ResearchMedia) => void;
}

interface PhotoAspectSectionProps extends SectionProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  aspectClass: string;
  /** Fewer columns → larger tiles for big, high-resolution images. */
  featuredGrid: string;
  /** More columns → smaller tiles for modest-resolution images. */
  standardGrid: string;
}

function PhotoAspectSection({
  icon,
  title,
  description,
  items,
  aspectClass,
  featuredGrid,
  standardGrid,
  onToggleRelevance,
}: PhotoAspectSectionProps) {
  // Items arrive sorted by area (largest first). Split into a big-tile
  // "featured" band and a small-tile "standard" band so resolution drives
  // display size — big, high-quality images read large; modest ones stay small.
  const featured = items.filter(isFeaturedPhoto);
  const standard = items.filter((i) => !isFeaturedPhoto(i));

  return (
    <section className="space-y-2">
      <SectionHeader
        icon={icon}
        title={title}
        count={items.length}
        description={description}
      />
      {featured.length > 0 && (
        <div className={featuredGrid}>
          {featured.map((item) => (
            <PhotoCard
              key={item.id}
              item={item}
              aspectClass={aspectClass}
              onToggleRelevance={onToggleRelevance}
            />
          ))}
        </div>
      )}
      {standard.length > 0 && (
        <div className={standardGrid}>
          {standard.map((item) => (
            <PhotoCard
              key={item.id}
              item={item}
              aspectClass={aspectClass}
              onToggleRelevance={onToggleRelevance}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function GraphicsSection({ items, onToggleRelevance }: SectionProps) {
  return (
    <section className="space-y-2">
      <SectionHeader
        icon={Shapes}
        title="Graphics"
        count={items.length}
        description="Logos, thumbnails, banners, and small graphics — shown at their real size"
      />
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <GraphicCard
            key={item.id}
            item={item}
            onToggleRelevance={onToggleRelevance}
          />
        ))}
      </div>
    </section>
  );
}

function IconsSection({ items, onToggleRelevance }: SectionProps) {
  return (
    <section className="space-y-2">
      <SectionHeader
        icon={Zap}
        title="Icons & Favicons"
        count={items.length}
        description="Tiny graphics shown at native size (64px or less)"
      />
      <div className="flex flex-wrap gap-1.5 rounded-xl matrx-glass-card p-2">
        {items.map((item) => (
          <IconTile
            key={item.id}
            item={item}
            onToggleRelevance={onToggleRelevance}
          />
        ))}
      </div>
    </section>
  );
}

function PhotoCard({
  item,
  aspectClass,
  onToggleRelevance,
}: {
  item: ResearchMedia;
  aspectClass: string;
  onToggleRelevance: (item: ResearchMedia) => void;
}) {
  const Icon = TYPE_ICONS[item.media_type as keyof typeof TYPE_ICONS] ?? File;
  const dims = formatResolvedSizeLabel(item);

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card/60 backdrop-blur-sm overflow-hidden transition-all",
        item.is_relevant ? "border-primary/20" : "border-border/50 opacity-60",
      )}
    >
      <div
        className={cn(
          "bg-muted/50 flex items-center justify-center overflow-hidden",
          aspectClass,
        )}
      >
        {item.media_type === "image" && item.url ? (
          <img
            src={item.thumbnail_url || item.url}
            alt={item.alt_text || ""}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <Icon className="h-6 w-6 text-muted-foreground/30" />
        )}
      </div>
      <div className="p-1.5 flex items-center justify-between gap-1">
        <p className="text-[10px] truncate text-muted-foreground flex-1">
          {item.alt_text || item.caption || item.url}
        </p>
        {dims && (
          <span className="text-[9px] tabular-nums text-muted-foreground/60 shrink-0">
            {dims}
          </span>
        )}
      </div>
      <Button
        variant={item.is_relevant ? "default" : "outline"}
        size="icon"
        className="absolute top-1.5 right-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity"
        onClick={() => onToggleRelevance(item)}
      >
        {item.is_relevant ? (
          <Check className="h-3 w-3" />
        ) : (
          <X className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

function GraphicCard({
  item,
  onToggleRelevance,
}: {
  item: ResearchMedia;
  onToggleRelevance: (item: ResearchMedia) => void;
}) {
  const dims = formatResolvedSizeLabel(item);
  const tooltip =
    [item.alt_text, item.caption, dims].filter(Boolean).join(" · ") || item.url;

  // Fixed height, width follows the image's aspect (object-contain) so a wide
  // banner reads wide-and-short and a logo reads small — no tiny image marooned
  // in a big box.
  return (
    <div
      className={cn(
        "group relative h-24 inline-flex items-center justify-center rounded-lg border bg-muted/20 backdrop-blur-sm overflow-hidden transition-all",
        item.is_relevant ? "border-primary/20" : "border-border/50 opacity-60",
      )}
      title={tooltip}
    >
      {item.url ? (
        <img
          src={item.thumbnail_url || item.url}
          alt={item.alt_text || ""}
          className="h-full w-auto max-w-[220px] object-contain"
          loading="lazy"
        />
      ) : (
        <div className="h-full w-24 flex items-center justify-center">
          <ImageIcon className="h-5 w-5 text-muted-foreground/30" />
        </div>
      )}
      {dims && (
        <span className="absolute bottom-1 left-1 px-1 rounded bg-background/70 backdrop-blur-sm text-[9px] tabular-nums text-muted-foreground/80 opacity-0 group-hover:opacity-100 transition-opacity">
          {dims}
        </span>
      )}
      <Button
        variant={item.is_relevant ? "default" : "outline"}
        size="icon"
        className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onToggleRelevance(item)}
      >
        {item.is_relevant ? (
          <Check className="h-2.5 w-2.5" />
        ) : (
          <X className="h-2.5 w-2.5" />
        )}
      </Button>
    </div>
  );
}

function IconTile({
  item,
  onToggleRelevance,
}: {
  item: ResearchMedia;
  onToggleRelevance: (item: ResearchMedia) => void;
}) {
  const dims = formatResolvedSizeLabel(item);
  const tooltip =
    [item.alt_text, item.caption, dims, item.url].filter(Boolean).join(" · ") ||
    item.url;

  return (
    <div
      className={cn(
        "group relative h-12 w-12 rounded-md border bg-card/80 flex items-center justify-center overflow-hidden transition-all hover:scale-110 hover:z-10",
        item.is_relevant
          ? "border-border/60"
          : "border-border/30 opacity-50 hover:opacity-100",
      )}
      title={tooltip}
      onDoubleClick={() => onToggleRelevance(item)}
    >
      {item.url ? (
        <img
          src={item.thumbnail_url || item.url}
          alt={item.alt_text || ""}
          className="max-w-full max-h-full object-contain"
          loading="lazy"
        />
      ) : (
        <ImageIcon className="h-3 w-3 text-muted-foreground/30" />
      )}
      {!item.is_relevant && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/0 group-hover:bg-background/40 transition-colors">
          <X className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
        </div>
      )}
    </div>
  );
}

/** Reads the `kind` hint (pdf, youtube, csv, …) the server stores in metadata. */
function resourceKind(item: ResearchMedia): string | null {
  const m = item.metadata;
  if (m && typeof m === "object" && !Array.isArray(m)) {
    const kind = (m as Record<string, unknown>).kind;
    if (typeof kind === "string" && kind) return kind;
  }
  return null;
}

/**
 * A non-image research resource (PDF / video / audio). Opens the URL in a new
 * tab; shows a poster thumbnail when one exists (e.g. YouTube), otherwise the
 * type icon. The relevance toggle sits OUTSIDE the anchor so it doesn't open.
 */
function ResourceCard({
  item,
  onToggleRelevance,
}: {
  item: ResearchMedia;
  onToggleRelevance: (item: ResearchMedia) => void;
}) {
  const Icon = TYPE_ICONS[item.media_type as keyof typeof TYPE_ICONS] ?? File;
  const kind = resourceKind(item);
  const label = item.alt_text || item.caption || item.url;

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card/60 backdrop-blur-sm overflow-hidden transition-all",
        item.is_relevant ? "border-primary/20" : "border-border/50 opacity-60",
      )}
    >
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
        title={label}
      >
        <div className="relative aspect-video bg-muted/50 flex items-center justify-center overflow-hidden">
          {item.thumbnail_url ? (
            <img
              src={item.thumbnail_url}
              alt={item.alt_text || ""}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <Icon className="h-7 w-7 text-muted-foreground/40" />
          )}
          {item.media_type === "video" && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-background/70 backdrop-blur-sm">
                <Play className="h-3.5 w-3.5 text-foreground/80" />
              </span>
            </span>
          )}
          <span className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <ExternalLink className="h-3 w-3 text-foreground/60" />
          </span>
        </div>
        <div className="p-1.5">
          <p className="text-[10px] truncate text-foreground/80">{label}</p>
          {kind && (
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60">
              {kind}
            </p>
          )}
        </div>
      </a>
      <Button
        variant={item.is_relevant ? "default" : "outline"}
        size="icon"
        className="absolute top-1.5 right-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity"
        onClick={() => onToggleRelevance(item)}
      >
        {item.is_relevant ? (
          <Check className="h-3 w-3" />
        ) : (
          <X className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

interface ResourceSectionProps extends SectionProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

function ResourceSection({
  icon,
  title,
  description,
  items,
  onToggleRelevance,
}: ResourceSectionProps) {
  return (
    <section className="space-y-2">
      <SectionHeader
        icon={icon}
        title={title}
        count={items.length}
        description={description}
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {items.map((item) => (
          <ResourceCard
            key={item.id}
            item={item}
            onToggleRelevance={onToggleRelevance}
          />
        ))}
      </div>
    </section>
  );
}

const DIRECT_VIDEO_RE = /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i;

/** Embeddable YouTube video — iframe player loads inline (no outbound redirect). */
function YouTubeVideoCard({
  item,
  videoId,
  start,
  onToggleRelevance,
}: {
  item: ResearchMedia;
  videoId: string;
  start?: number;
  onToggleRelevance: (item: ResearchMedia) => void;
}) {
  const label =
    item.alt_text || item.caption || hostLabel(item.url) || item.url;

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card/60 backdrop-blur-sm overflow-hidden transition-all",
        item.is_relevant ? "border-primary/20" : "border-border/50 opacity-60",
      )}
    >
      <div className="relative aspect-video w-full bg-black">
        <iframe
          src={youTubeEmbedUrl(videoId, { start })}
          title={label}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      </div>
      <div className="p-1.5 flex items-center justify-between gap-1">
        <p
          className="text-[10px] truncate text-foreground/80 flex-1"
          title={label}
        >
          {label}
        </p>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors"
          title="Open on YouTube"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <Button
        variant={item.is_relevant ? "default" : "outline"}
        size="icon"
        className="absolute top-1.5 right-1.5 z-10 h-6 w-6 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity"
        onClick={() => onToggleRelevance(item)}
      >
        {item.is_relevant ? (
          <Check className="h-3 w-3" />
        ) : (
          <X className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

/** YouTube channel/profile — tile card, opens on YouTube (not embeddable). */
function YouTubeChannelCard({
  item,
  onToggleRelevance,
}: {
  item: ResearchMedia;
  onToggleRelevance: (item: ResearchMedia) => void;
}) {
  const handle = youTubeChannelLabel(item.url);
  const title = (item.alt_text || item.caption || "").trim() || handle;
  const pathLabel = (() => {
    try {
      return decodeURIComponent(new URL(item.url).pathname.replace(/^\//, ""));
    } catch {
      return handle;
    }
  })();

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border bg-card/60 backdrop-blur-sm overflow-hidden transition-all",
        item.is_relevant ? "border-primary/20" : "border-border/50 opacity-60",
      )}
    >
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-1 flex-col"
        title={title}
      >
        <div className="flex items-center justify-center bg-muted/40 px-3 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600/10 ring-1 ring-red-600/15">
            <Users className="h-5 w-5 text-red-600/80 dark:text-red-400/90" />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 p-2.5 pt-2">
          <p
            className="text-[11px] font-medium text-foreground/90 line-clamp-2 leading-snug"
            title={title}
          >
            {title}
          </p>
          <p
            className="text-[9px] text-muted-foreground/65 truncate"
            title={pathLabel}
          >
            {pathLabel}
          </p>
        </div>
      </a>
      <div className="border-t border-border/40 px-2.5 py-1.5">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Open on YouTube
        </a>
      </div>
      <Button
        variant={item.is_relevant ? "default" : "outline"}
        size="icon"
        className="absolute top-1.5 right-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity shadow-sm"
        onClick={() => onToggleRelevance(item)}
      >
        {item.is_relevant ? (
          <Check className="h-3 w-3" />
        ) : (
          <X className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

function YouTubeChannelsSection({ items, onToggleRelevance }: SectionProps) {
  return (
    <section className="space-y-2">
      <SectionHeader
        icon={Users}
        title="YouTube Channels"
        count={items.length}
        description="Creator pages linked from sources"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {items.map((item) => (
          <YouTubeChannelCard
            key={item.id}
            item={item}
            onToggleRelevance={onToggleRelevance}
          />
        ))}
      </div>
    </section>
  );
}

/** Videos play INSIDE the app — YouTube/Vimeo embed, or an inline <video> for a
 * direct file. A poster (server thumbnail or a derived YouTube thumb) shows
 * until the user hits play, so we never load N iframes at once. */
function VideoCard({
  item,
  onToggleRelevance,
}: {
  item: ResearchMedia;
  onToggleRelevance: (item: ResearchMedia) => void;
}) {
  const [playing, setPlaying] = useState(false);

  // Embeddable YouTube watch/embed/shorts URLs → inline iframe player.
  const yt = parseYouTubeUrl(item.url);
  if (yt) {
    return (
      <YouTubeVideoCard
        item={item}
        videoId={yt.videoId}
        start={yt.start}
        onToggleRelevance={onToggleRelevance}
      />
    );
  }

  const embed = embedInfo(item);
  const poster = videoPoster(item);
  const isDirectFile = DIRECT_VIDEO_RE.test(item.url);
  const canPlayInApp = !!embed || isDirectFile;
  const label =
    item.alt_text || item.caption || hostLabel(item.url) || item.url;

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card/60 backdrop-blur-sm overflow-hidden transition-all",
        item.is_relevant ? "border-primary/20" : "border-border/50 opacity-60",
      )}
    >
      <div className="relative aspect-video bg-black/50 flex items-center justify-center overflow-hidden">
        {playing && embed ? (
          <iframe
            src={embed.embedUrl}
            title={label}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : playing && isDirectFile ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={item.url}
            className="absolute inset-0 h-full w-full"
            controls
            autoPlay
          />
        ) : (
          <button
            type="button"
            onClick={() =>
              canPlayInApp
                ? setPlaying(true)
                : window.open(item.url, "_blank", "noopener,noreferrer")
            }
            className="absolute inset-0 h-full w-full"
            title={canPlayInApp ? "Play" : "Open on source site"}
          >
            {poster ? (
              <img
                src={poster}
                alt={label}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <Video className="h-7 w-7 text-muted-foreground/40" />
            )}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm group-hover:bg-black/75 transition-colors">
                <Play className="h-5 w-5 text-white" />
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="p-1.5 flex items-center justify-between gap-1">
        <p
          className="text-[10px] truncate text-foreground/80 flex-1"
          title={label}
        >
          {label}
        </p>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors"
          title="Open on source site"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <Button
        variant={item.is_relevant ? "default" : "outline"}
        size="icon"
        className="absolute top-1.5 right-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity"
        onClick={() => onToggleRelevance(item)}
      >
        {item.is_relevant ? (
          <Check className="h-3 w-3" />
        ) : (
          <X className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

function VideoSection({ items, onToggleRelevance }: SectionProps) {
  return (
    <section className="space-y-2">
      <SectionHeader
        icon={Video}
        title="Videos"
        count={items.length}
        description="Embeddable videos play inline via iframe"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {items.map((item) => (
          <VideoCard
            key={item.id}
            item={item}
            onToggleRelevance={onToggleRelevance}
          />
        ))}
      </div>
    </section>
  );
}

function docIcon(
  item: ResearchMedia,
): React.ComponentType<{ className?: string }> {
  const ext = fileExt(item.url);
  const kind = resourceKind(item);
  if (ext === "pdf" || kind === "pdf") return FileText;
  if (["csv", "tsv", "xls", "xlsx", "ods"].includes(ext) || kind === "csv")
    return FileSpreadsheet;
  if (["doc", "docx", "ppt", "pptx", "odt", "rtf", "txt"].includes(ext))
    return FileType;
  return File;
}

/** Logical folder the gallery saves remote documents into. */
const SAVED_DOCS_FOLDER = "Research/Saved Documents";

/** A best-effort upload filename: real file name from the URL, ensuring it
 * carries an extension (falls back to the alt-text/caption or `document.pdf`). */
function uploadFileName(item: ResearchMedia): string {
  const fromUrl = fileNameFromUrl(item.url);
  if (/\.[a-z0-9]{1,5}$/i.test(fromUrl)) return fromUrl;
  const base =
    (item.alt_text || item.caption || fromUrl || "document")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 120) || "document";
  const ext = fileExt(item.url) || (resourceKind(item) === "pdf" ? "pdf" : "");
  return ext ? `${base}.${ext}` : `${base}.pdf`;
}

/** A file card with a type icon, real file name, source host, an Open action,
 * and a "Save to library" action that pulls the remote file into the user's
 * cloud library. */
function DocumentCard({
  item,
  onToggleRelevance,
}: {
  item: ResearchMedia;
  onToggleRelevance: (item: ResearchMedia) => void;
}) {
  const Icon = docIcon(item);
  const name = (item.alt_text || "").trim() || fileNameFromUrl(item.url);
  const host = hostLabel(item.url);
  const ext = fileExt(item.url) || resourceKind(item) || "";
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    const filename = uploadFileName(item);
    try {
      // Pull the remote file as bytes. A cross-origin host without permissive
      // CORS will reject this — caught below and surfaced as a clean toast.
      const res = await fetch(item.url);
      if (!res.ok) {
        throw new Error(`Source returned ${res.status}`);
      }
      const blob = await res.blob();
      // `File` is shadowed by the lucide-react icon imported above, so reach
      // for the global File constructor explicitly.
      const file = new globalThis.File([blob], filename, {
        type: blob.type || "application/pdf",
      });
      await uploadFileWithProgress(
        { file, filePath: `${SAVED_DOCS_FOLDER}/${filename}` },
        () => {
          /* progress is fast for documents — button spinner is enough */
        },
      );
      toast.success(`Saved "${filename}" to your library`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Couldn't save "${filename}"`, {
        description:
          "The source may block direct downloads. Try Open, then save it manually.",
      });
      console.error("[MediaGallery] save to library failed:", detail, err);
    } finally {
      setSaving(false);
    }
  }, [item, saving]);

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border bg-card/60 backdrop-blur-sm overflow-hidden transition-all",
        item.is_relevant ? "border-primary/20" : "border-border/50 opacity-60",
      )}
    >
      <div className="flex items-start gap-2 p-2.5">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/8 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary/70" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-[11px] font-medium text-foreground/90 line-clamp-2 break-words"
            title={name}
          >
            {name}
          </p>
          <p className="mt-0.5 truncate text-[9px] text-muted-foreground/70">
            {[host, ext && ext.toUpperCase()].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      <div className="mt-auto flex items-center gap-3 border-t border-border/40 px-2.5 py-1.5">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3 w-3" /> Open
        </a>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60 disabled:cursor-default"
          title="Save a copy to your cloud library"
        >
          {saving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Download className="h-3 w-3" /> Save to library
            </>
          )}
        </button>
      </div>
      <Button
        variant={item.is_relevant ? "default" : "outline"}
        size="icon"
        className="absolute top-1.5 right-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity"
        onClick={() => onToggleRelevance(item)}
      >
        {item.is_relevant ? (
          <Check className="h-3 w-3" />
        ) : (
          <X className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

function DocumentSection({ items, onToggleRelevance }: SectionProps) {
  return (
    <section className="space-y-2">
      <SectionHeader
        icon={FileText}
        title="Documents"
        count={items.length}
        description="PDFs, slides, spreadsheets, and other files"
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {items.map((item) => (
          <DocumentCard
            key={item.id}
            item={item}
            onToggleRelevance={onToggleRelevance}
          />
        ))}
      </div>
    </section>
  );
}
