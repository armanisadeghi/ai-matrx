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
  Music,
  ExternalLink,
} from "lucide-react";
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
import { bucketMedia, formatResolvedSizeLabel } from "./mediaCategorization";
import MediaDebugPanel from "./MediaDebugPanel";

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
            <ResourceSection
              icon={FileText}
              title="Documents"
              description="PDFs, slides, spreadsheets, and other files"
              items={buckets.documents}
              onToggleRelevance={handleToggleRelevance}
            />
          )}
          {buckets.videos.length > 0 && (
            <ResourceSection
              icon={Video}
              title="Videos"
              description="Video files and YouTube/Vimeo links"
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
              gridClass="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2"
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
              gridClass="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2"
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
              gridClass="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2"
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
              gridClass="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2"
              onToggleRelevance={handleToggleRelevance}
            />
          )}
          {!hasPhotoSections &&
            buckets.graphics.length === 0 &&
            buckets.icons.length === 0 &&
            buckets.videos.length === 0 &&
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
  gridClass: string;
}

function PhotoAspectSection({
  icon,
  title,
  description,
  items,
  aspectClass,
  gridClass,
  onToggleRelevance,
}: PhotoAspectSectionProps) {
  return (
    <section className="space-y-2">
      <SectionHeader
        icon={icon}
        title={title}
        count={items.length}
        description={description}
      />
      <div className={gridClass}>
        {items.map((item) => (
          <PhotoCard
            key={item.id}
            item={item}
            aspectClass={aspectClass}
            onToggleRelevance={onToggleRelevance}
          />
        ))}
      </div>
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
        description="Logos, thumbnails, and small graphics (under 200px)"
      />
      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
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
  const tooltip = item.alt_text || item.caption || item.url;

  return (
    <div
      className={cn(
        "group relative rounded-lg border bg-card/60 backdrop-blur-sm overflow-hidden transition-all",
        item.is_relevant ? "border-primary/20" : "border-border/50 opacity-60",
      )}
      title={tooltip}
    >
      <div className="aspect-square bg-muted/30 flex items-center justify-center p-2 overflow-hidden">
        {item.url ? (
          <img
            src={item.thumbnail_url || item.url}
            alt={item.alt_text || ""}
            className="max-w-full max-h-full object-contain"
            loading="lazy"
          />
        ) : (
          <ImageIcon className="h-5 w-5 text-muted-foreground/30" />
        )}
      </div>
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
