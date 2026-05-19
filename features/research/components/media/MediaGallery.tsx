"use client";

import { useCallback, useState, useMemo } from "react";
import {
  ImageIcon,
  Play,
  File,
  Check,
  X,
  Search,
  Image as ImageLucide,
  Shapes,
  Zap
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

const TYPE_ICONS = {
  image: ImageIcon,
  video: Play,
  document: File,
};

type SizeTier = "photo" | "graphic" | "icon";

const ICON_MAX_DIM = 64;
const GRAPHIC_MAX_DIM = 200;

function isLikelyIconUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("favicon") ||
    u.endsWith(".ico") ||
    u.includes("/favicon") ||
    /\/icons?\//.test(u) ||
    /-icon\.(png|svg|webp|gif|jpe?g)(\?|$)/.test(u) ||
    /apple-touch-icon/.test(u)
  );
}

function categorize(item: ResearchMedia): SizeTier {
  if (item.media_type !== "image") return "photo";

  const w = item.width ?? 0;
  const h = item.height ?? 0;
  const max = Math.max(w, h);

  if (max === 0) {
    return isLikelyIconUrl(item.url) ? "icon" : "photo";
  }
  if (max <= ICON_MAX_DIM) return "icon";
  if (max < GRAPHIC_MAX_DIM) return "graphic";
  return "photo";
}

function sizeLabel(item: ResearchMedia): string | null {
  if (item.width && item.height) return `${item.width}×${item.height}`;
  return null;
}

export default function MediaGallery() {
  const { topicId } = useTopicContext();
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
          m.url.toLowerCase().includes(q),
      );
    }
    return items;
  }, [mediaList, typeFilter, relevanceFilter, search]);

  const buckets = useMemo(() => {
    const photos: ResearchMedia[] = [];
    const graphics: ResearchMedia[] = [];
    const icons: ResearchMedia[] = [];

    for (const item of filtered) {
      const tier = categorize(item);
      if (tier === "photo") photos.push(item);
      else if (tier === "graphic") graphics.push(item);
      else icons.push(item);
    }

    const byAreaDesc = (a: ResearchMedia, b: ResearchMedia) => {
      const aa = (a.width ?? 0) * (a.height ?? 0);
      const bb = (b.width ?? 0) * (b.height ?? 0);
      return bb - aa;
    };

    photos.sort(byAreaDesc);
    graphics.sort(byAreaDesc);
    icons.sort(byAreaDesc);

    return { photos, graphics, icons };
  }, [filtered]);

  const handleToggleRelevance = useCallback(
    async (item: ResearchMedia) => {
      await updateMedia(item.id, { is_relevant: !item.is_relevant });
      refresh();
    },
    [refresh],
  );

  const totalEmpty = filtered.length === 0;

  return (
    <div className="p-3 sm:p-4 space-y-4">
      <div className="flex items-center gap-2 rounded-full matrx-glass-thin-border px-3 py-1.5">
        <span className="text-xs font-medium text-foreground/80">Media</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {filtered.length}/{mediaList.length}
        </span>
        <div className="flex-1 relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search alt text, caption, url..."
            className="w-full h-6 pl-7 pr-2 text-[11px] rounded-full matrx-glass-card border-0 bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
            style={{ fontSize: "16px" }}
          />
        </div>
        <Select value={relevanceFilter} onValueChange={setRelevanceFilter}>
          <SelectTrigger
            className="w-24 h-6 text-[11px] rounded-full matrx-glass-card border-0 shrink-0"
            style={{ fontSize: "16px" }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="relevant">Relevant</SelectItem>
            <SelectItem value="excluded">Excluded</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger
            className="w-24 h-6 text-[11px] rounded-full matrx-glass-card border-0 shrink-0"
            style={{ fontSize: "16px" }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="image">Images</SelectItem>
            <SelectItem value="video">Videos</SelectItem>
            <SelectItem value="document">Docs</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {totalEmpty ? (
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
          {buckets.photos.length > 0 && (
            <PhotosSection
              items={buckets.photos}
              onToggleRelevance={handleToggleRelevance}
            />
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

function PhotosSection({ items, onToggleRelevance }: SectionProps) {
  return (
    <section className="space-y-2">
      <SectionHeader
        icon={ImageLucide}
        title="Photos & Media"
        count={items.length}
        description="Full-size images, videos, and documents"
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {items.map((item) => (
          <PhotoCard
            key={item.id}
            item={item}
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
        description="Logos, thumbnails, and small graphics"
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
        description="Tiny graphics shown at native size"
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
  onToggleRelevance,
}: {
  item: ResearchMedia;
  onToggleRelevance: (item: ResearchMedia) => void;
}) {
  const Icon = TYPE_ICONS[item.media_type as keyof typeof TYPE_ICONS] ?? File;
  const dims = sizeLabel(item);

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card/60 backdrop-blur-sm overflow-hidden transition-all",
        item.is_relevant ? "border-primary/20" : "border-border/50 opacity-60",
      )}
    >
      <div className="aspect-video bg-muted/50 flex items-center justify-center overflow-hidden">
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
  const dims = sizeLabel(item);
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
  const dims = sizeLabel(item);
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
